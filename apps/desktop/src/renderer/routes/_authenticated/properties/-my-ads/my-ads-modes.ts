import type {
  CreateAdvertisementChangeRequestDto,
  ListingAdvertisementWithListing,
  UpdateListingAdvertisementDto,
} from "@estate-erp/api-client";
import { analyzeOfficeAdvertisementComparison } from "@estate-erp/api-client";
import { formatMoney } from "@/lib/format";
import {
  advertisementTransactionType,
  pendingChangeRequests,
} from "./my-ads-link";
import { isManualAdvertisement } from "./my-ads-manual-ad-state";

/**
 * 내광고관리의 두 가지 고치기.
 *
 *   기록 수정  칸을 눌러 고치면 우리 기록이 바로 바뀐다. CP에 올라간 광고는 바뀌지 않는다.
 *   변경 요청  칸을 눌러 바꿀 값을 적으면 초안으로 모인다. 값은 그대로이고(줄만 그어진다),
 *              "요청 보내기"를 눌렀을 때 광고마다 요청과 업무가 만들어진다.
 *
 * 평소에는 표가 읽기 전용이다. 위쪽 버튼으로 일부러 들어와야만 고칠 수 있다.
 */
export type MyAdsMode = "edit" | "request";

/** 표에서 고칠 수 있는 칸 */
export type MyAdsEditableField = "primary" | "monthlyRent" | "floorExposure";

/** 광고 하나에 작성 중인 변경 요청. 보내기 전까지 광고도 업무도 바뀌지 않는다 */
export type MyAdsRequestDraft = {
  /** 매매가 또는 보증금 (만원) */
  primary?: number;
  monthlyRent?: number;
  floorExposure?: "exact" | "band";
  readvertise?: true;
  takedown?: true;
};

export type MyAdsRequestDrafts = Readonly<Record<string, MyAdsRequestDraft>>;

/** 가격/보증금 칸이 가리키는 광고 값의 이름 */
export function primaryAmountKey(
  advertisement: ListingAdvertisementWithListing,
): "advertisedPrice" | "advertisedDeposit" {
  const transactionType = advertisementTransactionType(advertisement);
  return transactionType === "jeonse" || transactionType === "monthly"
    ? "advertisedDeposit"
    : "advertisedPrice";
}

export function fieldLabel(
  advertisement: ListingAdvertisementWithListing,
  field: MyAdsEditableField,
): string {
  if (field === "monthlyRent") return "월세";
  if (field === "floorExposure") return "층 노출";
  const transactionType = advertisementTransactionType(advertisement);
  return transactionType === "jeonse"
    ? "전세가"
    : transactionType === "monthly"
      ? "보증금"
      : "매매가";
}

export function currentAmount(
  advertisement: ListingAdvertisementWithListing,
  field: "primary" | "monthlyRent",
): number | null {
  return field === "monthlyRent"
    ? advertisement.advertisedMonthlyRent
    : advertisement[primaryAmountKey(advertisement)];
}

/** 지금 네이버에 보이는 층 노출 방식. 비교를 읽은 적이 없으면 우리 기록의 값 */
export function currentFloorExposure(
  advertisement: ListingAdvertisementWithListing,
): "exact" | "band" | null {
  const observed = advertisement.comparison?.mainAdvertisement
    ? analyzeOfficeAdvertisementComparison(advertisement).ownFloorExposureMode
    : null;
  const value = observed === "exact" || observed === "band" ? observed : advertisement.floorExposure;
  return value === "exact" || value === "band" ? value : null;
}

/** 칸이 속한 요청 종류. 가격과 월세는 "가격 변경" 한 종류다 */
function kindOfField(field: MyAdsEditableField): "price" | "floor_exposure" {
  return field === "floorExposure" ? "floor_exposure" : "price";
}

export function hasPendingRequest(
  advertisement: ListingAdvertisementWithListing,
  kind: string,
): boolean {
  return pendingChangeRequests(advertisement).some(
    (request) => request.kind === kind,
  );
}

/**
 * 이 칸을 지금 고칠 수 없는 이유. 고칠 수 있으면 null.
 * 칸을 그릴 때, 값을 받을 때, 보낼 때 모두 이 함수로 다시 확인한다.
 */
