import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExternalListingSourcesService } from './external-listing-sources.service';

describe('ExternalListingSourcesService', () => {
  function createService(overrides: Record<string, unknown> = {}) {
    const tx = {
      officeSite: { findMany: jest.fn().mockResolvedValue([]) },
      externalListingSource: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      ...overrides,
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
      externalListingSource: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      site: { findFirst: jest.fn() },
    };
    return {
      service: new ExternalListingSourcesService(prisma as never),
      prisma,
      tx,
    };
  }

  const managedSite = (id: string, naverComplexCode: string | null) => ({
    siteId: id,
    site: { id, name: `단지-${id}`, type: 'apartment', naverComplexCode },
  });

  describe('importFromOfficeSites', () => {
    it('코드가 있으면 자동 등록하고 Site.type을 복사한다', async () => {
      const { service, tx } = createService();
      tx.officeSite.findMany.mockResolvedValue([managedSite('site-1', '113907')]);
      tx.externalListingSource.createMany.mockResolvedValue({ count: 1 });

      const result = await service.importFromOfficeSites('office-1', {});

      expect(tx.externalListingSource.createMany).toHaveBeenCalledWith({
        data: [
          {
            officeId: 'office-1',
            siteId: 'site-1',
            provider: 'naver',
            externalCode: '113907',
            type: 'apartment',
          },
        ],
        skipDuplicates: true,
      });
      expect(result).toEqual({
        imported: 1,
        alreadyRegistered: 0,
        skipped: [],
      });
    });

    it('코드가 없으면 등록하지 않고 no_external_code로 리포트한다', async () => {
      const { service, tx } = createService();
      tx.officeSite.findMany.mockResolvedValue([managedSite('site-1', null)]);

      const result = await service.importFromOfficeSites('office-1', {});

      expect(tx.externalListingSource.createMany).not.toHaveBeenCalled();
      expect(result.imported).toBe(0);
      expect(result.skipped).toEqual([
        { siteId: 'site-1', siteName: '단지-site-1', reason: 'no_external_code' },
      ]);
    });

    it('조회와 생성을 한 트랜잭션에서 수행한다', async () => {
      const { service, prisma } = createService();

      await service.importFromOfficeSites('office-1', {});

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('동시 import로 skipDuplicates가 삼킨 행을 alreadyRegistered로 회계한다', async () => {
      // 트랜잭션 시작 시점엔 미등록이었으나 커밋 전에 다른 import가 선점한 상황.
      // 이 행이 어느 항목에도 안 잡히면 호출자는 미등록으로 오해한다.
      const { service, tx } = createService();
      tx.officeSite.findMany.mockResolvedValue([
        managedSite('site-1', '113907'),
        managedSite('site-2', '117842'),
      ]);
      tx.externalListingSource.createMany.mockResolvedValue({ count: 1 });

      const result = await service.importFromOfficeSites('office-1', {});

      expect(result.imported).toBe(1);
      expect(result.alreadyRegistered).toBe(1);
      expect(
        result.imported + result.alreadyRegistered + result.skipped.length,
      ).toBe(2);
    });

    it('관리단지에 없는 siteId를 요청하면 거부한다', async () => {
      const { service, tx } = createService();
      tx.officeSite.findMany.mockResolvedValue([managedSite('site-1', '113907')]);

      await expect(
        service.importFromOfficeSites('office-1', {
          siteIds: ['site-1', 'site-999'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('unique 충돌을 ConflictException으로 변환한다', async () => {
      const { service, prisma } = createService();
      prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'apartment' });
      prisma.externalListingSource.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create('office-1', { siteId: 'site-1', externalCode: '113907' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('지원하지 않는 provider를 거부한다', async () => {
      const { service } = createService();

      await expect(
        service.create('office-1', {
          siteId: 'site-1',
          provider: 'zigbang',
          externalCode: '1',
        }),
      ).rejects.toThrow('지원하지 않는 provider');
    });
  });
});
