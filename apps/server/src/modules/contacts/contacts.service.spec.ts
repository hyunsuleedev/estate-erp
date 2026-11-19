import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContactsService } from './contacts.service';

describe('ContactsService', () => {
  function createService() {
    const contact = {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
    };
    const tx = {
      contact,
      contactTag: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      contactTagAssignment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      contact,
      tx,
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };

    return {
      prisma,
      service: new ContactsService(prisma as never),
    };
  }

  it('returns the latest consultation summary for contact list rows', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-01T09:00:00.000Z');
    prisma.contact.findMany.mockResolvedValue([
      {
        id: 'contact-1',
        officeId: 'office-1',
        name: '홍길동',
        phone: '01012345678',
        phones: [],
        email: null,
        tagAssignments: [{ tag: { name: '신혼' } }, { tag: { name: 'VIP' } }],
        memo: '고정 메모',
        createdAt,
        updatedAt: createdAt,
        _count: { propertyContacts: 1, buyerRequirements: 0, consultations: 2 },
        groupMemberships: [{ group: { name: '설 선물' } }, { group: { name: 'VIP' } }],
        consultations: [
          {
            content: '최근 상담 내용입니다.',
            type: 'call',
            createdAt,
          },
        ],
      },
    ]);
    prisma.contact.count.mockResolvedValue(1);

    await expect(service.findAll('office-1')).resolves.toMatchObject({
      items: [
        {
          id: 'contact-1',
          memo: '고정 메모',
          // 그룹은 태그와 따로, 이름 순으로 돌려준다
          groups: ['설 선물', 'VIP'],
          // 태그는 붙인 순서대로
          tags: ['신혼', 'VIP'],
          latestConsultation: {
            content: '최근 상담 내용입니다.',
            type: 'call',
            createdAt,
          },
        },
      ],
      pagination: { total: 1 },
    });

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          consultations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              content: true,
              type: true,
              createdAt: true,
            },
          },
        }),
      }),
    );
  });

  it('requires every category when several are given', async () => {
    const { prisma, service } = createService();
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.count.mockResolvedValue(0);

    await service.findAll('office-1', { categories: ['owner', 'no_phone'] });

    const where = prisma.contact.findMany.mock.calls[0][0].where;
    // 분류마다 조건 하나씩 — 둘 다 만족해야 한다
    expect(where.AND).toHaveLength(2);

    prisma.contact.findMany.mockClear();
    await service.findAll('office-1', {});
    expect(prisma.contact.findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it('stores canonical phone digits and promotes the first number when no primary is selected', async () => {
    const { prisma, service } = createService();
    prisma.contact.create.mockResolvedValue({ id: 'contact-1' });
    prisma.contact.findUniqueOrThrow.mockResolvedValue({
      id: 'contact-1',
      phones: [
        { phone: '01012345678', isPrimary: true },
        { phone: '0212345678', isPrimary: false },
      ],
      tagAssignments: [],
    });

    await service.create('office-1', {
      name: '홍길동',
      phones: [
        { phone: '+82 10-1234-5678' },
        { phone: '02-1234-5678' },
      ],
    });

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phones: {
            create: [
              expect.objectContaining({
                phone: '01012345678',
                isPrimary: true,
              }),
              expect.objectContaining({
                phone: '0212345678',
                isPrimary: false,
              }),
            ],
          },
        }),
      }),
    );

    const createInput = prisma.contact.create.mock.calls[0][0];
    expect(createInput.data.phones.create[0]).not.toHaveProperty('normalizedPhone');
    expect(createInput.data.phones.create[0]).not.toHaveProperty('isActive');
  });

  it('rejects more than one primary phone for the same contact', async () => {
    const { prisma, service } = createService();

    await expect(
      service.create('office-1', {
        name: '홍길동',
        phones: [
          { phone: '010-1111-2222', isPrimary: true },
          { phone: '010-3333-4444', isPrimary: true },
        ],
      }),
    ).rejects.toThrow('대표 전화번호는 연락처당 하나만 지정할 수 있습니다.');

    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('returns a conflict when another contact in the office owns the phone', async () => {
    const { prisma, service } = createService();
    prisma.contact.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique phone', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['office_id', 'phone'] },
      }),
    );

    await expect(
      service.create('office-1', {
        name: '홍길동',
        phones: [{ phone: '010-1111-2222' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('filters by every given tag through the tag table', async () => {
    const { prisma, service } = createService();
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.count.mockResolvedValue(0);

    await service.findAll('office-1', { tags: ['VIP', ' 신혼 '], categories: ['owner'] });

    const where = prisma.contact.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(3);
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { tagAssignments: { some: { tag: { name: 'VIP' } } } },
        { tagAssignments: { some: { tag: { name: '신혼' } } } },
      ]),
    );
  });

  it('creates missing tags with a color and links them when a contact is saved with tags', async () => {
    const { prisma, service } = createService();
    prisma.contact.create.mockResolvedValue({ id: 'contact-1' });
    prisma.tx.contactTag.findMany
      .mockResolvedValueOnce([{ name: 'VIP', color: 'gray' }])
      .mockResolvedValueOnce([
        { id: 'tag-vip', name: 'VIP' },
        { id: 'tag-new', name: '재개발 관심' },
      ]);
    prisma.contact.findUniqueOrThrow.mockResolvedValue({
      id: 'contact-1',
      phones: [],
      tagAssignments: [{ tag: { name: '재개발 관심' } }, { tag: { name: 'VIP' } }],
    });

    const created = await service.create(
      'office-1',
      { name: '홍길동', tags: ['  재개발  관심 ', 'VIP', 'VIP', ''] },
      'user-1',
    );

    // 다듬은 이름으로 없는 것만 만들고, 이미 쓰인 회색은 피한다
    expect(prisma.tx.contactTag.createMany).toHaveBeenCalledWith({
      data: [{ officeId: 'office-1', name: '재개발 관심', color: 'brown' }],
      skipDuplicates: true,
    });
    expect(prisma.tx.contactTagAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { officeId: 'office-1', contactId: 'contact-1', tagId: 'tag-new', addedById: 'user-1' },
        { officeId: 'office-1', contactId: 'contact-1', tagId: 'tag-vip', addedById: 'user-1' },
      ],
      skipDuplicates: true,
    });
    expect(created.tags).toEqual(['재개발 관심', 'VIP']);
  });

  it('leaves tags alone when an update does not mention them', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({
      id: 'contact-1',
      phones: [],
      groupMemberships: [],
      tagAssignments: [],
      buyerIntakeContacts: [],
      relationsAsMain: [],
      relationsAsRelated: [],
    });
    prisma.contact.update.mockResolvedValue({ id: 'contact-1', phones: [], tagAssignments: [] });

    await service.update('contact-1', 'office-1', { memo: '메모만' });

    expect(prisma.tx.contactTagAssignment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.tx.contactTagAssignment.createMany).not.toHaveBeenCalled();
  });
});