export function editBlockReason(
  advertisement: ListingAdvertisementWithListing,
  field: MyAdsEditableField,
  mode: MyAdsMode,
): string | null {
  if (
    field === "monthlyRent" &&
    advertisementTransactionType(advertisement) !== "monthly"
  ) {
    return "월세 광고가 아닙니다.";
  }
  if (advertisement.status !== "active") return "종료된 광고입니다.";
  if (mode === "edit") {
    // 층 노출은 네이버 · CP에서 읽어 온 값이라 우리 기록만 고쳐서는 뜻이 없다
    return field === "floorExposure"
      ? "층 노출은 읽어 온 값입니다. 바꾸려면 변경 요청으로 보내세요."
      : null;
  }
  if (isManualAdvertisement(advertisement)) {
    return "직접 입력한 광고는 요청할 곳이 없습니다. 기록 수정으로 고쳐 주세요.";
  }
  if (field === "floorExposure" && currentFloorExposure(advertisement) === null) {
    return "지금 층 노출 방식을 알 수 없어 바꿔 달라고 할 수 없습니다.";
  }
  if (hasPendingRequest(advertisement, kindOfField(field))) {
    return `처리되지 않은 ${field === "floorExposure" ? "층 노출" : "가격"} 변경 요청이 이미 있습니다. 펼쳐서 요청 탭에서 거둔 뒤 다시 요청하세요.`;
  }
  return null;
}

/** 값 없이 하는 요청(재광고 · 내리기)을 넣을 수 없는 이유 */
export function flagBlockReason(
  advertisement: ListingAdvertisementWithListing,
  flag: "readvertise" | "takedown",
): string | null {
  if (isManualAdvertisement(advertisement)) {
    return "직접 입력한 광고는 요청할 곳이 없습니다.";
  }
  if (flag === "takedown" && advertisement.status !== "active") {
    return "게재 중인 광고만 내려 달라고 할 수 있습니다.";
  }
  if (hasPendingRequest(advertisement, flag)) {
    return `처리되지 않은 ${flag === "readvertise" ? "재광고" : "내리기"} 요청이 이미 있습니다.`;
  }
  return null;
}

/**
 * 표의 금액 입력을 만원 단위 정수로 읽는다. 쉼표 · 공백 · 전각 숫자는 받고,
 * 그 밖의 글자가 섞이면 null (값의 크기를 몰래 바꾸지 않는다).
 */
export function parseManwonCell(text: string): number | null {
  const compact = text.normalize("NFKC").replace(/[,\s]/g, "");
  if (!/^\d+$/.test(compact)) return null;
  const value = Number(compact);
  return Number.isSafeInteger(value) ? value : null;
}

/** 금액으로 받을 수 없는 이유. 받을 수 있으면 null */
export function amountProblem(
  advertisement: ListingAdvertisementWithListing,
  field: "primary" | "monthlyRent",
  value: number | null,
): string | null {
  if (value === null) return "금액은 만원 단위 숫자로 적어 주세요.";
  const transactionType = advertisementTransactionType(advertisement);
  // 월세의 보증금은 0일 수 있다. 매매가 · 전세가 · 월세는 0이 될 수 없다.
  if (value === 0 && !(field === "primary" && transactionType === "monthly")) {
    return `${fieldLabel(advertisement, field)}는 0이 될 수 없습니다.`;
  }
  return null;
}

/** 초안에 값을 넣은 결과. 지금 값과 같으면 그 칸의 초안을 뺀다. 남는 것이 없으면 null */
export function withDraftValue(
  advertisement: ListingAdvertisementWithListing,
  draft: MyAdsRequestDraft | undefined,
  field: MyAdsEditableField,
  value: number | "exact" | "band",
): MyAdsRequestDraft | null {
  const next: MyAdsRequestDraft = { ...draft };
  const current =
    field === "floorExposure"
      ? currentFloorExposure(advertisement)
      : currentAmount(advertisement, field);
  if (current === value) delete next[field];
  else (next as Record<string, unknown>)[field] = value;
  return Object.keys(next).length > 0 ? next : null;
}

export function isDraftEmpty(draft: MyAdsRequestDraft | undefined): boolean {
  return !draft || Object.keys(draft).length === 0;
}

/**
 * 이 칸의 값에 줄을 그을지: 바꿔 달라는 요청이 작성 중이거나 걸려 있다.
 * 새 값은 칸에 적지 않는다 — 무엇으로 바꾸는지는 펼친 요청 탭에서 본다.
 */
export function isValueAsked(
  advertisement: ListingAdvertisementWithListing,
  draft: MyAdsRequestDraft | undefined,
  field: MyAdsEditableField,
): boolean {
  if (draft?.[field] !== undefined) return true;
  return pendingChangeRequests(advertisement).some((request) => {
    const target = request.toValue ?? {};
    if (field === "floorExposure") return request.kind === "floor_exposure";
    if (request.kind !== "price") return false;
    if (field === "monthlyRent") return target.monthlyRent !== undefined;
    return target.price !== undefined || target.deposit !== undefined;
  });
}

const FLOOR_LABELS = { exact: "노출", band: "미노출" } as const;

export type MyAdsDraftLine = {
  key: keyof MyAdsRequestDraft;
  label: string;
  text: string;
};

