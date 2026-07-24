import {
  serializeSharedProperty,
  type SharedPropertyWithRelations,
} from './network-masking';

function buildRecord(
  overrides: Partial<SharedPropertyWithRelations> = {},
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
    office: { id: 'office-sharer', name: '강동중개사무소' },
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

describe('serializeSharedProperty (마스킹 직렬화)', () => {
  it('공유자 본인은 show* 플래그와 무관하게 전체 필드를 본다', () => {
    const record = buildRecord({
      showSiteName: false,
      showDong: false,
      showUnit: false,
      showPrice: false,
      showArea: false,
      showFloor: false,
      showMemo: false,
      showPhotos: false,
    });

    const view = serializeSharedProperty(record, 'office-sharer');

    expect(view.isMine).toBe(true);
    expect(view.listing.siteName).toBe('래미안고덕');
    expect(view.listing.dongName).toBe('101');
    expect(view.listing.unitName).toBe('1503호');
    expect(view.listing.price).toBe(158000);
    expect(view.listing.exclusiveAreaM2).toBe(84.92);
    expect(view.listing.floor).toBe(15);
    expect(view.listing.memo).toBe('집주인 급매 요청');
    expect(view.listing.photoUrls).toEqual(['https://cdn.example.com/p1.jpg']);
    expect(view.listing.availability).toBe('available');
  });

  it('가용 상태는 완료 Deal을 의뢰 생명주기나 일시중지보다 우선한다', () => {
    const record = buildRecord();
    record.listing.isPaused = true;
    record.listing.intake.lifecycleStatus = 'closed';
    record.listing.deals = [{ stage: 'completed' }];

    const view = serializeSharedProperty(record, 'office-sharer');

    expect(view.listing.availability).toBe('completed');
  });

  it('타사무소 viewer는 꺼진 show* 플래그의 필드가 응답에서 제거된다', () => {
    const record = buildRecord(); // dong/unit/floor/memo/photos 비공개 (기본값)

    const view = serializeSharedProperty(record, 'office-viewer');

    expect(view.isMine).toBe(false);
    // 공개 플래그가 켜진 필드는 보인다
    expect(view.listing.siteName).toBe('래미안고덕');
    expect(view.listing.price).toBe(158000);
    expect(view.listing.exclusiveAreaM2).toBe(84.92);
    // 꺼진 필드는 키 자체가 없다
    expect('dongName' in view.listing).toBe(false);
    expect('unitName' in view.listing).toBe(false);
    expect('floor' in view.listing).toBe(false);
    expect('memo' in view.listing).toBe(false);
    expect('photoUrls' in view.listing).toBe(false);
  });

  it('showPrice=false면 price/deposit/monthlyRent가 모두 제거된다', () => {
    const record = buildRecord({ showPrice: false });

    const view = serializeSharedProperty(record, 'office-viewer');

    expect('price' in view.listing).toBe(false);
    expect('deposit' in view.listing).toBe(false);
    expect('monthlyRent' in view.listing).toBe(false);
  });

  it('showSiteName=false면 단지명 대신 지역 대체 텍스트만 제공한다', () => {
    const record = buildRecord({ showSiteName: false });

    const view = serializeSharedProperty(record, 'office-viewer');

    expect('siteName' in view.listing).toBe(false);
    expect(view.listing.regionLabel).toBe('강동구 아파트');
  });

  it('placeholder Dong은 showDong=true여도 동명을 노출하지 않는다', () => {
    const record = buildRecord({ showDong: true });
    record.listing.property.unit!.dong = { name: '-', isPlaceholder: true };

    const view = serializeSharedProperty(record, 'office-viewer');

    expect(view.listing.dongName).toBeNull();
  });

  it('privateMemo·loanAmount는 어떤 viewer에게도 절대 포함되지 않는다', () => {
    // 직렬화 입력에 실수로 민감 필드가 섞여 들어와도 allowlist 직렬화라 통과 불가
    const record = buildRecord();
    (record.listing as Record<string, unknown>).privateMemo = '집주인 이혼소송 중';
    (record.listing as Record<string, unknown>).loanAmount = 50000;

    const mineView = serializeSharedProperty(record, 'office-sharer');
    const otherView = serializeSharedProperty(record, 'office-viewer');

    for (const view of [mineView, otherView]) {
      const json = JSON.stringify(view);
      expect(json).not.toContain('privateMemo');
      expect(json).not.toContain('loanAmount');
      expect(json).not.toContain('이혼소송');
    }
  });

  it('viewerOfficeId=null(broadcast)이면 항상 최대 마스킹으로 직렬화한다', () => {
    const record = buildRecord();

    const view = serializeSharedProperty(record, null);

    expect(view.isMine).toBe(false);
    expect('memo' in view.listing).toBe(false);
    expect('unitName' in view.listing).toBe(false);
  });

  it('Decimal 면적은 숫자로 변환하고 SiteUnitType 면적을 우선한다', () => {
    const record = buildRecord();
    record.listing.property.unit!.siteUnitType = null;
    (record.listing.property.unit as Record<string, unknown>).exclusiveAreaM2 =
      '59.95'; // Prisma Decimal 직렬화 형태

    const view = serializeSharedProperty(record, 'office-viewer');

    expect(view.listing.exclusiveAreaM2).toBe(59.95);
    expect(view.listing.unitTypeName).toBeNull();
  });
});
