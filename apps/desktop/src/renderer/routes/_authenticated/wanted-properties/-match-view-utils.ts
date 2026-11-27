import type {
  BuyerRequirementWithMatches,
  CalendarEvent,
  CreateCalendarEventDto,
  Match,
  UpdateCalendarEventDto,
} from '@estate-erp/api-client';
import {
  DealStage,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  MATCH_CLOSED_REASON_LABELS,
  MatchClosedReason,
  MatchStage,
  normalizeDealStage,
  normalizeMatchStage,
  formatPlaceLabel,
} from '@estate-erp/shared';
import { getStatusMeta, type Tone } from '@/lib/status-config';
import { formatMoney, formatPhone, formatRelativeDayTime } from '@/lib/format';
import { getIntakeConfirmationState } from '@/lib/listing-status';
import { formatAreaRange } from '../buyer-requirements/-buyer-utils';
import { NO_MATCH_STAGE } from './-wanted-filters';

export type MatchViewListItem = Match;

/** 뷰 컴포넌트 공통 액션 묶음 — dealCreated 전환은 페이지가 거래 생성 다이얼로그로 라우팅한다 */
export interface MatchRowActions {
  isUpdating: boolean;
  isScheduling: boolean;
  savingMemoId: string | null;
  onStageChange: (id: string, stage: string) => void;
  onSaveMemo: (match: Match, memo: string | null) => Promise<void>;
  onRequestDelete: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onScheduleViewing: (match: Match, startLocalValue: string) => void;
}

/** 상단 KPI 집계 */
export function getMatchKpis(matches: MatchViewListItem[]) {
  return matches.reduce(
    (kpis, match) => {
      const stage = normalizeMatchStage(match.stage);
      if (stage === MatchStage.DEAL_CREATED) {
        kpis.converted += 1;
      } else if (stage === MatchStage.CLOSED) {
        kpis.closed += 1;
      } else {
        kpis.active += 1;
        if (stage === MatchStage.VIEWING) {
          kpis.viewing += 1;
        }
      }
      return kpis;
    },
    { active: 0, viewing: 0, converted: 0, closed: 0 },
  );
}

// ── 단계 정의 (라벨/컬러는 status-config 단일 소스) ──────────────────────────

export const matchBoardStages = [
  MatchStage.SUGGESTED,
  MatchStage.BUYER_INTERESTED,
  MatchStage.VIEWING_CONFIRMED,
  MatchStage.VIEWING,
  MatchStage.BUYER_REVIEWING,
  MatchStage.NEGOTIATING,
] as const;

export const buyerProgressStages = [
  ...matchBoardStages,
  MatchStage.DEAL_CREATED,
] as const;

export const matchStageOrder = [
  ...buyerProgressStages,
  MatchStage.CLOSED,
] as const;

export type MatchBoardStage = (typeof matchBoardStages)[number];
export type MatchProgressStage = (typeof buyerProgressStages)[number];
export type MatchProgressNodeState = 'completed' | 'current' | 'pending' | 'failed';

export interface MatchStageActionCopy {
  /** 이 단계에서 지금 할 일의 이름. 매물관리 매칭 펼침의 "다음 할 일"과 같은 낱말이다 (property-match-panel.tsx의 STAGE_GUIDE). */
  nextTask: string;
  progressLabel: string;
  /** 지금 단계를 끝내는 버튼의 이름. 단계는 들어왔다고 끝난 것이 아니라 확정해야 끝난다. */
  confirmLabel: string;
  closeLabel: string;
}