/** 초안을 요청 탭에 보일 줄로: "매매가 · 32억 → 31억 5,000만" */
export function draftLines(
  advertisement: ListingAdvertisementWithListing,
  draft: MyAdsRequestDraft | undefined,
): MyAdsDraftLine[] {
  if (!draft) return [];
  const lines: MyAdsDraftLine[] = [];
  if (draft.primary !== undefined) {
    lines.push({
      key: "primary",
      label: fieldLabel(advertisement, "primary"),
      text: `${formatMoney(currentAmount(advertisement, "primary"))} → ${formatMoney(draft.primary)}`,
    });
  }
  if (draft.monthlyRent !== undefined) {
    lines.push({
      key: "monthlyRent",
      label: "월세",
      text: `${formatMoney(currentAmount(advertisement, "monthlyRent"))} → ${formatMoney(draft.monthlyRent)}`,
    });
  }
  if (draft.floorExposure !== undefined) {
    const current = currentFloorExposure(advertisement);
    lines.push({
      key: "floorExposure",
      label: "층 노출",
      text: `${current ? FLOOR_LABELS[current] : "미확인"} → ${FLOOR_LABELS[draft.floorExposure]}`,
    });
  }
  if (draft.readvertise) {
    lines.push({ key: "readvertise", label: "재광고", text: "다시 올려 날짜를 새로 받기" });
  }
  if (draft.takedown) {
    lines.push({ key: "takedown", label: "내리기", text: "광고 내리기" });
  }
  return lines;
}

/**
 * 초안을 서버에 보낼 요청으로 바꾼다. 종류마다 하나다 — 가격과 월세는 "가격 변경" 한 건으로 묶인다.
 * 보내기 직전에 다시 걸러, 그 사이 같은 종류의 요청이 걸렸거나 요청할 수 없게 된 것은 뺀다.
 */
export function draftToRequests(
  advertisement: ListingAdvertisementWithListing,
  draft: MyAdsRequestDraft | undefined,
  shared: Pick<CreateAdvertisementChangeRequestDto, "memo" | "dueDate" | "assignedToId">,
): CreateAdvertisementChangeRequestDto[] {
  if (!draft) return [];
  const requests: CreateAdvertisementChangeRequestDto[] = [];
  const price: Record<string, number> = {};
  if (
    draft.primary !== undefined &&
    editBlockReason(advertisement, "primary", "request") === null
  ) {
    price[primaryAmountKey(advertisement) === "advertisedDeposit" ? "deposit" : "price"] =
      draft.primary;
  }
  if (
    draft.monthlyRent !== undefined &&
    editBlockReason(advertisement, "monthlyRent", "request") === null
  ) {
    price.monthlyRent = draft.monthlyRent;
  }
  if (Object.keys(price).length > 0) {
    requests.push({ kind: "price", toValue: price, ...shared });
  }
  if (
    draft.floorExposure !== undefined &&
    editBlockReason(advertisement, "floorExposure", "request") === null
  ) {
    requests.push({
      kind: "floor_exposure",
      toValue: { floorExposure: draft.floorExposure },
      ...shared,
    });
  }
  for (const flag of ["readvertise", "takedown"] as const) {
    if (draft[flag] && flagBlockReason(advertisement, flag) === null) {
      requests.push({ kind: flag, ...shared });
    }
  }
  return requests;
}

/**
 * 이미 요청으로 만들어진 종류를 초안에서 뺀다. 한 광고의 요청 중 일부만 만들어지고 끊겼을 때 쓴다 —
 * 그대로 두면 다시 보낼 때 이미 걸린 종류부터 거절돼 남은 것을 영영 보내지 못한다.
 * 남는 것이 없으면 null.
 */
export function withoutSentKinds(
  draft: MyAdsRequestDraft,
  kinds: readonly CreateAdvertisementChangeRequestDto["kind"][],
): MyAdsRequestDraft | null {
  const next: MyAdsRequestDraft = { ...draft };
  for (const kind of kinds) {
    if (kind === "price") {
      delete next.primary;
      delete next.monthlyRent;
    } else if (kind === "floor_exposure") delete next.floorExposure;
    else if (kind === "readvertise") delete next.readvertise;
    else if (kind === "takedown") delete next.takedown;
  }
  return Object.keys(next).length > 0 ? next : null;
}

/**
 * 기록 수정으로 보낼 값. 화면이 보고 있던 값(expected)을 함께 보내, 그 사이 수집이나 다른 사람이
 * 값을 바꿨으면 서버가 거절하게 한다.
 */
export function buildRecordEdit(
  advertisement: ListingAdvertisementWithListing,
  field: "primary" | "monthlyRent",
  value: number,
): UpdateListingAdvertisementDto {
  const key =
    field === "monthlyRent"
      ? "advertisedMonthlyRent"
      : primaryAmountKey(advertisement);
  return {
    [key]: value,
    expected: { [key]: advertisement[key] },
  };
}
