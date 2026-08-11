import { createHash, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  constants,
  link,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export class ContractError extends Error {
  constructor(reasonCode, message, errors = []) {
    super(message);
    this.name = "ContractError";
    this.reasonCode = reasonCode;
    this.errors = errors;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isTimestamp(value) {
  return (
    typeof value === "string" &&
    /T\d{2}:\d{2}/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function compareArticleNumbers(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  return left.localeCompare(right);
}

function validateSourceSnapshot(snapshot) {
  const errors = [];
  if (!isPlainObject(snapshot)) {
    throw new ContractError(
      "invalid_esiljang_snapshot",
      "Esiljang snapshot must be a JSON object.",
    );
  }
  if (snapshot.status !== "succeeded") {
    errors.push("status must be succeeded");
  }
  if (snapshot.provider !== "esiljang") {
    errors.push("provider must be esiljang");
  }
  if (snapshot.scope !== "active_advertisements") {
    errors.push("scope must be active_advertisements");
  }
  if (!isTimestamp(snapshot.observedAt)) {
    errors.push("observedAt must be a valid timestamp");
  }
  if (snapshot.paginationComplete !== true) {
    errors.push("paginationComplete must be true");
  }
  if (!/^[a-f0-9]{64}$/i.test(snapshot.manifestHash ?? "")) {
    errors.push("manifestHash must be a SHA-256 value");
  }
  if (!Array.isArray(snapshot.items)) {
    errors.push("items must be an array");
  }

  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  if (
    !Number.isInteger(snapshot.collectedTotal) ||
    snapshot.collectedTotal < 0 ||
    snapshot.collectedTotal !== items.length
  ) {
    errors.push("collectedTotal must equal items.length");
  }
  if (
    snapshot.expectedTotal !== null &&
    snapshot.expectedTotal !== undefined &&
    (!Number.isInteger(snapshot.expectedTotal) ||
      snapshot.expectedTotal < 0 ||
      snapshot.expectedTotal !== items.length)
  ) {
    errors.push("expectedTotal must be null or equal items.length");
  }

  const externalAdIds = new Set();
  items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`items[${index}] must be an object`);
      return;
    }
    if (typeof item.externalAdId !== "string" || !item.externalAdId.trim()) {
      errors.push(`items[${index}].externalAdId is required`);
    } else if (externalAdIds.has(item.externalAdId)) {
      errors.push(`duplicate externalAdId: ${item.externalAdId}`);
    } else {
      externalAdIds.add(item.externalAdId);
    }

    const articleNo = item.naverArticleNo;
    if (
      articleNo !== null &&
      articleNo !== undefined &&
      (typeof articleNo !== "string" || !/^\d+$/.test(articleNo))
    ) {
      errors.push(
        `items[${index}].naverArticleNo must be a digits-only string or null`,
      );
    }
  });

  if (errors.length > 0) {
    throw new ContractError(
      "invalid_esiljang_snapshot",
      "The Esiljang snapshot is not a complete successful reader result.",
      errors,
    );
  }
  return items;
}

export function buildCollectionPlan(snapshot) {
  const items = validateSourceSnapshot(snapshot);
  const targetsByArticleNo = new Map();
  const skipped = [];

  items.forEach((item, itemIndex) => {
    const sourceAdvertisement = {
      itemIndex,
      externalAdId: item.externalAdId,
    };
    if (!item.naverArticleNo) {
      skipped.push({
        ...sourceAdvertisement,
        reasonCode: "missing_naver_article_no",
      });
      return;
    }
    const existing = targetsByArticleNo.get(item.naverArticleNo);
    if (existing) {
      existing.sourceAdvertisements.push(sourceAdvertisement);
      return;
    }
    targetsByArticleNo.set(item.naverArticleNo, {
      naverArticleNo: item.naverArticleNo,
      sourceAdvertisements: [sourceAdvertisement],
    });
  });

  const targets = [...targetsByArticleNo.values()].sort((left, right) =>
    compareArticleNumbers(left.naverArticleNo, right.naverArticleNo),
  );
  return {
    version: 1,
    ready: targets.length > 0,
    ...(targets.length === 0 ? { reasonCode: "no_naver_article_numbers" } : {}),
    source: {
      provider: "esiljang",
      scope: "active_advertisements",
      observedAt: snapshot.observedAt,
      manifestHash: snapshot.manifestHash.toLowerCase(),
    },
    sourceItemTotal: items.length,
    targetTotal: targets.length,
    skippedTotal: skipped.length,
    targets,
    skipped,
  };
}

const sensitiveKeys = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "password",
  "passwd",
  "secret",
  "sessionid",
]);

