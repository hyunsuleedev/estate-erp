import { ApiError } from "@estate-erp/api-client";
import type {
  CreateListingAdvertisementDto,
  Listing,
  ListingAdvertisement,
  ListingAdvertisementWithListing,
  UpdateListingAdvertisementDto,
} from "@estate-erp/api-client";
import { ListingAvailability, formatUnitName } from "@estate-erp/shared";
import { formatMoney, formatRent } from "@/lib/format";
import { getListingAvailability } from "@/lib/listing-status";
import { naverCpChannels } from "@/lib/advertisement-channels";
import {
  buildManualAdPayload,
  initialManualAdDraft,
  type AdListing,
  type ManualAdDraft,
} from "../-components/property-ad-actions-state";
import { cpChannelLabel, getAnalysisSignal } from "./my-ads-format";
import { PROPERTY_TABLE_PILL_TONES } from "./my-ads-pill";
import type { AnalysisSignal } from "./my-ads-types";

/*
 * 내광고관리의 광고 수동입력.
 * 금액·날짜·주소·채널 검증은 매물관리 펼침 패널의 수동 추가(property-ad-actions-state)를
 * 그대로 쓰고, 여기서는 그 다이얼로그에 없는 것만 더한다:
 * 매물 고르기, CP 광고번호·네이버 매물번호, 서버 오류 문구, 목록 표시.
 */

/** 수동 등록 광고 — CP에 연결된 실체가 없어 업무 요청 대신 원장을 바로 고친다. */
export function isManualAdvertisement(
  advertisement: Pick<ListingAdvertisement, "source">,
): boolean {
  return advertisement.source === "manual";
}

/** 상태 줄의 출처별 건수. CP에서 읽어 온 광고와 직접 입력한 광고를 따로 센다. */
export function countAdvertisementsBySource(
  advertisements: Pick<ListingAdvertisement, "source">[],
): { cp: number; manual: number } {
  const manual = advertisements.filter(isManualAdvertisement).length;
  return { cp: advertisements.length - manual, manual };
}

/**
 * 선택 막대의 안내(변경 초안이 없을 때). 수동 광고는 업무 없이 바로 고치되 한 번에 한 건만
 * 열 수 있다 — 상세 편집은 수동 광고만 두 건 이상 고르면 거절한다.
 */
export function myAdsSelectionHint(
  selected: Pick<ListingAdvertisement, "source">[],
): string {
  if (selected.length > 0 && selected.every(isManualAdvertisement)) {
    return selected.length === 1
      ? "수동 광고는 상세 편집에서 바로 수정합니다"
      : "수동 광고는 한 건씩 선택해 상세 편집에서 수정합니다";
  }
  return "가격·월세를 직접 수정하세요";
}

// ── 매물(거래 옵션) 고르기 ──────────────────────────────────────

export const MANUAL_AD_SEARCH_DEBOUNCE_MS = 250;
/** 검색어가 있을 때 서버에서 받는 최대 건수(서버 상한). */
export const MANUAL_AD_SEARCH_LIMIT = 100;
/** 검색어가 없을 때 먼저 보여 주는 최근 매물 수. */
export const MANUAL_AD_RECENT_LIMIT = 20;
/** 한 번에 보여 주는 결과 수. 넘치면 검색어를 더 넣게 한다. */
export const MANUAL_AD_RESULT_LIMIT = 50;

export function splitSearchTokens(query: string): string[] {
  return [...new Set(query.trim().split(/\s+/).filter(Boolean))];
}

/**
 * 서버 검색은 한 낱말이 한 칸(단지명·동·호·메모 …)에 들어 있는지만 본다.
 * "그라시움 101동 1503호"처럼 여러 낱말을 넣으면 가장 긴 낱말 하나로 서버에서 좁히고
 * 나머지 낱말은 받은 결과 안에서 거른다.
 */
export function pickServerSearchToken(tokens: string[]): string | null {
  return tokens.reduce<string | null>(
    (longest, token) =>
      longest == null || token.length > longest.length ? token : longest,
    null,
  );
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase("ko");
}

