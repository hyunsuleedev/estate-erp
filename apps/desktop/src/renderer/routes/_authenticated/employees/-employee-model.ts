import type {
  BuyerRequirement,
  Deal,
  Employee,
  EmployeeDetail,
  EmployeeDealParticipant,
  Task,
} from '@estate-erp/api-client';
import { formatPlaceLabel, formatPrice } from '@estate-erp/shared';

export type StatusFilter = 'active' | 'inactive' | 'all';
export type QuickFilter = 'all' | 'busy' | 'unsettled' | 'attention';
export type EmployeeSort = 'workload' | 'commission' | 'recent' | 'name';
export type LeaderboardMetric = 'commission' | 'consultations' | 'workload';
export type BentoTab = 'overview' | 'deals' | 'timeline' | 'account';
export type TimelineFilter = 'all' | 'consultation' | 'activity';
export type AvatarTone =
  | 'indigo'
  | 'blue'
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'teal'
  | 'rose'
  | 'slate';

export const QUIET_DAYS_THRESHOLD = 7;
export const DEFAULT_AGENT_RATE = 50;

const AGENT_AVATAR_TONES: AvatarTone[] = [
  'emerald',
  'violet',
  'amber',
  'teal',
  'rose',
  'blue',
];

const MODEL_ROLE_LABELS: Record<string, string> = {
  owner: '대표',
  manager: '매니저',
  agent: '중개사',
};

const MODEL_ACTIVITY_ENTITY_LABELS: Record<string, string> = {
  property: '매물',
  listingIntake: '매물 의뢰',
  listing: '거래 조건',
  publicListing: '공개 매물',
  contact: '연락처',
  propertyContact: '매물 연락처',
  tenant: '세입자',
  buyerIntake: '구매 의뢰',
  buyerIntakeContact: '구매 의뢰 연락처',
  project: '프로젝트',
  projectStep: '프로젝트 순서',
  buyerRequirement: '희망 조건',
  match: '매칭',
  deal: '거래',
  consultation: '상담',
  task: '업무',
  networkSharedProperty: '공유 매물',
  contract: '계약',
  contractDocument: '계약 문서',
  contractClauseTemplate: '특약 서식',
  officePrintTemplate: '인쇄 서식',
  advertisementChangeRequest: '광고 변경 요청',
  commissionReceipt: '수수료 입금',
  settlement: '직원 정산',
  settlementLine: '정산 내역',
  brokerageCase: '프로젝트',
  brokerageCaseStep: '프로젝트 순서',
};

const MODEL_ACTIVITY_ACTION_LABELS: Record<string, string> = {
  create: '등록',
  update: '수정',
  delete: '삭제',
};

const MODEL_ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  web: '앱',
  mcp: 'AI 연결',
  system: '시스템',
};

const MODEL_CONSULTATION_TYPE_LABELS: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