const MATCH_STAGE_ACTION_COPY: Partial<Record<MatchProgressStage, MatchStageActionCopy>> = {
  [MatchStage.SUGGESTED]: {
    nextTask: '매물 제안하기',
    progressLabel: '고객에게 제안',
    confirmLabel: '내부 후보 확정',
    closeLabel: '후보에서 제외 · 종료',
  },
  [MatchStage.BUYER_INTERESTED]: {
    nextTask: '고객 답변 확인',
    progressLabel: '관심 있음 · 임장 조율로',
    confirmLabel: '고객 관심 확정',
    closeLabel: '관심 없음 · 종료',
  },
  [MatchStage.VIEWING_CONFIRMED]: {
    nextTask: '집주인 확인',
    progressLabel: '조율 완료 · 임장으로',
    confirmLabel: '임장 일정 확정',
    closeLabel: '임장 불가 · 종료',
  },
  // 임장은 다녀오면 끝난다. 고객의 반응은 다음 단계(고객 검토)에서 받는다.
  [MatchStage.VIEWING]: {
    nextTask: '임장 진행',
    progressLabel: '임장 완료 · 고객 검토로',
    confirmLabel: '임장 완료',
    closeLabel: '임장 취소 · 종료',
  },
  // 고객은 여러 집을 보고 고민한다. 이 단계의 끝은 그 고민의 결론이다.
  [MatchStage.BUYER_REVIEWING]: {
    nextTask: '고객 반응 확인',
    progressLabel: '검토 후 관심 있음 · 협상으로',
    confirmLabel: '검토 후 관심 있음 · 협상으로',
    closeLabel: '검토 후 관심 없음 · 종료',
  },
  [MatchStage.NEGOTIATING]: {
    nextTask: '가격·입주일 협의',
    progressLabel: '조건 합의 · 거래로 전환',
    confirmLabel: '조건 합의 · 거래 전환',
    closeLabel: '협상 결렬 · 종료',
  },
};

export function getMatchStageActionCopy(stage: string): MatchStageActionCopy | null {
  return MATCH_STAGE_ACTION_COPY[normalizeMatchStage(stage) as MatchProgressStage] ?? null;
}

/**
 * 종료한 매칭이 왜 끝났는지. 사람이 닫았으면 그 단계의 종료 단추 이름("관심 없음"),
 * 시스템이 닫았으면 그 이유("다른 손님과 본계약")를 쓴다. 종료가 아니면 null.
 */
export function getMatchClosedReasonText(
  match: Pick<MatchViewListItem, 'stage' | 'closedFromStage' | 'closedReason'>,
): string | null {
  if (normalizeMatchStage(match.stage) !== MatchStage.CLOSED) return null;
  const reason = match.closedReason as MatchClosedReason | null;
  if (reason && reason !== MatchClosedReason.MANUAL && MATCH_CLOSED_REASON_LABELS[reason]) {
    return MATCH_CLOSED_REASON_LABELS[reason];
  }
  const copy = match.closedFromStage ? getMatchStageActionCopy(match.closedFromStage) : null;
  return copy ? copy.closeLabel.replace(/\s*·\s*종료$/, '') : '직접 종료';
}

export function getMatchStageLabel(stage: string): string {
  return getStatusMeta('matchStage', normalizeMatchStage(stage)).label;
}

const TONE_HEADER_CLASS: Record<Tone, string> = {
  gray: 'bg-muted text-muted-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
  pink: 'bg-pink-soft text-pink',
  orange: 'bg-orange-soft text-orange',
  destructive: 'bg-destructive-soft text-destructive',
  neutral: 'bg-neutral-soft text-neutral-strong',
};

const TONE_DOT_CLASS: Record<Tone, string> = {
  gray: 'bg-muted-foreground/50',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  violet: 'bg-violet',
  pink: 'bg-pink',
  orange: 'bg-orange',
  destructive: 'bg-destructive',
  neutral: 'bg-neutral-strong',
};

/** 칸반 컬럼 헤더 등 면적이 있는 영역용 단계 컬러 */
export function getMatchStageHeaderClass(stage: string): string {
  return TONE_HEADER_CLASS[getStatusMeta('matchStage', stage).tone];
}

