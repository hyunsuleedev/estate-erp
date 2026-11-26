import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { getPrimaryPhone } from '../contacts/contact-phone.utils';
import { LISTING_INTAKE_STATE_SELECT, OCCUPYING_DEALS_SELECT } from '../listings/listing-state';

/** 단계 이름이 바뀌기 전의 값으로 저장된 매칭도 함께 찾는다 */
export function getMatchStageStorageValues(stage: string): string[] {
  const normalizedStage = normalizeMatchStage(stage);
  if (normalizedStage === MatchStage.BUYER_INTERESTED) {
    return [MatchStage.BUYER_INTERESTED, 'buyerContacted'];
  }
  if (normalizedStage === MatchStage.VIEWING_CONFIRMED) {
    return [MatchStage.VIEWING_CONFIRMED, 'ownerContacted'];
  }
  return [normalizedStage];
}

/**
 * 매칭의 가벼운 줄: 매칭 자체(단계 · 메모 · 합의 조건)와 집 쪽 정보. 손님 쪽은 싣지 않는다 —
 * 손님 목록의 줄 안에 실리거나(희망매물), 부르는 쪽이 이미 손님을 알고 있다.
 * 상세와 같은 include를 쓰던 때에는 매칭 한 건에 손님 조건 전체와 같은 집이 두 번, 단지가 통째로 붙어 13KB였다.
 * 손님의 희망 지역 · 당사자 목록과 단지의 나머지 칸은 매칭 상세(GET /matches/:id)에 있다.
 */
export const MATCH_ROW_SELECT = {
  id: true,
  officeId: true,
  listingId: true,
  buyerReqId: true,
  stage: true,
  closedFromStage: true,
  closedReason: true,
  closedByDealId: true,
  memo: true,
  agreedPrice: true,
  agreedDeposit: true,
  agreedMonthlyRent: true,
  agreedMoveInDate: true,
  createdAt: true,
  updatedAt: true,
  listing: {
    select: {
      id: true,
      propertyId: true,
      intakeId: true,
      transactionType: true,
      price: true,
      deposit: true,
      monthlyRent: true,
      isPaused: true,
      moveInAvailableFrom: true,
      moveInAvailableTo: true,
      intake: {
        select: {
          ...LISTING_INTAKE_STATE_SELECT,
          // 같은 의뢰의 다른 거래 조건이 거래 중이면 이 매칭은 거래로 넘길 수 없다(화면이 미리 보인다)
          listings: { select: { id: true, transactionType: true, deals: OCCUPYING_DEALS_SELECT } },
        },
      },
      deals: OCCUPYING_DEALS_SELECT,
      property: {
        select: {
          id: true,
          siteId: true,
          unitId: true,
          site: { select: { id: true, name: true, type: true, roadAddress: true, jibunAddress: true } },
          unit: {
            select: {
              id: true,
              name: true,
              floor: true,
              floorEnd: true,
              floorLabel: true,
              exclusiveAreaM2: true,
              supplyAreaM2: true,
              dong: { select: { id: true, name: true, isPlaceholder: true } },
              // 호에 면적을 적지 않았으면 평형의 면적을 쓴다
              siteUnitType: {
                select: { id: true, name: true, exclusiveAreaM2: true, supplyAreaM2: true },
              },
            },
          },
          propertyContacts: {
            where: { status: 'active' },
            select: {
              id: true,
              role: true,
              isPrimary: true,
              contactId: true,
              contact: {
                select: {
                  id: true,
                  name: true,
                  phones: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
                },
              },
            },
            orderBy: { isPrimary: 'desc' },
          },
        },
      },
    },
  },
  calendarEvents: {
    where: { type: 'viewing' },
    orderBy: { start: 'asc' },
  },
  deals: {
    select: { id: true, stage: true, isCancelled: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.MatchSelect;

type MatchRow = Prisma.MatchGetPayload<{ select: typeof MATCH_ROW_SELECT }>;

/** 단계 값을 지금 이름으로 맞추고, 관련인의 번호는 대표 번호 하나로 싣는다 */
export function presentMatchRow(match: MatchRow) {
  const property = match.listing.property;
  return {
    ...match,
    stage: normalizeMatchStage(match.stage),
    propertyId: property.id,
    listing: {
      ...match.listing,
      property: {
        ...property,
        propertyContacts: property.propertyContacts.map(({ contact, ...link }) => ({
          ...link,
          contact: { id: contact.id, name: contact.name, phone: getPrimaryPhone(contact) },
        })),
      },
    },
  };
}
