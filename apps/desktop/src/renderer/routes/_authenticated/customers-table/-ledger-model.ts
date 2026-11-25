import type {
  CustomerLedgerRow,
  CustomerLedgerDemandIntent,
  CustomerLedgerParticipant,
  CustomerLedgerSortField,
  CustomerLedgerListingIntent,
} from "@estate-erp/api-client";
import { TRANSACTION_TYPE_LABELS } from "@estate-erp/shared";
import { formatMoney, formatMoneyRange, formatPyeong, formatRent } from "@/lib/format";

/**
 * 고객 원장 표가 한 줄(CustomerLedgerRow)에서 읽어 내는 값들.
 * 저장된 값이 아니라 그 줄의 의뢰에서 계산한다. 화면 없이 확인할 수 있게 따로 둔다.
 */

/**
 * 줄의 상태.
 *  - active(진행 중): 소개(매칭)가 하나라도 있는 의뢰가 있다.
 *  - exploring(파악 중): 의뢰는 있지만 아직 소개한 것이 없다.
 *
 * "종료"는 여기에 없다. 고객 원장 API가 진행 중(open·hold)인 의뢰가 있는 줄만 돌려주기 때문이다.
 */
export type LedgerRowStatus = "exploring" | "active";

export const LEDGER_ROW_STATUS_LABELS: Record<LedgerRowStatus, string> = {
  exploring: "파악 중",
  active: "진행 중",
};

export const LEDGER_ROW_STATUS_HINTS: Record<LedgerRowStatus, string> = {
  exploring: "의뢰는 있지만 아직 소개한 매물·손님이 없습니다",
  active: "소개했거나 거래 중인 의뢰가 있습니다",
};

export function getLedgerRowStatus(row: CustomerLedgerRow): LedgerRowStatus {
  // 소개(매칭)가 없어도 거래가 있으면 진행 중이다: 매칭 없이 바로 만든 거래(공동중개 등)가 "파악 중"으로 보이면 안 된다.
  const moving =
    row.demandIntents.some(
      (intent) => intent.matchCount > 0 || (intent.activeDealCount ?? 0) > 0,
    ) ||
    row.listingIntents.some(
      (intent) => intent.matchCount > 0 || (intent.activeDealCount ?? 0) > 0,
    );
  return moving ? "active" : "exploring";
}

/**
 * 구하는 손님인지, 내놓은 손님인지. 걸러지지 않는 의뢰 id 목록을 본다
 * (demandIntents·listingIntents는 지금 필터에 맞는 것만 담긴다).
 */
export function getLedgerRowSides(row: CustomerLedgerRow) {
  return {
    buy: row.buyerIntakeIds.length > 0 || row.demandIntents.length > 0,
    sell: row.listingIntakeIds.length > 0 || row.listingIntents.length > 0,
  };
}

export function getLedgerCustomerName(row: CustomerLedgerRow): string {
  return (
    row.primaryParticipant?.contact.name?.trim() ||
    row.participants[0]?.contact.name?.trim() ||
    row.title?.trim() ||
    "이름 없는 고객"
  );
}

/** 대표 연락 고객 말고 함께 묶인 사람 수 */
export function getLedgerCompanionCount(row: CustomerLedgerRow): number {
  return Math.max(0, row.participants.length - 1);
}

export function getLedgerCustomerPhone(row: CustomerLedgerRow): string | null {
  return (
    row.primaryParticipant?.contact.phone ??
    row.participants.find((participant) => participant.contact.phone)?.contact
      .phone ??
    null
  );
}

/** 담당 이름 (구함 의뢰에 지정된 담당, 겹치지 않게). 매물 의뢰에는 담당이 따로 없다. */
export function getLedgerAssignees(row: CustomerLedgerRow): string[] {
  const names: string[] = [];
  for (const intent of row.demandIntents) {
    const name = intent.assignedTo?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** 금액 범위: "15억 ~ 16억" · "15억 이상" (공용 formatMoneyRange). 둘 다 없으면 null. */
function moneyRange(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  return formatMoneyRange(min, max);
}

function areaRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return min === max
      ? formatPyeong(min)
      : `${formatPyeong(min)} ~ ${formatPyeong(max)}`;
  }
  return min != null ? `${formatPyeong(min)} 이상` : `${formatPyeong(max)} 이하`;
}

export function transactionLabel(type: string | null): string {
  if (!type) return "거래 미정";
  return (TRANSACTION_TYPE_LABELS as Record<string, string>)[type] ?? type;
}