export function listingMatchesSearchTokens(
  listing: Listing,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const property = listing.property;
  const haystack = normalizeSearchText(
    [
      property?.site?.name,
      property?.unit?.dong?.name,
      formatUnitName(property?.unit),
      property?.site?.roadAddress,
      property?.site?.jibunAddress,
      listing.memo,
      property?.memo,
      ...(property?.propertyContacts ?? []).map(
        (propertyContact) => propertyContact.contact?.name,
      ),
    ]
      .filter(Boolean)
      .join(""),
  );
  return tokens.every((token) => haystack.includes(normalizeSearchText(token)));
}

/**
 * 단지명과 "101동 1503호"를 나눠 준다. 목록에서 긴 단지명만 말줄임하고 동·호는 늘 보이게 하기 위해서다.
 * 단일 동 건물의 자리표시 동은 뺀다(매물관리 패널과 같은 규칙).
 */
export function manualAdListingLocationParts(
  listing: Pick<Listing, "property"> | undefined,
): { site: string | null; unit: string | null } {
  const property = listing?.property;
  const dong = property?.unit?.dong;
  const unit = formatUnitName(property?.unit);
  const dongName = dong?.name?.trim();
  const unitLabel = [
    dongName && dongName !== "-" && !dong?.isPlaceholder
      ? `${dongName.replace(/동$/, "")}동`
      : null,
    // 호 없이 층이 단위인 공간은 층이 이름이다
    property?.unit?.name ? `${unit.replace(/호$/, "")}호` : unit || null,
  ]
    .filter(Boolean)
    .join(" ");
  return { site: property?.site?.name?.trim() || null, unit: unitLabel || null };
}

/** "고덕그라시움 101동 1503호" */
export function manualAdListingLocation(
  listing: Pick<Listing, "property"> | undefined,
): string {
  const { site, unit } = manualAdListingLocationParts(listing);
  return [site, unit].filter(Boolean).join(" ") || "매물";
}

export function manualAdListingPriceLabel(
  listing: Pick<Listing, "transactionType" | "price" | "deposit" | "monthlyRent">,
): string {
  if (listing.transactionType === "monthly") {
    return formatRent(listing.deposit, listing.monthlyRent);
  }
  if (listing.transactionType === "jeonse") return formatMoney(listing.deposit);
  return formatMoney(listing.price);
}

/**
 * 고를 수는 있지만 알려야 하는 거래 옵션 상태. 수동입력은 CP에 실제로 떠 있는 광고를
 * 기록하는 일이라 막지 않고, 보류·중단·거래중 매물에 적는다는 사실만 보이게 한다.
 * (종결된 의뢰는 서버 기본 검색에서 빠진다.)
 */
export function manualAdListingStatusLabel(listing: Listing): string | null {
  const availability = getListingAvailability(listing);
  if (availability === ListingAvailability.IN_CONTRACT) return "거래중";
  if (availability === ListingAvailability.CLOSED) return "거래 완료";
  if (availability === ListingAvailability.PAUSED) {
    return listing.isPaused ? "옵션 중단" : "의뢰 보류";
  }
  return null;
}

export function activeAdChannelValues(listing: AdListing): string[] {
  return [...new Set((listing.activeAdvertisements ?? []).map((ad) => ad.channel))];
}

export type ManualAdChannelOption = {
  value: string;
  label: string;
  disabled: boolean;
};

/**
 * 이실장·부동산뱅크를 먼저, 나머지 네이버 제휴 CP는 원래 순서대로.
 * 게재 중인 채널은 "광고 중"으로 쓰고 고를 수 없다. 다만 종료된 광고 기록은 채널당 게재 중 하나라는
 * 제약과 무관하므로(서버와 buildManualAdPayload 모두 status가 active일 때만 막는다) 상태가 종료면 고를 수 있다.
 */
