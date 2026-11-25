import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListingAdvertisement } from '@estate-erp/api-client';
import {
  buildAdChangeRequestsBatch, buildManualAdPayload, initialAdTerms, initialManualAdDraft,
  type AdListing, type AdRequestTarget,
} from '../src/renderer/routes/_authenticated/properties/-components/property-ad-actions-state';

const listing: AdListing = { id: 'listing-1', transactionType: 'sale', price: 319000, deposit: null, monthlyRent: null };
const ad = {
  id: 'ad-1', listingId: listing.id, channel: 'esiljang', status: 'active',
  advertisedPrice: 315000, advertisedDeposit: null, advertisedMonthlyRent: null,
  startedAt: '2026-11-14T14:23:00.000Z', endedAt: null, url: null, memo: '기존 메모',
  externalAdId: 'cp-123', naverArticleNo: 'naver-456', lastSyncedAt: '2026-11-15T00:00:00.000Z',
} as ListingAdvertisement;
const target: AdRequestTarget = { listing, advertisement: ad, channel: ad.channel, terms: initialAdTerms(listing, ad) };
const request = { title: '광고 조건 변경', notes: '요청사항', action: 'update' as const, targets: [target] };

describe('manual advertisement edits', () => {
  it('prefills observed ad values (including jeonse listing.price -> advertisedDeposit) and sends only changed fields', () => {
    const draft = initialManualAdDraft(listing, ad);
    assert.equal(draft.advertisedPrice, '315000');
    assert.deepEqual(buildManualAdPayload(listing, { ...draft, memo: '수정 메모' }, ad), { memo: '수정 메모' });
    assert.deepEqual(buildManualAdPayload(listing, { ...draft, advertisedPrice: '' }, ad), { advertisedPrice: null });
    assert.equal(initialAdTerms(listing, { ...ad, advertisedPrice: null }).advertisedPrice, '');
    assert.throws(() => buildManualAdPayload(listing, draft, ad), /변경한 내용/);

    const jeonse: AdListing = { id: 'listing-j', transactionType: 'jeonse', price: 85000, deposit: null, monthlyRent: null };
    assert.deepEqual(initialAdTerms(jeonse), { advertisedPrice: '', advertisedDeposit: '85000', advertisedMonthlyRent: '' });
  });
  it('creates the correct monthly payload, including a real zero deposit', () => {
    const monthly = { ...listing, transactionType: 'monthly', price: null, deposit: 0, monthlyRent: 180 };
    const payload = buildManualAdPayload(monthly, { ...initialManualAdDraft(monthly), startedAt: '2026-11-15' });
    assert.deepEqual(payload, { listingId: listing.id, channel: 'esiljang', status: 'active',
      advertisedDeposit: 0, advertisedMonthlyRent: 180, startedAt: '2026-11-15T00:00:00.000Z', endedAt: null, url: null, memo: null });
  });
  it('rejects invalid amounts, unsafe links, impossible dates and backwards end dates', () => {
    const draft = initialManualAdDraft(listing, ad);
    for (const advertisedPrice of ['-1', '1.5', 'NaN', '1e5', '9007199254740992']) {
      assert.throws(() => buildManualAdPayload(listing, { ...draft, advertisedPrice }, ad), /금액/);
    }
    assert.throws(() => buildManualAdPayload(listing, { ...draft, url: 'javascript:alert(1)' }, ad), /주소/);
    assert.throws(() => buildManualAdPayload(listing, { ...draft, startedAt: '2026-02-30' }, ad), /날짜/);
    assert.throws(() => buildManualAdPayload(listing, { ...draft, status: 'ended', endedAt: '2026-11-01' }, ad), /등록일/);
    assert.deepEqual(buildManualAdPayload(listing, { ...draft, status: 'ended', endedAt: '2026-11-15' }, ad), { status: 'ended', endedAt: '2026-11-15T00:00:00.000Z' });
  });
  it('prevents duplicate active ads and never reactivates an ended history', () => {
    const current = { ...listing, activeAdvertisements: [ad] };
    assert.equal(initialManualAdDraft(current).channel, 'budongsanbank');
    assert.equal(initialManualAdDraft({ ...current, activeAdvertisements: [ad, { ...ad, id: 'ad-2', channel: 'budongsanbank' }] }).channel, 'gongsilclub');
    assert.throws(() => buildManualAdPayload(current, { ...initialManualAdDraft(current), channel: 'esiljang' }), /진행 중/);
    assert.throws(() => buildManualAdPayload(listing, { ...initialManualAdDraft(listing, ad), status: 'active' }, { ...ad, status: 'ended' }), /새 광고/);
  });
});

describe('advertisement change requests batch', () => {
  it('builds one batch payload with explicit identities and independent terms for multiple ads', () => {
    const batch = buildAdChangeRequestsBatch({
      ...request,
      targets: [target, { ...target, advertisement: { ...ad, id: 'ad-2' }, terms: { ...target.terms, advertisedPrice: '320000' } }],
    });
    assert.equal(batch.title, '광고 조건 변경');
    assert.equal(batch.memo, '요청사항');
    assert.equal(batch.items.length, 2);
    assert.deepEqual(batch.items[0], {
      action: 'update',
      advertisementId: 'ad-1',
      listingId: listing.id,
      channel: 'esiljang',
      targetValue: { price: 315000 },
    });
    assert.deepEqual(batch.items[1], {
      action: 'update',
      advertisementId: 'ad-2',
      listingId: listing.id,
      channel: 'esiljang',
      targetValue: { price: 320000 },
    });
  });
  it('validates requested terms, allows zero monthly deposit, and omits terms for takedowns', () => {
    const empty = { ...target, terms: { advertisedPrice: '', advertisedDeposit: '', advertisedMonthlyRent: '' } };
    assert.throws(() => buildAdChangeRequestsBatch({ ...request, targets: [empty] }), /가격/);
    const takedown = buildAdChangeRequestsBatch({ ...request, action: 'takedown', targets: [empty] });
    assert.equal(takedown.items[0].action, 'takedown');
    assert.deepEqual(takedown.items[0].targetValue, {});
    const monthly = { ...target, listing: { ...listing, transactionType: 'monthly' }, terms: { ...target.terms, advertisedDeposit: '0', advertisedMonthlyRent: '100' }, floorExposure: 'exact' as const };
    const readvertise = buildAdChangeRequestsBatch({ ...request, action: 'readvertise', targets: [monthly] });
    assert.equal(readvertise.items[0].action, 'readvertise');
    assert.deepEqual(readvertise.items[0].targetValue, { deposit: 0, monthlyRent: 100, floorExposure: 'exact' });
  });
  it('supports a publish request with explicit channel and rejects duplicates', () => {
    const fresh = { listing, channel: 'esiljang', terms: initialAdTerms(listing) };
    const batch = buildAdChangeRequestsBatch({ ...request, action: 'publish', targets: [fresh] });
    assert.deepEqual(batch.items[0], {
      action: 'publish',
      advertisementId: null,
      listingId: 'listing-1',
      channel: 'esiljang',
      targetValue: { price: 319000 },
    });
    assert.throws(() => buildAdChangeRequestsBatch({ ...request, action: 'publish', targets: [{ ...fresh, listing: { ...listing, activeAdvertisements: [ad] } }] }), /진행 중/);
  });
});
