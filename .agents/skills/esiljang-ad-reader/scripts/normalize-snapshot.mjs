#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function cleanUnitToken(value, suffix) {
  const text = cleanText(value);
  if (!text) return null;
  const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const simple = text.match(
    new RegExp(`^([A-Za-z]?\\d+(?:-\\d+)?)\\s*${escaped}$`),
  );
  return simple ? simple[1] : text;
}

function normalizeStringArray(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|[,·]/)
      : [];
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function parseMoney(value, field, errors) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 0) return value;
    errors.push(`${field} must be a non-negative integer in 만원`);
    return null;
  }

  const text = cleanText(value);
  if (!text) return null;
  if (text.includes('/')) {
    errors.push(
      `${field} contains a combined price expression and must be split before normalization`,
    );
    return null;
  }

  const compact = text.replace(/[,\s원]/g, '');
  let amount;
  const eokMatch = compact.match(
    /^(\d+(?:\.\d+)?)억(?:(\d+(?:\.\d+)?)(?:만)?)?$/u,
  );
  if (eokMatch) {
    const eok = Number(eokMatch[1]);
    const remainder = eokMatch[2] ? Number(eokMatch[2]) : 0;
    amount = eok * 10_000 + remainder;
  } else if (/^\d+(?:\.\d+)?만$/u.test(compact)) {
    amount = Number(compact.slice(0, -1));
  } else if (/^\d+(?:\.\d+)?$/.test(compact)) {
    amount = Number(compact);
  } else {
    errors.push(`${field} has an unsupported price format`);
    return null;
  }

  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
    errors.push(`${field} must resolve to a non-negative integer in 만원`);
    return null;
  }
  return amount;
}

function normalizeDate(value, field, errors) {
  const text = cleanText(value);
  if (!text) return null;
  const dateOnly = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized
    ) {
      errors.push(`${field} is not a valid calendar date`);
      return null;
    }
    return normalized;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(`${field} is not a valid date`);
    return null;
  }
  return parsed.toISOString();
}

function parseNaverUrl(urlValue, errors) {
  const rawUrl = cleanText(urlValue);
  if (!rawUrl) return { rawUrl: null, articleNo: null };
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (!(host === 'naver.com' || host.endsWith('.naver.com'))) {
      errors.push('naverUrl must use a Naver-owned host');
      return { rawUrl, articleNo: null };
    }
    const queryValue =
      url.searchParams.get('articleNo') ?? url.searchParams.get('article_no');
    const pathValue = url.pathname.match(/\/articles?\/(\d+)(?:\/|$)/)?.[1];
    const candidate = queryValue ?? pathValue ?? null;
    if (candidate && !/^\d+$/.test(candidate)) {
      errors.push('naverUrl contains an invalid article number');
      return { rawUrl, articleNo: null };
    }
    return { rawUrl, articleNo: candidate };
  } catch {
    errors.push('naverUrl is not a valid URL');
    return { rawUrl, articleNo: null };
  }
}

function extractNaverIdentity(value, urlValue, errors) {
  const explicit = cleanText(value);
  let explicitArticleNo = null;
  if (explicit) {
    const normalized = explicit.replace(/[\s-]/g, '');
    if (!/^\d+$/.test(normalized)) {
      errors.push('naverArticleNo must contain digits only');
    } else {
      explicitArticleNo = normalized;
    }
  }

  const parsedUrl = parseNaverUrl(urlValue, errors);
  if (!explicitArticleNo && parsedUrl.rawUrl && !parsedUrl.articleNo) {
    if (!errors.some((message) => message.startsWith('naverUrl '))) {
      errors.push('naverUrl does not contain an exact article number');
    }
  }
  if (
    explicitArticleNo &&
    parsedUrl.articleNo &&
    explicitArticleNo !== parsedUrl.articleNo
  ) {
    errors.push('naverArticleNo does not match the exact number in naverUrl');
    return { naverArticleNo: null, naverUrl: parsedUrl.rawUrl };
  }
  return {
    naverArticleNo: explicitArticleNo ?? parsedUrl.articleNo,
    naverUrl: parsedUrl.rawUrl,
  };
}

function normalizeSourceFields(value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const safeEntries = [];
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = cleanText(rawKey);
    const fieldValue = cleanText(rawValue);
    if (!key || !fieldValue) continue;
    if (
      /password|passwd|pwd|cookie|token|authorization|otp|secret|비밀번호|암호|인증번호/i.test(
        key,
      )
    ) {
      errors.push(`sourceFields contains prohibited sensitive key: ${key}`);
      continue;
    }
    safeEntries.push([key, fieldValue]);
  }
  return Object.fromEntries(safeEntries);
}

