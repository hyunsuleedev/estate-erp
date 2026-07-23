import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  MoreHorizontal,
  Pencil,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  SquareArrowOutUpRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BuyerRequirement } from "@estate-erp/api-client";
import { TRANSACTION_TYPE_LABELS } from "@estate-erp/shared";
import { formatPhone } from "@/lib/format";
import { STATUS_CONFIG } from "@/lib/status-config";
import { StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DataTable,
  ViewBar,
  DateCell,
  TextCell,
  type FilterDefinition,
  type ActiveFilter,
  type SortDefinition,
} from "@/components/data-table";
import { formatBudget, regionLabels, siteLabels } from "./-buyer-utils";
import { ContactLogDialog } from "./-contact-log-dialog";
import {
  BuyerBulkActions,
  BuyerPipelineView,
  MatchExpandPanel,
  NextActionCell,
  WantExpandPanel,
  wantSummary,
} from "./-buyer-list-panels";

/* ── 필터 정의 (StatusBadge 단일 소스의 라벨을 그대로 사용) ── */

const statusOptions = Object.entries(STATUS_CONFIG.buyerStatus).map(
  ([value, meta]) => ({
    value,
    label: meta.label,
  }),
);
const urgencyOptions = Object.entries(STATUS_CONFIG.buyerUrgency).map(
  ([value, meta]) => ({
    value,
    label: meta.label,
  }),
);
const txTypeOptions = Object.entries(TRANSACTION_TYPE_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

const staticFilterDefinitions: FilterDefinition[] = [
  {
    id: "status",
    field: "status",
    label: "상태",
    type: "multiSelect",
    operators: ["in"],
    options: statusOptions,
  },
  {
    id: "urgency",
    field: "urgency",
    label: "긴급도",
    type: "multiSelect",
    operators: ["in"],
    options: urgencyOptions,
  },
  {
    id: "transactionType",
    field: "transactionType",
    label: "거래유형",
    type: "multiSelect",
    operators: ["in"],
    options: txTypeOptions,
  },
  {
    id: "price",
    field: "price",
    label: "예산",
    type: "numberRange",
    operators: ["between"],
    unit: "만원",
  },
  {
    id: "deposit",
    field: "deposit",
    label: "보증금",
    type: "numberRange",
    operators: ["between"],
    unit: "만원",
  },
  {
    id: "monthlyRent",
    field: "monthlyRent",
    label: "월세",
    type: "numberRange",
    operators: ["between"],
    unit: "만원",
  },
  {
    id: "area",
    field: "area",
    label: "면적",
    type: "numberRange",
    operators: ["between"],
    unit: "m²",
  },
  {
    id: "moveIn",
    field: "moveIn",
    label: "입주 희망일",
    type: "dateRange",
    operators: ["between"],
  },
  {
    id: "nextContact",
    field: "nextContact",
    label: "다음 연락일",
    type: "dateRange",
    operators: ["between"],
  },
];

const sortDefinitions = [
  { field: "createdAt", label: "등록일" },
  { field: "nextContactDate", label: "다음 연락일" },
  { field: "urgency", label: "긴급도" },
];

/* ── 좌측 프리셋 (PRD: 전체 / 연락 필요 / 활성 / 매칭 진행중 / 완료) ── */

type PresetId = "all" | "due" | "active" | "matched" | "completed";

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "due", label: "연락 필요" },
  { id: "active", label: "활성" },
  { id: "matched", label: "매칭 진행중" },
  { id: "completed", label: "완료" },
];

export const Route = createFileRoute("/_authenticated/buyer-requirements/")({
  component: BuyerRequirementsPage,
});

function BuyerRequirementsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<PresetId>("all");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: "createdAt", label: "등록일", direction: "desc" },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);

  // 연락함 기록 (행 빠른 액션)
  const [contactLogTarget, setContactLogTarget] =
    useState<BuyerRequirement | null>(null);

  // 리스트 ↔ 파이프라인 뷰 (시안 brViewBtns)
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");
  // 행 인라인 펼침 — rowId → 패널 종류 (희망 조건 | 매칭). 행당 하나만 연다.
  const [expandedPanels, setExpandedPanels] = useState<
    ReadonlyMap<string, "want" | "match">
  >(new Map());
  const togglePanel = useCallback((id: string, kind: "want" | "match") => {
    setExpandedPanels((prev) => {
      const next = new Map(prev);
      if (next.get(id) === kind) next.delete(id);
      else next.set(id, kind);
      return next;
    });
  }, []);
  const expandedRowIds = useMemo(
    () => new Set(expandedPanels.keys()),
    [expandedPanels],
  );

  // 상단 툴바 검색 포커스용 ref (Cmd/Ctrl+F) — 검색창이 항상 노출되므로 직접 포커스
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+N → 신규 등록, Cmd/Ctrl+F → 검색 포커스
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        navigate({ to: "/buyer-requirements/new" });
      } else if (key === "f") {
        e.preventDefault();
        const input = searchInputRef.current;
        if (input) {
          input.focus();
          input.select();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // Async filter defs — defined inside component so fetchOptions can close over
  // the api client.
  const allFilterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      ...staticFilterDefinitions,
      {
        id: "assignedToId",
        field: "assignedToId",
        label: "담당자",
        type: "asyncMultiSelect",
        operators: ["in"],
        fetchOptions: async (q) => {
          const employees = await api.employees.findAll();
          return employees
            .filter((e) => e.isActive && (!q || e.name.includes(q)))
            .map((e) => ({ label: e.name, value: e.id }));
        },
      },
      {
        id: "preferredSites",
        field: "preferredSites",
        label: "희망 단지",
        type: "asyncMultiSelect",
        operators: ["in"],
        fetchOptions: async (q) => {
          const sites = await api.officeSites.searchCentral(q);
          return sites.slice(0, 30).map((s) => ({
            label: s.name,
            value: s.id,
          }));
        },
      },
      {
        id: "preferredRegions",
        field: "preferredRegions",
        label: "희망 지역",
        type: "asyncMultiSelect",
        operators: ["in"],
        fetchOptions: async (q) => {
          const results = await api.regions.search(q, 20);
          return results.map((r) => ({
            // Value encodes level so apiParams knows where to send it:
            // "district:11740", "ward:1174010100", "province:11"
            value: `${r.level}:${r.code}`,
            label: r.fullName,
          }));
        },
      },
    ],
    [],
  );

  const apiParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit: 20,
      sortBy: activeSorts[0]?.field as any,
      sortOrder: activeSorts[0]?.direction ?? "desc",
    };
    if (query.trim()) params.search = query.trim();
    for (const filter of activeFilters) {
      // Preferred sites: CSV of site UUIDs
      if (filter.field === "preferredSites" && filter.values?.length) {
        params.preferredSiteIds = filter.values.join(",");
        continue;
      }
      // Preferred regions: values are "level:code" pairs; split into 3 CSVs
      if (filter.field === "preferredRegions" && filter.values?.length) {
        const provinceCodes: string[] = [];
        const districtCodes: string[] = [];
        const wardCodes: string[] = [];
        for (const v of filter.values) {
          const [level, code] = v.split(":");
          if (level === "province") provinceCodes.push(code);
          else if (level === "district") districtCodes.push(code);
          else if (level === "ward") wardCodes.push(code);
        }
        if (provinceCodes.length)
          params.provinceCodes = provinceCodes.join(",");
        if (districtCodes.length)
          params.districtCodes = districtCodes.join(",");
        if (wardCodes.length) params.wardCodes = wardCodes.join(",");
        continue;
      }
      // multiSelect → CSV
      if (filter.operator === "in" && filter.values?.length) {
        params[filter.field] = filter.values.join(",");
        continue;
      }
      // numberRange / dateRange → split to {fieldMin, fieldMax} or
      // {fieldAfter, fieldBefore} for date.
      if (filter.operator === "between") {
        const base = filter.field;
        if (base === "moveIn") {
          if (filter.valueMin) params[`${base}After`] = filter.valueMin;
          if (filter.valueMax) params[`${base}Before`] = filter.valueMax;
        } else if (base === "nextContact") {
          if (filter.valueMin) params.nextContactAfter = filter.valueMin;
          if (filter.valueMax) params.nextContactBefore = filter.valueMax;
        } else if (base === "monthlyRent") {
          // BuyerRequirement only stores monthlyRentMax (upper bound).
          // Interpret the filter's max as "monthly rent ceiling the buyer tolerates >= filter.min".
          if (filter.valueMin) params.monthlyRentMax = Number(filter.valueMin);
        } else {
          if (filter.valueMin) params[`${base}Min`] = Number(filter.valueMin);
          if (filter.valueMax) params[`${base}Max`] = Number(filter.valueMax);
        }
        continue;
      }
      // legacy single-value
      params[filter.field] = filter.value;
    }
    // 프리셋은 필터보다 나중에 적용 — 프리셋의 status가 우선한다.
    if (preset === "due") {
      params.status = "active";
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      params.nextContactBefore = endOfToday.toISOString();
    } else if (preset === "active") {
      params.status = "active";
    } else if (preset === "matched") {
      params.status = "matched";
    } else if (preset === "completed") {
      params.status = "completed";
    }
    return params;
  }, [page, activeFilters, activeSorts, query, preset]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["buyer-requirements", apiParams],
    queryFn: () => api.buyerRequirements.findAll(apiParams as any),
  });

  // 파이프라인 뷰는 페이지네이션 없이 전체 흐름을 봐야 하므로 별도 대용량 조회.
  // (리스트 쿼리를 그대로 쓰면 현재 페이지 20건만 레인에 실려 침묵 누락이 생긴다)
  // 서버 findAll이 limit을 100으로 클램프하므로 (buyer-requirements.service.ts)
  // 그 상한을 그대로 사용한다 — 더 크게 요청해도 조용히 잘려 경고 계산만 어긋난다.
  const PIPELINE_LIMIT = 100;
  const pipelineParams = useMemo(
    () => ({ ...apiParams, page: 1, limit: PIPELINE_LIMIT }),
    [apiParams],
  );
  const {
    data: pipelineData,
    isLoading: isPipelineLoading,
    isError: isPipelineError,
    refetch: refetchPipeline,
  } = useQuery({
    queryKey: ["buyer-requirements", "pipeline", pipelineParams],
    queryFn: () => api.buyerRequirements.findAll(pipelineParams as any),
    enabled: viewMode === "pipeline",
  });
  const pipelineItems = pipelineData?.items ?? [];
  const pipelineTotal = pipelineData?.pagination?.total ?? 0;

  // '연락 필요' 카운트 (due-contacts)
  const { data: dueContacts } = useQuery({
    queryKey: ["buyer-requirements", "due-contacts"],
    queryFn: () => api.buyerRequirements.findDueContacts(),
  });
  const dueCount = dueContacts?.length ?? 0;

  const filteredItems = data?.items ?? [];

  const handleSortAdd = useCallback((sort: SortDefinition) => {
    setActiveSorts([sort]);
    setSorting([{ id: sort.field, desc: sort.direction === "desc" }]);
    setPage(1);
  }, []);

  const openDetail = useCallback(
    (row: BuyerRequirement) => {
      navigate({ to: "/buyer-requirements/$id", params: { id: row.id } });
    },
    [navigate],
  );

  // 시안 컬럼 순서: 고객명 / 전화 / 거래 / 상태 / 매칭 / 예산 / 희망(펼침) / 최근 / 다음 액션 / 담당
  const columns = useMemo<ColumnDef<BuyerRequirement, unknown>[]>(
    () => [
      {
        id: "customer",
        header: "고객명",
        size: 108,
        cell: ({ row }) => {
          const contact = row.original.contact;
          if (!contact)
            return <span className="text-[13px] text-muted-foreground">-</span>;
          return (
            <Link
              to="/contacts/$id"
              params={{ id: contact.id }}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-[13px] font-semibold text-foreground hover:underline"
            >
              {contact.name}
            </Link>
          );
        },
      },
      {
        id: "phone",
        header: "전화",
        size: 122,
        cell: ({ row }) => {
          const phone = row.original.contact?.phone;
          if (!phone)
            return <span className="text-[13px] text-muted-foreground">-</span>;
          return (
            <span className="text-[12.5px] tabular-nums text-foreground">
              {formatPhone(phone)}
            </span>
          );
        },
      },
      {
        accessorKey: "transactionType",
        header: "거래",
        size: 64,
        cell: ({ row }) =>
          row.original.transactionType ? (
            <StatusBadge
              kind="transactionType"
              status={row.original.transactionType}
              size="sm"
            />
          ) : (
            <span className="text-[13px] text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "status",
        header: "상태",
        size: 90,
        cell: ({ row }) => (
          <StatusBadge
            kind="buyerStatus"
            status={row.original.status}
            size="sm"
          />
        ),
      },
      {
        id: "matches",
        header: "매칭",
        size: 60,
        cell: ({ row }) => {
          const n = row.original._count?.matches ?? 0;
          if (!n)
            return (
              <span className="pl-1 text-[12px] text-muted-foreground">—</span>
            );
          const open = expandedPanels.get(row.original.id) === "match";
          return (
            <button
              type="button"
              title={open ? "매칭 후보 접기" : "매칭 후보 펼치기"}
              onClick={(e) => {
                e.stopPropagation();
                togglePanel(row.original.id, "match");
              }}
              className={cn(
                "inline-flex h-5 items-center gap-0.5 rounded-full border px-[7px] text-[11px] font-semibold tabular-nums transition-colors",
                open
                  ? "border-transparent bg-warning text-white"
                  : "border-warning-soft bg-warning-soft/60 text-warning-strong hover:bg-warning-soft",
              )}
            >
              <GitBranch className="size-3" />
              {n}
            </button>
          );
        },
      },
      {
        accessorKey: "budget",
        header: "예산",
        size: 150,
        cell: ({ row }) => {
          const text = formatBudget(row.original);
          if (text === "—") return <TextCell value="-" muted />;
          return (
            <span className="truncate text-[12.5px] font-semibold tabular-nums text-foreground">
              {text}
            </span>
          );
        },
      },
      {
        id: "want",
        header: "희망",
        size: 240,
        meta: { fill: true },
        cell: ({ row }) => {
          const open = expandedPanels.get(row.original.id) === "want";
          const Icon = open ? ChevronUp : ChevronDown;
          return (
            <button
              type="button"
              title={open ? "희망 조건 접기" : "희망 조건 보기"}
              onClick={(e) => {
                e.stopPropagation();
                togglePanel(row.original.id, "want");
              }}
              className={cn(
                "inline-flex h-[22px] max-w-full min-w-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-[filter] hover:brightness-[.97]",
                open
                  ? "border-[#e3d3bb] bg-[#faf5ec] text-[#8a5a2b]"
                  : "border-border bg-white text-foreground",
              )}
            >
              <span className="min-w-0 truncate">
                {wantSummary(row.original)}
              </span>
              <Icon className="size-3 shrink-0" />
            </button>
          );
        },
      },
      {
        accessorKey: "lastContactDate",
        header: "최근",
        size: 80,
        cell: ({ row }) => {
          const v = row.original.lastContactDate;
          if (!v)
            return <span className="text-[12px] text-muted-foreground">-</span>;
          return (
            <span className="text-[11.5px] tabular-nums text-slate-600">
              <DateCell value={v} relative />
            </span>
          );
        },
      },
      {
        accessorKey: "nextContactDate",
        header: "다음 액션",
        size: 170,
        enableSorting: true,
        cell: ({ row }) => <NextActionCell r={row.original} />,
      },
      {
        id: "assignedTo",
        header: "담당",
        size: 72,
        cell: ({ row }) => (
          <span className="truncate text-[11.5px] text-slate-600">
            {row.original.assignedTo?.name ?? "-"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        size: 44,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => openDetail(row.original)}>
                <SquareArrowOutUpRight className="size-3.5" />
                상세 열기
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setContactLogTarget(row.original)}
              >
                <PhoneCall className="size-3.5" />
                연락함 기록
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  navigate({
                    to: "/buyer-requirements/$id/edit",
                    params: { id: row.original.id },
                  })
                }
              >
                <Pencil className="size-3.5" />
                조건 수정
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [openDetail, navigate, expandedPanels, togglePanel],
  );

  const total = data?.pagination?.total ?? 0;

  return (
    <div className="flex flex-col bg-white pt-4">
      {/* ── 상단 툴바: 프리셋 탭 칩 + 검색 + 의뢰 등록 (디자인 시안) ── */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border pb-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const isActive = preset === p.id;
            // 칩 카운트: 활성 탭은 현재 조회 결과 총계, '연락 필요'는 항상 due 카운트 노출
            const count = isActive
              ? total
              : p.id === "due" && dueCount > 0
                ? dueCount
                : null;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPreset(p.id);
                  setPage(1);
                }}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors",
                  isActive
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-white text-muted-foreground hover:bg-muted/60",
                )}
              >
                {p.label}
                {count !== null && (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-[17px] items-center justify-center rounded-lg px-[5px] text-[10.5px] font-semibold tabular-nums",
                      isActive
                        ? "bg-white/20 text-background"
                        : p.id === "due"
                          ? "bg-destructive-soft text-destructive"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 리스트 ↔ 파이프라인 뷰 전환 (시안 brViewBtns) */}
        <div className="flex rounded-lg bg-[#f1f0ed] p-[3px]">
          {(
            [
              { id: "list", label: "리스트" },
              { id: "pipeline", label: "파이프라인" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewMode(v.id)}
              className={cn(
                "rounded-md px-3 py-[5px] text-[12.5px] transition-colors",
                viewMode === v.id
                  ? "bg-white font-semibold text-foreground shadow-sm"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* 검색 (Cmd/Ctrl+F 포커스) */}
        <div className="flex h-8 w-[200px] items-center gap-[7px] rounded-lg border border-border bg-muted px-[11px]">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="이름 · 조건 검색"
            className="w-full min-w-0 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/80"
          />
        </div>

        <Link
          to="/buyer-requirements/new"
          className="flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-foreground px-3.5 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Plus className="size-[15px]" />
          의뢰 등록
        </Link>
      </div>

      {/* ── 쿼리 바 + 목록 ── */}
      <div className="min-w-0 flex-1 space-y-3">
        {/* 쿼리 바: 필터 · 정렬 한 줄 묶음 (검색은 상단 툴바와 동일 상태 공유) */}
        <div className="border-b border-border/60">
          <ViewBar
            search={query}
            onSearchChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            searchPlaceholder="이름 · 조건 검색"
            filterDefinitions={allFilterDefinitions}
            activeFilters={activeFilters}
            onFilterAdd={(f) => {
              setActiveFilters((prev) => [
                ...prev.filter((p) => p.field !== f.field),
                f,
              ]);
              setPage(1);
            }}
            onFilterRemove={(id) => {
              setActiveFilters((prev) => prev.filter((f) => f.id !== id));
              setPage(1);
            }}
            onFiltersReset={() => {
              setActiveFilters([]);
              setActiveSorts([
                { field: "createdAt", label: "등록일", direction: "desc" },
              ]);
              setPage(1);
            }}
            inlineFilters={[
              "preferredRegions",
              "preferredSites",
              "status",
              "urgency",
              "transactionType",
              "price",
              "area",
            ]}
            sortDefinitions={sortDefinitions}
            activeSorts={activeSorts}
            onSortAdd={handleSortAdd}
            onSortRemove={() => setActiveSorts([])}
          />
        </div>

        {/* 파이프라인은 리스트 쿼리와 독립된 자체 로딩/오류/재시도 상태를 가진다 */}
        {viewMode === "pipeline" ? (
          isPipelineLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-border bg-white py-16 text-sm text-muted-foreground">
              파이프라인을 불러오는 중…
            </div>
          ) : isPipelineError ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white py-16 text-center">
              <p className="text-sm text-muted-foreground">
                파이프라인을 불러오지 못했습니다.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchPipeline()}
              >
                <RefreshCw className="size-3.5" />
                다시 시도
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {pipelineTotal > pipelineItems.length && (
                <p className="text-[12px] text-warning-strong">
                  의뢰가 많아 최근 {pipelineItems.length}건만 표시합니다 (전체{" "}
                  {pipelineTotal.toLocaleString()}건). 필터로 범위를 좁혀 주세요.
                </p>
              )}
              <BuyerPipelineView items={pipelineItems} onOpen={openDetail} />
            </div>
          )
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white py-16 text-center">
            <p className="text-sm text-muted-foreground">
              목록을 불러오지 못했습니다.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <DataTable
              columns={columns}
              data={filteredItems}
              totalCount={data?.pagination?.total ?? 0}
              pageCount={data?.pagination?.totalPages ?? 1}
              page={page}
              onPageChange={setPage}
              pageSize={20}
              sorting={sorting}
              onSortingChange={(s) => {
                setSorting(s);
                if (s.length > 0) {
                  const def = sortDefinitions.find((d) => d.field === s[0].id);
                  setActiveSorts([
                    {
                      field: s[0].id,
                      label: def?.label ?? s[0].id,
                      direction: s[0].desc ? "desc" : "asc",
                    },
                  ]);
                }
              }}
              rowHeight={36}
              pinnedColumns={["customer"]}
              enableRowSelection
              // 시안의 "n명 선택" 일괄 바 — DataTable 내장 바에 액션 주입
              renderBulkActions={(rows) => <BuyerBulkActions selected={rows} />}
              expandedRowIds={expandedRowIds}
              renderExpandedRow={(r) =>
                expandedPanels.get(r.id) === "match" ? (
                  <MatchExpandPanel requirement={r} />
                ) : (
                  <WantExpandPanel r={r} />
                )
              }
              isLoading={isLoading}
              onRowClick={openDetail}
              emptyMessage={
                query.trim() || activeFilters.length > 0 || preset !== "all"
                  ? "검색 결과가 없습니다."
                  : '구매 희망 고객이 없습니다. 우측 상단 "구매고객 등록"으로 첫 조건을 추가해보세요.'
              }
              renderStatusBar={({ focusedRow, totalCount }) => {
                if (!focusedRow) {
                  return (
                    <span className="tabular-nums">
                      총 {totalCount.toLocaleString()}명
                    </span>
                  );
                }
                const contact = focusedRow.contact;
                const regions = regionLabels(focusedRow).join(", ");
                const siteNames = siteLabels(focusedRow).join(", ");
                const budget = formatBudget(focusedRow);
                return (
                  <>
                    <span className="tabular-nums text-foreground/80">
                      {totalCount.toLocaleString()}명
                    </span>
                    <span className="text-border">|</span>
                    <span className="font-medium text-foreground">
                      {contact?.name ?? "-"}
                    </span>
                    {contact?.phone && (
                      <span className="tabular-nums text-foreground/70">
                        {formatPhone(contact.phone)}
                      </span>
                    )}
                    {budget !== "—" && (
                      <>
                        <span className="text-border">|</span>
                        <span>예산 {budget}</span>
                      </>
                    )}
                    {regions && (
                      <>
                        <span className="text-border">|</span>
                        <span className="truncate">희망지역 {regions}</span>
                      </>
                    )}
                    {siteNames && (
                      <>
                        <span className="text-border">|</span>
                        <span className="truncate">희망단지 {siteNames}</span>
                      </>
                    )}
                  </>
                );
              }}
            />
          </div>
        )}
      </div>

      {/* ── 연락함 기록 (행 빠른 액션) ── */}
      <ContactLogDialog
        open={contactLogTarget !== null}
        onOpenChange={(open) => {
          if (!open) setContactLogTarget(null);
        }}
        requirementId={contactLogTarget?.id ?? null}
        defaultNextContactDate={contactLogTarget?.nextContactDate}
        contactName={contactLogTarget?.contact?.name}
      />
    </div>
  );
}
