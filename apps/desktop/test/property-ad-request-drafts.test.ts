import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListingAdvertisement } from '@estate-erp/api-client';
import type { AdListing } from '../src/renderer/routes/_authenticated/properties/-components/property-ad-actions-state';
import {
  buildInlineAdChangeRequestsBatch,
  countPropertyAdDrafts,
  createInitialPublishDraft,
  currentPropertyAdAmount,
  getOpenPropertyAdRequest,
  requestedActionForPropertyAd,
  requestedAmountForPropertyAd,
  setPropertyAdDraftAmount,
  summarizePropertyAdDraft,
  summarizePublishDraft,
  togglePropertyAdDraftFlag,
} from '../src/renderer/routes/_authenticated/properties/-components/property-ad-request-drafts';

const saleListing: AdListing = {
  id: 'listing-sale',
  transactionType: 'sale',
  price: 158000,
  deposit: null,
  monthlyRent: null,
};

const jeonseListing: AdListing = {
  id: 'listing-jeonse',
  transactionType: 'jeonse',
  price: 85000,
  deposit: null,
  monthlyRent: null,
};

const monthlyListing: AdListing = {
  id: 'listing-monthly',
  transactionType: 'monthly',
  price: null,
  deposit: 5000,
  monthlyRent: 200,
};

