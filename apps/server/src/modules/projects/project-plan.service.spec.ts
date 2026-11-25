import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectPlanService } from './project-plan.service';

const OFFICE_ID = '00000000-0000-4000-8000-000000000001';
const PROJECT_ID = '00000000-0000-4000-8000-000000000002';

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
    project: {
      findFirst: jest.fn(async () => ({
        id: PROJECT_ID,
        primaryContactId: null,
        primaryContact: null,
        assignedTo: null,
        _count: { comments: 0 },
        steps: [],
      })),
      create: jest.fn(async () => {
        calls.push('case.create');
        return { id: PROJECT_ID };
      }),
      update: jest.fn(async () => ({})),
      delete: jest.fn(async () => {
        calls.push('case.delete');
      }),
    },
    projectStep: {
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
        calls.push(`listingIntake.update(case=${String(args.data.projectId)})`);
      }),
      updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(`listingIntake.updateMany(case=${String(args.data.projectId)})`);
      }),
    },
    buyerIntake: {
      findMany: jest.fn(async () => options.buyerIntakes ?? []),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(`buyerIntake.update(case=${String(args.data.projectId)})`);
      }),
      updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(`buyerIntake.updateMany(case=${String(args.data.projectId)})`);
      }),
    },
    property: {
      findUnique: jest.fn(async () => ({
        site: { name: '고덕그라시움' },
        unit: { name: '3501', dong: { name: '101', isPlaceholder: false } },
      })),
    },
    deal: { findFirst: jest.fn(async () => options.deal ?? null) },
    task: {
      updateMany: jest.fn(async (args: { data: { projectId?: string | null } }) => {
        calls.push(`task.updateMany(case=${String(args.data.projectId)})`);
        return { count: 0 };
      }),
    },
    contact: {
      findFirst: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id === 'contact-missing' ? null : { id: args.where.id },
      ),
    },
    user: {
      findFirst: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id === 'user-missing' ? null : { id: args.where.id },
      ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const service = new ProjectPlanService(prisma as never);
  return { service, tx, calls };
}

const listingIntake = (id: string, receivedAt: string, projectId: string | null = null) => ({
  id,
  projectId: projectId,
  propertyId: 'property-1',
  receivedAt: new Date(receivedAt),
});
const buyerIntake = (id: string, receivedAt: string, projectId: string | null = null) => ({
  id,
  projectId: projectId,
  receivedAt: new Date(receivedAt),
  requirements: [{ transactionType: 'jeonse' }],
});

