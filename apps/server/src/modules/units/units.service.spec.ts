import { BadRequestException, ConflictException } from '@nestjs/common';
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
    ).rejects.toThrow('방 수는 0 이상의 정수로 입력해 주세요.');

    await expect(
      service.create('office-1', {
        siteId: 'site-1',
        dongId: 'dong-1',
        name: '201호',
        bathRoomCount: 1.5,
      }),
    ).rejects.toThrow('욕실 수는 0 이상의 정수로 입력해 주세요.');
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
    ).rejects.toThrow('토지에는 호수를 만들 수 없습니다.');

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

  // ---- 호가 없는 공간, 공공 건물 아래의 사무소 공간 ----

  it('creates a floor-only space under a public building as the office\'s own', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'commercial', isPublic: true, officeId: null });

    await service.create('office-1', { siteId: 'site-1', dongId: 'dong-1', floor: 2 });

    // 공공 대지 · 공공 건물도 받는다 (공간은 이 사무소의 것으로 만든다)
    expect(prisma.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site-1', OR: [{ officeId: 'office-1' }, { isPublic: true }] },
    });
    expect(prisma.dong.findFirst).toHaveBeenCalledWith({
      where: { id: 'dong-1', siteId: 'site-1', OR: [{ officeId: 'office-1' }, { officeId: null }] },
    });
    expect(prisma.unit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ officeId: 'office-1', name: null, floor: 2, floorEnd: null }),
      include: { site: true, dong: true, siteUnitType: true },
    });
  });

  it('accepts basements, floor ranges and a named part of a floor', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'commercial' });

    await service.create('office-1', { siteId: 'site-1', dongId: 'dong-1', floor: -2 });
    await service.create('office-1', { siteId: 'site-1', dongId: 'dong-1', floor: -1, floorEnd: 1 });
    await service.create('office-1', { siteId: 'site-1', dongId: 'dong-1', floor: 2, name: ' 좌측 ' });
    await service.create('office-1', { siteId: 'site-1', dongId: 'dong-1', floor: -1, floorLabel: '반지하' });

    expect(prisma.unit.create.mock.calls.map(([call]) => call.data)).toEqual([
      expect.objectContaining({ name: null, floor: -2, floorEnd: null, floorLabel: null }),
      expect.objectContaining({ name: null, floor: -1, floorEnd: 1 }),
      expect.objectContaining({ name: '좌측', floor: 2 }),
      expect.objectContaining({ floor: -1, floorLabel: '반지하' }),
    ]);
  });

  it.each([
    ['neither a name nor a floor', {}],
    ['a blank name and no floor', { name: '  ' }],
    ['floor zero', { floor: 0 }],
    ['an end floor below the start', { floor: 3, floorEnd: 2 }],
    ['an end floor without a start', { name: '101', floorEnd: 2 }],
    ['a fractional floor', { floor: 1.5 }],
  ])('rejects a space with %s', async (_label, space) => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'commercial' });

    await expect(
      service.create('office-1', { siteId: 'site-1', dongId: 'dong-1', ...space }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unit.create).not.toHaveBeenCalled();
  });

  it('points at the public ho instead of creating an office copy with the same name', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'apartment', isPublic: true });
    prisma.unit.findFirst.mockResolvedValueOnce({ id: 'public-unit-3401' });

    await expect(
      service.create('office-1', { siteId: 'site-1', dongId: 'dong-1', name: '3401', floor: 34 }),
    ).rejects.toMatchObject({ response: { unitId: 'public-unit-3401' } });
    expect(prisma.unit.create).not.toHaveBeenCalled();
  });

  it('does not create the same office space twice', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', type: 'commercial' });
    prisma.unit.findFirst.mockResolvedValueOnce({ id: 'office-unit-2f' });

    await expect(
      service.create('office-1', { siteId: 'site-1', dongId: 'dong-1', floor: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
