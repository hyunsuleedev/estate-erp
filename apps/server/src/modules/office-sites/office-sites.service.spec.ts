import { OfficeSitesService } from './office-sites.service';

describe('OfficeSitesService', () => {
  function createService() {
    const prisma = {
      officeSite: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      site: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ward: {
        findUnique: jest.fn().mockResolvedValue({ code: '1174010200' }),
      },
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      site: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'site-1' }),
      },
      dong: { create: jest.fn().mockResolvedValue({ id: 'dong-1' }) },
      officeSite: { create: jest.fn().mockResolvedValue({ id: 'office-site-1' }) },
    };
    Object.assign(prisma, {
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    });

    return {
      service: new OfficeSitesService(prisma as never),
      prisma,
      tx,
    };
  }

  describe('registerPrivateSite', () => {
    const dto = { name: '고덕빌라', type: 'villa', wardCode: '1174010200' } as const;

    it('always stores the site as private under the requesting office', async () => {
      const { service, tx } = createService();

      // DTO 검증을 우회해 값이 섞여 들어와도 저장되는 값은 바뀌지 않아야 한다
      await service.registerPrivateSite('office-1', {
        ...dto,
        isPublic: true,
        isLocked: true,
        officeId: 'another-office',
      } as never);

      expect(tx.site.create.mock.calls[0][0].data).toMatchObject({
        officeId: 'office-1',
        isPublic: false,
        isLocked: false,
        name: '고덕빌라',
      });
      expect(tx.officeSite.create.mock.calls[0][0].data).toEqual({
        officeId: 'office-1',
        siteId: 'site-1',
      });
    });

    it.each([
      ['villa', undefined, true],
      ['officetel', undefined, true],
      ['commercial', undefined, true],
      ['living_accommodation', undefined, true],
      ['apartment', undefined, false],
      ['apartment', 1, true],
      ['villa', 3, false],
      ['house', undefined, false],
      ['land', 1, false],
    ] as const)('placeholder dong for %s with totalDongs=%s: %s', async (type, totalDongs, expected) => {
      const { service, tx } = createService();

      await service.registerPrivateSite('office-1', { ...dto, type, totalDongs });

      expect(tx.dong.create).toHaveBeenCalledTimes(expected ? 1 : 0);
      if (expected) {
        expect(tx.dong.create.mock.calls[0][0].data).toEqual({
          officeId: 'office-1',
          siteId: 'site-1',
          name: '-',
          isPlaceholder: true,
        });
      }
    });

    it('refuses an unknown ward before writing anything', async () => {
      const { service, prisma, tx } = createService();
      prisma.ward.findUnique.mockResolvedValue(null);

      await expect(service.registerPrivateSite('office-1', dto)).rejects.toThrow('법정동');
      expect(tx.site.create).not.toHaveBeenCalled();
    });

    it('refuses a duplicate among sites this office can see', async () => {
      const { service, tx } = createService();
      tx.site.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.registerPrivateSite('office-1', dto)).rejects.toThrow('이미 있습니다');
      expect(tx.site.findFirst.mock.calls[0][0].where).toEqual({
        name: '고덕빌라',
        wardCode: '1174010200',
        OR: [{ isPublic: true }, { officeId: 'office-1' }],
      });
      expect(tx.site.create).not.toHaveBeenCalled();
    });

    it('takes the lock before checking for a duplicate, scoped to office, ward, and name', async () => {
      const { service, tx } = createService();

      await service.registerPrivateSite('office-1', dto);

      const [sql, lockKey] = tx.$executeRaw.mock.calls[0];
      expect(sql.join('?')).toContain('pg_advisory_xact_lock');
      expect(lockKey).toBe('office-site-register:office-1:1174010200:고덕빌라');
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.site.findFirst.mock.invocationCallOrder[0],
      );
    });
  });

  it('searches public sites and only this office private sites', async () => {
    const { service, prisma } = createService();

    await service.searchCentralSites('고덕', 'office-1');

    const { where } = prisma.site.findMany.mock.calls[0][0];
    expect(where.OR).toEqual([{ isPublic: true }, { officeId: 'office-1' }]);
    expect(where.isPublic).toBeUndefined();
  });

  it('requires every space-separated word to match when searching sites', async () => {
    const { service, prisma } = createService();

    await service.searchCentralSites('  고덕   그라시움 ', 'office-1');

    const { where } = prisma.site.findMany.mock.calls[0][0];
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR).toContainEqual({
      name: { contains: '고덕', mode: 'insensitive' },
    });
    expect(where.AND[1].OR).toContainEqual({
      name: { contains: '그라시움', mode: 'insensitive' },
    });
  });

  it('rejects a blank site search', async () => {
    const { service, prisma } = createService();

    await expect(service.searchCentralSites('   ', 'office-1')).rejects.toThrow('q is required');
    expect(prisma.site.findMany).not.toHaveBeenCalled();
  });

  it('returns favorites first and keeps recent subscriptions first within each section', async () => {
    const { service, prisma } = createService();

    await service.findAll('office-1');

    expect(prisma.officeSite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { officeId: 'office-1' },
        orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  });

  it('updates the favorite flag only inside the requesting office scope', async () => {
    const { service, prisma } = createService();
    prisma.officeSite.findFirst.mockResolvedValue({
      id: 'office-site-1',
      officeId: 'office-1',
    });
    prisma.officeSite.update.mockResolvedValue({
      id: 'office-site-1',
      isFavorite: true,
    });

    await service.update('office-site-1', 'office-1', { isFavorite: true });

    expect(prisma.officeSite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'office-site-1', officeId: 'office-1' },
      }),
    );
    expect(prisma.officeSite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'office-site-1' },
        data: { isFavorite: true },
      }),
    );
  });
});
