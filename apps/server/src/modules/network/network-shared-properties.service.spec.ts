import { NetworkSharedPropertiesService } from './network-shared-properties.service';
import type { SharedPropertyWithRelations } from './network-masking';

function buildRecord(
  overrides: Record<string, unknown> = {},
): SharedPropertyWithRelations {
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
    contactName: '김중개',
    contactPhone: '010-1234-5678',
    description: '급매',
    isActive: true,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    sharedByUser: { id: 'user-sharer', name: '김중개' },
    office: { id: 'office-sharer', name: '강동중개' },
    listing: {
      id: 'listing-1',
      transactionType: 'sale',
      isPaused: false,
      intake: {
        lifecycleStatus: 'open',
        lifecycleChangedAt: new Date('2026-06-01T00:00:00.000Z'),
        lifecycleChangedBy: 'user',
        closedReason: null,
        lastCheckedAt: new Date('2026-06-01T00:00:00.000Z'),
        lastVerifiedAt: new Date('2026-06-01T00:00:00.000Z'),
        lastCheckResult: 'alive',
        nextConfirmAt: null,
      },
      deals: [],
      price: 158000,
      deposit: null,
      monthlyRent: null,
      memo: '집주인 급매 요청',
      property: {
        site: {
          name: '래미안고덕',
          type: 'apartment',
          ward: { name: '고덕동', district: { name: '강동구' } },
        },
        unit: {
          name: '1503호',
          floor: 15,
          exclusiveAreaM2: null,
          supplyAreaM2: null,
          dong: { name: '101', isPlaceholder: false },
          siteUnitType: {
            name: '84A',
            exclusiveAreaM2: 84.92 as never,
            supplyAreaM2: 112.4 as never,
          },
        },
        photos: [{ fileUrl: 'https://cdn.example.com/p1.jpg' }],
      },
    },
    ...overrides,
  } as SharedPropertyWithRelations;
}

