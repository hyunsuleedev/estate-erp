import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { formatMoney } from "@/lib/format";
import { getCanonicalLocation } from "./my-ads-format";
import type { AdvertisementActionDraft, InlinePriceEdit } from "./my-ads-types";

/**
 * 표의 금액 입력칸에 친 값을 만원 단위 정수 글자로 바꾼다(제출 검사 isValidManwonInput과 같은 범위).
 * 천 단위 쉼표·공백·전각 숫자는 받아 들이고, 그 밖의 글자(소수점, 음수 부호, 문자)가 섞이면
 * null을 돌려준다 — 입력칸은 이전 값을 그대로 둔다. "12.5"를 "125"로 바꾸는 식으로 값의
 * 크기를 몰래 바꾸지 않기 위해서다.
 */
export function sanitizeManwonInput(value: string): string | null {
  const compact = value.normalize("NFKC").replace(/[,\s]/g, "");
  return /^\d*$/.test(compact) ? compact : null;
}

export function inlineMoneyEditLabel(value: string): string {
  const amount = parseManwon(value);
  if (amount === 0) return "0";
  return formatMoney(amount);
}

/** 인라인 편집의 시작값 — createActionDraft 와 같은 소스를 쓴다. */
export function inlineEditBase(
  advertisement: ListingAdvertisementWithListing,
): InlinePriceEdit {
  const { advertisement: _ignored, ...rest } = createActionDraft(advertisement);
  return rest;
}

export function isInlineEditDirty(
  advertisement: ListingAdvertisementWithListing,
  edit: InlinePriceEdit,
): boolean {
  const base = inlineEditBase(advertisement);
  return (
    base.advertisedPrice !== edit.advertisedPrice ||
    base.advertisedDeposit !== edit.advertisedDeposit ||
    base.advertisedMonthlyRent !== edit.advertisedMonthlyRent ||
    base.republishAfterSave !== edit.republishAfterSave
  );
}

export function createActionDraft(
  advertisement: ListingAdvertisementWithListing,
): AdvertisementActionDraft {
  const context = advertisement.actionContext;
  return {
    advertisement,
    advertisedPrice: nullableMoneyInput(
      advertisement.advertisedPrice ??
        advertisement.listing?.price ??
        context?.price,
    ),
    advertisedDeposit: nullableMoneyInput(
      advertisement.advertisedDeposit ??
        advertisement.listing?.deposit ??
        context?.deposit,
    ),
    advertisedMonthlyRent: nullableMoneyInput(
      advertisement.advertisedMonthlyRent ??
        advertisement.listing?.monthlyRent ??
        context?.monthlyRent,
    ),
    republishAfterSave: true,
  };
}

function nullableMoneyInput(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseManwon(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isValidManwonInput(value: string): boolean {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0;
}

export function validateActionDrafts(
  drafts: AdvertisementActionDraft[],
): string | null {
  if (drafts.length === 0) return "수정할 광고를 선택해 주세요.";
  for (const draft of drafts) {
    const location = getCanonicalLocation(draft.advertisement);
    const values = [
      draft.advertisedPrice,
      draft.advertisedDeposit,
      draft.advertisedMonthlyRent,
    ];
    if (!values.every(isValidManwonInput)) {
      return `${location.site} ${location.ho ?? ""}: 금액은 0 이상의 만원 단위 정수로 입력해 주세요.`;
    }

    const transactionType =
      draft.advertisement.listing?.transactionType ?? "sale";
    const price = parseManwon(draft.advertisedPrice);
    const deposit = parseManwon(draft.advertisedDeposit);
    const monthlyRent = parseManwon(draft.advertisedMonthlyRent);
    if (transactionType === "sale" && (!price || price <= 0)) {
      return `${location.site} ${location.ho ?? ""}: 매매가를 입력해 주세요.`;
    }
    if (transactionType === "jeonse" && (!deposit || deposit <= 0)) {
      return `${location.site} ${location.ho ?? ""}: 전세가를 입력해 주세요.`;
    }
    if (
      transactionType === "monthly" &&
      (deposit == null || !monthlyRent || monthlyRent <= 0)
    ) {
      return `${location.site} ${location.ho ?? ""}: 보증금과 월세를 입력해 주세요.`;
    }

    const context = draft.advertisement.actionContext;
    const termsChanged =
      price !== (context?.price ?? null) ||
      deposit !== (context?.deposit ?? null) ||
      monthlyRent !== (context?.monthlyRent ?? null);
    if (!termsChanged && !draft.republishAfterSave) {
      return `${location.site} ${location.ho ?? ""}: 변경된 조건이 없거나 재광고를 선택하지 않았습니다.`;
    }
  }
  return null;
}

export function buildAdvertisementTaskContent(
  rationale: string,
  drafts: AdvertisementActionDraft[],
): string {
  const request =
    rationale.trim() ||
    "현재 CP 상태와 네이버 비교 결과를 확인하고, 아래 요청 조건을 사용자 확인 후 반영해 주세요.";
  const targets = drafts.map((draft) => {
    const advertisement = draft.advertisement;
    const location = getCanonicalLocation(advertisement);
    const transactionType = advertisement.listing?.transactionType ?? "sale";
    const identifiers = [
      `listingAdvertisementId=${advertisement.id}`,
      `listingId=${advertisement.listingId}`,
      `channel=${advertisement.channel}`,
      advertisement.externalAdId
        ? `externalAdId=${advertisement.externalAdId}`
        : null,
      advertisement.naverArticleNo
        ? `naverArticleNo=${advertisement.naverArticleNo}`
        : null,
    ].filter((value): value is string => Boolean(value));
    const requestedTerms =
      transactionType === "monthly"
        ? `보증금=${parseManwon(draft.advertisedDeposit)}만원, 월세=${parseManwon(draft.advertisedMonthlyRent)}만원`
        : transactionType === "jeonse"
          ? `전세가=${parseManwon(draft.advertisedDeposit)}만원`
          : `매매가=${parseManwon(draft.advertisedPrice)}만원`;
    const locationLabel = [
      location.site,
      location.dong,
      location.floor,
      location.ho,
    ]
      .filter(Boolean)
      .join(" ");

    return [
      `- ${locationLabel} (${identifiers.join(", ")})`,
      `  요청조건: ${requestedTerms}, 재광고=${draft.republishAfterSave ? "요청" : "요청 안 함"}`,
    ].join("\n");
  });

  return [request, "", "대상 광고", ...targets].join("\n");
}