/** 구함 조건 한 줄: "고덕동 · 34평 · 15억 ~ 16억" */
export function describeDemandIntent(intent: CustomerLedgerDemandIntent): string {
  const price =
    intent.transactionType === "sale"
      ? moneyRange(
          intent.priceMin ?? intent.budgetMin,
          intent.priceMax ?? intent.budgetMax,
        )
      : (moneyRange(intent.depositMin, intent.depositMax) ??
        moneyRange(intent.budgetMin, intent.budgetMax));
  const rent =
    intent.transactionType === "monthly"
      ? moneyRange(intent.monthlyRentMin, intent.monthlyRentMax)
      : null;
  return [
    intent.contextLabel,
    areaRange(intent.areaMin, intent.areaMax),
    // 월세는 "보증금 / 월세"(화면 표기 기준: "1억 / 250만")
    price && rent ? `${price} / ${rent}` : (price ?? (rent ? `월세 ${rent}` : null)),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** 내놓은 조건의 금액: 매매 "16억 5,000만", 월세 "3,000만 / 180만"(보증금 / 월세, 공용 formatRent) */
export function describeListingPrice(intent: CustomerLedgerListingIntent): string {
  if (intent.transactionType === "monthly") {
    return intent.monthlyRent != null || intent.deposit != null
      ? formatRent(intent.deposit, intent.monthlyRent)
      : "금액 미정";
  }
  const amount =
    intent.transactionType === "jeonse"
      ? (intent.deposit ?? intent.price ?? intent.askingPrice)
      : (intent.price ?? intent.askingPrice);
  return amount != null ? formatMoney(amount) : "금액 미정";
}

export interface LedgerListingGroup {
  listingIntakeId: string;
  propertyId: string;
  contextLabel: string;
  area: number | null;
  lifecycleStatus: string;
  matchCount: number;
  /** 한 매물 의뢰에 걸린 거래 조건들 (매매·전세·월세) */
  options: CustomerLedgerListingIntent[];
}

/** 매물 의뢰 하나에 거래 조건이 여럿이면 한 묶음으로 본다 (서버 순서는 그대로). */
export function groupListingIntents(
  intents: readonly CustomerLedgerListingIntent[],
): LedgerListingGroup[] {
  const groups = new Map<string, LedgerListingGroup>();
  for (const intent of intents) {
    const group = groups.get(intent.listingIntakeId);
    if (group) {
      group.options.push(intent);
      group.matchCount = Math.max(group.matchCount, intent.matchCount);
      continue;
    }
    groups.set(intent.listingIntakeId, {
      listingIntakeId: intent.listingIntakeId,
      propertyId: intent.propertyId,
      contextLabel: intent.contextLabel,
      area: intent.area,
      lifecycleStatus: intent.lifecycleStatus,
      matchCount: intent.matchCount,
      options: [intent],
    });
  }
  return [...groups.values()];
}

export interface LedgerSortOption {
  value: string;
  label: string;
  sortBy: CustomerLedgerSortField;
  sortOrder: "asc" | "desc";
}

/**
 * 서버가 지원하는 정렬만 둔다. "최근 상담순"은 서버 정렬이 없어 아직 없다
 * (쪽 단위로 불러오는 목록이라 화면에서 다시 줄 세우면 순서가 틀린다).
 */
export const LEDGER_SORT_OPTIONS: readonly LedgerSortOption[] = [
  { value: "recent", label: "최근 접수순", sortBy: "createdAt", sortOrder: "desc" },
  { value: "name", label: "이름순", sortBy: "customer", sortOrder: "asc" },
  { value: "matches", label: "소개 많은 순", sortBy: "matchCount", sortOrder: "desc" },
];

export const DEFAULT_LEDGER_SORT = LEDGER_SORT_OPTIONS[0];

/** 고른 줄들의 전화번호 (겹치지 않게, 줄 순서대로) */
export function collectLedgerPhones(rows: readonly CustomerLedgerRow[]): string[] {
  const phones: string[] = [];
  for (const row of rows) {
    const phone = getLedgerCustomerPhone(row);
    if (phone && !phones.includes(phone)) phones.push(phone);
  }
  return phones;
}

/** 적다 만 상담 글. 패널을 닫거나 다른 손님으로 넘어가도 손님(연락처)별로 남는다. */
export interface ConsultationDraft {
  type: string;
  content: string;
}
export type ConsultationDraftStore = Map<string, ConsultationDraft>;

export interface ConsultationSaveRequest {
  contactId: string;
  type: string;
  content: string;
}

export const DEFAULT_CONSULTATION_TYPE = "phone";

/**
 * 고객 원장에서 보내는 상담 저장의 이름표. 저장은 패널이 아니라 화면이 쥐고 있어서
 * (패널은 손님을 바꾸면 새로 그려진다) 어느 패널에서든 이 이름표로 "지금 이 손님 것을 저장 중인지"를 본다.
 */
export const CONSULTATION_SAVE_MUTATION_KEY = [
  "consultations",
  "create",
  "customer-ledger",
] as const;

/** 적는 대로 기억한다. 비어 있고 방법도 처음 그대로면 기억할 것이 없다. */
export function rememberConsultationDraft(
  drafts: ConsultationDraftStore,
  contactId: string,
  draft: ConsultationDraft,
) {
  if (draft.content.trim() || draft.type !== DEFAULT_CONSULTATION_TYPE) {
    drafts.set(contactId, draft);
  } else {
    drafts.delete(contactId);
  }
}

/** 그 사람에게 적다 만 글(내용)이 있는지 */
export function hasConsultationDraft(drafts: ConsultationDraftStore, contactId: string) {
  return Boolean(drafts.get(contactId)?.content.trim());
}

/**
 * 누구와의 상담인지 바꿀 때 적던 글을 그 사람에게로 옮긴다.
 * 옮겨 갈 사람에게 이미 적던 글이 있으면 옮기지 않는다: 덮어쓰면 그 글이 사라진다
 * (같은 사람이 다른 줄에도 묶여 있으면 거기서 적던 글일 수 있다). 그때는 각자 제 글을 그대로 지닌다.
 */
export function carryConsultationDraft(
  drafts: ConsultationDraftStore,
  fromId: string,
  toId: string,
) {
  if (fromId === toId) return;
  const draft = drafts.get(fromId);
  if (!draft || hasConsultationDraft(drafts, toId)) return;
  drafts.delete(fromId);
  drafts.set(toId, draft);
}

/**
 * 저장이 끝난 글을 지운다. 보낸 글과 지금 남아 있는 글이 같을 때만 지운다:
 * 그 사이에 고쳐 적은 글이 있다면 그것은 아직 저장되지 않은 글이다.
 */
export function settleSavedConsultationDraft(
  drafts: ConsultationDraftStore,
  saved: ConsultationSaveRequest,
) {
  const draft = drafts.get(saved.contactId);
  if (draft && draft.type === saved.type && draft.content.trim() === saved.content) {
    drafts.delete(saved.contactId);
  }
}

/** 쪽으로 나눠 받은 상담을 한 줄로 잇는다 (새 상담이 생겨 쪽이 밀려도 같은 상담을 두 번 보이지 않는다). */
export function mergeConsultationPages<T extends { id: string }>(
  pages: ReadonlyArray<{ items: T[] }> | undefined,
): T[] {
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * 줄에 묶인 사람의 역할 이름. 서버는 구매 의뢰의 역할(buyer…)과, 매물 관련인의 역할을
 * 옮긴 값(owner → seller, co_owner → co_seller, 그 밖은 그대로)을 준다.
 */
export const LEDGER_ROLE_LABELS: Record<string, string> = {
  buyer: "구함",
  co_buyer: "공동 구함",
  seller: "내놓음",
  co_seller: "공동 내놓음",
  representative: "대리인",
  supporter: "조력자",
  advisor: "자문",
  lawyer: "법무사",
  tax_agent: "세무사",
  other: "기타",
};

export function describeParticipantRoles(roles: readonly string[]): string {
  return roles.map((role) => LEDGER_ROLE_LABELS[role] ?? role).join(" · ");
}

/**
 * 이 줄의 손님들: 실제 당사자(구하는 사람·내놓은 사람)와 대표 연락 고객.
 * 대리인·법무사처럼 곁에서 돕는 사람은 줄에 함께 나오지만 손님은 아니다
 * (그 사람들의 상담은 다른 손님 일일 수 있어 이 줄의 상담으로 섞지 않는다).
 * 순서는 서버가 준 그대로다: 대표 연락 고객이 맨 앞.
 */
export function getLedgerParties(row: CustomerLedgerRow): CustomerLedgerParticipant[] {
  const parties = row.participants.filter(
    (participant) => participant.isPrincipal || participant.isCommunicationPrimary,
  );
  if (parties.length > 0) return parties;
  if (row.participants.length > 0) return [...row.participants];
  return row.primaryParticipant ? [row.primaryParticipant] : [];
}

/** 패널 머리에 쓰는 이름: 손님이 여럿이면 함께 적는다. "한지우, 서민호" / "한지우, 서민호 외 1명" */
export function getLedgerHeading(row: CustomerLedgerRow): string {
  const names = getLedgerParties(row)
    .map((participant) => participant.contact.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return getLedgerCustomerName(row);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} 외 ${names.length - 2}명`;
}

export interface ConsultationSource<T> {
  /** 그 손님의 상담 중 지금까지 받아 온 것 (최근 것부터) */
  items: T[];
  /** 아직 받아 오지 않은 더 오래된 상담이 있는지 */
  hasMore: boolean;
}

/**
 * 여러 손님의 상담을 한 줄로 잇는다 (최근 것부터).
 *
 * 손님마다 쪽 단위로 받아 오므로, 어떤 손님의 아직 받지 않은 상담이 다른 손님의 받아 온 상담보다
 * 최근일 수 있다. 그래서 "더 받을 것이 남은 손님"이 받아 온 가장 오래된 상담보다 오래된 것은
 * 아직 내놓지 않는다. 그 아래는 순서가 확정되지 않았다(더 불러오면 사이에 끼어든다).
 */
export function orderConsultationSources<T extends { id: string; createdAt: string }>(
  sources: ReadonlyArray<ConsultationSource<T>>,
): T[] {
  let horizon = "";
  for (const source of sources) {
    if (!source.hasMore) continue;
    const oldest = source.items.reduce(
      (min, item) => (min === "" || item.createdAt < min ? item.createdAt : min),
      "",
    );
    // 받을 것이 남았는데 받아 온 것이 없으면 어디까지가 확정인지 알 수 없다.
    if (oldest === "") return [];
    if (oldest > horizon) horizon = oldest;
  }
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const source of sources) {
    for (const item of source.items) {
      if (seen.has(item.id) || item.createdAt < horizon) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged.sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
  );
}
