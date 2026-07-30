/**
 * 내 광고 관리 화면 전용 데모 데이터.
 *
 * - 기존 Property / Listing / Unit은 수정하지 않는다.
 * - 이실장·부동산뱅크에서 가져온 CP 광고 원장과 네이버 비교 결과를 함께 만든다.
 * - 모든 소유 레코드는 결정적 UUID와 [DEMO:MY_ADS] 태그를 사용해 재실행해도 중복되지 않는다.
 *
 * 실행:
 *   SEED_OFFICE_ID=<office-uuid> pnpm exec tsx prisma/seed-my-advertisements.ts
 */
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_TAG = "[DEMO:MY_ADS]";
const DEMO_AGENT_KEY = "my-advertisements-sync";
const DEMO_AGENT_TASK_KEY = "full-cp-and-naver-refresh";

type Scenario = {
  key: string;
  preferredListingId: string;
  transactionType: "sale" | "jeonse" | "monthly";
  channel: "esiljang" | "budongsanbank";
  ranking: number | null;
  analysis:
    | "price_review"
    | "exposure_review"
    | "complete"
    | "comparison_pending"
    | "naver_link_pending";
  title: string;
};

const scenarios: Scenario[] = [
  {
    key: "sale-price-review",
    preferredListingId: "cb93e09f-1e4c-45d2-872e-22c9f07d03ee",
    transactionType: "sale",
    channel: "esiljang",
    // 내 광고가 1위여도 더 싼 비교 광고가 있으면 경고되어야 한다.
    ranking: 1,
    analysis: "price_review",
    title: "급매·입주 협의 가능",
  },
  {
    key: "sale-complete",
    preferredListingId: "c9c9817e-0fba-4a74-ae94-bbdd4c76a90b",
    transactionType: "sale",
    channel: "esiljang",
    ranking: 2,
    analysis: "complete",
    title: "한강 조망·상태 최상",
  },
  {
    key: "sale-exposure-review",
    preferredListingId: "ce00ffc1-a7cb-4914-b418-10afe7f78d1a",
    transactionType: "sale",
    channel: "budongsanbank",
    ranking: 12,
    analysis: "exposure_review",
    title: "대형 평형·로열층",
  },
  {
    key: "jeonse-price-review",
    preferredListingId: "36fdaf93-6494-4612-971c-48e41eeb7290",
    transactionType: "jeonse",
    channel: "esiljang",
    ranking: 4,
    analysis: "price_review",
    title: "융자 없음·즉시 입주",
  },
  {
    key: "monthly-complete",
    preferredListingId: "2aece22e-6f60-40df-b3d6-205b1ec506be",
    transactionType: "monthly",
    channel: "esiljang",
    ranking: 1,
    analysis: "complete",
    title: "풀옵션·깨끗한 내부",
  },
  {
    key: "monthly-exposure-review",
    preferredListingId: "d4200000-0000-4000-8000-000000000003",
    transactionType: "monthly",
    channel: "budongsanbank",
    ranking: 15,
    analysis: "exposure_review",
    title: "남향·역세권 월세",
  },
  {
    // Keep the deterministic key so rerunning the seed upgrades the old demo row.
    key: "sale-paused",
    preferredListingId: "d4200000-0000-4000-8000-000000000001",
    transactionType: "sale",
    channel: "esiljang",
    ranking: 6,
    analysis: "complete",
    title: "채광 우수·입주일 협의",
  },
  {
    key: "jeonse-comparison-pending",
    preferredListingId: "d4200000-0000-4000-8000-000000000002",
    transactionType: "jeonse",
    channel: "esiljang",
    ranking: null,
    analysis: "comparison_pending",
    title: "CP 수집 완료·네이버 비교 대기",
  },
  {
    // Keep the deterministic key so rerunning the seed upgrades the old demo row.
    key: "sale-cp-error",
    preferredListingId: "d4200000-0000-4000-8000-000000000004",
    transactionType: "sale",
    channel: "budongsanbank",
    ranking: null,
    analysis: "naver_link_pending",
    title: "CP 수집 완료·네이버 링크 대기",
  },
];

const competitorNames = [
  "고덕탑공인중개사사무소",
  "그라시움부동산",
  "고덕역센트럴공인중개사",
] as const;

