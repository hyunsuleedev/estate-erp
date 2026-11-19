import { ConflictException } from "@nestjs/common";
import { Prisma, type ListingAdvertisement } from "@prisma/client";

/**
 * 광고 한 줄 = 한 광고. 같은 광고인지 가르는 열쇠와, 그 줄의 지나간 상태를 쌓는 일.
 *
 *   매물이 있으면          사무소 + 매물 + 채널
 *   매물 없이 호실까지면   사무소 + 관리 공간 + 채널 + 거래유형
 *   그 밖에는              열쇠가 없다 — 같은 채널의 CP 광고 번호가 같을 때만 같은 광고다
 *
 * 재광고(네이버 번호가 바뀜)와 내려갔다 다시 올라온 것은 새 줄이 아니라 같은 줄의 변화다.
 * 열쇠는 추정이 아니다: 층 · 가격이 비슷하다는 이유로 같은 광고라고 보지 않는다.
 */

type Tx = Prisma.TransactionClient;

export interface AdvertisementIdentity {
  channel: string;
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
  if (identity.listingId) {
    return {
      officeId,
      listingId: identity.listingId,
      channel: identity.channel,
    };
  }
  if (identity.propertyId && identity.transactionType) {
    return {
      officeId,
      listingId: null,
      propertyId: identity.propertyId,
      channel: identity.channel,
      transactionType: identity.transactionType,
    };
  }
  return null;
}

/**
 * 이미 있는 같은 광고를 찾는다. 열쇠가 먼저이고, 열쇠가 없거나 못 찾으면 CP 광고 번호로 찾는다.
 * 열쇠로 찾은 줄과 CP 번호로 찾은 줄이 서로 다르면 둘 다 돌려준다 — 부르는 쪽이 합칠지 거절할지 정한다.
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
  const byExternalAdId = externalAdId
    ? await tx.listingAdvertisement.findFirst({
        where: {
          officeId,
          channel: identity.channel,
          externalAdId,
          ...notSelf,
        },
        // 같은 번호가 여러 줄에 남아 있으면 게재 중인 것, 가장 최근에 본 것
        orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
      })
    : null;
  return { byKey, byExternalAdId };
}

type HistoryState = Pick<
  ListingAdvertisement,
  | "status"
  | "naverArticleNo"
  | "advertisedPrice"
  | "advertisedDeposit"
  | "advertisedMonthlyRent"
>;

/** 이력에 한 줄 남길 만큼 달라졌는가: 게재 상태 · 네이버 번호 · 가격 */
export function advertisementStateChanged(
  before: HistoryState,
  after: HistoryState,
): boolean {
  return (
    before.status !== after.status ||
    before.naverArticleNo !== after.naverArticleNo ||
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
  "status",
  "source",
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

/**
 * 두 줄이 같은 광고였음이 드러났을 때 from을 into로 합치고, 합친 뒤의 into를 돌려준다
 * (연결 안 된 채 들어와 있던 광고를 매물에 이었더니 그 매물 · 채널의 광고가 이미 있는 경우).
 *
 * - 이력 · 변경 요청 · 비교 기록은 into로 옮긴다.
 * - 남는 줄은 "지금의 광고"의 상태를 갖는다. 게재 중인 from을 종료된 into에 합치면 into가 게재 중이 된다
 *   (그러지 않으면 살아 있는 광고가 합치면서 종료된 것으로 바뀐다). 지금 네이버 비교 줄도 그쪽 것을 남긴다.
 * - 둘 다 게재 중이고 CP 광고 번호가 서로 다르면 같은 집이 같은 채널에 두 번 올라가 있는 것이라 합치지 않는다.
 *   한쪽에 번호가 없으면(사람이 손으로 넣어 둔 줄) 같은 광고로 보고 합친다.
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
      "같은 매물이 같은 채널에 두 번 게재 중입니다. 하나를 내린 뒤 다시 연결해 주세요.",
    );
  }
  const fromIsCurrent = isMoreCurrent(from, into);

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
  // 지금 네이버 비교 줄은 한 벌만 남는다. 어느 쪽을 남길지:
  //   1. 남는 줄이 갖게 될 네이버 번호의 줄이 들어 있는 쪽 (그래야 "내 줄"을 찾을 수 있다)
  //   2. 둘 다 그렇거나 둘 다 아니면, 더 최근에 읽은 쪽 — 종료된 줄에 붙어 있더라도 최신 비교를 버리지 않는다
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

  // from을 먼저 지운다 (게재 중인 CP 광고 번호는 한 줄만 가질 수 있어, 옮겨 적기 전에 비워야 한다)
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
