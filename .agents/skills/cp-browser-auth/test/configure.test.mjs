import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const configureScript = path.resolve(
  testDirectory,
  "../scripts/configure.mjs",
);
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("cp-browser-auth configure", () => {
  it("opens a one-time loopback form and waits for the user submission", async () => {
    const configDirectory = await mkdtemp(
      path.join(os.tmpdir(), "estaitt-cp-configure-test-"),
    );
    temporaryDirectories.push(configDirectory);
    const child = spawn(
      process.execPath,
      [
        configureScript,
        "--provider",
        "esiljang",
        "--no-open",
        "--timeout-ms",
        "5000",
      ],
      {
        env: {
          ...process.env,
          ESTAITT_CP_SKILL_CONFIG_DIR: configDirectory,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const exitPromise = once(child, "exit");
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const awaiting = await waitForJsonLine(
      child.stdout,
      (value) => value.status === "awaiting_user_input",
    );
    const setupUrl = new URL(awaiting.url);
    assert.equal(setupUrl.hostname, "127.0.0.1");
    assert.match(setupUrl.pathname, /^\/configure\/[A-Za-z0-9_-]+$/);

    const page = await fetch(setupUrl);
    assert.equal(page.status, 200);
    const pageText = await page.text();
    assert.match(pageText, /광고 자동화 CP 계정 설정/);

    const response = await fetch(setupUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        esiljang_username: "test-user",
        esiljang_password: "test-secret-value",
      }),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /설정 완료/);

    const [exitCode] = await exitPromise;
    assert.equal(exitCode, 0, stderr);
    const lines = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    assert.equal(lines.at(-1).status, "configured");
    assert.deepEqual(lines.at(-1).providers, [
      { provider: "esiljang", hasCredentials: true },
    ]);
    assert.doesNotMatch(stdout, /test-user|test-secret-value/);
    assert.equal(stderr, "");
  });
});

function waitForJsonLine(stream, predicate) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("configure.mjs did not emit its setup URL"));
    }, 3_000);
    const onData = (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const value = JSON.parse(line);
          if (predicate(value)) {
            cleanup();
            resolve(value);
            return;
          }
        } catch {
          // Ignore non-JSON process noise; the script itself emits JSON only.
        }
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`configure.mjs exited early with code ${code}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off("data", onData);
      stream.off("error", onError);
      stream.off("close", onExit);
    };
    stream.on("data", onData);
    stream.once("error", onError);
    stream.once("close", onExit);
  });
}
