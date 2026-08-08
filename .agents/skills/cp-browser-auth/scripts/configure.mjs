#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { failJson, parseSkillArgs, printJson } from "./lib/cli.mjs";
import {
  getCredentialStatus,
  saveCredential,
} from "./lib/config-store.mjs";
import {
  CP_PROVIDERS,
  getProviderConfig,
  normalizeProvider,
} from "./lib/providers.mjs";

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

try {
  const args = parseSkillArgs({
    provider: { type: "string" },
    "no-open": { type: "boolean", default: false },
    "timeout-ms": { type: "string" },
  });
  const providers = args.provider
    ? [normalizeProvider(args.provider)]
    : [...CP_PROVIDERS];
  const requestedTimeout = args["timeout-ms"]
    ? Number(args["timeout-ms"])
    : DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(Math.max(requestedTimeout, 1_000), DEFAULT_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  const initialStatus = await getCredentialStatus();
  const nonce = randomBytes(24).toString("base64url");
  const routePath = `/configure/${nonce}`;

  let settle;
  const completion = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  let completed = false;

  const server = createServer(async (request, response) => {
    if (!isLoopbackRequest(request) || request.url !== routePath) {
      sendText(response, 404, "Not found");
      return;
    }
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (request.method === "GET") {
      sendHtml(
        response,
        200,
        renderForm({ providers, status: initialStatus }),
      );
      return;
    }
    if (request.method !== "POST") {
      sendText(response, 405, "Method not allowed");
      return;
    }
    if (request.headers.origin && request.headers.origin !== origin) {
      sendText(response, 403, "Forbidden");
      return;
    }

    try {
      const body = await readBody(request);
      const fields = new URLSearchParams(body);
      const credentialsToSave = [];
      for (const provider of providers) {
        const username = fields.get(`${provider}_username`)?.trim() ?? "";
        const password = fields.get(`${provider}_password`) ?? "";
        const previouslyConfigured = initialStatus.providers.find(
          (item) => item.provider === provider,
        )?.hasCredentials;
        if (!username && !password && previouslyConfigured) continue;
        if (!username || !password) {
          throw new Error(
            `${getProviderConfig(provider).label} 아이디와 비밀번호를 모두 입력해 주세요.`,
          );
        }
        credentialsToSave.push({
          provider,
          username,
          password,
        });
      }
      for (const credential of credentialsToSave) {
        await saveCredential(credential);
      }
      const configuredProviders = credentialsToSave.map(
        (credential) => credential.provider,
      );
      const finalStatus = await getCredentialStatus();
      const missing = providers.filter(
        (provider) =>
          !finalStatus.providers.find((item) => item.provider === provider)
            ?.hasCredentials,
      );
      if (missing.length > 0) {
        throw new Error("필요한 CP 계정 설정이 완료되지 않았습니다.");
      }

      sendHtml(response, 200, renderSuccess(providers));
      if (!completed) {
        completed = true;
        settle.resolve({ configuredProviders, status: finalStatus });
      }
    } catch (error) {
      sendHtml(
        response,
        400,
        renderForm({
          providers,
          status: await getCredentialStatus(),
          error:
            error instanceof Error
              ? error.message
              : "CP 계정 저장에 실패했습니다.",
        }),
      );
    }
  });

  server.on("error", (error) => {
    if (!completed) {
      completed = true;
      settle.reject(error);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("로컬 CP 설정 페이지를 열지 못했습니다.");
  }
  const url = `http://127.0.0.1:${address.port}${routePath}`;
  printJson({
    status: "awaiting_user_input",
    providers,
    url,
    message: "Skill이 연 로컬 설정창에서 CP 계정을 입력해 주세요.",
  });
  if (!args["no-open"]) openExternalBrowser(url);

  const timeout = setTimeout(() => {
    if (!completed) {
      completed = true;
      settle.reject(new Error("CP 계정 설정 시간이 초과되었습니다."));
    }
  }, timeoutMs);
  try {
    const result = await completion;
    printJson({
      status: "configured",
      providers: providers.map((provider) => ({
        provider,
        hasCredentials: true,
      })),
    });
  } finally {
    clearTimeout(timeout);
    await new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
} catch (error) {
  failJson(error);
}

function openExternalBrowser(url) {
  let child;
  if (process.platform === "darwin") {
    child = spawn("open", [url], { detached: true, stdio: "ignore" });
  } else if (process.platform === "win32") {
    child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  }
  child.on("error", () => undefined);
  child.unref();
}

function isLoopbackRequest(request) {
  const remote = request.socket.remoteAddress;
  return (
    remote === "127.0.0.1" ||
    remote === "::1" ||
    remote === "::ffff:127.0.0.1"
  );
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("CP 계정 입력 크기가 너무 큽니다.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(html);
}

function sendText(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function renderForm({ providers, status, error }) {
  const cards = providers
    .map((provider) => {
      const config = getProviderConfig(provider);
      const saved = status.providers.find((item) => item.provider === provider);
      const savedText = saved?.hasCredentials
        ? `저장됨 · ${escapeHtml(saved.maskedUsername ?? "")}`
        : "저장된 계정 없음";
      return `<section>
        <div class="provider"><strong>${escapeHtml(config.label)}</strong><span>${savedText}</span></div>
        <label>아이디<input name="${provider}_username" autocomplete="username" maxlength="256" /></label>
        <label>비밀번호<input name="${provider}_password" type="password" autocomplete="current-password" maxlength="1024" /></label>
        ${saved?.hasCredentials ? '<p class="hint">두 칸을 비우면 기존 설정을 유지합니다.</p>' : ""}
      </section>`;
    })
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CP 계정 설정</title><style>
    :root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a;background:#f4f6f8}body{margin:0;padding:32px}main{max-width:560px;margin:0 auto;background:#fff;border:1px solid #dfe4ea;border-radius:16px;padding:28px;box-shadow:0 16px 40px rgba(20,30,45,.08)}h1{font-size:22px;margin:0 0 8px}p{color:#647181;line-height:1.5}section{border-top:1px solid #e7eaee;margin-top:20px;padding-top:20px}.provider{display:flex;justify-content:space-between;gap:16px;margin-bottom:12px}.provider span,.hint{font-size:12px;color:#74808d}label{display:block;font-size:13px;font-weight:600;margin-top:12px}input{box-sizing:border-box;width:100%;margin-top:6px;border:1px solid #ccd3da;border-radius:9px;padding:11px;font:inherit}button{width:100%;margin-top:24px;border:0;border-radius:10px;background:#111827;color:#fff;padding:12px;font-weight:700;cursor:pointer}.error{background:#fff1f1;color:#a42121;padding:10px;border-radius:8px}</style></head><body><main>
    <h1>광고 자동화 CP 계정 설정</h1><p>이 페이지는 Skill이 이 PC에서 일회성으로 열었습니다. 입력값은 외부 서버나 대화로 전송되지 않습니다.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}<form method="post" autocomplete="off">${cards}<button type="submit">이 PC에 저장</button></form>
  </main></body></html>`;
}

function renderSuccess(providers) {
  const labels = providers.map((provider) => getProviderConfig(provider).label);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>설정 완료</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f6f8;padding:48px;color:#17202a}main{max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:32px;text-align:center}h1{font-size:22px}p{color:#647181}</style></head><body><main><h1>설정 완료</h1><p>${escapeHtml(labels.join(", "))} 계정을 저장했습니다. 이 창을 닫아도 됩니다.</p></main></body></html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
