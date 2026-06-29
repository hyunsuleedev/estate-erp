import { BadRequestException } from '@nestjs/common';
import { PropertiesService } from './properties.service';

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
      ).rejects.toThrow('unitId is not allowed for land properties');
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
    it.each(['apartment', 'officetel', 'villa', 'commercial', 'living_accommodation'])(
      'rejects a %s property without a unit',
      async (type) => {
        const { prisma, service } = createService();
        mockSite(prisma, type);

        await expect(
          service.create('office-1', { siteId: 'site-1' }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.create('office-1', { siteId: 'site-1' }),
        ).rejects.toThrow('unitId is required for building-type properties');
      },
    );

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