function assertNoSensitiveContent(value, location) {
  const pending = [{ value, location }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current.value === "string") {
      if (/\bbearer\s+\S+/i.test(current.value)) {
        throw new ContractError(
          "sensitive_content",
          `Bearer-shaped content is prohibited at ${current.location}.`,
        );
      }
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      current.value.forEach((entry, index) =>
        pending.push({
          value: entry,
          location: `${current.location}[${index}]`,
        }),
      );
      continue;
    }
    for (const [key, entry] of Object.entries(current.value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (sensitiveKeys.has(normalizedKey)) {
        throw new ContractError(
          "sensitive_content",
          `Secret-shaped key is prohibited at ${current.location}.${key}.`,
        );
      }
      pending.push({ value: entry, location: `${current.location}.${key}` });
    }
  }
}

function validateHttpStatus(value, location, errors, required) {
  if (value === null || value === undefined) {
    if (required) errors.push(`${location} is required`);
    return;
  }
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    errors.push(`${location} must be an HTTP status integer`);
  }
}

function validateResponseEnvelope(envelope, plan) {
  const errors = [];
  if (!isPlainObject(envelope)) {
    throw new ContractError(
      "invalid_response_envelope",
      "Naver response envelope must be a JSON object.",
    );
  }
  const topLevelKeys = Object.keys(envelope);
  for (const key of topLevelKeys) {
    if (!["collectedAt", "results"].includes(key)) {
      errors.push(`unexpected response envelope field: ${key}`);
    }
  }
  if (!isTimestamp(envelope.collectedAt)) {
    errors.push("collectedAt must be a valid timestamp");
  }
  if (!Array.isArray(envelope.results)) {
    errors.push("results must be an array");
  }

  const targetNumbers = new Set(
    plan.targets.map((target) => target.naverArticleNo),
  );
  const resultsByArticleNo = new Map();
  const results = Array.isArray(envelope.results) ? envelope.results : [];
  results.forEach((result, index) => {
    const location = `results[${index}]`;
    if (!isPlainObject(result)) {
      errors.push(`${location} must be an object`);
      return;
    }
    const allowedKeys = new Set([
      "naverArticleNo",
      "status",
      "httpStatus",
      "response",
      "reasonCode",
      "message",
    ]);
    for (const key of Object.keys(result)) {
      if (!allowedKeys.has(key)) {
        errors.push(`${location} contains unexpected field: ${key}`);
      }
    }

    if (
      typeof result.naverArticleNo !== "string" ||
      !/^\d+$/.test(result.naverArticleNo)
    ) {
      errors.push(`${location}.naverArticleNo must contain digits only`);
      return;
    }
    if (!targetNumbers.has(result.naverArticleNo)) {
      errors.push(`${location} is not a prepared target`);
    }
    if (resultsByArticleNo.has(result.naverArticleNo)) {
      errors.push(`duplicate result for ${result.naverArticleNo}`);
    } else {
      resultsByArticleNo.set(result.naverArticleNo, result);
    }

    if (result.status === "succeeded") {
      validateHttpStatus(
        result.httpStatus,
        `${location}.httpStatus`,
        errors,
        true,
      );
      if (
        Number.isInteger(result.httpStatus) &&
        (result.httpStatus < 200 || result.httpStatus > 299)
      ) {
        errors.push(`${location}.httpStatus must be 2xx for succeeded status`);
      }
      if (!Object.hasOwn(result, "response")) {
        errors.push(`${location}.response is required for succeeded status`);
      } else {
        assertNoSensitiveContent(result.response, `${location}.response`);
      }
      if (
        Object.hasOwn(result, "reasonCode") ||
        Object.hasOwn(result, "message")
      ) {
        errors.push(
          `${location} must not include failure fields when succeeded`,
        );
      }
    } else if (result.status === "failed") {
      validateHttpStatus(
        result.httpStatus,
        `${location}.httpStatus`,
        errors,
        false,
      );
      if (!/^[a-z0-9_]+$/.test(result.reasonCode ?? "")) {
        errors.push(`${location}.reasonCode must use lower_snake_case`);
      }
      if (
        result.message !== undefined &&
        (typeof result.message !== "string" ||
          result.message.length === 0 ||
          result.message.length > 500)
      ) {
        errors.push(
          `${location}.message must be 1-500 characters when present`,
        );
      }
      if (typeof result.message === "string") {
        assertNoSensitiveContent(result.message, `${location}.message`);
      }
      if (Object.hasOwn(result, "response")) {
        errors.push(`${location} must not retain a response body when failed`);
      }
    } else {
      errors.push(`${location}.status must be succeeded or failed`);
    }
  });

  if (errors.length > 0) {
    throw new ContractError(
      "invalid_response_envelope",
      "The Naver response envelope failed validation.",
      errors,
    );
  }
  return resultsByArticleNo;
}

