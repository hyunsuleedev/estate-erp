import type {
  CalendarEvent,
  CreateCalendarEventDto,
  Match,
  UpdateCalendarEventDto,
} from '@estate-erp/api-client';
import {
  DealStage,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  MatchStage,
  normalizeDealStage,
  normalizeMatchStage,
} from '@estate-erp/shared';
import { getStatusMeta, type Tone } from '@/lib/status-config';
import { formatDateTime, formatMoney, formatPhone } from '@/lib/format';
import { getIntakeConfirmationState } from '@/lib/listing-status';

export type MatchViewListItem = Match;

/** 뷰 컴포넌트 공통 액션 묶음 — dealCreated 전환은 페이지가 거래 생성 다이얼로그로 라우팅한다 */
export interface MatchRowActions {
  isUpdating: boolean;
  isScheduling: boolean;
  onStageChange: (id: string, stage: string) => void;
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

// ── 그룹 뷰 데이터 ───────────────────────────────────────────────────────────

export type MatchStageGroupDefinition = {
  stage: string;
  label: string;
  dotClassName: string;
  isResult: boolean;
};

export type MatchListingGroup = {
  listingId: string;
  listing: MatchViewListItem['listing'] | null;
  matches: MatchViewListItem[];
  summary: {
    total: number;
    active: number;
    converted: number;
    closed: number;
  };
};

export type MatchStageRow = {
  rowNumber: number;
  match: MatchViewListItem;
};

export type MatchStageGroup = {
  stage: string;
  label: string;
  dotClassName: string;
  isResult: boolean;
  rows: MatchStageRow[];
};

export const matchStageGroups: MatchStageGroupDefinition[] = matchStageOrder.map((stage) => ({
  stage,
  label: getMatchStageLabel(stage),
  dotClassName: getMatchStageDotClass(stage),
  isResult: stage === MatchStage.DEAL_CREATED || stage === MatchStage.CLOSED,
}));

export function getMatchListingGroups(matches: MatchViewListItem[]): MatchListingGroup[] {
  const grouped = new Map<string, MatchListingGroup>();

  for (const match of matches) {
    const listingId = match.listingId || 'unassigned-listing';
    const existing = grouped.get(listingId);

    if (existing) {
      existing.matches.push(match);
      continue;
    }

    grouped.set(listingId, {
      listingId,
      listing: match.listing ?? null,
      matches: [match],
      summary: {
        total: 0,
        active: 0,
        converted: 0,
        closed: 0,
      },
    });
  }

  return Array.from(grouped.values())
    .map((group) => {
      const matchesForListing = sortMatchesByUpdatedAt(group.matches);

      return {
        ...group,
        matches: matchesForListing,
        summary: summarizeListingMatches(matchesForListing),
      };
    })
    .sort((left, right) => {
      const leftTime = getLatestUpdatedAt(left.matches);
      const rightTime = getLatestUpdatedAt(right.matches);
      return rightTime - leftTime;
    });
}

export function getMatchStageGroups(
  matches: MatchViewListItem[],
  includeEmpty = false,
): MatchStageGroup[] {
  return matchStageGroups
    .map((group) => {
      const stageMatches = sortMatchesByUpdatedAt(
        matches.filter(
          (match) => normalizeMatchStage(match.stage) === group.stage,
        ),
      );

      return {
        ...group,
        rows: stageMatches.map((match, index) => ({
          rowNumber: index + 1,
          match,
        })),
      };
    })
    .filter((group) => includeEmpty || group.rows.length > 0);
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
  const buyerName = match.buyerRequirement?.contact?.name ?? '구매고객';
  const listingName = match.listing?.property?.site?.name ?? '매물';
  const contactId = match.buyerRequirement?.contactId;

  return {
    title: `${buyerName} ${listingName} 방문`,
    description: '매칭 단계에서 등록한 방문 일정',
    type: 'viewing',
    start: start.toISOString(),
    end: end.toISOString(),
    color: '#3b82f6',
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

export function formatViewingEventTime(event: CalendarEvent) {
  return formatDateTime(event.start);
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

export function shouldMoveToViewingOnSchedule(stage: string) {
  return normalizeMatchStage(stage) === MatchStage.VIEWING_CONFIRMED;
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
  const viewingConfirmedIndex = matchStageOrder.indexOf(
    MatchStage.VIEWING_CONFIRMED,
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

  if (
    normalizedTarget === MatchStage.VIEWING &&
    currentIndex >= 0 &&
    currentIndex < viewingConfirmedIndex
  ) {
    return '집주인·점유자의 임장 가능 확인을 먼저 완료해 주세요.';
  }

  if (
    normalizedTarget !== MatchStage.CLOSED &&
    currentIndex >= 0 &&
    targetIndex > currentIndex + 1
  ) {
    const nextStage = matchStageOrder[currentIndex + 1];
    return `${getMatchStageLabel(nextStage)} 단계를 먼저 완료해 주세요.`;
  }

  return null;
}

export function getProgressNodeState(
  currentStage: string,
  stage: MatchProgressStage,
): 'completed' | 'current' | 'pending' {
  const normalizedCurrentStage = normalizeMatchStage(currentStage);

  if (normalizedCurrentStage === MatchStage.CLOSED) {
    return 'pending';
  }

  if (normalizedCurrentStage === MatchStage.DEAL_CREATED) {
    return 'completed';
  }

  const currentIndex = buyerProgressStages.indexOf(
    normalizedCurrentStage as MatchProgressStage,
  );
  const nodeIndex = buyerProgressStages.indexOf(stage);

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
): 'completed' | 'current' | 'pending' {
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
  return [listing?.property?.site?.name, getUnitDisplayName(listing?.property?.unit)]
    .filter(Boolean)
    .join(' ') || '매물 정보 없음';
}

function getUnitDisplayName(
  unit: NonNullable<NonNullable<MatchViewListItem['listing']>['property']>['unit'] | null | undefined,
) {
  if (!unit) {
    return null;
  }

  const dongName = unit.dong && !unit.dong.isPlaceholder ? unit.dong.name : null;
  return [dongName, unit.name].filter(Boolean).join(' ');
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

export function formatRequirementSummary(match: MatchViewListItem) {
  const requirement = match.buyerRequirement;
  if (!requirement?.transactionType) {
    return '조건 미정';
  }

  if (requirement.transactionType === 'monthly') {
    const deposit = requirement.depositMax ? formatMoney(requirement.depositMax) : '협의';
    const monthlyRent = requirement.monthlyRentMax ? formatMoney(requirement.monthlyRentMax) : '협의';
    return `월세 · 보증금 ${deposit} / 월세 ${monthlyRent}`;
  }

  if (requirement.transactionType === 'jeonse') {
    const price = requirement.depositMax ? formatMoney(requirement.depositMax) : '협의';
    return `전세 · ${price}`;
  }

  const price = requirement.priceMax ? formatMoney(requirement.priceMax) : '협의';
  return `매매 · ${price}`;
}

export function formatRequirementSummaryFromBuyerRequirement(
  requirement: NonNullable<MatchViewListItem['buyerRequirement']>,
) {
  const regionLabels = (requirement.preferredRegions ?? [])
    .map((region) => region.ward?.name ?? region.district?.name ?? region.province?.name ?? '')
    .filter(Boolean);
  const regionText = regionLabels.length > 0 ? regionLabels.join(', ') : '지역 협의';
  const siteTypes = requirement.siteTypes ?? [];
  const siteTypeText = siteTypes.length > 0
    ? siteTypes.map((type) => siteTypeLabel[type] ?? type).join(', ')
    : '유형 협의';

  return `${regionText} · ${siteTypeText} · ${formatBudgetSummary(requirement)}`;
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
    const deposit = requirement.depositMax ? formatMoney(requirement.depositMax) : '협의';
    const monthlyRent = requirement.monthlyRentMax ? formatMoney(requirement.monthlyRentMax) : '협의';
    return `월세 ${deposit} / ${monthlyRent}`;
  }

  if (requirement.transactionType === 'jeonse') {
    return `전세 ${requirement.depositMax ? formatMoney(requirement.depositMax) : '협의'}`;
  }

  if (requirement.transactionType === 'sale') {
    return `매매 ${requirement.priceMax ? formatMoney(requirement.priceMax) : '협의'}`;
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

function summarizeListingMatches(matches: MatchViewListItem[]) {
  return matches.reduce(
    (summary, match) => {
      summary.total += 1;
      const stage = normalizeMatchStage(match.stage);

      if (stage === MatchStage.DEAL_CREATED) {
        summary.converted += 1;
      } else if (stage === MatchStage.CLOSED) {
        summary.closed += 1;
      } else {
        summary.active += 1;
      }

      return summary;
    },
    { total: 0, active: 0, converted: 0, closed: 0 },
  );
}

function sortMatchesByUpdatedAt(matches: MatchViewListItem[]) {
  return [...matches].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function getLatestUpdatedAt(matches: MatchViewListItem[]) {
  return matches.reduce(
    (latest, match) => Math.max(latest, new Date(match.updatedAt).getTime()),
    0,
  );
}
