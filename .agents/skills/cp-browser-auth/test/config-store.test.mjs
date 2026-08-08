import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  getConfigPath,
  getCredentialStatus,
  loadCredential,
  removeCredential,
  saveCredential,
} from "../scripts/lib/config-store.mjs";

let temporaryDirectory;
let previousOverride;

beforeEach(async () => {
  previousOverride = process.env.ESTAITT_CP_SKILL_CONFIG_DIR;
  temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "estaitt-cp-auth-test-"),
  );
  process.env.ESTAITT_CP_SKILL_CONFIG_DIR = temporaryDirectory;
});

afterEach(async () => {
  if (previousOverride === undefined) {
    delete process.env.ESTAITT_CP_SKILL_CONFIG_DIR;
  } else {
    process.env.ESTAITT_CP_SKILL_CONFIG_DIR = previousOverride;
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("cp-browser-auth config store", () => {
  it("stores at most one credential for each provider", async () => {
    const initial = await getCredentialStatus();
    assert.equal(initial.configured, false);
    assert.equal(getConfigPath(), path.join(temporaryDirectory, "config.js"));

    await saveCredential({
      provider: "esiljang",
      username: "agent@example.com",
      password: "test-password-one",
    });
    await saveCredential({
      provider: "budongsanbank",
      username: "bank-user",
      password: "test-password-two",
    });

    const status = await getCredentialStatus();
    assert.equal(status.configured, true);
    assert.equal(status.providers[0].hasCredentials, true);
    assert.equal(status.providers[0].maskedUsername, "ag•••@example.com");
    assert.equal(status.providers[1].hasCredentials, true);
    assert.equal(
      (await loadCredential("esiljang"))?.password,
      "test-password-one",
    );
    assert.equal(
      (await loadCredential("budongsanbank"))?.password,
      "test-password-two",
    );

    const source = await readFile(getConfigPath(), "utf8");
    assert.match(source, /^export default \{/);
    assert.match(source, /"version": 3/);
    assert.match(source, /"credentials":/);
    assert.doesNotMatch(source, /"profiles":|"offices":/);
    assert.doesNotMatch(source, /require\(|import\s|process\.|function\s/);
    if (process.platform !== "win32") {
      assert.equal((await stat(getConfigPath())).mode & 0o777, 0o600);
      assert.equal((await stat(temporaryDirectory)).mode & 0o777, 0o700);
    }
  });

  it("removes only the explicitly selected provider", async () => {
    for (const provider of ["esiljang", "budongsanbank"]) {
      await saveCredential({
        provider,
        username: `${provider}-user`,
        password: `${provider}-password`,
      });
    }

    const status = await removeCredential("esiljang");
    assert.equal(status.providers[0].hasCredentials, false);
    assert.equal(status.providers[1].hasCredentials, true);
  });

  it("rejects malformed config.js instead of executing or replacing it", async () => {
    await getCredentialStatus();
    const malformed = "export default (() => process.env)();\n";
    await writeFile(getConfigPath(), malformed, "utf8");

    await assert.rejects(
      getCredentialStatus(),
      /지원하지 않는 CP Skill config\.js 형식/,
    );
    assert.equal(await readFile(getConfigPath(), "utf8"), malformed);
  });

  it("adopts credentials from the only version-one office entry", async () => {
    await getCredentialStatus();
    await writeFile(
      getConfigPath(),
      `export default ${JSON.stringify({
        version: 1,
        deviceId: "00000000-0000-4000-8000-000000000000",
        offices: {
          "old-office-key": {
            esiljang: credential("legacy-user", "legacy-password"),
          },
        },
      })};\n`,
      "utf8",
    );

    const status = await getCredentialStatus();
    assert.equal(status.providers[0].hasCredentials, true);
    assert.equal((await loadCredential("esiljang"))?.username, "legacy-user");
  });

  it("adopts the selected credential set from version two", async () => {
    await getCredentialStatus();
    await writeFile(
      getConfigPath(),
      `export default ${JSON.stringify({
        version: 2,
        defaultProfile: "selected",
        profiles: {
          selected: {
            esiljang: credential("selected-user", "selected-password"),
          },
          unused: {
            esiljang: credential("unused-user", "unused-password"),
          },
        },
      })};\n`,
      "utf8",
    );

    assert.equal(
      (await loadCredential("esiljang"))?.username,
      "selected-user",
    );
  });
});

function credential(username, password) {
  return {
    username,
    password,
    updatedAt: "2026-08-01T00:00:00.000Z",
    lastVerifiedAt: null,
  };
}
