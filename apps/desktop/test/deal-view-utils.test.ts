import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  dealDisplayGroups,
  getDealDisplayGroupKey,
  getDealNotionListGroups,
  getDealPipelineHealth,
  getDealProgressStep,
  getDealStageAgeDays,
  getDealTitle,
  getNextDealPaymentSummary,
  getWeightedCommissionValue,
  sortDealsForDisplay,
  summarizeDealGroup,
  type DealListItem,
} from '../src/renderer/routes/_authenticated/deals/-deal-view-utils';

const dealBoardSource = readFileSync(
  new URL('../src/renderer/routes/_authenticated/deals/-deal-board.tsx', import.meta.url),
  'utf8',
);

describe('deal view utilities', () => {
  it('거래 카드 제목에 단지명·동·호를 표시한다', () => {
    const target = deal({
      property: {
        id: 'property-1',
        officeId: 'office',
        siteId: 'site-1',
        unitId: 'unit-1',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        site: {
          id: 'site-1',
          name: '그라시움',
          type: 'apartment',
          roadAddress: null,
          jibunAddress: null,
        },
        unit: {
          id: 'unit-1',
          name: '302',
          floor: 3,
          exclusiveAreaM2: 84,
          supplyAreaM2: 112,
          dong: { id: 'dong-1', name: '102', isPlaceholder: false },
        },
      },
    });

    assert.equal(getDealTitle(target), '그라시움 102동 302호');

    assert.ok(target.property?.unit);
    target.property.unit.dong = {
      id: 'dong-placeholder',
      name: '-',
      isPlaceholder: true,
    };
    assert.equal(getDealTitle(target), '그라시움 302호');
  });

  it('maps the post-matching deal stages into five execution groups', () => {
    assert.deepEqual(
      dealDisplayGroups.map((group) => group.label),
      ['계약 준비', '가계약', '본계약', '중도금·잔금', '잔금 완료'],
    );

    assert.equal(getDealDisplayGroupKey('preparing'), 'preparing');
    assert.equal(getDealDisplayGroupKey('selection'), 'preparing');
    assert.equal(getDealDisplayGroupKey('negotiating'), 'preparing');
    assert.equal(getDealDisplayGroupKey('preContract'), 'preContract');
    assert.equal(getDealDisplayGroupKey('contracted'), 'contracted');
    assert.equal(getDealDisplayGroupKey('settling'), 'settling');
    assert.equal(getDealDisplayGroupKey('completed'), 'completed');
    assert.equal(getDealDisplayGroupKey('closed'), 'closed');
  });

  it('returns progress steps for board card progress bars', () => {
    assert.equal(getDealProgressStep('preparing'), 1);
    assert.equal(getDealProgressStep('preContract'), 2);
    assert.equal(getDealProgressStep('contracted'), 3);
    assert.equal(getDealProgressStep('settling'), 4);
    assert.equal(getDealProgressStep('completed'), 5);
  });

  it('keeps compact kanban columns while treating all space below each as its drop lane', () => {
    assert.match(dealBoardSource, /collisionDetection=\{dealBoardCollisionDetection\}/);
    assert.match(dealBoardSource, /pointerWithin\(args\)/);
    assert.match(dealBoardSource, /args\.pointerCoordinates/);
    assert.match(dealBoardSource, /if \(y >= boardTop\)/);
    assert.doesNotMatch(dealBoardSource, /boardBottom/);
    assert.match(dealBoardSource, /rectIntersection\(args\)/);
    assert.match(dealBoardSource, /flex min-w-max items-start gap-3/);
    assert.match(dealBoardSource, /shrink-0 self-start flex-col/);
    assert.doesNotMatch(dealBoardSource, /items-stretch/);
  });

  it('summarizes a display group count and deal amount total', () => {
    const deals: DealListItem[] = [
      deal({ id: 'd1', stage: 'preparing', agreedPrice: 128000 }),
      deal({ id: 'd3', stage: 'preContract', agreedPrice: 87000 }),
    ];

    assert.deepEqual(summarizeDealGroup(deals, 'preparing'), {
      count: 1,
      amountTotal: 128000,
    });
  });

  it('builds Notion-style list groups with row numbers scoped per stage group', () => {
    const groups = getDealNotionListGroups([
      deal({ id: 'settling-1', stage: 'settling', agreedPrice: 132000 }),
      deal({ id: 'preparing-1', stage: 'preparing', agreedPrice: 268000 }),
      deal({ id: 'preparing-2', stage: 'preparing', agreedPrice: 88000 }),
    ]);

    const preparing = groups.find((group) => group.group.key === 'preparing');
    const settling = groups.find((group) => group.group.key === 'settling');

    assert.deepEqual(
      preparing?.rows.map((row) => ({ rowNumber: row.rowNumber, id: row.deal.id })),
      [
        { rowNumber: 1, id: 'preparing-1' },
        { rowNumber: 2, id: 'preparing-2' },
      ],
    );
    assert.equal(preparing?.summary.count, 2);
    assert.equal(preparing?.summary.amountTotal, 356000);

    assert.deepEqual(
      settling?.rows.map((row) => ({ rowNumber: row.rowNumber, id: row.deal.id })),
      [{ rowNumber: 1, id: 'settling-1' }],
    );
  });

  it('selects the nearest unpaid payment and marks urgent schedules', () => {
    const summary = getNextDealPaymentSummary(
      deal({
        stage: 'contracted',
        payments: [
          payment({
            id: 'paid',
            kind: 'contract',
            scheduledDate: '2026-04-15T00:00:00.000Z',
            status: 'paid',
          }),
          payment({
            id: 'interim',
            kind: 'interim',
            scheduledDate: '2026-04-28T00:00:00.000Z',
          }),
          payment({
            id: 'balance',
            kind: 'balance',
            scheduledDate: '2026-05-12T00:00:00.000Z',
          }),
        ],
      }),
      new Date('2026-04-25T00:00:00.000Z'),
    );

    assert.equal(summary?.payment.id, 'interim');
    assert.equal(summary?.daysUntil, 3);
    assert.equal(summary?.isUrgent, true);
    assert.equal(summary?.label, '중도금');
  });

  it('marks overdue schedules and stale stages as pipeline risks', () => {
    const referenceDate = new Date('2026-05-10T00:00:00.000Z');
    const overdue = deal({
      id: 'overdue',
      stage: 'settling',
      stageChangedAt: '2026-05-08T00:00:00.000Z',
      payments: [payment({ scheduledDate: '2026-05-07T00:00:00.000Z' })],
    });
    const stale = deal({
      id: 'stale',
      stage: 'preparing',
      stageChangedAt: '2026-04-28T00:00:00.000Z',
    });

    assert.equal(getDealPipelineHealth(overdue, referenceDate).state, 'overdue');
    assert.equal(getDealPipelineHealth(stale, referenceDate).state, 'stale');
    assert.equal(getDealStageAgeDays(stale, referenceDate), 12);
    assert.deepEqual(
      sortDealsForDisplay([stale, overdue], referenceDate).map((item) => item.id),
      [overdue.id, stale.id],
    );
  });

  it('marks contract stages without a next schedule as at risk', () => {
    const health = getDealPipelineHealth(
      deal({
        stage: 'contracted',
        stageChangedAt: '2026-05-08T00:00:00.000Z',
        payments: [],
      }),
      new Date('2026-05-10T00:00:00.000Z'),
    );

    assert.equal(health.state, 'unscheduled');
    assert.equal(health.isAtRisk, true);
  });

  it('calculates stage-weighted expected commission', () => {
    assert.equal(
      getWeightedCommissionValue(
        deal({
          stage: 'contracted',
          commissionSummary: {
            billed: 1000,
            ourShare: 800,
            partnerShare: 200,
            collected: 0,
          },
        }),
      ),
      640,
    );
  });
});

function deal(overrides: Partial<DealListItem> = {}): DealListItem {
  return {
    id: 'deal',
    officeId: 'office',
    propertyId: null,
    listingId: null,
    externalListingId: null,
    matchId: null,
    stage: 'preparing',
    stageChangedAt: '2026-04-20T00:00:00.000Z',
    isCancelled: false,
    cancelledAt: null,
    cancelReason: null,
    cancelledBy: null,
    buyerContactId: null,
    sellerContactId: null,
    transactionType: 'sale',
    agreedPrice: null,
    agreedDeposit: null,
    agreedMonthlyRent: null,
    agreedMoveInDate: null,
    specialTerms: null,
    preContractCarriedOver: false,
    isJointBrokerage: false,
    ourSide: null,
    partnerBrokerId: null,
    memo: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  };
}

function payment(overrides: Partial<NonNullable<DealListItem['payments']>[number]>) {
  return {
    id: 'payment',
    officeId: 'office',
    dealId: 'deal',
    kind: 'balance',
    sequence: 1,
    scheduledAmount: 1000,
    scheduledDate: null,
    paidAmount: null,
    paidAt: null,
    status: 'pending',
    method: null,
    accountInfo: null,
    payerName: null,
    receiptUrl: null,
    memo: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  };
}
