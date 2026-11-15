import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListingAdvertisement } from '@estate-erp/api-client';
import {
  buildAdRequestTask, buildManualAdPayload, initialAdTerms, initialManualAdDraft,
  type AdListing, type AdRequestTarget,
} from '../src/renderer/routes/_authenticated/properties/-components/property-ad-actions-state';

const listing: AdListing = { id: 'listing-1', transactionType: 'sale', price: 319000, deposit: null, monthlyRent: null };
const ad = {
  id: 'ad-1', listingId: listing.id, channel: 'esiljang', source: 'cp_sync', status: 'active',
  advertisedPrice: 315000, advertisedDeposit: null, advertisedMonthlyRent: null,
  startedAt: '2026-11-14T14:23:00.000Z', endedAt: null, url: null, memo: '기존 메모',
  externalAdId: 'cp-123', naverArticleNo: 'naver-456',
} as ListingAdvertisement;
const target: AdRequestTarget = { listing, advertisement: ad, channel: ad.channel, terms: initialAdTerms(listing, ad) };
const request = { title: '광고 조건 변경', notes: '요청사항', action: 'update' as const, targets: [target], location: '단지 102동 3401호', propertyId: 'property-1', intakeId: 'intake-1' };

describe('manual advertisement edits', () => {
  it('prefills observed ad values and sends only changed fields, retaining source, identifiers and exact dates', () => {
    const draft = initialManualAdDraft(listing, ad);
    assert.equal(draft.advertisedPrice, '315000');
    assert.deepEqual(buildManualAdPayload(listing, { ...draft, memo: '수정 메모' }, ad), { memo: '수정 메모' });
    assert.deepEqual(buildManualAdPayload(listing, { ...draft, advertisedPrice: '' }, ad), { advertisedPrice: null });
    assert.equal(initialAdTerms(listing, { ...ad, advertisedPrice: null }).advertisedPrice, '');
    assert.throws(() => buildManualAdPayload(listing, draft, ad), /변경한 내용/);
  });
  it('creates the correct monthly payload, including a real zero deposit', () => {
    const monthly = { ...listing, transactionType: 'monthly', price: null, deposit: 0, monthlyRent: 180 };
    const payload = buildManualAdPayload(monthly, { ...initialManualAdDraft(monthly), startedAt: '2026-11-15' });
    assert.deepEqual(payload, { listingId: listing.id, channel: 'esiljang', source: 'manual', status: 'active',
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

describe('advertisement request tasks', () => {
  it('makes one ordinary task with explicit identities and independent terms for multiple ads', () => {
    const task = buildAdRequestTask({ ...request, targets: [target, { ...target, advertisement: { ...ad, id: 'ad-2' }, terms: { ...target.terms, advertisedPrice: '320000' } }] });
    assert.equal(task.category, 'advertisement');
    assert.equal(task.status, 'pending');
    assert.equal(task.listingId, listing.id);
    assert.equal(task.propertyId, 'property-1');
    for (const expected of ['listingAdvertisementId=ad-1', 'listingAdvertisementId=ad-2', 'externalAdId=cp-123', 'naverArticleNo=naver-456', '매매가=315000만원', '매매가=320000만원']) assert.ok(task.content?.includes(expected));
  });
  it('does not assign a multi-listing request to an arbitrary listing', () => {
    const task = buildAdRequestTask({ ...request, targets: [target, { ...target, listing: { ...listing, id: 'listing-2' } }] });
    assert.equal(task.listingId, undefined);
  });
  it('validates requested terms, allows zero monthly deposit, and omits terms for ending ads', () => {
    const empty = { ...target, terms: { advertisedPrice: '', advertisedDeposit: '', advertisedMonthlyRent: '' } };
    assert.throws(() => buildAdRequestTask({ ...request, targets: [empty] }), /가격/);
    const ended = buildAdRequestTask({ ...request, action: 'end', targets: [empty] });
    assert.match(ended.content!, /광고 종료/);
    assert.doesNotMatch(ended.content!, /요청조건/);
    const monthly = { ...target, listing: { ...listing, transactionType: 'monthly' }, terms: { ...target.terms, advertisedDeposit: '0', advertisedMonthlyRent: '100' } };
    assert.match(buildAdRequestTask({ ...request, action: 'republish', targets: [monthly] }).content!, /보증금=0만원, 월세=100만원, 재광고=요청/);
  });
  it('supports an unadvertised listing request with explicit channel and rejects duplicates', () => {
    const fresh = { listing, channel: 'esiljang', terms: initialAdTerms(listing) };
    const task = buildAdRequestTask({ ...request, action: 'create', targets: [fresh] });
    assert.match(task.content!, /요청작업: 광고 등록/);
    assert.match(task.content!, /listingId=listing-1, channel=esiljang/);
    assert.doesNotMatch(task.content!, /listingAdvertisementId/);
    assert.throws(() => buildAdRequestTask({ ...request, action: 'create', targets: [{ ...fresh, listing: { ...listing, activeAdvertisements: [ad] } }] }), /진행 중/);
    assert.throws(() => buildAdRequestTask({ ...request, title: '  ' }), /제목/);
  });
});
