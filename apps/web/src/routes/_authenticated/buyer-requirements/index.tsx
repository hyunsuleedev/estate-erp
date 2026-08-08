import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  BadgeAlert,
  CalendarDays,
  CircleDot,
  EllipsisVertical,
  GitBranch,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SquareArrowOutUpRight,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  BuyerRequirement,
  BuyerRequirementStatus,
} from "@estate-erp/api-client";
import { pyeongToSqm, TRANSACTION_TYPE_LABELS } from "@estate-erp/shared";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";
import { normalizeBuyerStatus, STATUS_CONFIG } from "@/lib/status-config";
import { StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DataTable,
  CellEditProvider,
  EditableCell,
  ViewBar,
  DateCell,
  TextCell,
  type ChipOption,
  type FilterDefinition,
  type ActiveFilter,
  type SortDefinition,
} from "@/components/data-table";
import {
  formatSupplyPyeong,
  regionLabels,
  siteLabels,
  siteTypeSummary,
} from "./-buyer-utils";
import { ContactLogDialog } from "./-contact-log-dialog";
import { BuyerBulkActions } from "./-buyer-list-panels";
import {
  buyerBudgetBoundaryValue,
  buyerIntakesToGroups,
  sortBuyerRequirementGroups,
  type BuyerLedgerBoundary,
  type BuyerRequirementGroup,
} from "./-buyer-ledger";

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

const buyerStatusChipClasses: Record<string, string> = {
  active: "bg-success-soft text-success",
  hold: "bg-warning-soft text-warning",
  completed: "bg-neutral-soft text-neutral-strong",
};
const buyerUrgencyChipClasses: Record<string, string> = {
  urgent: "bg-destructive-soft text-destructive",
  normal: "bg-neutral-soft text-muted-foreground",
  flexible: "bg-info-soft text-info",
};
const buyerStatusChipOptions: ChipOption[] = statusOptions.map((option) => ({
  ...option,
  className: buyerStatusChipClasses[option.value],
}));
const buyerUrgencyChipOptions: ChipOption[] = urgencyOptions.map((option) => ({
  ...option,
  className: buyerUrgencyChipClasses[option.value],
}));
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
    label: "요건상태",
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
    label: "공급평형",
    type: "numberRange",
    operators: ["between"],
    unit: "평",
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
  { field: "customer", label: "고객명" },
  { field: "intentCount", label: "희망조건 수" },
  { field: "budgetMin", label: "최소예산" },
  { field: "budgetMax", label: "최대예산" },
  { field: "monthlyRentMin", label: "최소월세" },
  { field: "monthlyRentMax", label: "최대월세" },
  { field: "areaMin", label: "최소평형" },
  { field: "areaMax", label: "최대평형" },
  { field: "matches", label: "매칭 수" },
  { field: "createdAt", label: "접수일" },
  { field: "nextContactDate", label: "다음 연락일" },
  { field: "urgency", label: "긴급도" },
];

const SERVER_SORT_FIELDS = new Set(["createdAt"]);
const INTENT_LINE_HEIGHT = 36;
const CONTEXT_COLUMN_IDS = [
  "intentCount",
  "budgetMin",
  "budgetMax",
  "monthlyRentMin",
  "monthlyRentMax",
  "areaMin",
  "areaMax",
] as const;

/* ── 구매 의뢰 생명주기 프리셋 ── */

type PresetId = "all" | "open" | "hold" | "closed";

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "open", label: "진행" },
  { id: "hold", label: "보류" },
  { id: "closed", label: "종료" },
];

const BUYER_PARTICIPANT_ROLE_LABELS: Record<string, string> = {
  buyer: "매수자",
  co_buyer: "공동매수",
  representative: "대리",
  supporter: "지원",
  advisor: "자문",
  other: "참여",
};

function BuyerBudgetBoundaryCell({
  requirement,
  boundary,
}: {
  requirement: BuyerRequirement;
  boundary: BuyerLedgerBoundary;
}) {
  const text = formatMoney(buyerBudgetBoundaryValue(requirement, boundary));
  if (text === "—") return <TextCell value="-" muted />;
  return (
    <span
      className="block w-full truncate whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-foreground"
      title={text}
    >
      {text}
    </span>
  );
}

