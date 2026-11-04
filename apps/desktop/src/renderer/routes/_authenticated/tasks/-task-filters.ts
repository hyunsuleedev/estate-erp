/**
 * tasks 페이지 필터·정렬·집계 순수 로직 (React 의존 없음 → 단위 테스트 대상).
 */
import type { Task, TaskContact, UpdateTaskDto } from '@estate-erp/api-client';
import { getPropertyLabel } from './-task-property-label';
import { TASK_SCOPES, type TaskGroupBy, type TaskScope, type TaskSortBy } from './-task-display';

export type DueDateFilter = '' | 'overdue' | 'today' | 'week' | 'none';
export type DueFacet = Exclude<DueDateFilter, ''>;

export const ASSIGNEE_UNASSIGNED = 'unassigned';

export interface TaskFilterState {
  /** '' = 취소 제외 전체, 'cancelled' = 취소 업무만 (아카이브) */
  status: string;
  due: DueDateFilter;
  category: string;
  /** '' = 전체, ASSIGNEE_UNASSIGNED = 미배정, 그 외 userId */
  assignee: string;
  /** 위쪽 탭: 내 담당(나에게 배정) · 내가 요청(내가 만들어 남에게 맡긴 업무) · 팀 전체 */
  scope: TaskScope;
  /** scope 판단 기준 사용자. 없으면 scope를 적용하지 않는다 */
  currentUserId: string | null;
  /** 상태 필터가 없을 때 완료 업무를 숨긴다 (표시 메뉴의 "완료 업무 보기" 끔) */
  hideCompleted: boolean;
  /** 비어 있으면 전체 */
  priorities: string[];
  search: string;
}

/** 패싯 집계 시 자기 자신 조건은 빼고 센다 (예: 마감 패싯 카운트는 마감 필터 무시) */
export type FilterFacet = 'due' | 'category' | 'status' | 'priority' | 'scope';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isTaskActive(task: Pick<Task, 'status'>): boolean {
  return task.status !== 'completed' && task.status !== 'cancelled';
}

export function isTaskOverdue(task: Pick<Task, 'status' | 'dueDate'>, now = new Date()): boolean {
  if (!task.dueDate || !isTaskActive(task)) return false;
  return new Date(task.dueDate) < startOfDay(now);
}

export function matchesDueFilter(
  task: Pick<Task, 'status' | 'dueDate'>,
  filter: DueDateFilter,
  now = new Date(),
): boolean {
  if (!filter) return true;
  if (filter === 'none') return !task.dueDate;
  if (!task.dueDate) return false;
  if (filter === 'overdue') return isTaskOverdue(task, now);

  const today = startOfDay(now);
  const dueDay = startOfDay(new Date(task.dueDate));
  if (filter === 'today') return dueDay.getTime() === today.getTime();
  // week = 오늘부터 7일 뒤(포함)까지
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  return dueDay >= today && dueDay <= end;
}

