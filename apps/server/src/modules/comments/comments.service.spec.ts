import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommentsService } from './comments.service';

const OFFICE_ID = 'office-1';
const TARGET_UUIDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  propertyId: '22222222-2222-4222-8222-222222222222',
  listingIntakeId: '33333333-3333-4333-8333-333333333333',
  buyerIntakeId: '44444444-4444-4444-8444-444444444444',
  dealId: '55555555-5555-4555-8555-555555555555',
} as const;

const author = { userId: 'user-author', officeId: OFFICE_ID, role: 'agent' };
const coworker = { userId: 'user-other', officeId: OFFICE_ID, role: 'agent' };
const manager = { userId: 'user-mgr', officeId: OFFICE_ID, role: 'manager' };

function setup(
  options: {
    exists?: {
      project?: boolean;
      property?: boolean;
      listingIntake?: boolean;
      buyerIntake?: boolean;
      deal?: boolean;
    };
    comment?: { id: string; authorId: string | null } | null;
  } = {},
) {
  const exists = options.exists ?? {};
  const prisma = {
    project: {
      findFirst: jest.fn().mockResolvedValue(
        exists.project === false ? null : { id: TARGET_UUIDS.projectId },
      ),
    },
    property: {
      findFirst: jest.fn().mockResolvedValue(
        exists.property === false ? null : { id: TARGET_UUIDS.propertyId },
      ),
    },
    listingIntake: {
      findFirst: jest.fn().mockResolvedValue(
        exists.listingIntake === false
          ? null
          : { id: TARGET_UUIDS.listingIntakeId },
      ),
    },
    buyerIntake: {
      findFirst: jest.fn().mockResolvedValue(
        exists.buyerIntake === false ? null : { id: TARGET_UUIDS.buyerIntakeId },
      ),
    },
    deal: {
      findFirst: jest.fn().mockResolvedValue(
        exists.deal === false ? null : { id: TARGET_UUIDS.dealId },
      ),
    },
    comment: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(
        options.comment === undefined
          ? { id: 'c1', authorId: author.userId }
          : options.comment,
      ),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'new-comment',
        body: data.body,
        projectId: data.projectId ?? null,
        propertyId: data.propertyId ?? null,
        listingIntakeId: data.listingIntakeId ?? null,
        buyerIntakeId: data.buyerIntakeId ?? null,
        dealId: data.dealId ?? null,
        createdAt: new Date('2026-11-21T00:00:00Z'),
        updatedAt: new Date('2026-11-21T00:00:00Z'),
        author: { id: author.userId, name: '작성자' },
      })),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'c1',
        body: data.body,
        projectId: TARGET_UUIDS.projectId,
        propertyId: null,
        listingIntakeId: null,
        buyerIntakeId: null,
        dealId: null,
        createdAt: new Date('2026-11-21T00:00:00Z'),
        updatedAt: new Date('2026-11-21T01:00:00Z'),
        author: { id: author.userId, name: '작성자' },
      })),
      delete: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
  };
  return { prisma, service: new CommentsService(prisma as never) };
}

