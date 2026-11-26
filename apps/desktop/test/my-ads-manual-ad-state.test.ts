import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@estate-erp/api-client";
import type {
  Listing,
  ListingAdvertisement,
  ListingAdvertisementWithListing,
  OfficeAdvertisement,
} from "@estate-erp/api-client";
import {
  assertExternalAdIdAvailable,
  buildMyAdsManualAdPayload,
  countAdvertisementsBySyncState,
  externalAdIdToVerify,
  initialMyAdsManualAdDraft,
  isManualAdDraftChanged,
  listingMatchesSearchTokens,
  manualAdChannelOptions,
  manualAdErrorFields,
  manualAdErrorMessage,
  manualAdListingLocation,
  manualAdListingLocationParts,
  manualAdListingPriceLabel,
  manualAdListingStatusLabel,
  manualAdSuccessMessage,
  myAdsAnalysisSignal,
  myAdsRankingPendingLabel,
  pickServerSearchToken,
  splitSearchTokens,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-manual-ad-state";
import {
  advertisementSyncState,
  cpChannelLabel,
  getAnalysisSignal,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-format";
import { channelFilterOptions } from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-types";

const at = "2026-11-15T03:00:00.000Z";

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    officeId: "office-1",
    propertyId: "property-1",
    intakeId: "intake-1",
    transactionType: "sale",
    price: 158000,
    deposit: null,
    monthlyRent: null,
    maintenanceFee: null,
    maintenanceFeeIncludes: [],
    loanAmount: null,
    premium: null,
    moveInAvailableType: null,
    moveInAvailableFrom: null,
    moveInAvailableTo: null,
    isPaused: false,
    memo: "급매 협의 가능",
    createdAt: at,
    updatedAt: at,
    intake: { lifecycleStatus: "open" } as Listing["intake"],
    deals: [],
    activeAdvertisements: [],
    property: {
      id: "property-1",
      siteId: "site-1",
      unitId: "unit-1",
      memo: null,
      site: { id: "site-1", name: "고덕그라시움", type: "apartment", roadAddress: "서울 강동구 고덕로 333", jibunAddress: null },
      unit: {
        id: "unit-1", name: "1503호", floor: 15, exclusiveAreaM2: null, supplyAreaM2: null,
        dong: { id: "dong-1", name: "101동", isPlaceholder: false }, siteUnitType: null,
      },
      propertyContacts: [{ id: "pc-1", role: "owner", status: "active", contact: { id: "c-1", name: "김집주인", phone: null } }],
    },
    ...overrides,
  };
}

function advertisement(overrides: Partial<ListingAdvertisementWithListing> = {}): ListingAdvertisementWithListing {
  return {
    id: "ad-1",
    officeId: "office-1",
    listingId: "listing-1",
    channel: "esiljang",
    status: "active",
    advertisedPrice: 155000,
    advertisedDeposit: null,
    advertisedMonthlyRent: null,
    startedAt: "2026-11-01T00:00:00.000Z",
    firstSeenAt: at,
    lastSeenAt: at,
    endedAt: null,
    url: null,
    memo: null,
    externalAdId: null,
    naverArticleNo: null,
    naverUrl: null,
    providerStatus: null,
    providerStatusObservedAt: null,
    lastCheckedAt: null,
    lastSyncedAt: null,
    createdAt: at,
    updatedAt: at,
    listing: listing(),
    comparison: null,
    ...overrides,
  };
}