/** 단계 점(dot) 표시용 컬러 */
export function getMatchStageDotClass(stage: string): string {
  return TONE_DOT_CLASS[getStatusMeta('matchStage', stage).tone];
}

// ── 방문 일정 ────────────────────────────────────────────────────────────────

export function getUpcomingViewingEvent(
  match: MatchViewListItem,
  now: Date = new Date(),
) {
  const nowTime = now.getTime();

  return (match.calendarEvents ?? [])
    .filter((event) => event.type === 'viewing')
    .filter((event) => new Date(event.start).getTime() >= nowTime)
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())[0] ?? null;
}

export function buildViewingCalendarEventPayload(
  match: MatchViewListItem,
  startLocalValue: string,
  durationMinutes = 60,
): CreateCalendarEventDto {
  const start = new Date(startLocalValue);

  if (Number.isNaN(start.getTime())) {
    throw new Error('Invalid viewing start date');
  }

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const buyerName = match.buyerRequirement?.contact?.name ?? '고객';
  // 같은 단지에서 여러 집을 보는 날이 많아 동 · 호까지 적는다 (캘린더에서 어느 집인지 바로 보이게)
  const listingTitle = getMatchTitle(match);
  const listingName = listingTitle === '매물 정보 없음' ? '매물' : listingTitle;
  const contactId = match.buyerRequirement?.contactId;

  return {
    title: `${buyerName} ${listingName} 임장`,
    description: '매칭 단계에서 잡은 임장 일정',
    type: 'viewing',
    start: start.toISOString(),
    end: end.toISOString(),
    // 색은 보내지 않는다: 캘린더가 종류(임장)의 색을 쓴다. 예전에는 파란색을 박아 넣어
    // 캘린더에서 직접 만든 임장(초록)과 같은 종류의 약속이 다르게 보였다.
    color: undefined,
    propertyId: match.propertyId,
    listingId: match.listingId,
    matchId: match.id,
    ...(contactId ? { contactId } : {}),
  };
}

export function toCalendarEventUpdatePayload(payload: CreateCalendarEventDto): UpdateCalendarEventDto {
  return {
    title: payload.title,
    description: payload.description,
    type: payload.type,
    allDay: payload.allDay,
    start: payload.start,
    end: payload.end,
    color: payload.color,
    propertyId: payload.propertyId,
    listingId: payload.listingId,
    contactId: payload.contactId,
    matchId: payload.matchId,
    dealId: payload.dealId,
  };
}

export function getDefaultViewingStartDate(now: Date = new Date()) {
  const start = new Date(now);
  start.setHours(start.getHours() + 1, 0, 0, 0);
  return start;
}

export function toDateTimeLocalInputValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

/** 임장 일시: 앱 공용 표기("오늘 14:00" · "11.28 (토) 14:00") */
export function formatViewingEventTime(event: CalendarEvent) {
  return formatRelativeDayTime(event.start);
}

// ── 단계 전이 ────────────────────────────────────────────────────────────────

export function getNextMatchStage(stage: string) {
  const currentStage = normalizeMatchStage(stage);
  const currentIndex = matchStageOrder.indexOf(
    currentStage as (typeof matchStageOrder)[number],
  );
  if (currentIndex < 0 || currentIndex >= matchStageOrder.length - 2) {
    return null;
  }
  return matchStageOrder[currentIndex + 1];
}

/**
 * 방문 일정을 잡으면 임장 단계로 옮긴다. 임장 조율에서만이 아니라 그 앞(내부 후보 · 고객 관심)에서 바로 잡아도 같다
 * — 단계 건너뛰기는 허용된 결정이고, 예전에는 일정은 잡혔는데 단계가 '내부 후보'에 남아 둘이 어긋났다.
 */
export function shouldMoveToViewingOnSchedule(stage: string) {
  const index = matchStageOrder.indexOf(
    normalizeMatchStage(stage) as (typeof matchStageOrder)[number],
  );
  return index >= 0 && index < matchStageOrder.indexOf(MatchStage.VIEWING);
}

