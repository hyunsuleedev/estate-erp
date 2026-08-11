import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { Script } from "node:vm";
import {
  LocalReportError,
  buildLocalReportModel,
  renderLocalReportHtml,
} from "../scripts/lib/local-report.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDirectory, "..");
const temporaryDirectories = [];
const manifestHash = "a".repeat(64);

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

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function fixtures() {
  const esiljang = {
    status: "succeeded",
    provider: "esiljang",
    scope: "active_advertisements",
    observedAt: "2026-08-08T09:00:00.000Z",
    collectedTotal: 3,
    manifestHash,
    items: [
      {
        provider: "esiljang",
        externalAdId: "ES-1",
        naverArticleNo: "2612345678",
        fullAddress: "고덕동 테스트 101동 101호",
        transactionType: "매매",
        advertisedPrice: 158000,
        providerStatus: "광고중",
      },
      {
        provider: "esiljang",
        externalAdId: "ES-2",
        naverArticleNo: "2612345679",
        fullAddress: "고덕동 테스트 102동 202호",
        transactionType: "전세",
        advertisedDeposit: 80000,
        providerStatus: "광고중",
      },
      {
        provider: "esiljang",
        externalAdId: "ES-3",
        naverArticleNo: "2612345680",
        fullAddress: "고덕동 테스트 103동 303호",
        transactionType: "월세",
        advertisedDeposit: 10000,
        advertisedMonthlyRent: 250,
        providerStatus: "거래완료",
      },
    ],
  };
  const naver = {
    version: 1,
    status: "succeeded",
    provider: "naver",
    scope: "duplicate_advertisements_by_article",
    collectedAt: "2026-08-08T10:00:00.000Z",
    source: { provider: "esiljang", manifestHash },
    queries: [
      {
        naverArticleNo: "2612345678",
        httpStatus: 200,
        response: [
          {
            articleNo: "2612345678",
            articleName: "</script><script>alert('x')</script>",
            buildingName: "101동",
            dealOrWarrantPrc: "15억 8,000",
            floorInfo: "중/30",
            realtorName: "테스트공인중개사",
            articleConfirmYmd: "20260808",
          },
        ],
      },
      { naverArticleNo: "2612345679", httpStatus: 200, response: [] },
      {
        naverArticleNo: "2612345680",
        httpStatus: 200,
        response: [{ articleNo: "2612345680", articleName: "완료 광고" }],
      },
    ],
    failures: [],
    skipped: [],
    manifestHash: "b".repeat(64),
  };
  return { esiljang, naver };
}

