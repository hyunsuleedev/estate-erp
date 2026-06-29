import { BadRequestException } from '@nestjs/common';
import { UnitsService } from './units.service';

describe('UnitsService — site type guard', () => {
  function createService() {
    const prisma = {
      site: {
        findFirst: jest.fn(),
      },
      dong: {
        findFirst: jest.fn().mockResolvedValue({ id: 'dong-1' }),
      },
      unit: {
        create: jest.fn().mockResolvedValue({ id: 'unit-1' }),
        findFirst: jest.fn(),
      },
    };

    return {
      prisma,
      service: new UnitsService(prisma as never),
    };
  }

  it('allows creating a unit on a house site (다가구 호실)', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'house' });

    await expect(
      service.create('office-1', {
        siteId: 'site-1',
        dongId: 'dong-1',
        name: '101호',
        floor: 1,
      }),
    ).resolves.toEqual({ id: 'unit-1' });

    expect(prisma.unit.create).toHaveBeenCalled();
  });

  it('allows creating a unit on a villa site (placeholder Dong 경로 동일)', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'villa' });

    await expect(
      service.create('office-1', {
        siteId: 'site-1',
        dongId: 'dong-1',
        name: '201호',
        floor: 2,
      }),
    ).resolves.toEqual({ id: 'unit-1' });
  });

  it('rejects creating a unit on a land site', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'land' });

    await expect(
      service.create('office-1', {
        siteId: 'site-1',
        dongId: 'dong-1',
        name: '101호',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create('office-1', {
        siteId: 'site-1',
        dongId: 'dong-1',
        name: '101호',
      }),
    ).rejects.toThrow('Units are not supported for land sites');

    expect(prisma.unit.create).not.toHaveBeenCalled();
  });
});