/** 단계 이동 전에 사용자에게 설명해야 하는 업무상 선행 조건 */
export function getMatchStageBlockReason(
  match: MatchViewListItem,
  targetStage: string,
  now = new Date(),
): string | null {
  const currentStage = normalizeMatchStage(match.stage);
  const normalizedTarget = normalizeMatchStage(targetStage);
  const currentIndex = matchStageOrder.indexOf(
    currentStage as (typeof matchStageOrder)[number],
  );
  const targetIndex = matchStageOrder.indexOf(
    normalizedTarget as (typeof matchStageOrder)[number],
  );
  const buyerInterestedIndex = matchStageOrder.indexOf(
    MatchStage.BUYER_INTERESTED,
  );
  const isCrossingBuyerInterest =
    normalizedTarget !== MatchStage.CLOSED &&
    currentIndex < buyerInterestedIndex &&
    targetIndex >= buyerInterestedIndex;

  if (isCrossingBuyerInterest) {
    const listing = match.listing;
    const intake = listing?.intake;
    if (!intake) {
      return '매물 확인 정보가 없습니다. 매물관리에서 집주인·의뢰인 확인을 먼저 완료해 주세요.';
    }
    if (intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
      return '종료된 매물입니다. 의뢰를 다시 연 뒤 고객에게 제안해 주세요.';
    }
    if (
      listing.isPaused ||
      intake.lifecycleStatus === IntakeLifecycleStatus.HOLD
    ) {
      return '보류된 매물입니다. 매물을 재개한 뒤 고객에게 제안해 주세요.';
    }

    const confirmationState = getIntakeConfirmationState(intake, now);
    if (confirmationState === IntakeConfirmationState.NO_ANSWER) {
      return '집주인·의뢰인 확인이 되지 않았습니다. 다시 확인한 뒤 진행해 주세요.';
    }
    if (confirmationState === IntakeConfirmationState.OVERDUE) {
      return '매물 확인 기한이 지났습니다. 다시 확인한 뒤 고객에게 제안해 주세요.';
    }
    if (confirmationState !== IntakeConfirmationState.VERIFIED) {
      return '매물 확인을 완료한 뒤 고객 관심 단계로 이동할 수 있습니다.';
    }
  }

  // 단계 순서는 막지 않는다. 임장 없이 계약으로 가는 경우처럼 실제 업무가 단계를 건너뛴다(서버도 같다).

  return null;
}

export function getProgressNodeState(
  match: Pick<MatchViewListItem, 'stage' | 'closedFromStage'>,
  stage: MatchProgressStage,
): MatchProgressNodeState {
  const normalizedCurrentStage = normalizeMatchStage(match.stage);
  const nodeIndex = buyerProgressStages.indexOf(stage);

  if (normalizedCurrentStage === MatchStage.CLOSED) {
    if (!match.closedFromStage) {
      return 'pending';
    }

    const failedIndex = buyerProgressStages.indexOf(
      normalizeMatchStage(match.closedFromStage) as MatchProgressStage,
    );
    if (failedIndex < 0) {
      return 'pending';
    }
    if (nodeIndex < failedIndex) {
      return 'completed';
    }
    if (nodeIndex === failedIndex) {
      return 'failed';
    }
    return 'pending';
  }

  if (normalizedCurrentStage === MatchStage.DEAL_CREATED) {
    return 'completed';
  }

  const currentIndex = buyerProgressStages.indexOf(
    normalizedCurrentStage as MatchProgressStage,
  );

  if (nodeIndex < currentIndex) {
    return 'completed';
  }

  if (nodeIndex === currentIndex) {
    return 'current';
  }

  return 'pending';
}

// ── Deal 연결 ────────────────────────────────────────────────────────────────