function startOfDayMs(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/** 오늘 기준 며칠 남았는지 계산한다. 지났으면 음수. */
export function daysUntilDate(value: string | Date, now: Date = new Date()): number {
  const target = typeof value === 'string' ? new Date(value) : value;
  return Math.round((startOfDayMs(target) - startOfDayMs(now)) / 86_400_000);
}

/** "3일 지남" · "오늘" · "내일" · "D-5" */
export function dueLabelForDays(days: number): string {
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  return `D-${days}`;
}

/** 타임라인 날짜 머리: "오늘" · "어제" · "11월 12일" (다른 해는 연도 포함) */
export function dayHeadingForDate(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = daysUntilDate(date, now);
  if (diff === 0) return '오늘';
  if (diff === -1) return '어제';
  const base = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === now.getFullYear() ? base : `${date.getFullYear()}년 ${base}`;
}

export function clockTimeForDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 구성원 상태와 역할에 맞는 일관된 아바타 톤을 돌려준다. */
export function avatarToneFor(employee: Pick<Employee, 'id' | 'role' | 'isActive'>): AvatarTone {
  if (!employee.isActive) return 'slate';
  if (employee.role === 'owner') return 'indigo';
  if (employee.role === 'manager') return 'blue';
  let hash = 0;
  for (let i = 0; i < employee.id.length; i += 1) {
    hash = (hash * 31 + employee.id.charCodeAt(i)) >>> 0;
  }
  return AGENT_AVATAR_TONES[hash % AGENT_AVATAR_TONES.length];
}

/** 진행 중 업무 + 담당 고객 + 진행 거래 합. */
export function workloadOfEmployee(employee: Pick<Employee, 'counts'>): number {
  const { counts } = employee;
  return (
    counts.activeTaskCount +
    counts.activeBuyerRequirementCount +
    counts.activeDealCount
  );
}

/** 기한 지난 업무 + 기한 지난 고객 연락 수. */
export function lateCountOf(employee: Pick<Employee, 'counts'>): number {
  return (employee.counts.overdueTaskCount ?? 0) + (employee.counts.overdueBuyerCount ?? 0);
}

/** 마지막 활동 뒤로 지난 일수. 기록이 없으면 null. */
export function quietDaysOf(
  employee: Pick<Employee, 'latestActivityAt'>,
  now: Date = new Date(),
): number | null {
  if (!employee.latestActivityAt) return null;
  return -daysUntilDate(employee.latestActivityAt, now);
}

/** 활성 구성원인데 일정 기간 이상 활동이 없거나 기록이 없는지 판단한다. */
export function isEmployeeQuiet(
  employee: Pick<Employee, 'isActive' | 'latestActivityAt'>,
  now: Date = new Date(),
): boolean {
  if (!employee.isActive) return false;
  const quiet = quietDaysOf(employee, now);
  return quiet === null || quiet >= QUIET_DAYS_THRESHOLD;
}

/** 보상 조건 한 줄 요약. 볼 권한이 없거나 대표 계정이면 null. */
export function paySummaryText(
  employee: Pick<Employee, 'payVisible' | 'role' | 'payType' | 'baseSalary' | 'commissionRate'>,
  defaultAgentRate: number = DEFAULT_AGENT_RATE,
): string | null {
  if (!employee.payVisible || employee.role === 'owner') return null;
  const rate = employee.commissionRate ?? defaultAgentRate;
  if (employee.payType === 'fixed') {
    return employee.baseSalary != null ? `고정급 ${employee.baseSalary}만` : '고정급';
  }
  if (employee.payType === 'mixed') {
    return `기본 ${employee.baseSalary ?? 0}만 + ${rate}%`;
  }
  if (employee.payType === 'commission_only') {
    return `수수료제 ${rate}%`;
  }
  return null;
}

export interface SplitRatioResult {
  isFixed: boolean;
  agentPct: number;
  officePct: number;
  usingDefault: boolean;
}

/** 직원 몫 % vs 사무소 몫 % 분할 막대 계산. */
export function computeSplitRatio(
  payType: string,
  commissionRateInput: string | number | null | undefined,
  defaultAgentRate: number = DEFAULT_AGENT_RATE,
): SplitRatioResult {
  if (payType === 'fixed') {
    return { isFixed: true, agentPct: 0, officePct: 100, usingDefault: false };
  }
  const text =
    commissionRateInput === null || commissionRateInput === undefined
      ? ''
      : String(commissionRateInput).trim();
  const usingDefault = text === '';
  const parsed = usingDefault ? defaultAgentRate : Number(text);
  const clamped = Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, Math.round(parsed * 10) / 10))
    : defaultAgentRate;
  return {
    isFixed: false,
    agentPct: clamped,
    officePct: Math.max(0, Math.round((100 - clamped) * 10) / 10),
    usingDefault,
  };
}

export interface TeamKpis {
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
  tasks: number;
  customers: number;
  deals: number;
  workload: number;
  unsettledPeople: number;
  unsettledDeals: number;
  unsettledCommissionTotal: number;
  attentionPeople: number;
}

