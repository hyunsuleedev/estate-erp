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
        findMany: jest.fn().mockResolvedValue([]),
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

  it('stores nullable room and bathroom overrides on an independent unit', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'villa' });

    await service.create('office-1', {
      siteId: 'site-1',
      dongId: 'dong-1',
      name: '201호',
      roomCount: 2,
      bathRoomCount: 1,
    });

    expect(prisma.unit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roomCount: 2, bathRoomCount: 1 }),
      }),
    );
  });

  it('rejects invalid unit layout counts', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'villa' });

    await expect(
      service.create('office-1', {
        siteId: 'site-1',
        dongId: 'dong-1',
        name: '201호',
        roomCount: -1,
      }),
    ).rejects.toThrow('roomCount must be a non-negative integer or null');

    await expect(
      service.create('office-1', {
        siteId: 'site-1',
        dongId: 'dong-1',
        name: '201호',
        bathRoomCount: 1.5,
      }),
    ).rejects.toThrow('bathRoomCount must be a non-negative integer or null');
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

  it('loads several selected dongs with one unit query', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'apartment' });

    await expect(
      service.findAll('office-1', {
        siteId: 'site-1',
        dongIds: ['dong-101', 'dong-102', 'dong-101'],
      }),
    ).resolves.toEqual([]);

    expect(prisma.dong.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.unit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          siteId: 'site-1',
          dongId: { in: ['dong-101', 'dong-102'] },
        }),
      }),
    );
  });
});