/** 취소되지 않은 연결 Deal (dealLinkage) */
export function getActiveDealLink(match: MatchViewListItem) {
  return (match.deals ?? []).find((deal) => !deal.isCancelled) ?? null;
}

/**
 * 같은 집(같은 매물 의뢰)의 다른 거래 조건에 진행 중인 거래. 한 의뢰에는 거래가 하나뿐이라,
 * 있으면 이 매칭은 거래로 넘길 수 없다 (예: 매매로 붙였는데 같은 집 전세가 가계약 중).
 * 이 매칭이 만든 거래는 빼고 본다.
 */
export function getSiblingOccupyingDeal(
  match: Pick<MatchViewListItem, 'listing' | 'listingId' | 'deals'>,
): { transactionType: string; stage: string; sameListing: boolean } | null {
  const ownDealIds = new Set((match.deals ?? []).map((deal) => deal.id));
  // 이 매물 자체에 다른 손님(또는 매칭 없이 만든) 거래가 있는 경우도 같다
  const ownListingDeal = (match.listing?.deals ?? []).find((deal) => !ownDealIds.has(deal.id));
  if (ownListingDeal && match.listing) {
    return {
      transactionType: match.listing.transactionType,
      stage: ownListingDeal.stage,
      sameListing: true,
    };
  }
  for (const sibling of match.listing?.intake?.listings ?? []) {
    const deal = (sibling.deals ?? []).find((item) => !ownDealIds.has(item.id));
    if (deal) {
      return {
        transactionType: sibling.transactionType,
        stage: deal.stage,
        sameListing: sibling.id === match.listingId,
      };
    }
  }
  return null;
}

export function describeSiblingDeal(sibling: {
  transactionType: string;
  stage: string;
  sameListing: boolean;
}) {
  const stage = getDealStageLabel(sibling.stage);
  return sibling.sameListing
    ? `이 매물은 이미 다른 거래가 진행 중입니다 (${stage}). 이 매칭으로는 거래를 만들 수 없습니다.`
    : `같은 집의 ${getStatusMeta('transactionType', sibling.transactionType).label} 조건이 거래 중입니다 (${stage}). 이 매물로는 거래를 만들 수 없습니다.`;
}

// ── 거래 전환 후 거래관리 파이프라인 미러 ────────────────────────────────────
// 매칭 레인은 연결 Deal의 단계를 읽기 전용으로 이어서 보여주고,
// 실제 단계 변경은 거래관리(/deals)가 소유한다.

const dealProgressBaseStages: string[] = [
  DealStage.PREPARING,
  DealStage.CONTRACTED,
  DealStage.SETTLING,
  DealStage.COMPLETED,
  DealStage.CLOSED,
];

/** 가계약(preContract)은 선택 단계 — 거래가 그 단계에 머무를 때만 트랙에 표시한다 */
export function getDealProgressStages(dealStage: string): string[] {
  if (normalizeDealStage(dealStage) === DealStage.PRE_CONTRACT) {
    return [
      DealStage.PREPARING,
      DealStage.PRE_CONTRACT,
      DealStage.CONTRACTED,
      DealStage.SETTLING,
      DealStage.COMPLETED,
      DealStage.CLOSED,
    ];
  }
  return dealProgressBaseStages;
}

export function getDealProgressNodeState(
  dealStage: string,
  nodeStage: string,
): MatchProgressNodeState {
  const stages = getDealProgressStages(dealStage);
  const currentIndex = stages.indexOf(normalizeDealStage(dealStage));
  const nodeIndex = stages.indexOf(nodeStage);
  if (currentIndex < 0 || nodeIndex < 0) {
    return 'pending';
  }
  if (nodeIndex < currentIndex) {
    return 'completed';
  }
  if (nodeIndex === currentIndex) {
    return 'current';
  }
  return 'pending';
}

export function getDealStageLabel(stage: string): string {
  return getStatusMeta('dealStage', normalizeDealStage(stage)).label;
}