/** 상단 4개 KPI 카드 집계 (재직 구성원 기준). */
export function buildTeamKpis(employees: Employee[], now: Date = new Date()): TeamKpis {
  const active = employees.filter((employee) => employee.isActive);
  let tasks = 0;
  let customers = 0;
  let deals = 0;
  let unsettledPeople = 0;
  let unsettledDeals = 0;
  let unsettledCommissionTotal = 0;
  let attentionPeople = 0;

  for (const employee of active) {
    tasks += employee.counts.activeTaskCount;
    customers += employee.counts.activeBuyerRequirementCount;
    deals += employee.counts.activeDealCount;
    if (employee.counts.unsettledDealCount > 0) {
      unsettledPeople += 1;
      unsettledDeals += employee.counts.unsettledDealCount;
      unsettledCommissionTotal += employee.counts.unsettledCommissionTotal ?? 0;
    }
    if (lateCountOf(employee) > 0 || isEmployeeQuiet(employee, now)) {
      attentionPeople += 1;
    }
  }

  return {
    activeCount: active.length,
    inactiveCount: employees.length - active.length,
    totalCount: employees.length,
    tasks,
    customers,
    deals,
    workload: tasks + customers + deals,
    unsettledPeople,
    unsettledDeals,
    unsettledCommissionTotal,
    attentionPeople,
  };
}

export interface TeamAttentionQueueItem {
  key: string;
  employeeId: string;
  employeeName: string;
  kind: 'task' | 'buyer' | 'quiet';
  late: boolean;
  rank: number;
  badge: string;
  title: string;
  sub: string;
  targetTab: 'overview' | 'timeline';
  entityId?: string;
}

/** 팀 전체의 기한 지연/오늘 마감 업무, 고객 연락, 7일+ 무활동 구성원 큐 생성. */
export function buildTeamAttentionQueue(
  employees: Employee[],
  now: Date = new Date(),
  roleLabels: Record<string, string> = MODEL_ROLE_LABELS,
): TeamAttentionQueueItem[] {
  const queue: TeamAttentionQueueItem[] = [];

  for (const employee of employees) {
    if (!employee.isActive) continue;

    for (const item of employee.attentionItems ?? []) {
      const days = daysUntilDate(item.dueDate, now);
      if (days > 0) continue;
      const late = days < 0;
      const badge = late
        ? `${Math.abs(days)}일 지연`
        : item.kind === 'task'
          ? '오늘 마감'
          : '오늘 연락';
      queue.push({
        key: `${item.kind}-${employee.id}-${item.id}`,
        employeeId: employee.id,
        employeeName: employee.name,
        kind: item.kind,
        late,
        rank: days,
        badge,
        title: item.kind === 'task' ? item.title : `${item.title} 고객 연락 예정`,
        sub: `${employee.name} · ${item.kind === 'task' ? '담당 업무' : '희망매물'}`,
        targetTab: 'overview',
        entityId: item.id,
      });
    }

    if (isEmployeeQuiet(employee, now)) {
      const quiet = quietDaysOf(employee, now);
      queue.push({
        key: `quiet-${employee.id}`,
        employeeId: employee.id,
        employeeName: employee.name,
        kind: 'quiet',
        late: false,
        rank: 1,
        badge: quiet === null ? '활동 없음' : `${quiet}일 무활동`,
        title: `${employee.name}님 최근 활동 기록 확인 필요`,
        sub: `${roleLabels[employee.role] ?? employee.role} · 타임라인 점검`,
        targetTab: 'timeline',
      });
    }
  }

  return queue.sort((a, b) => a.rank - b.rank || a.employeeName.localeCompare(b.employeeName, 'ko'));
}

export interface EmployeeFilterOptions {
  statusFilter: StatusFilter;
  roleFilter: string;
  quickFilter: QuickFilter;
  search: string;
  sort: EmployeeSort;
}

