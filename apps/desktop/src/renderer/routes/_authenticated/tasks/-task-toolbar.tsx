/**
 * 업무 페이지 상단 툴바 — 매물관리 툴바와 같은 부품(알약 탭·필터 칩)을 쓴다.
 *
 * - 1행: 누구의 업무(내 담당·내가 요청·팀 전체) · 검색 · (오른쪽) 기한 지남 · 필터 · 표시 · 목록/보드 · 업무 추가
 * - 2행(필터를 열었거나 걸려 있을 때만): 상태 · 마감 · 카테고리 · 우선순위 · 담당자 · 건수 · 초기화
 * 묶기·정렬·완료 보기·보이는 정보는 "표시" 메뉴에서 고른다.
 */
import { type ReactNode } from 'react';
import {
  AlarmClock,
  ArrowUpDown,
  Check,
  Columns3,
  Eye,
  List,
  ListFilter,
  Plus,
  Rows3,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserX,
  X,
} from 'lucide-react';
import type { Employee } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  ChecklistFilterPanel,
  ToolbarFilterChip,
  ToolbarPillTabs,
  ToolbarPillToggle,
  summarizeSelection,
  toolbarGhostButtonClassName,
} from '@/routes/_authenticated/properties/-components/property-toolbar';
import { categoryConfig, priorityConfig, statusIcons, type TaskCategory } from './-task-shared';
import { ASSIGNEE_UNASSIGNED, type DueDateFilter, type DueFacet } from './-task-filters';
import type {
  TaskDisplay,
  TaskGroupBy,
  TaskLayout,
  TaskScope,
  TaskSortBy,
  TaskVisibleProps,
} from './-task-display';

/** 매물관리 툴바와 같은 따뜻한 베이지 바탕 */
const toolbarSurfaceClassName = 'bg-[#f1f0ec]';

export const DUE_FILTER_OPTIONS: { value: DueFacet; label: string }[] = [
  { value: 'overdue', label: '기한 지남' },
  { value: 'today', label: '오늘 마감' },
  { value: 'week', label: '7일 이내' },
  { value: 'none', label: '마감일 없음' },
];

const LAYOUT_OPTIONS: { value: TaskLayout; label: string; icon: ReactNode }[] = [
  { value: 'list', label: '목록', icon: <List /> },
  { value: 'board', label: '보드', icon: <Columns3 /> },
];

const SCOPE_LABELS: Record<TaskScope, string> = {
  mine: '내 담당',
  requested: '내가 요청',
  team: '팀 전체',
};

const GROUP_OPTIONS: { value: TaskGroupBy; label: string }[] = [
  { value: 'status', label: '상태' },
  { value: 'due', label: '마감일' },
  { value: 'category', label: '카테고리' },
  { value: 'assignee', label: '담당자' },
  { value: 'none', label: '묶지 않음' },
];

const SORT_OPTIONS: { value: TaskSortBy; label: string }[] = [
  { value: 'manual', label: '직접 정렬' },
  { value: 'priority', label: '우선순위' },
  { value: 'due', label: '마감일' },
];

const VISIBLE_OPTIONS: { value: keyof TaskVisibleProps; label: string }[] = [
  { value: 'context', label: '고객·매물' },
  { value: 'category', label: '카테고리' },
  { value: 'assignee', label: '담당자' },
  { value: 'due', label: '마감일' },
];

const STATUS_FILTER_OPTIONS = ['in_progress', 'pending', 'completed', 'cancelled'] as const;
const STATUS_FILTER_LABELS: Record<(typeof STATUS_FILTER_OPTIONS)[number], string> = {
  in_progress: '진행중',
  pending: '대기',
  completed: '완료',
  cancelled: '취소',
};

type StatusCounts = Record<'all' | 'pending' | 'in_progress' | 'completed' | 'cancelled', number>;

/** 1행 오른쪽 동그란 아이콘 버튼 */
const iconButtonClassName = cn(
  'relative inline-flex size-[30px] shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#e9e8e3] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 data-[state=open]:bg-[#e9e8e3] data-[state=open]:text-foreground [&_svg]:size-3.5',
  toolbarSurfaceClassName,
);

export interface TaskToolbarProps {
  scope: TaskScope;
  scopeCounts: Record<TaskScope, number>;
  onScopeChange: (scope: TaskScope) => void;

  search: string;
  onSearchChange: (value: string) => void;
  searchWrapRef: React.Ref<HTMLLabelElement>;

  overdueCount: number;
  overdueActive: boolean;
  onToggleOverdue: () => void;

  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  /** 2행 필터 중 걸려 있는 개수 (검색 제외) */
  activeFilterCount: number;

  display: TaskDisplay;
  onDisplayChange: (patch: Partial<TaskDisplay>) => void;
  onCreate: () => void;