function normalizeItem(item, snapshotObservedAt, index) {
  const errors = [];
  const warnings = [];
  const externalAdId = cleanText(item?.externalAdId);
  if (!externalAdId) errors.push('externalAdId is required');

  const sourcePage = Number(item?.sourcePage);
  if (!Number.isInteger(sourcePage) || sourcePage < 1) {
    errors.push('sourcePage must be a positive integer');
  }

  const naverIdentity = extractNaverIdentity(
    item?.naverArticleNo,
    item?.naverUrl,
    errors,
  );
  const providerStatus = cleanText(item?.providerStatus)?.toLowerCase() ?? null;

  const normalized = {
    provider: 'esiljang',
    externalAdId,
    naverArticleNo: naverIdentity.naverArticleNo,
    naverUrl: naverIdentity.naverUrl,
    providerUrl: cleanText(item?.providerUrl),
    complexName: cleanText(item?.complexName),
    fullAddress: cleanText(item?.fullAddress),
    dong: cleanUnitToken(item?.dong, '동'),
    floor: cleanText(item?.floor),
    ho: cleanUnitToken(item?.ho, '호'),
    transactionType: cleanText(item?.transactionType),
    propertyType: cleanText(item?.propertyType),
    unitType: cleanText(item?.unitType),
    advertisedPrice: parseMoney(
      item?.advertisedPrice,
      'advertisedPrice',
      errors,
    ),
    advertisedDeposit: parseMoney(
      item?.advertisedDeposit,
      'advertisedDeposit',
      errors,
    ),
    advertisedMonthlyRent: parseMoney(
      item?.advertisedMonthlyRent,
      'advertisedMonthlyRent',
      errors,
    ),
    direction: cleanText(item?.direction),
    registeredAt: normalizeDate(item?.registeredAt, 'registeredAt', errors),
    providerStatus,
    features: normalizeStringArray(item?.features),
    memo: cleanText(item?.memo),
    observedAt: snapshotObservedAt,
    sourcePage: Number.isInteger(sourcePage) ? sourcePage : null,
    sourceFields: normalizeSourceFields(item?.sourceFields, errors),
  };

  if (!normalized.fullAddress) warnings.push('fullAddress is unavailable');
  if (!normalized.naverArticleNo) warnings.push('naverArticleNo is unavailable');
  if (!normalized.providerUrl) warnings.push('providerUrl is unavailable');

  return {
    item: normalized,
    errors: errors.map((message) => ({ itemIndex: index, externalAdId, message })),
    warnings: warnings.map((message) => ({
      itemIndex: index,
      externalAdId,
      message,
    })),
  };
}

async function readInput() {
  const file = process.argv[2];
  const text = file
    ? await readFile(file, 'utf8')
    : await new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
          data += chunk;
        });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
      });
  return JSON.parse(text);
}

export function normalizeSnapshot(input) {
  const envelopeErrors = [];
  if (input?.provider !== 'esiljang') {
    envelopeErrors.push({ message: 'provider must be esiljang' });
  }
  if (input?.scope !== 'active_advertisements') {
    envelopeErrors.push({ message: 'scope must be active_advertisements' });
  }
  const activeFilter = input?.activeFilter;
  if (activeFilter?.dataValue !== 'ad') {
    envelopeErrors.push({ message: 'activeFilter.dataValue must be ad' });
  }
  if (activeFilter?.selected !== true) {
    envelopeErrors.push({ message: 'activeFilter.selected must be true' });
  }

  const observedAtErrors = [];
  const observedAt = normalizeDate(
    input?.observedAt,
    'observedAt',
    observedAtErrors,
  );
  if (!observedAt && observedAtErrors.length === 0) {
    observedAtErrors.push('observedAt is required');
  } else if (
    observedAt &&
    !/[T ]\d{2}:\d{2}/.test(String(input.observedAt))
  ) {
    observedAtErrors.push('observedAt must include a capture time');
  }
  envelopeErrors.push(
    ...observedAtErrors.map((message) => ({ message })),
  );

  const expectedTotal =
    input?.expectedTotal === null || input?.expectedTotal === undefined
      ? null
      : Number(input.expectedTotal);
  if (
    expectedTotal !== null &&
    (!Number.isInteger(expectedTotal) || expectedTotal < 0)
  ) {
    envelopeErrors.push({
      message: 'expectedTotal must be a non-negative integer or null',
    });
  }
  const activeFilterCount =
    activeFilter?.count === null || activeFilter?.count === undefined
      ? null
      : Number(activeFilter.count);
  if (
    activeFilterCount !== null &&
    (!Number.isInteger(activeFilterCount) || activeFilterCount < 0)
  ) {
    envelopeErrors.push({
      message: 'activeFilter.count must be a non-negative integer or null',
    });
  } else if (activeFilterCount !== expectedTotal) {
    envelopeErrors.push({
      message: 'activeFilter.count must match expectedTotal',
    });
  }

  const visitedPages = Array.isArray(input?.visitedPages)
    ? input.visitedPages.map(Number)
    : [];
  const rawItems = Array.isArray(input?.items) ? input.items : [];
  const normalizedItems = rawItems.map((item, index) =>
    normalizeItem(item, observedAt, index),
  );
  const errors = [
    ...envelopeErrors,
    ...normalizedItems.flatMap((entry) => entry.errors),
  ];
  const output = {
    provider: 'esiljang',
    scope: 'active_advertisements',
    activeFilter: {
      dataValue: cleanText(activeFilter?.dataValue),
      selected: activeFilter?.selected === true,
      count: activeFilterCount,
    },
    observedAt,
    expectedTotal,
    paginationComplete: input?.paginationComplete === true,
    visitedPages,
    items: normalizedItems.map((entry) => entry.item),
    errors,
    warnings: normalizedItems.flatMap((entry) => entry.warnings),
  };

  return output;
}

async function main() {
  const output = normalizeSnapshot(await readInput());
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.errors.length > 0) process.exitCode = 1;
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
