import { ListingAdvertisementStatus } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';

/** 매물 목록에서 사용하는 현재 광고의 단일 조회 조건. */
export const ACTIVE_LISTING_ADVERTISEMENT_WHERE = {
  status: ListingAdvertisementStatus.ACTIVE,
} satisfies Prisma.ListingAdvertisementWhereInput;

/**
 * Prisma 내부 관계명 `advertisements`를 목록 API의 현재 광고 필드로 변환한다.
 * 상세 API는 이 변환을 거치지 않으므로 `advertisements` 전체를 이력으로 유지한다.
 */
export function withActiveAdvertisementSummary(
  listing: Record<string, unknown>,
) {
  const {
    advertisements,
    _count: rawCount,
    ...rest
  } = listing;
  const activeAdvertisements = Array.isArray(advertisements)
    ? advertisements
    : [];
  const counts =
    rawCount && typeof rawCount === 'object'
      ? (rawCount as Record<string, unknown>)
      : null;
  const {
    advertisements: countedAdvertisements,
    ...publicCounts
  } = counts ?? {};

  return {
    ...rest,
    activeAdvertisements,
    activeAdvertisementCount:
      typeof countedAdvertisements === 'number'
        ? countedAdvertisements
        : activeAdvertisements.length,
    ...(counts ? { _count: publicCounts } : {}),
  };
}
