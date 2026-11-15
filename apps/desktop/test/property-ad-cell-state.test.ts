import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListingAdvertisement } from '@estate-erp/api-client';
import { buildAdvertisementCellPatch } from '../src/renderer/routes/_authenticated/properties/-components/property-ad-cell-state';

const ad = { id: 'ad-1', source: 'cp_sync', status: 'active', advertisedPrice: 315000,
  advertisedDeposit: 0, advertisedMonthlyRent: 180, startedAt: '2026-11-14T13:24:00.000Z',
  endedAt: null, memo: null, url: null } as ListingAdvertisement;

describe('advertisement inline edits', () => {
  it('accepts a known CP channel, rejects arbitrary values, and does not rewrite an unchanged legacy channel', () => {
    const manualAd = { ...ad, channel: 'esiljang', source: 'manual' as const };
    assert.deepEqual(buildAdvertisementCellPatch(manualAd, 'channel', 'peterpan'), { channel: 'peterpan' });
    assert.deepEqual(buildAdvertisementCellPatch({ ...ad, channel: 'legacy_cp' }, 'channel', 'legacy_cp'), {});
    for (const value of ['', null, '피터팬', 'unknown_cp']) {
      assert.throws(() => buildAdvertisementCellPatch(ad, 'channel', value), /채널/);
    }
    for (const linked of [ad, { ...manualAd, externalAdId: 'cp-123' }, { ...manualAd, naverArticleNo: '123' },
      { ...manualAd, naverUrl: 'https://land.naver.com/123' }, { ...manualAd, lastSyncedAt: '2026-11-15T00:00:00.000Z' }]) {
      assert.throws(() => buildAdvertisementCellPatch(linked, 'channel', 'peterpan'), /외부 광고/);
    }
  });
  it('writes only the edited amount and distinguishes a zero from an empty cell', () => {
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'advertisedPrice', 319000), { advertisedPrice: 319000 });
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'advertisedMonthlyRent', 0), { advertisedMonthlyRent: 0 });
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'advertisedDeposit', null), { advertisedDeposit: null });
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'advertisedDeposit', 0), {});
    for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => buildAdvertisementCellPatch(ad, 'advertisedPrice', value), /금액/);
    }
  });
  it('leaves source metadata and unrelated invalid fields untouched', () => {
    assert.deepEqual(buildAdvertisementCellPatch({ ...ad, url: 'old-invalid-url' }, 'memo', ' 메모\n두 번째 줄 '), { memo: '메모\n두 번째 줄' });
    assert.deepEqual(buildAdvertisementCellPatch({ ...ad, memo: '기존' }, 'memo', '  '), { memo: null });
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'memo', ''), {});
  });
  it('accepts only web URLs and allows clearing a link', () => {
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'url', ' https://example.com/123 '), { url: 'https://example.com/123' });
    for (const url of ['javascript:alert(1)', 'file:///tmp/x', 'not-a-url']) assert.throws(() => buildAdvertisementCellPatch(ad, 'url', url), /주소/);
    assert.deepEqual(buildAdvertisementCellPatch({ ...ad, url: 'https://example.com' }, 'url', ''), { url: null });
  });
  it('keeps timestamp precision for the same date and validates changed dates', () => {
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'startedAt', '2026-11-14'), {});
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'startedAt', '2026-11-15'), { startedAt: '2026-11-15T00:00:00.000Z' });
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'startedAt', ''), { startedAt: null });
    assert.throws(() => buildAdvertisementCellPatch(ad, 'startedAt', '2026-02-30'), /날짜/);
    assert.throws(() => buildAdvertisementCellPatch({ ...ad, endedAt: '2026-11-15T00:00:00.000Z' }, 'startedAt', '2026-11-16'), /종료일/);
  });
  it('ends an advertisement with a timestamp and forbids reopening its history', () => {
    const before = Date.now();
    const patch = buildAdvertisementCellPatch(ad, 'status', 'ended');
    assert.equal(patch.status, 'ended');
    assert.ok(Date.parse(patch.endedAt!) >= before);
    assert.deepEqual(buildAdvertisementCellPatch(ad, 'status', 'active'), {});
    assert.throws(() => buildAdvertisementCellPatch({ ...ad, status: 'ended' }, 'status', 'active'), /새 광고/);
    assert.throws(() => buildAdvertisementCellPatch(ad, 'status', 'paused'), /상태/);
  });
});