function BuyerAreaBoundaryCell({
  requirement,
  boundary,
}: {
  requirement: BuyerRequirement;
  boundary: BuyerLedgerBoundary;
}) {
  const area = boundary === "min" ? requirement.areaMin : requirement.areaMax;

  return (
    <span className="truncate text-[12px] font-medium tabular-nums text-slate-700">
      {formatSupplyPyeong(area) || "—"}
    </span>
  );
}

function BuyerMonthlyRentBoundaryCell({
  requirement,
  boundary,
}: {
  requirement: BuyerRequirement;
  boundary: BuyerLedgerBoundary;
}) {
  const amount =
    boundary === "min"
      ? requirement.monthlyRentMin
      : requirement.monthlyRentMax;
  const text =
    requirement.transactionType === "monthly" ? formatMoney(amount) : "—";
  if (text === "—") return <TextCell value="-" muted />;

  return (
    <span
      className="block w-full truncate whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-foreground"
      title={text}
    >
      {text}
    </span>
  );
}

type BuyerInlineField = "status" | "urgency";

function BuyerInlineSelectCell({
  requirement,
  field,
  isSaving,
  onSave,
}: {
  requirement: BuyerRequirement;
  field: BuyerInlineField;
  isSaving: boolean;
  onSave: (value: string) => void;
}) {
  const isStatus = field === "status";
  const value = isStatus
    ? (normalizeBuyerStatus(requirement.status) ?? requirement.status)
    : requirement.urgency;
  const kind = isStatus ? "buyerStatus" : "buyerUrgency";
  const options = isStatus ? buyerStatusChipOptions : buyerUrgencyChipOptions;

  return (
    <div
      className={cn(
        "-mx-2.5 flex h-full items-stretch overflow-visible",
        isSaving && "pointer-events-none opacity-60",
      )}
      aria-busy={isSaving || undefined}
      title={isStatus ? "상태 변경" : "긴급도 변경"}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <EditableCell
        recordId={requirement.id}
        field={field}
        value={value}
        chipValueOf={(currentValue) => String(currentValue ?? "")}
        onSave={(_recordId, _field, nextValue) => onSave(String(nextValue))}
        editType="select-chip"
        chipOptions={options}
      >
        <span className="flex h-full w-full items-center px-2.5">
          <StatusBadge kind={kind} status={value} size="table" />
        </span>
      </EditableCell>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/buyer-requirements/")({
  component: BuyerRequirementsPage,
});

function BuyerRequirementsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<PresetId>("all");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: "createdAt", label: "접수일", direction: "desc" },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // 연락함 기록 (행 빠른 액션)
  const [contactLogTarget, setContactLogTarget] =
    useState<BuyerRequirement | null>(null);

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
    const requestedSort = activeSorts[0]?.field ?? "createdAt";
    const serverSort = SERVER_SORT_FIELDS.has(requestedSort)
      ? requestedSort
      : "createdAt";
    const serverSortOrder =
      serverSort === requestedSort
        ? (activeSorts[0]?.direction ?? "desc")
        : "desc";
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit: 20,
      sortBy: serverSort,
      sortOrder: serverSortOrder,
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
      // 구매 의뢰 상태는 이전 matched/inactive 데이터도 새 생명주기에 포함한다.
      if (
        filter.field === "status" &&
        filter.operator === "in" &&
        filter.values?.length
      ) {
        params.status = filter.values
          .flatMap((value) => {
            if (value === "active") return ["active", "matched"];
            if (value === "hold") return ["hold", "inactive"];
            return [value];
          })
          .join(",");
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
          if (filter.valueMin) params.monthlyRentMin = Number(filter.valueMin);
          if (filter.valueMax) params.monthlyRentMax = Number(filter.valueMax);
        } else if (base === "area") {
          if (filter.valueMin)
            params.areaMin = pyeongToSqm(Number(filter.valueMin));
          if (filter.valueMax)
            params.areaMax = pyeongToSqm(Number(filter.valueMax));
        } else {
          if (filter.valueMin) params[`${base}Min`] = Number(filter.valueMin);
          if (filter.valueMax) params[`${base}Max`] = Number(filter.valueMax);
        }
        continue;
      }
      // legacy single-value
      params[filter.field] = filter.value;
    }
    // 상단 프리셋은 BuyerIntake 전체 생명주기, 상태 필터는 개별 요건 상태다.
    if (preset !== "all") params.lifecycleStatus = preset;
    return params;
  }, [page, activeFilters, activeSorts, query, preset]);

  useEffect(() => {
    setSelectedGroupIds([]);
  }, [apiParams]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["buyer-intakes", apiParams],
    queryFn: () => api.buyerIntakes.findAll(apiParams as any),
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: ({
      id,
      field,
      value,
    }: {
      id: string;
      field: BuyerInlineField;
      value: string;
    }) =>
      field === "status"
        ? api.buyerRequirements.updateStatus(
            id,
            value as BuyerRequirementStatus,
          )
        : api.buyerRequirements.update(id, { urgency: value }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["buyer-requirements"] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["buyer-intakes"] });
      void queryClient.invalidateQueries({
        queryKey: ["buyer-requirements"],
      });
    },
    onError: (_error, variables) => {
      toast.error(
        variables.field === "status"
          ? "상태 변경에 실패했습니다."
          : "긴급도 변경에 실패했습니다.",
      );
    },
  });

  const filteredIntakes = data?.items ?? [];
  const groupedItems = useMemo(
    () =>
      sortBuyerRequirementGroups(
        buyerIntakesToGroups(filteredIntakes),
        sorting,
      ),
    [filteredIntakes, sorting],
  );
  const handleSortAdd = useCallback((sort: SortDefinition) => {
    setActiveSorts([sort]);
    setSorting([{ id: sort.field, desc: sort.direction === "desc" }]);
    setPage(1);
  }, []);

  const handleFiltersReset = useCallback(() => {
    setQuery("");
    setPreset("all");
    setActiveFilters([]);
    setActiveSorts([
      { field: "createdAt", label: "접수일", direction: "desc" },
    ]);
    setSorting([{ id: "createdAt", desc: true }]);
    setPage(1);
  }, []);

  const handlePresetChange = useCallback((value: string) => {
    setPreset(value as PresetId);
    setPage(1);
  }, []);

  const handleFilterAdd = useCallback((filter: ActiveFilter) => {
    setActiveFilters((previous) => [
      ...previous.filter((item) => item.field !== filter.field),
      filter,
    ]);
    setPage(1);
  }, []);

  const openDetail = useCallback(
    (row: BuyerRequirement) => {
      navigate({ to: "/buyer-requirements/$id", params: { id: row.id } });
    },
    [navigate],
  );

  const handleInlineFieldSave = useCallback(
    (requirement: BuyerRequirement, field: BuyerInlineField, value: string) => {
      const currentValue =
        field === "status"
          ? (normalizeBuyerStatus(requirement.status) ?? requirement.status)
          : requirement.urgency;
      if (currentValue === value) return;
      inlineUpdateMutation.mutate({ id: requirement.id, field, value });
    },
    [inlineUpdateMutation],
  );

  // 고객은 한 행으로 묶고, 각 구함 요건은 비교 행 + 선호 조건 행의 2단 구조로 표시한다.
  const columns = useMemo<ColumnDef<BuyerRequirementGroup, unknown>[]>(
    () => [
      {
        id: "customer",
        accessorFn: (group) => group.primaryParticipant?.contact?.name ?? "",
        header: () => (
          <BuyerHeaderLabel
            icon={<UserRound className="size-3.5" />}
            label="구매 의뢰"
          />
        ),
        size: 178,
        minSize: 164,
        enableSorting: true,
        cell: ({ row }) => <BuyerGroupCustomerCell group={row.original} />,
      },
      {
        id: "phone",
        accessorFn: (group) => group.primaryParticipant?.contact?.phone ?? "",
        header: () => (
          <BuyerHeaderLabel
            icon={<Phone className="size-3.5" />}
            label="전화번호"
          />
        ),
        size: 126,
        enableSorting: false,
        cell: ({ row }) => {
          const participant = row.original.primaryParticipant;
          const phone = participant?.contact?.phone;
          if (!phone)
            return <span className="text-[13px] text-muted-foreground">—</span>;
          return (
            <div className="min-w-0">
              <span className="block truncate text-[13px] tabular-nums text-slate-700">
                {formatPhone(phone)}
              </span>
              <span className="block truncate text-[10.5px] text-muted-foreground">
                주 연락 ·{" "}
                {BUYER_PARTICIPANT_ROLE_LABELS[participant.role] ??
                  participant.role}
              </span>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => (
          <span className="text-[12px] font-normal text-muted-foreground">
            작업
          </span>
        ),
        size: 48,
        minSize: 48,
        maxSize: 48,
        enableResizing: false,
        enableSorting: false,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => {
          const name =
            row.original.primaryParticipant?.contact?.name ?? "구매 의뢰";
          return (
            <BuyerIntentLinesCell group={row.original}>
              {(requirement, index) => (
                <BuyerRequirementActionMenu
                  label={`${name} 구함 ${index + 1}`}
                  onOpen={() => openDetail(requirement)}
                  onContact={() => setContactLogTarget(requirement)}
                  onEdit={() =>
                    navigate({
                      to: "/buyer-requirements/$id/edit",
                      params: { id: requirement.id },
                    })
                  }
                />
              )}
            </BuyerIntentLinesCell>
          );
        },
      },
      {
        id: "intentCount",
        accessorFn: (group) => group.requirements.length,
        header: () => (
          <BuyerHeaderLabel
            icon={<Tag className="size-3.5" />}
            label="희망조건"
          />
        ),
        size: 146,
        minSize: 132,
        enableSorting: true,
        meta: { cellClassName: "px-0 overflow-visible" },
        cell: ({ row, table }) => (
          <BuyerIntentLinesCell
            group={row.original}
            mergedWidth={CONTEXT_COLUMN_IDS.reduce(
              (width, id) => width + (table.getColumn(id)?.getSize() ?? 0),
              0,
            )}
          >
            {(requirement, index) => (
              <BuyerIntentSummary requirement={requirement} index={index} />
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "budgetMin",
        accessorFn: (group) =>
          group.requirements[0]
            ? buyerBudgetBoundaryValue(group.requirements[0], "min")
            : null,
        header: () => <BuyerHeaderLabel label="최소예산" />,
        size: 82,
        minSize: 74,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => (
              <BuyerBudgetBoundaryCell
                requirement={requirement}
                boundary="min"
              />
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "budgetMax",
        accessorFn: (group) =>
          group.requirements[0]
            ? buyerBudgetBoundaryValue(group.requirements[0], "max")
            : null,
        header: () => <BuyerHeaderLabel label="최대예산" />,
        size: 82,
        minSize: 74,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => (
              <BuyerBudgetBoundaryCell
                requirement={requirement}
                boundary="max"
              />
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "monthlyRentMin",
        accessorFn: (group) => group.requirements[0]?.monthlyRentMin ?? null,
        header: () => <BuyerHeaderLabel label="최소월세" />,
        size: 76,
        minSize: 70,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => (
              <BuyerMonthlyRentBoundaryCell
                requirement={requirement}
                boundary="min"
              />
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "monthlyRentMax",
        accessorFn: (group) => group.requirements[0]?.monthlyRentMax ?? null,
        header: () => <BuyerHeaderLabel label="최대월세" />,
        size: 76,
        minSize: 70,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => (
              <BuyerMonthlyRentBoundaryCell
                requirement={requirement}
                boundary="max"
              />
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "areaMin",
        accessorFn: (group) => group.requirements[0]?.areaMin ?? null,
        header: () => <BuyerHeaderLabel label="최소평형" />,
        size: 78,
        minSize: 72,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => (
              <BuyerAreaBoundaryCell requirement={requirement} boundary="min" />
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "areaMax",
        accessorFn: (group) => group.requirements[0]?.areaMax ?? null,
        header: () => <BuyerHeaderLabel label="최대평형" />,
        size: 78,
        minSize: 72,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => (
              <BuyerAreaBoundaryCell requirement={requirement} boundary="max" />
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "matches",
        accessorFn: (group) =>
          group.requirements.reduce(
            (total, requirement) => total + (requirement._count?.matches ?? 0),
            0,
          ),
        header: () => (
          <BuyerHeaderLabel
            icon={<GitBranch className="size-3.5" />}
            label="매칭상태"
          />
        ),
        size: 92,
        minSize: 84,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => <BuyerMatchCell requirement={requirement} />}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "status",
        accessorFn: (group) => group.requirements[0]?.status ?? "",
        header: () => (
          <BuyerHeaderLabel
            icon={<CircleDot className="size-3.5" />}
            label="요건상태"
          />
        ),
        size: 92,
        enableSorting: false,
        meta: { cellClassName: "z-[2] overflow-visible px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => (
              <BuyerInlineSelectCell
                requirement={requirement}
                field="status"
                isSaving={
                  inlineUpdateMutation.isPending &&
                  inlineUpdateMutation.variables?.id === requirement.id &&
                  inlineUpdateMutation.variables.field === "status"
                }
                onSave={(value) =>
                  handleInlineFieldSave(requirement, "status", value)
                }
              />
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "urgency",
        accessorFn: (group) => group.requirements[0]?.urgency ?? "",
        header: () => (
          <BuyerHeaderLabel
            icon={<BadgeAlert className="size-3.5" />}
            label="긴급도"
          />
        ),
        size: 74,
        enableSorting: true,
        meta: { cellClassName: "z-[2] overflow-visible px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => (
              <BuyerInlineSelectCell
                requirement={requirement}
                field="urgency"
                isSaving={
                  inlineUpdateMutation.isPending &&
                  inlineUpdateMutation.variables?.id === requirement.id &&
                  inlineUpdateMutation.variables.field === "urgency"
                }
                onSave={(value) =>
                  handleInlineFieldSave(requirement, "urgency", value)
                }
              />
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "assignedTo",
        accessorFn: (group) => group.requirements[0]?.assignedTo?.name ?? "",
        header: () => (
          <BuyerHeaderLabel
            icon={<UserRound className="size-3.5" />}
            label="담당"
          />
        ),
        size: 76,
        enableSorting: false,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) => (
              <span className="truncate text-[12px] text-slate-600">
                {requirement.assignedTo?.name ?? "—"}
              </span>
            )}
          </BuyerIntentLinesCell>
        ),
      },
      {
        id: "lastContactDate",
        accessorFn: (group) => group.requirements[0]?.lastContactDate ?? "",
        header: () => (
          <BuyerHeaderLabel
            icon={<CalendarDays className="size-3.5" />}
            label="최근 연락"
          />
        ),
        size: 92,
        enableSorting: false,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement) =>
              requirement.lastContactDate ? (
                <span className="text-[12px] tabular-nums text-slate-600">
                  <DateCell value={requirement.lastContactDate} relative />
                </span>
              ) : (
                <span className="text-[12px] text-muted-foreground">—</span>
              )
            }
          </BuyerIntentLinesCell>
        ),
      },
    ],
    [
      openDetail,
      navigate,
      handleInlineFieldSave,
      inlineUpdateMutation.isPending,
      inlineUpdateMutation.variables,
    ],
  );

  const total = data?.pagination?.total ?? 0;
  const hasActiveControls =
    Boolean(query.trim()) ||
    preset !== "all" ||
    activeFilters.length > 0 ||
    activeSorts[0]?.field !== "createdAt" ||
    activeSorts[0]?.direction !== "desc";

  return (
    <CellEditProvider>
      <div
        data-buyer-requirements-page
        className="-mx-4 -mb-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white"
      >
        {/* 1행: 상태 프리셋 + 검색 + 등록 */}
        <section className="shrink-0 border-b border-border bg-white px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Tabs
                value={preset}
                onValueChange={handlePresetChange}
                className="min-w-0 shrink-0 gap-0"
              >
                <TabsList className="max-w-full justify-start border border-border/80 bg-[#f5f4f1] p-0.5">
                  {PRESETS.map((item) => {
                    const isActive = preset === item.id;
                    const count = isActive ? total : null;
                    return (
                      <TabsTrigger
                        key={item.id}
                        value={item.id}
                        className="flex-none border-0 px-3 text-[13px] text-muted-foreground shadow-none data-[state=active]:border data-[state=active]:border-[#d9d9d6] data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
                      >
                        <span>{item.label}</span>
                        {count !== null && (
                          <span className="inline-flex min-w-4 items-center justify-center rounded bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {count.toLocaleString()}
                          </span>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>

              <div className="relative ml-1 min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="이름, 전화번호, 조건 검색"
                  className="h-8 border-transparent bg-[#f7f6f3] pl-8 pr-8 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => {
                      setQuery("");
                      setPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" asChild className="shrink-0 px-3.5">
                <Link to="/buyer-requirements/new">
                  <Plus className="size-3.5" />
                  의뢰 등록
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* 2행: 상세 필터·정렬 (검색은 상단 툴바와 동일 상태 공유) */}
        <section className="shrink-0 overflow-x-auto border-b border-border bg-[#faf9f6]">
          <div className="w-full min-w-max">
            <ViewBar
              search={query}
              onSearchChange={(v) => {
                setQuery(v);
                setPage(1);
              }}
              searchPlaceholder="이름 · 조건 검색"
              filterDefinitions={allFilterDefinitions}
              activeFilters={activeFilters}
              onFilterAdd={handleFilterAdd}
              onFilterRemove={(id) => {
                setActiveFilters((prev) => prev.filter((f) => f.id !== id));
                setPage(1);
              }}
              onFiltersReset={handleFiltersReset}
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
              onSortRemove={() => {
                setActiveSorts([]);
                setSorting([]);
                setPage(1);
              }}
              actions={
                hasActiveControls ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                    onClick={handleFiltersReset}
                  >
                    <RotateCcw className="size-3.5" />
                    초기화
                  </Button>
                ) : null
              }
            />
          </div>
        </section>

        {/* 3행: BuyerIntake 기준 구매 의뢰 목록 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          {isError ? (
            <div className="m-3 flex flex-col items-center gap-3 rounded-lg border border-border bg-white py-16 text-center">
              <p className="text-sm text-muted-foreground">
                목록을 불러오지 못했습니다.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-3.5" />
                다시 시도
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={groupedItems}
              totalCount={data?.pagination?.total ?? 0}
              pageCount={data?.pagination?.totalPages ?? 1}
              page={page}
              onPageChange={setPage}
              pageSize={20}
              sorting={sorting}
              onSortingChange={(nextSorting) => {
                setSorting(nextSorting);
                if (nextSorting.length === 0) {
                  setActiveSorts([]);
                  return;
                }

                const definition = sortDefinitions.find(
                  (item) => item.field === nextSorting[0].id,
                );
                setActiveSorts([
                  {
                    field: nextSorting[0].id,
                    label: definition?.label ?? nextSorting[0].id,
                    direction: nextSorting[0].desc ? "desc" : "asc",
                  },
                ]);
              }}
              variant="notion"
              rowHeight="auto"
              pinnedColumns={["customer", "phone", "actions"]}
              enableRowSelection
              selectedRowIds={selectedGroupIds}
              onRowSelectionChange={setSelectedGroupIds}
              renderBulkActions={(groups) => (
                <BuyerBulkActions
                  selected={groups.flatMap((group) => group.requirements)}
                />
              )}
              isLoading={isLoading}
              emptyMessage={
                query.trim() || activeFilters.length > 0 || preset !== "all"
                  ? "조건에 맞는 구매 의뢰가 없습니다."
                  : '등록된 구매 의뢰가 없습니다. 우측 상단 "의뢰 등록"에서 첫 조건을 추가하세요.'
              }
              renderStatusBar={({ focusedRow, totalCount }) => {
                if (!focusedRow) {
                  const requirementCount = groupedItems.reduce(
                    (count, group) => count + group.requirements.length,
                    0,
                  );
                  return (
                    <span className="tabular-nums">
                      구매 의뢰 {totalCount.toLocaleString()}건 · 현재 페이지
                      요건 {requirementCount.toLocaleString()}개
                    </span>
                  );
                }
                const contact = focusedRow.primaryParticipant?.contact;
                const additionalContacts = Math.max(
                  0,
                  focusedRow.contacts.length - 1,
                );
                const matchCount = focusedRow.requirements.reduce(
                  (count, requirement) =>
                    count + (requirement._count?.matches ?? 0),
                  0,
                );
                return (
                  <>
                    <span className="tabular-nums text-foreground/80">
                      구매 의뢰 {totalCount.toLocaleString()}건
                    </span>
                    <span className="text-border">|</span>
                    <span className="font-medium text-foreground">
                      {contact?.name ?? "—"}
                    </span>
                    {additionalContacts > 0 && (
                      <span className="text-foreground/60">
                        외 {additionalContacts}명
                      </span>
                    )}
                    {contact?.phone && (
                      <span className="tabular-nums text-foreground/70">
                        {formatPhone(contact.phone)}
                      </span>
                    )}
                    <StatusBadge
                      kind="intakeLifecycle"
                      status={focusedRow.lifecycleStatus}
                      size="sm"
                    />
                    <span className="text-border">|</span>
                    <span>희망조건 {focusedRow.requirements.length}개</span>
                    <span>매칭 {matchCount}건</span>
                  </>
                );
              }}
            />
          )}
        </section>

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
    </CellEditProvider>
  );
}

function BuyerIntentLinesCell({
  group,
  mergedWidth,
  children,
}: {
  group: BuyerRequirementGroup;
  mergedWidth?: number;
  children: (requirement: BuyerRequirement, index: number) => ReactNode;
}) {
  return (
    <div
      className="relative -mx-2.5 min-w-0"
      data-buyer-ledger-intent-lines={group.id}
    >
      {group.requirements.map((requirement, index) => (
        <div key={requirement.id} className="relative min-w-0">
          <div
            data-buyer-ledger-intent-line={requirement.id}
            className="flex min-w-0 items-center px-2.5"
            style={{ height: INTENT_LINE_HEIGHT }}
          >
            {children(requirement, index)}
          </div>
          {mergedWidth !== undefined && (
            <div
              data-buyer-ledger-context-cell={requirement.id}
              className="pointer-events-none absolute left-0 z-[4] flex min-w-0 items-center border-r border-[#eeeeec] bg-[#faf9f6] shadow-[inset_0_1px_0_#eeeeec,inset_0_-1px_0_#eeeeec]"
              style={{
                top: INTENT_LINE_HEIGHT,
                width: mergedWidth,
                height: INTENT_LINE_HEIGHT,
              }}
            >
              <BuyerPreferenceContext requirement={requirement} />
            </div>
          )}
          <div
            aria-hidden="true"
            data-buyer-ledger-context-slot={requirement.id}
            className="bg-[#faf9f6] shadow-[inset_0_1px_0_#eeeeec,inset_0_-1px_0_#eeeeec]"
            style={{ height: INTENT_LINE_HEIGHT }}
          />
        </div>
      ))}
    </div>
  );
}

function BuyerPreferenceContext({
  requirement,
}: {
  requirement: BuyerRequirement;
}) {
  const regions = [...new Set(regionLabels(requirement))];
  const sites = [...new Set(siteLabels(requirement))];
  const locationParts = [
    regions.length ? `지역 ${regions.join(" · ")}` : "",
    sites.length ? `단지 ${sites.join(" · ")}` : "",
  ].filter(Boolean);
  const locationText = locationParts.join("  ·  ") || "지역·단지 미지정";
  const typeText = siteTypeSummary(requirement);
  const moveInText = requirement.moveInDate
    ? `입주 ${formatDate(requirement.moveInDate)}`
    : "";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[11.5px] text-slate-600">
      <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
      <span className="shrink-0 font-semibold text-blue-700">선호</span>
      <span className="min-w-0 flex-1 truncate" title={locationText}>
        {locationText}
      </span>
      {typeText !== "—" && (
        <>
          <span className="h-3 w-px shrink-0 bg-[#dededb]" />
          <span className="max-w-40 shrink truncate" title={typeText}>
            유형 {typeText}
          </span>
        </>
      )}
      {moveInText && (
        <>
          <span className="h-3 w-px shrink-0 bg-[#dededb]" />
          <span className="shrink-0 tabular-nums">{moveInText}</span>
        </>
      )}
    </div>
  );
}

function BuyerGroupCustomerCell({ group }: { group: BuyerRequirementGroup }) {
  const primary = group.primaryParticipant;
  if (!primary?.contact)
    return <span className="text-[13px] text-muted-foreground">—</span>;
  const contact = primary.contact;
  const otherParticipants = group.contacts.filter(
    (participant) => participant.contactId !== primary.contactId,
  );
  const otherParticipantText = otherParticipants
    .map((participant) => {
      const role =
        BUYER_PARTICIPANT_ROLE_LABELS[participant.role] ?? participant.role;
      return `${role} ${participant.contact?.name ?? "이름 없음"}`;
    })
    .join(" · ");

  return (
    <div
      className="flex min-w-0 items-start gap-2 py-1"
      data-buyer-intake-cell={group.buyerIntakeId}
      title={group.memo || undefined}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f2f1ed] text-[11px] font-semibold text-slate-600">
        {contact.name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            to="/contacts/$id"
            params={{ id: contact.id }}
            onClick={(event) => event.stopPropagation()}
            className="min-w-0 truncate text-[13px] font-semibold text-foreground hover:underline"
          >
            {contact.name}
          </Link>
          <StatusBadge
            kind="intakeLifecycle"
            status={group.lifecycleStatus}
            size="sm"
          />
        </div>
        <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
          <span className="font-medium text-slate-600">주 연락</span>
          <span className="px-1 text-border">·</span>
          <span>
            {BUYER_PARTICIPANT_ROLE_LABELS[primary.role] ?? primary.role}
          </span>
          <span className="px-1 text-border">·</span>
          <span className="tabular-nums">요건 {group.requirements.length}</span>
        </div>
        {otherParticipants.length > 0 && (
          <div
            className="mt-0.5 truncate text-[10.5px] text-slate-500"
            data-buyer-intake-participants={group.buyerIntakeId}
            title={otherParticipantText}
          >
            함께 {otherParticipantText}
          </div>
        )}
      </div>
    </div>
  );
}

function BuyerIntentSummary({
  requirement,
  index,
}: {
  requirement: BuyerRequirement;
  index: number;
}) {
  const priorityRank = requirement.priorityRank || index + 1;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
      <span
        className="shrink-0 text-[12px] font-semibold text-blue-700"
        data-buyer-priority-rank={priorityRank}
        title={`${priorityRank}순위 희망조건`}
      >
        구함 {priorityRank}
      </span>
      {requirement.transactionType ? (
        <StatusBadge
          kind="transactionType"
          status={requirement.transactionType}
          size="table"
        />
      ) : (
        <span className="text-[12px] text-muted-foreground">—</span>
      )}
    </div>
  );
}

function BuyerMatchCell({ requirement }: { requirement: BuyerRequirement }) {
  const count = requirement._count?.matches ?? 0;
  if (!count)
    return <span className="text-[12px] text-muted-foreground">—</span>;

  return (
    <span className="inline-flex h-5 items-center gap-1 rounded bg-blue-50 px-1.5 text-[11px] font-semibold tabular-nums text-blue-700">
      <GitBranch className="size-3" />
      매칭 {count}건
    </span>
  );
}

function BuyerRequirementActionMenu({
  label,
  onOpen,
  onContact,
  onEdit,
}: {
  label: string;
  onOpen: () => void;
  onContact: () => void;
  onEdit: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${label} 작업 메뉴`}
          title="요건 작업 메뉴"
          className="mx-auto text-[#627d98] hover:bg-[#eef1f3] hover:text-slate-900 data-[state=open]:bg-[#eef1f3] data-[state=open]:text-slate-900"
          onClick={(event) => event.stopPropagation()}
        >
          <EllipsisVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-40"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onClick={onOpen}>
          <SquareArrowOutUpRight className="size-3.5" />
          상세 열기
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onContact}>
          <PhoneCall className="size-3.5" />
          연락함 기록
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-3.5" />
          조건 수정
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BuyerHeaderLabel({
  icon,
  label,
}: {
  icon?: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal text-muted-foreground">
      {icon && (
        <span className="shrink-0 [&>svg]:size-3.5 [&>svg]:text-muted-foreground/70">
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
