import { createHash, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  constants,
  link,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export class LocalReportError extends Error {
  constructor(reasonCode, message, errors = []) {
    super(message);
    this.name = "LocalReportError";
    this.reasonCode = reasonCode;
    this.errors = errors;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value) {
  return (
    typeof value === "string" &&
    /T\d{2}:\d{2}/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isManifestHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function textOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function comparisonManifestHash(snapshot) {
  const { manifestHash: _manifestHash, ...withoutHash } = snapshot;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(withoutHash)))
    .digest("hex");
}

function validateEsiljangSnapshot(snapshot) {
  const errors = [];
  if (!isObject(snapshot)) {
    throw new LocalReportError(
      "invalid_esiljang_snapshot",
      "Esiljang snapshot must be a JSON object.",
    );
  }
  if (snapshot.status !== "succeeded") errors.push("status must be succeeded");
  if (snapshot.provider !== "esiljang")
    errors.push("provider must be esiljang");
  if (snapshot.scope !== "active_advertisements") {
    errors.push("scope must be active_advertisements");
  }
  if (!isTimestamp(snapshot.observedAt)) {
    errors.push("observedAt must be a valid timestamp");
  }
  if (!isManifestHash(snapshot.manifestHash)) {
    errors.push("manifestHash must be a SHA-256 value");
  }
  if (!Array.isArray(snapshot.items)) errors.push("items must be an array");
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  if (
    !Number.isInteger(snapshot.collectedTotal) ||
    snapshot.collectedTotal !== items.length
  ) {
    errors.push("collectedTotal must equal items.length");
  }
  items.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`items[${index}] must be an object`);
      return;
    }
    if (!textOrNull(item.externalAdId)) {
      errors.push(`items[${index}].externalAdId is required`);
    }
    if (
      item.naverArticleNo !== null &&
      item.naverArticleNo !== undefined &&
      (typeof item.naverArticleNo !== "string" ||
        !/^\d+$/.test(item.naverArticleNo))
    ) {
      errors.push(`items[${index}].naverArticleNo must contain digits only`);
    }
  });
  if (errors.length > 0) {
    throw new LocalReportError(
      "invalid_esiljang_snapshot",
      "The Esiljang snapshot cannot be rendered.",
      errors,
    );
  }
  return items;
}

function validateNaverSnapshot(snapshot, esiljangSnapshot) {
  const errors = [];
  if (!isObject(snapshot)) {
    throw new LocalReportError(
      "invalid_naver_snapshot",
      "Naver snapshot must be a JSON object.",
    );
  }
  if (!["succeeded", "partial", "failed"].includes(snapshot.status)) {
    errors.push("status must be succeeded, partial, or failed");
  }
  if (snapshot.provider !== "naver") errors.push("provider must be naver");
  if (snapshot.scope !== "duplicate_advertisements_by_article") {
    errors.push("scope must be duplicate_advertisements_by_article");
  }
  if (!isTimestamp(snapshot.collectedAt)) {
    errors.push("collectedAt must be a valid timestamp");
  }
  if (!isObject(snapshot.source)) errors.push("source must be an object");
  if (!Array.isArray(snapshot.queries)) errors.push("queries must be an array");
  if (!Array.isArray(snapshot.failures))
    errors.push("failures must be an array");
  if (!Array.isArray(snapshot.skipped)) errors.push("skipped must be an array");
  if (!isManifestHash(snapshot.manifestHash)) {
    errors.push("manifestHash must be a SHA-256 value");
  }
  if (
    isObject(snapshot.source) &&
    snapshot.source.manifestHash !== esiljangSnapshot.manifestHash
  ) {
    errors.push("source.manifestHash does not match the Esiljang snapshot");
  }
  for (const [collectionName, values] of [
    ["queries", snapshot.queries],
    ["failures", snapshot.failures],
  ]) {
    if (!Array.isArray(values)) continue;
    values.forEach((value, index) => {
      if (!isObject(value)) {
        errors.push(`${collectionName}[${index}] must be an object`);
        return;
      }
      if (
        typeof value.naverArticleNo !== "string" ||
        !/^\d+$/.test(value.naverArticleNo)
      ) {
        errors.push(
          `${collectionName}[${index}].naverArticleNo must contain digits only`,
        );
      }
    });
  }
  if (errors.length > 0) {
    throw new LocalReportError(
      errors.some((error) => error.includes("does not match"))
        ? "snapshot_lineage_mismatch"
        : "invalid_naver_snapshot",
      "The Naver snapshot cannot be rendered.",
      errors,
    );
  }
}

function validateComparisonAnalysis(
  snapshot,
  esiljangSnapshot,
  naverSnapshot,
  items,
) {
  if (snapshot === null || snapshot === undefined) return new Map();
  const errors = [];
  if (!isObject(snapshot)) {
    throw new LocalReportError(
      "invalid_comparison_analysis",
      "Comparison analysis must be a JSON object.",
    );
  }
  if (snapshot.version !== 1) errors.push("version must be 1");
  if (!["succeeded", "partial", "failed"].includes(snapshot.status)) {
    errors.push("status must be succeeded, partial, or failed");
  }
  if (snapshot.analyzer !== "local-ad-comparison-analyzer") {
    errors.push("analyzer must be local-ad-comparison-analyzer");
  }
  if (snapshot.scope !== "esiljang_ads_against_naver_duplicate_groups") {
    errors.push("scope is invalid");
  }
  if (snapshot.policyVersion !== 1) errors.push("policyVersion must be 1");
  if (!isTimestamp(snapshot.analyzedAt)) {
    errors.push("analyzedAt must be a valid timestamp");
  }
  if (!isObject(snapshot.source?.esiljang)) {
    errors.push("source.esiljang must be an object");
  }
  if (!isObject(snapshot.source?.naver)) {
    errors.push("source.naver must be an object");
  }
  if (!Array.isArray(snapshot.analyses)) {
    errors.push("analyses must be an array");
  }
  if (!isManifestHash(snapshot.manifestHash)) {
    errors.push("manifestHash must be a SHA-256 value");
  }

  const analyses = Array.isArray(snapshot.analyses) ? snapshot.analyses : [];
  if (analyses.length !== items.length) {
    errors.push("analyses.length must equal the Esiljang item count");
  }
  const analysesByItemIndex = new Map();
  const validStates = new Set([
    "analyzed",
    "empty_response",
    "skipped_completed",
    "missing_article_no",
    "collection_failed",
    "not_collected",
    "unsupported_response_shape",
    "anchor_not_found",
  ]);
  analyses.forEach((analysis, index) => {
    if (!isObject(analysis)) {
      errors.push(`analyses[${index}] must be an object`);
      return;
    }
    if (!Number.isInteger(analysis.itemIndex)) {
      errors.push(`analyses[${index}].itemIndex must be an integer`);
      return;
    }
    if (analysesByItemIndex.has(analysis.itemIndex)) {
      errors.push(`duplicate analysis itemIndex: ${analysis.itemIndex}`);
      return;
    }
    analysesByItemIndex.set(analysis.itemIndex, analysis);
    const item = items[analysis.itemIndex];
    if (!item) {
      errors.push(`analyses[${index}].itemIndex is outside the source items`);
      return;
    }
    if (analysis.externalAdId !== item.externalAdId) {
      errors.push(
        `analyses[${index}].externalAdId does not match its source item`,
      );
    }
    if ((analysis.naverArticleNo ?? null) !== (item.naverArticleNo ?? null)) {
      errors.push(
        `analyses[${index}].naverArticleNo does not match its source item`,
      );
    }
    if (!validStates.has(analysis.state)) {
      errors.push(`analyses[${index}].state is invalid`);
    }
    if (
      analysis.rank !== null &&
      analysis.rank !== undefined &&
      (!Number.isInteger(analysis.rank.value) ||
        !Number.isInteger(analysis.rank.total) ||
        analysis.rank.value < 1 ||
        analysis.rank.value > analysis.rank.total)
    ) {
      errors.push(`analyses[${index}].rank is invalid`);
    }
  });

  if (errors.length > 0) {
    throw new LocalReportError(
      "invalid_comparison_analysis",
      "The comparison analysis cannot be rendered.",
      errors,
    );
  }
  if (
    snapshot.source.esiljang.manifestHash !== esiljangSnapshot.manifestHash ||
    snapshot.source.naver.manifestHash !== naverSnapshot.manifestHash
  ) {
    throw new LocalReportError(
      "comparison_lineage_mismatch",
      "The comparison analysis was not derived from these reader snapshots.",
    );
  }
  const calculatedHash = comparisonManifestHash(snapshot);
  if (calculatedHash !== snapshot.manifestHash.toLowerCase()) {
    throw new LocalReportError(
      "comparison_integrity_mismatch",
      "The comparison analysis manifest hash does not match its content.",
      [`expected ${snapshot.manifestHash}`, `calculated ${calculatedHash}`],
    );
  }
  return analysesByItemIndex;
}

function extractResponseRows(response) {
  if (Array.isArray(response)) return { rows: response, shape: "array" };
  if (isObject(response) && Array.isArray(response.articleList)) {
    return { rows: response.articleList, shape: "articleList" };
  }
  if (isObject(response) && Array.isArray(response.articles)) {
    return { rows: response.articles, shape: "articles" };
  }
  return { rows: [], shape: "unknown" };
}

function normalizeDuplicate(row, index, queryArticleNo) {
  const safeRow = isObject(row) ? row : { value: row };
  const articleNo = textOrNull(safeRow.articleNo);
  return {
    responseOrder: index + 1,
    articleNo,
    isQueryTarget: articleNo !== null && articleNo === queryArticleNo,
    articleName: textOrNull(safeRow.articleName),
    buildingName: textOrNull(safeRow.buildingName),
    tradeTypeName: textOrNull(safeRow.tradeTypeName),
    dealOrWarrantPrc: textOrNull(safeRow.dealOrWarrantPrc),
    areaName: textOrNull(safeRow.areaName),
    area1: numberOrNull(safeRow.area1),
    area2: numberOrNull(safeRow.area2),
    floorInfo: textOrNull(safeRow.floorInfo),
    direction: textOrNull(safeRow.direction),
    articleConfirmYmd: textOrNull(safeRow.articleConfirmYmd),
    verificationTypeCode: textOrNull(safeRow.verificationTypeCode),
    realtorName: textOrNull(safeRow.realtorName),
    realtorId: textOrNull(safeRow.realtorId),
    cpName: textOrNull(safeRow.cpName),
    featureDescription: textOrNull(safeRow.articleFeatureDesc),
    raw: safeRow,
  };
}

