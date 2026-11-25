import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/**
 * 광고가 우리 데이터의 어디까지 연결됐는지. 아래 단계가 채워지면 위 단계도 채워진다.
 *   site      건물(대지)까지
 *   property  우리 사무소의 관리 공간까지
 *   listing   어느 의뢰의 광고인지까지
 */
export interface AdvertisementLink {
  listingId: string | null;
  propertyId: string | null;
  siteId: string | null;
  /** 매물까지 연결되면 그 매물의 거래유형 */
  transactionType: string | null;
}

export type AdvertisementLinkLevel = "listing" | "property" | "site" | "none";

export function getAdvertisementLinkLevel(link: {
  listingId?: string | null;
  propertyId?: string | null;
  siteId?: string | null;
}): AdvertisementLinkLevel {
  if (link.listingId) return "listing";
  if (link.propertyId) return "property";
  if (link.siteId) return "site";
  return "none";
}

type Db = Pick<Prisma.TransactionClient, "listing" | "property" | "site">;

/**
 * 받은 연결(매물 · 관리 공간 · 건물 중 아는 만큼)을 확인하고 위 단계를 채워 돌려준다.
 * - 매물을 주면 그 매물의 관리 공간과 건물을 따라간다.
 * - 관리 공간을 주면 건물을 따라간다.
 * - 함께 준 값이 서로 어긋나면(그 매물이 그 관리 공간의 것이 아님) 거절한다. 조용히 한쪽을 고르지 않는다.
 * - 건물은 공공이거나 이 사무소의 것이어야 한다.
 */
export async function resolveAdvertisementLink(
  db: Db,
  officeId: string,
  input: {
    listingId?: string | null;
    propertyId?: string | null;
    siteId?: string | null;
  },
): Promise<AdvertisementLink> {
  const listingId = input.listingId?.trim() || null;
  let propertyId = input.propertyId?.trim() || null;
  let siteId = input.siteId?.trim() || null;
  let transactionType: string | null = null;

  if (listingId) {
    const listing = await db.listing.findFirst({
      where: { id: listingId, officeId },
      select: { id: true, propertyId: true, transactionType: true },
    });
    if (!listing) throw new NotFoundException("선택한 매물을 찾을 수 없습니다. 매물이 삭제되었는지 확인해 주세요.");
    if (propertyId && propertyId !== listing.propertyId) {
      throw new BadRequestException(
        "고른 매물과 관리 공간이 서로 다른 집입니다. 매물을 다시 골라 주세요.",
      );
    }
    propertyId = listing.propertyId;
    transactionType = listing.transactionType;
  }

  if (propertyId) {
    const property = await db.property.findFirst({
      where: { id: propertyId, officeId },
      select: { id: true, siteId: true },
    });
    if (!property) throw new NotFoundException("관리 공간을 찾을 수 없습니다. 삭제되었는지 확인해 주세요.");
    if (siteId && siteId !== property.siteId) {
      throw new BadRequestException(
        "고른 관리 공간과 단지가 서로 다릅니다. 다시 골라 주세요.",
      );
    }
    siteId = property.siteId;
  } else if (siteId) {
    const site = await db.site.findFirst({
      where: { id: siteId, OR: [{ isPublic: true }, { officeId }] },
      select: { id: true },
    });
    if (!site) throw new NotFoundException("단지를 찾을 수 없습니다.");
  }

  return { listingId, propertyId, siteId, transactionType };
}

/** CP에 적힌 원문 — 연결과 상관없이 광고에 남긴다 */
export interface AdvertisementRawFields {
  transactionType?: string | null;
  rawJibunAddress?: string | null;
  rawRoadAddress?: string | null;
  rawSiteName?: string | null;
  rawDong?: string | null;
  rawHo?: string | null;
  rawFloorText?: string | null;
  rawAreaM2?: number | null;
  floorExposure?: string | null;
}

export const ADVERTISEMENT_TRANSACTION_TYPES: ReadonlySet<string> = new Set([
  "sale",
  "jeonse",
  "monthly",
]);
export const ADVERTISEMENT_FLOOR_EXPOSURES: ReadonlySet<string> = new Set([
  "exact",
  "band",
]);

export function assertValidAdvertisementRawFields(fields: AdvertisementRawFields) {
  if (
    fields.transactionType != null &&
    !ADVERTISEMENT_TRANSACTION_TYPES.has(fields.transactionType)
  ) {
    throw new BadRequestException(
      "거래유형은 매매·전세·월세 중 하나여야 합니다.",
    );
  }
  if (
    fields.floorExposure != null &&
    !ADVERTISEMENT_FLOOR_EXPOSURES.has(fields.floorExposure)
  ) {
    throw new BadRequestException("층 노출은 ‘정확한 층 공개’ 또는 ‘구간만 공개’ 중 하나여야 합니다.");
  }
  if (
    fields.rawAreaM2 != null &&
    (!Number.isFinite(fields.rawAreaM2) || fields.rawAreaM2 <= 0)
  ) {
    throw new BadRequestException("면적은 0보다 큰 수여야 합니다.");
  }
}
