import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import {
  estimateMyAdsAnalysisPanelHeight,
  myAdsAnalysisPanelSummary,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-analysis-summary";
import {
  myAdsExpandScrollAdjustment,
  nextMyAdsExpandedIds,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-expansion";

type Compared = {
  id: string;
  isMine: boolean;
  isActive?: boolean;
  ranking?: number | null;
  price?: number | null;
};

function ad({
  group = true,
  ownRanking = 2,
  ownPrice = 100000,
  compared = [],
  memo = null,
}: {
  group?: boolean;
  ownRanking?: number | null;
  ownPrice?: number;
  compared?: Compared[];
  memo?: string | null;
} = {}): ListingAdvertisementWithListing {
  const row = (value: Compared) => ({
    id: value.id,
    isMine: value.isMine,
    isActive: value.isActive ?? true,
    ranking: value.ranking ?? null,
    price: value.price ?? null,
    deposit: null,
    monthlyRent: null,
    floorInfo: null,
    floorExposureMode: null,
  });
  const mine = row({ id: "mine", isMine: true, ranking: ownRanking, price: ownPrice });
  return {
    id: "ad-1",
    advertisedPrice: ownPrice,
    // 묶음 표가 없어져 메모는 광고의 것이다
    memo,
    listing: { transactionType: "sale" },
    comparison: group
      ? {
          observedAt: "2026-11-18T00:00:00.000Z",
          ownAdvertisement: mine,
          advertisements: [mine, ...compared.map(row)],
        }
      : null,
  } as unknown as ListingAdvertisementWithListing;
}

describe("my ads analysis panel estimate", () => {
  it("estimates the expanded panel height from the comparison rows and memo", () => {
    // 1280·1600 폭에서 잰 실제 높이: 줄 0·1개 336, 3개 410, 9개 632, 메모 +24
    assert.equal(estimateMyAdsAnalysisPanelHeight(ad({ group: false })), 336);
    assert.equal(estimateMyAdsAnalysisPanelHeight(ad()), 336);
    assert.equal(
      estimateMyAdsAnalysisPanelHeight(
        ad({ compared: [{ id: "a", isMine: false }, { id: "b", isMine: false }] }),
      ),
      410,
    );
    const eight = Array.from({ length: 8 }, (_, index) => ({
      id: `c${index}`,
      isMine: false,
    }));
    assert.equal(estimateMyAdsAnalysisPanelHeight(ad({ compared: eight })), 632);
    assert.equal(estimateMyAdsAnalysisPanelHeight(ad({ compared: eight, memo: "급매" })), 656);
    // 노출이 끝난 광고는 표에 없다
    assert.equal(
      estimateMyAdsAnalysisPanelHeight(
        ad({ compared: [{ id: "x", isMine: false, isActive: false }] }),
      ),
      336,
    );
  });
});

describe("my ads analysis panel wording", () => {
  it("does not claim there is no cheaper or leading ad before the NAVER comparison", () => {
    const summary = myAdsAnalysisPanelSummary(ad({ group: false }));
    assert.equal(summary.hasComparison, false);
    assert.equal(summary.priceCompetition, "네이버 비교 전이라 판단할 수 없음");
    assert.equal(summary.priceDetail, "네이버 비교 전이라 판단할 수 없음");
    assert.equal(summary.rankingDetail, "네이버 비교 전");
    assert.doesNotMatch(
      Object.values(summary).join(" "),
      /앞선 광고 없음|더 낮은 비교 광고 없음/,
    );
  });

  it("compares prices without guessing who leads when my ranking is unknown", () => {
    const summary = myAdsAnalysisPanelSummary(
      ad({
        ownRanking: null,
        compared: [{ id: "cheap", isMine: false, ranking: 1, price: 90000 }],
      }),
    );
    assert.equal(summary.rankingDetail, "순위 미확인");
    assert.equal(summary.priceDetail, "더 낮은 비교 광고 1건 · 순위 미확인");
    assert.equal(summary.priceCompetition, "더 낮은 광고 1건 · 앞섬 여부는 순위 확인 후");
  });

  it("keeps the ranked wording when the comparison is complete", () => {
    const summary = myAdsAnalysisPanelSummary(
      ad({
        ownRanking: 3,
        compared: [
          { id: "cheap-ahead", isMine: false, ranking: 1, price: 90000 },
          { id: "pricey-ahead", isMine: false, ranking: 2, price: 120000 },
        ],
      }),
    );
    assert.equal(summary.rankingDetail, "앞선 광고 2건");
    assert.equal(summary.priceDetail, "더 낮고 앞선 광고 1건");
    assert.equal(summary.priceCompetition, "더 낮고 앞선 광고 1건");
    assert.equal(
      myAdsAnalysisPanelSummary(ad({ ownRanking: 1 })).priceCompetition,
      "가격 조건으로 앞선 광고 없음",
    );
  });

  it("counts competitors only, not my own row", () => {
    assert.equal(myAdsAnalysisPanelSummary(ad()).competitorCount, 0);
    assert.equal(
      myAdsAnalysisPanelSummary(
        ad({
          compared: [
            { id: "a", isMine: false },
            { id: "b", isMine: false, isActive: false },
          ],
        }),
      ).competitorCount,
      1,
    );
  });
});

describe("my ads single-row expansion", () => {
  it("opens one row at a time and closes the open row on a second click", () => {
    const open = nextMyAdsExpandedIds(new Set(), "a");
    assert.deepEqual([...open], ["a"]);
    assert.deepEqual([...nextMyAdsExpandedIds(open, "b")], ["b"]);
    assert.deepEqual([...nextMyAdsExpandedIds(open, "a")], []);
  });

  it("scrolls by how far the clicked row moved so it stays under the pointer", () => {
    // 위에 열려 있던 632px 패널이 닫혀 행이 462 → -170으로 올라갔다
    assert.equal(
      myAdsExpandScrollAdjustment({
        anchorTopBefore: 462,
        anchorTopAfter: -170,
        collapsedHeightAbove: 632,
      }),
      -632,
    );
    // 가상 스크롤로 행이 빠져 위치를 잴 수 없으면 닫힌 위쪽 패널 높이만큼 되돌린다
    assert.equal(
      myAdsExpandScrollAdjustment({
        anchorTopBefore: 462,
        anchorTopAfter: null,
        collapsedHeightAbove: 632,
      }),
      -632,
    );
    // 열린 패널이 아래에 있었으면 움직이지 않는다
    assert.equal(
      myAdsExpandScrollAdjustment({
        anchorTopBefore: 300,
        anchorTopAfter: 300,
        collapsedHeightAbove: 0,
      }),
      0,
    );
  });
});