function deterministicUuid(
  officeId: string,
  entity: string,
  key: string,
): string {
  const hex = createHash("sha256")
    .update(`${DEMO_TAG}:${officeId}:${entity}:${key}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}

function minutesAgo(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function transactionLabel(transactionType: Scenario["transactionType"]) {
  if (transactionType === "sale") return "매매";
  if (transactionType === "jeonse") return "전세";
  return "월세";
}

function channelLabel(channel: Scenario["channel"]) {
  return channel === "esiljang" ? "이실장" : "부동산뱅크";
}

function primaryListingAmount(listing: {
  transactionType: string;
  price: number | null;
  deposit: number | null;
}) {
  return listing.transactionType === "monthly"
    ? listing.deposit
    : listing.price;
}

function advertisedAmounts(listing: {
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}) {
  if (listing.transactionType === "sale") {
    return {
      advertisedPrice: listing.price,
      advertisedDeposit: null,
      advertisedMonthlyRent: null,
    };
  }
  if (listing.transactionType === "jeonse") {
    return {
      advertisedPrice: null,
      advertisedDeposit: listing.price,
      advertisedMonthlyRent: null,
    };
  }
  return {
    advertisedPrice: null,
    advertisedDeposit: listing.deposit,
    advertisedMonthlyRent: listing.monthlyRent,
  };
}

function observedAmounts(
  transactionType: Scenario["transactionType"],
  amount: number,
  monthlyRent: number | null,
) {
  if (transactionType === "sale") {
    return { price: amount, deposit: null, monthlyRent: null };
  }
  if (transactionType === "jeonse") {
    return { price: null, deposit: amount, monthlyRent: null };
  }
  return { price: null, deposit: amount, monthlyRent };
}

function competitorAmounts(scenario: Scenario, ownAmount: number): number[] {
  if (scenario.analysis === "price_review") {
    const gap = scenario.transactionType === "sale" ? 3_000 : 2_000;
    return [ownAmount - gap, ownAmount, ownAmount + gap];
  }
  if (scenario.analysis === "exposure_review") {
    const gap = scenario.transactionType === "monthly" ? 5_000 : 2_000;
    return [ownAmount, ownAmount + gap, ownAmount + gap * 2];
  }
  return [ownAmount, ownAmount + 2_000, ownAmount + 4_000];
}

function observedFloorExposure(
  scenario: Scenario,
  advertisementIndex: number,
  unitFloor: number | null,
) {
  const floor = unitFloor ?? 12;
  const totalFloor = Math.max(20, floor + 5);
  const band =
    floor / totalFloor <= 0.33 ? "저" : floor / totalFloor <= 0.66 ? "중" : "고";
  const exact = `${floor}/${totalFloor}`;
  const masked = `${band}/${totalFloor}`;
  const floorInfo =
    scenario.analysis === "exposure_review"
      ? advertisementIndex === 0
        ? masked
        : advertisementIndex === 1
          ? exact
          : masked
      : advertisementIndex % 3 === 2
        ? masked
        : exact;
  return {
    floorInfo,
    floorExposureMode: /^\d+\//u.test(floorInfo) ? "exact" : "band",
  };
}

async function assertReservedArticleNumbersAreSafe(
  officeId: string,
  expectedExternalIds: Map<string, string>,
  expectedOfficeAdvertisementIds: Map<string, string>,
) {
  const articleNos = [...expectedExternalIds.keys()];
  const [externalRows, officeRows] = await Promise.all([
    prisma.externalListing.findMany({
      where: { officeId, source: "naver", articleNo: { in: articleNos } },
      select: { id: true, articleNo: true },
    }),
    prisma.officeAdvertisement.findMany({
      where: { officeId, articleNo: { in: articleNos } },
      select: { id: true, articleNo: true },
    }),
  ]);

  const externalConflict = externalRows.find(
    (row) => expectedExternalIds.get(row.articleNo) !== row.id,
  );
  if (externalConflict) {
    throw new Error(
      `데모용 네이버 매물번호 ${externalConflict.articleNo}가 기존 외부 매물에 사용 중입니다.`,
    );
  }

  const officeConflict = officeRows.find(
    (row) => expectedOfficeAdvertisementIds.get(row.articleNo) !== row.id,
  );
  if (officeConflict) {
    throw new Error(
      `데모용 네이버 매물번호 ${officeConflict.articleNo}가 기존 광고 비교 데이터에 사용 중입니다.`,
    );
  }
}

async function main() {
  const officeId = process.env.SEED_OFFICE_ID;
  if (!officeId) {
    throw new Error(
      "안전한 실행을 위해 SEED_OFFICE_ID=<office-uuid>를 지정해 주세요.",
    );
  }

  const [office, users, listings] = await Promise.all([
    prisma.office.findUnique({ where: { id: officeId } }),
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.listing.findMany({
      where: { officeId },
      include: {
        advertisements: {
          select: { id: true, memo: true },
        },
        property: {
          include: {
            site: true,
            unit: {
              include: {
                dong: true,
                siteUnitType: true,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);

  if (!office) {
    throw new Error(`Office ${officeId}를 찾을 수 없습니다.`);
  }
  const reviewer =
    users.find((user) => user.role === "owner") ??
    users.find((user) => user.role === "manager") ??
    users[0];
  if (!reviewer) {
    throw new Error(`${office.name} 사무소에 활성 사용자가 없습니다.`);
  }

  const eligibleListings = listings.filter(
    (listing) =>
      listing.property.unit &&
      listing.advertisements.every((advertisement) =>
        advertisement.memo?.includes(DEMO_TAG),
      ),
  );
  const listingById = new Map(
    eligibleListings.map((listing) => [listing.id, listing]),
  );
  const usedListingIds = new Set<string>();
  const assignedListings = new Map<string, (typeof eligibleListings)[number]>();

  for (const scenario of scenarios) {
    const advertisementId = deterministicUuid(
      officeId,
      "listing-advertisement",
      scenario.key,
    );
    const existingAdvertisement = await prisma.listingAdvertisement.findUnique({
      where: { id: advertisementId },
      select: { listingId: true },
    });
    const existingListing = existingAdvertisement
      ? listingById.get(existingAdvertisement.listingId)
      : undefined;
    const preferredListing = listingById.get(scenario.preferredListingId);
    const listing =
      (existingListing?.transactionType === scenario.transactionType &&
      !usedListingIds.has(existingListing.id)
        ? existingListing
        : undefined) ??
      (preferredListing?.transactionType === scenario.transactionType &&
      !usedListingIds.has(preferredListing.id)
        ? preferredListing
        : undefined) ??
      eligibleListings.find(
        (candidate) =>
          candidate.transactionType === scenario.transactionType &&
          !usedListingIds.has(candidate.id),
      );

    if (!listing) {
      throw new Error(
        `${scenario.transactionType} 데모 광고에 연결할 미사용 Listing이 부족합니다.`,
      );
    }
    usedListingIds.add(listing.id);
    assignedListings.set(scenario.key, listing);
  }

  const expectedExternalIds = new Map<string, string>();
  const expectedOfficeAdvertisementIds = new Map<string, string>();
  scenarios.forEach((scenario, scenarioIndex) => {
    if (
      scenario.analysis === "comparison_pending" ||
      scenario.analysis === "naver_link_pending"
    ) {
      return;
    }
    for (
      let advertisementIndex = 0;
      advertisementIndex < 4;
      advertisementIndex += 1
    ) {
      const articleNo = String(
        2_999_000_000 + scenarioIndex * 10 + advertisementIndex,
      );
      expectedExternalIds.set(
        articleNo,
        deterministicUuid(
          officeId,
          "external-listing",
          `${scenario.key}:${advertisementIndex}`,
        ),
      );
      expectedOfficeAdvertisementIds.set(
        articleNo,
        deterministicUuid(
          officeId,
          "office-advertisement",
          `${scenario.key}:${advertisementIndex}`,
        ),
      );
    }
  });
  await assertReservedArticleNumbersAreSafe(
    officeId,
    expectedExternalIds,
    expectedOfficeAdvertisementIds,
  );

  const existingSyncSession = await prisma.agentSession.findUnique({
    where: {
      officeId_agentKey_adapter_taskKey: {
        officeId,
        agentKey: DEMO_AGENT_KEY,
        adapter: "mcp",
        taskKey: DEMO_AGENT_TASK_KEY,
      },
    },
    select: { context: true },
  });
  const shouldSeedSyncStatus =
    !existingSyncSession ||
    (typeof existingSyncSession.context === "object" &&
      existingSyncSession.context !== null &&
      !Array.isArray(existingSyncSession.context) &&
      (existingSyncSession.context as Prisma.JsonObject).demo === true);
  const existingSyncRun = await prisma.advertisementSyncRun.findFirst({
    where: {
      officeId,
      workflowKey: DEMO_AGENT_TASK_KEY,
    },
    orderBy: { createdAt: "desc" },
    select: { context: true },
  });
  const shouldSeedWorkflowRun =
    !existingSyncRun ||
    (typeof existingSyncRun.context === "object" &&
      existingSyncRun.context !== null &&
      !Array.isArray(existingSyncRun.context) &&
      (existingSyncRun.context as Prisma.JsonObject).demo === true);

  const now = new Date();
  const comparisonRows: Array<{
    scenario: Scenario;
    listingAdvertisementId: string;
    articleNo: string | null;
  }> = [];

  await prisma.$transaction(
    async (tx) => {
      for (
        let scenarioIndex = 0;
        scenarioIndex < scenarios.length;
        scenarioIndex += 1
      ) {
        const scenario = scenarios[scenarioIndex];
        const listing = assignedListings.get(scenario.key);
        if (!listing || !listing.property.unit) {
          throw new Error(`${scenario.key} Listing 배정에 실패했습니다.`);
        }

        const listingAdvertisementId = deterministicUuid(
          officeId,
          "listing-advertisement",
          scenario.key,
        );
        const ownArticleNo =
          scenario.analysis === "naver_link_pending"
            ? null
            : String(2_999_000_000 + scenarioIndex * 10);
        const ownNaverUrl = ownArticleNo
          ? `https://new.land.naver.com/houses?articleNo=${ownArticleNo}`
          : null;
        const startedAt = daysAgo(now, 18 - scenarioIndex);
        const lastSyncedAt = minutesAgo(now, 18 + scenarioIndex * 4);
        const lastCheckedAt =
          scenario.analysis === "comparison_pending" ||
          scenario.analysis === "naver_link_pending"
            ? null
            : minutesAgo(now, 10 + scenarioIndex * 3);
        const amounts = advertisedAmounts(listing);

        await tx.listingAdvertisement.upsert({
          where: { id: listingAdvertisementId },
          create: {
            id: listingAdvertisementId,
            officeId,
            listingId: listing.id,
            channel: scenario.channel,
            status: "active",
            source: "cp_sync",
            ...amounts,
            startedAt,
            endedAt: null,
            url: `https://demo.${scenario.channel}.invalid/advertisements/${scenarioIndex + 1}`,
            memo: `${DEMO_TAG} ${scenario.title}`,
            externalAdId: `DEMO-${scenario.channel.toUpperCase()}-${String(
              scenarioIndex + 1,
            ).padStart(3, "0")}`,
            naverArticleNo: ownArticleNo,
            naverUrl: ownNaverUrl,
            lastCheckedAt,
            lastSyncedAt,
          },
          update: {
            officeId,
            listingId: listing.id,
            channel: scenario.channel,
            status: "active",
            source: "cp_sync",
            ...amounts,
            startedAt,
            endedAt: null,
            url: `https://demo.${scenario.channel}.invalid/advertisements/${scenarioIndex + 1}`,
            memo: `${DEMO_TAG} ${scenario.title}`,
            externalAdId: `DEMO-${scenario.channel.toUpperCase()}-${String(
              scenarioIndex + 1,
            ).padStart(3, "0")}`,
            naverArticleNo: ownArticleNo,
            naverUrl: ownNaverUrl,
            lastCheckedAt,
            lastSyncedAt,
          },
        });

        comparisonRows.push({
          scenario,
          listingAdvertisementId,
          articleNo: ownArticleNo,
        });

        if (
          scenario.analysis === "comparison_pending" ||
          scenario.analysis === "naver_link_pending"
        ) {
          continue;
        }

        const ownAmount = primaryListingAmount(listing);
        if (ownAmount == null) {
          throw new Error(`${scenario.key} Listing에 비교할 가격이 없습니다.`);
        }
        const competitorPrimaryAmounts = competitorAmounts(scenario, ownAmount);
        const observedAt = lastCheckedAt ?? now;
        const externalGroupId = deterministicUuid(
          officeId,
          "external-listing-group",
          scenario.key,
        );
        const externalGroup = await tx.externalListingGroup.upsert({
          where: { id: externalGroupId },
          create: {
            id: externalGroupId,
            officeId,
            siteId: listing.property.siteId,
            unitId: listing.property.unitId,
            buildingName: listing.property.unit.dong.name,
            inferredHo: `${listing.property.unit.name}호`,
            areaName: listing.property.unit.siteUnitType?.name ?? null,
            exclusiveAreaM2:
              listing.property.unit.siteUnitType?.exclusiveAreaM2 ?? null,
            transactionType: scenario.transactionType,
            memo: `${DEMO_TAG} 네이버 비교 Skill 관측 그룹`,
            favorite: false,
            status: "verified",
            firstSeenAt: startedAt,
            lastSeenAt: observedAt,
          },
          update: {
            officeId,
            siteId: listing.property.siteId,
            unitId: listing.property.unitId,
            buildingName: listing.property.unit.dong.name,
            inferredHo: `${listing.property.unit.name}호`,
            areaName: listing.property.unit.siteUnitType?.name ?? null,
            exclusiveAreaM2:
              listing.property.unit.siteUnitType?.exclusiveAreaM2 ?? null,
            transactionType: scenario.transactionType,
            memo: `${DEMO_TAG} 네이버 비교 Skill 관측 그룹`,
            favorite: false,
            status: "verified",
            firstSeenAt: startedAt,
            lastSeenAt: observedAt,
          },
        });

        const officeGroupId = deterministicUuid(
          officeId,
          "office-advertisement-group",
          scenario.key,
        );
        const observedRelatedMin = Math.min(...competitorPrimaryAmounts);
        const observedRelatedMax = Math.max(...competitorPrimaryAmounts);
        // 월세는 보증금 scalar만으로 최저/최고를 표현하지 않는다.
        const relatedMin =
          scenario.transactionType === "monthly" ? null : observedRelatedMin;
        const relatedMax =
          scenario.transactionType === "monthly" ? null : observedRelatedMax;
        const ownObservedAmounts = observedAmounts(
          scenario.transactionType,
          ownAmount,
          listing.monthlyRent,
        );
        const officeGroup = await tx.officeAdvertisementGroup.upsert({
          where: { listingAdvertisementId },
          create: {
            id: officeGroupId,
            officeId,
            listingAdvertisementId,
            memo: `${DEMO_TAG} 네이버 비교 Skill 분석 결과`,
            ownPrice: ownObservedAmounts.price,
            ownDeposit: ownObservedAmounts.deposit,
            ownMonthlyRent: ownObservedAmounts.monthlyRent,
            relatedPriceMin: relatedMin,
            relatedPriceMax: relatedMax,
            relatedCount: competitorPrimaryAmounts.length,
            firstSeenAt: startedAt,
            lastSeenAt: observedAt,
            lastSyncedAt: observedAt,
          },
          update: {
            officeId,
            memo: `${DEMO_TAG} 네이버 비교 Skill 분석 결과`,
            ownPrice: ownObservedAmounts.price,
            ownDeposit: ownObservedAmounts.deposit,
            ownMonthlyRent: ownObservedAmounts.monthlyRent,
            relatedPriceMin: relatedMin,
            relatedPriceMax: relatedMax,
            relatedCount: competitorPrimaryAmounts.length,
            firstSeenAt: startedAt,
            lastSeenAt: observedAt,
            lastSyncedAt: observedAt,
          },
        });

        const allPrimaryAmounts = [ownAmount, ...competitorPrimaryAmounts];
        const allRankings =
          scenario.key === "sale-price-review"
            ? [1, 4, 2, 3]
            : [
                scenario.ranking ?? 1,
                1,
                scenario.ranking === 1 ? 3 : 5,
                scenario.ranking === 2 ? 6 : 10,
              ];

        for (
          let advertisementIndex = 0;
          advertisementIndex < allPrimaryAmounts.length;
          advertisementIndex += 1
        ) {
          const isMine = advertisementIndex === 0;
          const articleNo = String(
            2_999_000_000 + scenarioIndex * 10 + advertisementIndex,
          );
          const sourceUrl = `https://new.land.naver.com/houses?articleNo=${articleNo}`;
          const observedAmountsValue = observedAmounts(
            scenario.transactionType,
            allPrimaryAmounts[advertisementIndex],
            scenario.transactionType === "monthly"
              ? (listing.monthlyRent ?? 0) +
                  (isMine ? 0 : advertisementIndex * 10)
              : null,
          );
          const articleConfirmYmd = formatYmd(
            daysAgo(now, isMine ? 0 : advertisementIndex),
          );
          const realtorName = isMine
            ? `${office.name}공인중개사사무소`
            : competitorNames[advertisementIndex - 1];
          const floorExposure = observedFloorExposure(
            scenario,
            advertisementIndex,
            listing.property.unit.floor,
          );
          const externalListingId = deterministicUuid(
            officeId,
            "external-listing",
            `${scenario.key}:${advertisementIndex}`,
          );
          const officeAdvertisementId = deterministicUuid(
            officeId,
            "office-advertisement",
            `${scenario.key}:${advertisementIndex}`,
          );

          await tx.externalListing.upsert({
            where: { id: externalListingId },
            create: {
              id: externalListingId,
              officeId,
              groupId: externalGroup.id,
              source: "naver",
              articleNo,
              sourceUrl,
              cpName: isMine ? channelLabel(scenario.channel) : "네이버부동산",
              representativeArticleNo: ownArticleNo,
              sameAddrCnt: allPrimaryAmounts.length,
              sameAddrDirectCnt: allPrimaryAmounts.length,
              sameAddrMinPrc: String(observedRelatedMin),
              sameAddrMaxPrc: String(observedRelatedMax),
              transactionType: scenario.transactionType,
              ...observedAmountsValue,
              articleName: `${listing.property.site.name} ${transactionLabel(
                scenario.transactionType,
              )}`,
              articleFeatureDesc: isMine
                ? scenario.title
                : "동일 호실 비교 광고",
              detailDescription: `${DEMO_TAG} 네이버 비교 Skill 데모 관측`,
              articleConfirmYmd,
              floorInfo: floorExposure.floorInfo,
              exclusiveAreaM2:
                listing.property.unit.siteUnitType?.exclusiveAreaM2 ?? null,
              supplyAreaM2:
                listing.property.unit.siteUnitType?.supplyAreaM2 ?? null,
              direction: advertisementIndex % 2 === 0 ? "남향" : "남동향",
              tagList: isMine
                ? ["내광고", "확인매물"]
                : ["중복매물", "확인매물"],
              verificationTypeCode: "OWNER",
              realtorId: isMine
                ? `DEMO-OFFICE-${officeId.slice(0, 8)}`
                : `DEMO-COMPETITOR-${advertisementIndex}`,
              realtorName,
              originalRealtorName: realtorName,
              representativeTelNo: "02-0000-0000",
              ranking: allRankings[advertisementIndex],
              isSharedRank: false,
              sharedRank: null,
              sameRankNum: 1,
              seango: !isMine && advertisementIndex === 1,
              epju: isMine && scenario.ranking === 1,
              exposeStartYmd: Number(formatYmd(startedAt)),
              exposeEndYmd: null,
              raw: {
                demo: true,
                tag: DEMO_TAG,
                workflow: "naver-real-estate-reader",
              } satisfies Prisma.InputJsonValue,
              firstSeenAt: startedAt,
              lastSeenAt: observedAt,
              isActive: true,
            },
            update: {
              officeId,
              groupId: externalGroup.id,
              source: "naver",
              articleNo,
              sourceUrl,
              cpName: isMine ? channelLabel(scenario.channel) : "네이버부동산",
              representativeArticleNo: ownArticleNo,
              sameAddrCnt: allPrimaryAmounts.length,
              sameAddrDirectCnt: allPrimaryAmounts.length,
              sameAddrMinPrc: String(observedRelatedMin),
              sameAddrMaxPrc: String(observedRelatedMax),
              transactionType: scenario.transactionType,
              ...observedAmountsValue,
              articleName: `${listing.property.site.name} ${transactionLabel(
                scenario.transactionType,
              )}`,
              articleFeatureDesc: isMine
                ? scenario.title
                : "동일 호실 비교 광고",
              detailDescription: `${DEMO_TAG} 네이버 비교 Skill 데모 관측`,
              articleConfirmYmd,
              floorInfo: floorExposure.floorInfo,
              exclusiveAreaM2:
                listing.property.unit.siteUnitType?.exclusiveAreaM2 ?? null,
              supplyAreaM2:
                listing.property.unit.siteUnitType?.supplyAreaM2 ?? null,
              direction: advertisementIndex % 2 === 0 ? "남향" : "남동향",
              tagList: isMine
                ? ["내광고", "확인매물"]
                : ["중복매물", "확인매물"],
              verificationTypeCode: "OWNER",
              realtorId: isMine
                ? `DEMO-OFFICE-${officeId.slice(0, 8)}`
                : `DEMO-COMPETITOR-${advertisementIndex}`,
              realtorName,
              originalRealtorName: realtorName,
              representativeTelNo: "02-0000-0000",
              ranking: allRankings[advertisementIndex],
              isSharedRank: false,
              sharedRank: null,
              sameRankNum: 1,
              seango: !isMine && advertisementIndex === 1,
              epju: isMine && scenario.ranking === 1,
              exposeStartYmd: Number(formatYmd(startedAt)),
              exposeEndYmd: null,
              raw: {
                demo: true,
                tag: DEMO_TAG,
                workflow: "naver-real-estate-reader",
              } satisfies Prisma.InputJsonValue,
              firstSeenAt: startedAt,
              lastSeenAt: observedAt,
              isActive: true,
            },
          });

          await tx.officeAdvertisement.upsert({
            where: { id: officeAdvertisementId },
            create: {
              id: officeAdvertisementId,
              officeId,
              groupId: officeGroup.id,
              articleNo,
              sourceUrl,
              isMine,
              isMain: isMine,
              isActive: true,
              articleName: `${listing.property.site.name} ${transactionLabel(
                scenario.transactionType,
              )}`,
              realtorName,
              realtorId: isMine
                ? `DEMO-OFFICE-${officeId.slice(0, 8)}`
                : `DEMO-COMPETITOR-${advertisementIndex}`,
              representativeTelNo: "02-0000-0000",
              ...observedAmountsValue,
              ranking: allRankings[advertisementIndex],
              sameAddrCnt: allPrimaryAmounts.length,
              articleConfirmYmd,
              floorInfo: floorExposure.floorInfo,
              floorExposureMode: floorExposure.floorExposureMode,
              verificationTypeCode: "OWNER",
              seango: !isMine && advertisementIndex === 1,
              epju: isMine && scenario.ranking === 1,
              raw: {
                demo: true,
                tag: DEMO_TAG,
                workflow: "naver-real-estate-reader",
              } satisfies Prisma.InputJsonValue,
              firstSeenAt: startedAt,
              lastSeenAt: observedAt,
            },
            update: {
              officeId,
              groupId: officeGroup.id,
              articleNo,
              sourceUrl,
              isMine,
              isMain: isMine,
              isActive: true,
              articleName: `${listing.property.site.name} ${transactionLabel(
                scenario.transactionType,
              )}`,
              realtorName,
              realtorId: isMine
                ? `DEMO-OFFICE-${officeId.slice(0, 8)}`
                : `DEMO-COMPETITOR-${advertisementIndex}`,
              representativeTelNo: "02-0000-0000",
              ...observedAmountsValue,
              ranking: allRankings[advertisementIndex],
              sameAddrCnt: allPrimaryAmounts.length,
              articleConfirmYmd,
              floorInfo: floorExposure.floorInfo,
              floorExposureMode: floorExposure.floorExposureMode,
              verificationTypeCode: "OWNER",
              seango: !isMine && advertisementIndex === 1,
              epju: isMine && scenario.ranking === 1,
              raw: {
                demo: true,
                tag: DEMO_TAG,
                workflow: "naver-real-estate-reader",
              } satisfies Prisma.InputJsonValue,
              firstSeenAt: startedAt,
              lastSeenAt: observedAt,
            },
          });
        }

        const mainExternalListingId = deterministicUuid(
          officeId,
          "external-listing",
          `${scenario.key}:0`,
        );
        const mainOfficeAdvertisementId = deterministicUuid(
          officeId,
          "office-advertisement",
          `${scenario.key}:0`,
        );
        await tx.externalListingGroup.update({
          where: { id: externalGroup.id },
          data: { mainExternalListingId },
        });
        await tx.officeAdvertisementGroup.update({
          where: { id: officeGroup.id },
          data: { mainAdvertisementId: mainOfficeAdvertisementId },
        });
      }

      if (shouldSeedWorkflowRun) {
        const workflowRunId = deterministicUuid(
          officeId,
          "advertisement-sync-run",
          DEMO_AGENT_TASK_KEY,
        );
        const workflowCompletedAt = minutesAgo(now, 7);
        await tx.advertisementSyncRun.upsert({
          where: { id: workflowRunId },
          create: {
            id: workflowRunId,
            officeId,
            workflowKey: DEMO_AGENT_TASK_KEY,
            schemaVersion: 1,
            status: "completed",
            requestedBy: reviewer.id,
            channels: ["esiljang", "budongsanbank"],
            context: {
              schemaVersion: 1,
              workflow: "my_advertisements_full_refresh",
              scope: "all_cp_advertisements",
              compareEveryImportedAdvertisement: true,
              demo: true,
            },
            startedAt: minutesAgo(now, 12),
            completedAt: workflowCompletedAt,
            createdAt: minutesAgo(now, 12),
          },
          update: {
            status: "completed",
            requestedBy: reviewer.id,
            channels: ["esiljang", "budongsanbank"],
            context: {
              schemaVersion: 1,
              workflow: "my_advertisements_full_refresh",
              scope: "all_cp_advertisements",
              compareEveryImportedAdvertisement: true,
              demo: true,
            },
            startedAt: minutesAgo(now, 12),
            completedAt: workflowCompletedAt,
          },
        });

        const demoStepDefinitions = [
          {
            stepKey: "cp_import_esiljang",
            position: 1,
            kind: "cp_full_import",
            title: "이실장 광고 가져오기",
            channel: "esiljang",
            skillKey: "esiljang-ad-reader",
            skillVersion: "computer-use-v1",
            dependsOnKeys: [] as string[],
            progressTotal: scenarios.filter(
              (scenario) => scenario.channel === "esiljang",
            ).length,
          },
          {
            stepKey: "cp_import_budongsanbank",
            position: 2,
            kind: "cp_full_import",
            title: "부동산뱅크 광고 가져오기",
            channel: "budongsanbank",
            skillKey: "budongsanbank-ad-reader",
            skillVersion: "computer-use-v1",
            dependsOnKeys: [] as string[],
            progressTotal: scenarios.filter(
              (scenario) => scenario.channel === "budongsanbank",
            ).length,
          },
          {
            stepKey: "resolve_exact_listing_and_unit",
            position: 3,
            kind: "resolve_exact_listing_and_unit",
            title: "매물·호실 확정",
            channel: null,
            skillKey: DEMO_AGENT_KEY,
            skillVersion: "1",
            dependsOnKeys: [
              "cp_import_esiljang",
              "cp_import_budongsanbank",
            ],
            progressTotal: scenarios.length,
          },
          {
            stepKey: "naver_compare_all",
            position: 4,
            kind: "naver_compare",
            title: "전체 네이버 비교",
            channel: null,
            skillKey: "naver-real-estate-reader",
            skillVersion: "0.3.0",
            dependsOnKeys: ["resolve_exact_listing_and_unit"],
            progressTotal: comparisonRows.filter(
              (row) =>
                row.scenario.analysis !== "comparison_pending" &&
                row.scenario.analysis !== "naver_link_pending",
            ).length,
          },
          {
            stepKey: "persist_analysis_and_recommendations",
            position: 5,
            kind: "persist_analysis_and_recommendations",
            title: "분석·추천 저장",
            channel: null,
            skillKey: DEMO_AGENT_KEY,
            skillVersion: "1",
            dependsOnKeys: ["naver_compare_all"],
            progressTotal: comparisonRows.filter(
              (row) =>
                row.scenario.analysis !== "comparison_pending" &&
                row.scenario.analysis !== "naver_link_pending",
            ).length,
          },
        ];

        for (const definition of demoStepDefinitions) {
          const stepId = deterministicUuid(
            officeId,
            "advertisement-sync-step",
            definition.stepKey,
          );
          await tx.advertisementSyncStep.upsert({
            where: { id: stepId },
            create: {
              id: stepId,
              officeId,
              runId: workflowRunId,
              stepKey: definition.stepKey,
              position: definition.position,
              kind: definition.kind,
              title: definition.title,
              status: "succeeded",
              channel: definition.channel,
              skillKey: definition.skillKey,
              skillVersion: definition.skillVersion,
              dependsOnKeys: definition.dependsOnKeys,
              input: {
                scope:
                  definition.kind === "naver_compare"
                    ? "every_imported_advertisement"
                    : "demo",
                demo: true,
              },
              output: {
                processedCount: definition.progressTotal,
                totalCount: definition.progressTotal,
                failedCount: 0,
                demo: true,
              },
              attemptCount: 1,
              progressTotal: definition.progressTotal,
              progressComplete: definition.progressTotal,
              progressFailed: 0,
              startedAt: minutesAgo(
                now,
                12 - (definition.position - 1),
              ),
              finishedAt: minutesAgo(
                now,
                11 - (definition.position - 1),
              ),
            },
            update: {
              runId: workflowRunId,
              position: definition.position,
              kind: definition.kind,
              title: definition.title,
              status: "succeeded",
              channel: definition.channel,
              skillKey: definition.skillKey,
              skillVersion: definition.skillVersion,
              dependsOnKeys: definition.dependsOnKeys,
              input: {
                scope:
                  definition.kind === "naver_compare"
                    ? "every_imported_advertisement"
                    : "demo",
                demo: true,
              },
              output: {
                processedCount: definition.progressTotal,
                totalCount: definition.progressTotal,
                failedCount: 0,
                demo: true,
              },
              attemptCount: 1,
              progressTotal: definition.progressTotal,
              progressComplete: definition.progressTotal,
              progressFailed: 0,
              error: null,
              waitingReason: null,
              startedAt: minutesAgo(
                now,
                12 - (definition.position - 1),
              ),
              finishedAt: minutesAgo(
                now,
                11 - (definition.position - 1),
              ),
            },
          });
        }
      }

      if (shouldSeedSyncStatus) {
        const session = await tx.agentSession.upsert({
          where: {
            officeId_agentKey_adapter_taskKey: {
              officeId,
              agentKey: DEMO_AGENT_KEY,
              adapter: "mcp",
              taskKey: DEMO_AGENT_TASK_KEY,
            },
          },
          create: {
            id: deterministicUuid(
              officeId,
              "agent-session",
              DEMO_AGENT_TASK_KEY,
            ),
            officeId,
            agentKey: DEMO_AGENT_KEY,
            adapter: "mcp",
            taskKey: DEMO_AGENT_TASK_KEY,
            status: "complete",
            context: {
              schemaVersion: 1,
              workflow: "my_advertisements_full_refresh",
              scope: "all_cp_advertisements",
              demo: true,
            },
            plan: {
              steps: [
                "이실장·부동산뱅크 전체 광고 가져오기",
                "가져온 광고 전체 네이버 비교",
                "현황 분석과 추천안 생성",
              ],
            },
            lastRunAt: minutesAgo(now, 8),
            completedAt: minutesAgo(now, 7),
          },
          update: {
            status: "complete",
            waitingReason: null,
            context: {
              schemaVersion: 1,
              workflow: "my_advertisements_full_refresh",
              scope: "all_cp_advertisements",
              demo: true,
            },
            plan: {
              steps: [
                "이실장·부동산뱅크 전체 광고 가져오기",
                "가져온 광고 전체 네이버 비교",
                "현황 분석과 추천안 생성",
              ],
            },
            lastRunAt: minutesAgo(now, 8),
            completedAt: minutesAgo(now, 7),
            error: null,
          },
        });

        const wakeupId = deterministicUuid(
          officeId,
          "agent-wakeup",
          DEMO_AGENT_TASK_KEY,
        );
        await tx.agentWakeupRequest.upsert({
          where: { id: wakeupId },
          create: {
            id: wakeupId,
            officeId,
            sessionId: session.id,
            source: "api",
            reason: `${DEMO_TAG} 전체 CP 광고 동기화와 네이버 비교`,
            payload: {
              workflow: "my_advertisements_full_refresh",
              compareEveryImportedAdvertisement: true,
              demo: true,
            },
            status: "completed",
            requestedBy: reviewer.id,
            requestedAt: minutesAgo(now, 12),
            claimedBy: "demo-skill-worker",
            claimedAt: minutesAgo(now, 11),
            finishedAt: minutesAgo(now, 7),
          },
          update: {
            officeId,
            sessionId: session.id,
            source: "api",
            reason: `${DEMO_TAG} 전체 CP 광고 동기화와 네이버 비교`,
            payload: {
              workflow: "my_advertisements_full_refresh",
              compareEveryImportedAdvertisement: true,
              demo: true,
            },
            status: "completed",
            requestedBy: reviewer.id,
            requestedAt: minutesAgo(now, 12),
            claimedBy: "demo-skill-worker",
            claimedAt: minutesAgo(now, 11),
            leaseExpiresAt: null,
            finishedAt: minutesAgo(now, 7),
            error: null,
          },
        });
      }
    },
    { timeout: 30_000 },
  );

  const inserted = await prisma.listingAdvertisement.findMany({
    where: { officeId, memo: { contains: DEMO_TAG } },
    include: {
      listing: {
        include: {
          property: {
            include: {
              site: true,
              unit: { include: { dong: true } },
            },
          },
        },
      },
      officeAdvertisementGroup: {
        include: { mainAdvertisement: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n✅ ${office.name} 내 광고 관리 데모 데이터 준비 완료`);
  console.table(
    inserted.map((advertisement) => ({
      CP: channelLabel(advertisement.channel as Scenario["channel"]),
      상태: advertisement.status,
      거래: transactionLabel(
        advertisement.listing.transactionType as Scenario["transactionType"],
      ),
      단지: advertisement.listing.property.site.name,
      동: advertisement.listing.property.unit?.dong.name ?? "-",
      호: advertisement.listing.property.unit?.name ?? "-",
      순위:
        advertisement.officeAdvertisementGroup?.mainAdvertisement?.ranking ??
        "대기",
    })),
  );
  console.log(
    `광고 ${inserted.length}건 · 네이버 비교 완료 ${
      comparisonRows.filter(
        (row) =>
          row.scenario.analysis !== "comparison_pending" &&
          row.scenario.analysis !== "naver_link_pending",
      ).length
    }건 · 비교 대기 ${
      comparisonRows.filter(
        (row) =>
          row.scenario.analysis === "comparison_pending" ||
          row.scenario.analysis === "naver_link_pending",
      ).length
    }건`,
  );
}

main()
  .catch((error) => {
    console.error("❌ 내 광고 관리 데모 시드 실패");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
