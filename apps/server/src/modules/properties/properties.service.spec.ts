import { BadRequestException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { buildPropertySearchWhere } from './property-search';

describe('PropertiesService — site/unit chain guard', () => {
  function createService() {
    const prisma = {
      site: {
        findFirst: jest.fn(),
      },
      unit: {
        findFirst: jest.fn(),
      },
      property: {
        create: jest.fn().mockResolvedValue({ id: 'property-1' }),
        findFirst: jest.fn(),
      },
    };

    return {
      prisma,
      service: new PropertiesService(prisma as never),
    };
  }

  function mockSite(prisma: ReturnType<typeof createService>['prisma'], type: string) {
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type });
  }

  function mockUnit(prisma: ReturnType<typeof createService>['prisma']) {
    prisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
  }

  describe('house (단독/다가구주택) — 둘 다 허용', () => {
    it('allows creating a house property WITH a unit (다가구 호실)', async () => {
      const { prisma, service } = createService();
      mockSite(prisma, 'house');
      mockUnit(prisma);

      await expect(
        service.create('office-1', { siteId: 'site-1', unitId: 'unit-1' }),
      ).resolves.toEqual({ id: 'property-1' });

      expect(prisma.property.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ siteId: 'site-1', unitId: 'unit-1' }),
        }),
      );
    });

    it('allows creating a house property WITHOUT a unit (통건물)', async () => {
      const { prisma, service } = createService();
      mockSite(prisma, 'house');

      await expect(
        service.create('office-1', { siteId: 'site-1' }),
      ).resolves.toEqual({ id: 'property-1' });

      expect(prisma.property.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ siteId: 'site-1', unitId: null }),
        }),
      );
    });
  });

  describe('land — unit 금지', () => {
    it('rejects a land property with a unit', async () => {
      const { prisma, service } = createService();
      mockSite(prisma, 'land');
      mockUnit(prisma);

      await expect(
        service.create('office-1', { siteId: 'site-1', unitId: 'unit-1' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('office-1', { siteId: 'site-1', unitId: 'unit-1' }),
      ).rejects.toThrow('토지에는 호수를 붙일 수 없습니다.');
    });

    it('allows a land property without a unit', async () => {
      const { prisma, service } = createService();
      mockSite(prisma, 'land');

      await expect(
        service.create('office-1', { siteId: 'site-1' }),
      ).resolves.toEqual({ id: 'property-1' });
    });
  });

  describe('building types — unit 필수', () => {
    it.each(['apartment', 'officetel', 'villa', 'living_accommodation'])(
      'rejects a %s property without a unit',
      async (type) => {
        const { prisma, service } = createService();
        mockSite(prisma, type);

        await expect(
          service.create('office-1', { siteId: 'site-1' }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.create('office-1', { siteId: 'site-1' }),
        ).rejects.toThrow('호수를 골라야 합니다');
      },
    );

    it('allows a whole commercial building without a unit', async () => {
      const { prisma, service } = createService();
      mockSite(prisma, 'commercial');
      await expect(service.create('office-1', { siteId: 'site-1' })).resolves.toEqual({ id: 'property-1' });
    });

    it('allows an apartment property with a unit', async () => {
      const { prisma, service } = createService();
      mockSite(prisma, 'apartment');
      mockUnit(prisma);

      await expect(
        service.create('office-1', { siteId: 'site-1', unitId: 'unit-1' }),
      ).resolves.toEqual({ id: 'property-1' });
    });
  });
});

describe('buildPropertySearchWhere — 전화로 들은 동·호로 찾기', () => {
  const flatten = (value: unknown): string => JSON.stringify(value);

  it('splits glued "108동1505호" into a dong token and a unit token', () => {
    const where = buildPropertySearchWhere('고덕그라시움 108동1505호') as { AND: unknown[] };
    expect(where.AND).toHaveLength(3);
    expect(flatten(where.AND[1])).toContain('"dong":{"name":{"in":["108","108동"]}}');
    expect(flatten(where.AND[2])).toContain('"unit":{"name":{"in":["1505","1505호"]}}');
  });

  it('lets a bare number match either a dong or a unit', () => {
    const where = buildPropertySearchWhere('1505');
    const text = flatten(where);
    expect(text).toContain('"dong":{"name":{"in":["1505","1505동"]}}');
    expect(text).toContain('"unit":{"name":{"in":["1505","1505호"]}}');
  });

  it('keeps a site name search as before', () => {
    expect(flatten(buildPropertySearchWhere('고덕그라시움'))).toContain('"name":{"contains":"고덕그라시움"');
    expect(buildPropertySearchWhere('   ')).toBeNull();
  });
});