function normalizeObservedFloorExposure(floorInfo) {
  const raw = textOrNull(floorInfo);
  if (!raw || !raw.includes("/")) {
    return { kind: "unknown", raw };
  }
  const prefix = raw.split("/", 1)[0].trim();
  if (["저", "중", "고"].includes(prefix)) {
    return { kind: "band", raw };
  }
  if (
    /^-?\d+$/.test(prefix) ||
    /^B\d+$/i.test(prefix) ||
    /^지하\s*\d+$/.test(prefix)
  ) {
    return { kind: "exact", raw };
  }
  return { kind: "unknown", raw };
}

function observedFloorExposure(duplicates) {
  const reference = duplicates.find((duplicate) => duplicate.isQueryTarget);
  return {
    ...normalizeObservedFloorExposure(reference?.floorInfo),
    source: "naver_duplicate_query_target_floor_info",
  };
}

function normalizeSourceItem(item, itemIndex) {
  return {
    itemIndex,
    externalAdId: item.externalAdId,
    naverArticleNo: textOrNull(item.naverArticleNo),
    provider: textOrNull(item.provider) ?? "esiljang",
    providerStatus: textOrNull(item.providerStatus),
    providerUrl: textOrNull(item.providerUrl),
    fullAddress: textOrNull(item.fullAddress),
    complexName: textOrNull(item.complexName),
    dong: textOrNull(item.dong),
    floor: textOrNull(item.floor),
    ho: textOrNull(item.ho),
    transactionType: textOrNull(item.transactionType),
    propertyType: textOrNull(item.propertyType),
    unitType: textOrNull(item.unitType),
    advertisedPrice: numberOrNull(item.advertisedPrice),
    advertisedDeposit: numberOrNull(item.advertisedDeposit),
    advertisedMonthlyRent: numberOrNull(item.advertisedMonthlyRent),
    direction: textOrNull(item.direction),
    registeredAt: textOrNull(item.registeredAt),
    memo: textOrNull(item.memo),
    sourceFields: isObject(item.sourceFields) ? item.sourceFields : {},
  };
}

function comparisonStateLabel(state) {
  return {
    analyzed: "비교 완료",
    empty_response: "응답 없음",
    skipped_completed: "거래 완료",
    missing_article_no: "매물번호 없음",
    collection_failed: "수집 실패",
    not_collected: "수집 안 됨",
    unsupported_response_shape: "응답 확인 필요",
    anchor_not_found: "기준광고 없음",
  }[state];
}

function representativeAdvertisement(value) {
  return isObject(value?.advertisement) ? value.advertisement : null;
}

function compactRepresentative(value) {
  const advertisement = representativeAdvertisement(value);
  if (!advertisement) return null;
  return {
    classification: textOrNull(value.classification),
    basis: textOrNull(value.basis),
    articleNo: textOrNull(advertisement.articleNo),
    observedRank: numberOrNull(advertisement.observedRank),
    articleName: textOrNull(advertisement.articleName),
    buildingName: textOrNull(advertisement.buildingName),
    realtorName: textOrNull(advertisement.realtorName),
    cpName: textOrNull(advertisement.cpName),
    dealOrWarrantPrc: textOrNull(advertisement.price?.dealOrWarrantPrc),
    rentPrc: textOrNull(advertisement.price?.rentPrc),
    ownershipClassification: textOrNull(
      advertisement.ownership?.classification,
    ),
  };
}

function buildComparisonView(analysis, duplicates) {
  if (!analysis) return { comparison: null, duplicates };
  const representative = compactRepresentative(
    analysis.representativeAdvertisement,
  );
  const ownRepresentative = compactRepresentative(
    analysis.ownRepresentativeAdvertisement,
  );
  const leadingCompetitor = compactRepresentative(
    analysis.leadingCompetitorAdvertisement,
  );
  const competitorByArticleNo = new Map(
    (Array.isArray(analysis.competitors) ? analysis.competitors : [])
      .filter((entry) => textOrNull(entry?.advertisement?.articleNo))
      .map((entry) => [entry.advertisement.articleNo, entry]),
  );
  const otherOwnArticleNumbers = new Set(
    (Array.isArray(analysis.otherOwnAdvertisements)
      ? analysis.otherOwnAdvertisements
      : []
    )
      .map((advertisement) => textOrNull(advertisement?.articleNo))
      .filter(Boolean),
  );
  const completedOwnArticleNumbers = new Set(
    (Array.isArray(analysis.excludedCompletedOwnAdvertisements)
      ? analysis.excludedCompletedOwnAdvertisements
      : []
    )
      .map((advertisement) => textOrNull(advertisement?.articleNo))
      .filter(Boolean),
  );

  const decoratedDuplicates = duplicates.map((duplicate) => {
    const competitor = competitorByArticleNo.get(duplicate.articleNo);
    let ownership = "unclassified";
    if (duplicate.isQueryTarget) ownership = "reference";
    else if (competitor) ownership = "competitor";
    else if (completedOwnArticleNumbers.has(duplicate.articleNo)) {
      ownership = "owned_completed";
    } else if (otherOwnArticleNumbers.has(duplicate.articleNo)) {
      ownership = "owned_active";
    }
    return {
      ...duplicate,
      comparison: {
        ownership,
        isObservedRepresentative:
          representative?.articleNo === duplicate.articleNo &&
          representative?.observedRank === duplicate.responseOrder,
        isOwnRepresentative:
          ownRepresentative?.articleNo === duplicate.articleNo &&
          ownRepresentative?.observedRank === duplicate.responseOrder,
        positionRelation: textOrNull(competitor?.positionRelation),
        priceRelation: textOrNull(competitor?.priceComparison?.relation),
        priceDeltaManwon: competitor?.priceComparison?.deltaManwon ?? null,
        confirmationDateRelation: textOrNull(
          competitor?.confirmationDateRelation,
        ),
        floorDisclosureRelation: textOrNull(
          competitor?.floorDisclosureComparison?.relation,
        ),
      },
    };
  });

  return {
    comparison: {
      state: analysis.state,
      stateLabel: comparisonStateLabel(analysis.state) ?? analysis.state,
      reasonCode: textOrNull(analysis.reasonCode),
      rank: isObject(analysis.rank)
        ? {
            value: numberOrNull(analysis.rank.value),
            total: numberOrNull(analysis.rank.total),
            basis: textOrNull(analysis.rank.basis),
            collectedAt: textOrNull(analysis.rank.collectedAt),
          }
        : null,
      observedGroupSize: numberOrNull(analysis.observedGroupSize),
      reportedSameAddressCount: numberOrNull(analysis.reportedSameAddressCount),
      representative,
      ownRepresentative,
      leadingCompetitor,
      summary: isObject(analysis.comparisonSummary)
        ? analysis.comparisonSummary
        : null,
      warnings: Array.isArray(analysis.warnings) ? analysis.warnings : [],
    },
    duplicates: decoratedDuplicates,
  };
}

function statusLabel(status) {
  return {
    collected: "중복 있음",
    empty: "응답 없음",
    failed: "수집 실패",
    uncollected: "수집 안 됨",
    missingArticleNo: "매물번호 없음",
    invalidResponse: "응답 확인 필요",
    completed: "거래 완료",
  }[status];
}

export function buildLocalReportModel(
  esiljangSnapshot,
  naverSnapshot,
  generatedAt = new Date().toISOString(),
  comparisonAnalysis = null,
) {
  const items = validateEsiljangSnapshot(esiljangSnapshot);
  validateNaverSnapshot(naverSnapshot, esiljangSnapshot);
  const comparisonByItemIndex = validateComparisonAnalysis(
    comparisonAnalysis,
    esiljangSnapshot,
    naverSnapshot,
    items,
  );
  if (!isTimestamp(generatedAt)) {
    throw new LocalReportError(
      "invalid_generated_at",
      "generatedAt must be a valid timestamp.",
    );
  }

  const queriesByArticleNo = new Map(
    naverSnapshot.queries.map((query) => [query.naverArticleNo, query]),
  );
  const failuresByArticleNo = new Map(
    naverSnapshot.failures.map((failure) => [failure.naverArticleNo, failure]),
  );

  const advertisements = items.map((item, itemIndex) => {
    const source = normalizeSourceItem(item, itemIndex);
    const completed = source.providerStatus === "거래완료";
    const query = source.naverArticleNo
      ? queriesByArticleNo.get(source.naverArticleNo)
      : undefined;
    const failure = source.naverArticleNo
      ? failuresByArticleNo.get(source.naverArticleNo)
      : undefined;
    const extracted = query
      ? extractResponseRows(query.response)
      : { rows: [], shape: "missing" };
    const rawDuplicates = extracted.rows.map((row, index) =>
      normalizeDuplicate(row, index, source.naverArticleNo),
    );
    const comparisonView = buildComparisonView(
      comparisonByItemIndex.get(itemIndex),
      rawDuplicates,
    );
    const duplicates = comparisonView.duplicates;

    let collectionStatus;
    let reasonCode = null;
    if (completed) collectionStatus = "completed";
    else if (!source.naverArticleNo) {
      collectionStatus = "missingArticleNo";
      reasonCode = "missing_naver_article_no";
    } else if (failure) {
      collectionStatus = "failed";
      reasonCode = textOrNull(failure.reasonCode) ?? "collection_failed";
    } else if (!query) {
      collectionStatus = "uncollected";
      reasonCode = "not_collected";
    } else if (extracted.shape === "unknown") {
      collectionStatus = "invalidResponse";
      reasonCode = "unsupported_response_shape";
    } else if (duplicates.length === 0) collectionStatus = "empty";
    else collectionStatus = "collected";

    return {
      ...source,
      collectionStatus,
      collectionStatusLabel: statusLabel(collectionStatus),
      reasonCode,
      httpStatus: Number.isInteger(query?.httpStatus)
        ? query.httpStatus
        : Number.isInteger(failure?.httpStatus)
          ? failure.httpStatus
          : null,
      duplicateCount: duplicates.length,
      duplicates,
      observedFloorExposure: observedFloorExposure(duplicates),
      comparison: comparisonView.comparison,
    };
  });

  const counts = {
    total: advertisements.length,
    active: advertisements.filter(
      (advertisement) => advertisement.collectionStatus !== "completed",
    ).length,
    collected: advertisements.filter(
      (advertisement) => advertisement.collectionStatus === "collected",
    ).length,
    empty: advertisements.filter(
      (advertisement) => advertisement.collectionStatus === "empty",
    ).length,
    issues: advertisements.filter((advertisement) =>
      ["failed", "uncollected", "missingArticleNo", "invalidResponse"].includes(
        advertisement.collectionStatus,
      ),
    ).length,
    completed: advertisements.filter(
      (advertisement) => advertisement.collectionStatus === "completed",
    ).length,
    comparisonAnalyzed: advertisements.filter(
      (advertisement) => advertisement.comparison?.state === "analyzed",
    ).length,
    referenceLeader: advertisements.filter(
      (advertisement) => advertisement.comparison?.rank?.value === 1,
    ).length,
    competitorLeader: advertisements.filter(
      (advertisement) =>
        advertisement.comparison?.summary?.observedRepresentativeOwnership ===
        "competitor",
    ).length,
    lowerPrice: advertisements.filter(
      (advertisement) =>
        (advertisement.comparison?.summary?.priceRelations?.lower ?? 0) > 0,
    ).length,
    comparisonIssues: advertisements.filter((advertisement) =>
      [
        "missing_article_no",
        "collection_failed",
        "not_collected",
        "unsupported_response_shape",
        "anchor_not_found",
      ].includes(advertisement.comparison?.state),
    ).length,
    competitorAdvertisements: advertisements.reduce(
      (total, advertisement) =>
        total + (advertisement.comparison?.summary?.competitorCount ?? 0),
      0,
    ),
  };

  return {
    version: comparisonAnalysis ? 2 : 1,
    generatedAt,
    sourceObservedAt: esiljangSnapshot.observedAt,
    naverCollectedAt: naverSnapshot.collectedAt,
    sourceManifestHash: esiljangSnapshot.manifestHash,
    naverManifestHash: naverSnapshot.manifestHash,
    naverSnapshotStatus: naverSnapshot.status,
    comparisonAvailable: Boolean(comparisonAnalysis),
    comparisonAnalyzedAt: comparisonAnalysis?.analyzedAt ?? null,
    comparisonManifestHash: comparisonAnalysis?.manifestHash ?? null,
    comparisonStatus: comparisonAnalysis?.status ?? null,
    counts,
    advertisements,
  };
}

function safeEmbeddedJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderLocalReportHtml(model) {
  const embedded = safeEmbeddedJson(model);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>로컬 내광고관리</title>
  <style>
    :root {
      color-scheme: light;
      --canvas: #ffffff;
      --tool: #faf9f6;
      --tool-strong: #f5f4f1;
      --inset: #f7f7f5;
      --ink: #22211f;
      --ink-secondary: #5f5e5b;
      --ink-muted: #8b8984;
      --line: rgba(41, 39, 35, 0.12);
      --line-soft: rgba(41, 39, 35, 0.07);
      --focus: #3b82f6;
      --success-bg: #eef3ed;
      --success-fg: #44745a;
      --info-bg: #e7f3f8;
      --info-fg: #337ea9;
      --warning-bg: #fbf3db;
      --warning-fg: #8f6b1f;
      --danger-bg: #fdebec;
      --danger-fg: #8f4b46;
      --violet-bg: #f1edfa;
      --violet-fg: #69528f;
      --neutral-bg: #f1f1ef;
      --neutral-fg: #66645f;
      --row-height: 40px;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-synthesis: none;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { margin: 0; min-height: 100%; background: var(--canvas); color: var(--ink); }
    body { -webkit-font-smoothing: antialiased; font-size: 13px; }
    button, input, select, textarea { font: inherit; }
    button, select { cursor: pointer; }
    button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--focus) 60%, transparent);
      outline-offset: 2px;
    }
    .app { height: 100vh; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    [data-comparison-available="false"] .comparison-only { display: none !important; }
    .toolbar {
      position: sticky; top: 0; z-index: 20; display: flex; min-height: 48px;
      align-items: center; gap: 12px; padding: 8px 20px; overflow-x: auto;
      border-bottom: 1px solid var(--line); background: rgba(255,255,255,.96);
      backdrop-filter: blur(10px);
    }
    .tabs { display: flex; flex: none; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 6px; background: var(--tool-strong); }
    .tab {
      min-height: 28px; padding: 4px 9px; border: 1px solid transparent; border-radius: 4px;
      background: transparent; color: var(--ink-secondary); font-size: 12px; font-weight: 550;
      transition: background-color 140ms ease-out, border-color 140ms ease-out, color 140ms ease-out, transform 120ms ease-out;
    }
    .tab:hover { background: rgba(255,255,255,.7); color: var(--ink); }
    .tab:active { transform: scale(.97); }
    .tab[aria-selected="true"] { border-color: var(--line); background: #fff; color: var(--ink); box-shadow: 0 1px 2px rgba(31,29,26,.05); }
    .tab-count { margin-inline-start: 5px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
    .divider { width: 1px; height: 22px; flex: none; background: var(--line); }
    .search-wrap { position: relative; width: min(280px, 26vw); min-width: 190px; flex: none; }
    .search-icon { position: absolute; inset-inline-start: 9px; top: 50%; transform: translateY(-50%); color: var(--ink-muted); pointer-events: none; }
    .control {
      height: 32px; border: 1px solid transparent; border-radius: 5px; background: var(--inset);
      color: var(--ink); transition: border-color 140ms ease-out, background-color 140ms ease-out;
    }
    .control:hover { border-color: var(--line); }
    .search { width: 100%; padding-inline: 30px 10px; }
    .search::placeholder { color: var(--ink-muted); }
    select.control { min-width: 112px; padding: 0 28px 0 9px; }
    .local-badge {
      margin-inline-start: auto; display: inline-flex; flex: none; align-items: center; gap: 6px;
      height: 24px; padding: 0 8px; border-radius: 4px; background: var(--neutral-bg);
      color: var(--neutral-fg); font-size: 11px; font-weight: 600; white-space: nowrap;
    }
    .local-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--success-fg); }
    .request-basket {
      display: inline-flex; flex: none; min-height: 32px; align-items: center; gap: 6px; padding: 4px 9px;
      border: 1px solid var(--line); border-radius: 5px; background: #fff; color: var(--ink-secondary);
      font-size: 12px; font-weight: 600; white-space: nowrap;
      transition: background-color 140ms ease-out, color 140ms ease-out, transform 120ms ease-out;
    }
    .request-basket:hover { background: var(--tool); color: var(--ink); }
    .request-basket:active { transform: scale(.97); }
    .request-count {
      display: inline-flex; min-width: 19px; height: 19px; align-items: center; justify-content: center;
      padding: 0 5px; border-radius: 999px; background: var(--violet-bg); color: var(--violet-fg);
      font-size: 10px; font-variant-numeric: tabular-nums;
    }
    .meta-bar {
      display: flex; min-height: 32px; align-items: center; gap: 16px; padding: 6px 20px;
      border-bottom: 1px solid var(--line-soft); background: var(--tool); color: var(--ink-muted); font-size: 11px;
    }
    .meta-bar span { white-space: nowrap; }
    .meta-bar strong { color: var(--ink-secondary); font-weight: 600; }
    .result-summary { margin-inline-start: auto; font-variant-numeric: tabular-nums; }
    .table-shell { min-height: 0; flex: 1; overflow: auto; }
    table { width: 100%; min-width: 1440px; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
    thead { position: sticky; top: 0; z-index: 10; }
    th {
      height: 34px; padding: 0 10px; border-right: 1px solid var(--line-soft); border-bottom: 1px solid var(--line);
      background: #fbfbfa; color: var(--ink-muted); font-size: 11px; font-weight: 500; text-align: left; white-space: nowrap;
    }
    td {
      height: var(--row-height); padding: 6px 10px; border-right: 1px solid var(--line-soft);
      border-bottom: 1px solid var(--line-soft); background: #fff; vertical-align: middle;
    }
    tbody tr.data-row:hover td { background: #fbfbfa; }
    th:last-child, td:last-child { border-right: 0; }
    .address-cell { min-width: 300px; }
    .address-primary { overflow: hidden; color: var(--ink); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .address-meta { margin-top: 2px; overflow: hidden; color: var(--ink-muted); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
    .muted { color: var(--ink-muted); }
    .money { font-variant-numeric: tabular-nums; font-weight: 550; white-space: nowrap; }
    .article-no { color: var(--ink-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
    .pill {
      display: inline-flex; max-width: 100%; align-items: center; min-height: 22px; padding: 1px 6px;
      border-radius: 4px; font-size: 11px; font-weight: 550; line-height: 18px; white-space: nowrap;
    }
    .pill-sale, .pill-failed { background: var(--danger-bg); color: var(--danger-fg); }
    .pill-jeonse, .pill-collected { background: var(--info-bg); color: var(--info-fg); }
    .pill-monthly, .pill-empty, .pill-invalidResponse { background: var(--warning-bg); color: var(--warning-fg); }
    .pill-completed, .pill-uncollected, .pill-missingArticleNo, .pill-neutral, .pill-skipped_completed { background: var(--neutral-bg); color: var(--neutral-fg); }
    .pill-analyzed, .pill-reference { background: var(--success-bg); color: var(--success-fg); }
    .pill-empty_response, .pill-anchor_not_found, .pill-unsupported_response_shape { background: var(--warning-bg); color: var(--warning-fg); }
    .pill-collection_failed, .pill-not_collected, .pill-missing_article_no, .pill-lower { background: var(--danger-bg); color: var(--danger-fg); }
    .pill-representative, .pill-mixed { background: var(--violet-bg); color: var(--violet-fg); }
    .pill-floor-exact { background: var(--success-bg); color: var(--success-fg); }
    .pill-floor-band { background: var(--warning-bg); color: var(--warning-fg); }
    .rank-value { color: var(--ink); font-size: 15px; font-weight: 680; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
    .rank-value span { color: var(--ink-muted); font-size: 11px; font-weight: 500; }
    .comparison-primary { overflow: hidden; color: var(--ink); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .comparison-number { font-variant-numeric: tabular-nums; }
    .inline-pills { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .duplicate-button {
      display: inline-flex; min-height: 26px; align-items: center; gap: 5px; padding: 2px 7px;
      border: 1px solid var(--line); border-radius: 5px; background: #fff; color: var(--ink-secondary);
      font-size: 11px; font-variant-numeric: tabular-nums;
      transition: background-color 140ms ease-out, transform 120ms ease-out;
    }
    .duplicate-button:hover { background: var(--tool); color: var(--ink); }
    .duplicate-button:active { transform: scale(.97); }
    .duplicate-button[aria-expanded="true"] { background: var(--tool-strong); color: var(--ink); }
    .chevron { display: inline-block; transition: transform 160ms cubic-bezier(.23,1,.32,1); }
    .duplicate-button[aria-expanded="true"] .chevron { transform: rotate(180deg); }
    .request-button {
      min-height: 27px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 5px;
      background: #fff; color: var(--ink-secondary); font-size: 11px; font-weight: 600;
      transition: background-color 140ms ease-out, border-color 140ms ease-out, color 140ms ease-out, transform 120ms ease-out;
    }
    .request-button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--violet-fg) 30%, var(--line)); background: var(--violet-bg); color: var(--violet-fg); }
    .request-button:active:not(:disabled) { transform: scale(.97); }
    .request-button[data-requested="true"] { border-color: transparent; background: var(--success-bg); color: var(--success-fg); }
    .request-button:disabled { cursor: default; opacity: .4; }
    .detail-row td { height: auto; padding: 0; background: var(--tool); }
    .detail-panel { padding: 16px 20px 20px; border-bottom: 1px solid var(--line); }
    .detail-head { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; margin-bottom: 12px; }
    .detail-title { font-size: 12px; font-weight: 650; }
    .detail-note { color: var(--ink-muted); font-size: 10.5px; }
    .comparison-summary { display: grid; grid-template-columns: repeat(5, minmax(145px, 1fr)); gap: 10px; margin-bottom: 20px; }
    .summary-card { min-height: 72px; padding: 11px 12px; border-radius: 6px; background: #fff; box-shadow: inset 0 0 0 1px var(--line-soft); }
    .summary-label { color: var(--ink-muted); font-size: 10.5px; }
    .summary-value { margin-top: 5px; overflow: hidden; color: var(--ink); font-size: 14px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    .summary-meta { margin-top: 3px; overflow: hidden; color: var(--ink-muted); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
    .duplicate-table { min-width: 1120px; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: #fff; }
    .duplicate-table table { min-width: 1120px; }
    .duplicate-table thead { position: static; }
    .duplicate-table th { height: 30px; background: #f7f7f5; }
    .duplicate-table td { height: 36px; font-size: 11.5px; }
    .duplicate-table tr.row-reference td { background: color-mix(in srgb, var(--success-bg) 58%, white); }
    .duplicate-table tr.row-representative td:first-child { border-inline-start: 3px solid var(--violet-fg); }
    .query-mark { margin-inline-start: 5px; background: var(--success-bg); color: var(--success-fg); }
    details.raw { margin-top: 4px; }
    details.raw summary { color: var(--ink-muted); cursor: pointer; font-size: 10.5px; }
    details.raw pre {
      max-width: 520px; max-height: 260px; margin: 6px 0 0; overflow: auto; padding: 10px;
      border: 1px solid var(--line); border-radius: 5px; background: #f4f4f2; color: #3f3d39;
      font: 10.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word;
    }
    .empty-state { padding: 72px 20px; color: var(--ink-muted); text-align: center; }
    .empty-state strong { display: block; margin-bottom: 6px; color: var(--ink-secondary); font-size: 13px; }
    dialog {
      width: min(620px, calc(100vw - 32px)); max-height: min(820px, calc(100vh - 32px));
      padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 10px;
      background: #fff; color: var(--ink); box-shadow: 0 24px 70px rgba(29, 27, 24, .22);
    }
    dialog::backdrop { background: rgba(31, 29, 26, .34); backdrop-filter: blur(2px); }
    .dialog-shell { display: flex; max-height: min(820px, calc(100vh - 32px)); flex-direction: column; }
    .dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 18px 20px 14px; border-bottom: 1px solid var(--line-soft); }
    .dialog-title { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -.02em; }
    .dialog-description { margin: 5px 0 0; color: var(--ink-muted); font-size: 11px; line-height: 1.5; }
    .icon-button { width: 30px; height: 30px; flex: none; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--ink-muted); font-size: 18px; }
    .icon-button:hover { border-color: var(--line); background: var(--tool); color: var(--ink); }
    .dialog-body { overflow: auto; padding: 18px 20px; }
    .target-card { margin-bottom: 16px; padding: 12px; border: 1px solid var(--line-soft); border-radius: 7px; background: var(--tool); }
    .target-title { font-weight: 650; }
    .target-meta { margin-top: 4px; color: var(--ink-muted); font-size: 11px; }
    .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
    .field { display: grid; gap: 6px; }
    .field-full { grid-column: 1 / -1; }
    .field-label { color: var(--ink-secondary); font-size: 11px; font-weight: 600; }
    .field-control {
      width: 100%; min-height: 38px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 6px;
      background: #fff; color: var(--ink); transition: border-color 140ms ease-out, box-shadow 140ms ease-out;
    }
    .field-control:hover { border-color: color-mix(in srgb, var(--ink-muted) 45%, var(--line)); }
    textarea.field-control { min-height: 84px; resize: vertical; line-height: 1.5; }
    .field-help { min-height: 15px; color: var(--ink-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
    .republish-option {
      display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px; border: 1px solid var(--line);
      border-radius: 7px; background: #fff; cursor: pointer;
      transition: border-color 140ms ease-out, background-color 140ms ease-out;
    }
    .republish-option:hover { border-color: color-mix(in srgb, var(--violet-fg) 30%, var(--line)); background: var(--violet-bg); }
    .republish-option:has(.republish-toggle:focus-visible) { outline: 2px solid color-mix(in srgb, var(--focus) 60%, transparent); outline-offset: 2px; }
    .republish-toggle { width: 16px; height: 16px; flex: none; margin: 1px 0 0; accent-color: var(--violet-fg); }
    .republish-copy { display: grid; gap: 3px; color: var(--ink-muted); font-size: 10.5px; line-height: 1.45; }
    .republish-copy strong { color: var(--ink-secondary); font-size: 11px; font-weight: 650; }
    .request-boundary { margin-top: 16px; padding: 10px 12px; border-radius: 6px; background: var(--warning-bg); color: var(--warning-fg); font-size: 10.5px; line-height: 1.55; }
    .form-error { min-height: 18px; margin-top: 10px; color: var(--danger-fg); font-size: 11px; }
    .dialog-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--line-soft); background: var(--tool); }
    .button-secondary, .button-primary {
      min-height: 34px; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 650;
      transition: background-color 140ms ease-out, transform 120ms ease-out;
    }
    .button-secondary { border: 1px solid var(--line); background: #fff; color: var(--ink-secondary); }
    .button-primary { border: 1px solid transparent; background: var(--ink); color: #fff; }
    .button-secondary:hover { background: var(--tool-strong); color: var(--ink); }
    .button-primary:hover { background: #3a3834; }
    .button-secondary:active, .button-primary:active { transform: scale(.98); }
    .button-primary:disabled { cursor: default; opacity: .4; }
    .request-list { display: grid; gap: 9px; }
    .request-empty { padding: 46px 18px; color: var(--ink-muted); text-align: center; }
    .request-empty strong { display: block; margin-bottom: 5px; color: var(--ink-secondary); }
    .request-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 7px; }
    .request-item-title { overflow: hidden; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    .request-item-meta { margin-top: 4px; color: var(--ink-muted); font-size: 10.5px; line-height: 1.5; }
    .request-item-actions { display: flex; align-items: flex-start; gap: 5px; }
    .mini-button { min-height: 28px; padding: 3px 7px; border: 1px solid var(--line); border-radius: 5px; background: #fff; color: var(--ink-secondary); font-size: 10.5px; }
    .mini-button:hover { background: var(--tool); color: var(--ink); }
    .save-status { margin-inline-end: auto; color: var(--success-fg); font-size: 11px; }
    .footer {
      display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: 16px;
      padding: 6px 20px; border-top: 1px solid var(--line); background: #fff; color: var(--ink-muted); font-size: 11px;
    }
    .pager { display: flex; align-items: center; gap: 4px; }
    .pager button {
      min-width: 32px; height: 30px; border: 1px solid var(--line); border-radius: 5px;
      background: #fff; color: var(--ink-secondary); transition: background-color 140ms ease-out, transform 120ms ease-out;
    }
    .pager button:hover:not(:disabled) { background: var(--tool); color: var(--ink); }
    .pager button:active:not(:disabled) { transform: scale(.97); }
    .pager button:disabled { cursor: default; opacity: .38; }
    .page-label { min-width: 76px; text-align: center; font-variant-numeric: tabular-nums; }
    @media (max-width: 900px) {
      .toolbar { padding-inline: 12px; }
      .meta-bar { padding-inline: 12px; }
      .local-badge { margin-inline-start: 0; }
      .result-summary { margin-inline-start: 0; }
      .meta-bar { overflow-x: auto; }
      .comparison-summary { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
      .field-grid { grid-template-columns: 1fr; }
      .field-full { grid-column: auto; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <main class="app" data-local-my-ads-report data-report-version="${model.version}" data-comparison-available="${model.comparisonAvailable}">
    <div class="toolbar">
      <div class="tabs" role="tablist" aria-label="광고 비교 상태">
        <button class="tab" type="button" role="tab" data-tab="active" aria-selected="true">광고중 <span class="tab-count" data-count="active"></span></button>
        <button class="tab comparison-only" type="button" role="tab" data-tab="analyzed" aria-selected="false">비교 완료 <span class="tab-count" data-count="comparisonAnalyzed"></span></button>
        <button class="tab comparison-only" type="button" role="tab" data-tab="leader" aria-selected="false">내 광고 1위 <span class="tab-count" data-count="referenceLeader"></span></button>
        <button class="tab comparison-only" type="button" role="tab" data-tab="competitorLeader" aria-selected="false">경쟁 대표 <span class="tab-count" data-count="competitorLeader"></span></button>
        <button class="tab comparison-only" type="button" role="tab" data-tab="lowerPrice" aria-selected="false">저가 경쟁 <span class="tab-count" data-count="lowerPrice"></span></button>
        <button class="tab" type="button" role="tab" data-tab="empty" aria-selected="false">응답 없음 <span class="tab-count" data-count="empty"></span></button>
        <button class="tab" type="button" role="tab" data-tab="issues" aria-selected="false">확인 필요 <span class="tab-count" data-count="issues"></span></button>
        <button class="tab" type="button" role="tab" data-tab="completed" aria-selected="false">거래 완료 <span class="tab-count" data-count="completed"></span></button>
      </div>
      <div class="divider" aria-hidden="true"></div>
      <label class="search-wrap">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input id="search" class="control search" type="search" autocomplete="off" placeholder="주소·광고번호·대표 중개사 검색" aria-label="내 광고 검색">
      </label>
      <select id="transaction-filter" class="control" aria-label="거래유형 필터">
        <option value="all">거래 전체</option>
        <option value="매매">매매</option>
        <option value="전세">전세</option>
        <option value="월세">월세</option>
        <option value="단기">단기</option>
      </select>
      <button id="open-request-basket" class="request-basket" type="button" aria-haspopup="dialog">
        광고 요청 <span id="request-count" class="request-count">0</span>
      </button>
      <span class="local-badge"><span class="local-dot" aria-hidden="true"></span>로컬 JSON · 광고업무 작성</span>
    </div>
    <div class="meta-bar">
      <span>이실장 기준 <strong id="source-time"></strong></span>
      <span>네이버 수집 <strong id="naver-time"></strong></span>
      <span class="comparison-only">비교 분석 <strong id="comparison-time"></strong></span>
      <span class="comparison-only"><strong data-count="competitorAdvertisements"></strong>개 경쟁광고</span>
      <span>서버 연결 없음</span>
      <span class="result-summary" id="result-summary" aria-live="polite"></span>
    </div>
    <section class="table-shell" aria-label="내 광고 목록">
      <table id="ads-table" aria-describedby="result-summary">
        <colgroup>
          <col style="width: 22%"><col style="width: 5%"><col style="width: 9%"><col style="width: 8%"><col style="width: 7%">
          <col style="width: 14%"><col style="width: 10%"><col style="width: 8%"><col style="width: 8%"><col style="width: 9%">
        </colgroup>
        <thead><tr>
          <th scope="col">광고 소재지</th><th scope="col">거래</th><th scope="col">광고가</th><th scope="col">층 노출</th><th scope="col">응답 순위</th>
          <th scope="col">응답 대표광고</th><th scope="col">경쟁광고</th><th scope="col">더 싼 광고</th><th scope="col">광고 요청</th><th scope="col">상태</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
      <div id="empty-state" class="empty-state" hidden><strong>표시할 광고가 없습니다.</strong><span>검색어나 필터를 확인해 주세요.</span></div>
    </section>
    <footer class="footer">
      <span id="footer-count"></span>
      <nav class="pager" aria-label="페이지 이동">
        <button id="previous-page" type="button" aria-label="이전 페이지">‹</button>
        <span id="page-label" class="page-label"></span>
        <button id="next-page" type="button" aria-label="다음 페이지">›</button>
      </nav>
    </footer>
    <dialog id="request-dialog" aria-labelledby="request-dialog-title" aria-describedby="request-dialog-description">
      <form id="request-form" class="dialog-shell" novalidate>
        <header class="dialog-head">
          <div>
            <h2 id="request-dialog-title" class="dialog-title">광고업무 만들기</h2>
            <p id="request-dialog-description" class="dialog-description">요청할 최종 조건과 저장 후 재광고 여부를 편집해 로컬 보관함에 담습니다.</p>
          </div>
          <button class="icon-button" type="button" data-close-dialog="request-dialog" aria-label="광고업무 요청 닫기">×</button>
        </header>
        <div class="dialog-body">
          <div class="target-card">
            <div id="request-target-title" class="target-title"></div>
            <div id="request-target-meta" class="target-meta"></div>
          </div>
          <div class="field-grid">
            <label class="field" data-price-field="advertisedPrice">
              <span class="field-label">새 매매가 (만원)</span>
              <input id="request-advertised-price" class="field-control" type="number" min="0" step="1" inputmode="numeric">
              <span id="request-advertised-price-help" class="field-help"></span>
            </label>
            <label class="field" data-price-field="advertisedDeposit">
              <span class="field-label">새 보증금 (만원)</span>
              <input id="request-advertised-deposit" class="field-control" type="number" min="0" step="1" inputmode="numeric">
              <span id="request-advertised-deposit-help" class="field-help"></span>
            </label>
            <label class="field" data-price-field="advertisedMonthlyRent">
              <span class="field-label">새 월세 (만원)</span>
              <input id="request-advertised-monthly-rent" class="field-control" type="number" min="0" step="1" inputmode="numeric">
              <span id="request-advertised-monthly-rent-help" class="field-help"></span>
            </label>
            <label class="field">
              <span class="field-label">층 노출 변경</span>
              <select id="request-floor-exposure" class="field-control">
                <option value="unchanged">변경 안 함</option>
                <option value="exact">상세 층 노출 요청</option>
                <option value="band">저·중·고 구간 노출 요청</option>
              </select>
              <span id="request-floor-help" class="field-help"></span>
            </label>
            <label class="republish-option field-full">
              <input id="request-republish-after-save" class="republish-toggle" type="checkbox" checked>
              <span class="republish-copy">
                <strong>저장 후 재광고</strong>
                <span>입력한 최종 조건을 확인한 뒤 기존 이실장 광고의 재광고 흐름을 요청합니다. 조건이 같아도 재광고만 요청할 수 있습니다.</span>
              </span>
            </label>
            <label class="field field-full">
              <span class="field-label">요청 메모 (선택)</span>
              <textarea id="request-note" class="field-control" maxlength="500" placeholder="예: 동일 호실 최저가와 맞추고 오늘자로 재광고"></textarea>
              <span class="field-help">비밀번호·쿠키·인증번호는 입력하지 마세요.</span>
            </label>
          </div>
          <div class="request-boundary">이 화면은 CP를 직접 수정하지 않습니다. 저장한 JSON은 실행 지시의 초안이며, Codex 또는 Claude가 대상과 최종 값을 다시 확인한 뒤 별도 스킬로 실행해야 합니다.</div>
          <div id="request-error" class="form-error" role="alert" aria-live="polite"></div>
        </div>
        <footer class="dialog-actions">
          <button class="button-secondary" type="button" data-close-dialog="request-dialog">취소</button>
          <button class="button-primary" type="submit">요청 담기</button>
        </footer>
      </form>
    </dialog>
    <dialog id="request-basket-dialog" aria-labelledby="request-basket-title" aria-describedby="request-basket-description">
      <div class="dialog-shell">
        <header class="dialog-head">
          <div>
            <h2 id="request-basket-title" class="dialog-title">광고 요청 보관함</h2>
            <p id="request-basket-description" class="dialog-description">담아둔 조건 변경·재광고 요청을 검토한 뒤 하나의 JSON 파일로 저장합니다.</p>
          </div>
          <button class="icon-button" type="button" data-close-dialog="request-basket-dialog" aria-label="요청 보관함 닫기">×</button>
        </header>
        <div class="dialog-body">
          <div id="request-list" class="request-list"></div>
        </div>
        <footer class="dialog-actions">
          <span id="request-save-status" class="save-status" role="status" aria-live="polite"></span>
          <button class="button-secondary" type="button" data-close-dialog="request-basket-dialog">닫기</button>
          <button id="save-request-json" class="button-primary" type="button">요청 JSON 저장</button>
        </footer>
      </div>
    </dialog>
  </main>
  <script>
    "use strict";
    const REPORT = ${embedded};
    const PAGE_SIZE = 30;
    const ISSUE_STATES = new Set(["failed", "uncollected", "missingArticleNo", "invalidResponse"]);
    const COMPARISON_ISSUE_STATES = new Set(["missing_article_no", "collection_failed", "not_collected", "unsupported_response_shape", "anchor_not_found"]);
    const state = {
      tab: "active",
      search: "",
      transaction: "all",
      page: 1,
      expandedId: null,
      editingItemIndex: null,
      requests: new Map(),
    };

    const rowsElement = document.getElementById("rows");
    const emptyElement = document.getElementById("empty-state");
    const resultSummary = document.getElementById("result-summary");
    const footerCount = document.getElementById("footer-count");
    const pageLabel = document.getElementById("page-label");
    const previousPage = document.getElementById("previous-page");
    const nextPage = document.getElementById("next-page");
    const requestDialog = document.getElementById("request-dialog");
    const requestForm = document.getElementById("request-form");
    const requestBasketDialog = document.getElementById("request-basket-dialog");
    const requestList = document.getElementById("request-list");
    const requestCount = document.getElementById("request-count");
    const requestSaveStatus = document.getElementById("request-save-status");
    const saveRequestJson = document.getElementById("save-request-json");
    const requestError = document.getElementById("request-error");
    const requestRepublishAfterSave = document.getElementById("request-republish-after-save");
    const requestInputs = {
      advertisedPrice: document.getElementById("request-advertised-price"),
      advertisedDeposit: document.getElementById("request-advertised-deposit"),
      advertisedMonthlyRent: document.getElementById("request-advertised-monthly-rent"),
    };
    const requestInputHelp = {
      advertisedPrice: document.getElementById("request-advertised-price-help"),
      advertisedDeposit: document.getElementById("request-advertised-deposit-help"),
      advertisedMonthlyRent: document.getElementById("request-advertised-monthly-rent-help"),
    };

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
    function formatDateTime(value) {
      if (!value) return "-";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      }).format(date);
    }
    function formatYmd(value) {
      if (!value || !/^\\d{8}$/.test(value)) return value || "-";
      return value.slice(0,4) + "." + value.slice(4,6) + "." + value.slice(6,8);
    }
    function formatMoney(value) {
      if (value === null || value === undefined) return "-";
      const amount = Number(value);
      if (!Number.isFinite(amount)) return "-";
      const eok = Math.floor(amount / 10000);
      const remainder = amount % 10000;
      if (eok > 0 && remainder > 0) return eok.toLocaleString("ko-KR") + "억 " + remainder.toLocaleString("ko-KR");
      if (eok > 0) return eok.toLocaleString("ko-KR") + "억";
      return amount.toLocaleString("ko-KR") + "만";
    }
    function advertisedPrice(advertisement) {
      const rentLike = advertisement.transactionType === "월세" || advertisement.transactionType === "단기";
      const primary = advertisement.transactionType === "전세" || rentLike
        ? advertisement.advertisedDeposit
        : advertisement.advertisedPrice;
      if (rentLike) {
        return formatMoney(primary) + " / " + formatMoney(advertisement.advertisedMonthlyRent);
      }
      return formatMoney(primary);
    }
    function naverPrice(duplicate) {
      const primary = duplicate.dealOrWarrantPrc || "-";
      return duplicate.tradeTypeName === "월세" && duplicate.raw?.rentPrc
        ? primary + " / " + duplicate.raw.rentPrc
        : primary;
    }
    function transactionClass(value) {
      if (value === "매매") return "pill-sale";
      if (value === "전세") return "pill-jeonse";
      if (value === "월세" || value === "단기") return "pill-monthly";
      return "pill-neutral";
    }
    function floorExposureLabel(kind) {
      return {
        exact: "상세층 노출",
        band: "구간만 노출",
        unknown: "확인 불가",
      }[kind] || "확인 불가";
    }
    function floorExposureCell(advertisement) {
      const floor = advertisement.observedFloorExposure || { kind: "unknown", raw: null };
      const floorClass = floor.kind === "exact"
        ? "pill-floor-exact"
        : floor.kind === "band"
          ? "pill-floor-band"
          : "pill-neutral";
      const moreSpecific = advertisement.comparison?.summary?.competitorMoreSpecificFloorCount || 0;
      const meta = [floor.raw || "네이버 관측값 없음", moreSpecific > 0 ? "더 상세 경쟁 " + moreSpecific : null]
        .filter(Boolean)
        .join(" · ");
      return '<span class="pill ' + floorClass + '">' + escapeHtml(floorExposureLabel(floor.kind)) +
        '</span><div class="address-meta">' + escapeHtml(meta) + '</div>';
    }
    function searchableText(advertisement) {
      return [
        advertisement.fullAddress, advertisement.complexName, advertisement.externalAdId,
        advertisement.naverArticleNo, advertisement.transactionType, advertisement.propertyType,
        advertisement.comparison?.representative?.articleNo,
        advertisement.comparison?.representative?.realtorName,
        advertisement.comparison?.leadingCompetitor?.articleNo,
        advertisement.comparison?.leadingCompetitor?.realtorName,
        ...advertisement.duplicates.flatMap((duplicate) => [
          duplicate.articleNo, duplicate.articleName, duplicate.buildingName,
          duplicate.realtorName, duplicate.realtorId, duplicate.cpName,
        ]),
      ].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
    }
    function matchesTab(advertisement) {
      if (state.tab === "active") return advertisement.collectionStatus !== "completed";
      if (state.tab === "analyzed") return advertisement.comparison?.state === "analyzed";
      if (state.tab === "leader") return advertisement.comparison?.rank?.value === 1;
      if (state.tab === "competitorLeader") {
        return advertisement.comparison?.summary?.observedRepresentativeOwnership === "competitor";
      }
      if (state.tab === "lowerPrice") {
        return (advertisement.comparison?.summary?.priceRelations?.lower || 0) > 0;
      }
      if (state.tab === "issues") {
        return ISSUE_STATES.has(advertisement.collectionStatus) ||
          COMPARISON_ISSUE_STATES.has(advertisement.comparison?.state);
      }
      return advertisement.collectionStatus === state.tab;
    }
    function filteredRows() {
      const needle = state.search.trim().toLocaleLowerCase("ko-KR");
      return REPORT.advertisements.filter((advertisement) =>
        matchesTab(advertisement) &&
        (state.transaction === "all" || advertisement.transactionType === state.transaction) &&
        (!needle || searchableText(advertisement).includes(needle))
      );
    }
    function priceRelationLabel(value) {
      return {
        lower: "더 낮음",
        same: "같음",
        higher: "더 높음",
        mixed: "조건 혼합",
        unknown: "확인 불가",
      }[value] || "-";
    }
    function confirmationRelationLabel(value) {
      return {
        newer: "더 최근",
        same_date: "같은 날",
        older: "더 이전",
        unknown: "비교 불가",
      }[value] || "";
    }
    function floorDisclosureRelationLabel(value) {
      return {
        competitor_more_specific: "경쟁광고가 더 상세",
        own_more_specific: "내 광고가 더 상세",
        same_specificity: "같은 노출 수준",
        unknown: "비교 불가",
      }[value] || "";
    }
    function roleBadges(duplicate) {
      const badges = [];
      if (duplicate.isQueryTarget) badges.push('<span class="pill pill-reference">내 기준</span>');
      if (duplicate.comparison?.isObservedRepresentative) badges.push('<span class="pill pill-representative">응답 대표</span>');
      if (duplicate.comparison?.isOwnRepresentative && !duplicate.isQueryTarget) badges.push('<span class="pill pill-analyzed">내 대표</span>');
      if (duplicate.comparison?.ownership === "competitor") badges.push('<span class="pill pill-neutral">경쟁</span>');
      if (duplicate.comparison?.ownership === "owned_completed") badges.push('<span class="pill pill-completed">완료 광고</span>');
      return badges.join("");
    }
    function duplicateRowClass(duplicate) {
      const names = [];
      if (duplicate.isQueryTarget) names.push("row-reference");
      if (duplicate.comparison?.isObservedRepresentative) names.push("row-representative");
      return names.join(" ");
    }
    function comparisonOverview(advertisement) {
      const comparison = advertisement.comparison;
      if (!comparison) {
        return '<div class="comparison-summary"><div class="summary-card"><div class="summary-label">비교 분석</div><div class="summary-value">연결되지 않음</div><div class="summary-meta">--analysis 입력이 필요합니다.</div></div></div>';
      }
      if (comparison.state !== "analyzed") {
        return '<div class="comparison-summary"><div class="summary-card"><div class="summary-label">비교 상태</div><div class="summary-value">' +
          escapeHtml(comparison.stateLabel) + '</div><div class="summary-meta">' +
          escapeHtml(comparison.reasonCode || advertisement.collectionStatusLabel) + '</div></div></div>';
      }
      const summary = comparison.summary || {};
      const prices = summary.priceRelations || {};
      const representative = comparison.representative;
      const representativeType = summary.observedRepresentativeOwnership === "competitor" ? "경쟁광고" : "내 광고";
      const floor = advertisement.observedFloorExposure || { kind: "unknown", raw: null };
      return '<div class="comparison-summary">' +
        '<div class="summary-card"><div class="summary-label">내 광고 응답 순위</div><div class="summary-value">' +
          escapeHtml(comparison.rank.value + " / " + comparison.rank.total) + '</div><div class="summary-meta">수집 응답 배열 기준</div></div>' +
        '<div class="summary-card"><div class="summary-label">응답 대표광고</div><div class="summary-value">' +
          escapeHtml(representativeType) + '</div><div class="summary-meta">' +
          escapeHtml(representative?.realtorName || representative?.articleNo || "-") + '</div></div>' +
        '<div class="summary-card"><div class="summary-label">앞선 경쟁광고</div><div class="summary-value">' +
          escapeHtml((summary.aheadCompetitorCount || 0).toLocaleString("ko-KR") + "건") + '</div><div class="summary-meta">전체 경쟁 ' +
          escapeHtml((summary.competitorCount || 0).toLocaleString("ko-KR")) + '건</div></div>' +
        '<div class="summary-card"><div class="summary-label">더 낮은 가격</div><div class="summary-value">' +
          escapeHtml((prices.lower || 0).toLocaleString("ko-KR") + "건") + '</div><div class="summary-meta">같음 ' +
          escapeHtml((prices.same || 0).toLocaleString("ko-KR")) + ' · 혼합 ' +
          escapeHtml((prices.mixed || 0).toLocaleString("ko-KR")) + '</div></div>' +
        '<div class="summary-card"><div class="summary-label">내 광고 층 노출</div><div class="summary-value">' +
          escapeHtml(floorExposureLabel(floor.kind)) + '</div><div class="summary-meta">' +
          escapeHtml((floor.raw || "관측값 없음") + ' · 더 상세 경쟁 ' + (summary.competitorMoreSpecificFloorCount || 0).toLocaleString("ko-KR")) + '</div></div>' +
      '</div>';
    }
    function duplicateRows(advertisement) {
      const overview = comparisonOverview(advertisement);
      if (advertisement.duplicates.length === 0) {
        return overview + '<div class="empty-state"><strong>저장된 중복광고 행이 없습니다.</strong><span>' +
          escapeHtml(advertisement.collectionStatusLabel) + '</span></div>';
      }
      const body = advertisement.duplicates.map((duplicate) => {
        const raw = escapeHtml(JSON.stringify(duplicate.raw, null, 2));
        const area = [duplicate.areaName, duplicate.area2 != null ? duplicate.area2 + "㎡" : null].filter(Boolean).join(" · ") || "-";
        const relation = duplicate.isQueryTarget ? "reference" : duplicate.comparison?.priceRelation;
        const relationText = duplicate.isQueryTarget ? "비교 기준" : priceRelationLabel(relation);
        const relationClass = relation === "lower" ? "pill-lower" : relation === "mixed" ? "pill-mixed" : "pill-neutral";
        const positionText = duplicate.comparison?.positionRelation === "ahead" ? "내 광고보다 앞" : duplicate.comparison?.positionRelation === "behind" ? "내 광고보다 뒤" : "";
        const confirmText = confirmationRelationLabel(duplicate.comparison?.confirmationDateRelation);
        const floorText = duplicate.isQueryTarget
          ? floorExposureLabel(advertisement.observedFloorExposure?.kind)
          : floorDisclosureRelationLabel(duplicate.comparison?.floorDisclosureRelation);
        return '<tr class="' + duplicateRowClass(duplicate) + '">' +
          '<td><strong class="comparison-number">' + duplicate.responseOrder + '</strong><div class="address-meta">' + escapeHtml(positionText) + '</div></td>' +
          '<td><div class="inline-pills">' + roleBadges(duplicate) + '</div></td>' +
          '<td><strong>' + escapeHtml(duplicate.articleName || "-") + '</strong><div class="address-meta">' + escapeHtml(duplicate.articleNo || "번호 없음") + '</div></td>' +
          '<td>' + escapeHtml(duplicate.buildingName || "-") + '<div class="address-meta">' + escapeHtml(area) + '</div></td>' +
          '<td>' + escapeHtml(duplicate.floorInfo || "-") + '<div class="address-meta">' + escapeHtml(floorText) + '</div></td>' +
          '<td class="money">' + escapeHtml(naverPrice(duplicate)) + '</td>' +
          '<td><span class="pill ' + relationClass + '">' + escapeHtml(relationText) + '</span></td>' +
          '<td>' + escapeHtml(duplicate.realtorName || "-") + '<div class="address-meta">' + escapeHtml(duplicate.cpName || "") + '</div></td>' +
          '<td>' + escapeHtml(formatYmd(duplicate.articleConfirmYmd)) + '<div class="address-meta">' + escapeHtml(confirmText) + '</div>' +
            '<details class="raw"><summary>원본 JSON</summary><pre>' + raw + '</pre></details></td>' +
        '</tr>';
      }).join("");
      return '<div class="detail-head"><div class="detail-title">순위 및 경쟁광고 비교 · 응답 ' + advertisement.duplicateCount.toLocaleString("ko-KR") + '건</div>' +
        '<div class="detail-note">순위는 저장된 중복응답 배열 위치입니다. 응답 대표는 첫 행 기준이며 네이버 공식 지정으로 주장하지 않습니다.</div></div>' +
        overview +
        '<div class="duplicate-table"><table><colgroup><col style="width:6%"><col style="width:13%"><col style="width:18%"><col style="width:11%"><col style="width:7%"><col style="width:12%"><col style="width:10%"><col style="width:15%"><col style="width:8%"></colgroup>' +
        '<thead><tr><th>순위</th><th>구분</th><th>광고</th><th>동·면적</th><th>층</th><th>가격</th><th>가격 비교</th><th>중개사</th><th>확인일</th></tr></thead><tbody>' + body + '</tbody></table></div>';
    }
    function rankCell(advertisement) {
      const rank = advertisement.comparison?.rank;
      if (!rank) return '<span class="muted">-</span><div class="address-meta">' + escapeHtml(advertisement.comparison?.stateLabel || "분석 없음") + '</div>';
      return '<div class="rank-value">' + rank.value + ' <span>/ ' + rank.total + '</span></div><div class="address-meta">응답 순위</div>';
    }
    function representativeCell(advertisement) {
      const comparison = advertisement.comparison;
      const representative = comparison?.representative;
      if (!representative) return '<span class="muted">-</span><div class="address-meta">대표광고 없음</div>';
      const competitor = comparison.summary?.observedRepresentativeOwnership === "competitor";
      const label = competitor ? "경쟁광고" : "내 광고";
      return '<div class="inline-pills"><span class="pill ' + (competitor ? "pill-representative" : "pill-reference") + '">' + label + '</span></div>' +
        '<div class="comparison-primary" title="' + escapeHtml(representative.realtorName || representative.articleName || "-") + '">' +
        escapeHtml(representative.realtorName || representative.articleName || "-") + '</div><div class="address-meta">' +
        escapeHtml(representative.articleNo || "-") + '</div>';
    }
    function priceComparisonCell(advertisement) {
      const prices = advertisement.comparison?.summary?.priceRelations;
      if (!prices) return '<span class="muted">-</span>';
      if ((prices.lower || 0) > 0) {
        return '<span class="pill pill-lower">있음 ' + prices.lower.toLocaleString("ko-KR") + '건</span><div class="address-meta">내 광고보다 저렴</div>';
      }
      if ((prices.mixed || 0) > 0) {
        return '<span class="pill pill-mixed">조건 비교</span><div class="address-meta">단순 환산 안 함</div>';
      }
      return '<span class="pill pill-neutral">없음</span><div class="address-meta">같음 ' + (prices.same || 0).toLocaleString("ko-KR") + '</div>';
    }
    function priceFieldsFor(advertisement) {
      if (advertisement.transactionType === "매매") return ["advertisedPrice"];
      if (advertisement.transactionType === "전세") return ["advertisedDeposit"];
      if (advertisement.transactionType === "월세" || advertisement.transactionType === "단기") {
        return ["advertisedDeposit", "advertisedMonthlyRent"];
      }
      return ["advertisedPrice", "advertisedDeposit", "advertisedMonthlyRent"].filter(
        (field) => advertisement[field] !== null && advertisement[field] !== undefined,
      );
    }
    function priceFieldLabel(field) {
      return {
        advertisedPrice: "매매가",
        advertisedDeposit: "보증금",
        advertisedMonthlyRent: "월세",
      }[field] || field;
    }
    function createRequestId() {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      return "request-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    }
    function findAdvertisement(itemIndex) {
      return REPORT.advertisements.find((advertisement) => advertisement.itemIndex === itemIndex) || null;
    }
    function setPriceFieldVisibility(advertisement) {
      const activeFields = new Set(priceFieldsFor(advertisement));
      document.querySelectorAll("[data-price-field]").forEach((wrapper) => {
        const field = wrapper.dataset.priceField;
        const active = activeFields.has(field);
        wrapper.hidden = !active;
        requestInputs[field].disabled = !active;
        requestInputs[field].required = active;
      });
    }
    function updatePriceInputHelp(advertisement, field) {
      const current = advertisement[field];
      const raw = requestInputs[field].value;
      const entered = raw === "" ? null : Number(raw);
      requestInputHelp[field].textContent = "현재 " + formatMoney(current) +
        (Number.isFinite(entered) ? " · 입력 " + formatMoney(entered) : "");
    }
    function openRequestDialog(itemIndex) {
      const advertisement = findAdvertisement(itemIndex);
      if (!advertisement || advertisement.collectionStatus === "completed") return;
      const existing = state.requests.get(itemIndex);
      state.editingItemIndex = itemIndex;
      requestForm.reset();
      requestError.textContent = "";
      document.getElementById("request-target-title").textContent =
        advertisement.fullAddress || advertisement.complexName || "주소 미확인";
      document.getElementById("request-target-meta").textContent = [
        advertisement.transactionType,
        "현재 " + advertisedPrice(advertisement),
        "이실장 #" + advertisement.externalAdId,
        advertisement.naverArticleNo ? "네이버 #" + advertisement.naverArticleNo : null,
      ].filter(Boolean).join(" · ");
      setPriceFieldVisibility(advertisement);
      for (const field of Object.keys(requestInputs)) {
        const value = existing?.desired?.[field] ?? advertisement[field];
        requestInputs[field].value = value === null || value === undefined ? "" : String(value);
        updatePriceInputHelp(advertisement, field);
      }
      const floor = advertisement.observedFloorExposure || { kind: "unknown", raw: null };
      document.getElementById("request-floor-exposure").value =
        existing?.desired?.floorExposureMode || "unchanged";
      document.getElementById("request-floor-help").textContent =
        "현재 네이버 관측: " + floorExposureLabel(floor.kind) + (floor.raw ? " (" + floor.raw + ")" : "");
      requestRepublishAfterSave.checked = existing
        ? existing.desired?.republishAfterSave === true
        : true;
      document.getElementById("request-note").value = existing?.userNote || "";
      requestDialog.showModal();
      const firstField = priceFieldsFor(advertisement)[0];
      requestAnimationFrame(() => requestInputs[firstField]?.focus());
    }
    function parsePriceInput(field) {
      const raw = requestInputs[field].value.trim();
      if (!raw) return null;
      const value = Number(raw);
      return Number.isInteger(value) && value >= 0 ? value : null;
    }
    function buildModificationRequest(advertisement) {
      const activeFields = priceFieldsFor(advertisement);
      const changes = [];
      const desired = {
        activeState: "active",
        advertisedPrice: advertisement.advertisedPrice,
        advertisedDeposit: advertisement.advertisedDeposit,
        advertisedMonthlyRent: advertisement.advertisedMonthlyRent,
        floorExposureMode: null,
        republishAfterSave: requestRepublishAfterSave.checked,
      };
      for (const field of activeFields) {
        const after = parsePriceInput(field);
        if (after === null) {
          throw new Error(priceFieldLabel(field) + "를 0 이상의 만원 단위 정수로 입력해 주세요.");
        }
        const before = advertisement[field];
        desired[field] = after;
        if (after !== before) {
          changes.push({ field, before, after, unit: "manwon" });
        }
      }
      const floorSelection = document.getElementById("request-floor-exposure").value;
      if (floorSelection !== "unchanged") {
        desired.floorExposureMode = floorSelection;
        changes.push({
          field: "floorExposureMode",
          beforeObserved: advertisement.observedFloorExposure?.kind || "unknown",
          after: floorSelection,
          basis: "naver_duplicate_query_target_floor_info",
        });
      }
      const hasConditionChanges = changes.length > 0;
      if (desired.republishAfterSave) {
        changes.push({
          field: "republishAfterSave",
          after: true,
          executionMode: "existing_advertisement_republish_flow",
        });
      }
      if (changes.length === 0) {
        throw new Error("현재 값과 다른 조건을 입력하거나 저장 후 재광고를 선택해 주세요.");
      }
      const now = new Date().toISOString();
      const existing = state.requests.get(advertisement.itemIndex);
      const summary = advertisement.comparison?.summary || {};
      const action = desired.republishAfterSave
        ? hasConditionChanges
          ? "modify_and_republish_advertisement"
          : "republish_advertisement"
        : "modify_advertisement";
      return {
        requestId: existing?.requestId || createRequestId(),
        status: "pending_conversation_confirmation",
        action,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        target: {
          provider: advertisement.provider,
          externalAdId: advertisement.externalAdId,
          naverArticleNo: advertisement.naverArticleNo,
          providerUrl: advertisement.providerUrl,
          fullAddress: advertisement.fullAddress,
          transactionType: advertisement.transactionType,
        },
        observed: {
          observedAt: REPORT.sourceObservedAt,
          providerStatus: advertisement.providerStatus,
          advertisedPrice: advertisement.advertisedPrice,
          advertisedDeposit: advertisement.advertisedDeposit,
          advertisedMonthlyRent: advertisement.advertisedMonthlyRent,
          floorExposure: advertisement.observedFloorExposure,
        },
        desired,
        changes,
        comparisonContext: {
          state: advertisement.comparison?.state || null,
          rank: advertisement.comparison?.rank || null,
          lowerPricedCompetitorCount: summary.priceRelations?.lower || 0,
          competitorMoreSpecificFloorCount: summary.competitorMoreSpecificFloorCount || 0,
          observedRepresentativeArticleNo: advertisement.comparison?.representative?.articleNo || null,
        },
        userNote: document.getElementById("request-note").value.trim() || null,
        executionPolicy: {
          directExecutionAuthorized: false,
          requiresCurrentConversationConfirmation: true,
          verifyLiveProviderStateBeforeWrite: true,
          republishExistingAdvertisementOnly: true,
          prohibitManualEndAndRecreate: true,
        },
      };
    }
    function changeSummary(request) {
      return request.changes.map((change) => {
        if (change.field === "floorExposureMode") {
          return "층 노출 → " + floorExposureLabel(change.after);
        }
        if (change.field === "republishAfterSave") {
          return "저장 후 재광고";
        }
        return priceFieldLabel(change.field) + " " + formatMoney(change.before) + " → " + formatMoney(change.after);
      }).join(" · ");
    }
    function renderRequestBasket() {
      const requests = Array.from(state.requests.entries());
      requestCount.textContent = requests.length.toLocaleString("ko-KR");
      saveRequestJson.disabled = requests.length === 0;
      if (requests.length === 0) {
        requestList.innerHTML = '<div class="request-empty"><strong>담긴 광고 요청이 없습니다.</strong><span>광고 목록에서 광고 요청을 선택해 주세요.</span></div>';
        return;
      }
      requestList.innerHTML = requests.map(([itemIndex, request]) =>
        '<article class="request-item">' +
          '<div><div class="request-item-title">' + escapeHtml(request.target.fullAddress || request.target.externalAdId) + '</div>' +
          '<div class="request-item-meta">' + escapeHtml(changeSummary(request)) + '<br>이실장 #' + escapeHtml(request.target.externalAdId) + '</div></div>' +
          '<div class="request-item-actions">' +
            '<button class="mini-button" type="button" data-edit-request="' + itemIndex + '">수정</button>' +
            '<button class="mini-button" type="button" data-remove-request="' + itemIndex + '">삭제</button>' +
          '</div>' +
        '</article>'
      ).join("");
    }
    function requestButtonCell(advertisement) {
      if (advertisement.collectionStatus === "completed") {
        return '<button class="request-button" type="button" disabled>요청 불가</button>';
      }
      const requested = state.requests.has(advertisement.itemIndex);
      return '<button class="request-button" type="button" data-request-item="' + advertisement.itemIndex +
        '" data-requested="' + requested + '">' + (requested ? "요청 담김" : "업무 만들기") + '</button>';
    }
    function requestBundle() {
      return {
        version: 2,
        kind: "local_advertisement_request_bundle",
        createdAt: new Date().toISOString(),
        createdBy: "local-my-ads-viewer",
        source: {
          report: { version: REPORT.version, generatedAt: REPORT.generatedAt },
          esiljang: { manifestHash: REPORT.sourceManifestHash, observedAt: REPORT.sourceObservedAt },
          naver: { manifestHash: REPORT.naverManifestHash, collectedAt: REPORT.naverCollectedAt },
          comparison: REPORT.comparisonAvailable
            ? { manifestHash: REPORT.comparisonManifestHash, analyzedAt: REPORT.comparisonAnalyzedAt }
            : null,
        },
        executionPolicy: {
          directExecutionAuthorized: false,
          requiresCurrentConversationConfirmation: true,
          verifyExactTargetAndLiveValuesBeforeWrite: true,
          republishExistingAdvertisementOnly: true,
          prohibitManualEndAndRecreate: true,
        },
        requestCount: state.requests.size,
        requests: Array.from(state.requests.values()),
      };
    }
    function requestFilename(date) {
      return "estate-advertisement-requests-" + date.toISOString().replace(/[-:]/g, "").replace(/\\.\\d{3}Z$/, "Z") + ".json";
    }
    function downloadRequestJson() {
      if (state.requests.size === 0) return;
      const now = new Date();
      const json = JSON.stringify(requestBundle(), null, 2) + "\\n";
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = requestFilename(now);
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      requestSaveStatus.textContent = state.requests.size.toLocaleString("ko-KR") + "건 요청 JSON 저장을 시작했습니다.";
    }
    function render() {
      const filtered = filteredRows();
      const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      state.page = Math.min(state.page, pageCount);
      const pageRows = filtered.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      rowsElement.innerHTML = pageRows.map((advertisement) => {
        const rowId = "ad-" + advertisement.itemIndex;
        const expanded = state.expandedId === rowId;
        const address = advertisement.fullAddress || advertisement.complexName || "주소 미확인";
        const sourceMeta = [advertisement.propertyType, advertisement.registeredAt ? "등록 " + advertisement.registeredAt : null, "이실장 #" + advertisement.externalAdId, advertisement.naverArticleNo ? "네이버 #" + advertisement.naverArticleNo : null].filter(Boolean).join(" · ");
        const summary = advertisement.comparison?.summary;
        const toggleLabel = summary
          ? "앞 " + (summary.aheadCompetitorCount || 0).toLocaleString("ko-KR") + " · 전체 " + (summary.competitorCount || 0).toLocaleString("ko-KR")
          : "응답 " + advertisement.duplicateCount.toLocaleString("ko-KR") + "건";
        const status = advertisement.comparison?.state || advertisement.collectionStatus;
        const statusLabel = advertisement.comparison?.stateLabel || advertisement.collectionStatusLabel;
        const reasonCode = advertisement.comparison?.reasonCode || advertisement.reasonCode;
        const mainRow = '<tr class="data-row" data-row-id="' + rowId + '">' +
          '<td class="address-cell"><div class="address-primary" title="' + escapeHtml(address) + '">' + escapeHtml(address) + '</div><div class="address-meta">' + escapeHtml(sourceMeta) + '</div></td>' +
          '<td><span class="pill ' + transactionClass(advertisement.transactionType) + '">' + escapeHtml(advertisement.transactionType || "미확인") + '</span></td>' +
          '<td class="money">' + escapeHtml(advertisedPrice(advertisement)) + '</td>' +
          '<td>' + floorExposureCell(advertisement) + '</td>' +
          '<td>' + rankCell(advertisement) + '</td>' +
          '<td>' + representativeCell(advertisement) + '</td>' +
          '<td><button type="button" class="duplicate-button" data-expand="' + rowId + '" aria-expanded="' + expanded + '" aria-controls="detail-' + rowId + '">' + escapeHtml(toggleLabel) + '<span class="chevron" aria-hidden="true">⌄</span></button></td>' +
          '<td>' + priceComparisonCell(advertisement) + '</td>' +
          '<td>' + requestButtonCell(advertisement) + '</td>' +
          '<td><span class="pill pill-' + status + '">' + escapeHtml(statusLabel) + '</span>' +
            (reasonCode ? '<div class="address-meta">' + escapeHtml(reasonCode) + '</div>' : '<div class="address-meta">' + escapeHtml(advertisement.collectionStatusLabel) + '</div>') + '</td>' +
        '</tr>';
        const detailRow = expanded ? '<tr class="detail-row" id="detail-' + rowId + '"><td colspan="10"><div class="detail-panel">' + duplicateRows(advertisement) + '</div></td></tr>' : '';
        return mainRow + detailRow;
      }).join("");
      emptyElement.hidden = filtered.length !== 0;
      document.getElementById("ads-table").hidden = filtered.length === 0;
      resultSummary.textContent = filtered.length.toLocaleString("ko-KR") + "건 표시";
      footerCount.textContent = "현재 " + pageRows.length.toLocaleString("ko-KR") + "건 · 전체 " + filtered.length.toLocaleString("ko-KR") + "건";
      pageLabel.textContent = state.page + " / " + pageCount;
      previousPage.disabled = state.page <= 1;
      nextPage.disabled = state.page >= pageCount;
    }

    document.querySelectorAll("[data-count]").forEach((element) => {
      element.textContent = (REPORT.counts[element.dataset.count] || 0).toLocaleString("ko-KR");
    });
    document.getElementById("source-time").textContent = formatDateTime(REPORT.sourceObservedAt);
    document.getElementById("naver-time").textContent = formatDateTime(REPORT.naverCollectedAt);
    const comparisonTime = document.getElementById("comparison-time");
    if (comparisonTime) comparisonTime.textContent = formatDateTime(REPORT.comparisonAnalyzedAt);
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.tab = button.dataset.tab;
        state.page = 1;
        state.expandedId = null;
        document.querySelectorAll("[data-tab]").forEach((candidate) => candidate.setAttribute("aria-selected", String(candidate === button)));
        render();
      });
    });
    document.getElementById("search").addEventListener("input", (event) => {
      state.search = event.target.value;
      state.page = 1;
      state.expandedId = null;
      render();
    });
    document.getElementById("transaction-filter").addEventListener("change", (event) => {
      state.transaction = event.target.value;
      state.page = 1;
      state.expandedId = null;
      render();
    });
    rowsElement.addEventListener("click", (event) => {
      const requestButton = event.target.closest("[data-request-item]");
      if (requestButton) {
        openRequestDialog(Number(requestButton.dataset.requestItem));
        return;
      }
      const button = event.target.closest("[data-expand]");
      if (!button) return;
      state.expandedId = state.expandedId === button.dataset.expand ? null : button.dataset.expand;
      render();
    });
    for (const [field, input] of Object.entries(requestInputs)) {
      input.addEventListener("input", () => {
        const advertisement = findAdvertisement(state.editingItemIndex);
        if (advertisement) updatePriceInputHelp(advertisement, field);
        requestError.textContent = "";
      });
    }
    document.getElementById("request-floor-exposure").addEventListener("change", () => {
      requestError.textContent = "";
    });
    requestRepublishAfterSave.addEventListener("change", () => {
      requestError.textContent = "";
    });
    requestForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const advertisement = findAdvertisement(state.editingItemIndex);
      if (!advertisement) return;
      try {
        const request = buildModificationRequest(advertisement);
        state.requests.set(advertisement.itemIndex, request);
        requestDialog.close();
        state.editingItemIndex = null;
        renderRequestBasket();
        render();
      } catch (error) {
        requestError.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    document.getElementById("open-request-basket").addEventListener("click", () => {
      requestSaveStatus.textContent = "";
      renderRequestBasket();
      requestBasketDialog.showModal();
    });
    requestList.addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit-request]");
      if (editButton) {
        requestBasketDialog.close();
        openRequestDialog(Number(editButton.dataset.editRequest));
        return;
      }
      const removeButton = event.target.closest("[data-remove-request]");
      if (!removeButton) return;
      state.requests.delete(Number(removeButton.dataset.removeRequest));
      requestSaveStatus.textContent = "";
      renderRequestBasket();
      render();
    });
    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = document.getElementById(button.dataset.closeDialog);
        if (dialog?.open) dialog.close();
      });
    });
    requestDialog.addEventListener("close", () => {
      state.editingItemIndex = null;
      requestError.textContent = "";
    });
    saveRequestJson.addEventListener("click", downloadRequestJson);
    previousPage.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; state.expandedId = null; render(); } });
    nextPage.addEventListener("click", () => { state.page += 1; state.expandedId = null; render(); });
    renderRequestBasket();
    render();
  </script>
</body>
</html>`;
}

export async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new LocalReportError(
      "invalid_json",
      `Could not read JSON: ${path.resolve(filePath)}`,
      [error instanceof Error ? error.message : String(error)],
    );
  }
}

export async function writeHtmlAtomic(filePath, html, overwrite = false) {
  const resolvedPath = path.resolve(filePath);
  if (path.extname(resolvedPath).toLowerCase() !== ".html") {
    throw new LocalReportError(
      "invalid_output_extension",
      "Local report output must use the .html extension.",
    );
  }
  const parentDirectory = path.dirname(resolvedPath);
  await mkdir(parentDirectory, { recursive: true, mode: 0o700 });
  await access(parentDirectory, constants.W_OK);
  if (!overwrite) {
    try {
      await access(resolvedPath, constants.F_OK);
      throw new LocalReportError(
        "output_exists",
        `Output already exists: ${resolvedPath}`,
      );
    } catch (error) {
      if (error instanceof LocalReportError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const temporaryPath = path.join(
    parentDirectory,
    `.${path.basename(resolvedPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, html, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    if (overwrite) await rename(temporaryPath, resolvedPath);
    else {
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
      throw new LocalReportError(
        "output_exists",
        `Output already exists: ${resolvedPath}`,
      );
    }
    throw error;
  }
}

export function reportSha256(html) {
  return createHash("sha256").update(html).digest("hex");
}

export function formatFailure(error) {
  if (error instanceof LocalReportError) {
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
