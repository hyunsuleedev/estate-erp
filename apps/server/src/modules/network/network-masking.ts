import { Prisma } from '@prisma/client';

/**
 * 공유 매물 직렬화에 필요한 include.
 *
 * 보안 핵심: Listing은 select 화이트리스트로만 읽는다.
 * privateMemo·loanAmount는 select에 아예 포함되지 않으므로
 * 어떤 직렬화 경로로도 응답에 실릴 수 없다 (allowlist by construction).
 */
export const sharedPropertyInclude = {
  sharedByUser: { select: { id: true, name: true } },
  office: { select: { id: true, name: true } },
  listing: {
    select: {
      id: true,
      transactionType: true,
      checkStatus: true,
      price: true,
      deposit: true,
      monthlyRent: true,
      memo: true,
      property: {
        select: {
          site: {
            select: {
              name: true,
              type: true,
              ward: {
                select: {
                  name: true,
                  district: { select: { name: true } },
                },
              },
            },
          },
          unit: {
            select: {
              name: true,
              floor: true,
              exclusiveAreaM2: true,
              supplyAreaM2: true,
              dong: { select: { name: true, isPlaceholder: true } },
              siteUnitType: {
                select: {
                  name: true,
                  exclusiveAreaM2: true,
                  supplyAreaM2: true,
                },
              },
            },
          },
          photos: {
            select: { fileUrl: true },
            orderBy: { sortOrder: 'asc' as const },
          },
        },
      },
    },
  },
} satisfies Prisma.NetworkSharedPropertyInclude;

export type SharedPropertyWithRelations = Prisma.NetworkSharedPropertyGetPayload<{
  include: typeof sharedPropertyInclude;
}>;

const SITE_TYPE_LABELS: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독주택',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박시설',
};

/** 마스킹이 적용된 매물 정보. show* 플래그가 꺼진 필드는 키 자체가 빠진다. */
export interface MaskedListingView {
  id: string;
  transactionType: string;
  checkStatus: string;
  siteType: string;
  /** 단지명 비공개 시 대체 텍스트 ("강동구 아파트") — 항상 제공 */
  regionLabel: string;
  siteName?: string;
  dongName?: string | null;
  unitName?: string | null;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  exclusiveAreaM2?: number | null;
  supplyAreaM2?: number | null;
  unitTypeName?: string | null;
  floor?: number | null;
  memo?: string | null;
  photoUrls?: string[];
}

export interface NetworkSharedPropertyView {
  id: string;
  roomId: string;
  listingId: string;
  officeId: string;
  sharedBy: string;
  showSiteName: boolean;
  showDong: boolean;
  showUnit: boolean;
  showPrice: boolean;
  showArea: boolean;
  showFloor: boolean;
  showMemo: boolean;
  showPhotos: boolean;
  contactName: string | null;
  contactPhone: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** viewer 사무소가 공유자 본인인지 — true면 마스킹 미적용 */
  isMine: boolean;
  sharedByUser: { id: string; name: string } | null;
  office: { id: string; name: string } | null;
  listing: MaskedListingView;
}

function toNumberOrNull(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'number' ? value : Number(value);
}

/**
 * 공유 매물 마스킹 직렬화.
 *
 * - viewer 사무소가 공유자 본인이면 show* 플래그와 무관하게 전체 공개
 * - 타 사무소 viewer는 show* 플래그가 꺼진 필드를 응답에서 제거
 * - viewerOfficeId가 null이면 항상 타사무소 기준(최대 마스킹)으로 직렬화
 *   (realtime broadcast처럼 수신자가 섞여 있는 경우)
 */
export function serializeSharedProperty(
  record: SharedPropertyWithRelations,
  viewerOfficeId: string | null,
): NetworkSharedPropertyView {
  const isMine = viewerOfficeId !== null && record.officeId === viewerOfficeId;
  const listing = record.listing;
  const property = listing.property;
  const site = property.site;
  const unit = property.unit;

  const districtName = site.ward?.district?.name ?? site.ward?.name ?? null;
  const typeLabel = SITE_TYPE_LABELS[site.type] ?? '부동산';
  const regionLabel = districtName ? `${districtName} ${typeLabel}` : typeLabel;

  const maskedListing: MaskedListingView = {
    id: listing.id,
    transactionType: listing.transactionType,
    checkStatus: listing.checkStatus,
    siteType: site.type,
    regionLabel,
  };

  if (isMine || record.showSiteName) {
    maskedListing.siteName = site.name;
  }

  if (isMine || record.showDong) {
    maskedListing.dongName =
      unit?.dong && !unit.dong.isPlaceholder ? unit.dong.name : null;
  }

  if (isMine || record.showUnit) {
    maskedListing.unitName = unit?.name ?? null;
  }

  if (isMine || record.showPrice) {
    maskedListing.price = listing.price;
    maskedListing.deposit = listing.deposit;
    maskedListing.monthlyRent = listing.monthlyRent;
  }

  if (isMine || record.showArea) {
    maskedListing.exclusiveAreaM2 = toNumberOrNull(
      unit?.siteUnitType?.exclusiveAreaM2 ?? unit?.exclusiveAreaM2,
    );
    maskedListing.supplyAreaM2 = toNumberOrNull(
      unit?.siteUnitType?.supplyAreaM2 ?? unit?.supplyAreaM2,
    );
    maskedListing.unitTypeName = unit?.siteUnitType?.name ?? null;
  }

  if (isMine || record.showFloor) {
    maskedListing.floor = unit?.floor ?? null;
  }

  if (isMine || record.showMemo) {
    maskedListing.memo = listing.memo;
  }

  if (isMine || record.showPhotos) {
    maskedListing.photoUrls = property.photos.map((photo) => photo.fileUrl);
  }

  return {
    id: record.id,
    roomId: record.roomId,
    listingId: record.listingId,
    officeId: record.officeId,
    sharedBy: record.sharedBy,
    showSiteName: record.showSiteName,
    showDong: record.showDong,
    showUnit: record.showUnit,
    showPrice: record.showPrice,
    showArea: record.showArea,
    showFloor: record.showFloor,
    showMemo: record.showMemo,
    showPhotos: record.showPhotos,
    contactName: record.contactName,
    contactPhone: record.contactPhone,
    description: record.description,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isMine,
    sharedByUser: record.sharedByUser
      ? { id: record.sharedByUser.id, name: record.sharedByUser.name }
      : null,
    office: record.office
      ? { id: record.office.id, name: record.office.name }
      : null,
    listing: maskedListing,
  };
}