  status: string;
  statusCounts: StatusCounts;
  onStatusChange: (value: string) => void;

  due: DueDateFilter;
  dueCounts: Record<DueFacet | 'all', number>;
  onDueChange: (value: DueDateFilter) => void;

  category: string;
  categoryCounts: { all: number; byCategory: Map<string, number> };
  onCategoryChange: (value: string) => void;

  priorities: string[];
  priorityCounts: Map<string, number>;
  onPrioritiesChange: (values: string[]) => void;

  assignee: string;
  employees: Employee[];
  onAssigneeChange: (value: string) => void;

  resultCount: number | null;
  hasActiveFilters: boolean;
  onReset: () => void;
}

export function TaskToolbar(props: TaskToolbarProps) {
  const scopeTabs = (Object.keys(SCOPE_LABELS) as TaskScope[]).map((value) => ({
    value,
    label: SCOPE_LABELS[value],
    count: props.scopeCounts[value],
  }));
  const showFilterRow = props.filtersOpen || props.activeFilterCount > 0;

  return (
    <>
      {/* 1행 */}
      <section className="shrink-0 border-b border-border bg-background px-3 py-2.5">
        <h1 className="sr-only">업무</h1>
        <div className="@container flex min-w-0 items-center gap-2">
          <ToolbarPillTabs
            ariaLabel="누구의 업무"
            value={props.scope}
            options={scopeTabs}
            onChange={props.onScopeChange}
          />

          <label
            ref={props.searchWrapRef}
            className={cn(
              'flex h-[30px] min-w-[160px] max-w-[320px] flex-1 cursor-text items-center gap-2 rounded-full pr-1.5 pl-3 transition-colors hover:bg-[#ebeae6] focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_rgba(55,53,47,0.3)]',
              toolbarSurfaceClassName,
            )}
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  if (props.search) props.onSearchChange('');
                  else event.currentTarget.blur();
                }
              }}
              placeholder="업무, 고객, 매물 검색"
              aria-label="업무 검색 ( / )"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {props.search ? (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => props.onSearchChange('')}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a5a39f] hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : (
              <kbd className="mr-1 hidden rounded border border-[#dfdedb] bg-white px-1.5 text-[11px] leading-[18px] text-[#a5a39f] @3xl:inline">
                /
              </kbd>
            )}
          </label>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {(props.overdueCount > 0 || props.overdueActive) && (
              <button
                type="button"
                aria-pressed={props.overdueActive}
                onClick={props.onToggleOverdue}
                title={props.overdueActive ? '기한 지남 보기 해제' : '기한 지난 업무만 보기'}
                className={cn(
                  'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30',
                  props.overdueActive && 'bg-destructive-soft',
                )}
              >
                <AlarmClock className="size-3.5" />
                <span className="@max-3xl:hidden">기한 지남</span>
                <span className="tabular-nums">{props.overdueCount}</span>
              </button>
            )}

            <button
              type="button"
              aria-pressed={showFilterRow}
              aria-label={props.activeFilterCount > 0 ? `필터 ${props.activeFilterCount}개 적용됨` : '필터'}
              title="필터"
              onClick={() => props.onFiltersOpenChange(!props.filtersOpen)}
              className={cn(iconButtonClassName, showFilterRow && 'bg-[#e9e8e3] text-foreground')}
            >
              <ListFilter />
              {props.activeFilterCount > 0 && (
                <span className="absolute top-[5px] right-[5px] size-1.5 rounded-full bg-info ring-2 ring-background" />
              )}
            </button>

            <DisplayMenu display={props.display} scope={props.scope} onChange={props.onDisplayChange} />

            <ToolbarPillToggle
              ariaLabel="보기 방식"
              value={props.display.layout}
              onChange={(layout) => props.onDisplayChange({ layout })}
              options={LAYOUT_OPTIONS}
            />
            <Button
              size="sm"
              aria-label="업무 추가"
              title="업무 추가 (N)"
              className="h-[30px] shrink-0 rounded-full px-3.5"
              onClick={props.onCreate}
            >
              <Plus className="size-3.5" />
              <span className="@max-3xl:hidden">업무 추가</span>
            </Button>
          </div>
        </div>
      </section>

      {/* 2행 — 필터 (열었거나 걸려 있을 때만) */}
      {showFilterRow && <FilterRow {...props} />}
    </>
  );
}

// ── 표시 메뉴 ──────────────────────────────────────────────────

