import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Columns3,
  Flag,
  House,
  ListFilter,
  Plus,
  RotateCcw,
  Search,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import type { ProjectListSort } from "@estate-erp/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ChecklistFilterPanel,
  ToolbarFilterChip,
  ToolbarPillTabs,
  ToolbarSelectPanel,
  ToolbarToggleChip,
  summarizeSelection,
  toolbarGhostButtonClassName,
} from "../properties/-components/property-toolbar";
import {
  PROJECT_DERIVED_STATUSES,
  PROJECT_INTAKE_FILTER_LABELS,
  PROJECT_INTAKE_FILTERS,
  PROJECT_LIST_SORT_CHOICES,
  PROJECT_PRIMARY_FILTER_LABELS,
  PROJECT_FIXED_COLUMN_IDS,
  PROJECT_TABLE_COLUMNS,
  moveProjectColumn,
  projectCreatedPreset,
  summarizeCreatedRange,
  type ProjectListConditions,
  type ProjectTableSettings,
} from "./-project-list-filters";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_OPTIONS } from "./-project-model";

/*
 * 프로젝트 목록의 위쪽 두 줄. 매물관리 목록(properties/index.tsx)과 같은 부품 · 같은 치수다:
 * 1행 — 보기 탭(활성 · 종료) · 검색 · 필터 줄 여닫기 · 열 설정 · 정렬 … (오른쪽) 프로젝트 열기
 * 2행 — 필터 알약 줄 (내 프로젝트 · 상태 · 담당 · 의뢰 · 대표 고객 · 시작) … 초기화
 */

/** 매물관리 1행의 아이콘 단추와 같은 모양(30px 원, 흐린 글자색). 검색 아이콘과 한 무리로 붙인다. */
const toolIconClassName =
  "-ml-2 inline-flex size-[30px] shrink-0 items-center justify-center rounded-full text-[#6f6c66] transition-colors hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 data-[state=open]:bg-[rgba(60,52,40,0.06)]";