describe("manual ad listing search", () => {
  it("sends the longest word to the server and filters the rest locally", () => {
    const tokens = splitSearchTokens("  그라시움  101동 1503호 101동 ");
    assert.deepEqual(tokens, ["그라시움", "101동", "1503호"]);
    assert.equal(pickServerSearchToken(tokens), "1503호");
    assert.equal(pickServerSearchToken([]), null);

    const row = listing();
    assert.ok(listingMatchesSearchTokens(row, []));
    assert.ok(listingMatchesSearchTokens(row, ["그라시움", "101", "1503"]));
    assert.ok(listingMatchesSearchTokens(row, ["고덕로"]), "road address");
    assert.ok(listingMatchesSearchTokens(row, ["급매"]), "listing memo");
    assert.ok(listingMatchesSearchTokens(row, ["김집주인"]), "owner name, as the server search does");
    assert.ok(listingMatchesSearchTokens(row, ["101동1503호"]), "dong and ho typed together");
    assert.equal(listingMatchesSearchTokens(row, ["그라시움", "102동"]), false);
  });

  it("labels location, price and availability the way the property panel does", () => {
    assert.equal(manualAdListingLocation(listing()), "고덕그라시움 101동 1503호");
    const property = listing().property as NonNullable<Listing["property"]>;
    const unit = property.unit as NonNullable<typeof property.unit>;
    const villa = listing({
      property: { ...property, unit: { ...unit, name: "201", dong: { id: "d", name: "-", isPlaceholder: true } } },
    });
    assert.equal(manualAdListingLocation(villa), "고덕그라시움 201호");
    assert.equal(manualAdListingLocation(undefined), "매물");
    // 목록은 긴 단지명만 말줄임하고 동·호는 따로 늘 보인다
    assert.deepEqual(manualAdListingLocationParts(listing()), { site: "고덕그라시움", unit: "101동 1503호" });
    assert.deepEqual(manualAdListingLocationParts(villa), { site: "고덕그라시움", unit: "201호" });
    assert.deepEqual(manualAdListingLocationParts(undefined), { site: null, unit: null });

    assert.equal(manualAdListingPriceLabel(listing()), "15억 8,000만");
    assert.equal(
      manualAdListingPriceLabel(listing({ transactionType: "jeonse", price: 90000, deposit: null })),
      "9억",
    );
    assert.equal(
      manualAdListingPriceLabel(listing({ transactionType: "monthly", price: null, deposit: 5000, monthlyRent: 120 })),
      "5,000만 / 120만",
    );

    assert.equal(manualAdListingStatusLabel(listing()), null);
    assert.equal(manualAdListingStatusLabel(listing({ isPaused: true })), "옵션 중단");
    assert.equal(
      manualAdListingStatusLabel(listing({ intake: { lifecycleStatus: "hold" } as Listing["intake"] })),
      "의뢰 보류",
    );
    assert.equal(
      manualAdListingStatusLabel(listing({ deals: [{ id: "deal-1", stage: "contracted", stageChangedAt: null }] })),
      "거래 중",
    );
  });

  it("orders 이실장·부동산뱅크 first and disables channels that already have an active ad", () => {
    const options = manualAdChannelOptions(
      listing({ activeAdvertisements: [advertisement({ channel: "esiljang" })] }),
    );
    assert.equal(options.length, 19);
    assert.deepEqual(options.slice(0, 2), [
      { value: "esiljang", label: "이실장플러스 · 광고 중", disabled: true },
      { value: "budongsanbank", label: "부동산뱅크", disabled: false },
    ]);
    assert.equal(new Set(options.map((option) => option.value)).size, 19);
  });

  it("does not let an ended record take a channel that already has an active ad", () => {
    // 같은 매물·같은 채널은 한 줄이다. 종료 기록으로 넣으면 게재 중인 광고가 종료되므로 막는다
    const busy = listing({ activeAdvertisements: [advertisement({ channel: "esiljang" })] });
    assert.deepEqual(manualAdChannelOptions(busy)[0], {
      value: "esiljang",
      label: "이실장플러스 · 광고 중",
      disabled: true,
    });
    // 등록일 기본값은 오늘이라 날짜를 고정한다(종료일이 등록일보다 앞서면 막힌다)
    const draft = {
      ...initialMyAdsManualAdDraft(busy),
      channel: "esiljang",
      status: "ended" as const,
      startedAt: "2026-11-01",
      endedAt: "2026-11-15",
    };
    assert.throws(() => buildMyAdsManualAdPayload(busy, draft), /진행 중인 광고/);
    assert.throws(() => buildMyAdsManualAdPayload(busy, { ...draft, status: "active", endedAt: "" }), /진행 중인 광고/);
    // 비어 있는 채널에는 종료 기록을 넣을 수 있다
    assert.equal(buildMyAdsManualAdPayload(busy, { ...draft, channel: "budongsanbank" }).channel, "budongsanbank");
  });
});

