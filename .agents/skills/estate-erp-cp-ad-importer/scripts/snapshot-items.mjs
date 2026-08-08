#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SHA_256_PATTERN = /^[0-9a-f]{64}$/;

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function hashCanonicalJson(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContiguousPages(pages) {
  assert(Array.isArray(pages) && pages.length > 0, "visitedPages is required");
  pages.forEach((page, index) => {
    assert(
      Number.isInteger(page) && page === index + 1,
      "visitedPages must be ordered and contiguous from page 1",
    );
  });
}

export function validateSavedSnapshot(snapshot) {
  assert(isRecord(snapshot), "snapshot must be a JSON object");
  assert(snapshot.status === "succeeded", "snapshot status must be succeeded");
  assert(
    typeof snapshot.provider === "string" && snapshot.provider.length > 0,
    "provider is required",
  );
  assert(
    snapshot.scope === "active_advertisements",
    "scope must be active_advertisements",
  );
  assert(isRecord(snapshot.activeFilter), "activeFilter must be an object");
  assert(
    snapshot.activeFilter.selected === true,
    "activeFilter.selected must be true",
  );
  if (snapshot.provider === "esiljang") {
    assert(
      snapshot.activeFilter.dataValue === "ad",
      "Esiljang activeFilter.dataValue must be ad",
    );
  }
  assert(
    typeof snapshot.observedAt === "string" &&
      !Number.isNaN(Date.parse(snapshot.observedAt)) &&
      /[T ]\d{2}:\d{2}/.test(snapshot.observedAt),
    "observedAt must be a timestamp",
  );
  assert(
    snapshot.expectedTotal === null ||
      (Number.isInteger(snapshot.expectedTotal) && snapshot.expectedTotal >= 0),
    "expectedTotal must be a non-negative integer or null",
  );
  assert(
    snapshot.activeFilter.count === snapshot.expectedTotal,
    "activeFilter.count must match expectedTotal",
  );
  assert(
    snapshot.paginationComplete === true,
    "paginationComplete must be true",
  );
  assertContiguousPages(snapshot.visitedPages);
  assert(Array.isArray(snapshot.items), "items must be an array");
  if (snapshot.expectedTotal !== null) {
    assert(
      snapshot.items.length === snapshot.expectedTotal,
      "items.length must match expectedTotal",
    );
  }
  if (snapshot.collectedTotal !== undefined) {
    assert(
      snapshot.collectedTotal === snapshot.items.length,
      "collectedTotal must match items.length",
    );
  }
  if (snapshot.pageCount !== undefined) {
    assert(
      snapshot.pageCount === snapshot.visitedPages.length,
      "pageCount must match visitedPages.length",
    );
  }

  const externalAdIds = new Set();
  snapshot.items.forEach((item, index) => {
    assert(isRecord(item), `items[${index}] must be an object`);
    assert(
      item.provider === snapshot.provider,
      `items[${index}].provider must match snapshot provider`,
    );
    assert(
      typeof item.externalAdId === "string" && item.externalAdId.trim(),
      `items[${index}].externalAdId is required`,
    );
    assert(
      !externalAdIds.has(item.externalAdId),
      `duplicate externalAdId: ${item.externalAdId}`,
    );
    externalAdIds.add(item.externalAdId);
    assert(
      item.observedAt === snapshot.observedAt,
      `items[${index}].observedAt must match snapshot observedAt`,
    );
    assert(
      Number.isInteger(item.sourcePage) &&
        snapshot.visitedPages.includes(item.sourcePage),
      `items[${index}].sourcePage must appear in visitedPages`,
    );
  });

  const manifestHash = hashCanonicalJson({
    provider: snapshot.provider,
    scope: snapshot.scope,
    activeFilter: snapshot.activeFilter,
    observedAt: snapshot.observedAt,
    expectedTotal: snapshot.expectedTotal,
    paginationComplete: snapshot.paginationComplete,
    visitedPages: snapshot.visitedPages,
    items: [...snapshot.items].sort((left, right) =>
      left.externalAdId.localeCompare(right.externalAdId),
    ),
  });
  assert(
    SHA_256_PATTERN.test(snapshot.manifestHash ?? ""),
    "manifestHash must be a SHA-256 hex value",
  );
  assert(
    snapshot.manifestHash === manifestHash,
    "manifestHash does not match the canonical snapshot manifest",
  );
  return { manifestHash };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function nonNegativeInteger(value, name) {
  const parsed = Number(value);
  assert(Number.isInteger(parsed) && parsed >= 0, `${name} must be >= 0`);
  return parsed;
}

export async function buildOutput(filePath, action, args = []) {
  assert(filePath, "snapshot path is required");
  assert(
    ["summary", "begin", "item"].includes(action),
    "action must be summary, begin, or item",
  );
  const bytes = await readFile(filePath);
  const snapshot = JSON.parse(bytes.toString("utf8"));
  validateSavedSnapshot(snapshot);
  const fileSha256 = sha256(bytes);

  if (action === "summary") {
    return {
      path: filePath,
      provider: snapshot.provider,
      scope: snapshot.scope,
      observedAt: snapshot.observedAt,
      expectedTotal: snapshot.expectedTotal,
      itemCount: snapshot.items.length,
      manifestHash: snapshot.manifestHash,
      fileSha256,
    };
  }

  if (action === "begin") {
    return {
      channel: snapshot.provider,
      provider: snapshot.provider,
      scope: snapshot.scope,
      observedAt: snapshot.observedAt,
      expectedTotal: snapshot.expectedTotal,
      manifestHash: snapshot.manifestHash,
      fileSha256,
      activeFilter: snapshot.activeFilter,
      paginationComplete: snapshot.paginationComplete,
      visitedPages: snapshot.visitedPages,
    };
  }

  const sessionId = option(args, "--session-id");
  assert(sessionId, "--session-id is required for item");
  const indexValue = option(args, "--index");
  const externalAdId = option(args, "--external-ad-id");
  assert(
    (indexValue === undefined) !== (externalAdId === undefined),
    "item requires exactly one of --index or --external-ad-id",
  );
  const raw =
    externalAdId !== undefined
      ? snapshot.items.find((item) => item.externalAdId === externalAdId)
      : snapshot.items[nonNegativeInteger(indexValue, "--index")];
  assert(raw, "requested item is outside the snapshot");
  return {
    sessionId,
    raw,
  };
}

async function main() {
  const [filePath, action = "summary", ...args] = process.argv.slice(2);
  const output = await buildOutput(filePath, action, args);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  });
}
