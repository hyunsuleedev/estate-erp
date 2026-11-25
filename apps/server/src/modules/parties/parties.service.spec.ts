import { BadRequestException, ConflictException } from '@nestjs/common';
import { PartiesService } from './parties.service';

describe('PartiesService', () => {
  const createPrismaMock = () => {
    const tx: any = {
      contact: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      party: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      partyMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const prisma: any = {
      ...tx,
      $transaction: jest.fn(async (cb: (client: any) => Promise<any>) => cb(tx)),
    };
    return { prisma, tx };
  };

  it('rejects adding household to an organization contact', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.contact.findFirst.mockResolvedValueOnce({ id: 'org-1', kind: 'organization', name: 'OO법인' });
    const service = new PartiesService(prisma);

    await expect(
      service.addHouseholdMember('office-1', { contactId: 'org-1', memberContactId: 'p-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates household lazily with both members when adding a family member', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.contact.findFirst
      .mockResolvedValueOnce({ id: 'c-1', kind: 'person', name: '김철수' })
      .mockResolvedValueOnce({ id: 'c-2', kind: 'person', name: '이영희' });
    tx.partyMember.findFirst.mockResolvedValue(null);
    tx.party.create.mockResolvedValue({ id: 'party-1' });
    tx.party.findUniqueOrThrow.mockResolvedValue({
      id: 'party-1',
      officeId: 'office-1',
      kind: 'household',
      name: '김철수 님 세대',
      organizationContactId: null,
      organizationContactKind: null,
      homePhone: null,
      memo: null,
      organizationContact: null,
      members: [
        {
          id: 'm-1',
          officeId: 'office-1',
          partyId: 'party-1',
          partyKind: 'household',
          contactId: 'c-1',
          contactKind: 'person',
          roleLabel: '남편',
          isPrimary: true,
          status: 'active',
          contact: { id: 'c-1', kind: 'person', name: '김철수', email: null, phones: [] },
        },
        {
          id: 'm-2',
          officeId: 'office-1',
          partyId: 'party-1',
          partyKind: 'household',
          contactId: 'c-2',
          contactKind: 'person',
          roleLabel: '아내',
          isPrimary: false,
          status: 'active',
          contact: { id: 'c-2', kind: 'person', name: '이영희', email: null, phones: [] },
        },
      ],
    });

    const service = new PartiesService(prisma);
    const result = await service.addHouseholdMember('office-1', {
      contactId: 'c-1',
      memberContactId: 'c-2',
      selfRoleLabel: '남편',
      roleLabel: '아내',
    });

    expect(tx.party.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'household', name: '김철수 님 세대' }),
      }),
    );
    expect(tx.partyMember.create).toHaveBeenCalledTimes(2);
    expect(result.members).toHaveLength(2);
  });

  it('rejects merging two different existing households implicitly', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.contact.findFirst
      .mockResolvedValueOnce({ id: 'c-1', kind: 'person', name: '김철수' })
      .mockResolvedValueOnce({ id: 'c-2', kind: 'person', name: '이영희' });
    tx.partyMember.findFirst
      .mockResolvedValueOnce({ partyId: 'party-1' })
      .mockResolvedValueOnce({ partyId: 'party-2' });

    const service = new PartiesService(prisma);
    await expect(
      service.addHouseholdMember('office-1', { contactId: 'c-1', memberContactId: 'c-2' }),
    ).rejects.toThrow(ConflictException);
  });

  it('keeps 1-person household when removing a member leaves 1 active member, and deletes when 0 remain', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.partyMember.findFirst.mockResolvedValue({
      id: 'm-2',
      partyId: 'party-1',
      isPrimary: true,
      party: { id: 'party-1', kind: 'household' },
    });
    tx.partyMember.findMany
      .mockResolvedValueOnce([{ id: 'm-1', isPrimary: false }])
      .mockResolvedValueOnce([]);
    tx.party.findUniqueOrThrow.mockResolvedValue({
      id: 'party-1',
      officeId: 'office-1',
      kind: 'household',
      name: '김철수 님 세대',
      organizationContactId: null,
      organizationContactKind: null,
      homePhone: null,
      memo: null,
      organizationContact: null,
      members: [
        {
          id: 'm-1',
          officeId: 'office-1',
          partyId: 'party-1',
          partyKind: 'household',
          contactId: 'c-1',
          contactKind: 'person',
          roleLabel: '남편',
          isPrimary: true,
          status: 'active',
          contact: { id: 'c-1', kind: 'person', name: '김철수', email: null, phones: [] },
        },
      ],
    });

    const service = new PartiesService(prisma);
    const keepResult = await service.removeMember('office-1', 'party-1', 'm-2');
    expect(tx.party.delete).not.toHaveBeenCalled();
    expect(tx.partyMember.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { isPrimary: true },
    });
    expect(keepResult.deletedParty).toBe(false);

    const deleteResult = await service.removeMember('office-1', 'party-1', 'm-1');
    expect(tx.party.delete).toHaveBeenCalledWith({ where: { id: 'party-1' } });
    expect(deleteResult).toEqual({ deletedParty: true, party: null });
  });

  it('creates a 1-person household directly via createParty', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.contact.findFirst.mockResolvedValue({ id: 'c-1', kind: 'person', name: '김철수' });
    tx.partyMember.findFirst.mockResolvedValue(null);
    tx.party.create.mockResolvedValue({ id: 'party-hh-1' });
    tx.party.findUniqueOrThrow.mockResolvedValue({
      id: 'party-hh-1',
      officeId: 'office-1',
      kind: 'household',
      name: '김철수 님 세대',
      organizationContactId: null,
      organizationContactKind: null,
      homePhone: '024158820',
      memo: null,
      organizationContact: null,
      members: [
        {
          id: 'm-1',
          officeId: 'office-1',
          partyId: 'party-hh-1',
          partyKind: 'household',
          contactId: 'c-1',
          contactKind: 'person',
          roleLabel: '세대주',
          isPrimary: true,
          status: 'active',
          contact: { id: 'c-1', kind: 'person', name: '김철수', email: null, phones: [] },
        },
      ],
    });

    const service = new PartiesService(prisma);
    const created = await service.createParty('office-1', {
      kind: 'household' as any,
      contactId: 'c-1',
      name: '김철수 님 세대',
      homePhone: '02-415-8820',
      selfRoleLabel: '세대주',
    });

    expect(tx.party.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'household',
          name: '김철수 님 세대',
          homePhone: '024158820',
        }),
      }),
    );
    expect(tx.partyMember.create).toHaveBeenCalledTimes(1);
    expect(created.members).toHaveLength(1);
  });

  it('creates a new organization contact and party from a person contact', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.contact.findFirst.mockResolvedValue({ id: 'c-1', kind: 'person', name: '김철수' });
    tx.contact.create.mockResolvedValue({ id: 'org-new' });
    tx.party.create.mockResolvedValue({ id: 'party-org-1' });
    tx.party.findUniqueOrThrow.mockResolvedValue({
      id: 'party-org-1',
      officeId: 'office-1',
      kind: 'organization',
      name: null,
      organizationContactId: 'org-new',
      organizationContactKind: 'organization',
      homePhone: '025548800',
      memo: null,
      organizationContact: {
        id: 'org-new',
        kind: 'organization',
        name: '(주)한강개발',
        email: null,
        phones: [],
      },
      members: [
        {
          id: 'm-1',
          officeId: 'office-1',
          partyId: 'party-org-1',
          partyKind: 'organization',
          contactId: 'c-1',
          contactKind: 'person',
          roleLabel: '대표이사',
          isPrimary: true,
          status: 'active',
          contact: { id: 'c-1', kind: 'person', name: '김철수', email: null, phones: [] },
        },
      ],
    });

    const service = new PartiesService(prisma);
    const created = await service.createParty('office-1', {
      kind: 'organization' as any,
      contactId: 'c-1',
      name: '(주)한강개발',
      businessRegNo: '211-88-40912',
      homePhone: '02-554-8800',
      selfRoleLabel: '대표이사',
    });

    expect(tx.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'organization',
          name: '(주)한강개발',
          businessRegNo: '211-88-40912',
        }),
      }),
    );
    expect(tx.party.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'organization',
          organizationContactId: 'org-new',
        }),
      }),
    );
    expect(created.organizationContactId).toBe('org-new');
  });

  it('deletes a party explicitly while preserving contacts', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.party.findFirst.mockResolvedValue({ id: 'party-1' });

    const service = new PartiesService(prisma);
    const result = await service.deleteParty('office-1', 'party-1');

    expect(tx.party.delete).toHaveBeenCalledWith({ where: { id: 'party-1' } });
    expect(result).toEqual({ deleted: true, id: 'party-1' });
  });
});
