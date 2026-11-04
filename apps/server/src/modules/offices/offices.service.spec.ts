import { ConflictException } from '@nestjs/common';
import { OfficesService } from './offices.service';

describe('OfficesService', () => {
  function createService() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      office: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback) => callback(prisma)),
    };

    return {
      prisma,
      service: new OfficesService(
        prisma as never,
        { tryRefresh: jest.fn() } as never,
      ),
    };
  }

  it('creates an office and attaches the current office-less owner', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      officeId: null,
      role: 'owner',
    });

    const createdAt = new Date('2026-05-26T00:00:00.000Z');
    const office = {
      id: 'office-1',
      name: '강남공인중개사',
      licenseNo: null,
      ceoName: '홍길동',
      phone: null,
      address: null,
      lat: null,
      lng: null,
      naverVerificationId: null,
      subscription: 'basic',
      maxUsers: 3,
      isActive: true,
      commissionConfig: null,
      createdAt,
      updatedAt: createdAt,
      users: [
        {
          id: 'user-1',
          name: '홍길동',
          email: 'owner@example.com',
          phone: null,
          role: 'owner',
          isActive: true,
        },
      ],
    };
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        office: {
          create: jest.fn().mockResolvedValue({ id: 'office-1' }),
          findUnique: jest.fn().mockResolvedValue(office),
        },
        user: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );

    await expect(
      service.createForCurrentUser('user-1', {
        name: '강남공인중개사',
        ceoName: '홍길동',
      }),
    ).resolves.toMatchObject({
      id: 'office-1',
      name: '강남공인중개사',
      owner: { id: 'user-1', role: 'owner' },
    });
  });

  it('rejects office creation when the user already belongs to an office', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      officeId: 'office-existing',
      role: 'owner',
    });

    await expect(
      service.createForCurrentUser('user-1', { name: '새 사무소' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates the office-wide Naver advertisement verification ID', async () => {
    const { prisma, service } = createService();
    const updatedAt = new Date('2026-07-31T14:30:00.000Z');
    const office = {
      id: 'office-1',
      name: '강남공인중개사',
      licenseNo: null,
      ceoName: '홍길동',
      phone: null,
      address: null,
      lat: null,
      lng: null,
      naverVerificationId: null,
      subscription: 'basic',
      maxUsers: 3,
      isActive: true,
      commissionConfig: null,
      createdAt: updatedAt,
      updatedAt,
      users: [
        {
          id: 'user-1',
          name: '홍길동',
          email: 'owner@example.com',
          phone: null,
          role: 'owner',
          licenseType: 'broker_owner',
          isActive: true,
        },
      ],
    };
    prisma.office.findUnique.mockResolvedValue(office);
    prisma.office.update.mockImplementation(async ({ data }) => {
      Object.assign(office, data);
      return office;
    });

    await expect(
      service.updateMe('office-1', {
        naverVerificationId: 'naver-agent-id',
      }),
    ).resolves.toMatchObject({
      id: 'office-1',
      naverVerificationId: 'naver-agent-id',
    });
    expect(prisma.office.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'office-1' },
        data: { naverVerificationId: 'naver-agent-id' },
      }),
    );
  });
});