/** 동일 listingId + buyerReqId 조합 중복 여부 */
export function isDuplicateMatch(
  matches: MatchViewListItem[],
  listingId: string | undefined,
  buyerReqId: string | undefined,
) {
  if (!listingId || !buyerReqId) {
    return false;
  }
  return matches.some(
    (match) => match.listingId === listingId && match.buyerReqId === buyerReqId,
  );
}

// ── 표기 헬퍼 ────────────────────────────────────────────────────────────────

export function getMatchTitle(match: MatchViewListItem) {
  return getListingTitle(match.listing);
}

export function getListingTitle(listing: MatchViewListItem['listing'] | null | undefined) {
  // "고덕그라시움 102동 2203호" — 앱 공용 표기(formatPlaceLabel). 동 구분 없는 건물은 동을 빼고, 호 없는 공간은 층으로 쓴다
  const unit = listing?.property?.unit;
  return (
    formatPlaceLabel({
      siteName: listing?.property?.site?.name,
      dongName: unit?.dong?.name,
      dongIsPlaceholder: unit?.dong?.isPlaceholder,
      unit,
    }) || '매물 정보 없음'
  );
}

export function getListingAddress(listing: MatchViewListItem['listing'] | null | undefined) {
  return listing?.property?.site?.roadAddress ?? listing?.property?.site?.jibunAddress ?? '주소 정보 없음';
}

export function getPrimaryOwnerContact(listing: MatchViewListItem['listing'] | null | undefined) {
  const propertyContact = listing?.property?.propertyContacts?.find((entry) =>
    ['owner', 'co_owner', 'representative'].includes(entry.role),
  );
  return propertyContact?.contact ?? null;
}

export function getPrimaryOwnerText(listing: MatchViewListItem['listing'] | null | undefined) {
  const owner = getPrimaryOwnerContact(listing);

  if (!owner) {
    return '소유자 정보 없음';
  }

  return [owner.name, owner.phone ? formatPhone(owner.phone) : null].filter(Boolean).join(' · ');
}

export function formatListingPrice(listing: MatchViewListItem['listing'] | null | undefined) {
  if (!listing?.transactionType) {
    return '—';
  }

  if (listing.transactionType === 'monthly') {
    const deposit = listing.deposit ? formatMoney(listing.deposit) : '—';
    const monthlyRent = listing.monthlyRent ? formatMoney(listing.monthlyRent) : '—';
    return `${deposit} / ${monthlyRent}`;
  }

  const amount = listing.price ?? listing.deposit;
  return amount ? formatMoney(amount) : '—';
}

export function formatMatchPrice(match: MatchViewListItem) {
  return formatListingPrice(match.listing);
}

export function formatBudgetRange(
  min: number | null | undefined,
  max: number | null | undefined,
) {
  if (min && max) {
    return min === max
      ? formatMoney(min)
      : `${formatMoney(min)} ~ ${formatMoney(max)}`;
  }
  if (min) return `${formatMoney(min)} 이상`;
  if (max) return `${formatMoney(max)} 이하`;
  return '협의';
}

export function formatRequirementSummary(match: MatchViewListItem) {
  const requirement = match.buyerRequirement;
  if (!requirement?.transactionType) {
    return '조건 미정';
  }

  if (requirement.transactionType === 'monthly') {
    const deposit = formatBudgetRange(
      requirement.depositMin,
      requirement.depositMax,
    );
    // 월세도 범위로 적는다. 칸에서 최소 월세를 고칠 수 있으므로 최대만 보이면 저장한 값이 보이지 않는다
    const monthlyRent = formatBudgetRange(
      requirement.monthlyRentMin,
      requirement.monthlyRentMax,
    );
    return `월세 · 보증금 ${deposit} / 월세 ${monthlyRent}`;
  }

  if (requirement.transactionType === 'jeonse') {
    const price = formatBudgetRange(requirement.priceMin, requirement.priceMax);
    return `전세 · ${price}`;
  }

  const price = formatBudgetRange(requirement.priceMin, requirement.priceMax);
  return `매매 · ${price}`;
}

