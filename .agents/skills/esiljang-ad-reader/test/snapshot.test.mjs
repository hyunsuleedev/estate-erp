import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  decidePagination,
  parseAgentBrowserEvaluation,
  shouldYieldToAgent,
} from "../scripts/read-active-ads.mjs";
import { normalizeSnapshot } from "../scripts/normalize-snapshot.mjs";
import {
  persistSnapshotJson,
  serializeSnapshot,
} from "../scripts/snapshot-store.mjs";
import { validateSnapshot } from "../scripts/validate-snapshot.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDirectory, "..");
const skill = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
const providerUi = readFileSync(
  path.join(skillRoot, "references/provider-ui.md"),
  "utf8",
);
const snapshotContract = readFileSync(
  path.join(skillRoot, "references/snapshot-contract.md"),
  "utf8",
);
const runner = readFileSync(
  path.join(skillRoot, "scripts/read-active-ads.mjs"),
  "utf8",
);

function rawSnapshot(overrides = {}) {
  return {
    provider: "esiljang",
    scope: "active_advertisements",
    activeFilter: { dataValue: "ad", selected: true, count: 1 },
    observedAt: "2026-08-04T12:00:00.000Z",
    expectedTotal: 1,
    paginationComplete: true,
    visitedPages: [1],
    items: [
      {
        externalAdId: "12345678",
        providerUrl: "https://www.aipartner.com/offerings/ad_list",
        fullAddress: "테스트 주소",
        providerStatus: "광고중",
        sourcePage: 1,
      },
    ],
    ...overrides,
  };
}

function runScript(name, input) {
  return spawnSync(
    process.execPath,
    [path.join(skillRoot, "scripts", name)],
    { input: JSON.stringify(input), encoding: "utf8" },
  );
}