describe('ProjectPlanService', () => {
  it('프로젝트 목록은 원장에 줄이 없는 프로젝트(의뢰가 모두 종료됨, 사람만으로 엶)도 끝내지 않았으면 모두 준다', async () => {
    const { tx } = setup();
    const person = (id: string, name: string) => ({ id, name, phones: [{ phone: '01012345678' }] });
    const findMany = jest.fn(async () => [
      {
        id: 'case-closed',
        title: null,
        memo: null,
        archivedAt: null,
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-15T00:00:00Z'),
        primaryContact: null,
        assignedTo: null,
        _count: { comments: 2 },
        comments: [
          { body: '등기부 확인함', createdAt: new Date('2026-11-15T00:00:00Z'), author: { name: '박대리' } },
        ],
        steps: [
          {
            id: 'step-1',
            sortOrder: 1,
            title: 'A 매도',
            targetDate: null,
            memo: null,
            doneAt: null,
            buyerIntake: null,
            deal: null,
            listingIntake: {
              id: 'listing-1',
              propertyId: 'property-1',
              lifecycleStatus: 'closed',
              closedReason: 'deal_completed',
              property: {
                site: { name: '고덕그라시움' },
                unit: null,
                propertyContacts: [{ contact: person('c-owner', '김민준') }],
              },
              listings: [],
            },
          },
          {
            id: 'step-2',
            sortOrder: 2,
            title: '이사',
            targetDate: new Date('2026-12-01T00:00:00Z'),
            memo: null,
            doneAt: null,
            listingIntake: null,
            buyerIntake: null,
            deal: null,
          },
        ],
      },
      {
        id: 'case-person-only',
        title: '대출만 남은 프로젝트',
        memo: null,
        archivedAt: null,
        createdAt: new Date('2026-11-02T00:00:00Z'),
        updatedAt: new Date('2026-11-14T00:00:00Z'),
        primaryContact: person('c-primary', '이서연'),
        assignedTo: { id: 'user-1', name: '박대리' },
        _count: { comments: 0 },
        comments: [],
        steps: [],
      },
    ]);
    const count = jest.fn(async () => 2);
    const prisma = {
      ...tx,
      project: { ...tx.project, findMany, count },
      $transaction: jest.fn(),
    };
    const list = await new ProjectPlanService(prisma as never).findAll(OFFICE_ID);

    // 의뢰의 진행 상태로 거르지 않는다. 끝냈는지만 본다.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { officeId: OFFICE_ID, archivedAt: null } }),
    );
    expect(list.total).toBe(2);
    // 한 쪽에 다 들어왔다.
    expect(list.nextOffset).toBeNull();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: 0,
        take: 50,
      }),
    );
    expect(list.items).toEqual([
      expect.objectContaining({
        id: 'case-closed',
        // 대표 고객을 정하지 않았으면 담긴 의뢰의 당사자에서 읽는다.
        customerName: '김민준',
        primaryContact: null,
        listingIntakeCount: 1,
        buyerIntakeCount: 0,
        stepCount: 2,
        doneStepCount: 0,
        firstStepTitle: 'A 매도',
        nextStepTitle: 'A 매도',
        commentCount: 2,
        latestComment: expect.objectContaining({ body: '등기부 확인함', authorName: '박대리' }),
      }),
      expect.objectContaining({
        id: 'case-person-only',
        title: '대출만 남은 프로젝트',
        customerName: '이서연',
        primaryContact: { id: 'c-primary', name: '이서연', phone: '01012345678' },
        assignedTo: { id: 'user-1', name: '박대리' },
        stepCount: 0,
        nextStepTitle: null,
        latestComment: null,
      }),
    ]);
  });

  it('매물 의뢰 단계는 지금 거래와 함께 가장 최근에 취소된 거래 하나를 준다 (새 거래가 위, 취소 줄은 아래)', async () => {
    const { tx } = setup();
    const deal = (id: string, createdAt: string, cancelledAt: string | null) => ({
      id,
      stage: 'preContract',
      isCancelled: cancelledAt !== null,
      cancelledAt: cancelledAt ? new Date(cancelledAt) : null,
      cancelReason: cancelledAt ? `${id} 사유` : null,
      transactionType: 'sale',
      agreedPrice: 158000,
      agreedDeposit: null,
      agreedMonthlyRent: null,
      createdAt: new Date(createdAt),
      buyerContact: { name: '매수인' },
      sellerContact: { name: '매도인' },
      listing: null,
      payments: [],
      contract: null,
    });
    const project = (deals: ReturnType<typeof deal>[]) => ({
      id: PROJECT_ID,
      title: null,
      memo: null,
      archivedAt: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
      primaryContact: null,
      assignedTo: null,
      _count: { comments: 0 },
      steps: [
        {
          id: 'step-1',
          sortOrder: 1,
          title: '매도',
          targetDate: null,
          memo: null,
          doneAt: null,
          buyerIntake: null,
          deal: null,
          listingIntake: {
            id: 'listing-1',
            propertyId: 'property-1',
            lifecycleStatus: 'open',
            closedReason: null,
            property: {
              site: { name: '고덕그라시움' },
              unit: { name: '2203', floor: 22, floorEnd: null, floorLabel: null, dong: { name: '102', isPlaceholder: false } },
              propertyContacts: [],
            },
            listings: [
              { id: 'l1', transactionType: 'sale', price: 158000, deposit: null, monthlyRent: null, isPaused: false, _count: { matches: 0 }, deals },
            ],
          },
        },
      ],
    });
    const findFirst = jest.fn();
    const service = new ProjectPlanService({ ...tx, project: { ...tx.project, findFirst } } as never);

    // 취소된 거래 둘(나중에 취소한 것이 위)과 그 뒤에 새로 만든 거래
    findFirst.mockResolvedValueOnce(
      project([
        deal('new', '2026-11-21T00:00:00Z', null),
        deal('old-cancel', '2026-11-01T00:00:00Z', '2026-11-05T00:00:00Z'),
        deal('late-cancel', '2026-11-10T00:00:00Z', '2026-11-20T00:00:00Z'),
      ]),
    );
    const withNew = await service.findOne(PROJECT_ID, OFFICE_ID);
    expect(withNew.steps[0].deal?.id).toBe('new');
    expect(withNew.steps[0].cancelledDeal).toMatchObject({
      id: 'late-cancel',
      isCancelled: true,
      cancelReason: 'late-cancel 사유',
    });
    // 주소는 공용 formatPlaceLabel 모양이다.
    expect(withNew.steps[0].listingIntake?.label).toBe('고덕그라시움 102동 2203호');

    // 취소만 있고 새 거래가 없으면 지금 거래는 없고 취소 줄만 남는다.
    findFirst.mockResolvedValueOnce(project([deal('only-cancel', '2026-11-10T00:00:00Z', '2026-11-20T00:00:00Z')]));
    const cancelledOnly = await service.findOne(PROJECT_ID, OFFICE_ID);
    expect(cancelledOnly.steps[0].deal).toBeNull();
    expect(cancelledOnly.steps[0].cancelledDeal?.id).toBe('only-cancel');

    // 취소된 거래가 없으면 null.
    findFirst.mockResolvedValueOnce(project([deal('new', '2026-11-21T00:00:00Z', null)]));
    expect((await service.findOne(PROJECT_ID, OFFICE_ID)).steps[0].cancelledDeal).toBeNull();
  });

  it('매물 의뢰 · 구매 의뢰로 그 의뢰를 담은 프로젝트를 찾는다 (매물 상세 · 희망 조건 화면에서)', async () => {
    const { tx } = setup();
    const findMany = jest.fn(async () => []);
    const prisma = {
      ...tx,
      project: { ...tx.project, findMany, count: jest.fn(async () => 0) },
      $transaction: jest.fn(),
    };
    const service = new ProjectPlanService(prisma as never);
    await service.findAll(OFFICE_ID, { status: 'all', listingIntakeId: 'li-1' });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { officeId: OFFICE_ID, AND: [{ listingIntakes: { some: { id: 'li-1' } } }] },
      }),
    );
    await service.findAll(OFFICE_ID, { status: 'all', buyerIntakeId: 'bi-1' });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { officeId: OFFICE_ID, AND: [{ buyerIntakes: { some: { id: 'bi-1' } } }] },
      }),
    );
  });

  it('목록 필터(담당 여럿 · 담당 없음 · 내 프로젝트 · 의뢰 · 대표 고객 · 시작 기간 · 이름순)를 서버에서 건다', async () => {
    const { tx } = setup();
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const prisma = { ...tx, project: { ...tx.project, findMany, count }, $transaction: jest.fn() };
    const service = new ProjectPlanService(prisma as never);
    await service.findAll(OFFICE_ID, {
      assignedToIds: ['user-1', 'none'],
      mineUserId: 'me',
      intakes: ['listing', 'none'],
      primary: 'empty',
      createdFrom: '2026-11-01',
      createdTo: '2026-11-30',
      sort: 'title',
    });
    const args = (findMany.mock.calls[0] as unknown as [
      { where: { AND: unknown[] }; orderBy: unknown[] },
    ])[0];
    expect(args.where.AND).toEqual([
      { OR: [{ assignedToId: { in: ['user-1'] } }, { assignedToId: null }] },
      { assignedToId: 'me' },
      {
        OR: [
          { listingIntakes: { some: {} } },
          { listingIntakes: { none: {} }, buyerIntakes: { none: {} } },
        ],
      },
      { primaryContactId: null },
      // 한국 날짜로 자른다: 11월 1일 0시(KST)부터 12월 1일 0시(KST) 전까지
      {
        createdAt: {
          gte: new Date('2026-10-31T15:00:00.000Z'),
          lt: new Date('2026-11-30T15:00:00.000Z'),
        },
      },
    ]);
    // 이름순은 오름차순이 기본이고 이름 없는 프로젝트는 뒤로
    expect(args.orderBy).toEqual([{ title: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]);
    expect(count).toHaveBeenCalled();

    await expect(service.findAll(OFFICE_ID, { statuses: ['done'] })).rejects.toThrow(
      '상태는 준비 · 진행 중 · 마무리 중에서 고르세요.',
    );
    await expect(service.findAll(OFFICE_ID, { intakes: ['deal'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.findAll(OFFICE_ID, { createdFrom: '11/01' })).rejects.toThrow(
      '시작 날짜가 올바르지 않습니다.',
    );
    await expect(
      service.findAll(OFFICE_ID, { createdFrom: '2026-12-01', createdTo: '2026-11-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('상태(계산한 값)로 거르면 맞는 것만 세고 그 안에서 쪽을 자른다', async () => {
    const { tx } = setup();
    const row = (id: string, steps: Array<{ done: boolean }>) => ({
      id,
      title: id,
      memo: null,
      archivedAt: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
      primaryContact: null,
      assignedTo: null,
      _count: { comments: 0 },
      comments: [],
      steps: steps.map((step, index) => ({
        id: `${id}-s${index}`,
        sortOrder: index + 1,
        title: `단계 ${index + 1}`,
        targetDate: null,
        memo: null,
        doneAt: step.done ? new Date('2026-11-02T00:00:00Z') : null,
        listingIntake: null,
        buyerIntake: null,
        deal: null,
      })),
    });
    const findMany = jest.fn(async () => [
      row('empty-1', []),
      row('going-1', [{ done: true }, { done: false }]),
      row('wrap-1', [{ done: true }]),
      row('empty-2', []),
      row('going-2', [{ done: false }]),
    ]);
    const count = jest.fn(async () => 99);
    const prisma = { ...tx, project: { ...tx.project, findMany, count }, $transaction: jest.fn() };
    const service = new ProjectPlanService(prisma as never);

    const first = await service.findAll(OFFICE_ID, { statuses: ['active', 'preparing'], limit: 3 });
    expect(first.total).toBe(4);
    expect(first.items.map((item) => item.id)).toEqual(['empty-1', 'going-1', 'empty-2']);
    expect(first.nextOffset).toBe(3);
    // 전체 수는 count가 아니라 걸러 낸 수다
    expect(count).not.toHaveBeenCalled();
    const second = await service.findAll(OFFICE_ID, {
      statuses: ['active', 'preparing'],
      limit: 3,
      offset: 3,
    });
    expect(second.items.map((item) => item.id)).toEqual(['going-2']);
    expect(second.nextOffset).toBeNull();
    const wrapping = await service.findAll(OFFICE_ID, { statuses: ['wrapping'] });
    expect(wrapping.items.map((item) => item.id)).toEqual(['wrap-1']);
  });

  it('끝낸 프로젝트만, 또는 담당 직원으로 거를 수 있고 모르는 status는 거절한다', async () => {
    const { tx } = setup();
    const findMany = jest.fn(async () => []);
    const prisma = {
      ...tx,
      project: { ...tx.project, findMany, count: jest.fn(async () => 0) },
      $transaction: jest.fn(),
    };
    const service = new ProjectPlanService(prisma as never);
    await service.findAll(OFFICE_ID, { status: 'archived', assignedToId: 'user-1' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { officeId: OFFICE_ID, archivedAt: { not: null }, AND: [{ assignedToId: 'user-1' }] },
      }),
    );
    await expect(service.findAll(OFFICE_ID, { status: 'closed' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('목록은 쪽을 넘겨 끝낸 프로젝트까지 모두 볼 수 있다', async () => {
    const { tx } = setup();
    const row = (id: string) => ({
      id,
      title: id,
      memo: null,
      archivedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2025-12-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      primaryContact: null,
      assignedTo: null,
      _count: { comments: 0 },
      comments: [],
      steps: [],
    });
    const findMany = jest.fn(async () => [row('p3'), row('p4')]);
    const prisma = {
      ...tx,
      project: { ...tx.project, findMany, count: jest.fn(async () => 5) },
      $transaction: jest.fn(),
    };
    const service = new ProjectPlanService(prisma as never);
    const page = await service.findAll(OFFICE_ID, {
      status: 'archived',
      sort: 'created',
      offset: 2,
      limit: 2,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 2,
        take: 2,
      }),
    );
    // 5개 중 2~3번째를 받았다. 다음 쪽은 4번째부터.
    expect(page.total).toBe(5);
    expect(page.nextOffset).toBe(4);
    await expect(service.findAll(OFFICE_ID, { sort: 'name' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.findAll(OFFICE_ID, { limit: 101 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.findAll(OFFICE_ID, { offset: -1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('더 담을 후보에는 이미 종료된 의뢰와, 이 프로젝트에 없는 구매 의뢰의 거래도 들어간다', async () => {
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
    await new ProjectPlanService(prisma as never).findCandidates(PROJECT_ID, OFFICE_ID);

    // 진행 상태로 거르지 않는다: 거래가 끝나 종료된 의뢰도 흐름에 넣을 수 있어야 한다.
    expect(calls.listing).not.toHaveProperty('lifecycleStatus');
    expect(calls.buyer).not.toHaveProperty('lifecycleStatus');
    expect(calls.listing).toMatchObject({
      OR: [
        { projectId: null },
        { project: { archivedAt: { not: null } } },
      ],
    });
    // 구매 의뢰가 있는 거래도, 그 의뢰가 이 프로젝트에 없으면 후보다.
    expect(calls.deal).not.toHaveProperty('buyerIntakeId');
    expect(calls.deal).toMatchObject({
      NOT: [
        { buyerIntake: { projectId: PROJECT_ID } },
        { listing: { intake: { projectId: PROJECT_ID } } },
      ],
    });
  });

  it('다른 손님을 고르면 그 사람(같은 사무소)의 담을 수 있는 의뢰만 후보로 준다', async () => {
    const { tx } = setup();
    const calls: Record<string, unknown> = {};
    const buyerIntakeContact = { findMany: jest.fn(async () => [{ contactId: 'c1' }]) };
    const prisma = {
      ...tx,
      buyerIntakeContact,
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
      deal: { findMany: jest.fn(async () => []) },
    };
    const service = new ProjectPlanService(prisma as never);
    await service.findCandidates(PROJECT_ID, OFFICE_ID, { contactId: 'spouse' });

    // 프로젝트 사람들이 아니라 고른 사람 한 명으로 찾는다.
    expect(buyerIntakeContact.findMany).not.toHaveBeenCalled();
    expect(calls.buyer).toMatchObject({ contacts: { some: { contactId: { in: ['spouse'] } } } });
    expect(calls.listing).toMatchObject({
      property: { propertyContacts: { some: { contactId: { in: ['spouse'] } } } },
    });
    // 다른 사무소(없는) 연락처는 거절한다.
    await expect(
      service.findCandidates(PROJECT_ID, OFFICE_ID, { contactId: 'contact-missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('연락처로 거르면 대표 고객이거나 담긴 의뢰의 당사자인 프로젝트만 준다', async () => {
    const { tx } = setup();
    const findMany = jest.fn(async () => []);
    const prisma = {
      ...tx,
      project: { ...tx.project, findMany, count: jest.fn(async () => 0) },
      $transaction: jest.fn(),
    };
    await new ProjectPlanService(prisma as never).findAll(OFFICE_ID, {
      status: 'all',
      contactId: 'c1',
    });
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0]
      .where;
    expect(where).not.toHaveProperty('archivedAt');
    expect(where).toMatchObject({
      AND: [
        {
          OR: [
            { primaryContactId: 'c1' },
            { buyerIntakes: { some: { contacts: { some: { contactId: 'c1' } } } } },
            expect.objectContaining({ listingIntakes: expect.anything() }),
          ],
        },
      ],
    });
  });

  it('의뢰 없이 대표 고객만 정해도 프로젝트를 연다', async () => {
    const { service, tx, calls } = setup();
    await service.create(OFFICE_ID, { primaryContactId: 'contact-1', assignedToId: 'user-1' });
    expect(tx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officeId: OFFICE_ID,
          primaryContactId: 'contact-1',
          assignedToId: 'user-1',
        }),
      }),
    );
    // 단계는 사용자가 나중에 담는다.
    expect(calls).toEqual(['case.create']);
  });

  it('다른 사무소 연락처나 없는 직원을 대표 고객·담당으로 받지 않는다', async () => {
    const { service, tx } = setup();
    await expect(
      service.create(OFFICE_ID, { primaryContactId: 'contact-missing' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(OFFICE_ID, { primaryContactId: 'contact-1', assignedToId: 'user-missing' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(PROJECT_ID, OFFICE_ID, { primaryContactId: 'contact-missing' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.project.create).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
    // 사무소로 좁혀서 찾는다.
    expect(tx.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'contact-missing', officeId: OFFICE_ID } }),
    );
  });

  it('아무것도 없이도 빈 프로젝트를 연다 (작업 공간) — 담당을 보내지 않으면 만든 사람이 담당이다', async () => {
    const empty = setup();
    await empty.service.create(OFFICE_ID, {}, 'user-creator');
    expect(empty.tx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officeId: OFFICE_ID,
          title: null,
          memo: null,
          primaryContactId: null,
          assignedToId: 'user-creator',
        }),
      }),
    );
    expect(empty.calls).toEqual(['case.create']);

    // 담당 없음을 골랐으면(null) 만든 사람으로 채우지 않는다.
    const unassigned = setup();
    await unassigned.service.create(OFFICE_ID, { assignedToId: null }, 'user-creator');
    expect(unassigned.tx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedToId: null }) }),
    );
  });

  it('고른 의뢰를 접수 순서대로 프로젝트에 담고 의뢰마다 단계를 만든다', async () => {
    const { service, calls } = setup({
      listingIntakes: [listingIntake('listing-1', '2026-03-02T00:00:00Z')],
      buyerIntakes: [buyerIntake('buyer-1', '2026-03-01T00:00:00Z')],
    });

    await service.create(OFFICE_ID, {
      title: ' 갈아타기 ',
      listingIntakeIds: ['listing-1'],
      buyerIntakeIds: ['buyer-1', 'buyer-1'],
    });

    // 의뢰의 프로젝트 참조를 먼저 맞춘 뒤에 단계를 만든다(단계의 복합 FK가 같은 프로젝트의 의뢰만 받는다).
    expect(calls).toEqual([
      'case.create',
      `buyerIntake.update(case=${PROJECT_ID})`,
      'step.create(전세 구매 의뢰#1)',
      `listingIntake.update(case=${PROJECT_ID})`,
      'step.create(고덕그라시움 101동 3501호 매물 의뢰#1)',
    ]);
  });

  it('없는 의뢰나 다른 프로젝트에 묶인 의뢰는 거절한다', async () => {
    const missing = setup({ listingIntakes: [] });
    await expect(
      missing.service.create(OFFICE_ID, { listingIntakeIds: ['listing-1'] }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const taken = setup({
      listingIntakes: [listingIntake('listing-1', '2026-03-01T00:00:00Z', 'other-case')],
    });
    // 진행 중인(보관하지 않은) 다른 프로젝트다.
    taken.tx.project.findFirst.mockResolvedValue({
      id: 'other-case',
      archivedAt: null,
    } as never);
    await expect(
      taken.service.create(OFFICE_ID, { listingIntakeIds: ['listing-1'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(taken.calls).not.toContain(`listingIntake.update(case=${PROJECT_ID})`);
  });

  it('보관한 프로젝트에 남아 있던 의뢰를 새 프로젝트로 옮겨도 옛 단계 기록은 남고, 새 단계가 내용을 이어받는다', async () => {
    const { service, tx, calls } = setup({
      listingIntakes: [listingIntake('listing-1', '2026-03-01T00:00:00Z', 'archived-case')],
    });
    // 다른 프로젝트를 조회하면 보관된 프로젝트다.
    tx.project.findFirst.mockImplementation((async (args: {
      where: { id: string };
    }) =>
      args.where.id === 'archived-case'
        ? { id: 'archived-case', archivedAt: new Date('2026-01-01T00:00:00Z') }
        : {
            id: PROJECT_ID,
            primaryContact: null,
            assignedTo: null,
            _count: { comments: 0 },
            steps: [],
          }) as never);
    const targetDate = new Date('2026-05-20T00:00:00Z');
    tx.projectStep.findMany.mockResolvedValueOnce([
      { id: 'old-step', title: 'A 매도', targetDate, memo: '잔금 5/20 협의' },
    ] as never);
    const updateMany = jest.fn(async () => {
      calls.push('oldStep.unlink');
      return { count: 1 };
    });
    (tx.projectStep as unknown as { updateMany: typeof updateMany }).updateMany =
      updateMany;

    await service.create(OFFICE_ID, { listingIntakeIds: ['listing-1'] });

    // 옛 단계는 지우지 않는다. 의뢰를 가리키는 연결만 끊어 기록으로 남긴다.
    expect(tx.projectStep.deleteMany).not.toHaveBeenCalled();
    expect(tx.projectStep.delete).not.toHaveBeenCalled();
    // 거래가 진행 중이라 완료가 아니었던 단계는 그대로 미완료 기록으로 남는다.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-step'] } },
      data: { listingIntakeId: null, doneAt: null },
    });
    // 연결을 끊은 뒤에 의뢰의 프로젝트를 바꾼다(먼저 바꾸면 옛 단계가 새 프로젝트로 딸려 간다).
    expect(calls).toEqual([
      'case.create',
      'oldStep.unlink',
      `listingIntake.update(case=${PROJECT_ID})`,
      'step.create(A 매도#1)',
    ]);
    // 새 단계가 제목·목표일·메모를 이어받는다.
    expect(tx.projectStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: PROJECT_ID,
        listingIntakeId: 'listing-1',
        title: 'A 매도',
        targetDate,
        memo: '잔금 5/20 협의',
      }),
    });
  });

  it('보관한 프로젝트에서 완료였던 의뢰 단계는 연결을 끊어도 완료 기록으로 남는다', async () => {
    const completedAt = new Date('2026-04-30T09:00:00Z');
    const { service, tx } = setup({
      buyerIntakes: [buyerIntake('buyer-1', '2026-03-01T00:00:00Z', 'archived-case')],
      // 이 의뢰의 현재 거래가 완료 단계다.
      deal: { stage: 'completed', stageChangedAt: completedAt },
    });
    tx.project.findFirst.mockImplementation((async (args: {
      where: { id: string };
    }) =>
      args.where.id === 'archived-case'
        ? { id: 'archived-case', archivedAt: new Date('2026-05-01T00:00:00Z') }
        : {
            id: PROJECT_ID,
            primaryContact: null,
            assignedTo: null,
            _count: { comments: 0 },
            steps: [],
          }) as never);
    tx.projectStep.findMany.mockResolvedValueOnce([
      { id: 'old-step', title: 'B 매수', targetDate: null, memo: null },
    ] as never);
    const updateMany = jest.fn(async () => ({ count: 1 }));
    (tx.projectStep as unknown as { updateMany: typeof updateMany }).updateMany =
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

  it('묶음을 풀 때 단계를 먼저 지우고 의뢰와 업무를 뺀 뒤 프로젝트를 지운다', async () => {
    const { service, calls, tx } = setup();
    await service.remove(PROJECT_ID, OFFICE_ID, 'owner');
    // 업무는 프로젝트가 없어져도 남는다. 연결만 끊는다(FK가 지우기를 막으므로 프로젝트보다 먼저).
    expect(calls).toEqual([
      'step.deleteMany',
      'listingIntake.updateMany(case=null)',
      'buyerIntake.updateMany(case=null)',
      'task.updateMany(case=null)',
      'case.delete',
    ]);
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { officeId: OFFICE_ID, projectId: PROJECT_ID },
      data: { projectId: null },
    });
  });

  it('프로젝트 풀기는 대표 · 매니저만 한다 (풀면 남의 코멘트까지 지워진다)', async () => {
    const manager = setup();
    await manager.service.remove(PROJECT_ID, OFFICE_ID, 'manager');
    expect(manager.calls).toContain('case.delete');

    // 내용이 있는 프로젝트(코멘트가 있음)는 중개사가 담당이어도 못 푼다.
    const agent = setup();
    agent.tx.project.findFirst.mockResolvedValue({
      id: PROJECT_ID,
      title: null,
      memo: null,
      primaryContactId: null,
      assignedToId: 'agent-1',
      _count: { steps: 0, comments: 2, tasks: 0 },
    } as never);
    const attempt = agent.service.remove(PROJECT_ID, OFFICE_ID, 'agent', 'agent-1');
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(agent.service.remove(PROJECT_ID, OFFICE_ID, 'agent', 'agent-1')).rejects.toThrow(
      '프로젝트 풀기는 대표·매니저만 할 수 있습니다. 정리하려면 끝내기를 쓰세요.',
    );
    // 아무것도 지우지 않는다.
    expect(agent.calls).toEqual([]);
  });

  it('아무것도 적지 않은 빈 프로젝트는 담당(만든 사람)이 지울 수 있다 — 남의 빈 프로젝트는 못 지운다', async () => {
    const emptyProject = (assignedToId: string | null) => ({
      id: PROJECT_ID,
      title: null,
      memo: null,
      primaryContactId: null,
      assignedToId,
      _count: { steps: 0, comments: 0, tasks: 0 },
    });
    const own = setup();
    own.tx.project.findFirst.mockResolvedValue(emptyProject('agent-1') as never);
    await own.service.remove(PROJECT_ID, OFFICE_ID, 'agent', 'agent-1');
    expect(own.calls).toContain('case.delete');

    const others = setup();
    others.tx.project.findFirst.mockResolvedValue(emptyProject('someone-else') as never);
    await expect(
      others.service.remove(PROJECT_ID, OFFICE_ID, 'agent', 'agent-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(others.calls).toEqual([]);

    // 업무를 하나라도 적었으면 빈 프로젝트가 아니다.
    const withTask = setup();
    withTask.tx.project.findFirst.mockResolvedValue({
      ...emptyProject('agent-1'),
      _count: { steps: 0, comments: 0, tasks: 1 },
    } as never);
    await expect(
      withTask.service.remove(PROJECT_ID, OFFICE_ID, 'agent', 'agent-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(withTask.calls).toEqual([]);

    // 이름 하나만 적어도 빈 프로젝트가 아니다.
    const titled = setup();
    titled.tx.project.findFirst.mockResolvedValue({ ...emptyProject('agent-1'), title: '갈아타기' } as never);
    await expect(
      titled.service.remove(PROJECT_ID, OFFICE_ID, 'agent', 'agent-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('의뢰를 가리키는 단계를 지우면 그 의뢰도 프로젝트에서 빠진다', async () => {
    const { service, calls } = setup({
      steps: [{ id: 'step-1', listingIntakeId: 'listing-1', buyerIntakeId: null, dealId: null }],
    });
    await service.removeStep(PROJECT_ID, 'step-1', OFFICE_ID);
    expect(calls).toEqual(['step.delete', 'listingIntake.updateMany(case=null)']);
  });

  it('완료 체크는 아무것도 가리키지 않는 단계에만 받는다', async () => {
    const linked = setup({
      steps: [{ id: 'step-1', listingIntakeId: null, buyerIntakeId: 'buyer-1', dealId: null, doneAt: null }],
    });
    await expect(
      linked.service.updateStep(PROJECT_ID, 'step-1', OFFICE_ID, { done: true }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const manual = setup({
      steps: [{ id: 'step-2', listingIntakeId: null, buyerIntakeId: null, dealId: null, doneAt: null }],
    });
    await manual.service.updateStep(PROJECT_ID, 'step-2', OFFICE_ID, { done: true });
    expect(manual.tx.projectStep.update).toHaveBeenCalledWith({
      where: { id: 'step-2' },
      data: { doneAt: expect.any(Date) },
    });
  });

  it('순서는 프로젝트의 모든 단계를 빠짐없이 보냈을 때만 저장한다', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const partial = setup({ steps });
    await expect(
      partial.service.reorderSteps(PROJECT_ID, OFFICE_ID, {
        steps: [
          { id: 'a', sortOrder: 2 },
          { id: 'b', sortOrder: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(partial.tx.projectStep.update).not.toHaveBeenCalled();

    const invalid = setup({ steps });
    await expect(
      invalid.service.reorderSteps(PROJECT_ID, OFFICE_ID, {
        steps: [{ id: 'a', sortOrder: 0 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // 같은 번호는 동시 진행이다.
    const full = setup({ steps });
    await full.service.reorderSteps(PROJECT_ID, OFFICE_ID, {
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

  it('프로젝트에 담긴 의뢰에서 나온 거래는 거래 단계로 다시 넣지 못한다', async () => {
    const { service, tx } = setup({
      deal: {
        id: 'deal-1',
        transactionType: 'sale',
        buyerIntake: { projectId: PROJECT_ID },
        listing: null,
      },
    });
    await expect(
      service.createStep(PROJECT_ID, OFFICE_ID, { dealId: 'deal-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.projectStep.create).not.toHaveBeenCalled();
  });

  it('의뢰를 거치지 않은 거래는 거래 단계로 넣고 제목을 채운다', async () => {
    const { service, calls } = setup({
      deal: {
        id: 'deal-1',
        transactionType: 'jeonse',
        buyerIntake: null,
        listing: {
          intake: { projectId: null },
          property: { site: { name: '래미안' }, unit: null },
        },
      },
    });
    await service.createStep(PROJECT_ID, OFFICE_ID, { dealId: 'deal-1' });
    expect(calls).toEqual(['step.create(래미안 전세 거래#1)']);
  });

  it('아무것도 가리키지 않는 단계는 제목이 있어야 한다', async () => {
    const { service } = setup();
    await expect(
      service.createStep(PROJECT_ID, OFFICE_ID, { title: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
