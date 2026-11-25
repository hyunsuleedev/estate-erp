import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BuyerRequirement, Listing, Match } from '@estate-erp/api-client';
import { parseManwonText } from '../src/renderer/routes/_authenticated/wanted-properties/-money-text';
import {
  buildRecommendationFilter,
  computeListingFit,
  hasSiblingOccupyingDeal,
  scoreListingFit,
} from '../src/renderer/routes/_authenticated/wanted-properties/-listing-fit';
import {
  getMatchClosedReasonText,
  getSiblingOccupyingDeal,
  shouldMoveToViewingOnSchedule,
} from '../src/renderer/routes/_authenticated/wanted-properties/-match-view-utils';

// 금액은 만원, 면적은 m². 30평 = 99.17m², 39평 = 128.93m²
const jeonseRequirement = {
  transactionType: 'jeonse',
  priceMin: 80000,
  priceMax: 90000,
  depositMin: null,
  depositMax: null,
  monthlyRentMin: null,
  monthlyRentMax: null,
  areaMin: 99.17,
  areaMax: 128.93,
  siteTypes: ['apartment'],
  preferredSites: [],
  preferredRegions: [{ id: 'r1', provinceCode: null, districtCode: '11740', wardCode: null }],
} as unknown as BuyerRequirement;

function listing(overrides: Record<string, unknown> = {}): Listing {
  return {
    id: 'listing-1',
    intakeId: 'intake-1',
    transactionType: 'jeonse',
    price: 88000,
    deposit: null,
    monthlyRent: null,
    property: {
      id: 'p1',
      siteId: 'site-1',
      site: { id: 'site-1', name: '고덕그라시움', type: 'apartment', wardCode: '1174010200' },
      unit: { id: 'u1', name: '3301', floor: 33, supplyAreaM2: null, siteUnitType: { supplyAreaM2: '112.40' } },
      listings: [],
    },
    ...overrides,
  } as unknown as Listing;
}

describe('wanted properties: amounts typed the way brokers say them', () => {
  it('reads 억 · 천 · 만 and plain 만원 numbers', () => {
    assert.equal(parseManwonText('90000'), 90000);
    assert.equal(parseManwonText('90,000'), 90000);
    assert.equal(parseManwonText('9억'), 90000);
    assert.equal(parseManwonText('9억 5000'), 95000);
    assert.equal(parseManwonText('9억5천'), 95000);
    assert.equal(parseManwonText('1.5억'), 15000);
    assert.equal(parseManwonText('8000만'), 8000);
    assert.equal(parseManwonText('5천만원'), 5000);
    assert.equal(parseManwonText(''), null);
    assert.ok(Number.isNaN(parseManwonText('이십억')));
    assert.ok(Number.isNaN(parseManwonText('9억 abc')));
  });
});

describe('wanted properties: listing fit for a customer', () => {
  it('asks the server for the customer type, budget and area', () => {
    assert.deepEqual(buildRecommendationFilter(jeonseRequirement), {
      limit: 50,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      transactionType: 'jeonse',
      priceMin: 80000,
      priceMax: 90000,
      areaMin: 99.17,
      areaMax: 128.93,
    });
  });

  it('says what matches and what differs, using the unit-type area when the unit has none', () => {
    const fit = computeListingFit(listing(), jeonseRequirement);
    assert.deepEqual(
      fit.map((check) => [check.key, check.ok]),
      [
        ['transactionType', true],
        ['price', true],
        ['area', true],
        ['place', true],
        ['siteType', true],
      ],
    );
    const tooBig = computeListingFit(
      listing({ price: 95000, transactionType: 'sale' }),
      jeonseRequirement,
    );
    assert.equal(tooBig.find((check) => check.key === 'price')?.ok, false);
    assert.equal(tooBig.find((check) => check.key === 'transactionType')?.ok, false);
    assert.ok(scoreListingFit(tooBig) < scoreListingFit(fit));
  });

  it('flags a listing whose sibling option in the same intake is in a deal', () => {
    const sibling = listing({
      property: {
        ...(listing().property as object),
        listings: [
          { id: 'listing-1', intakeId: 'intake-1', transactionType: 'jeonse', deals: [] },
          { id: 'listing-2', intakeId: 'intake-1', transactionType: 'sale', deals: [{ id: 'd1', stage: 'preContract' }] },
        ],
      },
    });
    assert.equal(hasSiblingOccupyingDeal(sibling), true);
    assert.equal(hasSiblingOccupyingDeal(listing()), false);
  });
});

describe('wanted properties: match state helpers', () => {
  it('finds a deal on the same home that blocks converting this match, but not its own deal', () => {
    const base = {
      listingId: 'listing-1',
      deals: [{ id: 'own', stage: 'preparing', isCancelled: false }],
      listing: {
        transactionType: 'sale',
        deals: [{ id: 'own', stage: 'preparing' }],
        intake: {
          listings: [
            { id: 'listing-1', transactionType: 'sale', deals: [{ id: 'own', stage: 'preparing' }] },
          ],
        },
      },
    } as unknown as Match;
    assert.equal(getSiblingOccupyingDeal(base), null);
    const blocked = {
      ...base,
      deals: [],
      listing: {
        ...base.listing,
        deals: [],
        intake: {
          listings: [
            { id: 'listing-1', transactionType: 'sale', deals: [] },
            { id: 'listing-2', transactionType: 'jeonse', deals: [{ id: 'other', stage: 'preContract' }] },
          ],
        },
      },
    } as unknown as Match;
    assert.deepEqual(getSiblingOccupyingDeal(blocked), {
      transactionType: 'jeonse',
      stage: 'preContract',
      sameListing: false,
    });
  });

  it('explains why a closed match ended', () => {
    assert.equal(
      getMatchClosedReasonText({ stage: 'closed', closedFromStage: 'buyerInterested', closedReason: 'manual' }),
      '관심 없음',
    );
    assert.equal(
      getMatchClosedReasonText({ stage: 'closed', closedFromStage: 'viewing', closedReason: 'other_buyer_contracted' }),
      '다른 손님과 본계약',
    );
    assert.equal(getMatchClosedReasonText({ stage: 'viewing', closedFromStage: null, closedReason: null }), null);
  });

  it('moves to 임장 when a viewing is booked from any earlier stage', () => {
    assert.equal(shouldMoveToViewingOnSchedule('suggested'), true);
    assert.equal(shouldMoveToViewingOnSchedule('buyerInterested'), true);
    assert.equal(shouldMoveToViewingOnSchedule('viewingConfirmed'), true);
    assert.equal(shouldMoveToViewingOnSchedule('viewing'), false);
    assert.equal(shouldMoveToViewingOnSchedule('negotiating'), false);
  });
});
