import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContactGroupsService } from './contact-groups.service';

describe('ContactGroupsService', () => {
  function createService({
    group = { id: 'group-1', name: 'VIP' } as { id: string; name: string } | null,
    officeContacts = [] as Array<{ id: string }>,
    inserted = 0,
    memberCount = 0,
  } = {}) {
    const tx = {
      contact: { findMany: jest.fn().mockResolvedValue(officeContacts) },
      contactGroup: {
        create: jest.fn().mockResolvedValue({ id: 'group-new' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      contactGroupMember: {
        createMany: jest.fn().mockResolvedValue({ count: inserted }),
        count: jest.fn().mockResolvedValue(memberCount),
      },
    };
    const prisma = {
      contact: { update: jest.fn(), updateMany: jest.fn() },
      contactGroup: {
        findFirst: jest.fn().mockResolvedValue(group),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      contactGroupMember: {
        deleteMany: jest.fn().mockResolvedValue({ count: memberCount }),
      },
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    return { tx, prisma, service: new ContactGroupsService(prisma as never) };
  }

  function duplicateError() {
    return new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
  }

  describe('create', () => {
    it('stores the normalized name and returns it for the caller to use', async () => {
      const { tx, service } = createService();

      await expect(service.create('office-1', '  재개발  관심 ')).resolves.toEqual({
        name: '재개발 관심',
        updated: 0,
      });
      expect(tx.contactGroup.create).toHaveBeenCalledWith({
        data: { officeId: 'office-1', name: '재개발 관심' },
      });
      expect(tx.contactGroupMember.createMany).not.toHaveBeenCalled();
    });

    it('adds members in the same transaction, only contacts of this office', async () => {
      const { tx, service } = createService({
        officeContacts: [{ id: 'c1' }],
        inserted: 1,
      });

      await expect(
        service.create('office-1', 'VIP', ['c1', 'other-office'], 'user-1'),
      ).resolves.toEqual({ name: 'VIP', updated: 1 });
      expect(tx.contact.findMany).toHaveBeenCalledWith({
        where: { officeId: 'office-1', id: { in: ['c1', 'other-office'] } },
        select: { id: true },
      });
      expect(tx.contactGroupMember.createMany).toHaveBeenCalledWith({
        data: [
          {
            officeId: 'office-1',
            groupId: 'group-new',
            contactId: 'c1',
            addedById: 'user-1',
          },
        ],
        skipDuplicates: true,
      });
    });

    it('rejects empty, too long and comma names', async () => {
      const { service } = createService();
      await expect(service.create('office-1', '   ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.create('office-1', 'ㄱ'.repeat(31)),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create('office-1', 'VIP,단골')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('reports a duplicate name as a conflict', async () => {
      const { tx, service } = createService();
      tx.contactGroup.create.mockRejectedValue(duplicateError());
      await expect(service.create('office-1', 'VIP')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('rename', () => {
    it('changes the group row only and never rewrites contacts', async () => {
      const { prisma, service } = createService();

      await expect(service.rename('office-1', 'VIP', ' 단골 ')).resolves.toEqual({
        name: '단골',
      });
      // 읽은 이름이 그대로일 때만 바꾼다
      expect(prisma.contactGroup.updateMany).toHaveBeenCalledWith({
        where: { id: 'group-1', officeId: 'office-1', name: 'VIP' },
        data: { name: '단골' },
      });
      expect(prisma.contact.update).not.toHaveBeenCalled();
      expect(prisma.contact.updateMany).not.toHaveBeenCalled();
    });

    it('does nothing when the name is unchanged', async () => {
      const { prisma, service } = createService();
      await expect(service.rename('office-1', 'VIP', 'VIP')).resolves.toEqual({
        name: 'VIP',
      });
      expect(prisma.contactGroup.updateMany).not.toHaveBeenCalled();
    });

    it('reports a taken name as a conflict and an unknown group as not found', async () => {
      const taken = createService();
      taken.prisma.contactGroup.updateMany.mockRejectedValue(duplicateError());
      await expect(
        taken.service.rename('office-1', 'VIP', '단골'),
      ).rejects.toBeInstanceOf(ConflictException);

      const missing = createService({ group: null });
      await expect(
        missing.service.rename('office-1', '없음', '단골'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('refuses a rename or delete when someone else renamed the group first', async () => {
    const renamed = createService();
    renamed.prisma.contactGroup.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      renamed.service.rename('office-1', 'VIP', '단골'),
    ).rejects.toBeInstanceOf(ConflictException);

    const deleted = createService({ memberCount: 2 });
    deleted.tx.contactGroup.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleted.service.remove('office-1', 'VIP')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  describe('remove', () => {
    it('deletes the group and reports how many members it had', async () => {
      const { tx, prisma, service } = createService({ memberCount: 3 });

      await expect(service.remove('office-1', 'VIP')).resolves.toEqual({
        removedFrom: 3,
      });
      expect(tx.contactGroup.deleteMany).toHaveBeenCalledWith({
        where: { id: 'group-1', officeId: 'office-1', name: 'VIP' },
      });
      // 소속은 DB cascade로 지워지고 연락처는 건드리지 않는다.
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('looks the group up by the exact name it was given', async () => {
      const { prisma, service } = createService({ group: null });
      await expect(service.remove('office-1', '경합C ')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.contactGroup.findFirst).toHaveBeenCalledWith({
        where: { officeId: 'office-1', name: '경합C ' },
        select: { id: true, name: true },
      });
    });
  });

  describe('members', () => {
    it('adds only new members and returns how many were added', async () => {
      const { tx, service } = createService({
        officeContacts: [{ id: 'c1' }, { id: 'c2' }],
        inserted: 1,
      });

      await expect(
        service.addMembers('office-1', 'VIP', ['c1', 'c2'], 'user-1'),
      ).resolves.toEqual({ updated: 1 });
      expect(tx.contactGroupMember.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
    });

    it('removes memberships of this group only and keeps the group', async () => {
      const { tx, prisma, service } = createService({ memberCount: 2 });

      await expect(
        service.removeMembers('office-1', 'VIP', ['c1', 'c2']),
      ).resolves.toEqual({ updated: 2 });
      expect(prisma.contactGroupMember.deleteMany).toHaveBeenCalledWith({
        where: {
          officeId: 'office-1',
          groupId: 'group-1',
          contactId: { in: ['c1', 'c2'] },
        },
      });
      expect(tx.contactGroup.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses to add to a group that does not exist', async () => {
      const { service } = createService({ group: null });
      await expect(
        service.addMembers('office-1', '없음', ['c1']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
