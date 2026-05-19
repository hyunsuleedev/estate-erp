import { ConsultationsService } from './consultations.service';

describe('ConsultationsService', () => {
  function createService() {
    const prisma = {
      consultation: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    return {
      prisma,
      service: new ConsultationsService(prisma as never),
    };
  }

  it('builds entity-aware filters for contact, property hierarchy, context, and global search', async () => {
    const { prisma, service } = createService();
    prisma.consultation.findMany.mockResolvedValue([]);
    prisma.consultation.count.mockResolvedValue(0);

    await service.findAll('office-1', {
      contactId: 'contact-1',
      siteId: 'site-1',
      dongId: 'dong-1',
      unitId: 'unit-1',
      context: 'property',
      q: '김소유',
    });

    expect(prisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { officeId: 'office-1' },
            { contactId: 'contact-1' },
            { property: { siteId: 'site-1' } },
            { property: { unit: { dongId: 'dong-1' } } },
            { property: { unitId: 'unit-1' } },
            { propertyId: { not: null } },
            {
              OR: expect.arrayContaining([
                { content: { contains: '김소유', mode: 'insensitive' } },
                { contact: { name: { contains: '김소유', mode: 'insensitive' } } },
                { property: { site: { name: { contains: '김소유', mode: 'insensitive' } } } },
                { property: { unit: { name: { contains: '김소유', mode: 'insensitive' } } } },
              ]),
            },
          ],
        },
      }),
    );
  });

  it('filters unlinked consultations without excluding office scoping', async () => {
    const { prisma, service } = createService();
    prisma.consultation.findMany.mockResolvedValue([]);
    prisma.consultation.count.mockResolvedValue(0);

    await service.findAll('office-1', { context: 'unlinked' });

    expect(prisma.consultation.count).toHaveBeenCalledWith({
      where: {
        AND: [
          { officeId: 'office-1' },
          {
            propertyId: null,
            listingIntakeId: null,
            listingId: null,
            matchId: null,
            buyerReqId: null,
          },
        ],
      },
    });
  });

  it('maps action-required outcome filters to consultation content keywords', async () => {
    const { prisma, service } = createService();
    prisma.consultation.findMany.mockResolvedValue([]);
    prisma.consultation.count.mockResolvedValue(0);

    await service.findAll('office-1', { outcome: 'actionRequired' });

    expect(prisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { officeId: 'office-1' },
            {
              OR: expect.arrayContaining([
                { content: { contains: '필요', mode: 'insensitive' } },
                { content: { contains: '요청', mode: 'insensitive' } },
                { content: { contains: '문의', mode: 'insensitive' } },
              ]),
            },
          ],
        },
      }),
    );
  });
});
