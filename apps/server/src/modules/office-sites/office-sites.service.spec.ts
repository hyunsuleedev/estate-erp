import { OfficeSitesService } from './office-sites.service';

describe('OfficeSitesService', () => {
  function createService() {
    const prisma = {
      officeSite: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    return {
      service: new OfficeSitesService(prisma as never),
      prisma,
    };
  }

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
