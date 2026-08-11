import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export class AnalysisError extends Error {
  constructor(reasonCode, message, errors = []) {
    super(message);
    this.name = "AnalysisError";
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

export function canonicalHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
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
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeIntegerOrNull(value) {
  if (Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

export function computeEsiljangManifestHash(snapshot) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  return canonicalHash({
    provider: snapshot?.provider,
    scope: snapshot?.scope,
    activeFilter: snapshot?.activeFilter,
    observedAt: snapshot?.observedAt,
    expectedTotal: snapshot?.expectedTotal ?? null,
    paginationComplete: snapshot?.paginationComplete,
    visitedPages: snapshot?.visitedPages,
    items: [...items].sort((left, right) =>
      String(left?.externalAdId ?? "").localeCompare(
        String(right?.externalAdId ?? ""),
      ),
    ),
  });
}

export function computeNaverManifestHash(snapshot) {
  if (!isObject(snapshot)) return canonicalHash(snapshot);
  const { manifestHash: _manifestHash, ...withoutHash } = snapshot;
  return canonicalHash(withoutHash);
}

function validateEsiljangSnapshot(snapshot) {
  const errors = [];
  if (!isObject(snapshot)) {
    throw new AnalysisError(
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
  if (snapshot.paginationComplete !== true) {
    errors.push("paginationComplete must be true");
  }
  if (!isObject(snapshot.activeFilter)) {
    errors.push("activeFilter must be an object");
  } else {
    if (snapshot.activeFilter.dataValue !== "ad") {
      errors.push("activeFilter.dataValue must be ad");
    }
    if (snapshot.activeFilter.selected !== true) {
      errors.push("activeFilter.selected must be true");
    }
  }
  if (
    !Array.isArray(snapshot.visitedPages) ||
    snapshot.visitedPages.length === 0
  ) {
    errors.push("visitedPages must be a non-empty array");
  }
  if (!Array.isArray(snapshot.items)) errors.push("items must be an array");
  if (!isManifestHash(snapshot.manifestHash)) {
    errors.push("manifestHash must be a SHA-256 value");
  }

  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  if (
    !Number.isInteger(snapshot.collectedTotal) ||
    snapshot.collectedTotal !== items.length
  ) {
    errors.push("collectedTotal must equal items.length");
  }
  if (
    snapshot.expectedTotal !== null &&
    snapshot.expectedTotal !== undefined &&
    (!Number.isInteger(snapshot.expectedTotal) ||
      snapshot.expectedTotal !== items.length)
  ) {
    errors.push("expectedTotal must be null or equal items.length");
  }

  const externalAdIds = new Set();
  items.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`items[${index}] must be an object`);
      return;
    }
    const externalAdId = textOrNull(item.externalAdId);
    if (!externalAdId) {
      errors.push(`items[${index}].externalAdId is required`);
    } else if (externalAdIds.has(externalAdId)) {
      errors.push(`duplicate externalAdId: ${externalAdId}`);
    } else {
      externalAdIds.add(externalAdId);
    }
    if (
      item.naverArticleNo !== null &&
      item.naverArticleNo !== undefined &&
      (typeof item.naverArticleNo !== "string" ||
        !/^\d+$/.test(item.naverArticleNo))
    ) {
      errors.push(`items[${index}].naverArticleNo must contain digits only`);
    }
    if (item.observedAt !== snapshot.observedAt) {
      errors.push(`items[${index}].observedAt must match snapshot observedAt`);
    }
  });

  if (errors.length > 0) {
    throw new AnalysisError(
      "invalid_esiljang_snapshot",
      "The Esiljang snapshot failed structural validation.",
      errors,
    );
  }
  const calculatedHash = computeEsiljangManifestHash(snapshot);
  if (calculatedHash !== snapshot.manifestHash.toLowerCase()) {
    throw new AnalysisError(
      "esiljang_integrity_mismatch",
      "The Esiljang snapshot manifest hash does not match its content.",
      [`expected ${snapshot.manifestHash}`, `calculated ${calculatedHash}`],
    );
  }
  return items;
}

function validateNaverSnapshot(snapshot, esiljangSnapshot) {
  const errors = [];
  if (!isObject(snapshot)) {
    throw new AnalysisError(
      "invalid_naver_snapshot",
      "Naver snapshot must be a JSON object.",
    );
  }
  if (snapshot.version !== 1) errors.push("version must be 1");
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

  const queries = Array.isArray(snapshot.queries) ? snapshot.queries : [];
  const failures = Array.isArray(snapshot.failures) ? snapshot.failures : [];
  const skipped = Array.isArray(snapshot.skipped) ? snapshot.skipped : [];
  const seenNumbers = new Set();

  for (const [collectionName, values] of [
    ["queries", queries],
    ["failures", failures],
  ]) {
    values.forEach((entry, index) => {
      if (!isObject(entry)) {
        errors.push(`${collectionName}[${index}] must be an object`);
        return;
      }
      if (
        typeof entry.naverArticleNo !== "string" ||
        !/^\d+$/.test(entry.naverArticleNo)
      ) {
        errors.push(`${collectionName}[${index}].naverArticleNo is invalid`);
        return;
      }
      if (seenNumbers.has(entry.naverArticleNo)) {
        errors.push(`duplicate Naver result: ${entry.naverArticleNo}`);
      }
      seenNumbers.add(entry.naverArticleNo);
    });
  }

  const counterChecks = [
    ["sourceItemTotal", esiljangSnapshot.items.length],
    ["requestedTotal", queries.length + failures.length],
    ["succeededTotal", queries.length],
    ["failedTotal", failures.length],
    ["skippedTotal", skipped.length],
  ];
  for (const [field, expected] of counterChecks) {
    if (snapshot[field] !== expected) {
      errors.push(`${field} must equal ${expected}`);
    }
  }

  if (errors.length > 0) {
    throw new AnalysisError(
      "invalid_naver_snapshot",
      "The Naver snapshot failed structural validation.",
      errors,
    );
  }

  if (
    snapshot.source.manifestHash !== esiljangSnapshot.manifestHash ||
    snapshot.source.observedAt !== esiljangSnapshot.observedAt
  ) {
    throw new AnalysisError(
      "snapshot_lineage_mismatch",
      "The Naver snapshot was not collected from this Esiljang snapshot.",
      [
        `Esiljang manifest: ${esiljangSnapshot.manifestHash}`,
        `Naver source manifest: ${snapshot.source.manifestHash ?? "missing"}`,
      ],
    );
  }

  const calculatedHash = computeNaverManifestHash(snapshot);
  if (calculatedHash !== snapshot.manifestHash.toLowerCase()) {
    throw new AnalysisError(
      "naver_integrity_mismatch",
      "The Naver snapshot manifest hash does not match its content.",
      [`expected ${snapshot.manifestHash}`, `calculated ${calculatedHash}`],
    );
  }
  return { queries, failures };
}

export function parseKoreanMoney(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  if (typeof value !== "string") return null;
  let normalized = value.trim();
  if (!normalized || normalized === "-") return null;
  normalized = normalized.split("/", 1)[0];
  normalized = normalized.replaceAll(",", "").replace(/\s+/g, "");
  normalized = normalized.replace(/원$/, "");

  const eok = normalized.match(
    /^(\d+(?:\.\d+)?)억(?:(\d+(?:\.\d+)?)(?:만)?)?$/,
  );
  if (eok) {
    const amount = Number(eok[1]) * 10_000 + Number(eok[2] ?? 0);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
  }
  const manwon = normalized.match(/^(\d+(?:\.\d+)?)(?:만)?$/);
  if (!manwon) return null;
  const amount = Number(manwon[1]);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
}

function normalizeTradeKind(value) {
  const normalized = textOrNull(value)?.toUpperCase() ?? null;
  if (["매매", "SALE", "A1"].includes(normalized)) return "sale";
  if (["전세", "JEONSE", "B1"].includes(normalized)) return "jeonse";
  if (["월세", "MONTHLY", "MONTHLY_RENT", "B2"].includes(normalized)) {
    return "monthly";
  }
  return "unknown";
}

function readRowField(row, name) {
  if (!isObject(row)) return undefined;
  if (row[name] !== undefined && row[name] !== null) return row[name];
  return isObject(row.articleDetail) ? row.articleDetail[name] : undefined;
}

function normalizeArticleNumber(row) {
  const value =
    readRowField(row, "articleNo") ?? readRowField(row, "articleNumber");
  const normalized = textOrNull(value);
  return normalized && /^\d+$/.test(normalized) ? normalized : null;
}

function normalizeFloorDisclosure(value) {
  const raw = textOrNull(value);
  if (!raw || !raw.includes("/")) return { raw, kind: "unknown" };
  const prefix = raw.split("/", 1)[0].trim();
  if (["저", "중", "고"].includes(prefix)) return { raw, kind: "band" };
  if (
    /^-?\d+$/.test(prefix) ||
    /^B\d+$/i.test(prefix) ||
    /^지하\s*\d+$/.test(prefix)
  ) {
    return { raw, kind: "exact" };
  }
  return { raw, kind: "unknown" };
}

function normalizeConfirmationDate(value) {
  const normalized = textOrNull(value)?.replaceAll("-", "") ?? null;
  return normalized && /^\d{8}$/.test(normalized) ? normalized : null;
}

function sourceAdvertisement(item, itemIndex) {
  return {
    itemIndex,
    provider: textOrNull(item.provider) ?? "esiljang",
    externalAdId: textOrNull(item.externalAdId),
    naverArticleNo: textOrNull(item.naverArticleNo),
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
    registeredAt: textOrNull(item.registeredAt),
  };
}

function buildOwnershipIndex(items) {
  const byArticleNo = new Map();
  items.forEach((item, itemIndex) => {
    if (!item.naverArticleNo) return;
    const reference = {
      itemIndex,
      externalAdId: item.externalAdId,
      providerStatus: textOrNull(item.providerStatus),
      completed: textOrNull(item.providerStatus) === "거래완료",
    };
    const existing = byArticleNo.get(item.naverArticleNo) ?? [];
    existing.push(reference);
    byArticleNo.set(item.naverArticleNo, existing);
  });
  return byArticleNo;
}

function normalizeRow(row, observedRank, ownershipIndex, fallbackTradeType) {
  const articleNo = normalizeArticleNumber(row);
  const sourceReferences = articleNo
    ? (ownershipIndex.get(articleNo) ?? [])
    : [];
  const activeReferences = sourceReferences.filter(
    (reference) => !reference.completed,
  );
  const completedReferences = sourceReferences.filter(
    (reference) => reference.completed,
  );
  const ownershipClassification =
    activeReferences.length > 0
      ? "owned_active"
      : completedReferences.length > 0
        ? "owned_completed"
        : articleNo
          ? "competitor"
          : "unclassified";
  const tradeTypeName =
    textOrNull(readRowField(row, "tradeTypeName")) ?? fallbackTradeType;
  const tradeTypeCode = textOrNull(readRowField(row, "tradeTypeCode"));
  const transactionKind = normalizeTradeKind(tradeTypeName ?? tradeTypeCode);
  const dealOrWarrantPrc = textOrNull(readRowField(row, "dealOrWarrantPrc"));
  const rentPrc = textOrNull(readRowField(row, "rentPrc"));
  const primaryAmountManwon = parseKoreanMoney(dealOrWarrantPrc);
  const monthlyRentManwon =
    transactionKind === "monthly" ? parseKoreanMoney(rentPrc) : null;

  return {
    articleNo,
    observedRank,
    articleName: textOrNull(readRowField(row, "articleName")),
    buildingName: textOrNull(readRowField(row, "buildingName")),
    articleStatus: textOrNull(readRowField(row, "articleStatus")),
    propertyTypeName:
      textOrNull(readRowField(row, "articleRealEstateTypeName")) ??
      textOrNull(readRowField(row, "realEstateTypeName")),
    tradeTypeName,
    tradeTypeCode,
    areaName: textOrNull(readRowField(row, "areaName")),
    area1: numberOrNull(readRowField(row, "area1")),
    area2: numberOrNull(readRowField(row, "area2")),
    floorInfo: textOrNull(readRowField(row, "floorInfo")),
    direction: textOrNull(readRowField(row, "direction")),
    articleConfirmYmd: normalizeConfirmationDate(
      readRowField(row, "articleConfirmYmd"),
    ),
    verificationTypeCode: textOrNull(readRowField(row, "verificationTypeCode")),
    realtorName: textOrNull(readRowField(row, "realtorName")),
    realtorId: textOrNull(readRowField(row, "realtorId")),
    cpName: textOrNull(readRowField(row, "cpName")),
    sameAddrCnt: nonNegativeIntegerOrNull(readRowField(row, "sameAddrCnt")),
    sameAddrDirectCnt: nonNegativeIntegerOrNull(
      readRowField(row, "sameAddrDirectCnt"),
    ),
    price: {
      transactionKind,
      dealOrWarrantPrc,
      rentPrc,
      amountManwon: transactionKind === "monthly" ? null : primaryAmountManwon,
      depositManwon: transactionKind === "monthly" ? primaryAmountManwon : null,
      monthlyRentManwon,
    },
    floorDisclosure: normalizeFloorDisclosure(readRowField(row, "floorInfo")),
    ownership: {
      classification: ownershipClassification,
      basis:
        sourceReferences.length > 0
          ? "esiljang_snapshot_explicit_naver_article_no"
          : articleNo
            ? "absent_from_esiljang_article_number_set"
            : "invalid_or_missing_article_number",
      sourceAdvertisements: sourceReferences,
    },
  };
}

function extractResponseRows(response) {
  if (Array.isArray(response)) {
    return { supported: true, shape: "array", rows: response };
  }
  if (isObject(response) && Array.isArray(response.articleList)) {
    return {
      supported: true,
      shape: "articleList",
      rows: response.articleList,
    };
  }
  if (isObject(response) && Array.isArray(response.articles)) {
    return { supported: true, shape: "articles", rows: response.articles };
  }
  return { supported: false, shape: "unknown", rows: [] };
}

function comparablePrice(price) {
  if (price.transactionKind === "monthly") {
    return (
      Number.isInteger(price.depositManwon) &&
      Number.isInteger(price.monthlyRentManwon)
    );
  }
  return (
    ["sale", "jeonse"].includes(price.transactionKind) &&
    Number.isInteger(price.amountManwon)
  );
}

export function comparePrices(ownPrice, competitorPrice) {
  const base = {
    perspective: "competitor_relative_to_own",
    transactionKind: ownPrice?.transactionKind ?? "unknown",
    basis: "normalized_naver_price_fields",
    own: ownPrice ?? null,
    competitor: competitorPrice ?? null,
  };
  if (!ownPrice || !competitorPrice) {
    return { ...base, relation: "unknown", reasonCode: "missing_price" };
  }
  if (
    ownPrice.transactionKind === "unknown" ||
    competitorPrice.transactionKind !== ownPrice.transactionKind
  ) {
    return {
      ...base,
      relation: "unknown",
      reasonCode: "transaction_type_mismatch",
    };
  }
  if (!comparablePrice(ownPrice) || !comparablePrice(competitorPrice)) {
    return { ...base, relation: "unknown", reasonCode: "invalid_price" };
  }

  if (ownPrice.transactionKind === "monthly") {
    const depositDelta = competitorPrice.depositManwon - ownPrice.depositManwon;
    const monthlyRentDelta =
      competitorPrice.monthlyRentManwon - ownPrice.monthlyRentManwon;
    let relation = "mixed";
    if (depositDelta === 0 && monthlyRentDelta === 0) relation = "same";
    else if (depositDelta <= 0 && monthlyRentDelta <= 0) relation = "lower";
    else if (depositDelta >= 0 && monthlyRentDelta >= 0) relation = "higher";
    return {
      ...base,
      relation,
      deltaManwon: { deposit: depositDelta, monthlyRent: monthlyRentDelta },
    };
  }

  const deltaManwon = competitorPrice.amountManwon - ownPrice.amountManwon;
  return {
    ...base,
    relation: deltaManwon < 0 ? "lower" : deltaManwon > 0 ? "higher" : "same",
    deltaManwon,
  };
}

function compareConfirmationDate(ownDate, competitorDate) {
  if (!ownDate || !competitorDate) return "unknown";
  if (competitorDate === ownDate) return "same_date";
  return competitorDate > ownDate ? "newer" : "older";
}

export function compareFloorDisclosure(ownFloor, competitorFloor) {
  const ownKind = ownFloor?.kind ?? "unknown";
  const competitorKind = competitorFloor?.kind ?? "unknown";
  if (ownKind === "unknown" || competitorKind === "unknown") {
    return {
      relation: "unknown",
      ownKind,
      competitorKind,
    };
  }
  const score = { band: 1, exact: 2 };
  const difference = score[competitorKind] - score[ownKind];
  return {
    relation:
      difference > 0
        ? "competitor_more_specific"
        : difference < 0
          ? "own_more_specific"
          : "same_specificity",
    ownKind,
    competitorKind,
  };
}

function representative(row, classification, basis) {
  if (!row) return null;
  return {
    classification,
    basis,
    officialNaverRepresentativeClaim: false,
    advertisement: row,
  };
}

function blankAnalysisFields() {
  return {
    responseShape: null,
    observedGroupSize: null,
    reportedSameAddressCount: null,
    rank: null,
    ownReferenceAdvertisement: null,
    representativeAdvertisement: null,
    ownRepresentativeAdvertisement: null,
    leadingCompetitorAdvertisement: null,
    otherOwnAdvertisements: [],
    excludedCompletedOwnAdvertisements: [],
    competitors: [],
    comparisonSummary: null,
    warnings: [],
  };
}

function nonAnalyzed(base, state, reasonCode, extra = {}) {
  return {
    ...base,
    state,
    reasonCode,
    ...blankAnalysisFields(),
    ...extra,
  };
}

function comparisonCounts(competitors) {
  const priceRelations = {
    lower: 0,
    same: 0,
    higher: 0,
    mixed: 0,
    unknown: 0,
  };
  const positionRelations = { ahead: 0, behind: 0 };
  const confirmationDateRelations = {
    newer: 0,
    same_date: 0,
    older: 0,
    unknown: 0,
  };
  let competitorMoreSpecificFloor = 0;

  for (const competitor of competitors) {
    priceRelations[competitor.priceComparison.relation] += 1;
    positionRelations[competitor.positionRelation] += 1;
    confirmationDateRelations[competitor.confirmationDateRelation] += 1;
    if (
      competitor.floorDisclosureComparison.relation ===
      "competitor_more_specific"
    ) {
      competitorMoreSpecificFloor += 1;
    }
  }
  return {
    competitorCount: competitors.length,
    aheadCompetitorCount: positionRelations.ahead,
    behindCompetitorCount: positionRelations.behind,
    priceRelations,
    confirmationDateRelations,
    competitorMoreSpecificFloorCount: competitorMoreSpecificFloor,
  };
}

function analyzeItem({
  item,
  itemIndex,
  query,
  failure,
  ownershipIndex,
  naverCollectedAt,
}) {
  const source = sourceAdvertisement(item, itemIndex);
  const base = {
    itemIndex,
    externalAdId: source.externalAdId,
    naverArticleNo: source.naverArticleNo,
    sourceAdvertisement: source,
  };

  if (source.providerStatus === "거래완료") {
    return nonAnalyzed(base, "skipped_completed", "provider_status_completed");
  }
  if (!source.naverArticleNo) {
    return nonAnalyzed(base, "missing_article_no", "missing_naver_article_no");
  }
  if (failure) {
    return nonAnalyzed(base, "collection_failed", failure.reasonCode, {
      collectionFailure: {
        httpStatus: Number.isInteger(failure.httpStatus)
          ? failure.httpStatus
          : null,
        reasonCode: textOrNull(failure.reasonCode) ?? "collection_failed",
        message: textOrNull(failure.message),
      },
    });
  }
  if (!query) {
    return nonAnalyzed(base, "not_collected", "not_collected");
  }

  const extracted = extractResponseRows(query.response);
  if (!extracted.supported) {
    return nonAnalyzed(
      base,
      "unsupported_response_shape",
      "unsupported_response_shape",
      { responseShape: extracted.shape },
    );
  }
  if (extracted.rows.length === 0) {
    return nonAnalyzed(base, "empty_response", "empty_successful_response", {
      responseShape: extracted.shape,
      observedGroupSize: 0,
    });
  }

  const rows = extracted.rows.map((row, index) =>
    normalizeRow(row, index + 1, ownershipIndex, source.transactionType),
  );
  const warnings = [];
  const seenArticleNumbers = new Set();
  rows.forEach((row) => {
    if (!row.articleNo) {
      warnings.push({
        reasonCode: "invalid_response_article_number",
        observedRank: row.observedRank,
      });
      return;
    }
    if (seenArticleNumbers.has(row.articleNo)) {
      warnings.push({
        reasonCode: "duplicate_response_article_number",
        articleNo: row.articleNo,
        observedRank: row.observedRank,
      });
    }
    seenArticleNumbers.add(row.articleNo);
  });

  const targetRows = rows.filter(
    (row) => row.articleNo === source.naverArticleNo,
  );
  const observedLeader = rows[0];
  const activeOwnedRows = rows.filter(
    (row) => row.ownership.classification === "owned_active",
  );
  const ownRepresentative = activeOwnedRows[0] ?? null;
  const representativeAdvertisement = representative(
    observedLeader,
    "observed_response_leader",
    "first_response_row",
  );

  if (targetRows.length === 0) {
    return nonAnalyzed(
      base,
      "anchor_not_found",
      "query_target_not_in_response",
      {
        responseShape: extracted.shape,
        observedGroupSize: rows.length,
        representativeAdvertisement,
        ownRepresentativeAdvertisement: representative(
          ownRepresentative,
          "highest_observed_active_owned_row",
          "lowest_response_order_among_explicit_active_owned_articles",
        ),
        warnings,
      },
    );
  }
  if (targetRows.length > 1) {
    warnings.push({
      reasonCode: "duplicate_query_target_row",
      articleNo: source.naverArticleNo,
      count: targetRows.length,
    });
  }

  const target = targetRows[0];
  const competitorRows = rows.filter(
    (row) => row.ownership.classification === "competitor",
  );
  const competitors = competitorRows.map((competitor) => ({
    advertisement: competitor,
    positionRelation:
      competitor.observedRank < target.observedRank ? "ahead" : "behind",
    priceComparison: comparePrices(target.price, competitor.price),
    confirmationDateRelation: compareConfirmationDate(
      target.articleConfirmYmd,
      competitor.articleConfirmYmd,
    ),
    floorDisclosureComparison: compareFloorDisclosure(
      target.floorDisclosure,
      competitor.floorDisclosure,
    ),
  }));
  const otherOwnAdvertisements = rows.filter(
    (row) =>
      row.articleNo !== source.naverArticleNo &&
      row.ownership.classification === "owned_active",
  );
  const excludedCompletedOwnAdvertisements = rows.filter(
    (row) => row.ownership.classification === "owned_completed",
  );
  const leadingCompetitor = competitorRows[0] ?? null;

  return {
    ...base,
    state: "analyzed",
    reasonCode: null,
    responseShape: extracted.shape,
    observedGroupSize: rows.length,
    reportedSameAddressCount: target.sameAddrCnt,
    reportedSameAddressDirectCount: target.sameAddrDirectCnt,
    rank: {
      value: target.observedRank,
      total: rows.length,
      basis: "naver_duplicate_response_order",
      scope: "saved_duplicate_response",
      collectedAt: naverCollectedAt,
    },
    ownReferenceAdvertisement: {
      ownershipBasis: "esiljang_snapshot_explicit_naver_article_no",
      advertisement: target,
    },
    representativeAdvertisement,
    ownRepresentativeAdvertisement: representative(
      ownRepresentative,
      "highest_observed_active_owned_row",
      "lowest_response_order_among_explicit_active_owned_articles",
    ),
    leadingCompetitorAdvertisement: representative(
      leadingCompetitor,
      "leading_competitor",
      "lowest_response_order_among_competitors",
    ),
    otherOwnAdvertisements,
    excludedCompletedOwnAdvertisements,
    competitors,
    comparisonSummary: {
      ...comparisonCounts(competitors),
      referenceIsObservedRepresentative: target.observedRank === 1,
      observedRepresentativeOwnership: observedLeader.ownership.classification,
      ownRepresentativeArticleNo: ownRepresentative?.articleNo ?? null,
      leadingCompetitorArticleNo: leadingCompetitor?.articleNo ?? null,
    },
    warnings,
  };
}

export function buildComparisonAnalysis(
  esiljangSnapshot,
  naverSnapshot,
  analyzedAt = new Date().toISOString(),
) {
  const items = validateEsiljangSnapshot(esiljangSnapshot);
  const { queries, failures } = validateNaverSnapshot(
    naverSnapshot,
    esiljangSnapshot,
  );
  if (!isTimestamp(analyzedAt)) {
    throw new AnalysisError(
      "invalid_analyzed_at",
      "analyzedAt must be a valid ISO timestamp.",
    );
  }

  const queriesByArticleNo = new Map(
    queries.map((query) => [query.naverArticleNo, query]),
  );
  const failuresByArticleNo = new Map(
    failures.map((failure) => [failure.naverArticleNo, failure]),
  );
  const ownershipIndex = buildOwnershipIndex(items);
  const analyses = items.map((item, itemIndex) =>
    analyzeItem({
      item,
      itemIndex,
      query: item.naverArticleNo
        ? queriesByArticleNo.get(item.naverArticleNo)
        : undefined,
      failure: item.naverArticleNo
        ? failuresByArticleNo.get(item.naverArticleNo)
        : undefined,
      ownershipIndex,
      naverCollectedAt: naverSnapshot.collectedAt,
    }),
  );

  const countState = (state) =>
    analyses.filter((analysis) => analysis.state === state).length;
  const issueStates = new Set([
    "missing_article_no",
    "collection_failed",
    "not_collected",
    "unsupported_response_shape",
    "anchor_not_found",
  ]);
  const issues = analyses.filter((analysis) => issueStates.has(analysis.state));
  const analyzed = countState("analyzed");
  const emptyResponse = countState("empty_response");
  const completedSkipped = countState("skipped_completed");
  const meaningful = analyzed + emptyResponse + completedSkipped;
  const status =
    issues.length === 0 ? "succeeded" : meaningful > 0 ? "partial" : "failed";

  const counts = {
    total: analyses.length,
    active: analyses.length - completedSkipped,
    analyzed,
    emptyResponse,
    completedSkipped,
    missingArticleNo: countState("missing_article_no"),
    collectionFailed: countState("collection_failed"),
    notCollected: countState("not_collected"),
    unsupportedResponseShape: countState("unsupported_response_shape"),
    anchorMissing: countState("anchor_not_found"),
    issues: issues.length,
    competitorAdvertisements: analyses.reduce(
      (total, analysis) => total + analysis.competitors.length,
      0,
    ),
    referenceObservedLeader: analyses.filter(
      (analysis) => analysis.rank?.value === 1,
    ).length,
    competitorObservedLeader: analyses.filter(
      (analysis) =>
        analysis.comparisonSummary?.observedRepresentativeOwnership ===
        "competitor",
    ).length,
  };

  const withoutHash = {
    version: 1,
    status,
    analyzer: "local-ad-comparison-analyzer",
    scope: "esiljang_ads_against_naver_duplicate_groups",
    policyVersion: 1,
    analyzedAt,
    source: {
      esiljang: {
        provider: "esiljang",
        scope: esiljangSnapshot.scope,
        observedAt: esiljangSnapshot.observedAt,
        manifestHash: esiljangSnapshot.manifestHash,
      },
      naver: {
        provider: "naver",
        scope: naverSnapshot.scope,
        collectedAt: naverSnapshot.collectedAt,
        manifestHash: naverSnapshot.manifestHash,
      },
    },
    counts,
    analyses,
  };
  return { ...withoutHash, manifestHash: canonicalHash(withoutHash) };
}

export async function readJsonFile(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new AnalysisError(
      "input_read_failed",
      `Could not read input: ${path.resolve(filePath)}`,
      [error instanceof Error ? error.message : String(error)],
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new AnalysisError(
      "invalid_json",
      `Could not parse JSON input: ${path.resolve(filePath)}`,
    );
  }
}

export async function writeJsonAtomic(filePath, value) {
  const resolvedPath = path.resolve(filePath);
  const parentDirectory = path.dirname(resolvedPath);
  await mkdir(parentDirectory, { recursive: true, mode: 0o700 });
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
    await link(temporaryPath, resolvedPath);
    await unlink(temporaryPath);
    await chmod(resolvedPath, 0o600);
    return resolvedPath;
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError?.code !== "ENOENT") throw cleanupError;
    }
    if (error?.code === "EEXIST") {
      throw new AnalysisError(
        "output_exists",
        `Output already exists: ${resolvedPath}`,
      );
    }
    throw error;
  }
}

export function formatFailure(error) {
  if (error instanceof AnalysisError) {
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
