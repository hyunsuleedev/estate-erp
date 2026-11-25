import { ConflictException } from "@nestjs/common";
import { Prisma, type ListingAdvertisement } from "@prisma/client";

/**
 * 광고 한 줄 = 한 광고. 같은 광고인지 가르는 열쇠와, 그 줄의 지나간 상태를 쌓는 일.
 *
 *   매물이 있으면          사무소 + 매물 + 채널 + CP계정(cpAccountId ?? null)
 *   매물 없이 호실까지면   사무소 + 관리 공간 + 채널 + 거래유형 + CP계정(cpAccountId ?? null)
 *   그 밖에는              열쇠가 없다 — 같은 채널 · 계정의 CP 광고 번호가 같을 때만 같은 광고다
 *
 * 재광고(네이버 번호가 바뀜)와 내려갔다 다시 올라온 것은 새 줄이 아니라 같은 줄의 변화다.
 * 열쇠는 추정이 아니다: 층 · 가격이 비슷하다는 이유로 같은 광고라고 보지 않는다.
 */

type Tx = Prisma.TransactionClient;

export interface AdvertisementIdentity {
  channel: string;
  cpAccountId?: string | null;
  externalAdId?: string | null;
  listingId?: string | null;
  propertyId?: string | null;
  transactionType?: string | null;
}

/** 열쇠로 찾는 조건. 열쇠가 없는 광고(건물까지만, 또는 연결 없음)는 null */
export function advertisementKeyWhere(
  officeId: string,
  identity: AdvertisementIdentity,
): Prisma.ListingAdvertisementWhereInput | null {
  const cpAccountId = identity.cpAccountId ?? null;
  if (identity.listingId) {
    return {
      officeId,
      listingId: identity.listingId,
      channel: identity.channel,
      cpAccountId,
    };
  }
  if (identity.propertyId && identity.transactionType) {
    return {
      officeId,
      listingId: null,
      propertyId: identity.propertyId,
      channel: identity.channel,
      transactionType: identity.transactionType,
      cpAccountId,
    };
  }
  return null;
}

/**
 * 이미 있는 같은 광고를 찾는다. 열쇠가 먼저이고, 열쇠가 없거나 못 찾으면 CP 광고 번호로 찾는다.
 * 열쇠로 찾은 줄과 CP 번호로 찾은 줄이 서로 다르면 둘 다 돌려준다 — 부르는 쪽이 합칠지 거절할지 정한다.
 *
 * 단, ended된 다른 매물의 광고가 과거에 썼던 externalAdId를 CP가 재사용하는 경우를 막기 위해
 * externalAdId 매칭은 active이거나 같은 집(또는 미연결) 행으로 제한한다.
 */
export async function findSameAdvertisement(
  tx: Tx,
  officeId: string,
  identity: AdvertisementIdentity,
  excludeId?: string,
): Promise<{
  byKey: ListingAdvertisement | null;
  byExternalAdId: ListingAdvertisement | null;
}> {
  const notSelf = excludeId ? { id: { not: excludeId } } : {};
  const keyWhere = advertisementKeyWhere(officeId, identity);
  const byKey = keyWhere
    ? await tx.listingAdvertisement.findFirst({
        where: { ...keyWhere, ...notSelf },
      })
    : null;
  const externalAdId = identity.externalAdId?.trim();
  const cpAccountFilter = identity.cpAccountId
    ? { OR: [{ cpAccountId: identity.cpAccountId }, { cpAccountId: null }] }
    : { cpAccountId: null };
  const samePlaceOrActive: Prisma.ListingAdvertisementWhereInput = identity.listingId
    ? { OR: [{ status: "active" }, { listingId: identity.listingId }, { listingId: null, propertyId: null }] }
    : identity.propertyId
      ? { OR: [{ status: "active" }, { propertyId: identity.propertyId }, { listingId: null, propertyId: null }] }
      : { OR: [{ status: "active" }, { listingId: null, propertyId: null }] };

  const byExternalAdId = externalAdId
    ? await tx.listingAdvertisement.findFirst({
        where: {
          officeId,
          channel: identity.channel,
          externalAdId,
          AND: [cpAccountFilter, samePlaceOrActive],
          ...notSelf,
        },
        // 같은 번호가 여러 줄에 남아 있으면 게재 중인 것, 계정 일치, 가장 최근에 본 것
        orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
      })
    : null;
  return { byKey, byExternalAdId };
}

