import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ListingAdvertisementWithListing,
  OfficeAdvertisement,
} from "@estate-erp/api-client";
import {
  advertisementMatchesFilters,
  advertisementMatchesView,
  shouldShowMonthlyRentFilter,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-filters";
import {
  initialMyAdsFilters,
  type MyAdsFilterState,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-types";

const observedAt = "2026-11-15T00:00:00.000Z";
const DAY = 86_400_000;

function officeAd(overrides: Partial<OfficeAdvertisement> = {}): OfficeAdvertisement {
  return {
    id: "own",
    officeId: "office-1",
    groupId: "group-1",
    articleNo: "100",
    sourceUrl: null,
    isMine: true,
    isMain: true,
    isActive: true,
    articleName: null,
    realtorName: null,
    realtorId: null,
    representativeTelNo: null,
    price: 150_000,
    deposit: null,
    monthlyRent: null,
    ranking: 1,
    sameAddrCnt: 1,
    articleConfirmYmd: "20261115",
    floorInfo: "12/25",
    floorExposureMode: "exact",
    verificationTypeCode: "OWNER",
    seango: false,
    epju: false,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    createdAt: observedAt,
    updatedAt: observedAt,
    ...overrides,
  };
}

function competitor(overrides: Partial<OfficeAdvertisement> = {}): OfficeAdvertisement {
  return officeAd({
    id: `competitor-${overrides.articleNo ?? "101"}`,
    articleNo: "101",
    isMine: false,
    isMain: false,
    ranking: 2,
    verificationTypeCode: null,
    ...overrides,
  });
}

type AdOptions = {
  id?: string;
  siteId?: string;
  dong?: string | null;
  ho?: string | null;
  transactionType?: "sale" | "jeonse" | "monthly";
  channel?: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  /** false면 CP 결과에서 네이버 링크를 확인하지 못한 광고 */
  naverLinked?: boolean;
  /** null이면 아직 네이버 비교 결과가 없는 광고 */
  own?: Partial<OfficeAdvertisement> | null;
  competitors?: OfficeAdvertisement[];
};

function ad(options: AdOptions = {}): ListingAdvertisementWithListing {
  const transactionType = options.transactionType ?? "sale";
  const price = options.price === undefined ? 150_000 : options.price;
  const deposit = options.deposit ?? null;
  const monthlyRent = options.monthlyRent ?? null;
  const own =
    options.own === null
      ? null
      : officeAd({ price, deposit, monthlyRent, ...options.own });
  const naverLinked = options.naverLinked ?? true;
  return {
    id: options.id ?? "ad-1",
    officeId: "office-1",
    listingId: "listing-1",
    channel: options.channel ?? "esiljang",
    status: "active",
    source: "cp_sync",
    advertisedPrice: price,
    advertisedDeposit: deposit,
    advertisedMonthlyRent: monthlyRent,
    startedAt: options.startedAt ?? null,
    endedAt: options.endedAt ?? null,
    naverArticleNo: naverLinked ? "100" : null,
    naverUrl: naverLinked ? "https://new.land.naver.com/" : null,
    listing: {
      id: "listing-1",
      propertyId: "property-1",
      transactionType,
      property: {
        site: { id: options.siteId ?? "site-a", name: "래미안고덕" },
        unit: {
          name: options.ho === undefined ? "1503호" : options.ho,
          dong: options.dong === null ? null : { name: options.dong ?? "101동" },
        },
      },
    },
    comparison: own
      ? {
          id: "group-1",
          mainAdvertisementId: own.id,
          mainAdvertisement: own,
          advertisements: [own, ...(options.competitors ?? [])],
        }
      : null,
  } as unknown as ListingAdvertisementWithListing;
}

function filtersWith(patch: Partial<MyAdsFilterState>): MyAdsFilterState {
  return { ...initialMyAdsFilters, ...patch };
}

function matches(advertisement: ListingAdvertisementWithListing, patch: Partial<MyAdsFilterState>) {
  return advertisementMatchesFilters(advertisement, filtersWith(patch));
}

describe("my ads filter predicates", () => {
  it("lets every advertisement through when no filter is set", () => {
    for (const advertisement of [
      ad(),
      ad({ own: null, naverLinked: false, dong: null, ho: null }),
      ad({ transactionType: "monthly", price: null, deposit: 5_000, monthlyRent: 120 }),
    ]) {
      assert.equal(advertisementMatchesFilters(advertisement, initialMyAdsFilters), true);
    }
  });

  it("narrows by site, and by dong/ho text ignoring spaces and case", () => {
    const advertisement = ad({ siteId: "site-a", dong: "A 101동", ho: "1503호" });

    assert.equal(matches(advertisement, { siteIds: ["site-a", "site-b"] }), true);
    assert.equal(matches(advertisement, { siteIds: ["site-b"] }), false);
    assert.equal(matches(advertisement, { dongSearch: "101" }), true);
    assert.equal(matches(advertisement, { dongSearch: "a101" }), true);
    assert.equal(matches(advertisement, { dongSearch: "102" }), false);
    assert.equal(matches(advertisement, { unitSearch: "1503" }), true);
    assert.equal(matches(advertisement, { unitSearch: " 15 03 " }), true);
    assert.equal(matches(advertisement, { unitSearch: "1504" }), false);
    // 위치를 모르는 광고는 동·호 검색에 걸리지 않는다
    assert.equal(matches(ad({ dong: null }), { dongSearch: "101" }), false);
    assert.equal(matches(ad({ ho: null }), { unitSearch: "1503" }), false);
  });

  it("narrows by transaction type and CP channel", () => {
    const sale = ad({ transactionType: "sale", channel: "esiljang" });
    const jeonse = ad({ transactionType: "jeonse", channel: "budongsanbank", price: null, deposit: 80_000 });

    assert.equal(matches(sale, { transactionType: "sale" }), true);
    assert.equal(matches(sale, { transactionType: "jeonse" }), false);
    assert.equal(matches(jeonse, { transactionType: "jeonse" }), true);
    assert.equal(matches(sale, { channel: "esiljang" }), true);
    assert.equal(matches(sale, { channel: "budongsanbank" }), false);
    assert.equal(matches(jeonse, { channel: "budongsanbank" }), true);
  });

  it("compares the price range with the sale price, or the deposit for jeonse and monthly", () => {
    const sale = ad({ transactionType: "sale", price: 150_000 });
    const jeonse = ad({ transactionType: "jeonse", price: null, deposit: 80_000 });
    const monthly = ad({ transactionType: "monthly", price: null, deposit: 5_000, monthlyRent: 120 });

    assert.equal(matches(sale, { primaryAmountMin: "150000", primaryAmountMax: "150000" }), true);
    assert.equal(matches(sale, { primaryAmountMin: "150001" }), false);
    assert.equal(matches(sale, { primaryAmountMax: "149999" }), false);
    assert.equal(matches(jeonse, { primaryAmountMin: "70000", primaryAmountMax: "90000" }), true);
    assert.equal(matches(jeonse, { primaryAmountMax: "79999" }), false);
    assert.equal(matches(monthly, { primaryAmountMin: "3000", primaryAmountMax: "5000" }), true);
    assert.equal(matches(monthly, { primaryAmountMin: "5001" }), false);
    // 0원도 금액이다. 금액을 모르는 광고는 범위가 걸리면 빠진다
    assert.equal(matches(ad({ price: 0 }), { primaryAmountMax: "1000" }), true);
    assert.equal(matches(ad({ price: null }), { primaryAmountMin: "1" }), false);
    // 숫자가 아닌 값은 제한이 없는 것으로 본다
    assert.equal(matches(sale, { primaryAmountMin: "abc" }), true);
  });

  it("applies the monthly rent range only to monthly advertisements", () => {
    const monthly = ad({ transactionType: "monthly", price: null, deposit: 5_000, monthlyRent: 120 });
    const sale = ad({ transactionType: "sale", monthlyRent: 120 });

    assert.equal(matches(monthly, { monthlyRentMin: "100", monthlyRentMax: "150" }), true);
    assert.equal(matches(monthly, { monthlyRentMax: "119" }), false);
    assert.equal(matches(monthly, { monthlyRentMin: "121" }), false);
    // 월세 조건이 걸리면 매매·전세 광고는 월세를 모르는 광고처럼 빠진다
    assert.equal(matches(sale, { monthlyRentMin: "100" }), false);
    assert.equal(matches(sale, {}), true);
  });

  it("classifies the competition signal", () => {
    const cheaper = ad({ competitors: [competitor({ price: 149_000 })] });
    const floorDisadvantage = ad({
      own: { floorInfo: "중/25", floorExposureMode: "band" },
      competitors: [competitor({ price: 150_000, floorInfo: "12/25", floorExposureMode: "exact" })],
    });
    const rankDisadvantage = ad({
      own: { ranking: 8, sameAddrCnt: 10 },
      competitors: [competitor({ ranking: 1, price: 151_000 })],
    });
    const ownInactive = ad({ own: { isActive: false } });
    const pendingWithoutLink = ad({ naverLinked: false, competitors: [competitor({ price: 1 })] });
    const pendingWithoutComparison = ad({ own: null });
    const clear = ad({ competitors: [competitor({ price: 151_000 })] });

    const expectations: Array<[ListingAdvertisementWithListing, MyAdsFilterState["comparison"]]> = [
      [cheaper, "lower_price"],
      [floorDisadvantage, "floor_disadvantage"],
      [rankDisadvantage, "rank_disadvantage"],
      [ownInactive, "own_inactive"],
      [pendingWithoutLink, "pending"],
      [pendingWithoutComparison, "pending"],
      [clear, "clear"],
    ];
    const allValues = expectations.map(([, value]) => value);
    for (const [advertisement, expected] of expectations) {
      for (const value of allValues) {
        assert.equal(
          matches(advertisement, { comparison: value }),
          value === expected,
          `${expected} advertisement with comparison=${value}`,
        );
      }
    }
  });

  it("classifies the verification method from the own Naver advertisement", () => {
    const cases: Array<[string | null, MyAdsFilterState["verification"]]> = [
      ["OWNER", "owner"],
      ["NDOC1", "document"],
      ["MOBILE_PHONE", "phone"],
      ["AGENT_CHECK", "agent"],
      ["SOMETHING_ELSE", "unknown"],
      [null, "unknown"],
    ];
    for (const [code, expected] of cases) {
      const advertisement = ad({ own: { verificationTypeCode: code } });
      assert.equal(matches(advertisement, { verification: expected }), true, `${code} → ${expected}`);
      const other = expected === "owner" ? "document" : "owner";
      assert.equal(matches(advertisement, { verification: other }), false, `${code} ↛ ${other}`);
    }
    // 네이버 비교 결과가 없으면 미확인이다
    assert.equal(matches(ad({ own: null }), { verification: "unknown" }), true);
  });

  it("classifies floor exposure, with disadvantage meaning masked while a competitor shows the floor", () => {
    const exact = ad({ own: { floorInfo: "12/25", floorExposureMode: "exact" } });
    const bandAlone = ad({ own: { floorInfo: "중/25", floorExposureMode: "band" } });
    const bandBehindExact = ad({
      own: { floorInfo: "중/25", floorExposureMode: "band" },
      competitors: [competitor({ floorInfo: "12/25", floorExposureMode: "exact" })],
    });
    const unknown = ad({ own: { floorInfo: null, floorExposureMode: "unknown" } });

    assert.equal(matches(exact, { floorExposure: "exact" }), true);
    assert.equal(matches(exact, { floorExposure: "band" }), false);
    assert.equal(matches(bandAlone, { floorExposure: "band" }), true);
    assert.equal(matches(bandAlone, { floorExposure: "disadvantage" }), false);
    assert.equal(matches(bandBehindExact, { floorExposure: "band" }), true);
    assert.equal(matches(bandBehindExact, { floorExposure: "disadvantage" }), true);
    assert.equal(matches(unknown, { floorExposure: "unknown" }), true);
    assert.equal(matches(unknown, { floorExposure: "exact" }), false);
    assert.equal(matches(ad({ own: null }), { floorExposure: "unknown" }), true);
  });

  it("buckets the exposure period from the CP start date", () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();
    const cases: Array<[ListingAdvertisementWithListing, MyAdsFilterState["exposurePeriod"]]> = [
      [ad({ startedAt: daysAgo(3) }), "within_7_days"],
      [ad({ startedAt: daysAgo(20) }), "within_30_days"],
      [ad({ startedAt: daysAgo(60) }), "over_30_days"],
      // 내려간 광고는 종료일까지 센다
      [ad({ startedAt: daysAgo(60), endedAt: daysAgo(57) }), "within_7_days"],
      [ad({ startedAt: null }), "unknown"],
    ];
    const allValues: MyAdsFilterState["exposurePeriod"][] = [
      "within_7_days",
      "within_30_days",
      "over_30_days",
      "unknown",
    ];
    for (const [advertisement, expected] of cases) {
      for (const value of allValues) {
        assert.equal(
          matches(advertisement, { exposurePeriod: value }),
          value === expected,
          `${expected} advertisement with exposurePeriod=${value}`,
        );
      }
    }
  });

  it("requires every set filter to match at once", () => {
    const advertisement = ad({
      siteId: "site-a",
      transactionType: "monthly",
      channel: "budongsanbank",
      price: null,
      deposit: 5_000,
      monthlyRent: 120,
      competitors: [competitor({ price: null, deposit: 4_000, monthlyRent: 100 })],
    });
    const all: Partial<MyAdsFilterState> = {
      siteIds: ["site-a"],
      dongSearch: "101",
      unitSearch: "1503",
      transactionType: "monthly",
      channel: "budongsanbank",
      primaryAmountMin: "5000",
      monthlyRentMax: "120",
      verification: "owner",
      floorExposure: "exact",
      comparison: "lower_price",
    };
    assert.equal(matches(advertisement, all), true);
    for (const [field, value] of [
      ["channel", "esiljang"],
      ["monthlyRentMax", "119"],
      ["comparison", "clear"],
    ] as const) {
      assert.equal(matches(advertisement, { ...all, [field]: value }), false, field);
    }
  });
});

describe("my ads view tabs", () => {
  it("separates comparison-pending and review-needed advertisements", () => {
    const pendingWithoutLink = ad({ naverLinked: false, own: null });
    const pendingWithoutComparison = ad({ own: null });
    const cheaper = ad({ competitors: [competitor({ price: 149_000 })] });
    const clear = ad({ competitors: [competitor({ price: 151_000 })] });

    for (const advertisement of [pendingWithoutLink, pendingWithoutComparison, cheaper, clear]) {
      assert.equal(advertisementMatchesView(advertisement, "all"), true);
    }
    assert.equal(advertisementMatchesView(pendingWithoutLink, "comparison_pending"), true);
    assert.equal(advertisementMatchesView(pendingWithoutComparison, "comparison_pending"), true);
    assert.equal(advertisementMatchesView(cheaper, "comparison_pending"), false);
    assert.equal(advertisementMatchesView(cheaper, "attention"), true);
    assert.equal(advertisementMatchesView(clear, "attention"), false);
    assert.equal(advertisementMatchesView(pendingWithoutComparison, "attention"), false);
  });
});

describe("my ads monthly rent chip visibility", () => {
  it("follows the property page: always for all/monthly, otherwise only while a value remains", () => {
    assert.equal(shouldShowMonthlyRentFilter(filtersWith({ transactionType: "all" })), true);
    assert.equal(shouldShowMonthlyRentFilter(filtersWith({ transactionType: "monthly" })), true);
    assert.equal(shouldShowMonthlyRentFilter(filtersWith({ transactionType: "sale" })), false);
    assert.equal(shouldShowMonthlyRentFilter(filtersWith({ transactionType: "jeonse" })), false);
    assert.equal(
      shouldShowMonthlyRentFilter(filtersWith({ transactionType: "sale", monthlyRentMin: "100" })),
      true,
    );
    assert.equal(
      shouldShowMonthlyRentFilter(filtersWith({ transactionType: "jeonse", monthlyRentMax: "200" })),
      true,
    );
  });
});