describe("manual ad payload", () => {
  it("prefills from the listing, skips busy channels and adds the CP / Naver numbers", () => {
    const busy = listing({ activeAdvertisements: [advertisement({ channel: "esiljang" })] });
    const draft = initialMyAdsManualAdDraft(busy);
    assert.equal(draft.channel, "budongsanbank");
    assert.equal(draft.advertisedPrice, "158000");
    assert.equal(draft.status, "active");
    assert.equal(draft.externalAdId, "");

    const payload = buildMyAdsManualAdPayload(busy, {
      ...draft, startedAt: "2026-11-15", externalAdId: " BB-77 ", naverArticleNo: "2612345678",
    });
    assert.deepEqual(payload, {
      listingId: "listing-1", channel: "budongsanbank", status: "active",
      advertisedPrice: 158000, startedAt: "2026-11-15T00:00:00.000Z", endedAt: null, url: null, memo: null,
      externalAdId: "BB-77", naverArticleNo: "2612345678",
    });
    assert.equal("externalAdId" in buildMyAdsManualAdPayload(busy, draft), false);
  });

  it("reuses the property panel checks and adds number checks", () => {
    const busy = listing({ activeAdvertisements: [advertisement({ channel: "esiljang" })] });
    const draft = initialMyAdsManualAdDraft(busy);
    assert.throws(() => buildMyAdsManualAdPayload(busy, { ...draft, channel: "esiljang" }), /진행 중인 광고/);
    assert.throws(() => buildMyAdsManualAdPayload(busy, { ...draft, advertisedPrice: "1.5" }), /금액/);
    assert.throws(() => buildMyAdsManualAdPayload(busy, { ...draft, naverArticleNo: "https://x/1" }), /네이버 매물번호/);
    assert.throws(() => buildMyAdsManualAdPayload(busy, { ...draft, externalAdId: "A 1" }), /CP 광고번호/);
    // 종료 기록은 진행 중 광고가 없는 채널에 넣는다(같은 채널은 한 줄이라 진행 중 광고를 종료시킨다)
    const ended = buildMyAdsManualAdPayload(busy, {
      ...draft, channel: "budongsanbank", status: "ended", startedAt: "2026-10-01", endedAt: "2026-11-01",
    });
    assert.equal(ended.status, "ended");
    assert.equal(ended.endedAt, "2026-11-01T00:00:00.000Z");
  });

  it("sends only changed fields when editing, including number-only edits", () => {
    const existing = advertisement();
    const owner = listing();
    const base = initialMyAdsManualAdDraft(owner, existing);
    assert.equal(base.advertisedPrice, "155000");
    assert.deepEqual(buildMyAdsManualAdPayload(owner, { ...base, naverArticleNo: "2612345678" }, existing), {
      naverArticleNo: "2612345678",
    });
    assert.deepEqual(
      buildMyAdsManualAdPayload(owner, { ...base, advertisedPrice: "150000", externalAdId: "E-1" }, existing),
      { advertisedPrice: 150000, externalAdId: "E-1" },
    );
    assert.deepEqual(
      buildMyAdsManualAdPayload(owner, { ...base, status: "ended", endedAt: "2026-11-15" }, existing),
      { status: "ended", endedAt: "2026-11-15T00:00:00.000Z" },
    );
    assert.throws(() => buildMyAdsManualAdPayload(owner, base, existing), /변경한 내용/);
  });

  it("refuses to change or clear an existing CP ad number (server rule)", () => {
    const existing = advertisement({ externalAdId: "E-1" });
    const owner = listing();
    const base = initialMyAdsManualAdDraft(owner, existing);
    // 재광고해도 같은 줄이다: CP 광고번호가 바뀌면 그 줄의 번호를 고친다(새 광고로 넣지 않는다)
    assert.equal(buildMyAdsManualAdPayload(owner, { ...base, externalAdId: "E-2" }, existing).externalAdId, "E-2");
    assert.equal(buildMyAdsManualAdPayload(owner, { ...base, externalAdId: "" }, existing).externalAdId, null);
  });
});

describe("CP ad number uniqueness pre-check", () => {
  it("checks only numbers that will be active", () => {
    assert.deepEqual(
      externalAdIdToVerify({ listingId: "l", channel: "esiljang", status: "active", externalAdId: "E-1" }),
      { channel: "esiljang", externalAdId: "E-1", excludeId: undefined },
    );
    assert.equal(externalAdIdToVerify({ listingId: "l", channel: "esiljang", status: "ended", externalAdId: "E-1" }), null);
    assert.equal(externalAdIdToVerify({ listingId: "l", channel: "esiljang", status: "active" }), null);
    const existing = advertisement();
    assert.deepEqual(externalAdIdToVerify({ externalAdId: "E-1" }, existing), {
      channel: "esiljang", externalAdId: "E-1", excludeId: "ad-1",
    });
    assert.equal(externalAdIdToVerify({ externalAdId: "E-1", status: "ended" }, existing), null);
    assert.equal(externalAdIdToVerify({ memo: "x" }, existing), null);
  });

  it("finds an exact active match on the same channel only", () => {
    const target = { channel: "esiljang", externalAdId: "E-1", excludeId: "ad-1" };
    const row = (overrides: Partial<ListingAdvertisement>) => ({
      id: "other", channel: "esiljang", status: "active" as const, externalAdId: "E-1", ...overrides,
    });
    assert.throws(() => assertExternalAdIdAvailable([row({})], target), /같은 CP 광고번호/);
    assert.doesNotThrow(() => assertExternalAdIdAvailable([row({ id: "ad-1" })], target));
    assert.doesNotThrow(() => assertExternalAdIdAvailable([row({ status: "ended" })], target));
    assert.doesNotThrow(() => assertExternalAdIdAvailable([row({ channel: "budongsanbank" })], target));
    assert.doesNotThrow(() => assertExternalAdIdAvailable([row({ externalAdId: "E-10" })], target));
  });
});