function fixturesWithComparison() {
  const { esiljang, naver } = fixtures();
  const target = naver.queries[0].response[0];
  const competitor = {
    articleNo: "2699999999",
    articleName: "고덕동 테스트",
    buildingName: "101동",
    tradeTypeName: "매매",
    dealOrWarrantPrc: "15억",
    floorInfo: "12/30",
    realtorName: "경쟁공인중개사",
    cpName: "경쟁CP",
    articleConfirmYmd: "20260809",
  };
  naver.queries[0].response = [competitor, target];
  const analyses = [
    {
      itemIndex: 0,
      externalAdId: "ES-1",
      naverArticleNo: "2612345678",
      state: "analyzed",
      reasonCode: null,
      observedGroupSize: 2,
      reportedSameAddressCount: 2,
      rank: {
        value: 2,
        total: 2,
        basis: "naver_duplicate_response_order",
        collectedAt: naver.collectedAt,
      },
      representativeAdvertisement: {
        classification: "observed_response_leader",
        basis: "first_response_row",
        officialNaverRepresentativeClaim: false,
        advertisement: {
          articleNo: competitor.articleNo,
          observedRank: 1,
          articleName: competitor.articleName,
          buildingName: competitor.buildingName,
          realtorName: competitor.realtorName,
          cpName: competitor.cpName,
          price: {
            dealOrWarrantPrc: competitor.dealOrWarrantPrc,
            rentPrc: null,
          },
          ownership: { classification: "competitor" },
        },
      },
      ownRepresentativeAdvertisement: {
        classification: "highest_observed_active_owned_row",
        basis: "lowest_response_order_among_explicit_active_owned_articles",
        officialNaverRepresentativeClaim: false,
        advertisement: {
          articleNo: target.articleNo,
          observedRank: 2,
          articleName: target.articleName,
          realtorName: target.realtorName,
          price: {
            dealOrWarrantPrc: target.dealOrWarrantPrc,
            rentPrc: null,
          },
          ownership: { classification: "owned_active" },
        },
      },
      leadingCompetitorAdvertisement: {
        classification: "leading_competitor",
        basis: "lowest_response_order_among_competitors",
        officialNaverRepresentativeClaim: false,
        advertisement: {
          articleNo: competitor.articleNo,
          observedRank: 1,
          articleName: competitor.articleName,
          realtorName: competitor.realtorName,
          cpName: competitor.cpName,
          price: {
            dealOrWarrantPrc: competitor.dealOrWarrantPrc,
            rentPrc: null,
          },
          ownership: { classification: "competitor" },
        },
      },
      otherOwnAdvertisements: [],
      excludedCompletedOwnAdvertisements: [],
      competitors: [
        {
          advertisement: { articleNo: competitor.articleNo, observedRank: 1 },
          positionRelation: "ahead",
          priceComparison: { relation: "lower", deltaManwon: -8000 },
          confirmationDateRelation: "newer",
          floorDisclosureComparison: {
            relation: "competitor_more_specific",
          },
        },
      ],
      comparisonSummary: {
        competitorCount: 1,
        aheadCompetitorCount: 1,
        behindCompetitorCount: 0,
        priceRelations: {
          lower: 1,
          same: 0,
          higher: 0,
          mixed: 0,
          unknown: 0,
        },
        confirmationDateRelations: {
          newer: 1,
          same_date: 0,
          older: 0,
          unknown: 0,
        },
        competitorMoreSpecificFloorCount: 1,
        referenceIsObservedRepresentative: false,
        observedRepresentativeOwnership: "competitor",
        ownRepresentativeArticleNo: target.articleNo,
        leadingCompetitorArticleNo: competitor.articleNo,
      },
      warnings: [],
    },
    {
      itemIndex: 1,
      externalAdId: "ES-2",
      naverArticleNo: "2612345679",
      state: "empty_response",
      reasonCode: "empty_successful_response",
    },
    {
      itemIndex: 2,
      externalAdId: "ES-3",
      naverArticleNo: "2612345680",
      state: "skipped_completed",
      reasonCode: "provider_status_completed",
    },
  ];
  const withoutHash = {
    version: 1,
    status: "succeeded",
    analyzer: "local-ad-comparison-analyzer",
    scope: "esiljang_ads_against_naver_duplicate_groups",
    policyVersion: 1,
    analyzedAt: "2026-08-08T10:30:00.000Z",
    source: {
      esiljang: { manifestHash: esiljang.manifestHash },
      naver: { manifestHash: naver.manifestHash },
    },
    counts: {},
    analyses,
  };
  const analysis = { ...withoutHash, manifestHash: hash(withoutHash) };
  return { esiljang, naver, analysis };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("local My Ads report", () => {
  it("joins explicit article numbers and preserves factual collection states", () => {
    const { esiljang, naver } = fixtures();
    const model = buildLocalReportModel(
      esiljang,
      naver,
      "2026-08-08T11:00:00.000Z",
    );
    assert.deepEqual(model.counts, {
      total: 3,
      active: 2,
      collected: 1,
      empty: 1,
      issues: 0,
      completed: 1,
      comparisonAnalyzed: 0,
      referenceLeader: 0,
      competitorLeader: 0,
      lowerPrice: 0,
      comparisonIssues: 0,
      competitorAdvertisements: 0,
    });
    assert.equal(model.advertisements[0].duplicates[0].isQueryTarget, true);
    assert.equal(model.advertisements[1].collectionStatus, "empty");
    assert.equal(model.advertisements[2].collectionStatus, "completed");
  });

  it("renders validated rank, representative, and competitor comparisons", () => {
    const { esiljang, naver, analysis } = fixturesWithComparison();
    const model = buildLocalReportModel(
      esiljang,
      naver,
      "2026-08-08T11:00:00.000Z",
      analysis,
    );
    const advertisement = model.advertisements[0];

    assert.equal(model.version, 2);
    assert.equal(model.comparisonAvailable, true);
    assert.equal(model.counts.comparisonAnalyzed, 1);
    assert.equal(model.counts.competitorLeader, 1);
    assert.equal(model.counts.lowerPrice, 1);
    assert.equal(model.counts.competitorAdvertisements, 1);
    assert.deepEqual(advertisement.comparison.rank, {
      value: 2,
      total: 2,
      basis: "naver_duplicate_response_order",
      collectedAt: "2026-08-08T10:00:00.000Z",
    });
    assert.equal(
      advertisement.comparison.representative.articleNo,
      "2699999999",
    );
    assert.equal(
      advertisement.duplicates[0].comparison.isObservedRepresentative,
      true,
    );
    assert.equal(advertisement.duplicates[0].comparison.priceRelation, "lower");
    assert.equal(advertisement.duplicates[1].comparison.ownership, "reference");
    assert.deepEqual(advertisement.observedFloorExposure, {
      kind: "band",
      raw: "중/30",
      source: "naver_duplicate_query_target_floor_info",
    });

    const html = renderLocalReportHtml(model);
    assert.match(html, /응답 대표광고/);
    assert.match(html, /저가 경쟁/);
    assert.match(html, /순위 및 경쟁광고 비교/);
    assert.match(html, /층 노출/);
    assert.match(html, /더 싼 광고/);
    assert.match(html, /저장 후 재광고/);
    assert.match(html, /request-republish-after-save/);
    assert.match(html, /republish_advertisement/);
    assert.match(html, /modify_and_republish_advertisement/);
    assert.match(html, /existing_advertisement_republish_flow/);
    assert.match(html, /요청 JSON 저장/);
    assert.match(html, /local_advertisement_request_bundle/);
    assert.match(html, /version: 2/);
    assert.match(html, /directExecutionAuthorized: false/);
    assert.match(html, /prohibitManualEndAndRecreate: true/);
  });

  it("keeps failure separate from an empty successful response", () => {
    const { esiljang, naver } = fixtures();
    naver.queries = naver.queries.filter(
      (query) => query.naverArticleNo !== "2612345679",
    );
    naver.failures = [
      {
        naverArticleNo: "2612345679",
        httpStatus: 429,
        reasonCode: "rate_limited",
      },
    ];
    const model = buildLocalReportModel(esiljang, naver);
    assert.equal(model.advertisements[1].collectionStatus, "failed");
    assert.equal(model.advertisements[1].reasonCode, "rate_limited");
    assert.equal(model.counts.empty, 0);
    assert.equal(model.counts.issues, 1);
  });

  it("rejects snapshots from different collection lineages", () => {
    const { esiljang, naver } = fixtures();
    naver.source.manifestHash = "c".repeat(64);
    assert.throws(
      () => buildLocalReportModel(esiljang, naver),
      (error) =>
        error instanceof LocalReportError &&
        error.reasonCode === "snapshot_lineage_mismatch",
    );
  });

  it("rejects comparison analysis from another lineage or with tampered content", () => {
    const lineage = fixturesWithComparison();
    lineage.analysis.source.naver.manifestHash = "c".repeat(64);
    const { manifestHash: _lineageHash, ...lineageWithoutHash } =
      lineage.analysis;
    lineage.analysis.manifestHash = hash(lineageWithoutHash);
    assert.throws(
      () =>
        buildLocalReportModel(
          lineage.esiljang,
          lineage.naver,
          "2026-08-08T11:00:00.000Z",
          lineage.analysis,
        ),
      (error) =>
        error instanceof LocalReportError &&
        error.reasonCode === "comparison_lineage_mismatch",
    );

    const tampered = fixturesWithComparison();
    tampered.analysis.analyses[0].rank.value = 1;
    assert.throws(
      () =>
        buildLocalReportModel(
          tampered.esiljang,
          tampered.naver,
          "2026-08-08T11:00:00.000Z",
          tampered.analysis,
        ),
      (error) =>
        error instanceof LocalReportError &&
        error.reasonCode === "comparison_integrity_mismatch",
    );
  });

  it("embeds provider text without allowing a script close-tag injection", () => {
    const { esiljang, naver } = fixtures();
    const html = renderLocalReportHtml(buildLocalReportModel(esiljang, naver));
    assert.doesNotMatch(html, /<\/script><script>alert/);
    assert.match(html, /\\u003c\/script\\u003e/);
    assert.match(html, /data-local-my-ads-report/);
    assert.match(html, /서버 연결 없음/);
    const inlineScript = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
    assert.ok(inlineScript);
    assert.doesNotThrow(() => new Script(inlineScript));
  });

  it("writes an owner-only HTML file and refuses accidental replacement", () => {
    const { esiljang, naver, analysis } = fixturesWithComparison();
    const directory = mkdtempSync(path.join(tmpdir(), "local-my-ads-test-"));
    temporaryDirectories.push(directory);
    const esiljangPath = path.join(directory, "esiljang.json");
    const naverPath = path.join(directory, "naver.json");
    const analysisPath = path.join(directory, "analysis.json");
    const outputPath = path.join(directory, "report.html");
    writeFileSync(esiljangPath, JSON.stringify(esiljang));
    writeFileSync(naverPath, JSON.stringify(naver));
    writeFileSync(analysisPath, JSON.stringify(analysis));

    const args = [
      path.join(skillRoot, "scripts", "render-report.mjs"),
      "--esiljang",
      esiljangPath,
      "--naver",
      naverPath,
      "--analysis",
      analysisPath,
      "--output",
      outputPath,
    ];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.match(readFileSync(outputPath, "utf8"), /로컬 내광고관리/);
    assert.match(readFileSync(outputPath, "utf8"), /data-report-version="2"/);
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);

    const second = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(second.status, 1);
    assert.equal(JSON.parse(second.stderr).reasonCode, "output_exists");
  });
});