export function manualAdChannelOptions(
  listing: AdListing,
  status: MyAdsManualAdDraft["status"] = "active",
): ManualAdChannelOption[] {
  const active = new Set(activeAdChannelValues(listing));
  const primary = ["esiljang", "budongsanbank"];
  const rank = (value: string) =>
    primary.includes(value) ? primary.indexOf(value) : primary.length;
  // sort는 같은 순위끼리 원래 순서를 지킨다
  return [...naverCpChannels]
    .sort((left, right) => rank(left.value) - rank(right.value))
    .map((option) => ({
    value: option.value,
    label: active.has(option.value)
      ? `${cpChannelLabel(option.value)} · 광고 중`
      : cpChannelLabel(option.value),
    disabled: status === "active" && active.has(option.value),
  }));
}

// ── 입력값과 저장 내용 ─────────────────────────────────────────

export type MyAdsManualAdDraft = ManualAdDraft & {
  externalAdId: string;
  naverArticleNo: string;
};

export function initialMyAdsManualAdDraft(
  listing: AdListing,
  advertisement?: ListingAdvertisement,
): MyAdsManualAdDraft {
  return {
    ...initialManualAdDraft(listing, advertisement),
    externalAdId: advertisement?.externalAdId ?? "",
    naverArticleNo: advertisement?.naverArticleNo ?? "",
  };
}

/** 매물만 고르고 아무 칸도 고치지 않았으면 false — 닫을 때 확인 없이 바로 닫는다. */
export function isManualAdDraftChanged(
  initial: MyAdsManualAdDraft,
  draft: MyAdsManualAdDraft,
): boolean {
  return (Object.keys(initial) as (keyof MyAdsManualAdDraft)[]).some(
    (key) => initial[key] !== draft[key],
  );
}

export type ManualAdField = keyof MyAdsManualAdDraft;

const MONEY_FIELDS: ManualAdField[] = [
  "advertisedPrice",
  "advertisedDeposit",
  "advertisedMonthlyRent",
];
const DATE_FIELDS: ManualAdField[] = ["startedAt", "endedAt"];
const CHANNEL_FIELDS: ManualAdField[] = ["channel", "status"];

/**
 * 검증 문구가 가리키는 칸. 그 칸에 aria-invalid를 달고, 사용자가 그 칸을 고치면 문구를 지운다.
 * null이면 어느 한 칸의 문제가 아니라서(서버 오류, 바뀐 내용 없음) 아무 칸이나 고치면 지운다.
 */
export function manualAdErrorFields(message: string): ManualAdField[] | null {
  if (message.startsWith("원문 주소")) return ["url"];
  if (message === "광고 종료일을 입력해 주세요.") return ["endedAt"];
  if (message.startsWith("광고 중인 광고에는 종료일")) return ["status", "endedAt"];
  if (message.startsWith("종료된 광고는")) return ["status"];
  if (message.includes("날짜") || message.startsWith("종료일은")) return DATE_FIELDS;
  if (message.startsWith("금액은")) return MONEY_FIELDS;
  if (message.includes("CP 광고번호")) return ["externalAdId"];
  if (message.startsWith("네이버 매물번호")) return ["naverArticleNo"];
  if (message === "광고 채널을 선택해 주세요." || message.includes("게재 중인 광고가 있습니다") || message.includes("진행 중인 광고가 있습니다")) {
    return CHANNEL_FIELDS;
  }
  return null;
}

/** buildManualAdPayload가 바꾼 칸이 없을 때 던지는 문구. 번호만 고친 경우를 가려낸다. */
const NO_CHANGE_MESSAGE = "변경한 내용이 없습니다.";
/** 재광고해도 광고는 같은 줄이다. 번호가 바뀌었으면 새 줄을 만들지 않고 이 줄의 번호를 고친다. */
export const EXTERNAL_AD_ID_HINT =
  "재광고로 번호가 바뀌었으면 새 번호로 고쳐 주세요.";

