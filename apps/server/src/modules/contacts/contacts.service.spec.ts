import { ContactsService } from './contacts.service';

describe('ContactsService', () => {
  function createService() {
    const prisma = {
      contact: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    return {
      prisma,
      service: new ContactsService(prisma as never),
    };
  }

  it('returns the latest consultation summary for contact list rows', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-01T09:00:00.000Z');
    prisma.contact.findMany.mockResolvedValue([
      {
        id: 'contact-1',
        officeId: 'office-1',
        name: '홍길동',
        phone: '01012345678',
        phones: [],
        email: null,
        tags: [],
        memo: '고정 메모',
        createdAt,
        updatedAt: createdAt,
        _count: { propertyContacts: 1, buyerRequirements: 0, consultations: 2 },
        consultations: [
          {
            content: '최근 상담 내용입니다.',
            type: 'call',
            createdAt,
          },
        ],
      },
    ]);
    prisma.contact.count.mockResolvedValue(1);

    await expect(service.findAll('office-1')).resolves.toMatchObject({
      items: [
        {
          id: 'contact-1',
          memo: '고정 메모',
          latestConsultation: {
            content: '최근 상담 내용입니다.',
            type: 'call',
            createdAt,
          },
        },
      ],
      pagination: { total: 1 },
    });

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          consultations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              content: true,
              type: true,
              createdAt: true,
            },
          },
        }),
      }),
    );
  });
});
