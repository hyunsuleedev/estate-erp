import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildViewingCalendarEventPayload,
  getMatchListingGroups,
  getMatchStageGroups,
  getUpcomingViewingEvent,
  matchStageGroups,
  type MatchViewListItem,
} from '../src/routes/_authenticated/matches/-match-view-utils';

describe('match view utilities', () => {
  it('groups matches by listing and sorts groups by updated match recency', () => {
    const groups = getMatchListingGroups([
      match({ id: 'a-old', listingId: 'listing-a', updatedAt: '2026-04-20T00:00:00.000Z' }),
      match({ id: 'b-new', listingId: 'listing-b', updatedAt: '2026-04-23T00:00:00.000Z' }),
      match({ id: 'a-new', listingId: 'listing-a', updatedAt: '2026-04-25T00:00:00.000Z' }),
    ]);

    assert.deepEqual(
      groups.map((group) => ({
        listingId: group.listingId,
        matchIds: group.matches.map((item) => item.id),
      })),
      [
        { listingId: 'listing-a', matchIds: ['a-new', 'a-old'] },
        { listingId: 'listing-b', matchIds: ['b-new'] },
      ],
    );
    assert.deepEqual(groups[0].summary, { total: 2, active: 2, converted: 0, closed: 0 });
  });

  it('keeps dealCreated and closed out of active listing counts', () => {
    const groups = getMatchListingGroups([
      match({ id: 'active', listingId: 'listing-a', stage: 'viewing' }),
      match({ id: 'deal', listingId: 'listing-a', stage: 'dealCreated' }),
      match({ id: 'closed', listingId: 'listing-a', stage: 'closed' }),
    ]);

    assert.deepEqual(groups[0].summary, { total: 3, active: 1, converted: 1, closed: 1 });
  });

  it('builds stage groups in configured stage order and omits empty groups by default', () => {
    const groups = getMatchStageGroups([
      match({ id: 'negotiating', stage: 'negotiating' }),
      match({ id: 'suggested', stage: 'suggested' }),
    ]);

    assert.deepEqual(
      groups.map((group) => ({
        stage: group.stage,
        rowNumbers: group.rows.map((row) => row.rowNumber),
        ids: group.rows.map((row) => row.match.id),
      })),
      [
        { stage: 'suggested', rowNumbers: [1], ids: ['suggested'] },
        { stage: 'negotiating', rowNumbers: [1], ids: ['negotiating'] },
      ],
    );
    assert.equal(matchStageGroups[0].stage, 'suggested');
    assert.equal(matchStageGroups.at(-1)?.stage, 'closed');
  });

  it('finds the nearest upcoming viewing event for a match', () => {
    const upcoming = getUpcomingViewingEvent(
      match({
        calendarEvents: [
          calendarEvent({ id: 'past', start: '2026-05-01T10:00:00.000Z', type: 'viewing' }),
          calendarEvent({ id: 'meeting', start: '2026-05-02T11:00:00.000Z', type: 'meeting' }),
          calendarEvent({ id: 'later', start: '2026-05-04T09:00:00.000Z', type: 'viewing' }),
          calendarEvent({ id: 'next', start: '2026-05-03T14:00:00.000Z', type: 'viewing' }),
        ],
      }),
      new Date('2026-05-02T00:00:00.000Z'),
    );

    assert.equal(upcoming?.id, 'next');
  });

  it('builds a viewing calendar payload linked to the match context', () => {
    const payload = buildViewingCalendarEventPayload(
      match({
        id: 'match-1',
        listingId: 'listing-1',
        propertyId: 'property-1',
        buyerRequirement: {
          id: 'buyer-req-1',
          officeId: 'office',
          contactId: 'contact-1',
          status: 'active',
          urgency: 'normal',
          transactionType: 'sale',
          siteTypes: ['apartment'],
          priceMin: null,
          priceMax: null,
          depositMin: null,
          depositMax: null,
          monthlyRentMax: null,
          areaMin: null,
          areaMax: null,
          mustConditions: [],
          preferConditions: [],
          moveInDate: null,
          assignedToId: null,
          lastContactDate: null,
          nextContactDate: null,
          memo: null,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          contact: { id: 'contact-1', name: '강학군', phone: '01030010004' },
        },
        listing: {
          id: 'listing-1',
          officeId: 'office',
          propertyId: 'property-1',
          transactionType: 'sale',
          price: 242000,
          deposit: null,
          monthlyRent: null,
          moveInAvailableType: null,
          moveInAvailableFrom: null,
          moveInAvailableTo: null,
          isJointBrokerageRequired: false,
          jointBrokeragePartnerId: null,
          isHidden: false,
          memo: null,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          property: {
            id: 'property-1',
            siteId: 'site-1',
            unitId: null,
            memo: null,
            site: {
              id: 'site-1',
              name: '고덕그라시움',
              type: 'apartment',
              roadAddress: '서울시 강동구 고덕동',
              jibunAddress: null,
            },
          },
        },
      }),
      '2026-05-03T14:30',
      90,
    );

    assert.equal(payload.type, 'viewing');
    assert.equal(payload.matchId, 'match-1');
    assert.equal(payload.listingId, 'listing-1');
    assert.equal(payload.propertyId, 'property-1');
    assert.equal(payload.contactId, 'contact-1');
    assert.equal(payload.start, new Date('2026-05-03T14:30').toISOString());
    assert.equal(payload.end, new Date('2026-05-03T16:00').toISOString());
    assert.match(payload.title, /강학군/);
    assert.match(payload.title, /고덕그라시움/);
  });
});

function calendarEvent(overrides: Partial<NonNullable<MatchViewListItem['calendarEvents']>[number]> = {}) {
  return {
    id: 'event',
    officeId: 'office',
    userId: 'user',
    title: '방문',
    description: null,
    type: 'viewing',
    allDay: false,
    start: '2026-05-03T14:00:00.000Z',
    end: '2026-05-03T15:00:00.000Z',
    color: null,
    propertyId: null,
    listingId: null,
    contactId: null,
    matchId: null,
    dealId: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  };
}

function match(overrides: Partial<MatchViewListItem> = {}): MatchViewListItem {
  return {
    id: 'match',
    officeId: 'office',
    listingId: 'listing',
    propertyId: 'property',
    buyerReqId: 'buyer-req',
    stage: 'suggested',
    memo: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  };
}