function identifierValues(draft: MyAdsManualAdDraft) {
  const externalAdId = draft.externalAdId.trim() || null;
  const naverArticleNo = draft.naverArticleNo.trim() || null;
  if (externalAdId && (externalAdId.length > 100 || /\s/.test(externalAdId))) {
    throw new Error("CP 광고번호는 띄어쓰기 없이 100자 이내로 입력해 주세요.");
  }
  if (naverArticleNo && !/^\d{1,20}$/.test(naverArticleNo)) {
    throw new Error("네이버 매물번호는 숫자로 입력해 주세요.");
  }
  return { externalAdId, naverArticleNo };
}

/**
 * 새 광고면 생성 요청, 기존 수동 광고면 바뀐 칸만 담은 수정 요청을 만든다.
 * 잘못된 입력은 화면에 보여 줄 문구로 Error를 던진다.
 */
export function buildMyAdsManualAdPayload(
  listing: AdListing,
  draft: MyAdsManualAdDraft,
): CreateListingAdvertisementDto;
export function buildMyAdsManualAdPayload(
  listing: AdListing,
  draft: MyAdsManualAdDraft,
  existing: ListingAdvertisement,
): UpdateListingAdvertisementDto;
export function buildMyAdsManualAdPayload(
  listing: AdListing,
  draft: MyAdsManualAdDraft,
  existing?: ListingAdvertisement,
): CreateListingAdvertisementDto | UpdateListingAdvertisementDto {
  const identifiers = identifierValues(draft);
  if (!existing) {
    const payload = buildManualAdPayload(listing, draft) as CreateListingAdvertisementDto;
    return {
      ...payload,
      ...(identifiers.externalAdId && { externalAdId: identifiers.externalAdId }),
      ...(identifiers.naverArticleNo && { naverArticleNo: identifiers.naverArticleNo }),
    };
  }

  const identifierPatch: UpdateListingAdvertisementDto = {
    ...(identifiers.externalAdId !== existing.externalAdId && {
      externalAdId: identifiers.externalAdId,
    }),
    ...(identifiers.naverArticleNo !== existing.naverArticleNo && {
      naverArticleNo: identifiers.naverArticleNo,
    }),
  };
  try {
    return {
      ...(buildManualAdPayload(listing, draft, existing) as UpdateListingAdvertisementDto),
      ...identifierPatch,
    };
  } catch (error) {
    // 나머지 검증을 모두 통과하고 번호만 바뀐 경우
    if (
      error instanceof Error &&
      error.message === NO_CHANGE_MESSAGE &&
      Object.keys(identifierPatch).length > 0
    ) {
      return identifierPatch;
    }
    throw error;
  }
}

/**
 * 게재 중인 광고끼리는 (채널, CP 광고번호)가 겹칠 수 없다(DB 유일 인덱스).
 * 서버 코드는 이를 미리 확인하지 않아 겹치면 500으로 끝나므로, 저장 전에 화면이 확인할 대상.
 */
export function externalAdIdToVerify(
  payload: CreateListingAdvertisementDto | UpdateListingAdvertisementDto,
  existing?: ListingAdvertisement,
): { channel: string; externalAdId: string; excludeId?: string } | null {
  const status = payload.status ?? existing?.status ?? "active";
  if (status !== "active" || !payload.externalAdId) return null;
  const channel = payload.channel ?? existing?.channel;
  if (!channel) return null;
  return { channel, externalAdId: payload.externalAdId, excludeId: existing?.id };
}

export function assertExternalAdIdAvailable(
  candidates: Pick<ListingAdvertisement, "id" | "channel" | "status" | "externalAdId">[],
  target: { channel: string; externalAdId: string; excludeId?: string },
): void {
  const taken = candidates.some(
    (advertisement) =>
      advertisement.id !== target.excludeId &&
      advertisement.status === "active" &&
      advertisement.channel === target.channel &&
      advertisement.externalAdId === target.externalAdId,
  );
  if (taken) {
    throw new Error(
      "같은 CP 광고번호로 게재 중인 광고가 이미 있습니다. 광고번호를 확인해 주세요.",
    );
  }
}