describe("manual ad messages", () => {
  it("turns server errors into screen copy", () => {
    // 서버는 광고 검증 문구를 한국어로 답한다 — 그대로 보인다
    const notFound = "선택한 매물을 찾을 수 없습니다. 매물이 삭제되었는지 확인해 주세요.";
    assert.equal(manualAdErrorMessage(new ApiError(404, { message: notFound })), notFound);
    const conflict = "같은 매물·같은 채널에 이미 게재 중인 광고가 있습니다. 기존 광고를 먼저 종료하세요.";
    assert.equal(manualAdErrorMessage(new ApiError(409, { message: conflict })), conflict);
    // 5xx의 프레임워크 문구·서버 문구 없음은 저장 실패 안내로
    assert.match(manualAdErrorMessage(new ApiError(500, { message: "Internal server error" })), /저장하지 못했습니다/);
    assert.match(manualAdErrorMessage(new ApiError(400, {})), /저장하지 못했습니다/);
    // 서버에 닿지 못함
    assert.match(manualAdErrorMessage(new TypeError("Failed to fetch")), /서버에 연결하지 못했습니다/);
    // 저장 전에 화면이 던진 확인 문구는 그대로
    assert.equal(manualAdErrorMessage(new Error("광고 채널을 선택해 주세요.")), "광고 채널을 선택해 주세요.");
  });

  it("points validation messages at the fields that fix them", () => {
    assert.deepEqual(manualAdErrorFields("원문 주소는 http:// 또는 https://로 입력해 주세요."), ["url"]);
    assert.deepEqual(manualAdErrorFields("광고 종료일을 입력해 주세요."), ["endedAt"]);
    assert.deepEqual(manualAdErrorFields("종료일은 등록일보다 빠를 수 없습니다."), ["startedAt", "endedAt"]);
    assert.deepEqual(manualAdErrorFields("금액은 0 이상의 만원 단위 정수로 입력해 주세요."), [
      "advertisedPrice", "advertisedDeposit", "advertisedMonthlyRent",
    ]);
    assert.deepEqual(manualAdErrorFields("네이버 매물번호는 숫자로 입력해 주세요."), ["naverArticleNo"]);
    assert.deepEqual(manualAdErrorFields("같은 CP 광고번호로 게재 중인 광고가 이미 있습니다. 광고번호를 확인해 주세요."), ["externalAdId"]);
    assert.deepEqual(
      manualAdErrorFields("같은 매물·같은 채널에 이미 게재 중인 광고가 있습니다. 기존 광고를 먼저 종료하세요."),
      ["channel", "status"],
    );
    // 어느 한 칸의 문제가 아니면 null(아무 칸이나 고치면 지운다)
    assert.equal(manualAdErrorFields("변경한 내용이 없습니다."), null);
    assert.equal(manualAdErrorFields("서버에서 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."), null);
    // 실제로 던지는 문구와 맞물리는지
    const busy = listing();
    const draft = initialMyAdsManualAdDraft(busy);
    for (const [patch, field] of [
      [{ url: "notaurl" }, "url"],
      [{ status: "ended", endedAt: "" }, "endedAt"],
      [{ externalAdId: "A 1" }, "externalAdId"],
    ] as const) {
      assert.throws(
        () => buildMyAdsManualAdPayload(busy, { ...draft, ...patch }),
        (error: Error) => Boolean(manualAdErrorFields(error.message)?.includes(field)),
      );
    }
  });

  it("asks before closing only when a field changed", () => {
    const initial = initialMyAdsManualAdDraft(listing());
    assert.equal(isManualAdDraftChanged(initial, { ...initial }), false);
    assert.equal(isManualAdDraftChanged(initial, { ...initial, memo: "확인" }), true);
    assert.equal(isManualAdDraftChanged(initial, { ...initial, status: "ended" }), true);
  });

  it("says when a saved ad leaves the active-only list", () => {
    assert.equal(manualAdSuccessMessage("create", { listingId: "l", channel: "esiljang", status: "active" }), "광고 정보를 추가했습니다.");
    assert.match(manualAdSuccessMessage("create", { listingId: "l", channel: "esiljang", status: "ended" }), /게재 중인 광고만/);
    assert.match(manualAdSuccessMessage("edit", { status: "ended" }), /종료했습니다/);
    assert.equal(manualAdSuccessMessage("edit", { memo: "x" }), "광고 정보를 수정했습니다.");
  });
});

