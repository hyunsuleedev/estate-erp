import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ListingAdvertisementsService } from './listing-advertisements.service';

jest.mock('@estate-erp/shared', () => ({
  ListingAdvertisementStatus: {
    PLANNED: 'planned',
    DRAFT: 'draft',
    ACTIVE: 'active',
    PAUSED: 'paused',
    ENDED: 'ended',
    ERROR: 'error',
  },
  ListingAdvertisementSource: {
    MANUAL: 'manual',
    EXTERNAL_OBSERVED: 'external_observed',
    CP_SYNC: 'cp_sync',
  },
  ListingAdvertisementChannel: {
    NAVER: 'naver',
    ASIL: 'asil',
    ZIGBANG: 'zigbang',
    DABANG: 'dabang',
    HANBANG: 'hanbang',
    ETC: 'etc',
  },
}));

describe('ListingAdvertisementsService', () => {
  function createService() {
    const prisma = {
      listing: {
        findFirst: jest.fn(),
      },
      listingAdvertisement: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    return {
      prisma,
      service: new ListingAdvertisementsService(prisma as never),
    };
  }

  // ---- findAll ----

  it('returns advertisement rows for the office with linked listing context', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findMany.mockResolvedValue([{ id: 'ad-1' }]);
    prisma.listingAdvertisement.count.mockResolvedValue(1);

    const result = await service.findAll('office-1', {
      page: 1,
      limit: 50,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(result).toEqual({
      items: [{ id: 'ad-1' }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    expect(prisma.listingAdvertisement.findMany).toHaveBeenCalledWith({
      where: { officeId: 'office-1' },
      include: expect.objectContaining({
        listing: expect.objectContaining({
          include: expect.objectContaining({
            property: expect.any(Object),
          }),
        }),
      }),
      orderBy: { updatedAt: 'desc' },
      skip: 0,
      take: 50,
    });
  });

  // ---- create ----

  it('creates an active advertisement when no listing-channel conflict exists', async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue({ id: 'listing-1' });
    prisma.listingAdvertisement.findFirst.mockResolvedValue(null);
    prisma.listingAdvertisement.create.mockResolvedValue({ id: 'ad-1' });

    const result = await service.create('office-1', {
      listingId: 'listing-1',
      channel: 'naver',
    });

    expect(result).toEqual({ id: 'ad-1' });
    expect(prisma.listingAdvertisement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId: 'office-1',
        listingId: 'listing-1',
        channel: 'naver',
        status: 'active',
        source: 'manual',
      }),
    });
  });

  it('rejects creating an advertisement on a listing from another office', async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue(null);

    await expect(
      service.create('office-1', {
        listingId: 'listing-from-other-office',
        channel: 'naver',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.listing.findFirst).toHaveBeenCalledWith({
      where: { id: 'listing-from-other-office', officeId: 'office-1' },
      select: { id: true },
    });
    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
  });

  it('rejects a second active ad on the same listing+channel with 409', async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue({ id: 'listing-1' });
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ id: 'ad-existing' });

    await expect(
      service.create('office-1', {
        listingId: 'listing-1',
        channel: 'naver',
        status: 'active',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
  });

  it('allows creating a non-active ad even if an active one exists on the same channel', async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue({ id: 'listing-1' });
    prisma.listingAdvertisement.create.mockResolvedValue({ id: 'ad-draft' });

    await service.create('office-1', {
      listingId: 'listing-1',
      channel: 'naver',
      status: 'draft',
    });

    expect(prisma.listingAdvertisement.findFirst).not.toHaveBeenCalled();
    expect(prisma.listingAdvertisement.create).toHaveBeenCalled();
  });

  it('rejects an invalid status', async () => {
    const { service } = createService();
    await expect(
      service.create('office-1', {
        listingId: 'listing-1',
        channel: 'naver',
        status: 'bogus',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a channel slug that violates the shape regex', async () => {
    const { service } = createService();
    await expect(
      service.create('office-1', {
        listingId: 'listing-1',
        channel: 'Naver', // uppercase first letter — not in KNOWN, fails regex
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- update ----

  it('rejects updating an advertisement that belongs to another office', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue(null);

    await expect(
      service.update('ad-1', 'office-1', { status: 'ended' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.listingAdvertisement.findFirst).toHaveBeenCalledWith({
      where: { id: 'ad-1', officeId: 'office-1' },
    });
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
  });

  it('auto-fills endedAt when transitioning status to ended', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: 'ad-1',
      officeId: 'office-1',
      listingId: 'listing-1',
      channel: 'naver',
      status: 'active',
      endedAt: null,
    });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: 'ad-1' });

    await service.update('ad-1', 'office-1', { status: 'ended' });

    const updateCall = prisma.listingAdvertisement.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'ad-1' });
    expect(updateCall.data.status).toBe('ended');
    expect(updateCall.data.endedAt).toBeInstanceOf(Date);
  });

  it('does not overwrite an explicit endedAt passed alongside status=ended', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: 'ad-1',
      officeId: 'office-1',
      listingId: 'listing-1',
      channel: 'naver',
      status: 'active',
      endedAt: null,
    });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: 'ad-1' });
    const explicit = '2026-04-01T10:00:00.000Z';

    await service.update('ad-1', 'office-1', {
      status: 'ended',
      endedAt: explicit,
    });

    const updateCall = prisma.listingAdvertisement.update.mock.calls[0][0];
    expect(updateCall.data.endedAt).toBe(explicit);
  });

  it('rejects reactivating to active when another active ad already exists on the same channel', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst
      .mockResolvedValueOnce({
        id: 'ad-1',
        officeId: 'office-1',
        listingId: 'listing-1',
        channel: 'naver',
        status: 'paused',
        endedAt: null,
      })
      .mockResolvedValueOnce({ id: 'ad-other-active' });

    await expect(
      service.update('ad-1', 'office-1', { status: 'active' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
  });

  it('allows status-update from active to active when only the channel stays the same and no conflict exists', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValueOnce({
      id: 'ad-1',
      officeId: 'office-1',
      listingId: 'listing-1',
      channel: 'naver',
      status: 'active',
      endedAt: null,
    });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: 'ad-1' });

    await service.update('ad-1', 'office-1', {
      advertisedPrice: 158000,
    });

    // active→active 그대로면 충돌 검사 second findFirst 호출 없음
    expect(prisma.listingAdvertisement.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.listingAdvertisement.update).toHaveBeenCalled();
  });

  // ---- remove ----

  it('rejects removing an advertisement from another office', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue(null);

    await expect(service.remove('ad-1', 'office-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.listingAdvertisement.delete).not.toHaveBeenCalled();
  });

  it('deletes an advertisement that belongs to the office', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ id: 'ad-1' });
    prisma.listingAdvertisement.delete.mockResolvedValue({ id: 'ad-1' });

    await service.remove('ad-1', 'office-1');

    expect(prisma.listingAdvertisement.delete).toHaveBeenCalledWith({
      where: { id: 'ad-1' },
    });
  });
});
