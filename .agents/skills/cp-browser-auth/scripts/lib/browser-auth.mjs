import {
  isAllowedProviderUrl,
  isExactProviderPage,
} from "./providers.mjs";

const CDP_COMMAND_TIMEOUT_MS = 10_000;
const LOGIN_TIMEOUT_MS = 40_000;

export async function authenticateBrowser(request) {
  assertLoopbackBrowserCdpUrl(request.browserCdpUrl);
  const client = await CdpClient.connect(request.browserCdpUrl);

  try {
    const target = await findSingleProviderTarget(client, request);
    if (
      isExactProviderPage(
        target.url,
        request.authenticatedUrl,
        request.allowedHostSuffixes,
      )
    ) {
      return { status: "authenticated", targetUrl: request.authenticatedUrl };
    }

    if (
      !isExactProviderPage(
        target.url,
        request.loginUrl,
        request.allowedHostSuffixes,
      )
    ) {
      return {
        status: "needs_input",
        targetUrl: null,
        message: "CP 로그인 페이지를 확인할 수 없습니다.",
      };
    }

    const { sessionId } = await client.command("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const evaluation = await client.command(
      "Runtime.evaluate",
      {
        expression: buildCredentialFillExpression(request),
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      },
      sessionId,
    );
    const fillResult = evaluation.result?.value;
    if (evaluation.exceptionDetails || !fillResult?.ok) {
      return {
        status: "needs_input",
        targetUrl: request.loginUrl,
        message: fillResult?.error ?? "CP 로그인 화면을 확인해 주세요.",
      };
    }

    const authenticatedUrl = await waitForAuthenticatedPage(client, request);
    if (!authenticatedUrl) {
      return {
        status: "needs_input",
        targetUrl: null,
        message:
          "자동 로그인에 실패했습니다. 열린 브라우저에서 추가 인증 또는 계정 상태를 확인해 주세요.",
      };
    }

    return { status: "authenticated", targetUrl: authenticatedUrl };
  } finally {
    client.close();
  }
}

export function isLoopbackBrowserCdpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const loopbackHost =
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.hostname === "[::1]";
    return (
      url.protocol === "ws:" &&
      loopbackHost &&
      Boolean(url.port) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.startsWith("/devtools/browser/")
    );
  } catch {
    return false;
  }
}

function assertLoopbackBrowserCdpUrl(rawUrl) {
  if (!isLoopbackBrowserCdpUrl(rawUrl)) {
    throw new Error(
      "Skill이 연 로컬 agent-browser의 browser-level CDP 주소만 사용할 수 있습니다.",
    );
  }
}

async function findSingleProviderTarget(client, request) {
  const targets = await listProviderTargets(client, request);
  if (targets.length === 0) {
    throw new Error("agent-browser에서 CP 로그인 탭을 찾지 못했습니다.");
  }
  if (targets.length > 1) {
    throw new Error(
      "agent-browser에 CP 탭이 여러 개 열려 있어 로그인 대상을 확정할 수 없습니다.",
    );
  }
  return targets[0];
}

async function findProviderTarget(client, request) {
  const targets = await listProviderTargets(client, request);
  return targets.length === 1 ? targets[0] : null;
}

async function listProviderTargets(client, request) {
  const { targetInfos } = await client.command("Target.getTargets");
  return targetInfos.filter(
    (target) =>
      target.type === "page" &&
      isAllowedProviderUrl(target.url, request.allowedHostSuffixes),
  );
}

async function waitForAuthenticatedPage(client, request) {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const target = await findProviderTarget(client, request);
    if (
      target &&
      isExactProviderPage(
        target.url,
        request.authenticatedUrl,
        request.allowedHostSuffixes,
      )
    ) {
      return request.authenticatedUrl;
    }
    await delay(250);
  }
  const target = await findProviderTarget(client, request);
  return target &&
    isExactProviderPage(
      target.url,
      request.authenticatedUrl,
      request.allowedHostSuffixes,
    )
    ? request.authenticatedUrl
    : null;
}

function buildCredentialFillExpression(request) {
  const payload = JSON.stringify({
    username: request.username,
    password: request.password,
    authenticatedUrl: request.authenticatedUrl,
    usernameSelectors: request.usernameSelectors,
    passwordSelectors: request.passwordSelectors,
    submitSelectors: request.submitSelectors,
  });
  return `(() => {
    const payload = ${payload};
    const first = (selectors) => selectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    const username = first(payload.usernameSelectors);
    const password = first(payload.passwordSelectors);
    const submit = first(payload.submitSelectors);
    const requestPage = document.querySelector(
      '#requestPage, input[name="requestPage"]',
    );
    if (!(username instanceof HTMLInputElement)) {
      return { ok: false, error: '아이디 입력 칸을 찾지 못했습니다.' };
    }
    if (!(password instanceof HTMLInputElement)) {
      return { ok: false, error: '비밀번호 입력 칸을 찾지 못했습니다.' };
    }
    if (!(submit instanceof HTMLElement)) {
      return { ok: false, error: '로그인 버튼을 찾지 못했습니다.' };
    }
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (!setValue) {
      return { ok: false, error: '로그인 입력 칸을 갱신하지 못했습니다.' };
    }
    setValue.call(username, payload.username);
    username.dispatchEvent(new Event('input', { bubbles: true }));
    username.dispatchEvent(new Event('change', { bubbles: true }));
    setValue.call(password, payload.password);
    password.dispatchEvent(new Event('input', { bubbles: true }));
    password.dispatchEvent(new Event('change', { bubbles: true }));
    if (requestPage instanceof HTMLInputElement) {
      setValue.call(requestPage, payload.authenticatedUrl);
      requestPage.dispatchEvent(new Event('input', { bubbles: true }));
      requestPage.dispatchEvent(new Event('change', { bubbles: true }));
    }
    submit.click();
    return { ok: true };
  })()`;
}

class CdpClient {
  pending = new Map();
  nextId = 1;

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let response;
      try {
        response = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof response.id !== "number") return;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timeout);
      if (response.error) {
        pending.reject(
          new Error(response.error.message ?? "CDP 명령이 실패했습니다."),
        );
      } else {
        pending.resolve(response.result);
      }
    });
    socket.addEventListener("close", () => {
      this.rejectPending(new Error("agent-browser CDP 연결이 종료되었습니다."));
    });
    socket.addEventListener("error", () => {
      this.rejectPending(new Error("agent-browser CDP 연결에 실패했습니다."));
    });
  }

  static async connect(rawUrl) {
    if (typeof WebSocket !== "function") {
      throw new Error("현재 Node.js 런타임에서 WebSocket을 사용할 수 없습니다.");
    }
    const socket = new WebSocket(rawUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("agent-browser CDP 연결 시간이 초과되었습니다."));
      }, CDP_COMMAND_TIMEOUT_MS);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("agent-browser CDP 연결에 실패했습니다."));
        },
        { once: true },
      );
    });
    return new CdpClient(socket);
  }

  command(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} 명령 시간이 초과되었습니다.`));
      }, CDP_COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  }

  close() {
    this.socket.close();
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
