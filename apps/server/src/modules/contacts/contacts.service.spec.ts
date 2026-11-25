import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContactsService } from './contacts.service';

describe('ContactsService', () => {
  function createService() {
    const contact = {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    };
    const contactPhone = { findFirst: jest.fn().mockResolvedValue(null) };
    const partyMember = {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    };
    const party = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
    const task = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };
    const calendarEvent = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };
    const callLog = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };
    const callRecording = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };
    const callActionSuggestion = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };
    const tx = {
      contact,
      partyMember,
      party,
      task,
      calendarEvent,
      callLog,
      callRecording,
      callActionSuggestion,
      // 지우기 · 합치기는 연락처 줄을 잠근다 (SELECT … FOR UPDATE)
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'contact-1' }]),
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
      contactPhone,
      partyMember,
      party,
      task,
      calendarEvent,
      callLog,
      callRecording,
      callActionSuggestion,
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
      kind: 'person',
      phones: [],
      groupMemberships: [],
      tagAssignments: [],
      buyerIntakeContacts: [],
      organizationParty: null,
      partyMemberships: [],
      referredBy: null,
      _count: { consultations: 0 },
    });
    prisma.contact.update.mockResolvedValue({ id: 'contact-1', phones: [], tagAssignments: [] });

    await service.update('contact-1', 'office-1', { memo: '메모만' });

    expect(prisma.tx.contactTagAssignment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.tx.contactTagAssignment.createMany).not.toHaveBeenCalled();
  });

  it('rejects a contact with neither a name nor a phone', async () => {
    const { prisma, service } = createService();

    await expect(service.create('office-1', { name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('office-1', {} as never)).rejects.toThrow('이름이나 전화번호 중 하나는 입력하세요.');
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('rejects a phone that is not a number instead of silently dropping it', async () => {
    const { prisma, service } = createService();

    await expect(
      service.create('office-1', { name: '홍길동', phones: [{ phone: '모름' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('office-1', { name: '홍길동', phones: [{ phone: '010-12' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('names the owner of a phone that is already taken', async () => {
    const { prisma, service } = createService();
    prisma.contact.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique phone', { code: 'P2002', clientVersion: 'test' }),
    );
    prisma.contactPhone.findFirst.mockResolvedValue({
      phone: '01011112222',
      contact: { id: 'contact-9', name: '김철수' },
    });

    const error = await service
      .create('office-1', { name: '홍길동', phones: [{ phone: '010-1111-2222' }] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      message: expect.stringContaining("'김철수' 님"),
      contactId: 'contact-9',
    });
  });

  const emptyCounts = {
    consultations: 0,
    propertyContacts: 0,
    buyerIntakeContacts: 0,
    requestedListingIntakes: 0,
    leaseTenancies: 0,
    contractParties: 0,
    dealsAsBuyer: 0,
    dealsAsSeller: 0,
    primaryProjects: 0,
    commissionPayments: 0,
    partyMemberships: 0,
    tasks: 0,
    calendarEvents: 0,
    callLogs: 0,
    callRecordings: 0,
    callActionSuggestions: 0,
    referrals: 0,
  };

  it('refuses to delete a contact that deals or consultations still point to', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({
      organizationParty: null,
      _count: { ...emptyCounts, consultations: 2, dealsAsBuyer: 1, tasks: 3 },
    });

    const error = await service.remove('contact-1', 'office-1').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toContain('상담 기록 2건, 거래 1건');
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });

  it('cleans up party memberships and detaches nullable composite FKs on delete', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({
      organizationParty: null,
      _count: { ...emptyCounts, partyMemberships: 1, tasks: 2 },
    });
    prisma.partyMember.findMany.mockResolvedValue([{ partyId: 'party-h1' }]);
    prisma.partyMember.count.mockResolvedValue(1);
    prisma.contact.delete.mockResolvedValue({ id: 'contact-1' });

    await expect(service.getDeleteCheck('contact-1', 'office-1')).resolves.toEqual({
      blockers: [],
      removed: [{ key: 'parties', label: '세대·법인 소속', count: 1 }],
      detached: [{ key: 'tasks', label: '업무', count: 2 }],
    });
    await service.remove('contact-1', 'office-1');

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { officeId: 'office-1', contactId: 'contact-1' },
      data: { contactId: null },
    });
    expect(prisma.partyMember.deleteMany).toHaveBeenCalledWith({
      where: { officeId: 'office-1', contactId: 'contact-1' },
    });
    expect(prisma.party.deleteMany).toHaveBeenCalledWith({
      where: { id: 'party-h1', officeId: 'office-1', kind: 'household' },
    });
    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'contact-1' } });
  });

  it('counts again under the row lock and refuses when a deal was attached after the first check', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst
      .mockResolvedValueOnce({ organizationParty: null, _count: { ...emptyCounts } })
      .mockResolvedValueOnce({ organizationParty: null, _count: { ...emptyCounts, dealsAsSeller: 1 } });

    const error = await service.remove('contact-1', 'office-1').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toContain('거래 1건');
    expect(prisma.tx.$queryRaw).toHaveBeenCalled();
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });

  describe('merge', () => {
    const DUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const KEEP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    type Row = Record<string, unknown>;
    function createMergeService(options: {
      deals?: number;
      parties?: Row[];
      memberships?: Row[];
      sourceProperties?: Row[];
      targetProperty?: Row | null;
      sourceMemberships?: Row[];
      targetHasHousehold?: boolean;
      targetSamePartyMember?: Row | null;
      source?: Row;
      target?: Row;
    } = {}) {
      const model = () => ({
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      });
      const tx: Record<string, ReturnType<typeof model>> & { $queryRaw?: jest.Mock } = {};
      for (const name of [
        'consultation', 'listingIntake', 'propertyLeaseTenant', 'task', 'calendarEvent', 'callLog', 'callRecording',
        'callActionSuggestion', 'contractParty', 'deal', 'contract', 'project', 'commissionPayment',
        'propertyContact', 'buyerIntakeContact', 'party', 'partyMember', 'contactGroupMember',
        'contactTagAssignment', 'contactPhone', 'contact', 'activityLog',
      ]) {
        tx[name] = model();
      }
      tx.$queryRaw = jest.fn().mockResolvedValue([{ id: DUP }, { id: KEEP }]);
      tx.deal.count.mockResolvedValue(options.deals ?? 0);
      tx.contractParty.findMany.mockResolvedValue(options.parties ?? []);
      tx.partyMember.findMany.mockImplementation(async (args: { where: Row }) => {
        if (args.where.partyKind === 'household' && Array.isArray((args.where.contactId as Row)?.in)) {
          return options.memberships ?? [];
        }
        if (args.where.contactId === DUP) {
          return options.sourceMemberships ?? [];
        }
        return [];
      });
      tx.partyMember.count.mockResolvedValue(options.targetHasHousehold ? 1 : 0);
      tx.partyMember.findFirst.mockResolvedValue(options.targetSamePartyMember ?? null);
      tx.propertyContact.findMany.mockResolvedValue(options.sourceProperties ?? []);
      tx.propertyContact.findFirst.mockResolvedValue(options.targetProperty ?? null);
      tx.propertyContact.count.mockResolvedValue(options.targetProperty ? 1 : 0);
      tx.contactPhone.count.mockResolvedValue(1);
      const source = options.source ?? { id: DUP, kind: 'person', name: '김철수(2)', businessRegNo: null, email: 'a@b.c', memo: '두 번째 메모', phones: [{ phone: '01012345678' }] };
      const target = options.target ?? { id: KEEP, kind: 'person', name: '김철수', businessRegNo: null, email: 'x@y.z', memo: '첫 메모', phones: [] };
      tx.contact.findFirst.mockImplementation(async (args: { where: { id: string }; select?: Row }) => {
        if (args.select && '_count' in args.select) {
          const kind = args.where.id === DUP ? source.kind : target.kind;
          const name = args.where.id === DUP ? source.name : target.name;
          return { kind, name, _count: { ...emptyCounts, phones: 1 } };
        }
        return args.where.id === DUP ? source : target;
      });
      const prisma = {
        contact: { findFirst: jest.fn() },
        $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
      };
      return { tx, prisma, service: new ContactsService(prisma as never) };
    }

    it('moves every record, keeps the overlapping rows\' details and logs what it did', async () => {
      const { tx, service } = createMergeService({
        sourceProperties: [
          { id: 'pc-dup', propertyId: 'p1', role: 'owner', isPrimary: true, isResident: true, shareRatio: 50, status: 'active', memo: '공동명의' },
        ],
        targetProperty: { id: 'pc-keep', isPrimary: false, isResident: false, shareRatio: null, status: 'active', memo: null },
        sourceMemberships: [
          { id: 'pm-dup', partyId: 'org-1', partyKind: 'organization', roleLabel: '팀장' },
        ],
        targetSamePartyMember: { id: 'pm-keep' },
      });

      const result = await service.merge(DUP, KEEP, 'office-1', 'user-1');

      expect(result).toMatchObject({ id: KEEP, mergedFrom: { id: DUP, name: '김철수(2)' } });
      expect(tx.consultation.updateMany).toHaveBeenCalledWith({
        where: { officeId: 'office-1', contactId: DUP },
        data: { contactId: KEEP },
      });
      // 겹친 매물 연결: 원본 줄을 지우고 대상의 빈 칸(지분 · 거주 · 주 연락처 · 메모)을 채운다
      expect(tx.propertyContact.delete).toHaveBeenCalledWith({ where: { id: 'pc-dup' } });
      expect(tx.propertyContact.update).toHaveBeenCalledWith({
        where: { id: 'pc-keep' },
        data: { shareRatio: 50, isResident: true, isPrimary: true, memo: '공동명의' },
      });
      // 겹친 소속: 대상이 이미 같은 법인에 있으므로 원본 소속 줄만 정리한다
      expect(tx.partyMember.delete).toHaveBeenCalledWith({ where: { id: 'pm-dup' } });
      // 이메일이 다르면 원본 이메일을 메모에 남긴다
      expect(tx.contact.update).toHaveBeenCalledWith({
        where: { id: KEEP },
        data: {
          memo: '첫 메모\n\n(김철수(2)에서 합친 메모)\n두 번째 메모\n\n합친 연락처의 이메일: a@b.c',
        },
      });
      // 변경 기록은 같은 트랜잭션 안에서, 번호는 끝 네 자리만
      expect(tx.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          officeId: 'office-1',
          entityType: 'contact',
          entityId: KEEP,
          changes: expect.objectContaining({
            mergedFrom: { after: { id: DUP, name: '김철수(2)', phone: '010-****-5678' } },
            dropped: { after: { propertyContacts: 1, parties: 1 } },
          }),
        }),
      });
      expect(tx.contact.delete).toHaveBeenCalledWith({ where: { id: DUP } });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('keeps the real name when merging into a number-only contact', async () => {
      const { tx, service } = createMergeService({
        source: { id: DUP, kind: 'person', name: '김합침', businessRegNo: null, email: null, memo: null, phones: [] },
        target: { id: KEEP, kind: 'person', name: '미확인 7731', businessRegNo: null, email: null, memo: null, phones: [{ phone: '01011117731' }] },
      });

      await service.merge(DUP, KEEP, 'office-1');

      expect(tx.contact.update).toHaveBeenCalledWith({ where: { id: KEEP }, data: { name: '김합침' } });
      expect(tx.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          changes: expect.objectContaining({ name: { before: '미확인 7731', after: '김합침' } }),
        }),
      });
    });

    it('refuses when merging a person into an organization', async () => {
      const { tx, service } = createMergeService({
        source: { id: DUP, kind: 'person', name: '홍길동', businessRegNo: null, email: null, memo: null, phones: [] },
        target: { id: KEEP, kind: 'organization', name: '(주)에스테잇', businessRegNo: null, email: null, memo: null, phones: [] },
      });
      const error = await service.merge(DUP, KEEP, 'office-1').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toContain('개인과 법인·단체');
      expect(tx.contact.delete).not.toHaveBeenCalled();
    });

    it('refuses when the two are the seller and buyer of the same deal', async () => {
      const { tx, service } = createMergeService({ deals: 1 });
      const error = await service.merge(DUP, KEEP, 'office-1').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toContain('매도인과 매수인');
      expect(tx.consultation.updateMany).not.toHaveBeenCalled();
      expect(tx.contact.delete).not.toHaveBeenCalled();
    });

    it('refuses when the two are on opposite sides of one contract', async () => {
      const { tx, service } = createMergeService({
        parties: [
          { contractId: 'k1', contactId: DUP, side: 'one' },
          { contractId: 'k1', contactId: KEEP, side: 'two' },
        ],
      });
      const error = await service.merge(DUP, KEEP, 'office-1').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toContain('계약서 1건');
      expect(tx.contact.delete).not.toHaveBeenCalled();
    });

    it('asks to remove from household first when the two share the same household', async () => {
      const { tx, service } = createMergeService({
        memberships: [
          { contactId: DUP, partyId: 'house-1' },
          { contactId: KEEP, partyId: 'house-1' },
        ],
      });
      const error = await service.merge(DUP, KEEP, 'office-1').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toContain('같은 세대');
      expect(tx.partyMember.delete).not.toHaveBeenCalled();
    });

    it('turns a write conflict into a retry message', async () => {
      const { tx, service } = createMergeService();
      tx.consultation.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('serialize', { code: 'P2034', clientVersion: 'test' }),
      );
      await expect(service.merge(DUP, KEEP, 'office-1')).rejects.toThrow('방금 다른 곳에서 이 연락처가 바뀌었습니다');
    });

    it('refuses to merge a contact into itself', async () => {
      const { service, prisma } = createMergeService();
      await expect(service.merge('same', 'same', 'office-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('saves a number-only contact under a temporary name made from the last four digits', async () => {
    const { prisma, service } = createService();
    prisma.contact.create.mockResolvedValue({ id: 'contact-1' });
    prisma.contact.findUniqueOrThrow.mockResolvedValue({ id: 'contact-1', phones: [], tagAssignments: [] });

    await service.create('office-1', { name: '  ', phones: [{ phone: '010-1234-5678' }] } as never);
    expect(prisma.contact.create.mock.calls[0][0].data.name).toBe('미확인 5678');
    await expect(service.create('office-1', { name: '' } as never)).rejects.toThrow(
      '이름이나 전화번호 중 하나는 입력하세요.',
    );
  });

  it('looks up phone numbers only when the search is a number', async () => {
    const { prisma, service } = createService();
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.count.mockResolvedValue(0);
    const phoneClause = (call: number) =>
      (prisma.contact.findMany.mock.calls[call][0].where.OR as Array<Record<string, unknown>>).find(
        (clause) => 'phones' in clause,
      );

    await service.findAll('office-1', { search: '그라시움 101동' });
    // 글자가 섞인 검색어의 숫자로 번호를 찾지 않는다
    expect(phoneClause(0)).toBeUndefined();

    await service.findAll('office-1', { search: '5678' });
    expect(phoneClause(1)).toEqual({ phones: { some: { phone: { contains: '5678' } } } });

    await service.findAll('office-1', { search: '010-1234' });
    expect(phoneClause(2)).toEqual({ phones: { some: { phone: { contains: '0101234' } } } });

    await service.findAll('office-1', { search: '12' });
    expect(phoneClause(3)).toBeUndefined();
  });

  it('shows the surviving name in the merge preview', async () => {
    const tx = {
      deal: { count: jest.fn().mockResolvedValue(0) },
      contractParty: { findMany: jest.fn().mockResolvedValue([]) },
      partyMember: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      propertyContact: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      buyerIntakeContact: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      propertyLeaseTenant: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      contactPhone: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      contact: {
        findFirst: jest.fn(async (args: { where: { id: string }; select: Record<string, unknown> }) => {
          if ('_count' in args.select) return { kind: 'person', name: '김합침', _count: { ...emptyCounts, phones: 0 } };
          return args.where.id === 'keep'
            ? { id: 'keep', kind: 'person', name: '미확인 7731' }
            : { id: 'dup', kind: 'person', name: '김합침' };
        }),
      },
    };
    const service = new ContactsService(tx as never);

    await expect(service.getMergeCheck('dup', '55555555-5555-4555-8555-555555555555', 'office-1')).resolves.toMatchObject({
      conflicts: [],
    });
    const plan = await (await import('./contact-merge')).planContactMerge(tx as never, 'office-1', 'dup', 'keep');
    expect(plan.resultName).toBe('김합침');
  });

  it('refuses a merge target that is not an id', async () => {
    const { service } = createService();
    await expect(service.merge('11111111-1111-4111-8111-111111111111', 'abc', 'office-1')).rejects.toThrow(
      '합칠 연락처를 찾을 수 없습니다.',
    );
  });
});