function matchesSearchText(employee: Employee, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [employee.name, employee.loginId, employee.email, employee.phone]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

/** 상태 · 역할 · 빠른 KPI 필터 · 검색 · 정렬을 적용한 구성원 목록 반환. */
export function filterAndSortEmployees(
  employees: Employee[],
  options: EmployeeFilterOptions,
  now: Date = new Date(),
): Employee[] {
  const { statusFilter, roleFilter, quickFilter, search, sort } = options;
  const filtered = employees.filter((employee) => {
    if (statusFilter === 'active' && !employee.isActive) return false;
    if (statusFilter === 'inactive' && employee.isActive) return false;
    if (roleFilter && employee.role !== roleFilter) return false;
    if (quickFilter === 'busy' && workloadOfEmployee(employee) === 0) return false;
    if (quickFilter === 'unsettled' && employee.counts.unsettledDealCount === 0) return false;
    if (
      quickFilter === 'attention' &&
      !(employee.isActive && (lateCountOf(employee) > 0 || isEmployeeQuiet(employee, now)))
    ) {
      return false;
    }
    return matchesSearchText(employee, search);
  });

  return filtered.sort((a, b) => {
    if (sort === 'workload') {
      return (
        workloadOfEmployee(b) - workloadOfEmployee(a) ||
        a.name.localeCompare(b.name, 'ko')
      );
    }
    if (sort === 'commission') {
      return (
        (b.counts.commissionAmountTotal ?? 0) - (a.counts.commissionAmountTotal ?? 0) ||
        workloadOfEmployee(b) - workloadOfEmployee(a) ||
        a.name.localeCompare(b.name, 'ko')
      );
    }
    if (sort === 'recent') {
      return (
        new Date(b.latestActivityAt ?? 0).getTime() -
          new Date(a.latestActivityAt ?? 0).getTime() ||
        a.name.localeCompare(b.name, 'ko')
      );
    }
    return a.name.localeCompare(b.name, 'ko');
  });
}

export interface EmployeeAttentionDetailItem {
  key: string;
  kind: 'task' | 'buyer' | 'unsettled';
  tone: 'late' | 'soon';
  label: string;
  text: string;
  when: string;
  amountManwon?: number;
  taskId?: string;
  requirementId?: string;
  settlementRoute?: '/cashflow/employee-settlements' | '/cashflow/my-settlement';
}

/** 개인 상세의 "지금 챙길 것": 기한 지연/오늘·내일 업무, 연락 예정 고객, 미정산 거래. */
export function buildEmployeeAttention(
  detail: EmployeeDetail,
  actorRole: string = 'owner',
  now: Date = new Date(),
): EmployeeAttentionDetailItem[] {
  const items: EmployeeAttentionDetailItem[] = [];

  for (const task of detail.assignedTasks) {
    if (!task.dueDate || ['completed', 'cancelled'].includes(task.status)) continue;
    const days = daysUntilDate(task.dueDate, now);
    if (days > 1) continue;
    items.push({
      key: `task-${task.id}`,
      kind: 'task',
      tone: days < 0 ? 'late' : 'soon',
      label: '업무',
      text: task.title,
      when: dueLabelForDays(days),
      taskId: task.id,
    });
  }

  for (const requirement of detail.assignedBuyerRequirements) {
    if (!requirement.nextContactDate || requirement.status !== 'active') continue;
    const days = daysUntilDate(requirement.nextContactDate, now);
    if (days > 0) continue;
    items.push({
      key: `buyer-${requirement.id}`,
      kind: 'buyer',
      tone: days < 0 ? 'late' : 'soon',
      label: '고객 연락',
      text: requirement.contact?.name ?? '고객',
      when: dueLabelForDays(days),
      requirementId: requirement.id,
    });
  }

  const unsettled = detail.dealParticipants.filter(
    (participant) => participant.settlementStatus !== 'settled',
  );
  if (unsettled.length > 0) {
    const total = unsettled.reduce(
      (sum, participant) => sum + (participant.commissionAmount ?? 0),
      0,
    );
    items.push({
      key: 'unsettled',
      kind: 'unsettled',
      tone: 'soon',
      label: '정산',
      text: `미정산 거래 ${unsettled.length}건`,
      when: total > 0 ? formatPrice(total) : '',
      amountManwon: total > 0 ? total : undefined,
      settlementRoute:
        actorRole === 'owner'
          ? '/cashflow/employee-settlements'
          : '/cashflow/my-settlement',
    });
  }

  return items.sort((a, b) => Number(b.tone === 'late') - Number(a.tone === 'late'));
}

export interface TimelineEntry {
  key: string;
  at: string;
  kind: 'consultation' | 'activity';
  consultationId?: string;
  title: string;
  body?: string;
  meta?: string;
}

export interface TimelineDayGroup {
  day: string;
  entries: TimelineEntry[];
}

export interface TimelineLabelOverrides {
  consultationTypeLabels?: Record<string, string>;
  describeActivity?: (activity: { entityType: string; action: string }) => string;
  describeActivitySource?: (source: string) => string;
}

/** 상담과 활동 기록을 시간 역순으로 합쳐 일별 그룹으로 묶는다. */
export function buildEmployeeTimeline(
  detail: Pick<EmployeeDetail, 'recentConsultations' | 'recentActivities'>,
  now: Date = new Date(),
  overrides: TimelineLabelOverrides = {},
): TimelineDayGroup[] {
  const consultationTypeLabels =
    overrides.consultationTypeLabels ?? MODEL_CONSULTATION_TYPE_LABELS;
  const describeAct =
    overrides.describeActivity ??
    ((activity: { entityType: string; action: string }) => {
      const entity = MODEL_ACTIVITY_ENTITY_LABELS[activity.entityType] ?? activity.entityType;
      const action = MODEL_ACTIVITY_ACTION_LABELS[activity.action] ?? activity.action;
      return `${entity} ${action}`;
    });
  const describeSrc =
    overrides.describeActivitySource ??
    ((source: string) => MODEL_ACTIVITY_SOURCE_LABELS[source] ?? source);

  const entries: TimelineEntry[] = [
    ...detail.recentConsultations.map<TimelineEntry>((consultation) => ({
      key: `c-${consultation.id}`,
      at: consultation.createdAt,
      kind: 'consultation',
      consultationId: consultation.id,
      title: `${consultation.contact?.name ?? '고객'} ${
        consultationTypeLabels[consultation.type] ?? consultation.type
      } 상담`,
      body: consultation.content.replace(/\s+/g, ' ').trim(),
    })),
    ...detail.recentActivities.map<TimelineEntry>((activity) => ({
      key: `a-${activity.id}`,
      at: activity.createdAt,
      kind: 'activity',
      title: describeAct(activity),
      body: activity.reason ?? undefined,
      // 앱에서 직접 한 일은 출처 배지를 달지 않는다.
      meta: activity.source === 'web' ? undefined : describeSrc(activity.source),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const days: TimelineDayGroup[] = [];
  for (const entry of entries) {
    const day = dayHeadingForDate(entry.at, now);
    const last = days.at(-1);
    if (last && last.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
}

/** 거래 참여 목록에서 주소 한 줄을 공용 포맷터로 만든다. */
export function formatDealPlace(participant: EmployeeDealParticipant): string {
  const property = participant.deal.listing?.property ?? participant.deal.property;
  if (!property) return '거래';
  const unitWithDong = property.unit as
    | {
        name?: string | null;
        floor?: number | null;
        floorEnd?: number | null;
        floorLabel?: string | null;
        dong?: { name?: string | null; isPlaceholder?: boolean | null } | null;
      }
    | null
    | undefined;
  const formatted = formatPlaceLabel({
    siteName: property.site?.name,
    dongName: unitWithDong?.dong?.name ?? null,
    dongIsPlaceholder: unitWithDong?.dong?.isPlaceholder ?? null,
    unit: unitWithDong ?? null,
  });
  return formatted || property.site?.name || '거래';
}

const TX_TYPE_LABELS: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

const DEAL_PAYMENT_KIND_LABELS: Record<string, string> = {
  pre_contract: '가계약금',
  contract: '계약금',
  interim: '중도금',
  balance: '잔금',
  refund: '반환',
};

function formatPriceRangeText(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  const hasMin = min != null && min > 0;
  const hasMax = max != null && max > 0;
  if (hasMin && hasMax) {
    return min === max ? formatPrice(min) : `${formatPrice(min)} ~ ${formatPrice(max)}`;
  }
  if (hasMin) return `${formatPrice(min)} 이상`;
  if (hasMax) return `${formatPrice(max)} 이하`;
  return null;
}

/** 원 단위 정산 금액 표기 ("1,672,000원", "-120,000원", "0원", null → "—"). */
export function formatWonAmount(won: number | null | undefined): string {
  if (won == null || !Number.isFinite(won)) return '—';
  if (won === 0) return '0원';
  return `${won < 0 ? '-' : ''}${Math.abs(Math.round(won)).toLocaleString('ko-KR')}원`;
}

/** 희망 조건 거래유형 + 예산 범위 한 줄 요약. */
export function formatBuyerBudgetSummary(requirement: BuyerRequirement): string {
  const txLabel = requirement.transactionType
    ? (TX_TYPE_LABELS[requirement.transactionType] ?? requirement.transactionType)
    : '';

  if (requirement.transactionType === 'monthly') {
    const depText = formatPriceRangeText(requirement.depositMin, requirement.depositMax);
    const rentText = formatPriceRangeText(
      requirement.monthlyRentMin,
      requirement.monthlyRentMax,
    );
    if (depText && rentText) return `월세 ${depText} / ${rentText}`;
    if (depText) return `월세 보증금 ${depText}`;
    if (rentText) return `월세 ${rentText}`;
    return '월세 · 조건 미입력';
  }

  const budgetText = formatPriceRangeText(
    requirement.priceMin ?? requirement.depositMin,
    requirement.priceMax ?? requirement.depositMax,
  );
  if (txLabel && budgetText) return `${txLabel} ${budgetText}`;
  if (budgetText) return budgetText;
  if (txLabel) return `${txLabel} · 조건 미입력`;
  return '조건 미입력';
}

/** 희망 단지 또는 희망 지역 1줄 요약. */
export function formatBuyerLocationSummary(requirement: BuyerRequirement): string | null {
  const siteNames = (requirement.preferredSites ?? [])
    .map((item) => item.site?.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (siteNames.length > 0) {
    return siteNames.length === 1
      ? siteNames[0]
      : `${siteNames[0]} 외 ${siteNames.length - 1}`;
  }

  const regionNames = (requirement.preferredRegions ?? [])
    .map((region) => {
      const districtWard = [region.district?.name, region.ward?.name]
        .filter(Boolean)
        .join(' ');
      return districtWard || region.province?.name || '';
    })
    .filter(Boolean);
  if (regionNames.length > 0) {
    return regionNames.length === 1
      ? regionNames[0]
      : `${regionNames[0]} 외 ${regionNames.length - 1}`;
  }

  return null;
}

/** 거래유형 + 합의 금액/차임 요약 ("매매 19억 8,000만", "월세 1억 / 250만"). */
export function formatDealValueSummary(deal: Deal): string {
  const txLabel = deal.transactionType
    ? (TX_TYPE_LABELS[deal.transactionType] ?? deal.transactionType)
    : '';

  if (deal.transactionType === 'monthly') {
    const hasDep = deal.agreedDeposit != null && deal.agreedDeposit > 0;
    const hasRent = deal.agreedMonthlyRent != null && deal.agreedMonthlyRent > 0;
    if (hasDep && hasRent) {
      return `월세 ${formatPrice(deal.agreedDeposit!)} / ${formatPrice(deal.agreedMonthlyRent!)}`;
    }
    if (hasDep) return `월세 보증금 ${formatPrice(deal.agreedDeposit!)}`;
    if (hasRent) return `월세 ${formatPrice(deal.agreedMonthlyRent!)}`;
    return txLabel ? `${txLabel} · 금액 미정` : '금액 미정';
  }

  if (deal.agreedPrice != null && deal.agreedPrice > 0) {
    return txLabel ? `${txLabel} ${formatPrice(deal.agreedPrice)}` : formatPrice(deal.agreedPrice);
  }
  return txLabel ? `${txLabel} · 금액 미정` : '금액 미정';
}

/** 거래의 가장 가까운 미납/예정 대금 또는 잔금/입주 예정일. */
export function formatDealNextSchedule(
  deal: Deal & { contract?: { statedBalanceDate?: string | null } | null },
): { label: string; date: string } | null {
  const pendingPayments = (deal.payments ?? [])
    .filter(
      (payment) =>
        payment.scheduledDate != null &&
        ['overdue', 'pending', 'partial'].includes(payment.status),
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime(),
    );

  const nextPayment = pendingPayments[0];
  if (nextPayment?.scheduledDate) {
    const baseLabel =
      DEAL_PAYMENT_KIND_LABELS[nextPayment.kind] ?? nextPayment.kind;
    const label =
      nextPayment.kind === 'interim' && nextPayment.sequence > 1
        ? `${nextPayment.sequence}차 ${baseLabel}`
        : baseLabel;
    return { label, date: nextPayment.scheduledDate };
  }

  if (deal.contract?.statedBalanceDate) {
    return { label: '잔금 예정', date: deal.contract.statedBalanceDate };
  }
  if (deal.agreedMoveInDate) {
    return { label: '입주 예정', date: deal.agreedMoveInDate };
  }
  return null;
}

/** 업무 줄 아래에 붙는 고객·호실 문맥 요약 ("김민수 · 고덕그라시움 102동 2203호"). */
export function formatTaskContextLabel(task: Task): string | null {
  const contactName =
    task.contact?.name?.trim() ||
    (task.buyerRequirement?.contact?.name
      ? `희망 ${task.buyerRequirement.contact.name}`
      : null);

  let placeName = '';
  if (task.property) {
    const unitWithDong = task.property.unit as
      | {
          name?: string | null;
          floor?: number | null;
          floorEnd?: number | null;
          floorLabel?: string | null;
          dong?: { name?: string | null; isPlaceholder?: boolean | null } | null;
        }
      | null
      | undefined;
    placeName =
      formatPlaceLabel({
        siteName: task.property.site?.name,
        dongName: unitWithDong?.dong?.name ?? null,
        dongIsPlaceholder: unitWithDong?.dong?.isPlaceholder ?? null,
        unit: unitWithDong ?? null,
      }) ||
      task.property.site?.name ||
      '';
  }

  const parts = [contactName, placeName || null].filter((v): v is string => Boolean(v));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export interface DealPipelineSummary {
  total: number;
  active: number;
  closed: number;
  settled: number;
  unsettled: number;
  totalCommission: number;
  unsettledCommission: number;
}

/** 거래 참여 목록을 거래·정산 탭 요약 숫자로 집계한다. */
export function summarizeDealPipeline(
  participants: EmployeeDealParticipant[],
): DealPipelineSummary {
  let active = 0;
  let closed = 0;
  let settled = 0;
  let unsettled = 0;
  let totalCommission = 0;
  let unsettledCommission = 0;

  for (const participant of participants) {
    if (participant.deal.stage !== 'closed') active += 1;
    if (['completed', 'closed'].includes(participant.deal.stage)) closed += 1;
    const amount = participant.commissionAmount ?? 0;
    totalCommission += amount;
    if (participant.settlementStatus === 'settled') {
      settled += 1;
    } else {
      unsettled += 1;
      unsettledCommission += amount;
    }
  }

  return {
    total: participants.length,
    active,
    closed,
    settled,
    unsettled,
    totalCommission,
    unsettledCommission,
  };
}
