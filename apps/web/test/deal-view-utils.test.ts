import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dealDisplayGroups,
  getDealDisplayGroupKey,
  getDealNotionListGroups,
  getDealProgressStep,
  getNextDealPaymentSummary,
  summarizeDealGroup,
  type DealListItem,
} from '../src/routes/_authenticated/deals/-deal-view-utils';

describe('deal view utilities', () => {
  it('maps current deal stages into the five Paper display groups', () => {
    assert.deepEqual(
      dealDisplayGroups.map((group) => group.label),
      ['조율', '가계약', '본계약', '잔금/완료', '정산'],
    );

    assert.equal(getDealDisplayGroupKey('selection'), 'coordination');
    assert.equal(getDealDisplayGroupKey('negotiating'), 'coordination');
    assert.equal(getDealDisplayGroupKey('preContract'), 'preContract');
    assert.equal(getDealDisplayGroupKey('contracted'), 'contracted');
    assert.equal(getDealDisplayGroupKey('settling'), 'settling');
    assert.equal(getDealDisplayGroupKey('completed'), 'completed');
    assert.equal(getDealDisplayGroupKey('closed'), 'closed');
  });

  it('returns progress steps for board card progress bars', () => {
    assert.equal(getDealProgressStep('selection'), 1);
    assert.equal(getDealProgressStep('negotiating'), 1);
    assert.equal(getDealProgressStep('preContract'), 2);
    assert.equal(getDealProgressStep('contracted'), 3);
    assert.equal(getDealProgressStep('settling'), 4);
    assert.equal(getDealProgressStep('completed'), 5);
  });

  it('summarizes a display group count and deal amount total', () => {
    const deals: DealListItem[] = [
      deal({ id: 'd1', stage: 'selection', agreedPrice: 128000 }),
      deal({ id: 'd2', stage: 'negotiating', agreedPrice: 65000 }),
      deal({ id: 'd3', stage: 'preContract', agreedPrice: 87000 }),
    ];

    assert.deepEqual(summarizeDealGroup(deals, 'coordination'), {
      count: 2,
      amountTotal: 193000,
    });
  });

  it('builds Notion-style list groups with row numbers scoped per stage group', () => {
    const groups = getDealNotionListGroups([
      deal({ id: 'settling-1', stage: 'settling', agreedPrice: 132000 }),
      deal({ id: 'selection-1', stage: 'selection', agreedPrice: 268000 }),
      deal({ id: 'selection-2', stage: 'negotiating', agreedPrice: 88000 }),
    ]);

    const coordination = groups.find((group) => group.group.key === 'coordination');
    const settling = groups.find((group) => group.group.key === 'settling');

    assert.deepEqual(
      coordination?.rows.map((row) => ({ rowNumber: row.rowNumber, id: row.deal.id })),
      [
        { rowNumber: 1, id: 'selection-1' },
        { rowNumber: 2, id: 'selection-2' },
      ],
    );
    assert.equal(coordination?.summary.count, 2);
    assert.equal(coordination?.summary.amountTotal, 356000);

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
          payment({ id: 'paid', kind: 'contract', scheduledDate: '2026-04-15T00:00:00.000Z', status: 'paid' }),
          payment({ id: 'interim', kind: 'interim', scheduledDate: '2026-04-28T00:00:00.000Z' }),
          payment({ id: 'balance', kind: 'balance', scheduledDate: '2026-05-12T00:00:00.000Z' }),
        ],
      }),
      new Date('2026-04-25T00:00:00.000Z'),
    );

    assert.equal(summary?.payment.id, 'interim');
    assert.equal(summary?.daysUntil, 3);
    assert.equal(summary?.isUrgent, true);
    assert.equal(summary?.label, '중도금');
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
    stage: 'selection',
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
