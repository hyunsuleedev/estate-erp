#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
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

function validateMoney(item, field, index, errors) {
  const value = item[field];
  if (
    value !== null &&
    value !== undefined &&
    (!Number.isInteger(value) || value < 0)
  ) {
    errors.push(
      `items[${index}].${field} must be a non-negative integer or null`,
    );
  }
}

function validateProviderUrl(value, index, errors) {
  if (value === null || value === undefined) return;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!(host === 'aipartner.com' || host.endsWith('.aipartner.com'))) {
      errors.push(`items[${index}].providerUrl must use an AIPartner host`);
    }
  } catch {
    errors.push(`items[${index}].providerUrl must be a valid URL`);
  }
}

function validateNaverIdentity(item, index, errors) {
  if (!item?.naverUrl) return;
  try {
    const url = new URL(item.naverUrl);
    const host = url.hostname.toLowerCase();
    if (!(host === 'naver.com' || host.endsWith('.naver.com'))) {
      errors.push(`items[${index}].naverUrl must use a Naver-owned host`);
      return;
    }
    const queryValue =
      url.searchParams.get('articleNo') ?? url.searchParams.get('article_no');
    const pathValue = url.pathname.match(/\/articles?\/(\d+)(?:\/|$)/)?.[1];
    const urlArticleNo = queryValue ?? pathValue ?? null;
    if (
      urlArticleNo &&
      item.naverArticleNo &&
      String(item.naverArticleNo) !== urlArticleNo
    ) {
      errors.push(
        `items[${index}].naverArticleNo does not match its Naver URL`,
      );
    }
  } catch {
    errors.push(`items[${index}].naverUrl must be a valid URL`);
  }
}

export function validateSnapshot(snapshot) {
  const errors = [];
  const warnings = Array.isArray(snapshot?.warnings)
    ? [...snapshot.warnings]
    : [];
  const activeFilter =
    snapshot?.activeFilter ??
    (snapshot?.status === 'succeeded' && snapshot?.manifestHash
      ? {
          dataValue: 'ad',
          selected: true,
          count: snapshot?.expectedTotal ?? null,
        }
      : null);

  if (snapshot?.provider !== 'esiljang') errors.push('provider must be esiljang');
  if (snapshot?.scope !== 'active_advertisements') {
    errors.push('scope must be active_advertisements');
  }
  if (activeFilter?.dataValue !== 'ad') {
    errors.push('activeFilter.dataValue must be ad');
  }
  if (activeFilter?.selected !== true) {
    errors.push('activeFilter.selected must be true');
  }
  if (!snapshot?.observedAt || Number.isNaN(Date.parse(snapshot.observedAt))) {
    errors.push('observedAt must be a valid timestamp');
  }
  if (snapshot?.paginationComplete !== true) {
    errors.push('paginationComplete must be true');
  }
  if (Array.isArray(snapshot?.errors) && snapshot.errors.length > 0) {
    errors.push('normalization errors must be resolved before completion');
  }

  const pages = Array.isArray(snapshot?.visitedPages)
    ? snapshot.visitedPages
    : [];
  if (
    pages.length === 0 ||
    pages.some((page) => !Number.isInteger(page) || page < 1)
  ) {
    errors.push('visitedPages must contain positive integers');
  } else {
    const uniquePages = new Set(pages);
    if (uniquePages.size !== pages.length) {
      errors.push('visitedPages must not contain duplicates');
    }
    const expectedPages = Array.from(
      { length: Math.max(...pages) },
      (_, index) => index + 1,
    );
    if (JSON.stringify(pages) !== JSON.stringify(expectedPages)) {
      errors.push('visitedPages must be ordered and contiguous from page 1');
    }
  }

  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const ids = new Set();
  items.forEach((item, index) => {
    if (item?.provider !== 'esiljang') {
      errors.push(`items[${index}].provider must be esiljang`);
    }
    if (typeof item?.externalAdId !== 'string' || !item.externalAdId.trim()) {
      errors.push(`items[${index}].externalAdId is required`);
    } else if (ids.has(item.externalAdId)) {
      errors.push(`duplicate externalAdId: ${item.externalAdId}`);
    } else {
      ids.add(item.externalAdId);
    }
    if (!Number.isInteger(item?.sourcePage) || !pages.includes(item.sourcePage)) {
      errors.push(`items[${index}].sourcePage must appear in visitedPages`);
    }
    if (
      item?.naverArticleNo !== null &&
      item?.naverArticleNo !== undefined &&
      !/^\d+$/.test(String(item.naverArticleNo))
    ) {
      errors.push(`items[${index}].naverArticleNo must contain digits only`);
    }
    if (item?.observedAt !== snapshot?.observedAt) {
      errors.push(`items[${index}].observedAt must match snapshot observedAt`);
    }
    validateNaverIdentity(item, index, errors);
    validateProviderUrl(item?.providerUrl, index, errors);
    validateMoney(item, 'advertisedPrice', index, errors);
    validateMoney(item, 'advertisedDeposit', index, errors);
    validateMoney(item, 'advertisedMonthlyRent', index, errors);
  });

  const expectedTotal = snapshot?.expectedTotal;
  if (expectedTotal === null || expectedTotal === undefined) {
    warnings.push({
      message:
        'active filter total was unavailable; terminal pagination is the only completeness signal',
    });
  } else if (!Number.isInteger(expectedTotal) || expectedTotal < 0) {
    errors.push('expectedTotal must be a non-negative integer or null');
  } else if (expectedTotal !== items.length) {
    errors.push(
      `expectedTotal ${expectedTotal} does not match ${items.length} collected items`,
    );
  }
  if (activeFilter?.count !== expectedTotal) {
    errors.push('activeFilter.count must match expectedTotal');
  }
  if (
    snapshot?.collectedTotal !== undefined &&
    snapshot.collectedTotal !== items.length
  ) {
    errors.push('collectedTotal must match items.length');
  }
  if (
    snapshot?.pageCount !== undefined &&
    snapshot.pageCount !== pages.length
  ) {
    errors.push('pageCount must match visitedPages.length');
  }

  const manifest = canonicalize({
    provider: snapshot?.provider,
    scope: snapshot?.scope,
    activeFilter,
    observedAt: snapshot?.observedAt,
    expectedTotal: expectedTotal ?? null,
    paginationComplete: snapshot?.paginationComplete,
    visitedPages: pages,
    items: [...items].sort((left, right) =>
      String(left?.externalAdId ?? '').localeCompare(
        String(right?.externalAdId ?? ''),
      ),
    ),
  });
  const manifestHash = createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex');
  if (
    snapshot?.manifestHash !== undefined &&
    snapshot.manifestHash !== manifestHash
  ) {
    errors.push('manifestHash does not match the canonical snapshot manifest');
  }
  const valid = errors.length === 0;
  const report = {
    valid,
    complete: valid,
    manifestHash,
    counts: {
      pages: pages.length,
      items: items.length,
      uniqueExternalAdIds: ids.size,
    },
    errors,
    warnings,
  };
  return report;
}

async function main() {
  const report = validateSnapshot(await readInput());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
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
