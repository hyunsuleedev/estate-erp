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
import {
  AnalysisError,
  buildComparisonAnalysis,
  canonicalHash,
  compareFloorDisclosure,
  comparePrices,
  computeEsiljangManifestHash,
  computeNaverManifestHash,
  parseKoreanMoney,
} from "../scripts/lib/comparison-analysis.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDirectory, "..");
const observedAt = "2026-08-08T09:00:00.000Z";
const collectedAt = "2026-08-08T10:00:00.000Z";
const analyzedAt = "2026-08-08T11:00:00.000Z";
const temporaryDirectories = [];

function item(externalAdId, naverArticleNo, overrides = {}) {
  return {
    provider: "esiljang",
    externalAdId,
    naverArticleNo,
    fullAddress: `테스트동 ${externalAdId}`,
    transactionType: "매매",
    advertisedPrice: 100000,
    providerStatus: "광고중",
    observedAt,
    sourcePage: 1,
    ...overrides,
  };
}

function sealEsiljang(items) {
  const snapshot = {
    status: "succeeded",
    provider: "esiljang",
    scope: "active_advertisements",
    activeFilter: { dataValue: "ad", selected: true, count: items.length },
    observedAt,
    expectedTotal: items.length,
    collectedTotal: items.length,
    pageCount: 1,
    visitedPages: [1],
    paginationComplete: true,
    items,
    warnings: [],
  };
  return { ...snapshot, manifestHash: computeEsiljangManifestHash(snapshot) };
}

function sealNaver(esiljang, { queries = [], failures = [], skipped = [] }) {
  const status =
    queries.length === 0
      ? "failed"
      : failures.length > 0 || skipped.length > 0
        ? "partial"
        : "succeeded";
  const snapshot = {
    version: 1,
    status,
    provider: "naver",
    scope: "duplicate_advertisements_by_article",
    collectedAt,
    source: {
      provider: "esiljang",
      scope: "active_advertisements",
      observedAt,
      manifestHash: esiljang.manifestHash,
    },
    sourceItemTotal: esiljang.items.length,
    requestedTotal: queries.length + failures.length,
    succeededTotal: queries.length,
    failedTotal: failures.length,
    skippedTotal: skipped.length,
    queries,
    failures,
    skipped,
  };
  return { ...snapshot, manifestHash: computeNaverManifestHash(snapshot) };
}

function query(naverArticleNo, response) {
  return {
    naverArticleNo,
    sourceAdvertisements: [],
    httpStatus: 200,
    response,
  };
}

