import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
});