export function formatRequirementSummaryFromBuyerRequirement(
  requirement: NonNullable<MatchViewListItem['buyerRequirement']>,
) {
  // 지역과 단지를 함께 쓴다 (표의 '희망 지역·단지' 칸과 같다). 단지만 고른 손님이 "지역 협의"로 보이지 않게.
  const { placeText, siteTypeText, budgetText } =
    getBuyerRequirementSummaryParts(requirement);

  return `${placeText} · ${siteTypeText} · ${budgetText}`;
}

export function getBuyerRequirementSummaryParts(
  requirement: NonNullable<MatchViewListItem['buyerRequirement']>,
) {
  const regionLabels = (requirement.preferredRegions ?? [])
    .map((region) => region.ward?.name ?? region.district?.name ?? region.province?.name ?? '')
    .filter(Boolean);
  const regionText = regionLabels.length > 0 ? regionLabels.join(', ') : '지역 협의';
  const siteNames = (requirement.preferredSites ?? [])
    .map((preferred) => preferred.site?.name ?? '')
    .filter(Boolean);
  // 고객 원장과 같이 지역과 단지를 한 줄에서 읽는다
  const placeText =
    [regionLabels.join(', '), siteNames.join(', ')]
      .filter(Boolean)
      .join(' · ') || '지역 협의';
  const siteTypes = requirement.siteTypes ?? [];
  const siteTypeText = siteTypes.length > 0
    ? siteTypes.map((type) => siteTypeLabel[type] ?? type).join(', ')
    : '유형 협의';

  return {
    regionText,
    placeText,
    siteTypeText,
    areaText: formatAreaRange(requirement.areaMin, requirement.areaMax),
    budgetText: formatBudgetSummary(requirement),
  };
}

