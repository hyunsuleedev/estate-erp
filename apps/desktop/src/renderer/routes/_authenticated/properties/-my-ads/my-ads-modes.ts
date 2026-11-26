import type {
  AdvertisementChangeAction,
  CreateAdvertisementChangeRequestDto,
  ListingAdvertisementWithListing,
  UpdateListingAdvertisementDto,
} from "@estate-erp/api-client";
import { formatMoney } from "@/lib/format";
import {
  advertisementTransactionType,
  pendingChangeRequests,
} from "./my-ads-link";
import { advertisementSyncState, getCachedComparison } from "./my-ads-format";

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
  if (field === "monthlyRent") return advertisement.advertisedMonthlyRent;
  const key = primaryAmountKey(advertisement);
  return (
    advertisement[key] ??
    (advertisementTransactionType(advertisement) === "jeonse"
      ? advertisement.advertisedPrice
      : null)
  );
}

/** 지금 네이버에 보이는 층 노출 방식. 비교를 읽은 적이 없으면 우리 기록의 값 */
export function currentFloorExposure(
  advertisement: ListingAdvertisementWithListing,
): "exact" | "band" | null {
  const observed = advertisement.comparison?.ownAdvertisement
    ? getCachedComparison(advertisement).ownFloorExposureMode
    : null;
  const value = observed === "exact" || observed === "band" ? observed : advertisement.floorExposure;
  return value === "exact" || value === "band" ? value : null;
}

export function hasPendingRequest(
  advertisement: ListingAdvertisementWithListing,
  kind?: "price" | "floor_exposure" | AdvertisementChangeAction,
): boolean {
  const pending = pendingChangeRequests(advertisement);
  if (!kind) return pending.length > 0;
  return pending.some((request) => {
    const target = request.targetValue ?? {};
    if (kind === "price") {
      return (
        (request.action === "update" ||
          request.action === "publish" ||
          request.action === "readvertise") &&
        (target.price !== undefined ||
          target.deposit !== undefined ||
          target.monthlyRent !== undefined)
      );
    }
    if (kind === "floor_exposure") {
      return (
        (request.action === "update" ||
          request.action === "publish" ||
          request.action === "readvertise") &&
        target.floorExposure !== undefined
      );
    }
    return request.action === kind;
  });
}

/**
 * 이 칸을 지금 고칠 수 없는 이유. 고칠 수 있으면 null.
 * 칸을 그릴 때, 값을 받을 때, 보낼 때 모두 이 함수로 다시 확인한다.
 */
export function editBlockReason(
  advertisement: ListingAdvertisementWithListing,
  field: MyAdsEditableField,
  mode: MyAdsMode,
  /** 이 광고에 작성 중인 요청. 내리기를 골라 둔 줄은 값을 바꿔 달라고 할 수 없다 */
  draft?: MyAdsRequestDraft,
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
      ? "층 노출은 읽어 온 값입니다. 바꾸려면 광고 요청으로 보내세요."
      : null;
  }
  if (field === "floorExposure" && currentFloorExposure(advertisement) === null) {
    return "지금 층 노출 방식을 알 수 없어 바꿔 달라고 할 수 없습니다.";
  }
  if (pendingChangeRequests(advertisement).length > 0) {
    return "처리 중인 요청이 이미 있습니다. 펼쳐서 요청 탭에서 거둔 뒤 다시 요청하세요.";
  }
  // 내릴 광고의 가격 · 층 노출을 바꿔 달라는 것은 앞뒤가 맞지 않는다
  if (draft?.takedown) {
    return "내리기를 요청하는 광고입니다. 값을 바꾸려면 내리기 체크를 먼저 푸세요.";
  }
  return null;
}