function makeAd(overrides: Partial<ListingAdvertisement> = {}): ListingAdvertisement {
  return {
    id: 'ad-1',
    officeId: 'office-1',
    cpAccountId: 'acct-1',
    listingId: 'listing-sale',
    channel: 'esiljang',
    status: 'active',
    advertisedPrice: 158000,
    advertisedDeposit: null,
    advertisedMonthlyRent: null,
    startedAt: '2026-11-10T00:00:00.000Z',
    firstSeenAt: '2026-11-10T00:00:00.000Z',
    lastSeenAt: '2026-11-15T00:00:00.000Z',
    endedAt: null,
    url: null,
    memo: null,
    externalAdId: 'cp-1',
    naverArticleNo: 'naver-1',
    naverUrl: null,
    providerStatus: '광고중',
    providerStatusObservedAt: null,
    lastCheckedAt: null,
    lastSyncedAt: '2026-11-15T00:00:00.000Z',
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('inline property ad request drafts', () => {
  it('updates price drafts and clears when reverted to current amount (including jeonse deposit fallback)', () => {
    const saleAd = makeAd();
    let drafts = setPropertyAdDraftAmount({}, saleListing, saleAd, 'primary', 155000);
    assert.deepEqual(drafts, { 'ad-1': { primary: 155000 } });

    drafts = setPropertyAdDraftAmount(drafts, saleListing, saleAd, 'primary', 158000);
    assert.deepEqual(drafts, {});

    const jeonseAd = makeAd({
      id: 'ad-j',
      listingId: 'listing-jeonse',
      advertisedPrice: null,
      advertisedDeposit: 85000,
    });
    assert.equal(currentPropertyAdAmount(jeonseListing, jeonseAd, 'primary'), 85000);
    const jDrafts = setPropertyAdDraftAmount({}, jeonseListing, jeonseAd, 'primary', 82000);
    assert.deepEqual(jDrafts, { 'ad-j': { primary: 82000 } });
  });

  it('keeps takedown mutually exclusive with amount/readvertise and merges readvertise + price update cleanly', () => {
    const ad = makeAd();
    let drafts = setPropertyAdDraftAmount({}, saleListing, ad, 'primary', 154000);
    drafts = togglePropertyAdDraftFlag(drafts, ad.id, 'readvertise');
    assert.deepEqual(drafts, { 'ad-1': { primary: 154000, readvertise: true } });

    drafts = togglePropertyAdDraftFlag(drafts, ad.id, 'takedown');
    assert.deepEqual(drafts, { 'ad-1': { takedown: true } });

    drafts = togglePropertyAdDraftFlag(drafts, ad.id, 'readvertise');
    assert.deepEqual(drafts, { 'ad-1': { readvertise: true } });
  });

  it('prefers local draft over server open changeRequests and formats summary lines', () => {
    const pendingReq = {
      id: 'req-1',
      officeId: 'office-1',
      advertisementId: 'ad-j',
      listingId: 'listing-jeonse',
      channel: 'esiljang',
      cpAccountId: null,
      taskId: 'task-1',
      action: 'readvertise' as const,
      baseSnapshot: null,
      targetValue: { deposit: 81000 },
      status: 'requested' as const,
      failureReason: null,
      memo: null,
      dueDate: null,
      requestedById: null,
      assignedToId: null,
      executedAt: null,
      verifiedAt: null,
      createdAt: '2026-11-20T00:00:00.000Z',
      updatedAt: '2026-11-20T00:00:00.000Z',
    };
    const jeonseAd = makeAd({
      id: 'ad-j',
      listingId: 'listing-jeonse',
      advertisedPrice: null,
      advertisedDeposit: 85000,
      changeRequests: [pendingReq],
    });

    assert.equal(getOpenPropertyAdRequest(jeonseAd)?.id, 'req-1');
    assert.deepEqual(requestedAmountForPropertyAd(jeonseListing, jeonseAd, undefined, 'primary'), {
      kind: 'pending',
      value: 81000,
      status: 'requested',
    });
    assert.deepEqual(requestedActionForPropertyAd(jeonseAd, undefined), {
      kind: 'pending',
      action: 'readvertise',
      status: 'requested',
    });
    assert.deepEqual(
      requestedAmountForPropertyAd(jeonseListing, jeonseAd, { primary: 80000 }, 'primary'),
      { kind: 'draft', value: 80000 },
    );

    assert.match(
      summarizePropertyAdDraft(jeonseListing, jeonseAd, { primary: 80000 }),
      /전세 · 이실장플러스: 전세가 8억 5,000만 → 8억/,
    );
  });

  it('builds one atomic batch payload combining update, readvertise/takedown, and inline publish rows', () => {
    const saleAd = makeAd();
    const monthlyAd = makeAd({
      id: 'ad-m',
      listingId: 'listing-monthly',
      channel: 'budongsanbank',
      cpAccountId: null,
      advertisedPrice: null,
      advertisedDeposit: 5000,
      advertisedMonthlyRent: 200,
    });
    const listings: AdListing[] = [
      { ...saleListing, activeAdvertisements: [saleAd] },
      { ...monthlyListing, activeAdvertisements: [monthlyAd] },
      { ...jeonseListing, activeAdvertisements: [] },
    ];

    let drafts = setPropertyAdDraftAmount({}, saleListing, saleAd, 'primary', 155000);
    drafts = togglePropertyAdDraftFlag(drafts, saleAd.id, 'readvertise');
    drafts = setPropertyAdDraftAmount(drafts, monthlyListing, monthlyAd, 'monthlyRent', 190);

    const publishDraft = createInitialPublishDraft([jeonseListing], []);
    assert.equal(publishDraft.listingId, 'listing-jeonse');
    assert.equal(publishDraft.primary, 85000);
    assert.match(summarizePublishDraft(jeonseListing, publishDraft), /전세 · 이실장플러스: 신규 게재 8억 5,000만/);
    assert.equal(countPropertyAdDrafts(drafts, [publishDraft]), 3);

    const payload = buildInlineAdChangeRequestsBatch({
      listings,
      drafts,
      publishDrafts: [publishDraft],
      title: '매물 광고 일괄 요청',
      assignedToId: null,
      dueDate: '2026-12-01',
      memo: '급매 반영',
    });

    assert.deepEqual(payload, {
      title: '매물 광고 일괄 요청',
      assignedToId: null,
      dueDate: '2026-12-01',
      memo: '급매 반영',
      items: [
        {
          action: 'readvertise',
          advertisementId: 'ad-1',
          listingId: 'listing-sale',
          channel: 'esiljang',
          cpAccountId: 'acct-1',
          targetValue: { price: 155000 },
        },
        {
          action: 'update',
          advertisementId: 'ad-m',
          listingId: 'listing-monthly',
          channel: 'budongsanbank',
          targetValue: { monthlyRent: 190 },
        },
        {
          action: 'publish',
          advertisementId: null,
          listingId: 'listing-jeonse',
          channel: 'esiljang',
          targetValue: { deposit: 85000 },
        },
      ],
    });
  });
});