type HistoryState = Pick<
  ListingAdvertisement,
  | "status"
  | "naverArticleNo"
  | "externalAdId"
  | "floorExposure"
  | "advertisedPrice"
  | "advertisedDeposit"
  | "advertisedMonthlyRent"
>;

/** 이력에 한 줄 남길 만큼 달라졌는가: 게재 상태 · 네이버 번호 · CP번호 · 층노출 · 가격 */
export function advertisementStateChanged(
  before: HistoryState,
  after: HistoryState,
): boolean {
  return (
    before.status !== after.status ||
    before.naverArticleNo !== after.naverArticleNo ||
    before.externalAdId !== after.externalAdId ||
    before.floorExposure !== after.floorExposure ||
    before.advertisedPrice !== after.advertisedPrice ||
    before.advertisedDeposit !== after.advertisedDeposit ||
    before.advertisedMonthlyRent !== after.advertisedMonthlyRent
  );
}

/** 바뀐 뒤의 광고 상태를 이력에 한 줄 쌓는다 */
export function recordAdvertisementHistory(
  tx: Tx,
  advertisement: HistoryState & { id: string; officeId: string },
  options: { observedAt: Date; source: string; snapshotSessionId?: string | null },
) {
  return tx.listingAdvertisementHistory.create({
    data: {
      officeId: advertisement.officeId,
      listingAdvertisementId: advertisement.id,
      snapshotSessionId: options.snapshotSessionId ?? null,
      status: advertisement.status,
      naverArticleNo: advertisement.naverArticleNo,
      externalAdId: advertisement.externalAdId,
      floorExposure: advertisement.floorExposure,
      advertisedPrice: advertisement.advertisedPrice,
      advertisedDeposit: advertisement.advertisedDeposit,
      advertisedMonthlyRent: advertisement.advertisedMonthlyRent,
      observedAt: options.observedAt,
      source: options.source,
    },
  });
}

/** 광고가 지금 어떤 상태인지를 말하는 칸. 합칠 때 "지금의 광고" 쪽 값을 남는 줄에 옮긴다 */
const CURRENT_STATE_FIELDS = [
  "cpAccountId",
  "status",
  "startedAt",
  "endedAt",
  "lastSeenAt",
  "advertisedPrice",
  "advertisedDeposit",
  "advertisedMonthlyRent",
  "floorExposure",
  "url",
  "externalAdId",
  "naverArticleNo",
  "naverUrl",
  "providerStatus",
  "providerStatusObservedAt",
  "lastCheckedAt",
  "lastSyncedAt",
  "manualEditedAt",
  "rawJibunAddress",
  "rawRoadAddress",
  "rawSiteName",
  "rawDong",
  "rawHo",
  "rawFloorText",
  "rawAreaM2",
] as const satisfies readonly (keyof ListingAdvertisement)[];

/** 둘 중 어느 줄이 "지금의 광고"인가: 게재 중인 쪽, 같으면 CP 번호가 있는 쪽, 그다음 더 최근에 본 쪽 */
function isMoreCurrent(a: ListingAdvertisement, b: ListingAdvertisement): boolean {
  const live = (ad: ListingAdvertisement) => Number(ad.status === "active");
  if (live(a) !== live(b)) return live(a) > live(b);
  const numbered = (ad: ListingAdvertisement) => Number(Boolean(ad.externalAdId));
  if (numbered(a) !== numbered(b)) return numbered(a) > numbered(b);
  return a.lastSeenAt > b.lastSeenAt;
}

const OPEN_REQUEST_STATUSES = ["requested", "in_progress", "executed"];

/**
 * 두 줄이 같은 광고였음이 드러났을 때 from을 into로 합치고, 합친 뒤의 into를 돌려준다
 * (연결 안 된 채 들어와 있던 광고를 매물에 이었더니 그 매물 · 채널 · 계정의 광고가 이미 있는 경우).
 */