describe('CommentsService', () => {
  it('대상 ID가 0개이거나 2개 이상이거나 UUID가 아니면 거절한다', async () => {
    const { service } = setup();

    await expect(service.findAll({}, OFFICE_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.findAll(
        {
          projectId: TARGET_UUIDS.projectId,
          dealId: TARGET_UUIDS.dealId,
        },
        OFFICE_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(
        { propertyId: 'not-a-uuid' },
        author,
        { body: '메모' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('다섯 축 모두에서 대상이 같은 사무소에 있어야 읽고 쓸 수 있다', async () => {
    for (const [key, missingFlag] of [
      ['projectId', 'project'],
      ['propertyId', 'property'],
      ['listingIntakeId', 'listingIntake'],
      ['buyerIntakeId', 'buyerIntake'],
      ['dealId', 'deal'],
    ] as const) {
      const { service } = setup({ exists: { [missingFlag]: false } });
      await expect(
        service.findAll({ [key]: TARGET_UUIDS[key] }, OFFICE_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.create({ [key]: TARGET_UUIDS[key] }, author, { body: '메모' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('다섯 축 중 하나로 코멘트를 쓰면 해당 FK만 채워 저장한다', async () => {
    const { prisma, service } = setup();

    const created = await service.create(
      { dealId: TARGET_UUIDS.dealId },
      author,
      { body: '  잔금일 12/20로 협의 중  ' },
    );

    expect(created.dealId).toBe(TARGET_UUIDS.dealId);
    expect(created.projectId).toBeNull();
    expect(prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          officeId: OFFICE_ID,
          dealId: TARGET_UUIDS.dealId,
          authorId: author.userId,
          body: '잔금일 12/20로 협의 중',
        },
      }),
    );
  });

  it('최근 것부터 limit만큼 주고, 더 있으면 마지막 글의 createdAt|id를 nextBefore로 준다', async () => {
    const { prisma, service } = setup();
    const id3 = '00000000-0000-4000-8000-000000000003';
    const id2 = '00000000-0000-4000-8000-000000000002';
    const id1 = '00000000-0000-4000-8000-000000000001';
    const t3 = new Date('2026-11-23T00:00:00.000Z');
    const t2 = new Date('2026-11-22T00:00:00.000Z');
    const t1 = new Date('2026-11-21T00:00:00.000Z');

    prisma.comment.count.mockResolvedValue(3);
    prisma.comment.findMany
      .mockResolvedValueOnce([
        { id: id3, body: '셋', createdAt: t3 },
        { id: id2, body: '둘', createdAt: t2 },
        { id: id1, body: '하나', createdAt: t1 },
      ])
      .mockResolvedValueOnce([{ id: id1, body: '하나', createdAt: t1 }]);

    const first = await service.findAll(
      { projectId: TARGET_UUIDS.projectId },
      OFFICE_ID,
      { limit: 2 },
    );
    expect(first.total).toBe(3);
    expect(first.items.map((row) => row.id)).toEqual([id3, id2]);
    expect(first.nextBefore).toBe(`${t2.toISOString()}|${id2}`);

    const older = await service.findAll(
      { projectId: TARGET_UUIDS.projectId },
      OFFICE_ID,
      { limit: 2, before: first.nextBefore! },
    );
    expect(older.items.map((row) => row.id)).toEqual([id1]);
    expect(older.nextBefore).toBeNull();

    expect(prisma.comment.findMany.mock.calls[1][0].where).toEqual({
      AND: [
        { officeId: OFFICE_ID, projectId: TARGET_UUIDS.projectId },
        {
          OR: [
            { createdAt: { lt: t2 } },
            { createdAt: t2, id: { lt: id2 } },
          ],
        },
      ],
    });
  });

  it('before나 limit의 형식이 틀리면 조용히 처음 쪽을 주지 않고 거절한다', async () => {
    const { service } = setup();
    const id = '00000000-0000-4000-8000-000000000002';

    for (const before of [
      'c2',
      id,
      `어제|${id}`,
      '2026-11-20T00:00:00.000Z|c2',
      `2026-11-20T00:00:00.000Z|${id}|x`,
    ]) {
      await expect(
        service.findAll({ projectId: TARGET_UUIDS.projectId }, OFFICE_ID, {
          before,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.findAll({ projectId: TARGET_UUIDS.projectId }, OFFICE_ID, {
        limit: 101,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('코멘트 작성 validation: 빈 글이나 5000자 초과는 막는다', async () => {
    const { service } = setup();

    await expect(
      service.create({ projectId: TARGET_UUIDS.projectId }, author, {
        body: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ projectId: TARGET_UUIDS.projectId }, author, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ projectId: TARGET_UUIDS.projectId }, author, {
        body: '가'.repeat(5001),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('고치기는 작성자 본인만 되고, 지우기는 작성자나 대표·매니저만 된다', async () => {
    const { prisma, service } = setup();

    await expect(
      service.update('c1', coworker, { body: '고침' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update('c1', manager, { body: '고침' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.update('c1', author, { body: '고침' });
    expect(prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { body: '고침' } }),
    );

    await expect(service.remove('c1', coworker)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await service.remove('c1', manager);
    await service.remove('c1', author);
    expect(prisma.comment.delete).toHaveBeenCalledTimes(2);
  });

  it('없는 코멘트면 찾을 수 없다고 막는다', async () => {
    const { prisma, service } = setup({ comment: null });
    await expect(
      service.update('c9', author, { body: '고침' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comment.findFirst).toHaveBeenCalledWith({
      where: {
        officeId: OFFICE_ID,
        id: 'c9',
      },
      select: { id: true, authorId: true },
    });
  });
});
