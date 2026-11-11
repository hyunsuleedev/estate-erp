import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContactGroupsService } from './contact-groups.service';

describe('ContactGroupsService', () => {
  function createService({
    registered = 0,
    members = 0,
    lockedContacts = [] as Array<{ id: string; tags: string[] }>,
  } = {}) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(lockedContacts),
      contact: {
        update: jest.fn().mockResolvedValue({}),
      },
      contactGroup: {
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      contact: { count: jest.fn().mockResolvedValue(members) },
      contactGroup: { count: jest.fn().mockResolvedValue(registered) },
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

  /** 잠금 쿼리의 SQL을 이어 붙여 돌려준다. */
  function lockSql(tx: { $queryRaw: jest.Mock }) {
    const [strings] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    return strings.join('?');
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
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('creates the group and adds members in one transaction', async () => {
      const { tx, prisma, service } = createService({
        lockedContacts: [{ id: 'c1', tags: ['VIP'] }],
      });

      await expect(
        service.create('office-1', '공백  두칸', ['c1']),
      ).resolves.toEqual({ name: '공백 두칸', updated: 1 });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.contact.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { tags: ['VIP', '공백 두칸'] },
      });
    });

    it('leaves nothing behind when adding members fails, so a retry can succeed', async () => {
      const { tx, prisma, service } = createService({
        lockedContacts: [{ id: 'c1', tags: [] }],
      });
      const failure = new Error('connection lost');
      tx.contact.update.mockRejectedValueOnce(failure);

      await expect(service.create('office-1', '재시도', ['c1'])).rejects.toBe(failure);
      // 만들기와 넣기가 같은 트랜잭션이라 실패하면 함께 되돌아간다.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.contactGroup.create).toHaveBeenCalledTimes(1);

      tx.contact.update.mockResolvedValue({});
      await expect(service.create('office-1', '재시도', ['c1'])).resolves.toEqual({
        name: '재시도',
        updated: 1,
      });
    });

    it('treats a tag already in use as an existing group', async () => {
      const { prisma, service } = createService({ members: 2 });

      await expect(service.create('office-1', 'VIP')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reports a conflict when another request creates the same name first', async () => {
      const { tx, service } = createService();
      tx.contactGroup.create.mockRejectedValueOnce(duplicateError());

      await expect(service.create('office-1', '동시')).rejects.toThrow(
        ConflictException,
      );
    });

    it.each([
      ['빈 이름', '   '],
      ['쉼표', 'VIP,단골'],
      ['31자', 'ㄱ'.repeat(31)],
    ])('rejects an invalid name: %s', async (_label, name) => {
      const { service } = createService();

      await expect(service.create('office-1', name)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('rename', () => {
    function renamableService(
      lockedContacts: Array<{ id: string; tags: string[] }>,
    ) {
      const created = createService({ registered: 1, lockedContacts });
      // 새 이름은 아직 없어야 한다.
      jest
        .spyOn(created.service as never, 'exists' as never)
        .mockImplementation((async (_office: string, name: string) =>
          name === '학군') as never);
      return created;
    }

    it('rewrites the tag on each member one by one so the change is audited', async () => {
      const { tx, service } = renamableService([
        { id: 'c1', tags: ['VIP', '학군'] },
        { id: 'c2', tags: ['학군'] },
      ]);

      await expect(
        service.rename('office-1', '학군', '학군 우선'),
      ).resolves.toEqual({ name: '학군 우선' });

      expect(tx.contact.update).toHaveBeenCalledTimes(2);
      expect(tx.contact.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { tags: ['VIP', '학군 우선'] },
      });
      expect(tx.contactGroup.deleteMany).toHaveBeenCalledWith({
        where: { officeId: 'office-1', name: '학군' },
      });
      expect(tx.contactGroup.create).toHaveBeenCalledWith({
        data: { officeId: 'office-1', name: '학군 우선' },
      });
    });

    it('locks members before reading their tags', async () => {
      const { tx, service } = renamableService([]);

      await service.rename('office-1', '학군', '학군 우선');

      expect(lockSql(tx)).toContain('FOR NO KEY UPDATE');
      expect(lockSql(tx)).toContain('ORDER BY "id"');
    });

    it('reports a conflict when the new name is taken while renaming', async () => {
      const { tx, service } = renamableService([]);
      tx.contactGroup.create.mockRejectedValueOnce(duplicateError());

      await expect(
        service.rename('office-1', '학군', '학군 우선'),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses to rename onto another group instead of merging silently', async () => {
      const { prisma, service } = createService({ registered: 1 });

      await expect(service.rename('office-1', '학군', 'VIP')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fails when the group does not exist', async () => {
      const { service } = createService();

      await expect(service.rename('office-1', '없음', '새 이름')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('keeps the contacts and only takes the group off them', async () => {
      const { tx, service } = createService({
        members: 1,
        lockedContacts: [{ id: 'c1', tags: ['VIP', '학군'] }],
      });

      await expect(service.remove('office-1', '학군')).resolves.toEqual({
        removedFrom: 1,
      });
      expect(lockSql(tx)).toContain('FOR NO KEY UPDATE');
      expect(tx.contact.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { tags: ['VIP'] },
      });
      expect(tx.contactGroup.deleteMany).toHaveBeenCalled();
    });

    it('looks a group up by its exact name and never a trimmed one', async () => {
      const { prisma, tx, service } = createService({
        members: 1,
        lockedContacts: [{ id: 'c1', tags: ['경합C '] }],
      });

      await service.remove('office-1', '경합C ');

      expect(prisma.contact.count).toHaveBeenCalledWith({
        where: { officeId: 'office-1', tags: { has: '경합C ' } },
      });
      expect(tx.contactGroup.deleteMany).toHaveBeenCalledWith({
        where: { officeId: 'office-1', name: '경합C ' },
      });
      expect(tx.contact.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { tags: [] },
      });
    });
  });

  describe('members', () => {
    it('adds only contacts that are not in the group yet, under a row lock', async () => {
      const { tx, service } = createService({
        registered: 1,
        lockedContacts: [
          { id: 'c1', tags: ['VIP'] },
          { id: 'c2', tags: ['학군'] },
        ],
      });

      await expect(
        service.addMembers('office-1', '학군', ['c1', 'c2']),
      ).resolves.toEqual({ updated: 1 });

      expect(lockSql(tx)).toContain('FOR NO KEY UPDATE');
      expect(tx.contact.update).toHaveBeenCalledTimes(1);
      expect(tx.contact.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { tags: ['VIP', '학군'] },
      });
    });

    it('remembers a tag-only group so removing the last member keeps it', async () => {
      const { tx, service } = createService({
        members: 1,
        lockedContacts: [{ id: 'c1', tags: ['학군'] }],
      });

      await expect(
        service.removeMembers('office-1', '학군', ['c1']),
      ).resolves.toEqual({ updated: 1 });

      expect(tx.contactGroup.createMany).toHaveBeenCalledWith({
        data: [{ officeId: 'office-1', name: '학군' }],
        skipDuplicates: true,
      });
      expect(lockSql(tx)).toContain('FOR NO KEY UPDATE');
      expect(tx.contact.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { tags: [] },
      });
    });
  });
});
