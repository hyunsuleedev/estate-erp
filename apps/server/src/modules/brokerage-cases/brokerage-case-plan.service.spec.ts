import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BrokerageCasePlanService } from './brokerage-case-plan.service';

const OFFICE_ID = '00000000-0000-4000-8000-000000000001';
const CASE_ID = '00000000-0000-4000-8000-000000000002';

/** 호출 순서를 남기는 가짜 트랜잭션 클라이언트. */
function setup(options: {
  steps?: Array<Record<string, unknown>>;
  listingIntakes?: Array<Record<string, unknown>>;
  buyerIntakes?: Array<Record<string, unknown>>;
  deal?: Record<string, unknown> | null;
} = {}) {
  const calls: string[] = [];
  const steps = options.steps ?? [];
  const tx = {
    brokerageCase: {
      findFirst: jest.fn(async () => ({ id: CASE_ID, steps: [] })),
      create: jest.fn(async () => {
        calls.push('case.create');
        return { id: CASE_ID };
      }),
      update: jest.fn(async () => ({})),
      delete: jest.fn(async () => {
        calls.push('case.delete');
      }),
    },
    brokerageCaseStep: {
      findFirst: jest.fn(
        async (args: { where: Record<string, unknown> }) =>
          steps.find((step) =>
            args.where.id ? step.id === args.where.id : false,
          ) ?? null,
      ),
      findMany: jest.fn(async () => steps.map((step) => ({ id: step.id }))),
      count: jest.fn(async () => steps.length),
      aggregate: jest.fn(async () => ({ _max: { sortOrder: steps.length || null } })),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(`step.create(${String(args.data.title)}#${String(args.data.sortOrder)})`);
      }),
      update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push(`step.update(${args.where.id}:${JSON.stringify(args.data)})`);
      }),
      delete: jest.fn(async () => {
        calls.push('step.delete');
      }),
      deleteMany: jest.fn(async () => {
        calls.push('step.deleteMany');
      }),
    },
    listingIntake: {
      findMany: jest.fn(async () => options.listingIntakes ?? []),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(`listingIntake.update(case=${String(args.data.brokerageCaseId)})`);
      }),
      updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(`listingIntake.updateMany(case=${String(args.data.brokerageCaseId)})`);
      }),
    },
    buyerIntake: {
      findMany: jest.fn(async () => options.buyerIntakes ?? []),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(`buyerIntake.update(case=${String(args.data.brokerageCaseId)})`);
      }),
      updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(`buyerIntake.updateMany(case=${String(args.data.brokerageCaseId)})`);
      }),
    },
    property: {
      findUnique: jest.fn(async () => ({
        site: { name: '고덕그라시움' },
        unit: { name: '3501', dong: { name: '101', isPlaceholder: false } },
      })),
    },
    deal: { findFirst: jest.fn(async () => options.deal ?? null) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const service = new BrokerageCasePlanService(prisma as never);
  return { service, tx, calls };
}

const listingIntake = (id: string, receivedAt: string, caseId: string | null = null) => ({
  id,
  brokerageCaseId: caseId,
  propertyId: 'property-1',
  receivedAt: new Date(receivedAt),
});
const buyerIntake = (id: string, receivedAt: string, caseId: string | null = null) => ({
  id,
  brokerageCaseId: caseId,
  receivedAt: new Date(receivedAt),
  requirements: [{ transactionType: 'jeonse' }],
});