function DisplayMenu({
  display,
  scope,
  onChange,
}: {
  display: TaskDisplay;
  scope: TaskScope;
  onChange: (patch: Partial<TaskDisplay>) => void;
}) {
  const isBoard = display.layout === 'board';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="표시 설정" title="표시" className={iconButtonClassName}>
          <SlidersHorizontal />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <DisplaySection icon={<Rows3 />} label="묶기">
          {isBoard ? (
            <p className="text-xs text-muted-foreground">보드는 상태별 칸으로 고정됩니다.</p>
          ) : (
            <OptionPills
              value={display.groupBy}
              options={GROUP_OPTIONS.map((option) =>
                option.value === 'assignee' && scope === 'mine'
                  ? { ...option, disabled: true, hint: '내 담당에서는 담당자가 한 명뿐입니다' }
                  : option,
              )}
              onChange={(groupBy) => onChange({ groupBy })}
            />
          )}
        </DisplaySection>
        {!isBoard && (
          <DisplaySection icon={<ArrowUpDown />} label="정렬">
            <OptionPills
              value={display.sortBy}
              options={SORT_OPTIONS}
              onChange={(sortBy) => onChange({ sortBy })}
            />
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              상태별 · 직접 정렬일 때 행을 끌어 순서와 상태를 바꿀 수 있습니다.
            </p>
          </DisplaySection>
        )}
        <div className="border-t border-border px-3.5 py-2.5">
          <label className="flex cursor-pointer items-center justify-between text-[13px]">
            완료 업무 보기
            <Switch
              size="sm"
              checked={display.showCompleted}
              onCheckedChange={(showCompleted) => onChange({ showCompleted })}
            />
          </label>
        </div>
        {!isBoard && (
          <DisplaySection icon={<Eye />} label="보이는 정보">
            <div className="flex flex-wrap gap-1">
              {VISIBLE_OPTIONS.map((option) => {
                const on = display.visible[option.value];
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ visible: { ...display.visible, [option.value]: !on } })}
                    className={cn(
                      'inline-flex h-[26px] items-center rounded-full border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20',
                      on
                        ? 'border-transparent bg-[#ebeae6] font-medium text-foreground'
                        : 'border-[#e3e2de] text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </DisplaySection>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DisplaySection({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="border-t border-border px-3.5 py-2.5 first:border-t-0">
      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground [&_svg]:size-3">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function OptionPills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean; hint?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-[26px] items-center rounded-full border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-40',
              selected
                ? 'border-foreground bg-foreground font-medium text-white'
                : 'border-[#e3e2de] text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── 2행 필터 ────────────────────────────────────────────────────

function FilterRow(props: TaskToolbarProps) {
  const dueSummary = DUE_FILTER_OPTIONS.find((o) => o.value === props.due)?.label ?? null;
  const categorySummary = props.category
    ? (categoryConfig[props.category as TaskCategory]?.label ?? props.category)
    : null;
  const statusSummary = props.status
    ? (STATUS_FILTER_LABELS[props.status as keyof typeof STATUS_FILTER_LABELS] ?? props.status)
    : null;
  const assigneeSummary = props.assignee
    ? props.assignee === ASSIGNEE_UNASSIGNED
      ? '미배정'
      : (props.employees.find((e) => e.id === props.assignee)?.name ?? '선택한 직원')
    : null;
  const priorityOptions = Object.entries(priorityConfig).map(([value, { label }]) => ({
    value,
    label,
    meta: String(props.priorityCounts.get(value) ?? 0),
  }));
  const visibleCategories = (Object.keys(categoryConfig) as TaskCategory[]).filter(
    (key) => (props.categoryCounts.byCategory.get(key) ?? 0) > 0 || props.category === key,
  );

  return (
    <section className="flex shrink-0 items-center gap-2 border-b border-border bg-[#fcfcfb] px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ToolbarFilterChip
          label="상태"
          summary={statusSummary}
          onClear={() => props.onStatusChange('')}
          contentClassName="w-[200px] p-1"
        >
          {(close) => (
            <SingleSelectPanel
              value={props.status}
              options={STATUS_FILTER_OPTIONS.map((value) => ({
                value,
                label: STATUS_FILTER_LABELS[value],
                icon: statusIcons[value],
                count: props.statusCounts[value],
              }))}
              allLabel="취소 빼고 전체"
              allCount={props.statusCounts.all}
              onChange={(value) => {
                props.onStatusChange(value);
                close();
              }}
            />
          )}
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="마감"
          summary={dueSummary}
          onClear={() => props.onDueChange('')}
          contentClassName="w-[200px] p-1"
        >
          {(close) => (
            <SingleSelectPanel
              value={props.due}
              options={DUE_FILTER_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                count: props.dueCounts[option.value],
                emphasis: option.value === 'overdue' && props.dueCounts.overdue > 0,
              }))}
              allLabel="전체"
              allCount={props.dueCounts.all}
              onChange={(value) => {
                props.onDueChange(value as DueDateFilter);
                close();
              }}
            />
          )}
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="카테고리"
          summary={categorySummary}
          onClear={() => props.onCategoryChange('')}
          contentClassName="w-[220px] p-1"
        >
          {(close) => (
            <SingleSelectPanel
              value={props.category}
              options={visibleCategories.map((key) => ({
                value: key,
                label: categoryConfig[key].label,
                icon: (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: categoryConfig[key].dot }}
                    aria-hidden="true"
                  />
                ),
                count: props.categoryCounts.byCategory.get(key) ?? 0,
              }))}
              allLabel="모든 카테고리"
              allCount={props.categoryCounts.all}
              onChange={(value) => {
                props.onCategoryChange(value);
                close();
              }}
            />
          )}
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="우선순위"
          summary={summarizeSelection(priorityOptions, props.priorities)}
          onClear={() => props.onPrioritiesChange([])}
          contentClassName="w-[180px] p-0"
        >
          <ChecklistFilterPanel
            options={priorityOptions}
            selected={props.priorities}
            onChange={props.onPrioritiesChange}
            searchable={false}
          />
        </ToolbarFilterChip>

        {props.scope !== 'mine' && (
          <ToolbarFilterChip
            label="담당자"
            summary={assigneeSummary}
            onClear={() => props.onAssigneeChange('')}
            contentClassName="w-[220px] p-1"
          >
            {(close) => (
              <AssigneePanel
                value={props.assignee}
                employees={props.employees}
                onChange={(value) => {
                  props.onAssigneeChange(value);
                  close();
                }}
              />
            )}
          </ToolbarFilterChip>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {props.resultCount !== null && (
          <span className="px-1 text-[12.5px] tabular-nums text-muted-foreground">{props.resultCount}건</span>
        )}
        {props.hasActiveFilters && (
          <>
            <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
            <button type="button" className={toolbarGhostButtonClassName} onClick={props.onReset}>
              <RotateCcw className="size-3.5" />
              초기화
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// ── 담당자 필터 패널 ────────────────────────────────────────────

function AssigneePanel({
  value,
  employees,
  onChange,
}: {
  value: string;
  employees: Employee[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="max-h-80 overflow-y-auto">
      <AssigneeOption selected={value === ''} label="모든 담당자" onSelect={() => onChange('')} />
      <AssigneeOption
        selected={value === ASSIGNEE_UNASSIGNED}
        icon={<UserX />}
        label="미배정"
        onSelect={() => onChange(ASSIGNEE_UNASSIGNED)}
      />
      {employees.length > 0 && <div className="my-1 h-px bg-border" />}
      {employees.map((employee) => (
        <AssigneeOption
          key={employee.id}
          selected={value === employee.id}
          icon={
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
              {employee.name.charAt(0)}
            </span>
          }
          label={employee.name}
          onSelect={() => onChange(employee.id)}
        />
      ))}
    </div>
  );
}

function AssigneeOption({
  selected,
  icon,
  label,
  onSelect,
}: {
  selected: boolean;
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-[13px] text-foreground hover:bg-[rgba(55,53,47,0.06)] [&_svg]:size-3.5 [&_svg]:text-muted-foreground',
        selected && 'bg-[rgba(55,53,47,0.06)] font-medium',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <Check className="shrink-0 !text-foreground" />}
    </button>
  );
}

// ── 하나만 고르는 칩 패널 (건수 표시) ───────────────────────────

function SingleSelectPanel({
  value,
  options,
  allLabel,
  allCount,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; count: number; icon?: ReactNode; emphasis?: boolean }[];
  allLabel: string;
  allCount: number;
  onChange: (value: string) => void;
}) {
  const rows = [{ value: '', label: allLabel, count: allCount }, ...options];
  return (
    <div className="max-h-80 overflow-y-auto">
      {rows.map((row) => {
        const selected = value === row.value;
        const icon = 'icon' in row ? row.icon : undefined;
        const emphasis = 'emphasis' in row ? row.emphasis : false;
        return (
          <button
            key={row.value || 'all'}
            type="button"
            onClick={() => onChange(row.value)}
            className={cn(
              'flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-[13px] text-foreground hover:bg-[rgba(55,53,47,0.06)]',
              selected && 'bg-[rgba(55,53,47,0.06)] font-medium',
            )}
          >
            {icon && (
              <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
                {icon}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <span
              className={cn(
                'text-[11.5px] tabular-nums',
                emphasis ? 'font-semibold text-destructive' : 'text-muted-foreground',
              )}
            >
              {row.count}
            </span>
            <Check className={cn('size-3.5 shrink-0', selected ? 'text-foreground' : 'invisible')} />
          </button>
        );
      })}
    </div>
  );
}
