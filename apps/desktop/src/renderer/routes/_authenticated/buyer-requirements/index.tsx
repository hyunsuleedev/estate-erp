import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { SortingState } from "@tanstack/react-table";
import { Plus, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  BuyerRequirement,
  BuyerRequirementStatus,
} from "@estate-erp/api-client";
import { pyeongToSqm } from "@estate-erp/shared";
import { formatPhone } from "@/lib/format";
import { normalizeBuyerStatus } from "@/lib/status-config";
import { StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DataTable,
  CellEditProvider,
  ViewBar,
  type FilterDefinition,
  type ActiveFilter,
  type SortDefinition,
} from "@/components/data-table";
import { ContactLogDialog } from "./-contact-log-dialog";
import { BuyerBulkActions, BuyerDensityToggle } from "./-buyer-list-panels";
import {
  buyerIntakesToGroups,
  sortBuyerRequirementGroups,
} from "./-buyer-ledger";
import {
  PRESETS,
  SERVER_SORT_FIELDS,
  staticFilterDefinitions,
  sortDefinitions,
  type PresetId,
} from "./-buyer-list-filters";
import { buildBuyerLedgerColumns } from "./-buyer-ledger-columns";
import type { BuyerInlineField } from "./-buyer-ledger-cells";

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
  // 월세는 월세 요건에만 값이 있다 — 거래유형 필터가 월세를 포함하지 않으면
  // 대부분 빈 칸이 되는 월세 컬럼을 통째로 숨긴다.
  const transactionTypeFilter = activeFilters.find(
    (filter) => filter.field === "transactionType",
  );
  const showRentColumn =
    !transactionTypeFilter?.values?.length ||
    transactionTypeFilter.values.includes("monthly");

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

  const openEdit = useCallback(
    (requirement: BuyerRequirement) => {
      navigate({
        to: "/buyer-requirements/$id/edit",
        params: { id: requirement.id },
      });
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

  const isInlineFieldSaving = useCallback(
    (requirementId: string, field: BuyerInlineField) =>
      inlineUpdateMutation.isPending &&
      inlineUpdateMutation.variables?.id === requirementId &&
      inlineUpdateMutation.variables.field === field,
    [inlineUpdateMutation.isPending, inlineUpdateMutation.variables],
  );

  // 고객은 한 행으로 묶고, 각 구함 요건은 비교 행 + 선호 조건 행의 2단 구조로 표시한다.
  const columns = useMemo(
    () =>
      buildBuyerLedgerColumns({
        showRent: showRentColumn,
        onOpenDetail: openDetail,
        onContactLog: setContactLogTarget,
        onEdit: openEdit,
        isInlineFieldSaving,
        onInlineFieldSave: handleInlineFieldSave,
      }),
    [
      showRentColumn,
      openDetail,
      openEdit,
      isInlineFieldSaving,
      handleInlineFieldSave,
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
        className="-m-4 flex min-h-0 flex-1 flex-col bg-white"
      >
        {/* 1행: 상태 프리셋 + 검색 + 보기 방식 + 등록 */}
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
              <BuyerDensityToggle />
              <Button size="sm" asChild className="shrink-0 px-3.5">
                <Link to="/buyer-requirements/new">
                  <Plus className="size-3.5" />
                  의뢰 등록
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* 2행: 상세 필터·정렬 */}
        <section className="shrink-0 overflow-x-auto border-b border-border bg-[#faf9f6]">
          <div className="w-full min-w-max">
            <ViewBar
              variant="workbench"
              showSearch={false}
              showActiveChips={false}
              filterDefinitions={allFilterDefinitions}
              activeFilters={activeFilters}
              onFilterAdd={handleFilterAdd}
              onFilterRemove={(id) => {
                setActiveFilters((prev) => prev.filter((f) => f.id !== id));
                setPage(1);
              }}
              onFiltersReset={handleFiltersReset}
              inlineFilterGroups={[
                ["preferredRegions", "preferredSites", "transactionType"],
                ["status", "urgency"],
                ["price", "area"],
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
              pinnedColumns={["customer", "actions"]}
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
