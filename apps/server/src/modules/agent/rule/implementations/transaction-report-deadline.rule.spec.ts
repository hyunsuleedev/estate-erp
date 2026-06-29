import { TransactionReportDeadlineRule } from './transaction-report-deadline.rule';
import { RuleContext } from '../rule.types';

describe('TransactionReportDeadlineRule', () => {
  const NOW = new Date('2026-06-10T00:00:00.000Z');
  const MS_PER_DAY = 86_400_000;

  function createRule() {
    const prisma = {
      contract: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return {
      prisma,
      rule: new TransactionReportDeadlineRule(prisma as never),
    };
  }

  function createCtx(ruleConfig?: Record<string, unknown>): RuleContext {
    return {
      officeId: 'office-1',
      now: NOW,
      ruleConfig,
      trustTierFor: (_type, fallback) => fallback,
    };
  }

  function contractFixture(
    daysElapsed: number,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: 'contract-1',
      officeId: 'office-1',
      dealId: 'deal-1',
      transactionType: 'sale',
      totalPrice: 158000,
      monthlyRent: null,
      status: 'signed',
      contractDate: new Date(NOW.getTime() - daysElapsed * MS_PER_DAY),
      deal: { id: 'deal-1', listingId: 'listing-1' },
      buyerContact: { name: '김매수' },
      sellerContact: { name: '박매도' },
      ...overrides,
    };
  }

  it('declares schedule-based system rule metadata', () => {
    const { rule } = createRule();

    expect(rule.name).toBe('transaction_report_deadline');
    expect(rule.displayName).toBe('거래신고 기한 알림');
    expect(rule.isSystem).toBe(true);
    expect(rule.defaultActive).toBe(true);
    expect(rule.triggerType).toBe('schedule');
    expect(rule.schedule).toBeDefined();
  });

  it('queries non-cancelled contracts without a submitted report document', async () => {
    const { prisma, rule } = createRule();

    await rule.evaluate(createCtx());

    expect(prisma.contract.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.contract.findMany.mock.calls[0][0].where;
    expect(where.officeId).toBe('office-1');
    expect(where.status).toEqual({ not: 'cancelled' });
    expect(where.transactionType).toEqual({
      in: ['sale', 'jeonse', 'monthly', 'yearly_rent'],
    });
    expect(where.documents).toEqual({
      none: { category: 'report', submittedAt: { not: null } },
    });
    // 계약일 20일 경과 컷오프
    expect(where.contractDate.lte).toEqual(
      new Date(NOW.getTime() - 20 * MS_PER_DAY),
    );
    // 레거시 노이즈 방지 lookback (기본 60일)
    expect(where.contractDate.gte).toEqual(
      new Date(NOW.getTime() - 60 * MS_PER_DAY),
    );
  });

  it('creates a normal proposal for a sale contract 20~24 days after contract date', async () => {
    const { prisma, rule } = createRule();
    prisma.contract.findMany.mockResolvedValue([contractFixture(22)]);

    const drafts = await rule.evaluate(createCtx());

    expect(drafts).toHaveLength(1);
    const draft = drafts[0];
    expect(draft.type).toBe('transaction_report_deadline');
    expect(draft.priority).toBe('normal');
    expect(draft.trustTier).toBe('approval_required');
    expect(draft.dedupeKey).toBe('transaction_report_deadline:contract-1');
    expect(draft.contractId).toBe('contract-1');
    expect(draft.dealId).toBe('deal-1');
    expect(draft.listingId).toBe('listing-1');
    // 법적 근거 + D-day (22일 경과 → D-8)
    expect(draft.reasoning).toContain('부동산 거래신고 등에 관한 법률 제3조');
    expect(draft.reasoning).toContain('30일 이내');
    expect(draft.reasoning).toContain('과태료');
    expect(draft.reasoning).toContain('D-8');
    expect(draft.title).toContain('부동산 거래신고');
    // create_task 액션이 계약에 링크되어야 함
    expect(draft.actions).toHaveLength(1);
    expect(draft.actions![0].tool).toBe('create_task');
    expect(draft.actions![0].args.contractId).toBe('contract-1');
  });

  it('escalates to urgent priority 25+ days after contract date', async () => {
    const { prisma, rule } = createRule();
    prisma.contract.findMany.mockResolvedValue([contractFixture(26)]);

    const drafts = await rule.evaluate(createCtx());

    expect(drafts).toHaveLength(1);
    expect(drafts[0].priority).toBe('urgent');
    expect(drafts[0].reasoning).toContain('D-4');
    expect(drafts[0].title).not.toContain('기한 경과');
  });

  it('flags contracts past the 30-day deadline as overdue urgent', async () => {
    const { prisma, rule } = createRule();
    prisma.contract.findMany.mockResolvedValue([contractFixture(35)]);

    const drafts = await rule.evaluate(createCtx());

    expect(drafts).toHaveLength(1);
    expect(drafts[0].priority).toBe('urgent');
    expect(drafts[0].title).toContain('기한 경과');
    expect(drafts[0].title).toContain('즉시 신고 필요');
    expect(drafts[0].description).toContain('기한 경과 — 즉시 신고 필요');
    expect(drafts[0].reasoning).toContain('D+5');
  });

  it('targets jeonse contracts (deposit over 60,000,000 KRW)', async () => {
    const { prisma, rule } = createRule();
    prisma.contract.findMany.mockResolvedValue([
      contractFixture(22, {
        transactionType: 'jeonse',
        totalPrice: 30000, // 전세금 3억 > 6천만 기준
      }),
    ]);

    const drafts = await rule.evaluate(createCtx());

    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toContain('주택 임대차 신고');
    expect(drafts[0].reasoning).toContain('제6조의2');
    expect(drafts[0].reasoning).toContain('보증금 6,000만원 초과');
  });

  it('targets monthly contracts when rent exceeds 300,000 KRW even with small deposit', async () => {
    const { prisma, rule } = createRule();
    prisma.contract.findMany.mockResolvedValue([
      contractFixture(22, {
        transactionType: 'monthly',
        totalPrice: 1000, // 보증금 1천만 (기준 이하)
        monthlyRent: 40, // 월세 40만 > 30만 기준
      }),
    ]);

    const drafts = await rule.evaluate(createCtx());

    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toContain('주택 임대차 신고');
  });

  it('skips lease contracts below both reporting thresholds', async () => {
    const { prisma, rule } = createRule();
    prisma.contract.findMany.mockResolvedValue([
      contractFixture(22, {
        transactionType: 'monthly',
        totalPrice: 5000, // 보증금 5천만 ≤ 6천만
        monthlyRent: 25, // 월세 25만 ≤ 30만
      }),
    ]);

    const drafts = await rule.evaluate(createCtx());

    expect(drafts).toHaveLength(0);
  });

  it('skips exact-threshold lease contracts (초과 조건이므로 동일 금액은 비대상)', async () => {
    const { prisma, rule } = createRule();
    prisma.contract.findMany.mockResolvedValue([
      contractFixture(22, {
        transactionType: 'monthly',
        totalPrice: 6000,
        monthlyRent: 30,
      }),
    ]);

    const drafts = await rule.evaluate(createCtx());

    expect(drafts).toHaveLength(0);
  });

  it('guards against contracts under 20 days even if the query returns them', async () => {
    const { prisma, rule } = createRule();
    prisma.contract.findMany.mockResolvedValue([contractFixture(10)]);

    const drafts = await rule.evaluate(createCtx());

    expect(drafts).toHaveLength(0);
  });

  it('honors overdueLookbackDays from rule config', async () => {
    const { prisma, rule } = createRule();

    await rule.evaluate(createCtx({ overdueLookbackDays: 90 }));

    const where = prisma.contract.findMany.mock.calls[0][0].where;
    expect(where.contractDate.gte).toEqual(
      new Date(NOW.getTime() - 90 * MS_PER_DAY),
    );
  });

  it('sets expiry so a pending normal proposal lapses when the urgent stage begins', async () => {
    const { prisma, rule } = createRule();
    prisma.contract.findMany.mockResolvedValue([
      contractFixture(22), // normal 단계: 25일까지 3일 남음 → 72h
      contractFixture(27, { id: 'contract-2' }), // urgent 단계: 31일까지 4일 → 96h
      contractFixture(40, { id: 'contract-3' }), // overdue: 72h 재알림 주기
    ]);

    const drafts = await rule.evaluate(createCtx());

    expect(drafts.map((d) => d.expiresInHours)).toEqual([72, 96, 72]);
  });
});