/** 저장 성공 토스트. 종료된 광고는 게재 중만 보이는 이 목록에서 빠진다는 것도 알린다. */
export function manualAdSuccessMessage(
  mode: "create" | "edit",
  payload: CreateListingAdvertisementDto | UpdateListingAdvertisementDto,
): string {
  if (mode === "create") {
    return payload.status === "ended"
      ? "종료된 광고로 기록했습니다. 내 광고 목록에는 게재 중인 광고만 보입니다."
      : "광고 정보를 추가했습니다.";
  }
  return payload.status === "ended"
    ? "광고를 종료했습니다. 내 광고 목록에서 빠집니다."
    : "광고 정보를 수정했습니다.";
}

// 서버 검증 문구 중 영어로 오는 것을 화면 문구로 바꾼다. 409 문구는 이미 한국어다.
const SERVER_ERROR_MESSAGES: Record<string, string> = {
  "Listing not found": "선택한 매물을 찾을 수 없습니다. 매물이 삭제되었는지 확인해 주세요.",
  "ListingAdvertisement not found":
    "광고를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.",
  "listingId is required": "매물을 선택해 주세요.",
  "channel is required": "광고 채널을 선택해 주세요.",
  "channel cannot be empty": "광고 채널을 선택해 주세요.",
  "channel must be lowercase slug (a-z, 0-9, _, -)": "광고 채널을 선택해 주세요.",
  "active advertisement cannot have endedAt":
    "광고 중인 광고에는 종료일을 넣을 수 없습니다.",
  "ended advertisement requires endedAt": "광고 종료일을 입력해 주세요.",
};

export function manualAdErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      return "서버에서 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
    if (SERVER_ERROR_MESSAGES[error.message]) {
      return SERVER_ERROR_MESSAGES[error.message];
    }
    if (/^Invalid (status|source)/.test(error.message)) {
      return "광고 상태를 확인해 주세요.";
    }
    return error.message || "저장하지 못했습니다. 다시 시도해 주세요.";
  }
  if (error instanceof TypeError) {
    return "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "저장하지 못했습니다. 다시 시도해 주세요.";
}

// ── 목록 표시 ─────────────────────────────────────────────────

/**
 * 표·펼침 패널의 경쟁 대비 판단. 수동 광고는 CP 읽기 결과가 없으므로
 * "최근 CP 읽기 결과에서…" 대신 수동 광고에 맞는 문구를 쓴다.
 * 네이버 비교가 저장된 수동 광고는 CP 광고와 같은 판단을 쓴다.
 */
export function myAdsAnalysisSignal(
  advertisement: ListingAdvertisementWithListing,
): AnalysisSignal {
  if (!isManualAdvertisement(advertisement)) return getAnalysisSignal(advertisement);
  if (!advertisement.naverArticleNo) {
    return {
      kind: "naver_link_pending",
      tone: "warning",
      label: "네이버 번호 없음",
      detail:
        "수동 등록 광고에 네이버 매물번호가 없습니다. 번호를 넣으면 네이버 비교 대상이 됩니다.",
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }
  const group = advertisement.comparison;
  if (!group) {
    return {
      kind: "comparison_pending",
      tone: "warning",
      label: "네이버 비교 대기",
      detail: `수동 등록 광고입니다. 네이버 매물번호 ${advertisement.naverArticleNo}의 비교 결과가 아직 없습니다.`,
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }
  // 수동 입력에는 네이버 URL 칸이 없다. 비교 결과의 원문 주소로 링크 확인을 대신한다.
  return getAnalysisSignal({
    ...advertisement,
    naverUrl: advertisement.naverUrl ?? group.mainAdvertisement?.sourceUrl ?? null,
  });
}

/** 랭킹 칸의 빈 값. 네이버 번호가 없는 수동 광고는 기다릴 비교가 없다. */
export function myAdsRankingPendingLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  return isManualAdvertisement(advertisement) && !advertisement.naverArticleNo
    ? "비교 없음"
    : "분석 대기";
}
