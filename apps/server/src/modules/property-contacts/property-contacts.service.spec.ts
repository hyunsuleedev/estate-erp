import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PropertyContactsService } from './property-contacts.service';

const OFFICE_ID = '00000000-0000-4000-8000-000000000001';
const PROPERTY_ID = '00000000-0000-4000-8000-000000000002';
const CONTACT_ID = '00000000-0000-4000-8000-000000000003';
const PROPERTY_CONTACT_ID = '00000000-0000-4000-8000-000000000004';
const OLD_PRIMARY_ID = '00000000-0000-4000-8000-000000000005';

function propertyContact(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPERTY_CONTACT_ID,
    officeId: OFFICE_ID,
    propertyId: PROPERTY_ID,
    contactId: CONTACT_ID,
    role: 'representative',
    shareRatio: null,
    isResident: false,
    isPrimary: true,
    status: 'active',
    memo: null,
    createdAt: new Date('2026-08-07T12:00:00.000Z'),
    updatedAt: new Date('2026-08-07T12:00:00.000Z'),
    contact: {
      id: CONTACT_ID,
      name: '아버지',
      phones: [],
    },
    ...overrides,
  };
}

describe('PropertyContactsService', () => {
  function createService() {
    const prisma = {
      property: { findFirst: jest.fn() },
      contact: { findFirst: jest.fn(), create: jest.fn() },
      propertyContact: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      listingIntake: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    return {
      prisma,
      service: new PropertyContactsService(prisma as never),
    };
  }

  it('새 주 연락처를 만들 때 기존 활성 주 연락처를 먼저 내린다', async () => {
    const { prisma, service } = createService();
    prisma.property.findFirst.mockResolvedValue({ id: PROPERTY_ID });
    prisma.contact.findFirst.mockResolvedValue({ id: CONTACT_ID });
    prisma.propertyContact.findMany.mockResolvedValue([{ id: OLD_PRIMARY_ID }]);
    prisma.propertyContact.update.mockResolvedValue({});
    prisma.propertyContact.create.mockResolvedValue(propertyContact());

    await service.create(OFFICE_ID, {
      propertyId: PROPERTY_ID,
      contactId: CONTACT_ID,
      role: 'representative',
      isPrimary: true,
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.propertyContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeId: OFFICE_ID,
          propertyId: PROPERTY_ID,
          status: 'active',
          isPrimary: true,
        }),
      }),
    );
    expect(prisma.propertyContact.update).toHaveBeenCalledWith({
      where: { id: OLD_PRIMARY_ID },
      data: { isPrimary: false },
    });
    expect(prisma.propertyContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPrimary: true }),
      }),
    );
  });

  it('기존 관계를 주 연락처로 승격하면 같은 Property의 대표를 교체한다', async () => {
    const { prisma, service } = createService();
    prisma.propertyContact.findFirst.mockResolvedValue({
      id: PROPERTY_CONTACT_ID,
      propertyId: PROPERTY_ID,
      isPrimary: false,
      status: 'active',
    });
    prisma.propertyContact.findMany.mockResolvedValue([{ id: OLD_PRIMARY_ID }]);
    prisma.propertyContact.update
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(propertyContact());

    const result = await service.update(PROPERTY_CONTACT_ID, OFFICE_ID, {
      isPrimary: true,
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.propertyContact.update).toHaveBeenNthCalledWith(1, {
      where: { id: OLD_PRIMARY_ID },
      data: { isPrimary: false },
    });
    expect(prisma.propertyContact.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: PROPERTY_CONTACT_ID },
        data: { isPrimary: true },
      }),
    );
    expect(result.isPrimary).toBe(true);
  });

  it('관계를 비활성화하면 주 연락처 플래그도 함께 해제한다', async () => {
    const { prisma, service } = createService();
    prisma.propertyContact.findFirst.mockResolvedValue({
      id: PROPERTY_CONTACT_ID,
      propertyId: PROPERTY_ID,
      isPrimary: true,
      status: 'active',
    });
    prisma.propertyContact.update.mockResolvedValue(
      propertyContact({ isPrimary: false, status: 'archived' }),
    );

    await service.update(PROPERTY_CONTACT_ID, OFFICE_ID, {
      status: 'archived',
    });

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.propertyContact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'archived', isPrimary: false },
      }),
    );
  });

  it('허용되지 않은 상태값을 거부한다', async () => {
    const { service } = createService();

    await expect(
      service.update(PROPERTY_CONTACT_ID, OFFICE_ID, {
        status: 'verified',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('다른 사무소 Contact를 Property에 연결하지 않는다', async () => {
    const { prisma, service } = createService();
    prisma.property.findFirst.mockResolvedValue({ id: PROPERTY_ID });
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(
      service.create(OFFICE_ID, {
        propertyId: PROPERTY_ID,
        contactId: CONTACT_ID,
        role: 'representative',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.propertyContact.create).not.toHaveBeenCalled();
  });
});
