import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Contract, Deal } from '@estate-erp/api-client';
import { buildOverlayItems } from '../src/renderer/routes/_authenticated/calendar/-calendar-overlay-items.ts';

const property = {
  site: { name: '고덕그라시움' },
  unit: { name: '2203', dong: { name: '102', isPlaceholder: false } },
};

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal-1',
    stage: 'contracted',
    isCancelled: false,
    transactionType: 'sale',
    property,
    payments: [
      { id: 'p-contract', kind: 'contract', sequence: 1, scheduledDate: '2026-11-20T00:00:00.000Z', scheduledAmount: 15500, status: 'pending' },
      { id: 'p-balance', kind: 'balance', sequence: 1, scheduledDate: '2027-01-30T00:00:00.000Z', scheduledAmount: 139500, status: 'pending' },
      { id: 'p-refund', kind: 'refund', sequence: 1, scheduledDate: '2026-12-01T00:00:00.000Z', scheduledAmount: 100, status: 'pending' },
    ],
    ...overrides,
  } as unknown as Deal;
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    dealId: 'deal-1',
    status: 'signed',
    contractDate: '2026-11-21T00:00:00.000Z',
    statedInterimDate: '2026-12-15T00:00:00.000Z',
    statedBalanceDate: '2027-01-31T00:00:00.000Z',
    totalPrice: 155000,
    statedInterimPayment: 30000,
    statedBalance: 100000,
    deal: { listing: { property } },
    ...overrides,
  } as unknown as Contract;
}

describe('캘린더의 거래 대금 일정', () => {
  it('계약서가 없는 거래의 계약금·잔금일을 주소와 함께 보인다 (돌려준 돈은 일정이 아니다)', () => {
    const items = buildOverlayItems([], [], [deal()]);
    assert.deepEqual(
      items.map((item) => [item.kind, item.dateKey, item.title]),
      [
        ['contractDate', '2026-11-20', '계약일 · 고덕그라시움 102동 2203호'],
        ['balanceDate', '2027-01-30', '잔금일 · 고덕그라시움 102동 2203호'],
      ],
    );
  });

  it('같은 거래의 계약서 날짜는 거래에 있는 종류만 빼고 한 번만 보인다 — 계약일만은 계약서의 계약일', () => {
    const items = buildOverlayItems([contract()], [], [deal()]);
    const kinds = items.map((item) => `${item.source.type}:${item.kind}:${item.dateKey}`);
    // 잔금일은 거래 것만, 거래에 없는 중도금일은 계약서 것.
    // 계약일은 계약금 예정일(11.20)이 아니라 계약서의 계약일(11.21)이다 (6차 검수).
    assert.deepEqual(kinds.sort(), [
      'contract:contractDate:2026-11-21',
      'contract:interimDate:2026-12-15',
      'dealPayment:balanceDate:2027-01-30',
    ]);
    // 계약일이 비어 있는 계약서면 계약금 예정일을 계약일로 쓴다
    const noDate = buildOverlayItems([contract({ contractDate: null } as never)], [], [deal()]);
    assert.ok(noDate.some((item) => item.source.type === 'dealPayment' && item.kind === 'contractDate'));
  });

  it('받은 대금과 정산 끝난 거래의 날짜는 지난 일(done)로 표시한다', () => {
    const paid = deal({
      payments: [
        { id: 'p-contract', kind: 'contract', sequence: 1, scheduledDate: '2026-11-20T00:00:00.000Z', scheduledAmount: 15500, status: 'paid' },
        { id: 'p-balance', kind: 'balance', sequence: 1, scheduledDate: '2027-01-30T00:00:00.000Z', scheduledAmount: 139500, status: 'pending' },
      ],
    } as never);
    const items = buildOverlayItems([], [], [paid]);
    assert.deepEqual(items.map((item) => [item.kind, item.done]), [
      ['contractDate', true],
      ['balanceDate', false],
    ]);
    const closed = buildOverlayItems([contract()], [], [deal({ stage: 'closed' })]);
    assert.ok(closed.length > 0 && closed.every((item) => item.done));
  });

  it('취소된 거래는 거래·계약서·수수료 일정 모두 뺀다', () => {
    const cancelled = deal({ isCancelled: true });
    const payment = { id: 'cp-1', dealId: 'deal-1', dueDate: '2026-12-01T00:00:00.000Z', status: 'pending', expectedAmount: 300, clientSide: 'seller', payerContact: null };
    assert.deepEqual(buildOverlayItems([contract()], [payment as never], [cancelled]), []);
  });

  it("'내 담당'이면 내가 맡은 비중이 있는 거래의 날짜만 남기고, 담당 없는 옛 거래·거래 없는 계약서는 뺀다", () => {
    const mine = deal({ participants: [{ userId: 'me', sharePercent: 100 }] } as never);
    const helperOnly = deal({ id: 'deal-2', participants: [{ userId: 'me', sharePercent: null }] } as never);
    const noAssignee = deal({ id: 'deal-3', participants: [] } as never);
    const orphanContract = contract({ id: 'contract-9', dealId: null });
    const items = buildOverlayItems([orphanContract], [], [mine, helperOnly, noAssignee], { assigneeId: 'me' });
    assert.ok(items.length > 0);
    assert.ok(items.every((item) => item.source.type === 'dealPayment' && item.source.deal.id === 'deal-1'));
    // 사무소 전체는 모두
    assert.ok(buildOverlayItems([orphanContract], [], [mine, helperOnly, noAssignee]).length > items.length);
  });
});
