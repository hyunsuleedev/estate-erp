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
    if (!listing) throw new NotFoundException("Listing not found");
    if (propertyId && propertyId !== listing.propertyId) {
      throw new BadRequestException(
        "listingId and propertyId point at different properties",
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
    if (!property) throw new NotFoundException("Property not found");
    if (siteId && siteId !== property.siteId) {
      throw new BadRequestException(
        "propertyId and siteId point at different sites",
      );
    }
    siteId = property.siteId;
  } else if (siteId) {
    const site = await db.site.findFirst({
      where: { id: siteId, OR: [{ isPublic: true }, { officeId }] },
      select: { id: true },
    });
    if (!site) throw new NotFoundException("Site not found");
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
      "transactionType must be sale, jeonse, or monthly",
    );
  }
  if (
    fields.floorExposure != null &&
    !ADVERTISEMENT_FLOOR_EXPOSURES.has(fields.floorExposure)
  ) {
    throw new BadRequestException("floorExposure must be exact or band");
  }
  if (
    fields.rawAreaM2 != null &&
    (!Number.isFinite(fields.rawAreaM2) || fields.rawAreaM2 <= 0)
  ) {
    throw new BadRequestException("rawAreaM2 must be a positive number");
  }
}