describe("manual ads in the my-ads table", () => {
  it("marks sync states and names every channel with one function", () => {
    assert.equal(advertisementSyncState(advertisement()), "manual");
    assert.equal(
      advertisementSyncState(advertisement({ lastSyncedAt: at })),
      "synced",
    );
    assert.equal(
      advertisementSyncState(advertisement({ lastSyncedAt: at, manualEditedAt: "2026-11-16T03:00:00.000Z" })),
      "manual_override",
    );
    // 매물관리와 같은 네이버 제휴사 이름. 표·필터·수동입력 다이얼로그가 같은 이름을 쓴다
    assert.equal(cpChannelLabel("esiljang"), "이실장플러스");
    assert.equal(cpChannelLabel("budongsanbank"), "부동산뱅크");
    assert.equal(cpChannelLabel("dabang"), "다방");
    assert.equal(cpChannelLabel("unknown-cp"), "unknown-cp");
    assert.deepEqual(
      channelFilterOptions.slice(1).map((option) => option.label),
      [cpChannelLabel("esiljang"), cpChannelLabel("budongsanbank")],
    );
    assert.equal(
      manualAdChannelOptions(listing())[0].label,
      cpChannelLabel("esiljang"),
    );
  });

  it("counts syncState variants separately for the status bar", () => {
    assert.deepEqual(
      countAdvertisementsBySyncState([
        advertisement(),
        advertisement({ lastSyncedAt: at }),
        advertisement({ lastSyncedAt: at, manualEditedAt: "2026-11-16T03:00:00.000Z" }),
      ]),
      { synced: 1, manual: 1, manualOverride: 1 },
    );
    assert.deepEqual(countAdvertisementsBySyncState([]), { synced: 0, manual: 0, manualOverride: 0 });
  });

  it("does not use CP-read wording for manual ads without a Naver comparison", () => {
    const noNumber = myAdsAnalysisSignal(advertisement());
    assert.equal(noNumber.kind, "naver_link_pending");
    assert.equal(noNumber.label, "네이버 번호 없음");
    assert.doesNotMatch(noNumber.detail, /CP 읽기/);
    assert.equal(myAdsRankingPendingLabel(advertisement()), "비교 없음");

    const waiting = myAdsAnalysisSignal(advertisement({ naverArticleNo: "2612345678" }));
    assert.equal(waiting.kind, "comparison_pending");
    assert.match(waiting.detail, /2612345678/);
    assert.equal(myAdsRankingPendingLabel(advertisement({ naverArticleNo: "2612345678" })), "분석 대기");

    const cp = advertisement({ lastSyncedAt: at });
    assert.deepEqual(myAdsAnalysisSignal(cp), getAnalysisSignal(cp));
    assert.equal(myAdsRankingPendingLabel(cp), "분석 대기");
  });

  it("uses the regular comparison once a Naver comparison is saved for a manual ad", () => {
    const own: OfficeAdvertisement = {
      id: "oa-1", officeId: "office-1", groupId: "g-1", articleNo: "2612345678",
      sourceUrl: "https://fin.land.naver.com/articles/2612345678", isMine: true, isMain: true, isActive: true,
      articleName: null, realtorName: null, realtorId: null, representativeTelNo: null,
      price: 155000, deposit: null, monthlyRent: null, ranking: 1, sameAddrCnt: 1, articleConfirmYmd: "20261115",
      floorInfo: "15/25", floorExposureMode: "exact", verificationTypeCode: "OWNER", seango: false, epju: false,
      firstSeenAt: at, lastSeenAt: at, createdAt: at, updatedAt: at,
    };
    const compared = advertisement({
      naverArticleNo: "2612345678",
      comparison: {
        id: "g-1", officeId: "office-1", listingAdvertisementId: "ad-1", ownAdvertisementId: own.id, memo: null,
        ownPrice: 155000, ownDeposit: null, ownMonthlyRent: null, relatedPriceMin: null, relatedPriceMax: null,
        relatedCount: 0, firstSeenAt: at, lastSeenAt: at, lastSyncedAt: at, createdAt: at, updatedAt: at,
        ownAdvertisement: own, advertisements: [own],
      },
    });
    const signal = myAdsAnalysisSignal(compared);
    assert.notEqual(signal.kind, "naver_link_pending");
    assert.notEqual(signal.kind, "comparison_pending");
  });
});