export async function mergeAdvertisements(
  tx: Tx,
  from: ListingAdvertisement,
  into: ListingAdvertisement,
): Promise<ListingAdvertisement> {
  if (from.id === into.id) return into;
  if (
    from.status === "active" &&
    into.status === "active" &&
    from.externalAdId &&
    into.externalAdId &&
    from.externalAdId !== into.externalAdId
  ) {
    throw new ConflictException(
      "같은 매물이 같은 채널·계정에 두 번 게재 중입니다. 하나를 내린 뒤 다시 연결해 주세요.",
    );
  }
  const fromIsCurrent = isMoreCurrent(from, into);

  // 두 광고 모두 열린 요청이 있으면 부분 유니크 인덱스에 걸리므로 병합을 막는다.
  const [fromOpenReq, intoOpenReq] = await Promise.all([
    tx.advertisementChangeRequest.findFirst({
      where: { advertisementId: from.id, status: { in: OPEN_REQUEST_STATUSES } },
      select: { id: true },
    }),
    tx.advertisementChangeRequest.findFirst({
      where: { advertisementId: into.id, status: { in: OPEN_REQUEST_STATUSES } },
      select: { id: true },
    }),
  ]);
  if (fromOpenReq && intoOpenReq) {
    throw new ConflictException(
      "두 광고 모두 처리 중인 변경 요청이 있어 합칠 수 없습니다. 한쪽 요청을 취소한 뒤 다시 시도해 주세요.",
    );
  }

  await tx.listingAdvertisementHistory.updateMany({
    where: { listingAdvertisementId: from.id },
    data: { listingAdvertisementId: into.id },
  });
  await tx.advertisementChangeRequest.updateMany({
    where: { advertisementId: from.id },
    data: { advertisementId: into.id },
  });
  await tx.advertisementComparisonRecord.updateMany({
    where: { advertisementId: from.id },
    data: { advertisementId: into.id },
  });

  const survivingArticleNo = fromIsCurrent
    ? from.naverArticleNo
    : into.naverArticleNo;
  const comparisonOf = async (advertisementId: string) => {
    const [latest, hasOwnRow] = await Promise.all([
      tx.advertisementComparison.aggregate({
        where: { advertisementId },
        _max: { lastSeenAt: true },
        _count: { _all: true },
      }),
      survivingArticleNo
        ? tx.advertisementComparison.count({
            where: { advertisementId, articleNo: survivingArticleNo },
          })
        : Promise.resolve(0),
    ]);
    return {
      count: latest._count._all,
      readAt: latest._max.lastSeenAt,
      hasOwnRow: hasOwnRow > 0,
    };
  };
  const [fromSet, intoSet] = await Promise.all([
    comparisonOf(from.id),
    comparisonOf(into.id),
  ]);
  const keepFromSet =
    fromSet.count > 0 &&
    (intoSet.count === 0 ||
      (fromSet.hasOwnRow !== intoSet.hasOwnRow
        ? fromSet.hasOwnRow
        : (fromSet.readAt?.getTime() ?? 0) > (intoSet.readAt?.getTime() ?? 0) ||
          ((fromSet.readAt?.getTime() ?? 0) === (intoSet.readAt?.getTime() ?? 0) &&
            fromIsCurrent)));
  if (keepFromSet) {
    await tx.advertisementComparison.deleteMany({
      where: { advertisementId: into.id },
    });
    await tx.advertisementComparison.updateMany({
      where: { advertisementId: from.id },
      data: { advertisementId: into.id },
    });
  }

  await tx.listingAdvertisement.delete({ where: { id: from.id } });

  const data: Prisma.ListingAdvertisementUncheckedUpdateInput = {};
  if (fromIsCurrent) {
    for (const field of CURRENT_STATE_FIELDS) {
      (data as Record<string, unknown>)[field] = from[field];
    }
    if (!into.memo && from.memo) data.memo = from.memo;
    if (!into.transactionType && from.transactionType) {
      data.transactionType = from.transactionType;
    }
  }
  if (from.firstSeenAt < into.firstSeenAt) data.firstSeenAt = from.firstSeenAt;
  if (Object.keys(data).length === 0) return into;
  return tx.listingAdvertisement.update({ where: { id: into.id }, data });
}
