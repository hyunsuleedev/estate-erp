import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeOfficeAdvertisementComparison,
} from "../../../packages/api-client/src/modules/office-advertisement-analysis.ts";
import type {
  ListingAdvertisementWithListing,
} from "../../../packages/api-client/src/modules/listing-advertisements.ts";
import type {
  OfficeAdvertisement,
} from "../../../packages/api-client/src/modules/office-advertisements.ts";
import {
  inferOfficeAdvertisementFloorExposureMode,
} from "../../../packages/shared/src/enums.ts";

const observedAt = "2026-07-29T12:00:00.000Z";

function officeAdvertisement(
  overrides: Partial<OfficeAdvertisement> = {},
): OfficeAdvertisement {
  return {
    id: "office-ad-1",
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
    sameAddrCnt: 2,
    articleConfirmYmd: "20260729",
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

function listingAdvertisement(
  own: OfficeAdvertisement,
  competitors: OfficeAdvertisement[],
  transactionType: "sale" | "jeonse" | "monthly" = "sale",
): ListingAdvertisementWithListing {
  return {
    id: "listing-ad-1",
    officeId: "office-1",
    listingId: "listing-1",
    channel: "esiljang",
    status: "active",
    source: "cp_sync",
    advertisedPrice: own.price,
    advertisedDeposit: own.deposit,
    advertisedMonthlyRent: own.monthlyRent,
    startedAt: null,
    endedAt: null,
    url: null,
    memo: null,
    externalAdId: "cp-1",
    naverArticleNo: own.articleNo,
    naverUrl: "https://new.land.naver.com/",
    lastCheckedAt: observedAt,
    lastSyncedAt: observedAt,
    createdAt: observedAt,
    updatedAt: observedAt,
    listing: {
      id: "listing-1",
      officeId: "office-1",
      propertyId: "property-1",
      transactionType,
    } as ListingAdvertisementWithListing["listing"],
    officeAdvertisementGroup: {
      id: "group-1",
      officeId: "office-1",
      listingAdvertisementId: "listing-ad-1",
      mainAdvertisementId: own.id,
      memo: null,
      ownPrice: own.price,
      ownDeposit: own.deposit,
      ownMonthlyRent: own.monthlyRent,
      relatedPriceMin: null,
      relatedPriceMax: null,
      relatedCount: competitors.length,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      lastSyncedAt: observedAt,
      createdAt: observedAt,
      updatedAt: observedAt,
      mainAdvertisement: own,
      advertisements: [own, ...competitors],
    },
  };
}

describe("office advertisement comparison analysis", () => {
  it("classifies exact, band, and unknown floor exposure without using Unit.floor", () => {
    assert.equal(inferOfficeAdvertisementFloorExposureMode("12/25"), "exact");
    assert.equal(inferOfficeAdvertisementFloorExposureMode("B1/5"), "exact");
    assert.equal(inferOfficeAdvertisementFloorExposureMode("저/25"), "band");
    assert.equal(inferOfficeAdvertisementFloorExposureMode(null), "unknown");
  });

  it("warns when any cheaper same-unit advertisement exists even if it ranks behind", () => {
    const own = officeAdvertisement({ ranking: 1, price: 150_000 });
    const cheaperBehind = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      ranking: 5,
      price: 149_000,
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, [cheaperBehind]),
    );

    assert.equal(result.primarySignal, "lower_price_competitor");
    assert.equal(result.hasReviewSignal, true);
    assert.equal(result.lowerPricedCompetitorCount, 1);
    assert.equal(result.lowerPricedAheadCount, 0);
    assert.equal(result.priceGapAgainstLowest, 1_000);
  });

  it("still warns about a cheaper advertisement when ranking evidence is missing", () => {
    const own = officeAdvertisement({ ranking: null, price: 150_000 });
    const cheaper = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      ranking: null,
      price: 149_000,
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, [cheaper]),
    );

    assert.equal(result.primarySignal, "lower_price_competitor");
    assert.equal(result.hasReviewSignal, true);
    assert.equal(result.lowerPricedCompetitorCount, 1);
  });

  it("warns when my floor is masked and another advertisement exposes the exact floor", () => {
    const own = officeAdvertisement({
      floorInfo: "중/25",
      floorExposureMode: "band",
      ranking: 2,
    });
    const exactFloorCompetitor = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      ranking: 5,
      price: 150_000,
      floorInfo: "12/25",
      floorExposureMode: "exact",
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, [exactFloorCompetitor]),
    );

    assert.equal(result.primarySignal, "floor_exposure_disadvantage");
    assert.equal(result.exactFloorCompetitorCount, 1);
    assert.equal(result.hasReviewSignal, true);
  });

  it("does not call a monthly trade-off cheaper when deposit and rent move in opposite directions", () => {
    const own = officeAdvertisement({
      price: null,
      deposit: 5_000,
      monthlyRent: 180,
    });
    const tradeOff = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      price: null,
      deposit: 4_000,
      monthlyRent: 200,
      ranking: 2,
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, [tradeOff], "monthly"),
    );

    assert.equal(result.lowerPricedCompetitorCount, 0);
    assert.equal(result.competitors[0]?.priceRelation, "incomparable");
    assert.equal(result.hasReviewSignal, false);
  });

  it("warns for a Pareto-cheaper monthly advertisement", () => {
    const own = officeAdvertisement({
      price: null,
      deposit: 5_000,
      monthlyRent: 180,
    });
    const cheaper = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      price: null,
      deposit: 5_000,
      monthlyRent: 170,
      ranking: 5,
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, [cheaper], "monthly"),
    );

    assert.equal(result.primarySignal, "lower_price_competitor");
    assert.equal(result.lowerPricedCompetitorCount, 1);
    assert.equal(result.lowerPricedAheadCount, 0);
  });

  it("ignores inactive cheaper rows", () => {
    const own = officeAdvertisement({ ranking: 1, price: 150_000 });
    const inactiveCheaper = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      isActive: false,
      ranking: 2,
      price: 149_000,
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, [inactiveCheaper]),
    );

    assert.equal(result.primarySignal, "competitive");
    assert.equal(result.lowerPricedCompetitorCount, 0);
    assert.equal(result.hasReviewSignal, false);
  });

  it("keeps the cheaper-price warning ahead of a simultaneous floor warning", () => {
    const own = officeAdvertisement({
      floorInfo: "중/25",
      floorExposureMode: "band",
      price: 150_000,
    });
    const cheaperExact = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      ranking: 5,
      price: 149_000,
      floorInfo: "12/25",
      floorExposureMode: "exact",
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, [cheaperExact]),
    );

    assert.equal(result.primarySignal, "lower_price_competitor");
    assert.equal(result.exactFloorCompetitorCount, 1);
  });

  it("treats a Naver-inactive own advertisement as a review warning", () => {
    const own = officeAdvertisement({
      isActive: false,
      ranking: null,
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, []),
    );

    assert.equal(result.primarySignal, "own_ad_inactive");
    assert.equal(result.hasReviewSignal, true);
  });

  it("uses deposit first for jeonse and price only as a fallback", () => {
    const own = officeAdvertisement({
      price: 200_000,
      deposit: 100_000,
    });
    const priceOnlyCheaper = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      price: 90_000,
      deposit: null,
      ranking: 5,
    });
    const depositHigherDespitePrice = officeAdvertisement({
      id: "office-ad-3",
      articleNo: "102",
      isMine: false,
      isMain: false,
      price: 50_000,
      deposit: 110_000,
      ranking: 6,
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(
        own,
        [priceOnlyCheaper, depositHigherDespitePrice],
        "jeonse",
      ),
    );

    assert.equal(result.competitors[0]?.priceRelation, "lower");
    assert.equal(result.competitors[1]?.priceRelation, "higher");
    assert.equal(result.lowerPricedCompetitorCount, 1);
  });

  it("keeps fully equal monthly terms out of the cheaper warning", () => {
    const own = officeAdvertisement({
      price: null,
      deposit: 5_000,
      monthlyRent: 180,
    });
    const same = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      price: null,
      deposit: 5_000,
      monthlyRent: 180,
      ranking: 2,
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, [same], "monthly"),
    );

    assert.equal(result.competitors[0]?.priceRelation, "same");
    assert.equal(result.lowerPricedCompetitorCount, 0);
  });

  it("treats lower deposit with equal monthly rent as Pareto-cheaper", () => {
    const own = officeAdvertisement({
      price: null,
      deposit: 5_000,
      monthlyRent: 180,
    });
    const cheaper = officeAdvertisement({
      id: "office-ad-2",
      articleNo: "101",
      isMine: false,
      isMain: false,
      price: null,
      deposit: 4_000,
      monthlyRent: 180,
      ranking: 5,
    });

    const result = analyzeOfficeAdvertisementComparison(
      listingAdvertisement(own, [cheaper], "monthly"),
    );

    assert.equal(result.primarySignal, "lower_price_competitor");
    assert.equal(result.lowerPricedCompetitorCount, 1);
  });
});
