import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContactsService } from './contacts.service';

describe('ContactsService', () => {
  function createService() {
    const prisma = {
      contact: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
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

  it('stores canonical phone digits and promotes the first number when no primary is selected', async () => {
    const { prisma, service } = createService();
    prisma.contact.create.mockResolvedValue({
      id: 'contact-1',
      phones: [
        { phone: '01012345678', isPrimary: true },
        { phone: '0212345678', isPrimary: false },
      ],
    });

    await service.create('office-1', {
      name: '홍길동',
      phones: [
        { phone: '+82 10-1234-5678' },
        { phone: '02-1234-5678' },
      ],
    });

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phones: {
            create: [
              expect.objectContaining({
                phone: '01012345678',
                isPrimary: true,
              }),
              expect.objectContaining({
                phone: '0212345678',
                isPrimary: false,
              }),
            ],
          },
        }),
      }),
    );

    const createInput = prisma.contact.create.mock.calls[0][0];
    expect(createInput.data.phones.create[0]).not.toHaveProperty('normalizedPhone');
    expect(createInput.data.phones.create[0]).not.toHaveProperty('isActive');
  });

  it('rejects more than one primary phone for the same contact', async () => {
    const { prisma, service } = createService();

    await expect(
      service.create('office-1', {
        name: '홍길동',
        phones: [
          { phone: '010-1111-2222', isPrimary: true },
          { phone: '010-3333-4444', isPrimary: true },
        ],
      }),
    ).rejects.toThrow('대표 전화번호는 연락처당 하나만 지정할 수 있습니다.');

    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('returns a conflict when another contact in the office owns the phone', async () => {
    const { prisma, service } = createService();
    prisma.contact.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique phone', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['office_id', 'phone'] },
      }),
    );

    await expect(
      service.create('office-1', {
        name: '홍길동',
        phones: [{ phone: '010-1111-2222' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
