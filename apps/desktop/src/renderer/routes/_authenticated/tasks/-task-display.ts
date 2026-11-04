/**
 * 업무 목록 표시 설정 — 보기(목록/보드) · 묶기 · 정렬 · 완료 보기 · 보이는 정보.
 * 사용자별 편의 설정이라 이 PC(localStorage)에만 저장한다. React 의존 없음 → 단위 테스트 대상.
 */

export type TaskLayout = 'list' | 'board';
export type TaskGroupBy = 'status' | 'due' | 'category' | 'assignee' | 'none';
export type TaskSortBy = 'manual' | 'priority' | 'due';
/** 위쪽 탭 — 누구의 업무인지 */
export type TaskScope = 'mine' | 'requested' | 'team';

export interface TaskVisibleProps {
  /** 고객·매물 등 연결 칩 */
  context: boolean;
  category: boolean;
  assignee: boolean;
  due: boolean;
}

export interface TaskDisplay {
  layout: TaskLayout;
  groupBy: TaskGroupBy;
  sortBy: TaskSortBy;
  showCompleted: boolean;
  visible: TaskVisibleProps;
}

export const DEFAULT_TASK_DISPLAY: TaskDisplay = {
  layout: 'list',
  groupBy: 'status',
  sortBy: 'manual',
  showCompleted: true,
  visible: { context: true, category: true, assignee: true, due: true },
};

const LAYOUTS: TaskLayout[] = ['list', 'board'];
const GROUP_BYS: TaskGroupBy[] = ['status', 'due', 'category', 'assignee', 'none'];
const SORT_BYS: TaskSortBy[] = ['manual', 'priority', 'due'];
export const TASK_SCOPES: TaskScope[] = ['mine', 'requested', 'team'];

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * 저장값 → 표시 설정. 깨졌거나 없으면 기본값.
 * 예전 저장값(viewMode: 작업별·상태별·보드·전체)은 같은 모습이 되도록 옮긴다.
 */
export function parseTaskDisplay(raw: string | null, legacyViewMode: string | null = null): TaskDisplay {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<TaskDisplay> | null;
      if (parsed && typeof parsed === 'object') {
        const visible = (parsed.visible ?? {}) as Partial<TaskVisibleProps>;
        const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
        const base = DEFAULT_TASK_DISPLAY;
        return {
          layout: pick(parsed.layout, LAYOUTS, base.layout),
          groupBy: pick(parsed.groupBy, GROUP_BYS, base.groupBy),
          sortBy: pick(parsed.sortBy, SORT_BYS, base.sortBy),
          showCompleted: flag(parsed.showCompleted, base.showCompleted),
          visible: {
            context: flag(visible.context, base.visible.context),
            category: flag(visible.category, base.visible.category),
            assignee: flag(visible.assignee, base.visible.assignee),
            due: flag(visible.due, base.visible.due),
          },
        };
      }
    } catch {
      // 깨진 저장값 — 아래 기본값
    }
  }
  if (legacyViewMode === 'board') return { ...DEFAULT_TASK_DISPLAY, layout: 'board' };
  if (legacyViewMode === 'category') return { ...DEFAULT_TASK_DISPLAY, groupBy: 'category' };
  if (legacyViewMode === 'list') return { ...DEFAULT_TASK_DISPLAY, groupBy: 'none' };
  return DEFAULT_TASK_DISPLAY;
}

export function parseTaskScope(raw: string | null): TaskScope {
  return pick(raw, TASK_SCOPES, 'mine');
}

/** 내 담당 탭에서는 담당자가 한 명뿐이라 담당자별 묶기는 상태별로 보여 준다 */
export function effectiveGroupBy(groupBy: TaskGroupBy, scope: TaskScope): TaskGroupBy {
  return groupBy === 'assignee' && scope === 'mine' ? 'status' : groupBy;
}