function matchesSearch(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    task.title,
    task.content,
    task.contact?.name,
    task.contact?.phone,
    task.property?.site?.name,
    task.property?.unit?.name,
    task.property?.unit?.dong?.name,
    task.property ? getPropertyLabel(task) : null,
    task.assignedTo?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function matchesScope(
  task: Pick<Task, 'assignedToId' | 'createdById'>,
  scope: TaskScope,
  userId: string,
): boolean {
  if (scope === 'mine') return task.assignedToId === userId;
  if (scope === 'requested') return task.createdById === userId && task.assignedToId !== userId;
  return true;
}

export function matchesTaskFilters(
  task: Task,
  filters: TaskFilterState,
  options: { skip?: FilterFacet; now?: Date } = {},
): boolean {
  const { skip, now = new Date() } = options;

  // 취소 업무는 기본 숨김 — 상태 필터로 '취소'를 고른 경우에만 조회
  if (skip !== 'status') {
    if (filters.status === 'cancelled') {
      if (task.status !== 'cancelled') return false;
    } else {
      if (task.status === 'cancelled') return false;
      if (filters.status && task.status !== filters.status) return false;
      if (!filters.status && filters.hideCompleted && task.status === 'completed') return false;
    }
  }

  if (skip !== 'scope' && filters.currentUserId && !matchesScope(task, filters.scope, filters.currentUserId)) {
    return false;
  }

  if (skip !== 'category' && filters.category && task.category !== filters.category) return false;
  if (skip !== 'priority' && filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) {
    return false;
  }
  if (skip !== 'due' && !matchesDueFilter(task, filters.due, now)) return false;

  if (filters.assignee === ASSIGNEE_UNASSIGNED) {
    if (task.assignedToId) return false;
  } else if (filters.assignee && task.assignedToId !== filters.assignee) {
    return false;
  }

  return matchesSearch(task, filters.search);
}

/**
 * 방금 상태를 바꾼 업무의 "바꾸기 전" 상태.
 * 필터·그룹핑·정렬은 이 값으로 판단해 행을 제자리에 둔다 — 완료 체크 직후 행이 빠지거나 이동하면
 * 다음 행이 커서 밑으로 올라와 연속 클릭 시 다른 업무를 잘못 완료하게 되기 때문.
 * 표시(완료 체크·취소선·상태 텍스트)는 새 상태를 그대로 쓴다.
 */
export interface HeldTaskState {
  status: string;
}

export function heldStatusOf(task: Task, held?: ReadonlyMap<string, HeldTaskState>): string {
  return held?.get(task.id)?.status ?? task.status;
}

/** 필터 적용 + sortOrder 정렬. held 업무는 바꾸기 전 상태로 필터를 판단한다. */
export function filterTasks(
  tasks: Task[],
  filters: TaskFilterState,
  held?: ReadonlyMap<string, HeldTaskState>,
  now = new Date(),
): Task[] {
  return tasks
    .filter((task) => {
      const heldState = held?.get(task.id);
      const subject = heldState ? { ...task, status: heldState.status } : task;
      return matchesTaskFilters(subject, filters, { now });
    })
    .sort(compareTaskOrder);
}

/**
 * 업무 표시 순서 — sortOrder, 같으면 최신 생성 먼저, 그다음 id.
 * 동순위를 서버 응답 순서에 맡기면 서버가 상태순으로 정렬하므로, 상태만 바꿔도 다시 불러온 뒤 행이 튄다.
 */
export function compareTaskOrder(a: Task, b: Task): number {
  return (
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
    a.id.localeCompare(b.id)
  );
}

/**
 * 목록/작업별 뷰 정렬 — 처리할 업무가 위, 완료·취소는 아래. 같은 블록 안에서는 sortOrder.
 * held 업무는 바꾸기 전 상태의 블록에 남는다.
 */
export function sortActiveFirst(tasks: Task[], held?: ReadonlyMap<string, HeldTaskState>): Task[] {
  const rank = (task: Task) => (isTaskActive({ status: heldStatusOf(task, held) }) ? 0 : 1);
  return [...tasks].sort((a, b) => rank(a) - rank(b) || compareTaskOrder(a, b));
}

const DUE_FACETS: DueFacet[] = ['overdue', 'today', 'week', 'none'];

/** 마감 패싯별 개수 — 마감 필터를 제외한 나머지 필터를 적용한 결과 기준 */
export function countByDueFacet(
  tasks: Task[],
  filters: TaskFilterState,
  now = new Date(),
): Record<DueFacet | 'all', number> {
  const base = tasks.filter((task) => matchesTaskFilters(task, filters, { skip: 'due', now }));
  const counts = { all: base.length, overdue: 0, today: 0, week: 0, none: 0 };
  for (const task of base) {
    for (const facet of DUE_FACETS) {
      if (matchesDueFilter(task, facet, now)) counts[facet] += 1;
    }
  }
  return counts;
}

/** 카테고리별 개수 — 카테고리 필터를 제외한 나머지 필터를 적용한 결과 기준 */
export function countByCategory(
  tasks: Task[],
  filters: TaskFilterState,
  now = new Date(),
): { all: number; byCategory: Map<string, number> } {
  const byCategory = new Map<string, number>();
  let all = 0;
  for (const task of tasks) {
    if (!matchesTaskFilters(task, filters, { skip: 'category', now })) continue;
    all += 1;
    byCategory.set(task.category, (byCategory.get(task.category) ?? 0) + 1);
  }
  return { all, byCategory };
}

/** 상태 탭 개수 — 상태 필터를 제외한 나머지 필터 기준. all은 취소를 뺀 개수(상태 '전체' 탭과 같은 의미) */
export function countByStatus(
  tasks: Task[],
  filters: TaskFilterState,
  now = new Date(),
): Record<'all' | 'pending' | 'in_progress' | 'completed' | 'cancelled', number> {
  const counts = { all: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const task of tasks) {
    if (!matchesTaskFilters(task, filters, { skip: 'status', now })) continue;
    if (task.status in counts) counts[task.status as keyof typeof counts] += 1;
    if (task.status !== 'cancelled') counts.all += 1;
  }
  return counts;
}

/** 우선순위별 개수 — 우선순위 필터를 제외한 나머지 필터 기준 */
export function countByPriority(
  tasks: Task[],
  filters: TaskFilterState,
  now = new Date(),
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!matchesTaskFilters(task, filters, { skip: 'priority', now })) continue;
    counts.set(task.priority, (counts.get(task.priority) ?? 0) + 1);
  }
  return counts;
}

