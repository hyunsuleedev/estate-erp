import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CP_PROVIDERS, normalizeProvider } from "./providers.mjs";

const CONFIG_VERSION = 3;
const CONFIG_FILENAME = "config.js";
const CONFIG_PREFIX = "export default ";

export function getConfigPath() {
  const override = process.env.ESTAITT_CP_SKILL_CONFIG_DIR?.trim();
  if (override) return path.join(path.resolve(override), CONFIG_FILENAME);

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Estaitt CP Skill",
      CONFIG_FILENAME,
    );
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    return path.join(
      appData || path.join(os.homedir(), "AppData", "Roaming"),
      "Estaitt CP Skill",
      CONFIG_FILENAME,
    );
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME?.trim();
  return path.join(
    xdgConfig || path.join(os.homedir(), ".config"),
    "estaitt-cp-skill",
    CONFIG_FILENAME,
  );
}

export async function getCredentialStatus() {
  const document = await readOrCreateConfig();
  return {
    configured: CP_PROVIDERS.some((provider) =>
      Boolean(document.credentials[provider]),
    ),
    providers: CP_PROVIDERS.map((provider) => {
      const entry = document.credentials[provider];
      return {
        provider,
        hasCredentials: Boolean(entry),
        maskedUsername: entry ? maskUsername(entry.username) : null,
        updatedAt: entry?.updatedAt ?? null,
        lastVerifiedAt: entry?.lastVerifiedAt ?? null,
      };
    }),
  };
}

export async function loadCredential(provider) {
  const normalizedProvider = normalizeProvider(provider);
  const document = await readOrCreateConfig();
  const entry = document.credentials[normalizedProvider];
  return entry
    ? {
        provider: normalizedProvider,
        username: entry.username,
        password: entry.password,
        updatedAt: entry.updatedAt,
      }
    : null;
}

export async function saveCredential(input) {
  const provider = normalizeProvider(input?.provider);
  const username =
    typeof input?.username === "string" ? input.username.trim() : "";
  const password = typeof input?.password === "string" ? input.password : "";
  if (!username || username.length > 256) {
    throw new Error("CP 아이디를 확인해 주세요.");
  }
  if (!password || password.length > 1024) {
    throw new Error("CP 비밀번호를 확인해 주세요.");
  }

  const document = await readOrCreateConfig();
  document.credentials[provider] = {
    username,
    password,
    updatedAt: new Date().toISOString(),
    lastVerifiedAt: null,
  };
  await writeConfig(document);
  return getCredentialStatus();
}

export async function removeCredential(provider) {
  const normalizedProvider = normalizeProvider(provider);
  const document = await readOrCreateConfig();
  if (document.credentials[normalizedProvider]) {
    delete document.credentials[normalizedProvider];
    await writeConfig(document);
  }
  return getCredentialStatus();
}

export async function markCredentialVerified(provider) {
  const normalizedProvider = normalizeProvider(provider);
  const document = await readOrCreateConfig();
  const entry = document.credentials[normalizedProvider];
  if (!entry) return;
  entry.lastVerifiedAt = new Date().toISOString();
  await writeConfig(document);
}

export function maskUsername(username) {
  const [local, domain] = String(username).split("@");
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  const masked = `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}`;
  return domain ? `${masked}@${domain}` : masked;
}

async function readOrCreateConfig() {
  try {
    const raw = await readFile(getConfigPath(), "utf8");
    return parseConfig(raw);
  } catch (error) {
    if (!isFileNotFoundError(error)) throw error;
    const document = {
      version: CONFIG_VERSION,
      credentials: {},
    };
    await writeConfig(document);
    return document;
  }
}

function parseConfig(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(CONFIG_PREFIX) || !trimmed.endsWith(";")) {
    throw new Error("지원하지 않는 CP Skill config.js 형식입니다.");
  }
  const payload = trimmed.slice(CONFIG_PREFIX.length, -1).trim();
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("지원하지 않는 CP Skill config.js 형식입니다.");
  }

  if (parsed?.version === 1) return migrateVersionOne(parsed);
  if (parsed?.version === 2) return migrateVersionTwo(parsed);
  if (
    parsed?.version !== CONFIG_VERSION ||
    !isPlainObject(parsed.credentials)
  ) {
    throw new Error("지원하지 않는 CP Skill config.js 내용입니다.");
  }
  validateCredentialSet(parsed.credentials);
  return parsed;
}

function migrateVersionOne(parsed) {
  if (!isPlainObject(parsed.offices)) {
    throw new Error("지원하지 않는 CP Skill config.js 내용입니다.");
  }
  return buildCurrentDocument(
    Object.values(parsed.offices),
    "기존 CP 계정이 여러 사무소에 저장되어 있습니다. 계정을 다시 설정해 주세요.",
  );
}

function migrateVersionTwo(parsed) {
  if (!isPlainObject(parsed.profiles)) {
    throw new Error("지원하지 않는 CP Skill config.js 내용입니다.");
  }
  for (const credentials of Object.values(parsed.profiles)) {
    validateCredentialSet(credentials);
  }
  if (
    typeof parsed.defaultProfile === "string" &&
    parsed.profiles[parsed.defaultProfile]
  ) {
    return {
      version: CONFIG_VERSION,
      credentials: parsed.profiles[parsed.defaultProfile],
    };
  }
  return buildCurrentDocument(
    Object.values(parsed.profiles),
    "기존 CP 계정 묶음이 여러 개입니다. 계정을 다시 설정해 주세요.",
  );
}

function buildCurrentDocument(credentialSets, ambiguousMessage) {
  const nonEmptySets = credentialSets.filter((credentials) => {
    validateCredentialSet(credentials);
    return Object.keys(credentials).length > 0;
  });
  if (nonEmptySets.length > 1) throw new Error(ambiguousMessage);
  return {
    version: CONFIG_VERSION,
    credentials: nonEmptySets[0] ?? {},
  };
}

function validateCredentialSet(credentials) {
  if (!isPlainObject(credentials)) {
    throw new Error("CP Skill 계정 설정 형식이 올바르지 않습니다.");
  }
  for (const [provider, entry] of Object.entries(credentials)) {
    normalizeProvider(provider);
    if (
      !isPlainObject(entry) ||
      typeof entry.username !== "string" ||
      typeof entry.password !== "string" ||
      typeof entry.updatedAt !== "string" ||
      !(
        entry.lastVerifiedAt === null ||
        typeof entry.lastVerifiedAt === "string"
      )
    ) {
      throw new Error("CP Skill 계정 설정 형식이 올바르지 않습니다.");
    }
  }
}

async function writeConfig(document) {
  const configPath = getConfigPath();
  const directory = path.dirname(configPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);
  const temporaryPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;
  const source = `${CONFIG_PREFIX}${JSON.stringify(document, null, 2)};\n`;
  await writeFile(temporaryPath, source, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, configPath);
  await chmod(configPath, 0o600).catch(() => undefined);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFileNotFoundError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