/** 값 없이 하는 요청(재광고 · 내리기)을 넣을 수 없는 이유 */
export function flagBlockReason(
  advertisement: ListingAdvertisementWithListing,
  flag: "readvertise" | "takedown",
): string | null {
  if (flag === "takedown" && advertisement.status !== "active") {
    return "게재 중인 광고만 내려 달라고 할 수 있습니다.";
  }
  if (pendingChangeRequests(advertisement).length > 0) {
    return "처리 중인 요청이 이미 있습니다. 펼쳐서 요청 탭에서 거둔 뒤 다시 요청하세요.";
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
 */
export function isValueAsked(
  advertisement: ListingAdvertisementWithListing,
  draft: MyAdsRequestDraft | undefined,
  field: MyAdsEditableField,
): boolean {
  if (draft?.[field] !== undefined) return true;
  return pendingChangeRequests(advertisement).some((request) => {
    const target = request.targetValue ?? {};
    if (field === "floorExposure") return target.floorExposure !== undefined;
    if (field === "monthlyRent") return target.monthlyRent !== undefined;
    return target.price !== undefined || target.deposit !== undefined;
  });
}

const FLOOR_REQUEST_LABELS = { exact: "정확한 층", band: "고·중·저" } as const;

/** 칸 바로 아래에 표시할 요청 값 (작성 중인 초안 우선, 없으면 서버에 걸린 미완료 요청). */
export function requestedCellDisplay(
  advertisement: ListingAdvertisementWithListing,
  draft: MyAdsRequestDraft | undefined,
  field: MyAdsEditableField,
): { kind: "draft" | "pending"; text: string } | null {
  if (draft?.[field] !== undefined) {
    if (field === "floorExposure") {
      const value = draft.floorExposure;
      return value ? { kind: "draft", text: FLOOR_REQUEST_LABELS[value] } : null;
    }
    const amount = draft[field];
    if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
    return {
      kind: "draft",
      text: amount === 0 ? "0원" : formatMoney(amount),
    };
  }

  for (const request of pendingChangeRequests(advertisement)) {
    if (request.action === "takedown") continue;
    const target = request.targetValue ?? {};
    if (field === "floorExposure") {
      if (target.floorExposure === "exact" || target.floorExposure === "band") {
        return {
          kind: "pending",
          text: FLOOR_REQUEST_LABELS[target.floorExposure],
        };
      }
      continue;
    }
    if (field === "monthlyRent") {
      if (typeof target.monthlyRent === "number" && Number.isFinite(target.monthlyRent)) {
        return { kind: "pending", text: formatMoney(target.monthlyRent) };
      }
      continue;
    }
    const rawPrimary =
      primaryAmountKey(advertisement) === "advertisedDeposit"
        ? (target.deposit ?? target.price)
        : (target.price ?? target.deposit);
    if (typeof rawPrimary === "number" && Number.isFinite(rawPrimary)) {
      return {
        kind: "pending",
        text: rawPrimary === 0 ? "0원" : formatMoney(rawPrimary),
      };
    }
  }

  return null;
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
 * 초안을 서버에 보낼 요청 하나로 바꾼다 (광고 1건당 열린 요청 1개).
 * 내리기(takedown)가 켜지면 재광고·값 수정과 배타적이라 takedown만 보낸다.
 * 직접 기록(manual) 광고이고 아직 CP에 올라가지 않았다면 update 대신 publish도 가능하지만,
 * 기존 광고 행에 대한 요청은 advertisementId를 달아 update/readvertise/takedown으로 보낸다.
 */
export function draftToRequests(
  advertisement: ListingAdvertisementWithListing,
  draft: MyAdsRequestDraft | undefined,
  shared?: Pick<CreateAdvertisementChangeRequestDto, "memo" | "dueDate" | "assignedToId">,
): CreateAdvertisementChangeRequestDto[] {
  if (!draft) return [];
  const baseIds = {
    advertisementId: advertisement.id,
    listingId: advertisement.listingId ?? null,
    channel: advertisement.channel,
    ...(advertisement.cpAccountId ? { cpAccountId: advertisement.cpAccountId } : {}),
    ...(shared ?? {}),
  };

  if (draft.takedown && flagBlockReason(advertisement, "takedown") === null) {
    return [{ ...baseIds, action: "takedown", targetValue: {} }];
  }

  const targetValue: Record<string, unknown> = {};
  if (
    draft.primary !== undefined &&
    editBlockReason(advertisement, "primary", "request") === null
  ) {
    targetValue[primaryAmountKey(advertisement) === "advertisedDeposit" ? "deposit" : "price"] =
      draft.primary;
  }
  if (
    draft.monthlyRent !== undefined &&
    editBlockReason(advertisement, "monthlyRent", "request") === null
  ) {
    targetValue.monthlyRent = draft.monthlyRent;
  }
  if (
    draft.floorExposure !== undefined &&
    editBlockReason(advertisement, "floorExposure", "request") === null
  ) {
    targetValue.floorExposure = draft.floorExposure;
  }

  const wantsReadvertise =
    Boolean(draft.readvertise) &&
    flagBlockReason(advertisement, "readvertise") === null;
  if (wantsReadvertise) {
    return [{ ...baseIds, action: "readvertise", targetValue }];
  }

  if (Object.keys(targetValue).length > 0) {
    const action: AdvertisementChangeAction =
      advertisementSyncState(advertisement) === "manual" && !advertisement.externalAdId
        ? "update"
        : "update";
    return [{ ...baseIds, action, targetValue }];
  }

  return [];
}

/**
 * 이미 요청으로 만들어진 동작을 초안에서 뺀다. 남는 것이 없으면 null.
 */
export function withoutSentActions(
  draft: MyAdsRequestDraft,
  actions: readonly AdvertisementChangeAction[],
): MyAdsRequestDraft | null {
  const next: MyAdsRequestDraft = { ...draft };
  for (const action of actions) {
    if (action === "takedown") delete next.takedown;
    else if (action === "readvertise") {
      delete next.readvertise;
      delete next.primary;
      delete next.monthlyRent;
      delete next.floorExposure;
    } else if (action === "update" || action === "publish") {
      delete next.primary;
      delete next.monthlyRent;
      delete next.floorExposure;
    }
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