/** 위쪽 탭 건수 — 처리할(완료·취소가 아닌) 업무 중 나머지 필터에 맞는 개수 */
export function countByScope(
  tasks: Task[],
  filters: TaskFilterState,
  now = new Date(),
): Record<TaskScope, number> {
  const counts: Record<TaskScope, number> = { mine: 0, requested: 0, team: 0 };
  const base = { ...filters, status: '' };
  for (const task of tasks) {
    if (!isTaskActive(task)) continue;
    for (const scope of TASK_SCOPES) {
      if (matchesTaskFilters(task, { ...base, scope }, { now })) counts[scope] += 1;
    }
  }
  return counts;
}

/** 행 앞 체크 순환 — 대기 → 진행중(반체크) → 완료 → 대기 */
export function nextCheckStatus(status: string): 'pending' | 'in_progress' | 'completed' {
  if (status === 'pending') return 'in_progress';
  if (status === 'in_progress') return 'completed';
  return 'pending';
}

// ─── 마감일 표기 · 묶기 · 정렬 ───────────────────────────────

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dayDiff(dueDate: string, now: Date): number {
  return Math.round((startOfDay(new Date(dueDate)).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** 올해면 "11.6 (금)", 다른 해면 "2027.01.05" */
export function formatDueDay(dueDate: string, now = new Date()): string {
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return '-';
  if (date.getFullYear() !== now.getFullYear()) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}.${mm}.${dd}`;
  }
  return `${date.getMonth() + 1}.${date.getDate()} (${WEEKDAYS[date.getDay()]})`;
}

export type DueTone = 'overdue' | 'today' | 'normal' | 'muted';

/**
 * 마감일 한 줄 표기 — "3일 지남" · "어제" · "오늘" · "내일" · "11.6 (금)".
 * 끝난 업무(완료·취소)는 지났다는 말 대신 날짜만 흐리게 둔다.
 */
export function describeDue(
  task: Pick<Task, 'status' | 'dueDate'>,
  now = new Date(),
): { text: string; tone: DueTone } | null {
  if (!task.dueDate) return null;
  if (!isTaskActive(task)) return { text: formatDueDay(task.dueDate, now), tone: 'muted' };
  const diff = dayDiff(task.dueDate, now);
  if (diff < 0) return { text: diff === -1 ? '어제' : `${-diff}일 지남`, tone: 'overdue' };
  if (diff === 0) return { text: '오늘', tone: 'today' };
  if (diff === 1) return { text: '내일', tone: 'normal' };
  return { text: formatDueDay(task.dueDate, now), tone: 'normal' };
}

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';
export const DUE_BUCKETS: DueBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none'];

/** 마감일별 묶음 — 7일 이내(모레~7일 뒤)는 마감 필터의 "7일 이내"와 같은 범위 */
export function dueBucketOf(task: Pick<Task, 'dueDate'>, now = new Date()): DueBucket {
  if (!task.dueDate) return 'none';
  const diff = dayDiff(task.dueDate, now);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'later';
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const priorityRank = (task: Task) => PRIORITY_RANK[task.priority] ?? 2;
const dueKey = (task: Task) => (task.dueDate ? new Date(task.dueDate).getTime() : Number.POSITIVE_INFINITY);

/**
 * 묶음 안 정렬 — 처리할 업무가 위, 끝난 업무는 아래(held는 바꾸기 전 상태로 판단해 제자리).
 * 직접 정렬은 sortOrder, 우선순위·마감일 정렬은 같은 값이면 서로를 보조 기준으로 쓴다.
 */
export function sortTasksBy(
  tasks: Task[],
  sortBy: TaskSortBy,
  held?: ReadonlyMap<string, HeldTaskState>,
): Task[] {
  const doneRank = (task: Task) => (isTaskActive({ status: heldStatusOf(task, held) }) ? 0 : 1);
  return [...tasks].sort((a, b) => {
    const byDone = doneRank(a) - doneRank(b);
    if (byDone) return byDone;
    if (sortBy === 'priority') {
      return priorityRank(a) - priorityRank(b) || dueKey(a) - dueKey(b) || compareTaskOrder(a, b);
    }
    if (sortBy === 'due') {
      return dueKey(a) - dueKey(b) || priorityRank(a) - priorityRank(b) || compareTaskOrder(a, b);
    }
    return compareTaskOrder(a, b);
  });
}

export const LIST_STATUS_ORDER = ['in_progress', 'pending', 'completed'] as const;
export type ListStatus = (typeof LIST_STATUS_ORDER)[number];

/**
 * 상태별 목록에 그릴 묶음.
 * - 상태 필터가 있으면 그 상태 묶음만 (다른 묶음은 늘 비어 있으므로)
 * - 없으면 진행중·대기 + "완료 업무 보기"가 켜져 있을 때 완료
 * 완료를 숨긴 채 상태 필터로 완료를 고른 경우에도 완료 묶음이 빠지지 않게 필터를 먼저 본다.
 */
export function listStatusColumns(statusFilter: string, showCompleted: boolean): ListStatus[] {
  if (statusFilter) return LIST_STATUS_ORDER.filter((status) => status === statusFilter);
  return LIST_STATUS_ORDER.filter((status) => showCompleted || status !== 'completed');
}
export const ASSIGNEE_GROUP_UNASSIGNED = ASSIGNEE_UNASSIGNED;

export interface TaskGroup {
  key: string;
  tasks: Task[];
}

/**
 * 묶기 — 빈 묶음은 돌려주지 않는다. held 업무는 바꾸기 전 상태의 묶음에 남는다.
 * - status: 진행중 → 대기 → 완료 → 취소
 * - due: 기한 지남 → 오늘 → 내일 → 7일 이내 → 나중 → 마감 없음 → 완료 → 취소 (끝난 업무는 날짜와 상관없이 아래)
 * - category: categoryOrder 순서
 * - assignee: 나 → 다른 직원(이름순) → 미배정
 */
export function groupTasks(
  tasks: Task[],
  groupBy: TaskGroupBy,
  options: {
    sortBy: TaskSortBy;
    held?: ReadonlyMap<string, HeldTaskState>;
    now?: Date;
    currentUserId?: string | null;
    categoryOrder?: readonly string[];
  },
): TaskGroup[] {
  const { sortBy, held, now = new Date(), currentUserId = null, categoryOrder = [] } = options;
  const buckets = new Map<string, Task[]>();
  const put = (key: string, task: Task) => {
    const list = buckets.get(key);
    if (list) list.push(task);
    else buckets.set(key, [task]);
  };

  let order: string[];
  if (groupBy === 'status') {
    for (const task of tasks) put(heldStatusOf(task, held), task);
    order = [...LIST_STATUS_ORDER, 'cancelled'];
  } else if (groupBy === 'due') {
    for (const task of tasks) {
      const status = heldStatusOf(task, held);
      put(isTaskActive({ status }) ? dueBucketOf(task, now) : status, task);
    }
    order = [...DUE_BUCKETS, 'completed', 'cancelled'];
  } else if (groupBy === 'category') {
    for (const task of tasks) put(categoryOrder.includes(task.category) ? task.category : 'other', task);
    order = [...categoryOrder];
  } else if (groupBy === 'assignee') {
    const names = new Map<string, string>();
    for (const task of tasks) {
      const key = task.assignedToId ?? ASSIGNEE_GROUP_UNASSIGNED;
      if (task.assignedToId) names.set(task.assignedToId, task.assignedTo?.name ?? '');
      put(key, task);
    }
    const others = [...names.keys()]
      .filter((id) => id !== currentUserId)
      .sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'ko'));
    order = [...(currentUserId && names.has(currentUserId) ? [currentUserId] : []), ...others, ASSIGNEE_GROUP_UNASSIGNED];
  } else {
    order = ['all'];
    if (tasks.length) buckets.set('all', tasks);
  }

  return order.flatMap((key) => {
    const list = buckets.get(key);
    return list && list.length ? [{ key, tasks: sortTasksBy(list, sortBy, held) }] : [];
  });
}

// ─── 낙관적 반영 ─────────────────────────────────────────────

/**
 * 수정 DTO를 캐시의 Task에 그대로 덮어쓴 모습 — 서버 응답을 기다리지 않고 화면·후속 편집이 최신 값을 쓰게 한다.
 * (수정 창 저장값이 캐시에 없으면, 이어지는 편집이 저장 전 값으로 폼을 채워 서버 값을 되돌릴 수 있다)
 */
export function applyTaskUpdate(
  task: Task,
  dto: UpdateTaskDto,
  ctx: { employees: ReadonlyArray<{ id: string; name: string }>; contact?: TaskContact | null } = { employees: [] },
): Task {
  const next: Task = { ...task };
  if (dto.title !== undefined) next.title = dto.title;
  if (dto.content !== undefined) next.content = dto.content;
  if (dto.status !== undefined) next.status = dto.status;
  if (dto.priority !== undefined) next.priority = dto.priority;
  if (dto.category !== undefined) next.category = dto.category;
  if (dto.dueDate !== undefined) {
    next.dueDate = dto.dueDate ? `${dto.dueDate.substring(0, 10)}T00:00:00.000Z` : null;
  }
  if (dto.assignedToId !== undefined) {
    const assignee = ctx.employees.find((e) => e.id === dto.assignedToId);
    next.assignedToId = dto.assignedToId;
    next.assignedTo = assignee ? { id: assignee.id, name: assignee.name } : null;
  }
  if (dto.contactId !== undefined) {
    next.contactId = dto.contactId;
    if (!dto.contactId) next.contact = null;
    else if (ctx.contact?.id === dto.contactId) next.contact = ctx.contact;
    else if (task.contact?.id !== dto.contactId) next.contact = null;
  }
  // 연결 해제(null)만 반영 — 새 연결은 수정 창에서 연락처만 가능
  if (dto.propertyId === null) {
    next.propertyId = null;
    next.property = null;
  }
  if (dto.listingId === null) {
    next.listingId = null;
    next.listing = null;
  }
  if (dto.listingIntakeId === null) {
    next.listingIntakeId = null;
    next.listingIntake = null;
  }
  if (dto.consultationId === null) {
    next.consultationId = null;
    next.consultation = null;
  }
  if (dto.buyerReqId === null) {
    next.buyerReqId = null;
    next.buyerRequirement = null;
  }
  if (dto.matchId === null) {
    next.matchId = null;
    next.match = null;
  }
  if (dto.dealId === null) {
    next.dealId = null;
    next.deal = null;
  }
  if (dto.contractId === null) {
    next.contractId = null;
    next.contract = null;
  }
  return next;
}
