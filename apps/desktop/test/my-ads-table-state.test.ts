import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import {
  defaultMyAdsTablePreferences,
  MAX_MY_ADS_COLUMN_WIDTH,
  MY_ADS_WIDTH_DEFAULTS_VERSION,
  myAdsDefaultColumnWidth,
  myAdsMinColumnWidth,
  myAdsSortToSorting,
  myAdsTablePreferencesKey,
  normalizeMyAdsColumnWidths,
  parseMyAdsTablePreferences,
  serializeMyAdsTablePreferences,
  sortingToMyAdsSort,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-table-state";
import {
  advertisementCheckedAtTime,
  sortAdvertisements,
  ymdToTime,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-sort";
import { loadAllAdvertisementPages } from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-load";
import {
  advertisementExposureElapsedDays,
  hasMyAdsNarrowingConditions,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-filters";
import { advertisementLocationLabel } from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-location";
import { inlinePrimaryAmountName } from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-cells";
import { initialMyAdsFilters } from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-types";

function ad(
  id: string,
  values: {
    articleConfirmYmd?: string | null;
    lastCheckedAt?: string | null;
    site?: string;
    dong?: string | null;
    ho?: string | null;
  } = {},
): ListingAdvertisementWithListing {
  return {
    id,
    lastCheckedAt: values.lastCheckedAt ?? null,
    comparison:
      values.articleConfirmYmd === undefined
        ? null
        : { ownAdvertisement: { articleConfirmYmd: values.articleConfirmYmd } },
    listing: {
      property: {
        site: { name: values.site ?? "래미안고덕" },
        unit: {
          name: values.ho ?? null,
          dong: values.dong === undefined ? null : { name: values.dong },
        },
      },
    },
  } as unknown as ListingAdvertisementWithListing;
}

describe("my ads table preferences", () => {
  it("stores one layout per office and user", () => {
    assert.equal(
      myAdsTablePreferencesKey("office-1", "user-1"),
      "estate:my-ads-table:v1:office-1:user-1",
    );
  });

  it("falls back to defaults for broken stored values", () => {
    for (const raw of [null, "", "not json", "[]", "42", '"text"', "null"]) {
      assert.deepEqual(parseMyAdsTablePreferences(raw), defaultMyAdsTablePreferences);
    }
  });

  it("clamps widths, drops unknown or default widths, and never stores the fill column", () => {
    const parsed = parseMyAdsTablePreferences(
      JSON.stringify({
        widths: {
          site: 10,
          price: 5000,
          dong: 80.6,
          ho: myAdsDefaultColumnWidth("ho"),
          analysis: 400,
          unknown: 200,
          floor: "wide",
          type: Number.NaN,
        },
      }),
    );
    assert.deepEqual(parsed.widths, {
      site: myAdsMinColumnWidth("site"),
      price: MAX_MY_ADS_COLUMN_WIDTH,
      dong: 81,
    });
    assert.equal(parsed.sort, null);
  });

  it("keeps only a valid single-column sort", () => {
    assert.deepEqual(
      parseMyAdsTablePreferences(
        JSON.stringify({ sort: { column: "checkedAt", direction: "desc" } }),
      ).sort,
      { column: "checkedAt", direction: "desc" },
    );
    assert.deepEqual(
      parseMyAdsTablePreferences(
        JSON.stringify({ sort: { column: "analysis", direction: "asc" } }),
      ).sort,
      { column: "analysis", direction: "asc" },
    );
    for (const sort of [
      { column: "naver", direction: "asc" },
      { column: "unknown", direction: "asc" },
      { column: "price", direction: "up" },
      ["price", "asc"],
    ]) {
      assert.equal(parseMyAdsTablePreferences(JSON.stringify({ sort })).sort, null);
    }
  });

  it("converts between table sorting and the stored sort", () => {
    assert.deepEqual(myAdsSortToSorting(null), []);
    assert.deepEqual(myAdsSortToSorting({ column: "price", direction: "desc" }), [
      { id: "price", desc: true },
    ]);
    assert.deepEqual(sortingToMyAdsSort([{ id: "ranking", desc: false }]), {
      column: "ranking",
      direction: "asc",
    });
    assert.equal(sortingToMyAdsSort([]), null);
    assert.equal(sortingToMyAdsSort([{ id: "naver", desc: false }]), null);
  });

  it("normalizes widths reported by the table", () => {
    assert.deepEqual(normalizeMyAdsColumnWidths({ price: 200.4, site: 156 }), {
      price: 200,
    });
    assert.deepEqual(normalizeMyAdsColumnWidths(null), {});
  });

  it("lets columns the user never resized follow the new default widths", () => {
    // 판 번호 없는(옛 판) 저장값의 옛 기본 너비는 버리고, 사용자가 끈 너비는 남긴다
    const legacy = parseMyAdsTablePreferences(
      JSON.stringify({ widths: { ho: 64, type: 64, transaction: 64, channel: 96, site: 200, dong: 70 } }),
    );
    assert.deepEqual(legacy.widths, { site: 200, dong: 70 });
    // 새 판에서 저장한 값은 옛 기본값과 같아도 사용자가 고른 너비다
    const current = parseMyAdsTablePreferences(
      serializeMyAdsTablePreferences({ widths: { ho: 64 }, sort: null }),
    );
    assert.deepEqual(current.widths, { ho: 64 });
    assert.equal(
      JSON.parse(serializeMyAdsTablePreferences(defaultMyAdsTablePreferences))
        .widthDefaultsVersion,
      MY_ADS_WIDTH_DEFAULTS_VERSION,
    );
  });

  it("fits header labels and common values at the default widths", () => {
    // 머리 칸: 좌우 여백 20 + 선 1 + 아이콘 16 + 간격 6 + 13px 글자(한글 13, 그 밖 7)
    const textWidth = (text: string, hangul: number, other: number) =>
      [...text].reduce((sum, char) => sum + (/[가-힣]/.test(char) ? hangul : other), 0);
    const headerWidth = (label: string) => 43 + textWidth(label, 13, 7);
    const headers = {
      dong: "동",
      floor: "층",
      ho: "호",
      type: "타입",
      transaction: "거래",
      price: "가격/보증금",
      monthlyRent: "월세",
      channel: "CP사",
      naver: "링크",
      verification: "검증방식",
      exposurePeriod: "노출기간",
      ranking: "랭킹·중복",
      floorExposure: "층수노출",
      checkedAt: "확인일",
    } as const;
    for (const [id, label] of Object.entries(headers)) {
      assert.ok(
        myAdsDefaultColumnWidth(id as keyof typeof headers) >= headerWidth(label),
        `${label} header fits`,
      );
    }
    // 본문 14px: 4자리 호수 "1503호", 태그 두 개 "부동산뱅크"+"수동"(태그 좌우 여백 12, 사이 4)
    assert.ok(myAdsDefaultColumnWidth("ho") >= 21 + textWidth("1503호", 14, 9));
    assert.ok(
      myAdsDefaultColumnWidth("channel") >=
        21 + (textWidth("부동산뱅크", 13, 7) + 12) + 4 + (textWidth("수동", 13, 7) + 12),
    );
  });
});

describe("my ads checked-at sort", () => {
  it("reads YYYYMMDD as that local day and rejects other shapes", () => {
    assert.equal(ymdToTime("20261115"), new Date(2026, 10, 15).getTime());
    assert.equal(ymdToTime("20261340"), null);
    assert.equal(ymdToTime("20260230"), null);
    assert.equal(ymdToTime("2026-11-15"), null);
    assert.equal(ymdToTime(null), null);
  });

  it("prefers the NAVER confirm date and falls back to the ERP check time", () => {
    assert.equal(
      advertisementCheckedAtTime(ad("a", { articleConfirmYmd: "20261110", lastCheckedAt: "2026-11-14T12:00:00Z" })),
      new Date(2026, 10, 10).getTime(),
    );
    assert.equal(
      advertisementCheckedAtTime(ad("b", { lastCheckedAt: "2026-11-14T12:00:00Z" })),
      Date.parse("2026-11-14T12:00:00Z"),
    );
    assert.equal(advertisementCheckedAtTime(ad("c")), null);
  });

  it("orders mixed YYYYMMDD and ISO dates on one time scale, keeping missing dates last", () => {
    const rows = [
      ad("iso-12", { lastCheckedAt: "2026-11-12T12:00:00Z" }),
      ad("none"),
      ad("ymd-14", { articleConfirmYmd: "20261114" }),
      ad("ymd-10", { articleConfirmYmd: "20261110" }),
    ];
    const ids = (sorted: ListingAdvertisementWithListing[]) => sorted.map((row) => row.id);
    assert.deepEqual(ids(sortAdvertisements(rows, [{ id: "checkedAt", desc: false }])), [
      "ymd-10",
      "iso-12",
      "ymd-14",
      "none",
    ]);
    assert.deepEqual(ids(sortAdvertisements(rows, [{ id: "checkedAt", desc: true }])), [
      "ymd-14",
      "iso-12",
      "ymd-10",
      "none",
    ]);
  });
});

describe("my ads full list loading", () => {
  const page = (pageNo: number, total: number, ids: string[]) => ({
    items: ids.map((id) => ({ id })),
    pagination: { page: pageNo, limit: 100, total, totalPages: Math.ceil(total / 100) },
  });
  const range = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, index) => `ad-${from + index}`);

  it("reads every page up to the server total", async () => {
    const requested: number[] = [];
    const result = await loadAllAdvertisementPages(async (pageNo) => {
      requested.push(pageNo);
      return page(pageNo, 250, range((pageNo - 1) * 100, Math.min(250, pageNo * 100)));
    });
    assert.deepEqual(requested.sort(), [1, 2, 3]);
    assert.equal(result.items.length, 250);
    assert.equal(result.total, 250);
    assert.equal(result.truncated, false);
  });

  it("stops at the safety cap and says so", async () => {
    const requested: number[] = [];
    const result = await loadAllAdvertisementPages(
      async (pageNo) => {
        requested.push(pageNo);
        return page(pageNo, 450, range((pageNo - 1) * 100, pageNo * 100));
      },
      { maxPages: 2 },
    );
    assert.deepEqual(requested.sort(), [1, 2]);
    assert.equal(result.items.length, 200);
    assert.equal(result.total, 450);
    assert.equal(result.truncated, true);
  });

  it("drops an advertisement repeated when the order shifts between pages", async () => {
    const requested: number[] = [];
    const result = await loadAllAdvertisementPages(async (pageNo) => {
      requested.push(pageNo);
      return {
        items: (pageNo === 1 ? ["a", "b"] : ["b", "c"]).map((id) => ({ id })),
        pagination: { page: pageNo, limit: 2, total: 4, totalPages: 2 },
      };
    });
    assert.deepEqual(requested, [1, 2]);
    assert.deepEqual(result.items.map((item) => item.id), ["a", "b", "c"]);
    // 하나가 빠졌다는 것을 화면이 알 수 있게 전체 건수는 서버 값을 유지한다
    assert.equal(result.total, 4);
  });

  it("fails as a whole when any page fails", async () => {
    await assert.rejects(
      loadAllAdvertisementPages(async (pageNo) => {
        if (pageNo === 2) throw new Error("network");
        return page(pageNo, 200, range((pageNo - 1) * 100, pageNo * 100));
      }),
      /network/,
    );
  });
});

describe("my ads empty state and accessible names", () => {
  it("treats tabs, search and filters as narrowing conditions but not blank search", () => {
    assert.equal(hasMyAdsNarrowingConditions("all", "", initialMyAdsFilters), false);
    assert.equal(hasMyAdsNarrowingConditions("all", "   ", initialMyAdsFilters), false);
    assert.equal(hasMyAdsNarrowingConditions("attention", "", initialMyAdsFilters), true);
    assert.equal(hasMyAdsNarrowingConditions("all", "1203", initialMyAdsFilters), true);
    assert.equal(
      hasMyAdsNarrowingConditions("all", "", { ...initialMyAdsFilters, channel: "esiljang" }),
      true,
    );
    assert.equal(
      hasMyAdsNarrowingConditions("all", "", { ...initialMyAdsFilters, monthlyRentMax: "80" }),
      true,
    );
  });

  it("names rows by site, dong and unit and skips placeholder dongs", () => {
    assert.equal(
      advertisementLocationLabel(ad("a", { site: "래미안고덕", dong: "101동", ho: "1203호" })),
      "래미안고덕 101동 1203호",
    );
    assert.equal(
      advertisementLocationLabel(ad("b", { site: "한빛빌라", dong: "-", ho: "201호" })),
      "한빛빌라 201호",
    );
    assert.equal(advertisementLocationLabel(ad("c", { site: "단독" })), "단독");
  });

  it("calls the jeonse inline amount 전세가", () => {
    assert.equal(inlinePrimaryAmountName("jeonse"), "전세가");
    assert.equal(inlinePrimaryAmountName("monthly"), "보증금");
    assert.equal(inlinePrimaryAmountName("sale"), "가격");
  });

  it("counts exposure days through the end date or now", () => {
    const now = Date.parse("2026-11-15T00:00:00Z");
    assert.equal(
      advertisementExposureElapsedDays({ startedAt: "2026-11-01T00:00:00Z", endedAt: null }, now),
      14,
    );
    assert.equal(
      advertisementExposureElapsedDays(
        { startedAt: "2026-11-01T00:00:00Z", endedAt: "2026-11-04T00:00:00Z" },
        now,
      ),
      3,
    );
    assert.equal(advertisementExposureElapsedDays({ startedAt: null, endedAt: null }, now), null);
  });
});