function saleRow(articleNo, price, overrides = {}) {
  return {
    articleNo,
    articleName: "테스트아파트",
    buildingName: "101동",
    tradeTypeName: "매매",
    dealOrWarrantPrc: price,
    floorInfo: "중/30",
    articleConfirmYmd: "20260808",
    realtorName: `중개사-${articleNo}`,
    ...overrides,
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("local advertisement comparison", () => {
  it("separates the reference, response leader, owned leader, and competitors", () => {
    const esiljang = sealEsiljang([
      item("ES-100", "100"),
      item("ES-200", "200"),
      item("ES-300", "300", { providerStatus: "거래완료" }),
    ]);
    const rows = [
      saleRow("900", "9억", {
        floorInfo: "12/30",
        articleConfirmYmd: "20260809",
      }),
      saleRow("200", "10억"),
      saleRow("100", "10억", { floorInfo: "중/30" }),
      saleRow("300", "10억"),
      saleRow("901", "11억", { articleConfirmYmd: "20260807" }),
    ];
    const naver = sealNaver(esiljang, {
      queries: [query("100", rows), query("200", rows), query("300", rows)],
    });

    const result = buildComparisonAnalysis(esiljang, naver, analyzedAt);
    const first = result.analyses[0];

    assert.equal(result.status, "succeeded");
    assert.equal(first.state, "analyzed");
    assert.deepEqual(first.rank, {
      value: 3,
      total: 5,
      basis: "naver_duplicate_response_order",
      scope: "saved_duplicate_response",
      collectedAt,
    });
    assert.equal(
      first.ownReferenceAdvertisement.advertisement.articleNo,
      "100",
    );
    assert.equal(
      first.representativeAdvertisement.advertisement.articleNo,
      "900",
    );
    assert.equal(
      first.representativeAdvertisement.officialNaverRepresentativeClaim,
      false,
    );
    assert.equal(
      first.ownRepresentativeAdvertisement.advertisement.articleNo,
      "200",
    );
    assert.equal(
      first.leadingCompetitorAdvertisement.advertisement.articleNo,
      "900",
    );
    assert.deepEqual(
      first.otherOwnAdvertisements.map((row) => row.articleNo),
      ["200"],
    );
    assert.deepEqual(
      first.excludedCompletedOwnAdvertisements.map((row) => row.articleNo),
      ["300"],
    );
    assert.deepEqual(
      first.competitors.map((entry) => entry.advertisement.articleNo),
      ["900", "901"],
    );
    assert.equal(first.competitors[0].priceComparison.relation, "lower");
    assert.equal(
      first.competitors[0].floorDisclosureComparison.relation,
      "competitor_more_specific",
    );
    assert.equal(first.competitors[0].confirmationDateRelation, "newer");
    assert.equal(first.competitors[1].priceComparison.relation, "higher");
    assert.equal(result.analyses[2].state, "skipped_completed");
    assert.equal(result.counts.completedSkipped, 1);

    const { manifestHash, ...withoutHash } = result;
    assert.equal(manifestHash, canonicalHash(withoutHash));
  });

  it("uses dominance rather than converting monthly deposit into rent", () => {
    const own = {
      transactionKind: "monthly",
      depositManwon: 30000,
      monthlyRentManwon: 280,
    };
    assert.equal(
      comparePrices(own, {
        transactionKind: "monthly",
        depositManwon: 30000,
        monthlyRentManwon: 270,
      }).relation,
      "lower",
    );
    assert.equal(
      comparePrices(own, {
        transactionKind: "monthly",
        depositManwon: 20000,
        monthlyRentManwon: 300,
      }).relation,
      "mixed",
    );
    assert.equal(
      comparePrices(own, {
        transactionKind: "monthly",
        depositManwon: 40000,
        monthlyRentManwon: 300,
      }).relation,
      "higher",
    );
  });

  it("keeps empty, failed, and anchor-missing states distinct", () => {
    const esiljang = sealEsiljang([
      item("ES-100", "100"),
      item("ES-200", "200"),
      item("ES-300", "300"),
    ]);
    const naver = sealNaver(esiljang, {
      queries: [query("100", []), query("300", [saleRow("999", "10억")])],
      failures: [
        {
          naverArticleNo: "200",
          sourceAdvertisements: [],
          httpStatus: 429,
          reasonCode: "rate_limited",
        },
      ],
    });

    const result = buildComparisonAnalysis(esiljang, naver, analyzedAt);
    assert.equal(result.status, "partial");
    assert.deepEqual(
      result.analyses.map((analysis) => analysis.state),
      ["empty_response", "collection_failed", "anchor_not_found"],
    );
    assert.equal(result.counts.emptyResponse, 1);
    assert.equal(result.counts.collectionFailed, 1);
    assert.equal(result.counts.anchorMissing, 1);
    assert.equal(result.counts.issues, 2);
  });

  it("normalizes Korean prices and floor disclosure deterministically", () => {
    assert.equal(parseKoreanMoney("15억 8,000"), 158000);
    assert.equal(parseKoreanMoney("3억"), 30000);
    assert.equal(parseKoreanMoney("3,000"), 3000);
    assert.equal(parseKoreanMoney("1.5억"), 15000);
    assert.equal(parseKoreanMoney("가격협의"), null);
    assert.equal(
      compareFloorDisclosure({ kind: "band" }, { kind: "exact" }).relation,
      "competitor_more_specific",
    );
  });

  it("rejects mismatched lineage and tampered manifests", () => {
    const esiljang = sealEsiljang([item("ES-100", "100")]);
    const naver = sealNaver(esiljang, {
      queries: [query("100", [saleRow("100", "10억")])],
    });
    const otherEsiljang = sealEsiljang([item("ES-200", "200")]);

    assert.throws(
      () => buildComparisonAnalysis(otherEsiljang, naver, analyzedAt),
      (error) =>
        error instanceof AnalysisError &&
        error.reasonCode === "snapshot_lineage_mismatch",
    );

    const tamperedNaver = structuredClone(naver);
    tamperedNaver.queries[0].response[0].dealOrWarrantPrc = "1억";
    assert.throws(
      () => buildComparisonAnalysis(esiljang, tamperedNaver, analyzedAt),
      (error) =>
        error instanceof AnalysisError &&
        error.reasonCode === "naver_integrity_mismatch",
    );

    const tamperedEsiljang = structuredClone(esiljang);
    tamperedEsiljang.items[0].advertisedPrice = 1;
    assert.throws(
      () => buildComparisonAnalysis(tamperedEsiljang, naver, analyzedAt),
      (error) =>
        error instanceof AnalysisError &&
        error.reasonCode === "esiljang_integrity_mismatch",
    );
  });

  it("writes one owner-only immutable analysis through the CLI", () => {
    const esiljang = sealEsiljang([item("ES-100", "100")]);
    const naver = sealNaver(esiljang, {
      queries: [query("100", [saleRow("100", "10억")])],
    });
    const directory = mkdtempSync(path.join(tmpdir(), "ad-comparison-test-"));
    temporaryDirectories.push(directory);
    const esiljangPath = path.join(directory, "esiljang.json");
    const naverPath = path.join(directory, "naver.json");
    const outputPath = path.join(directory, "analysis.json");
    writeFileSync(esiljangPath, JSON.stringify(esiljang));
    writeFileSync(naverPath, JSON.stringify(naver));

    const args = [
      path.join(skillRoot, "scripts", "analyze-snapshots.mjs"),
      "--esiljang",
      esiljangPath,
      "--naver",
      naverPath,
      "--output",
      outputPath,
      "--analyzed-at",
      analyzedAt,
    ];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).status, "succeeded");
    assert.equal(JSON.parse(readFileSync(outputPath, "utf8")).version, 1);
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);

    const second = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(second.status, 1);
    assert.equal(JSON.parse(second.stderr).reasonCode, "output_exists");
  });
});