export function buildDuplicateSnapshot(sourceSnapshot, responseEnvelope) {
  const plan = buildCollectionPlan(sourceSnapshot);
  if (!plan.ready) {
    throw new ContractError(
      "no_naver_article_numbers",
      "The Esiljang snapshot contains no Naver article numbers.",
    );
  }
  const resultsByArticleNo = validateResponseEnvelope(responseEnvelope, plan);
  const queries = [];
  const failures = [];

  for (const target of plan.targets) {
    const result = resultsByArticleNo.get(target.naverArticleNo);
    if (!result) {
      failures.push({
        naverArticleNo: target.naverArticleNo,
        sourceAdvertisements: target.sourceAdvertisements,
        reasonCode: "not_collected",
      });
      continue;
    }
    if (result.status === "succeeded") {
      queries.push({
        naverArticleNo: target.naverArticleNo,
        sourceAdvertisements: target.sourceAdvertisements,
        httpStatus: result.httpStatus,
        response: result.response,
      });
      continue;
    }
    failures.push({
      naverArticleNo: target.naverArticleNo,
      sourceAdvertisements: target.sourceAdvertisements,
      ...(result.httpStatus === undefined
        ? {}
        : { httpStatus: result.httpStatus }),
      reasonCode: result.reasonCode,
      ...(result.message === undefined ? {} : { message: result.message }),
    });
  }

  const status =
    queries.length === 0
      ? "failed"
      : failures.length > 0 || plan.skipped.length > 0
        ? "partial"
        : "succeeded";
  const snapshotWithoutHash = {
    version: 1,
    status,
    provider: "naver",
    scope: "duplicate_advertisements_by_article",
    collectedAt: responseEnvelope.collectedAt,
    source: plan.source,
    sourceItemTotal: plan.sourceItemTotal,
    requestedTotal: plan.targetTotal,
    succeededTotal: queries.length,
    failedTotal: failures.length,
    skippedTotal: plan.skipped.length,
    queries,
    failures,
    skipped: plan.skipped,
  };
  return {
    ...snapshotWithoutHash,
    manifestHash: sha256(snapshotWithoutHash),
  };
}

export async function readJsonFile(filePath) {
  const raw =
    filePath === "-"
      ? await new Promise((resolve, reject) => {
          let value = "";
          process.stdin.setEncoding("utf8");
          process.stdin.on("data", (chunk) => {
            value += chunk;
          });
          process.stdin.on("end", () => resolve(value));
          process.stdin.on("error", reject);
        })
      : await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new ContractError("invalid_json", "Could not parse the JSON input.");
  }
}

export async function writeJsonAtomic(filePath, value, overwrite = false) {
  const resolvedPath = path.resolve(filePath);
  const parentDirectory = path.dirname(resolvedPath);
  await access(parentDirectory, constants.W_OK);

  if (!overwrite) {
    try {
      await access(resolvedPath, constants.F_OK);
      throw new ContractError(
        "output_exists",
        `Output already exists: ${resolvedPath}`,
      );
    } catch (error) {
      if (error instanceof ContractError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const temporaryPath = path.join(
    parentDirectory,
    `.${path.basename(resolvedPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    if (overwrite) {
      await rename(temporaryPath, resolvedPath);
    } else {
      await link(temporaryPath, resolvedPath);
      await unlink(temporaryPath);
    }
    await chmod(resolvedPath, 0o600);
    return resolvedPath;
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError?.code !== "ENOENT") throw cleanupError;
    }
    if (error?.code === "EEXIST") {
      throw new ContractError(
        "output_exists",
        `Output already exists: ${resolvedPath}`,
      );
    }
    throw error;
  }
}

export function formatFailure(error) {
  if (error instanceof ContractError) {
    return {
      status: "failed",
      reasonCode: error.reasonCode,
      message: error.message,
      ...(error.errors.length > 0 ? { errors: error.errors } : {}),
    };
  }
  return {
    status: "failed",
    reasonCode: "unexpected_error",
    message: error instanceof Error ? error.message : String(error),
  };
}