describe('BrokerageCasePlanService', () => {
  it('건 목록은 원장에 줄이 없는 건(의뢰가 모두 종료됨 등)도 보관하지 않았으면 모두 준다', async () => {
    const { service, tx } = setup();
    const findMany = jest.fn(async () => [
      {
        id: 'case-closed',
        title: null,
        updatedAt: new Date('2026-11-15T00:00:00Z'),
        steps: [{ title: 'A 매도' }, { title: '이사' }],
        buyerIntakes: [],
        listingIntakes: [
          { property: { propertyContacts: [{ contact: { name: '김민준' } }] } },
        ],
      },
      {
        id: 'case-manual-only',
        title: '대출만 남은 건',
        updatedAt: new Date('2026-11-14T00:00:00Z'),
        steps: [],
        buyerIntakes: [],
        listingIntakes: [],
      },
    ]);
    (tx.brokerageCase as unknown as { findMany: typeof findMany }).findMany = findMany;
    const prisma = { ...tx, $transaction: jest.fn() };
    const list = await new BrokerageCasePlanService(prisma as never).findAll(OFFICE_ID);

    // 의뢰의 진행 상태로 거르지 않는다. 보관 여부만 본다.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { officeId: OFFICE_ID, archivedAt: null } }),
    );
    expect(list).toEqual([
      expect.objectContaining({
        id: 'case-closed',
        stepCount: 2,
        firstStepTitle: 'A 매도',
        customerName: '김민준',
      }),
      expect.objectContaining({
        id: 'case-manual-only',
        title: '대출만 남은 건',
        stepCount: 0,
        customerName: null,
      }),
    ]);
    void service;
  });

  it('더 담을 후보에는 이미 종료된 의뢰와, 이 건에 없는 구매 의뢰의 거래도 들어간다', async () => {
    const { tx } = setup();
    const calls: Record<string, unknown> = {};
    const prisma = {
      ...tx,
      buyerIntakeContact: { findMany: jest.fn(async () => [{ contactId: 'c1' }]) },
      propertyContact: { findMany: jest.fn(async () => []) },
      listingIntake: {
        findMany: jest.fn(async (args: { where: unknown }) => {
          calls.listing = args.where;
          return [];
        }),
      },
      buyerIntake: {
        findMany: jest.fn(async (args: { where: unknown }) => {
          calls.buyer = args.where;
          return [];
        }),
      },
      deal: {
        findMany: jest.fn(async (args: { where: unknown }) => {
          calls.deal = args.where;
          return [];
        }),
      },
    };
    await new BrokerageCasePlanService(prisma as never).findCandidates(CASE_ID, OFFICE_ID);

    // 진행 상태로 거르지 않는다: 거래가 끝나 종료된 의뢰도 흐름에 넣을 수 있어야 한다.
    expect(calls.listing).not.toHaveProperty('lifecycleStatus');
    expect(calls.buyer).not.toHaveProperty('lifecycleStatus');
    expect(calls.listing).toMatchObject({
      OR: [
        { brokerageCaseId: null },
        { brokerageCase: { archivedAt: { not: null } } },
      ],
    });
    // 구매 의뢰가 있는 거래도, 그 의뢰가 이 건에 없으면 후보다.
    expect(calls.deal).not.toHaveProperty('buyerIntakeId');
    expect(calls.deal).toMatchObject({
      NOT: [
        { buyerIntake: { brokerageCaseId: CASE_ID } },
        { listing: { intake: { brokerageCaseId: CASE_ID } } },
      ],
    });
  });

  it('묶을 의뢰가 없으면 건을 만들지 않는다', async () => {
    const { service, tx } = setup();
    await expect(service.create(OFFICE_ID, { title: '빈 건' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.brokerageCase.create).not.toHaveBeenCalled();
  });

  it('고른 의뢰를 접수 순서대로 건에 담고 의뢰마다 단계를 만든다', async () => {
    const { service, calls } = setup({
      listingIntakes: [listingIntake('listing-1', '2026-03-02T00:00:00Z')],
      buyerIntakes: [buyerIntake('buyer-1', '2026-03-01T00:00:00Z')],
    });

    await service.create(OFFICE_ID, {
      title: ' 갈아타기 ',
      listingIntakeIds: ['listing-1'],
      buyerIntakeIds: ['buyer-1', 'buyer-1'],
    });

    // 의뢰의 건 참조를 먼저 맞춘 뒤에 단계를 만든다(단계의 복합 FK가 같은 건의 의뢰만 받는다).
    expect(calls).toEqual([
      'case.create',
      `buyerIntake.update(case=${CASE_ID})`,
      'step.create(전세 구매 의뢰#1)',
      `listingIntake.update(case=${CASE_ID})`,
      'step.create(고덕그라시움 101동 3501 매물 의뢰#1)',
    ]);
  });

  it('없는 의뢰나 다른 건에 묶인 의뢰는 거절한다', async () => {
    const missing = setup({ listingIntakes: [] });
    await expect(
      missing.service.create(OFFICE_ID, { listingIntakeIds: ['listing-1'] }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const taken = setup({
      listingIntakes: [listingIntake('listing-1', '2026-03-01T00:00:00Z', 'other-case')],
    });
    // 진행 중인(보관하지 않은) 다른 건이다.
    taken.tx.brokerageCase.findFirst.mockResolvedValue({
      id: 'other-case',
      archivedAt: null,
    } as never);
    await expect(
      taken.service.create(OFFICE_ID, { listingIntakeIds: ['listing-1'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(taken.calls).not.toContain(`listingIntake.update(case=${CASE_ID})`);
  });

  it('보관한 건에 남아 있던 의뢰를 새 건으로 옮겨도 옛 단계 기록은 남고, 새 단계가 내용을 이어받는다', async () => {
    const { service, tx, calls } = setup({
      listingIntakes: [listingIntake('listing-1', '2026-03-01T00:00:00Z', 'archived-case')],
    });
    // 다른 건을 조회하면 보관된 건이다.
    tx.brokerageCase.findFirst.mockImplementation((async (args: {
      where: { id: string };
    }) =>
      args.where.id === 'archived-case'
        ? { id: 'archived-case', archivedAt: new Date('2026-01-01T00:00:00Z') }
        : { id: CASE_ID, steps: [] }) as never);
    const targetDate = new Date('2026-05-20T00:00:00Z');
    tx.brokerageCaseStep.findMany.mockResolvedValueOnce([
      { id: 'old-step', title: 'A 매도', targetDate, memo: '잔금 5/20 협의' },
    ] as never);
    const updateMany = jest.fn(async () => {
      calls.push('oldStep.unlink');
      return { count: 1 };
    });
    (tx.brokerageCaseStep as unknown as { updateMany: typeof updateMany }).updateMany =
      updateMany;

    await service.create(OFFICE_ID, { listingIntakeIds: ['listing-1'] });

    // 옛 단계는 지우지 않는다. 의뢰를 가리키는 연결만 끊어 기록으로 남긴다.
    expect(tx.brokerageCaseStep.deleteMany).not.toHaveBeenCalled();
    expect(tx.brokerageCaseStep.delete).not.toHaveBeenCalled();
    // 거래가 진행 중이라 완료가 아니었던 단계는 그대로 미완료 기록으로 남는다.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-step'] } },
      data: { listingIntakeId: null, doneAt: null },
    });
    // 연결을 끊은 뒤에 의뢰의 건을 바꾼다(먼저 바꾸면 옛 단계가 새 건으로 딸려 간다).
    expect(calls).toEqual([
      'case.create',
      'oldStep.unlink',
      `listingIntake.update(case=${CASE_ID})`,
      'step.create(A 매도#1)',
    ]);
    // 새 단계가 제목·목표일·메모를 이어받는다.
    expect(tx.brokerageCaseStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brokerageCaseId: CASE_ID,
        listingIntakeId: 'listing-1',
        title: 'A 매도',
        targetDate,
        memo: '잔금 5/20 협의',
      }),
    });
  });

  it('보관한 건에서 완료였던 의뢰 단계는 연결을 끊어도 완료 기록으로 남는다', async () => {
    const completedAt = new Date('2026-04-30T09:00:00Z');
    const { service, tx } = setup({
      buyerIntakes: [buyerIntake('buyer-1', '2026-03-01T00:00:00Z', 'archived-case')],
      // 이 의뢰의 현재 거래가 완료 단계다.
      deal: { stage: 'completed', stageChangedAt: completedAt },
    });
    tx.brokerageCase.findFirst.mockImplementation((async (args: {
      where: { id: string };
    }) =>
      args.where.id === 'archived-case'
        ? { id: 'archived-case', archivedAt: new Date('2026-05-01T00:00:00Z') }
        : { id: CASE_ID, steps: [] }) as never);
    tx.brokerageCaseStep.findMany.mockResolvedValueOnce([
      { id: 'old-step', title: 'B 매수', targetDate: null, memo: null },
    ] as never);
    const updateMany = jest.fn(async () => ({ count: 1 }));
    (tx.brokerageCaseStep as unknown as { updateMany: typeof updateMany }).updateMany =
      updateMany;

    await service.create(OFFICE_ID, { buyerIntakeIds: ['buyer-1'] });

    // 완료 여부는 단계 표시와 같은 기준으로 읽는다: 취소되지 않은 가장 최근 거래.
    expect(tx.deal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { officeId: OFFICE_ID, isCancelled: false, buyerIntakeId: 'buyer-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-step'] } },
      data: { buyerIntakeId: null, doneAt: completedAt },
    });
  });

  it('묶음을 풀 때 단계를 먼저 지우고 의뢰를 뺀 뒤 건을 지운다', async () => {
    const { service, calls } = setup();
    await service.remove(CASE_ID, OFFICE_ID);
    expect(calls).toEqual([
      'step.deleteMany',
      'listingIntake.updateMany(case=null)',
      'buyerIntake.updateMany(case=null)',
      'case.delete',
    ]);
  });

  it('의뢰를 가리키는 단계를 지우면 그 의뢰도 건에서 빠진다', async () => {
    const { service, calls } = setup({
      steps: [{ id: 'step-1', listingIntakeId: 'listing-1', buyerIntakeId: null, dealId: null }],
    });
    await service.removeStep(CASE_ID, 'step-1', OFFICE_ID);
    expect(calls).toEqual(['step.delete', 'listingIntake.updateMany(case=null)']);
  });

  it('완료 체크는 아무것도 가리키지 않는 단계에만 받는다', async () => {
    const linked = setup({
      steps: [{ id: 'step-1', listingIntakeId: null, buyerIntakeId: 'buyer-1', dealId: null, doneAt: null }],
    });
    await expect(
      linked.service.updateStep(CASE_ID, 'step-1', OFFICE_ID, { done: true }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const manual = setup({
      steps: [{ id: 'step-2', listingIntakeId: null, buyerIntakeId: null, dealId: null, doneAt: null }],
    });
    await manual.service.updateStep(CASE_ID, 'step-2', OFFICE_ID, { done: true });
    expect(manual.tx.brokerageCaseStep.update).toHaveBeenCalledWith({
      where: { id: 'step-2' },
      data: { doneAt: expect.any(Date) },
    });
  });

  it('순서는 건의 모든 단계를 빠짐없이 보냈을 때만 저장한다', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const partial = setup({ steps });
    await expect(
      partial.service.reorderSteps(CASE_ID, OFFICE_ID, {
        steps: [
          { id: 'a', sortOrder: 2 },
          { id: 'b', sortOrder: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(partial.tx.brokerageCaseStep.update).not.toHaveBeenCalled();

    const invalid = setup({ steps });
    await expect(
      invalid.service.reorderSteps(CASE_ID, OFFICE_ID, {
        steps: [{ id: 'a', sortOrder: 0 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // 같은 번호는 동시 진행이다.
    const full = setup({ steps });
    await full.service.reorderSteps(CASE_ID, OFFICE_ID, {
      steps: [
        { id: 'a', sortOrder: 2 },
        { id: 'b', sortOrder: 1 },
        { id: 'c', sortOrder: 2 },
      ],
    });
    expect(full.calls).toEqual([
      'step.update(a:{"sortOrder":2})',
      'step.update(b:{"sortOrder":1})',
      'step.update(c:{"sortOrder":2})',
    ]);
  });

  it('건에 담긴 의뢰에서 나온 거래는 거래 단계로 다시 넣지 못한다', async () => {
    const { service, tx } = setup({
      deal: {
        id: 'deal-1',
        transactionType: 'sale',
        buyerIntake: { brokerageCaseId: CASE_ID },
        listing: null,
      },
    });
    await expect(
      service.createStep(CASE_ID, OFFICE_ID, { dealId: 'deal-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.brokerageCaseStep.create).not.toHaveBeenCalled();
  });

  it('의뢰를 거치지 않은 거래는 거래 단계로 넣고 제목을 채운다', async () => {
    const { service, calls } = setup({
      deal: {
        id: 'deal-1',
        transactionType: 'jeonse',
        buyerIntake: null,
        listing: {
          intake: { brokerageCaseId: null },
          property: { site: { name: '래미안' }, unit: null },
        },
      },
    });
    await service.createStep(CASE_ID, OFFICE_ID, { dealId: 'deal-1' });
    expect(calls).toEqual(['step.create(래미안 전세 거래#1)']);
  });

  it('아무것도 가리키지 않는 단계는 제목이 있어야 한다', async () => {
    const { service } = setup();
    await expect(
      service.createStep(CASE_ID, OFFICE_ID, { title: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
