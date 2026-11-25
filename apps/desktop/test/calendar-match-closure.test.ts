import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@estate-erp/api-client';
import {
  getEventSuperseded,
  getMatchClosure,
  isEventMoot,
} from '../src/renderer/routes/_authenticated/calendar/-event-meta.ts';

const NOW = new Date('2026-11-22T03:00:00.000Z'); // 한국 시간 11/22 12:00

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'event-1',
    officeId: 'office-1',
    userId: 'user-1',
    title: '강수연 고덕그라시움 101동 3501호 방문',
    description: null,
    type: 'viewing',
    allDay: false,
    start: '2026-11-29T06:30:00.000Z',
    end: '2026-11-29T07:30:00.000Z',
    color: null,
    propertyId: null,
    listingIntakeId: null,
    listingId: null,
    contactId: null,
    matchId: 'match-1',
    dealId: null,
    createdAt: '2026-11-22T00:00:00.000Z',
    updatedAt: '2026-11-22T00:00:00.000Z',
    match: { id: 'match-1', stage: 'closed', closedReason: 'buyer_closed' },
    ...overrides,
  };
}

describe('닫힌 매칭에 걸린 일정', () => {
  it('앞날의 일정은 없어진 약속으로 보고 닫힌 이유를 함께 준다', () => {
    assert.deepEqual(getMatchClosure(event({}), NOW), { reasonLabel: '손님 조건 종료' });
    assert.deepEqual(
      getMatchClosure(event({ match: { id: 'match-1', stage: 'closed', closedReason: 'intake_closed' } }), NOW),
      { reasonLabel: '매물 의뢰 종료' },
    );
  });

  it('지난 일정은 그때 있었던 일이라 건드리지 않는다', () => {
    assert.equal(
      getMatchClosure(event({ start: '2026-11-20T06:30:00.000Z', end: '2026-11-20T07:30:00.000Z' }), NOW),
      null,
    );
  });

  it('지금 진행 중인 일정(끝나기 전)은 아직 앞날로 본다', () => {
    assert.ok(getMatchClosure(event({ start: '2026-11-22T02:30:00.000Z', end: '2026-11-22T03:30:00.000Z' }), NOW));
  });

  it('매칭이 다시 열리면(거래 취소로 되살아남) 보통 일정으로 돌아간다 — 저장하지 않고 볼 때 계산', () => {
    assert.equal(getMatchClosure(event({ match: { id: 'match-1', stage: 'viewing', closedReason: null } }), NOW), null);
  });

  it('매칭이 없거나 이유를 모르면', () => {
    assert.equal(getMatchClosure(event({ matchId: null, match: null }), NOW), null);
    assert.deepEqual(
      getMatchClosure(event({ match: { id: 'match-1', stage: 'closed', closedReason: null } }), NOW),
      { reasonLabel: null },
    );
  });
});

describe('이미 끝난 거래의 앞날 일정 (6차)', () => {
  // 임장은 11.22 00:00에 잡았고(createdAt), 그 뒤 11.22 05:00에 거래로 넘어가 정산 종료까지 끝났다
  const endedDeal = { id: 'deal-1', stage: 'closed', createdAt: '2026-11-22T05:00:00.000Z', isCancelled: false };

  it('거래 전환 전에 잡아 둔 임장이 거래가 끝난 뒤에도 앞날로 남았으면 끝난 일로 본다', () => {
    const viewing = event({ match: { id: 'match-1', stage: 'dealCreated', deals: [endedDeal] } });
    assert.equal(getEventSuperseded(viewing, NOW)?.label, '정산 종료');
    assert.equal(isEventMoot(viewing, NOW), true);
    const completed = event({ match: { id: 'match-1', stage: 'dealCreated', deals: [{ ...endedDeal, stage: 'completed' }] } });
    assert.equal(getEventSuperseded(completed, NOW)?.label, '잔금 완료');
  });

  it('매칭 단계만으로는 끝난 일로 보지 않는다 — 고객 검토·협상 중 재임장, 진행 중인 거래의 임장은 유효한 약속', () => {
    for (const stage of ['buyerReviewing', 'negotiating', 'dealCreated']) {
      const viewing = event({ match: { id: 'match-1', stage, deals: [] } });
      assert.equal(getEventSuperseded(viewing, NOW), null, stage);
      assert.equal(isEventMoot(viewing, NOW), false, stage);
    }
    const ongoing = { ...endedDeal, stage: 'settling' };
    assert.equal(getEventSuperseded(event({ match: { id: 'match-1', stage: 'dealCreated', deals: [ongoing] } }), NOW), null);
  });

  it('거래를 만든 뒤에 잡은 약속은 거래가 잔금 완료 → 정산 종료로 넘어가도 숨기지 않는다', () => {
    // 잔금 전 집 확인, 잔금 완료 뒤에 새로 잡은 약속 — 어느 단계에서 봐도 그대로다
    for (const stage of ['completed', 'closed']) {
      const deal = { ...endedDeal, stage };
      const viaMatch = event({ createdAt: '2026-11-23T09:00:00.000Z', match: { id: 'match-1', stage: 'dealCreated', deals: [deal] } });
      assert.equal(getEventSuperseded(viaMatch, NOW), null, stage);
      // 거래에 직접 건 일정은 거래가 있어야 만들 수 있으니 늘 거래보다 뒤다
      const direct = event({ type: 'meeting', createdAt: '2026-11-23T09:00:00.000Z', match: null, deal });
      assert.equal(getEventSuperseded(direct, NOW), null, stage);
    }
  });

  it('취소된 거래, 시각을 모르는 경우, 지난 일정은 그대로 둔다', () => {
    const cancelled = event({ match: { id: 'match-1', stage: 'dealCreated', deals: [{ ...endedDeal, isCancelled: true }] } });
    assert.equal(getEventSuperseded(cancelled, NOW), null);
    const unknown = event({ match: { id: 'match-1', stage: 'dealCreated', deals: [{ id: 'deal-1', stage: 'closed' }] } });
    assert.equal(getEventSuperseded(unknown, NOW), null);
    const past = event({ start: '2026-11-20T06:30:00.000Z', end: '2026-11-20T07:30:00.000Z', match: { id: 'match-1', stage: 'dealCreated', deals: [endedDeal] } });
    assert.equal(getEventSuperseded(past, NOW), null);
  });
});