export function getMatchSearchText(match: MatchViewListItem): string {
  return [
    getMatchTitle(match),
    match.listing?.property?.site?.roadAddress,
    match.listing?.property?.site?.jibunAddress,
    match.buyerRequirement?.contact?.name,
    match.buyerRequirement?.contact?.phone,
    match.memo,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getRequirementSearchText(
  requirement: NonNullable<MatchViewListItem['buyerRequirement']>,
): string {
  return [
    requirement.contact?.name,
    requirement.contact?.phone,
    // 번호는 숫자만 저장된다. 화면에 보이는 "010-7600-6601"로 찾아도 걸리게 함께 넣는다
    requirement.contact?.phone ? formatPhone(requirement.contact.phone) : null,
    getBuyerRequirementSummaryParts(requirement).placeText,
    requirement.memo,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export interface BuyerRequirementGroup {
  buyerReqId: string;
  buyerRequirement: NonNullable<MatchViewListItem['buyerRequirement']>;
  /** 줄에 보이는 매칭 (단계 필터 · 검색을 거친 것) */
  matches: MatchViewListItem[];
  /** 이 손님의 매칭 전부. 옆 패널과 "진행 중 N건"은 필터와 상관없이 이것을 쓴다. */
  allMatches: MatchViewListItem[];
}

/**
 * 서버가 준 줄 `{ 손님 조건, 그 손님의 매칭들 }`을 화면의 묶음으로 바꾼다.
 * 어느 손님이 목록에 나오는지(필터 · 검색 · 정렬)는 서버가 정했다. 여기서는 줄 안에서 어느 매칭을 보일지만 정한다:
 * - 단계: 고른 단계의 매칭만 보인다.
 * - 검색: 조건(고객·연락처·지역·단지·메모)에 걸리면 그 조건의 매칭을 모두 보이고,
 *   매물에만 걸리면 걸린 매칭만 보인다.
 * 매칭에는 그 줄의 손님을 붙여 준다 — 매칭 줄 · 상세 창이 손님 이름과 조건을 매칭에서 읽는다.
 */
export function buildRequirementGroups({
  rows,
  search,
  stageFilters,
}: {
  rows: BuyerRequirementWithMatches[];
  search: string;
  stageFilters: string[];
}): BuyerRequirementGroup[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const stages = stageFilters.filter((stage) => stage !== NO_MATCH_STAGE);

  return rows.map((row) => {
    const { matches: rowMatches, ...buyerRequirement } = row;
    const allMatches: MatchViewListItem[] = rowMatches.map((match) => ({
      ...match,
      buyerRequirement,
    }));
    // 단계 가운데 '매칭 없음'만 골랐으면 서버가 매칭 없는 손님만 주므로 거를 것이 없다
    const stageMatches =
      stages.length === 0
        ? allMatches
        : allMatches.filter((match) => stages.includes(normalizeMatchStage(match.stage)));

    // 서버와 같은 판정: 낱말마다 손님 쪽(이름 · 번호 · 지역 · 단지 · 메모)이나, 고른 단계의 매물에 있어야 한다.
    // 손님 쪽에 없는 낱말이 있으면 그 낱말이 걸린 매칭만 보인다.
    let matches = stageMatches;
    if (words.length > 0) {
      const requirementText = getRequirementSearchText(buyerRequirement);
      const missing = words.filter((word) => !requirementText.includes(word));
      if (missing.length > 0) {
        const hits = stageMatches.filter((match) => {
          const text = getMatchSearchText(match);
          // "101동" · "3501호"로 쳐도 "101" · "3501"로 적힌 동 · 호에 걸린다 (서버와 같다).
          // 끝 글자를 뗀 말은 동 · 호 이름에만 견준다 — 전체 글에 견주면 101이 든 전화번호에 걸려
          // 같은 손님의 102동 매칭까지 보인다.
          const unit = match.listing?.property?.unit;
          const placeNames = [unit?.dong?.name, unit?.name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return missing.some((word) => {
            if (text.includes(word)) return true;
            const bare = word.replace(/[동호]$/, '');
            return bare !== word && bare.length > 0 && placeNames.includes(bare);
          });
        });
        // 줄을 고른 것은 서버다. 화면에 없는 칸으로 걸린 줄이면(걸린 매칭을 못 찾으면) 매칭을 감추지 않는다.
        // 이때도 보이는 것은 고른 단계의 매칭뿐이다.
        if (hits.length > 0) matches = hits;
      }
    }
    return { buyerReqId: row.id, buyerRequirement, matches, allMatches };
  });
}

export const siteTypeLabel: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '주택',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

export function formatBudgetSummary(requirement: NonNullable<MatchViewListItem['buyerRequirement']>) {
  if (requirement.transactionType === 'monthly') {
    const deposit = formatBudgetRange(
      requirement.depositMin,
      requirement.depositMax,
    );
    const monthlyRent = formatBudgetRange(
      requirement.monthlyRentMin,
      requirement.monthlyRentMax,
    );
    return `월세 보증금 ${deposit} / 월 ${monthlyRent}`;
  }

  if (requirement.transactionType === 'jeonse') {
    return `전세 ${formatBudgetRange(requirement.priceMin, requirement.priceMax)}`;
  }

  if (requirement.transactionType === 'sale') {
    return `매매 ${formatBudgetRange(requirement.priceMin, requirement.priceMax)}`;
  }

  return '예산 협의';
}

// ── 기타 ────────────────────────────────────────────────────────────────────

export function getElapsedDays(value: string, now: Date = new Date()) {
  const created = new Date(value).getTime();
  if (Number.isNaN(created)) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - created) / 86_400_000));
}

export function formatElapsedDays(value: string) {
  const days = getElapsedDays(value);
  return days === 0 ? '오늘 등록' : `경과 ${days}일`;
}

export function getInitials(name: string) {
  return name.slice(0, 2);
}