describe("esiljang standalone reader contract", () => {
  it("does not require Estate ERP or workflow identifiers", () => {
    const contractSources = [skill, snapshotContract];
    for (const source of contractSources) {
      assert.doesNotMatch(source, /Estate ERP/);
      assert.doesNotMatch(source, /`officeId`|`workflowRunId`|`workflowStepId`/);
      assert.doesNotMatch(source, /ListingAdvertisement|resolve_exact_listing/);
      assert.doesNotMatch(source, /naver-real-estate-reader|mcp-contract\.md/);
      assert.doesNotMatch(source, /accountProfile|account-profile/);
    }
    assert.match(skill, /provider=esiljang/);
    assert.match(skill, /scope=active_advertisements/);
    assert.match(snapshotContract, /no required business identifiers/i);
  });

  it("requires the provider 광고중 filter before collection", () => {
    for (const source of [skill, providerUi]) {
      assert.match(source, /GTM_offerings_ad_list_ad_ing/);
      assert.match(source, /data-value="ad"/);
      assert.match(source, /aria-selected="true"/);
      assert.match(source, /active_filter_mismatch/);
    }
  });

  it("rejects normalization without selected filter evidence", () => {
    const result = runScript(
      "normalize-snapshot.mjs",
      rawSnapshot({
        activeFilter: { dataValue: "", selected: false, count: 1 },
      }),
    );
    const output = JSON.parse(result.stdout);

    assert.equal(result.status, 1);
    assert.ok(
      output.errors.some((error) => error.message.includes("activeFilter")),
    );
  });

  it("normalizes and validates a complete standalone snapshot", () => {
    const normalizedResult = runScript(
      "normalize-snapshot.mjs",
      rawSnapshot({
        items: [
          {
            externalAdId: "12345678",
            naverArticleNo: "2612345678",
            naverUrl:
              "https://new.land.naver.com/complexes/123?articleNo=2612345678",
            providerUrl: "https://www.aipartner.com/offerings/ad_list",
            fullAddress: "서울특별시 예시구 예시로 1 101동 1203호",
            dong: "101동",
            ho: "1203호",
            advertisedPrice: "15억 8,000",
            providerStatus: "거래완료",
            sourcePage: 1,
          },
        ],
      }),
    );
    assert.equal(normalizedResult.status, 0, normalizedResult.stderr);
    const normalized = JSON.parse(normalizedResult.stdout);
    assert.equal(normalized.items[0].dong, "101");
    assert.equal(normalized.items[0].ho, "1203");
    assert.equal(normalized.items[0].advertisedPrice, 158000);
    assert.equal(normalized.items[0].providerStatus, "거래완료");

    const validationResult = runScript("validate-snapshot.mjs", normalized);
    assert.equal(validationResult.status, 0, validationResult.stderr);
    const report = JSON.parse(validationResult.stdout);
    assert.equal(report.valid, true);
    assert.equal(report.counts.items, 1);
    assert.match(report.manifestHash, /^[a-f0-9]{64}$/);
  });

  it("validates in memory before the canonical runner persists the final snapshot", () => {
    assert.match(skill, /node scripts\/read-active-ads\.mjs/);
    assert.match(runner, /normalizeSnapshot\(/);
    assert.match(runner, /validateSnapshot\(/);
    assert.match(runner, /persistSnapshotJson\(snapshot\)/);
    assert.ok(
      runner.indexOf("validateSnapshot(normalized)") <
        runner.indexOf("persistSnapshotJson(snapshot)"),
    );
    assert.doesNotMatch(runner, /\bstty\b|node-pty|mkdtemp/);

    const normalized = normalizeSnapshot(rawSnapshot());
    const report = validateSnapshot(normalized);
    assert.equal(normalized.errors.length, 0);
    assert.equal(report.valid, true);
  });

  it("stores one immutable verified JSON file and safely reuses an identical snapshot", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "esiljang-snapshot-test-"),
    );
    try {
      const normalized = normalizeSnapshot(rawSnapshot());
      const validation = validateSnapshot(normalized);
      const snapshot = {
        status: "succeeded",
        provider: normalized.provider,
        scope: normalized.scope,
        activeFilter: normalized.activeFilter,
        observedAt: normalized.observedAt,
        expectedTotal: normalized.expectedTotal,
        collectedTotal: normalized.items.length,
        pageCount: normalized.visitedPages.length,
        visitedPages: normalized.visitedPages,
        paginationComplete: normalized.paginationComplete,
        manifestHash: validation.manifestHash,
        items: normalized.items,
        warnings: validation.warnings,
      };

      const first = await persistSnapshotJson(snapshot, { directory });
      const second = await persistSnapshotJson(snapshot, { directory });
      const stored = await readFile(first.path, "utf8");
      const files = await readdir(directory);

      assert.equal(first.reused, false);
      assert.equal(second.reused, true);
      assert.equal(second.path, first.path);
      assert.equal(stored, serializeSnapshot(snapshot));
      assert.deepEqual(JSON.parse(stored), snapshot);
      const storedValidation = validateSnapshot(JSON.parse(stored));
      assert.equal(storedValidation.valid, true);
      assert.equal(storedValidation.manifestHash, snapshot.manifestHash);
      assert.equal(files.filter((name) => name.endsWith(".json")).length, 1);
      assert.equal((await stat(first.path)).mode & 0o777, 0o600);
      assert.equal((await stat(directory)).mode & 0o777, 0o700);
      assert.match(first.sha256, /^[a-f0-9]{64}$/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("hands inspectable UI obstructions to the agent and supports same-session resume", () => {
    assert.equal(shouldYieldToAgent("active_filter_mismatch", true), true);
    assert.equal(shouldYieldToAgent("layout_mismatch", true), true);
    assert.equal(shouldYieldToAgent("active_filter_mismatch", false), false);
    assert.equal(shouldYieldToAgent("partial_snapshot", true), false);
    assert.match(runner, /--resume-session/);
    assert.match(skill, /status=needs_agent/);
    assert.match(skill, /snapshot -i -c/);
    assert.match(skill, /diagnostics\.resumeCommand/);
  });

  it("parses agent-browser's JSON-encoded evaluation result", () => {
    const browserOutput = JSON.stringify(
      JSON.stringify({ activePage: 1, rowCount: 50 }),
    );
    assert.deepEqual(parseAgentBrowserEvaluation(browserOutput), {
      activePage: 1,
      rowCount: 50,
    });
  });

  it("advances normal pagination and recognizes AIPartner's final-page no-op", () => {
    assert.deepEqual(
      decidePagination({
        activePage: 1,
        pageNumbers: [1, 2],
        next: { exists: true, visible: true, disabled: false, dataValue: "2" },
        last: { exists: true, visible: true, disabled: false, dataValue: "2" },
      }),
      {
        type: "advance",
        targetPage: 2,
        selector: ".singleSection.listSection .pagination a.btnArrow.next",
      },
    );

    assert.deepEqual(
      decidePagination({
        activePage: 2,
        pageNumbers: [1, 2],
        next: { exists: true, visible: true, disabled: false, dataValue: "2" },
        last: { exists: true, visible: true, disabled: false, dataValue: "2" },
      }),
      { type: "terminal" },
    );
  });
});
