import { NetworkInquiriesService } from './network-inquiries.service';
import { SharedPropertyWithRelations } from './network-masking';

function buildSharedPropertyRecord(): SharedPropertyWithRelations {
  return {
    id: 'shared-1',
    roomId: 'room-1',
    listingId: 'listing-1',
    officeId: 'office-sharer',
    sharedBy: 'user-sharer',
    showSiteName: true,
    showDong: false,
    showUnit: false,
    showPrice: true,
    showArea: true,
    showFloor: false,
    showMemo: false,
    showPhotos: false,
    contactName: null,
    contactPhone: null,
    description: null,
    isActive: true,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    sharedByUser: { id: 'user-sharer', name: '김중개' },
    office: { id: 'office-sharer', name: '강동중개' },
    listing: {
      id: 'listing-1',
      transactionType: 'sale',
      checkStatus: 'verified',
      price: 158000,
      deposit: null,
      monthlyRent: null,
      memo: '비공개 메모',
      property: {
        site: {
          name: '래미안고덕',
          type: 'apartment',
          ward: { name: '고덕동', district: { name: '강동구' } },
        },
        unit: null,
        photos: [],
      },
    },
  } as SharedPropertyWithRelations;
}

function createService() {
  const prisma = {
    networkSharedProperty: {
      findFirst: jest.fn(),
    },
    networkInquiry: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const rooms = {
    assertApprovedMember: jest.fn().mockResolvedValue({ id: 'member-1' }),
  };
  const notifications = {
    notify: jest.fn().mockResolvedValue([]),
  };

  return {
    prisma,
    rooms,
    notifications,
    service: new NetworkInquiriesService(
      prisma as never,
      rooms as never,
      notifications as never,
    ),
  };
}

describe('NetworkInquiriesService', () => {
  describe('create', () => {
    it('타사무소 approved 멤버는 문의를 생성하고 공유자 사무소에 알림이 간다', async () => {
      const { prisma, rooms, notifications, service } = createService();
      prisma.networkSharedProperty.findFirst.mockResolvedValue({
        id: 'shared-1',
        roomId: 'room-1',
        officeId: 'office-sharer',
        sharedBy: 'user-sharer',
        isActive: true,
      });
      prisma.networkInquiry.create.mockResolvedValue({
        id: 'inquiry-1',
        status: 'pending',
        fromOfficeId: 'office-buyer',
        fromUserId: 'user-buyer',
        sharedProperty: buildSharedPropertyRecord(),
        fromOffice: { id: 'office-buyer', name: '송파중개' },
        fromUser: { id: 'user-buyer', name: '박중개' },
      });

      const result = await service.create('shared-1', 'office-buyer', 'user-buyer', {
        message: '공동중개 가능할까요?',
      });

      expect(rooms.assertApprovedMember).toHaveBeenCalledWith(
        'room-1',
        'office-buyer',
      );
      expect(prisma.networkInquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            sharedPropertyId: 'shared-1',
            fromOfficeId: 'office-buyer',
            fromUserId: 'user-buyer',
            message: '공동중개 가능할까요?',
          },
        }),
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          officeId: 'office-sharer',
          userIds: ['user-sharer'],
          type: 'network_inquiry',
        }),
      );
      // 문의자(타사무소) 기준 마스킹 — showMemo=false라 memo 제거
      expect(result.sharedProperty.isMine).toBe(false);
      expect('memo' in result.sharedProperty.listing).toBe(false);
    });

    it('자기 사무소가 공유한 매물에는 문의할 수 없다', async () => {
      const { prisma, service } = createService();
      prisma.networkSharedProperty.findFirst.mockResolvedValue({
        id: 'shared-1',
        roomId: 'room-1',
        officeId: 'office-sharer',
        sharedBy: 'user-sharer',
        isActive: true,
      });

      await expect(
        service.create('shared-1', 'office-sharer', 'user-x', {}),
      ).rejects.toThrow('자기 사무소가 공유한 매물에는 문의할 수 없습니다');
      expect(prisma.networkInquiry.create).not.toHaveBeenCalled();
    });

    it('회수된(isActive=false) 공유 매물은 문의할 수 없다', async () => {
      const { prisma, service } = createService();
      prisma.networkSharedProperty.findFirst.mockResolvedValue({
        id: 'shared-1',
        roomId: 'room-1',
        officeId: 'office-sharer',
        sharedBy: 'user-sharer',
        isActive: false,
      });

      await expect(
        service.create('shared-1', 'office-buyer', 'user-buyer', {}),
      ).rejects.toThrow('공유 매물을 찾을 수 없습니다');
    });

    it('방 멤버가 아니면 문의할 수 없다', async () => {
      const { prisma, rooms, service } = createService();
      prisma.networkSharedProperty.findFirst.mockResolvedValue({
        id: 'shared-1',
        roomId: 'room-1',
        officeId: 'office-sharer',
        sharedBy: 'user-sharer',
        isActive: true,
      });
      rooms.assertApprovedMember.mockRejectedValue(
        new Error('중개방 멤버만 접근할 수 있습니다'),
      );

      await expect(
        service.create('shared-1', 'office-stranger', 'user-x', {}),
      ).rejects.toThrow('중개방 멤버만 접근할 수 있습니다');
    });
  });

  describe('respond (상태 전이)', () => {
    function mockPendingInquiry(
      prisma: ReturnType<typeof createService>['prisma'],
      overrides: Record<string, unknown> = {},
    ) {
      prisma.networkInquiry.findFirst.mockResolvedValue({
        id: 'inquiry-1',
        status: 'pending',
        fromOfficeId: 'office-buyer',
        fromUserId: 'user-buyer',
        sharedProperty: { id: 'shared-1', officeId: 'office-sharer' },
        ...overrides,
      });
    }

    it('공유자 사무소가 accepted로 전이하면 respondedAt이 기록되고 문의자에게 알림이 간다', async () => {
      const { prisma, notifications, service } = createService();
      mockPendingInquiry(prisma);
      prisma.networkInquiry.update.mockResolvedValue({
        id: 'inquiry-1',
        status: 'accepted',
        sharedProperty: buildSharedPropertyRecord(),
        fromOffice: { id: 'office-buyer', name: '송파중개' },
        fromUser: { id: 'user-buyer', name: '박중개' },
      });

      const result = await service.respond('inquiry-1', 'office-sharer', {
        status: 'accepted',
        response: '네 가능합니다',
      });

      expect(prisma.networkInquiry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inquiry-1' },
          data: {
            status: 'accepted',
            response: '네 가능합니다',
            respondedAt: expect.any(Date),
          },
        }),
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          officeId: 'office-buyer',
          userIds: ['user-buyer'],
          type: 'network_inquiry_response',
          title: '매물 문의가 수락되었습니다',
        }),
      );
      // 공유자 본인 기준 직렬화 — 마스킹 미적용
      expect(result.sharedProperty.isMine).toBe(true);
    });

    it('수신 사무소(공유자)가 아니면 응답할 수 없다', async () => {
      const { prisma, service } = createService();
      mockPendingInquiry(prisma);

      await expect(
        service.respond('inquiry-1', 'office-other', { status: 'accepted' }),
      ).rejects.toThrow('공유한 사무소만 문의에 응답할 수 있습니다');
      expect(prisma.networkInquiry.update).not.toHaveBeenCalled();
    });

    it('pending이 아닌 문의는 다시 응답할 수 없다', async () => {
      const { prisma, service } = createService();
      mockPendingInquiry(prisma, { status: 'accepted' });

      await expect(
        service.respond('inquiry-1', 'office-sharer', { status: 'rejected' }),
      ).rejects.toThrow('대기 중인 문의만 응답할 수 있습니다');
    });

    it('accepted/rejected 외 status는 거부한다', async () => {
      const { prisma, service } = createService();

      await expect(
        service.respond('inquiry-1', 'office-sharer', { status: 'expired' }),
      ).rejects.toThrow('status는 accepted 또는 rejected여야 합니다');
      expect(prisma.networkInquiry.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('scope=sent는 내 사무소가 보낸 문의만 조회한다', async () => {
      const { prisma, service } = createService();
      prisma.networkInquiry.findMany.mockResolvedValue([]);

      await service.list('office-1', { scope: 'sent' });

      expect(prisma.networkInquiry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { fromOfficeId: 'office-1' },
        }),
      );
    });

    it('scope=received는 내 사무소가 공유한 매물의 문의만 조회한다', async () => {
      const { prisma, service } = createService();
      prisma.networkInquiry.findMany.mockResolvedValue([]);

      await service.list('office-1', { scope: 'received', status: 'pending' });

      expect(prisma.networkInquiry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sharedProperty: { officeId: 'office-1' }, status: 'pending' },
        }),
      );
    });
  });
});
