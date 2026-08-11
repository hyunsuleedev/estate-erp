import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDirectory, "..");
const temporaryDirectories = [];

function successfulEsiljangSnapshot(items) {
  return {
    status: "succeeded",
    provider: "esiljang",
    scope: "active_advertisements",
    observedAt: "2026-08-08T09:00:00.000Z",
    expectedTotal: items.length,
    collectedTotal: items.length,
    pageCount: 1,
    visitedPages: [1],
    paginationComplete: true,
    manifestHash: "a".repeat(64),
    items,
    warnings: [],
  };
}

function createFixture(items) {
  const directory = mkdtempSync(path.join(tmpdir(), "naver-reader-test-"));
  temporaryDirectories.push(directory);
  const sourcePath = path.join(directory, "esiljang.json");
  const source = successfulEsiljangSnapshot(items);
  writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
  return { directory, sourcePath, source };
}

function runScript(name, args, input) {
  return spawnSync(
    process.execPath,
    [path.join(skillRoot, "scripts", name), ...args],
    { input, encoding: "utf8" },
  );
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("naver duplicate-ad snapshot", () => {
  it("deduplicates article numbers and records missing numbers", () => {
    const { sourcePath } = createFixture([
      { externalAdId: "ES-1", naverArticleNo: "2612345679" },
      { externalAdId: "ES-2", naverArticleNo: null },
      { externalAdId: "ES-3", naverArticleNo: "2612345678" },
      { externalAdId: "ES-4", naverArticleNo: "2612345679" },
    ]);
    const result = runScript("prepare-collection.mjs", [
      "--source",
      sourcePath,
    ]);

    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.ready, true);
    assert.deepEqual(
      plan.targets.map((target) => target.naverArticleNo),
      ["2612345678", "2612345679"],
    );
    assert.equal(plan.targets[1].sourceAdvertisements.length, 2);
    assert.equal(plan.skipped[0].reasonCode, "missing_naver_article_no");
  });

  it("rejects an incomplete or invalid Esiljang snapshot", () => {
    const { sourcePath, source } = createFixture([
      { externalAdId: "ES-1", naverArticleNo: "2612345678" },
    ]);
    writeFileSync(
      sourcePath,
      JSON.stringify({ ...source, paginationComplete: false }),
    );
    const result = runScript("prepare-collection.mjs", [
      "--source",
      sourcePath,
    ]);

    assert.equal(result.status, 1);
    const failure = JSON.parse(result.stderr);
    assert.equal(failure.reasonCode, "invalid_esiljang_snapshot");
    assert.ok(
      failure.errors.some((message) => message.includes("paginationComplete")),
    );
  });

  it("rejects an empty or non-string Naver article number", () => {
    const { sourcePath } = createFixture([
      { externalAdId: "ES-1", naverArticleNo: "" },
      { externalAdId: "ES-2", naverArticleNo: 2612345678 },
    ]);
    const result = runScript("prepare-collection.mjs", [
      "--source",
      sourcePath,
    ]);

    assert.equal(result.status, 1);
    const failure = JSON.parse(result.stderr);
    assert.equal(failure.reasonCode, "invalid_esiljang_snapshot");
    assert.equal(
      failure.errors.filter((message) => message.includes("naverArticleNo"))
        .length,
      2,
    );
  });

  it("writes raw decoded responses without comparison projection", () => {
    const { directory, sourcePath } = createFixture([
      { externalAdId: "ES-1", naverArticleNo: "2612345678" },
    ]);
    const outputPath = path.join(directory, "naver-duplicates.json");
    const sourceBefore = readFileSync(sourcePath, "utf8");
    const envelope = {
      collectedAt: "2026-08-08T10:00:00.000Z",
      results: [
        {
          naverArticleNo: "2612345678",
          status: "succeeded",
          httpStatus: 200,
          response: {
            articleList: [
              { articleNo: "2612345678", dealOrWarrantPrc: "15억" },
              { articleNo: "2612345680", dealOrWarrantPrc: "15억 5,000" },
            ],
            isMoreData: false,
          },
        },
      ],
    };
    const result = runScript(
      "write-snapshot.mjs",
      ["--source", sourcePath, "--responses", "-", "--output", outputPath],
      JSON.stringify(envelope),
    );

    assert.equal(result.status, 0, result.stderr);
    const snapshot = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(snapshot.status, "succeeded");
    assert.deepEqual(
      snapshot.queries[0].response,
      envelope.results[0].response,
    );
    assert.match(snapshot.manifestHash, /^[a-f0-9]{64}$/);
    assert.equal(readFileSync(sourcePath, "utf8"), sourceBefore);
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    assert.doesNotMatch(JSON.stringify(snapshot), /isMine|isMain|ranking/);
  });

  it("saves successes and marks skipped or failed targets as partial", () => {
    const { directory, sourcePath } = createFixture([
      { externalAdId: "ES-1", naverArticleNo: "2612345678" },
      { externalAdId: "ES-2", naverArticleNo: "2612345679" },
      { externalAdId: "ES-3", naverArticleNo: null },
    ]);
    const outputPath = path.join(directory, "partial.json");
    const envelope = {
      collectedAt: "2026-08-08T10:00:00.000Z",
      results: [
        {
          naverArticleNo: "2612345678",
          status: "succeeded",
          httpStatus: 200,
          response: [],
        },
        {
          naverArticleNo: "2612345679",
          status: "failed",
          httpStatus: 429,
          reasonCode: "rate_limited",
        },
      ],
    };
    const result = runScript(
      "write-snapshot.mjs",
      ["--source", sourcePath, "--responses", "-", "--output", outputPath],
      JSON.stringify(envelope),
    );

    assert.equal(result.status, 0, result.stderr);
    const snapshot = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(snapshot.status, "partial");
    assert.equal(snapshot.succeededTotal, 1);
    assert.equal(snapshot.failedTotal, 1);
    assert.equal(snapshot.skippedTotal, 1);
    assert.equal(snapshot.failures[0].reasonCode, "rate_limited");
  });

  it("rejects secret-shaped response content and does not create a file", () => {
    const { directory, sourcePath } = createFixture([
      { externalAdId: "ES-1", naverArticleNo: "2612345678" },
    ]);
    const outputPath = path.join(directory, "must-not-exist.json");
    const envelope = {
      collectedAt: "2026-08-08T10:00:00.000Z",
      results: [
        {
          naverArticleNo: "2612345678",
          status: "succeeded",
          httpStatus: 200,
          response: { authorization: "Bearer should-never-be-saved" },
        },
      ],
    };
    const result = runScript(
      "write-snapshot.mjs",
      ["--source", sourcePath, "--responses", "-", "--output", outputPath],
      JSON.stringify(envelope),
    );

    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).reasonCode, "sensitive_content");
    assert.throws(() => statSync(outputPath));
  });

  it("refuses to overwrite the Esiljang source file", () => {
    const { sourcePath } = createFixture([
      { externalAdId: "ES-1", naverArticleNo: "2612345678" },
    ]);
    const result = runScript(
      "write-snapshot.mjs",
      [
        "--source",
        sourcePath,
        "--responses",
        "-",
        "--output",
        sourcePath,
        "--overwrite",
      ],
      JSON.stringify({ collectedAt: "2026-08-08T10:00:00.000Z", results: [] }),
    );

    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).reasonCode, "output_matches_source");
  });
});