function createService() {
  const prisma = {
    listing: {
      findFirst: jest.fn(),
    },
    networkSharedProperty: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const rooms = {
    assertApprovedMember: jest.fn().mockResolvedValue({ id: 'member-1' }),
  };

  return {
    prisma,
    rooms,
    service: new NetworkSharedPropertiesService(
      prisma as never,
      rooms as never,
    ),
  };
}

describe('NetworkSharedPropertiesService', () => {
  describe('share', () => {
    it('approved 멤버 + 내 사무소 매물만 공유 가능, 기본 마스킹 플래그가 적용된다', async () => {
      const { prisma, rooms, service } = createService();
      prisma.listing.findFirst.mockResolvedValue({ id: 'listing-1' });
      prisma.networkSharedProperty.findFirst.mockResolvedValue(null);
      prisma.networkSharedProperty.create.mockResolvedValue(buildRecord());

      const result = await service.share('room-1', 'office-sharer', 'user-sharer', {
        listingId: 'listing-1',
        description: '급매',
      });

      expect(rooms.assertApprovedMember).toHaveBeenCalledWith(
        'room-1',
        'office-sharer',
      );
      expect(prisma.listing.findFirst).toHaveBeenCalledWith({
        where: { id: 'listing-1', officeId: 'office-sharer' },
        select: { id: true },
      });
      const createArgs = prisma.networkSharedProperty.create.mock.calls[0][0];
      expect(createArgs.data).toMatchObject({
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
      });
      expect(result.isMine).toBe(true);
    });

    it('내 사무소 매물이 아니면 NotFound', async () => {
      const { prisma, service } = createService();
      prisma.listing.findFirst.mockResolvedValue(null);

      await expect(
        service.share('room-1', 'office-1', 'user-1', { listingId: 'listing-x' }),
      ).rejects.toThrow('매물을 찾을 수 없습니다');
    });

    it('같은 방에 이미 활성 공유가 있으면 Conflict', async () => {
      const { prisma, service } = createService();
      prisma.listing.findFirst.mockResolvedValue({ id: 'listing-1' });
      prisma.networkSharedProperty.findFirst.mockResolvedValue({
        id: 'shared-1',
        officeId: 'office-sharer',
        isActive: true,
      });

      await expect(
        service.share('room-1', 'office-sharer', 'user-1', {
          listingId: 'listing-1',
        }),
      ).rejects.toThrow('이미 이 중개방에 공유된 매물입니다');
    });

    it('회수했던 공유는 재활성화한다', async () => {
      const { prisma, service } = createService();
      prisma.listing.findFirst.mockResolvedValue({ id: 'listing-1' });
      prisma.networkSharedProperty.findFirst.mockResolvedValue({
        id: 'shared-1',
        officeId: 'office-sharer',
        isActive: false,
      });
      prisma.networkSharedProperty.update.mockResolvedValue(buildRecord());

      await service.share('room-1', 'office-sharer', 'user-sharer', {
        listingId: 'listing-1',
        showMemo: true,
      });

      expect(prisma.networkSharedProperty.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'shared-1' },
          data: expect.objectContaining({ isActive: true, showMemo: true }),
        }),
      );
      expect(prisma.networkSharedProperty.create).not.toHaveBeenCalled();
    });
  });

  describe('listByRoom (마스킹 직렬화)', () => {
    it('공유자에게는 전체, 타사무소 viewer에게는 마스킹된 응답을 준다', async () => {
      const { prisma, service } = createService();
      prisma.networkSharedProperty.findMany.mockResolvedValue([buildRecord()]);

      const [mine] = await service.listByRoom('room-1', 'office-sharer');
      const [other] = await service.listByRoom('room-1', 'office-viewer');

      // 공유자 — showMemo/showPhotos가 꺼져 있어도 전부 보임
      expect(mine.isMine).toBe(true);
      expect(mine.listing.memo).toBe('집주인 급매 요청');
      expect(mine.listing.unitName).toBe('1503호');
      expect(mine.listing.photoUrls).toEqual(['https://cdn.example.com/p1.jpg']);

      // 타사무소 — 꺼진 플래그 필드는 응답에서 제거
      expect(other.isMine).toBe(false);
      expect('memo' in other.listing).toBe(false);
      expect('unitName' in other.listing).toBe(false);
      expect('dongName' in other.listing).toBe(false);
      expect('floor' in other.listing).toBe(false);
      expect('photoUrls' in other.listing).toBe(false);
      // 켜진 플래그 필드는 보임
      expect(other.listing.siteName).toBe('래미안고덕');
      expect(other.listing.price).toBe(158000);
    });

    it('멤버가 아니면 목록 조회가 거부된다', async () => {
      const { rooms, service } = createService();
      rooms.assertApprovedMember.mockRejectedValue(
        new Error('중개방 멤버만 접근할 수 있습니다'),
      );

      await expect(
        service.listByRoom('room-1', 'office-stranger'),
      ).rejects.toThrow('중개방 멤버만 접근할 수 있습니다');
    });
  });

  describe('update / deactivate (공유자 전용)', () => {
    it('타사무소는 공유 설정을 수정할 수 없다', async () => {
      const { prisma, service } = createService();
      prisma.networkSharedProperty.findFirst.mockResolvedValue({
        id: 'shared-1',
        officeId: 'office-sharer',
      });

      await expect(
        service.update('shared-1', 'office-other', { showPrice: false }),
      ).rejects.toThrow('공유한 사무소만 수정할 수 있습니다');
      expect(prisma.networkSharedProperty.update).not.toHaveBeenCalled();
    });

    it('DELETE는 hard delete 대신 isActive=false 처리한다', async () => {
      const { prisma, service } = createService();
      prisma.networkSharedProperty.findFirst.mockResolvedValue({
        id: 'shared-1',
        officeId: 'office-sharer',
      });
      prisma.networkSharedProperty.update.mockResolvedValue(
        buildRecord({ isActive: false }),
      );

      const result = await service.deactivate('shared-1', 'office-sharer');

      expect(prisma.networkSharedProperty.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'shared-1' },
          data: { isActive: false },
        }),
      );
      expect(result.isActive).toBe(false);
    });
  });
});