export function ProjectListToolbar({
  archived,
  onArchivedChange,
  search,
  onSearchChange,
  isFilterRowOpen,
  onToggleFilterRow,
  activeFilterCount,
  tableSettings,
  onTableSettingsChange,
  sort,
  order,
  onSortChange,
  onCreate,
}: {
  archived: boolean;
  onArchivedChange: (archived: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  isFilterRowOpen: boolean;
  onToggleFilterRow: () => void;
  /** 걸린 필터 수(검색어 · 보기 탭 · 정렬 제외) */
  activeFilterCount: number;
  tableSettings: ProjectTableSettings;
  onTableSettingsChange: (settings: ProjectTableSettings) => void;
  sort: ProjectListSort;
  order: "asc" | "desc";
  onSortChange: (sort: ProjectListSort, order: "asc" | "desc") => void;
  onCreate: () => void;
}) {
  return (
    <section
      aria-label="프로젝트 보기 및 검색"
      // 매물관리 1행과 같은 여백(좌우 12px · 위아래 10px)과 아래 선
      className="shrink-0 border-b border-border bg-white px-3 py-2.5"
    >
      <div className="@container flex min-w-0 items-center gap-2">
        <ToolbarPillTabs
          shape="muted"
          ariaLabel="프로젝트 보기"
          value={archived ? "archived" : "open"}
          options={PROJECT_STATUS_OPTIONS}
          onChange={(value) => onArchivedChange(value === "archived")}
        />
        <ProjectSearchTool value={search} onChange={onSearchChange} />
        <button
          type="button"
          aria-label={isFilterRowOpen ? "필터 줄 접기" : "필터 줄 펼치기"}
          aria-pressed={isFilterRowOpen}
          title="필터"
          onClick={onToggleFilterRow}
          className={cn(
            toolIconClassName,
            // 접힌 채로 조건이 걸려 있으면 파랗게, 걸린 수와 함께 알린다
            !isFilterRowOpen && activeFilterCount > 0 && "w-auto gap-1 px-2 text-[#2383e2] hover:text-[#2383e2]",
          )}
        >
          <ListFilter className="size-3.5" />
          {!isFilterRowOpen && activeFilterCount > 0 && (
            <span className="text-[12.5px] font-medium tabular-nums">{activeFilterCount}</span>
          )}
        </button>
        <ProjectColumnSettings settings={tableSettings} onChange={onTableSettingsChange} />
        <ProjectSortControl sort={sort} order={order} onChange={onSortChange} />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            aria-label="프로젝트 열기"
            title="프로젝트 열기"
            className="h-[30px] shrink-0 rounded-[8px] px-3"
            onClick={onCreate}
          >
            <Plus className="size-3.5" />
            {/* 매물관리의 "새 매물 등록"과 같다: 좁은 창에서는 아이콘만 */}
            <span className="@max-4xl:hidden">프로젝트 열기</span>
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Notion식 검색: 돋보기를 누르면 옆으로 펼쳐지고, 비운 채 벗어나면 다시 접힌다(희망매물 검색과 같은 동작). */
function ProjectSearchTool({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusRequest = useRef(false);
  const returnFocus = useRef(false);
  const open = expanded || value !== "";

  useEffect(() => {
    if (open && focusRequest.current) {
      focusRequest.current = false;
      inputRef.current?.focus();
    }
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);
  // 검색어가 밖에서 지워지면(초기화 등) 빈 칸을 남겨 두지 않는다
  useEffect(() => {
    if (value === "" && document.activeElement !== inputRef.current) setExpanded(false);
  }, [value]);

  if (!open) {
    return (
      <button
        ref={buttonRef}
        type="button"
        aria-label="검색"
        title="검색"
        className={cn(toolIconClassName, "ml-0")}
        onClick={() => {
          focusRequest.current = true;
          setExpanded(true);
        }}
      >
        <Search className="size-3.5" />
      </button>
    );
  }
  return (
    <div
      data-project-search
      className="flex h-[30px] min-w-0 items-center gap-1.5 rounded-full bg-[rgba(55,53,47,0.06)] pl-2.5 pr-1"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (!value) window.setTimeout(() => setExpanded(false), 0);
      }}
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          if (value) onChange("");
          else {
            returnFocus.current = true;
            setExpanded(false);
          }
        }}
        placeholder="고객, 프로젝트 이름"
        aria-label="프로젝트 검색"
        className="h-[30px] w-[200px] min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a5a39f] hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/** 열 설정: 보이기 · 숨기기와 순서(위 · 아래). 너비는 표의 열 경계를 끌어 바꾸고, 셋 모두 기억한다. */
/**
 * 열 설정: 보이기 · 순서 · 기본으로 되돌리기. 도구 줄의 열 아이콘과 표 머리 구분선 위의 작은 + 단추가 함께 연다
 * (trigger로 단추를 바꿔 끼운다).
 */
export function ProjectColumnSettings({
  settings,
  onChange,
  trigger,
}: {
  settings: ProjectTableSettings;
  onChange: (settings: ProjectTableSettings) => void;
  /** 여는 단추. 없으면 도구 줄의 열 아이콘 */
  trigger?: ReactNode;
}) {
  const columns = settings.order
    .map((id) => PROJECT_TABLE_COLUMNS.find((column) => column.id === id))
    .filter((column): column is (typeof PROJECT_TABLE_COLUMNS)[number] => Boolean(column));
  // 기준 열(고객 · 프로젝트)은 맨 앞 고정이라, 그 바로 뒤 열은 더 앞으로 갈 수 없다
  const firstMovableIndex = PROJECT_FIXED_COLUMN_IDS.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button type="button" aria-label="열 설정" title="열 설정" className={toolIconClassName}>
            <Columns3 className="size-3.5" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">표에 표시할 열</DropdownMenuLabel>
        {columns.map((column, index) => {
          const visible = !settings.hidden.includes(column.id);
          return (
            <div key={column.id} className="flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-[rgba(55,53,47,0.04)]">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visible}
                disabled={column.fixed}
                onClick={() =>
                  onChange({
                    ...settings,
                    hidden: visible
                      ? [...settings.hidden, column.id]
                      : settings.hidden.filter((id) => id !== column.id),
                  })
                }
                className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-1 text-left text-[13px] disabled:cursor-default"
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-[3px] border",
                    visible ? "border-foreground bg-foreground text-white" : "border-[#d6d5d0]",
                    column.fixed && "opacity-50",
                  )}
                >
                  {visible && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{column.label}</span>
                {column.fixed && <span className="text-xs text-muted-foreground">기준 열</span>}
              </button>
              {!column.fixed && (
                <span className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={`${column.label} 열 앞으로`}
                    disabled={index <= firstMovableIndex}
                    onClick={() => onChange({ ...settings, order: moveProjectColumn(settings.order, column.id, -1) })}
                    className="inline-grid size-6 place-items-center rounded text-muted-foreground hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${column.label} 열 뒤로`}
                    disabled={index === columns.length - 1}
                    onClick={() => onChange({ ...settings, order: moveProjectColumn(settings.order, column.id, 1) })}
                    className="inline-grid size-6 place-items-center rounded text-muted-foreground hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </span>
              )}
            </div>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            onChange({
              hidden: PROJECT_TABLE_COLUMNS.filter((column) => column.hiddenByDefault).map((column) => column.id),
              order: PROJECT_TABLE_COLUMNS.map((column) => column.id),
              sizing: {},
            })
          }
        >
          <RotateCcw />
          기본 표시로 되돌리기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 정렬 고르기(매물관리의 정렬 아이콘과 같은 자리 · 모양). 기본(최근 고친 순)이 아니면 파랗게 표시한다. */
function ProjectSortControl({
  sort,
  order,
  onChange,
}: {
  sort: ProjectListSort;
  order: "asc" | "desc";
  onChange: (sort: ProjectListSort, order: "asc" | "desc") => void;
}) {
  const current = PROJECT_LIST_SORT_CHOICES.find((choice) => choice.sort === sort && choice.order === order);
  const isDefault = sort === "updated" && order === "desc";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`정렬: ${current?.label ?? "최근 고친 순"}`}
          title={`정렬: ${current?.label ?? "최근 고친 순"}`}
          className={cn(
            "-ml-2 inline-flex size-[30px] shrink-0 items-center justify-center rounded-md hover:bg-[rgba(55,53,47,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35",
            isDefault ? "text-[#6f6c66]" : "bg-[#edf5fc] text-[#2383e2]",
          )}
        >
          {isDefault ? (
            <ArrowUpDown className="size-3.5" />
          ) : order === "desc" ? (
            <ArrowDown className="size-3.5" />
          ) : (
            <ArrowUp className="size-3.5" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">정렬</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={`${sort}:${order}`}
          onValueChange={(value) => {
            const [nextSort, nextOrder] = value.split(":") as [ProjectListSort, "asc" | "desc"];
            onChange(nextSort, nextOrder);
          }}
        >
          {PROJECT_LIST_SORT_CHOICES.map((choice) => (
            <DropdownMenuRadioItem key={`${choice.sort}:${choice.order}`} value={`${choice.sort}:${choice.order}`}>
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── 필터 알약 줄 ───────────────────────────────────────────────

export function ProjectFilterRow({
  conditions,
  onChange,
  assigneeOptions,
  activeFilterCount,
  onReset,
  showMine,
}: {
  conditions: ProjectListConditions;
  onChange: (patch: Partial<ProjectListConditions>) => void;
  assigneeOptions: ReadonlyArray<{ value: string; label: string }>;
  activeFilterCount: number;
  onReset: () => void;
  /** 로그인 정보가 있을 때만 "내 프로젝트"를 둔다 */
  showMine: boolean;
}) {
  const statusOptions = PROJECT_DERIVED_STATUSES.map((value) => ({
    value,
    label: PROJECT_STATUS_LABELS[value],
  }));
  const assigneeChoices = [{ value: "none", label: "담당 없음" }, ...assigneeOptions];
  const intakeOptions = PROJECT_INTAKE_FILTERS.map((value) => ({
    value,
    label: PROJECT_INTAKE_FILTER_LABELS[value],
  }));
  const primaryOptions = (["set", "empty"] as const).map((value) => ({
    value,
    label: PROJECT_PRIMARY_FILTER_LABELS[value],
  }));

  return (
    <section
      data-project-filter-row
      aria-label="프로젝트 필터"
      // 매물관리 필터 줄과 같은 여백(좌우 12px · 위 8px · 아래 0). 칩이 두 줄로 넘어가도 초기화는 첫 줄 오른쪽에 둔다.
      // 필터 줄과 표 머리는 구분선 없이 이어진다: 표가 위에 8px(+ 단추가 걸치는 자리)을 비우고 머리 위에 선을 긋는다.
      className="flex shrink-0 items-start gap-2 bg-white px-3 pb-0 pt-2"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
        {showMine && (
          // 하루 종일 자기 일부터 보는 일이 많아 맨 앞에 둔다 (희망매물의 "내 손님"과 같다)
          <ToolbarToggleChip
            label="내 프로젝트"
            active={conditions.mine}
            onToggle={() => onChange({ mine: !conditions.mine })}
          />
        )}
        {!conditions.archived && (
          <ToolbarFilterChip
            label="상태"
            shape="soft"
            icon={<Flag />}
            summary={summarizeSelection(statusOptions, conditions.statuses)}
            onClear={() => onChange({ statuses: [] })}
            contentClassName="w-[180px] p-0"
          >
            <ChecklistFilterPanel
              options={statusOptions}
              selected={conditions.statuses}
              onChange={(values) => onChange({ statuses: values as ProjectListConditions["statuses"] })}
              searchable={false}
            />
          </ToolbarFilterChip>
        )}
        <ToolbarFilterChip
          label="담당"
          shape="soft"
          icon={<UserCheck />}
          summary={summarizeSelection(assigneeChoices, conditions.assignees)}
          onClear={() => onChange({ assignees: [] })}
          contentClassName="w-[220px] p-0"
        >
          <ChecklistFilterPanel
            options={assigneeChoices}
            selected={conditions.assignees}
            onChange={(values) => onChange({ assignees: values })}
            searchPlaceholder="직원 이름"
            emptyText="고를 수 있는 직원이 없습니다."
          />
        </ToolbarFilterChip>
        <ToolbarFilterChip
          label="의뢰"
          shape="soft"
          icon={<House />}
          summary={summarizeSelection(intakeOptions, conditions.intakes)}
          onClear={() => onChange({ intakes: [] })}
          contentClassName="w-[200px] p-0"
        >
          <ChecklistFilterPanel
            options={intakeOptions}
            selected={conditions.intakes}
            onChange={(values) => onChange({ intakes: values as ProjectListConditions["intakes"] })}
            searchable={false}
          />
        </ToolbarFilterChip>
        <ToolbarFilterChip
          label="대표 고객"
          shape="soft"
          icon={<UserRound />}
          summary={conditions.primary ? PROJECT_PRIMARY_FILTER_LABELS[conditions.primary] : null}
          onClear={() => onChange({ primary: null })}
          contentClassName="w-[180px] p-0"
        >
          {(close) => (
            <ToolbarSelectPanel
              options={primaryOptions}
              value={conditions.primary ?? "all"}
              onChange={(value) => onChange({ primary: value === "all" ? null : (value as "set" | "empty") })}
              onClose={close}
            />
          )}
        </ToolbarFilterChip>
        <ToolbarFilterChip
          label="시작"
          shape="soft"
          icon={<CalendarDays />}
          summary={summarizeCreatedRange(conditions.createdFrom, conditions.createdTo)}
          onClear={() => onChange({ createdFrom: "", createdTo: "" })}
          contentClassName="w-[300px] p-3"
        >
          <CreatedRangePanel
            from={conditions.createdFrom}
            to={conditions.createdTo}
            onChange={(createdFrom, createdTo) => onChange({ createdFrom, createdTo })}
          />
        </ToolbarFilterChip>
      </div>
      {activeFilterCount > 0 || conditions.search.trim() ? (
        <button
          type="button"
          className={cn(toolbarGhostButtonClassName, "shrink-0 rounded-full")}
          onClick={onReset}
        >
          <RotateCcw className="size-3.5" />
          초기화
        </button>
      ) : null}
    </section>
  );
}

/** 시작 기간: 이번 주 · 이번 달 · 직접 고르기 (매물관리 날짜 필터와 같은 모양) */
function CreatedRangePanel({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const presets: Array<{ key: "week" | "month"; label: string }> = [
    { key: "week", label: "이번 주" },
    { key: "month", label: "이번 달" },
  ];
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium text-muted-foreground">프로젝트를 연 날</p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const range = projectCreatedPreset(preset.key);
          const selected = range.from === from && range.to === to;
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(range.from, range.to)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-[12px] transition-colors",
                selected
                  ? "border-transparent bg-[#ebeae6] font-semibold text-foreground"
                  : "border-border bg-white text-foreground hover:bg-muted",
              )}
            >
              {preset.label}
            </button>
          );
        })}
        {(from || to) && (
          <button
            type="button"
            onClick={() => onChange("", "")}
            className="h-7 rounded-full px-2.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            지우기
          </button>
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <Input
          type="date"
          aria-label="시작 기간의 앞 날짜"
          value={from}
          max={to || undefined}
          onChange={(event) => onChange(event.target.value, to)}
          className="h-8 bg-white px-2 text-[13px]"
        />
        <span className="text-xs text-slate-400">~</span>
        <Input
          type="date"
          aria-label="시작 기간의 뒤 날짜"
          value={to}
          min={from || undefined}
          onChange={(event) => onChange(from, event.target.value)}
          className="h-8 bg-white px-2 text-[13px]"
        />
      </div>
    </div>
  );
}
