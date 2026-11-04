import {
  closeCompetingMatchesForDeal,
  closeOpenMatchesForIntake,
  settleMatchesForCancelledDeal,
} from './match-lifecycle-sync';

/**
 * 거래·의뢰 상태에 따른 매칭 자동 종료·되살리기.
 * 실제 where 조건으로 걸러지는지 보기 위해 메모리 안의 매칭 표로 시험한다.
 */

interface FakeMatch {
  id: string;
  officeId: string;
  listingId: string;
  intakeId: string;
  stage: string;
  closedFromStage: string | null;
  closedReason: string | null;
  closedByDealId: string | null;
  buyerStatus: string;
}

type Where = Record<string, unknown>;

function matchesWhere(match: FakeMatch, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'listing') {
      return (condition as { intakeId: string }).intakeId === match.intakeId;
    }
    if (key === 'buyerRequirement') {
      return (condition as { status: string }).status === match.buyerStatus;
    }
    const value = match[key as keyof FakeMatch];
    if (condition && typeof condition === 'object') {
      const ops = condition as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
      if (ops.in && !ops.in.includes(value)) return false;
      if (ops.notIn && ops.notIn.includes(value)) return false;
      if ('not' in ops && ops.not === value) return false;
      return true;
    }
    return value === condition;
  });
}

function createFakeTx(rows: FakeMatch[]) {
  const store = rows.map((row) => ({ ...row }));
  const tx = {
    match: {
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        store.filter((row) => matchesWhere(row, where)).map((row) => ({ ...row })),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeMatch> }) => {
        const row = store.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error(`no match ${where.id}`);
        Object.assign(row, data);
        return { ...row };
      }),
    },
  };
  const get = (id: string) => store.find((row) => row.id === id)!;
  return { tx: tx as never, get };
}

function match(overrides: Partial<FakeMatch> & { id: string }): FakeMatch {
  return {
    officeId: 'office-1',
    listingId: 'listing-sale',
    intakeId: 'intake-1',
    stage: 'viewing',
    closedFromStage: null,
    closedReason: null,
    closedByDealId: null,
    buyerStatus: 'active',
    ...overrides,
  };
}

describe('match lifecycle sync', () => {
  it('closes the other buyers on the same listing when the deal reaches 본계약', async () => {
    const { tx, get } = createFakeTx([
      match({ id: 'source', stage: 'dealCreated' }),
      match({ id: 'other-viewing', stage: 'viewing' }),
      match({ id: 'other-negotiating', stage: 'negotiating' }),
      match({ id: 'manual-closed', stage: 'closed', closedFromStage: 'suggested', closedReason: 'manual' }),
      match({ id: 'jeonse-buyer', listingId: 'listing-jeonse', stage: 'viewing' }),
    ]);

    await closeCompetingMatchesForDeal(tx, {
      id: 'deal-1',
      officeId: 'office-1',
      listingId: 'listing-sale',
      matchId: 'source',
    });

    expect(get('source').stage).toBe('dealCreated');
    expect(get('other-viewing')).toMatchObject({
      stage: 'closed',
      closedFromStage: 'viewing',
      closedReason: 'other_buyer_contracted',
      closedByDealId: 'deal-1',
    });
    expect(get('other-negotiating')).toMatchObject({ stage: 'closed', closedFromStage: 'negotiating' });
    // 이미 직접 종료된 매칭과 다른 거래 조건(전세) 매칭은 건드리지 않는다
    expect(get('manual-closed')).toMatchObject({ closedReason: 'manual', closedFromStage: 'suggested' });
    expect(get('jeonse-buyer').stage).toBe('viewing');
  });

  it('on cancellation closes the source match and restores only the matches this deal closed', async () => {
    const { tx, get } = createFakeTx([
      match({ id: 'source', stage: 'dealCreated' }),
      match({ id: 'auto-closed', stage: 'closed', closedFromStage: 'negotiating', closedReason: 'other_buyer_contracted', closedByDealId: 'deal-1' }),
      match({ id: 'manual-closed', stage: 'closed', closedFromStage: 'viewing', closedReason: 'manual' }),
      match({ id: 'closed-by-other-deal', stage: 'closed', closedFromStage: 'viewing', closedReason: 'other_buyer_contracted', closedByDealId: 'deal-0' }),
      match({ id: 'buyer-done', stage: 'closed', closedFromStage: 'viewing', closedReason: 'other_buyer_contracted', closedByDealId: 'deal-1', buyerStatus: 'completed' }),
      match({ id: 'reopened-by-user', stage: 'viewing' }),
    ]);

    await settleMatchesForCancelledDeal(tx, {
      officeId: 'office-1',
      dealId: 'deal-1',
      matchId: 'source',
      intakeOpen: true,
    });

    expect(get('source')).toMatchObject({
      stage: 'closed',
      closedFromStage: 'dealCreated',
      closedReason: 'deal_cancelled',
    });
    expect(get('auto-closed')).toMatchObject({
      stage: 'negotiating',
      closedFromStage: null,
      closedReason: null,
      closedByDealId: null,
    });
    expect(get('manual-closed').stage).toBe('closed');
    expect(get('closed-by-other-deal').stage).toBe('closed');
    expect(get('buyer-done').stage).toBe('closed');
    expect(get('reopened-by-user').stage).toBe('viewing');
  });

  it('does not restore matches when the intake stays closed after cancellation', async () => {
    const { tx, get } = createFakeTx([
      match({ id: 'source', stage: 'dealCreated' }),
      match({ id: 'auto-closed', stage: 'closed', closedFromStage: 'negotiating', closedReason: 'other_buyer_contracted', closedByDealId: 'deal-1' }),
    ]);

    await settleMatchesForCancelledDeal(tx, {
      officeId: 'office-1',
      dealId: 'deal-1',
      matchId: 'source',
      intakeOpen: false,
    });

    expect(get('source').closedReason).toBe('deal_cancelled');
    expect(get('auto-closed').stage).toBe('closed');
  });

  it('closes every open match of the intake when it closes, keeping the converted one', async () => {
    const { tx, get } = createFakeTx([
      match({ id: 'source', stage: 'dealCreated' }),
      match({ id: 'sale-open', stage: 'buyerInterested' }),
      match({ id: 'jeonse-open', listingId: 'listing-jeonse', stage: 'suggested' }),
      match({ id: 'other-intake', intakeId: 'intake-2', stage: 'viewing' }),
    ]);

    await closeOpenMatchesForIntake(tx, { officeId: 'office-1', intakeId: 'intake-1', dealId: 'deal-1' });

    expect(get('source').stage).toBe('dealCreated');
    expect(get('sale-open')).toMatchObject({ stage: 'closed', closedReason: 'intake_closed', closedByDealId: 'deal-1' });
    expect(get('jeonse-open')).toMatchObject({ stage: 'closed', closedReason: 'intake_closed' });
    expect(get('other-intake').stage).toBe('viewing');
  });

  it('closes the converted match too when the intake closes with its deal cancelled', async () => {
    const { tx, get } = createFakeTx([match({ id: 'source', stage: 'dealCreated' })]);

    await closeOpenMatchesForIntake(tx, { officeId: 'office-1', intakeId: 'intake-1', includeConverted: true });

    expect(get('source')).toMatchObject({ stage: 'closed', closedReason: 'intake_closed', closedByDealId: null });
  });
});
