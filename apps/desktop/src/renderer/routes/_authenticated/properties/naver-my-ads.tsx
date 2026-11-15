import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SortingState } from "@tanstack/react-table";
import {
  CircleAlert,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { type MultiSelectOption } from "@/components/ui/multi-select";
import {
  initialMyAdsFilters,
  viewTabs,
  type AdvertisementActionDraft,
  type InlinePriceEdit,
  type MyAdsFilterState,
  type MyAdsView,
} from "./-my-ads/my-ads-types";
import { getCanonicalLocation, getErrorMessage } from "./-my-ads/my-ads-format";
import {
  advertisementMatchesFilters,
  advertisementMatchesView,
  hasMyAdsNarrowingConditions,
  myAdsTableFilterScopeKey,
} from "./-my-ads/my-ads-filters";
import { sortAdvertisements } from "./-my-ads/my-ads-sort";
import {
  buildAdvertisementTaskContent,
  createActionDraft,
  inlineEditBase,
  isInlineEditDirty,
  validateActionDrafts,
} from "./-my-ads/my-ads-drafts";
import { buildColumns } from "./-my-ads/my-ads-columns";
import {
  loadAllAdvertisementPages,
  MY_ADS_MAX_PAGES,
  MY_ADS_PAGE_LIMIT,
} from "./-my-ads/my-ads-load";
import {
  advertisementLocationLabel,
  myAdsAnalysisPanelId,
} from "./-my-ads/my-ads-location";
import {
  myAdsSortToSorting,
  normalizeMyAdsColumnWidths,
  sortingToMyAdsSort,
} from "./-my-ads/my-ads-table-state";
import { useMyAdsTablePreferences } from "./-my-ads/use-my-ads-table-preferences";
import { AdvertisementAnalysisPanel } from "./-my-ads/my-ads-analysis-panel";
import { AdvertisementActionDialog } from "./-my-ads/my-ads-action-dialog";
import { MyAdsToolbar } from "./-my-ads/my-ads-toolbar";
import {
  countAdvertisementsBySource,
  isManualAdvertisement,
  myAdsSelectionHint,
} from "./-my-ads/my-ads-manual-ad-state";
import {
  MyAdsTableStateContext,
  type MyAdsTableRowState,
} from "./-my-ads/my-ads-table-context";
import {
  myAdsExpandScrollAdjustment,
  nextMyAdsExpandedIds,
} from "./-my-ads/my-ads-expansion";
import { estimateMyAdsAnalysisPanelHeight } from "./-my-ads/my-ads-analysis-summary";
import {
  MyAdsManualAdDialog,
  type ManualAdDialogSession,
  type ManualAdDialogTarget,
} from "./-my-ads/my-ads-manual-ad-dialog";

export const Route = createFileRoute("/_authenticated/properties/naver-my-ads")(
  {
    component: NaverMyAdsPage,
  },
);

/** 검색어를 글자마다 서버에 보내지 않는다. 멈춘 뒤 이만큼 기다렸다가 보낸다. */
const SEARCH_DEBOUNCE_MS = 250;
/**
 * 펼친 네이버 비교 패널의 첫 추정 높이(펼친 광고가 없을 때). 펼친 광고가 있으면 비교 표 줄 수로
 * 다시 추정하고(estimateMyAdsAnalysisPanelHeight), 실제 높이는 그린 뒤 잰다.
 */
const ANALYSIS_PANEL_ESTIMATED_HEIGHT = 336;

/** 펼침 버튼을 누른 순간의 행 위치. 펼침이 바뀐 뒤 그 행이 같은 화면 위치에 남도록 스크롤을 맞춘다. */
type ExpandScrollAnchor = {
  advertisementId: string;
  scroller: HTMLElement;
  rowTop: number;
  /** 누른 행보다 위에 펼쳐 있어 이번에 닫힐 패널들의 높이 */
  collapsedHeightAbove: number;
};

function captureExpandScrollAnchor(
  advertisementId: string,
  anchor: HTMLElement,
): ExpandScrollAnchor | null {
  const row = anchor.closest("tr");
  const scroller = row?.closest("table")?.parentElement;
  if (!row || !scroller) return null;
  let collapsedHeightAbove = 0;
  for (const panelRow of Array.from(
    scroller.querySelectorAll("tbody > tr[data-table-expanded-row]"),
  )) {
    if (
      panelRow.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      collapsedHeightAbove += panelRow.getBoundingClientRect().height;
    }
  }
  return {
    advertisementId,
    scroller,
    rowTop: row.getBoundingClientRect().top,
    collapsedHeightAbove,
  };
}

function NaverMyAdsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { preferences, updatePreferences } = useMyAdsTablePreferences(
    user?.office?.id ?? "local",
    user?.id ?? "guest",
  );
  const [view, setView] = useState<MyAdsView>("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<MyAdsFilterState>(initialMyAdsFilters);
  const sorting = useMemo(
    () => myAdsSortToSorting(preferences.sort),
    [preferences.sort],
  );
  const [
    areAdvertisementSourceColumnsCollapsed,
    setAreAdvertisementSourceColumnsCollapsed,
  ] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionDrafts, setActionDrafts] = useState<AdvertisementActionDraft[]>(
    [],
  );
  const [actionRationale, setActionRationale] = useState("");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  /**
   * 인라인 편집 상태 — 선택한 행의 광고가를 표에서 바로 고친다.
   * 값은 광고 id 별로 들고 있으며, 원래 값과 다른 항목만 수정안으로 제출한다.
   * (다이얼로그를 열지 않고도 랭킹·경쟁 최저가를 같은 줄에서 보며 판단)
   */
  const [inlineEdits, setInlineEdits] = useState<
    Record<string, InlinePriceEdit>
  >({});
  /** 표의 선택은 이 값만 따른다(제어형) — 화면과 표가 서로 다른 선택을 들고 있지 않게. */
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [isSiteFilterOpen, setIsSiteFilterOpen] = useState(false);
  /**
   * 광고 수동입력(새 광고 등록 · 수동 광고 수정). 닫혀도 마지막 세션을 들고 있어
   * 닫히는 동안 내용이 비지 않고, 다시 열면 id가 바뀌어 입력이 처음부터 시작된다.
   */
  const [manualAdSession, setManualAdSession] =
    useState<ManualAdDialogSession | null>(null);
  const [isManualAdOpen, setIsManualAdOpen] = useState(false);
  const manualAdSessionCount = useRef(0);
  const manualAdOpener = useRef<HTMLElement | null>(null);
  const registerAdButtonRef = useRef<HTMLButtonElement>(null);

  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["listing-advertisements", "my-ads", debouncedSearch],
    // 서버는 한 번에 100건까지만 준다. 전체 건수까지 모든 쪽을 이어 받는다.
    queryFn: () =>
      loadAllAdvertisementPages((page) =>
        api.listingAdvertisements.findAll({
          search: debouncedSearch || undefined,
          status: "active",
          page,
          limit: MY_ADS_PAGE_LIMIT,
          sortBy: "updatedAt",
          sortOrder: "desc",
        }),
      ),
    // 검색어가 바뀌어 새로 받는 동안 이전 결과를 그대로 보여 준다(스켈레톤 깜빡임 방지).
    placeholderData: keepPreviousData,
  });
  const advertisements = useMemo(() => data?.items ?? [], [data]);
  const totalAdvertisementCount = data?.total ?? 0;
  const isPartiallyLoaded = data
    ? data.truncated || data.items.length < data.total
    : false;
  const siteFilterOptions = useMemo<MultiSelectOption[]>(() => {
    const sites = new Map<
      string,
      {
        label: string;
        description: string | undefined;
        advertisementCount: number;
      }
    >();
    for (const advertisement of advertisements) {
      const site = advertisement.listing?.property?.site;
      if (!site) continue;
      const current = sites.get(site.id);
      sites.set(site.id, {
        label: site.name,
        description: site.roadAddress ?? site.jibunAddress ?? undefined,
        advertisementCount: (current?.advertisementCount ?? 0) + 1,
      });
    }
    return [...sites.entries()]
      .map(([value, site]) => ({
        value,
        label: site.label,
        description: site.description,
        meta: `${site.advertisementCount.toLocaleString()}건`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "ko"));
  }, [advertisements]);
  const filterScopedAdvertisements = useMemo(
    () =>
      advertisements.filter((advertisement) =>
        advertisementMatchesFilters(advertisement, filters),
      ),
    [advertisements, filters],
  );
  const filteredAdvertisements = useMemo(
    () =>
      filterScopedAdvertisements.filter((advertisement) =>
        advertisementMatchesView(advertisement, view),
      ),
    [filterScopedAdvertisements, view],
  );
  /** 화면에 보이는 광고 전체 — 페이지를 나누지 않고 한 목록으로 스크롤한다. */
  const sortedAdvertisements = useMemo(
    () => sortAdvertisements(filteredAdvertisements, sorting),
    [filteredAdvertisements, sorting],
  );
  const sourceCounts = useMemo(
    () => countAdvertisementsBySource(filterScopedAdvertisements),
    [filterScopedAdvertisements],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        viewTabs.map((tab) => [
          tab.value,
          filterScopedAdvertisements.filter((advertisement) =>
            advertisementMatchesView(advertisement, tab.value),
          ).length,
        ]),
      ) as Record<MyAdsView, number>,
    [filterScopedAdvertisements],
  );

  // 목록에서 사라진 광고의 선택·펼침은 지운다. 남겨 두면 보이지 않는 행이 선택되어
  // 있거나, 펼친 행이 없는데도 가상 스크롤이 꺼질 수 있다.
  useEffect(() => {
    const visibleIds = new Set(
      sortedAdvertisements.map((advertisement) => advertisement.id),
    );
    setSelectedRowIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
    setExpandedIds((current) => {
      if ([...current].every((id) => visibleIds.has(id))) return current;
      return new Set([...current].filter((id) => visibleIds.has(id)));
    });
  }, [sortedAdvertisements]);

  const actionMutation = useMutation({
    mutationFn: async ({
      drafts,
      rationale,
    }: {
      drafts: AdvertisementActionDraft[];
      rationale: string;
    }) => {
      if (drafts.length === 0) throw new Error("광고를 선택해 주세요.");
      const firstLocation = getCanonicalLocation(drafts[0].advertisement);
      const title =
        drafts.length === 1
          ? `${firstLocation.site} 광고 작업`
          : `${firstLocation.site} 외 ${drafts.length - 1}건 광고 작업`;
      const task = await api.tasks.create({
        title,
        content: buildAdvertisementTaskContent(rationale, drafts),
        source: "manual",
        status: "pending",
        priority: "medium",
        category: "advertisement",
        listingId:
          drafts.length === 1 ? drafts[0].advertisement.listingId : undefined,
      });
      return {
        task,
        advertisementIds: drafts.map((draft) => draft.advertisement.id),
      };
    },
    onSuccess: ({ advertisementIds }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      const submittedAdvertisementIds = new Set(advertisementIds);
      setActionDialogOpen(false);
      setActionDrafts([]);
      setActionRationale("");
      setInlineEdits((current) => {
        const next = { ...current };
        for (const advertisementId of submittedAdvertisementIds) {
          delete next[advertisementId];
        }
        return next;
      });
      setSelectedRowIds([]);
      toast.success("광고 작업을 업무에 등록했습니다.");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openManualAdDialog = useCallback((target: ManualAdDialogTarget) => {
    // 닫을 때 포커스를 돌려줄 버튼(툴바의 등록, 패널·선택 막대의 편집)
    manualAdOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    manualAdSessionCount.current += 1;
    setManualAdSession({ id: manualAdSessionCount.current, target });
    setIsManualAdOpen(true);
  }, []);

  const openActionEditor = useCallback(
    (rows: ListingAdvertisementWithListing[]) => {
      if (rows.length === 0) {
        toast.error("광고를 선택해 주세요.");
        return;
      }
      // 수동 등록 광고는 CP에 실체가 없어 CP 작업 업무에 넣지 않는다. 한 건이면 바로 고친다.
      const manualRows = rows.filter(isManualAdvertisement);
      const cpRows = rows.filter(
        (advertisement) => !isManualAdvertisement(advertisement),
      );
      if (cpRows.length === 0) {
        if (manualRows.length === 1) {
          openManualAdDialog({ mode: "edit", advertisement: manualRows[0] });
        } else {
          toast.error(
            "수동 등록 광고는 업무 없이 한 건씩 바로 수정합니다. 한 건만 선택해 주세요.",
          );
        }
        return;
      }
      if (manualRows.length > 0) {
        toast.info(
          `수동 등록 광고 ${manualRows.length}건은 CP 작업 업무에서 뺐습니다. 한 건씩 선택해 바로 수정하세요.`,
        );
      }
      // 표에서 이미 고친 값이 있으면 그대로 이어받는다 — 다이얼로그를 열었다고
      // 원래 가격으로 되돌아가면 사용자가 수정한 줄 알고 원가로 제출하게 된다.
      setActionDrafts(
        cpRows.map((advertisement) => {
          const draft = createActionDraft(advertisement);
          const edit = inlineEdits[advertisement.id];
          return edit ? { ...draft, ...edit } : draft;
        }),
      );
      setActionRationale("");
      setActionDialogOpen(true);
    },
    [inlineEdits, openManualAdDialog],
  );

  /**
   * 한 번에 한 행만 펼친다. 위쪽에 펼쳐 둔 패널이 닫히면 누른 행이 그만큼 위로 밀려나므로,
   * 누른 행의 화면 위치를 기억해 두었다가 바뀐 뒤 같은 자리로 스크롤을 맞춘다.
   */
  const expandScrollAnchorRef = useRef<ExpandScrollAnchor | null>(null);
  const toggleExpanded = useCallback((id: string, anchor?: HTMLElement) => {
    expandScrollAnchorRef.current = anchor
      ? captureExpandScrollAnchor(id, anchor)
      : null;
    setExpandedIds((previous) => nextMyAdsExpandedIds(previous, id));
  }, []);
  useLayoutEffect(() => {
    const anchor = expandScrollAnchorRef.current;
    expandScrollAnchorRef.current = null;
    if (!anchor || !anchor.scroller.isConnected) return;
    const row = anchor.scroller
      .querySelector(
        `[data-my-ads-expand-toggle="${CSS.escape(anchor.advertisementId)}"]`,
      )
      ?.closest("tr");
    const adjustment = myAdsExpandScrollAdjustment({
      anchorTopBefore: anchor.rowTop,
      anchorTopAfter: row ? row.getBoundingClientRect().top : null,
      collapsedHeightAbove: anchor.collapsedHeightAbove,
    });
    if (adjustment !== 0) anchor.scroller.scrollTop += adjustment;
  }, [expandedIds]);

  const updateInlineEdit = useCallback(
    (
      advertisement: ListingAdvertisementWithListing,
      patch: Partial<InlinePriceEdit>,
    ) => {
      setInlineEdits((current) => {
        const base = current[advertisement.id] ?? inlineEditBase(advertisement);
        const nextEdit = { ...base, ...patch };
        if (!isInlineEditDirty(advertisement, nextEdit)) {
          if (!(advertisement.id in current)) return current;
          const next = { ...current };
          delete next[advertisement.id];
          return next;
        }
        return { ...current, [advertisement.id]: nextEdit };
      });
    },
    [],
  );

  const resetInlineEdits = useCallback((advertisementIds: string[]) => {
    const resetIds = new Set(advertisementIds);
    setInlineEdits((current) => {
      if (!Object.keys(current).some((id) => resetIds.has(id))) return current;
      const next = { ...current };
      for (const id of resetIds) delete next[id];
      return next;
    });
  }, []);

  // 열 정의는 열 구성(광고 정보 접힘)이 바뀔 때만 새로 만든다. 선택·펼침·인라인 수정값은
  // tableRowState 컨텍스트로 칸에 건넨다 — 열 정의가 바뀌면 모든 칸이 새로 마운트되어
  // 입력 중인 가격 칸이 한 글자마다 닫힌다.
  const columns = useMemo(
    () => buildColumns({ areAdvertisementSourceColumnsCollapsed }),
    [areAdvertisementSourceColumnsCollapsed],
  );
  const resetInlineEdit = useCallback(
    (advertisementId: string) => resetInlineEdits([advertisementId]),
    [resetInlineEdits],
  );
  const selectedIdSet = useMemo(
    () => new Set(selectedRowIds),
    [selectedRowIds],
  );
  const tableRowState = useMemo<MyAdsTableRowState>(
    () => ({
      expandedIds,
      selectedIds: selectedIdSet,
      inlineEdits,
      onToggleExpanded: toggleExpanded,
      onInlineEditChange: updateInlineEdit,
      onInlineEditReset: resetInlineEdit,
    }),
    [
      expandedIds,
      inlineEdits,
      resetInlineEdit,
      selectedIdSet,
      toggleExpanded,
      updateInlineEdit,
    ],
  );
  // 펼친 광고(한 번에 하나)의 비교 표 줄 수로 패널 높이를 미리 짐작한다. 실제 높이는 그린 뒤 잰다.
  const expandedPanelEstimate = useMemo(() => {
    const [expandedId] = expandedIds;
    const expanded = expandedId
      ? sortedAdvertisements.find((advertisement) => advertisement.id === expandedId)
      : undefined;
    return expanded
      ? estimateMyAdsAnalysisPanelHeight(expanded)
      : ANALYSIS_PANEL_ESTIMATED_HEIGHT;
  }, [expandedIds, sortedAdvertisements]);

  /** 보이는 광고를 줄이는 조건이 걸려 있는가 — 빈 목록 문구를 고른다. */
  const hasNarrowingConditions = hasMyAdsNarrowingConditions(
    view,
    search,
    filters,
  );
  /** 초기화 버튼은 정렬도 함께 되돌린다(매물관리와 같다). */
  const hasActiveFilters = hasNarrowingConditions || sorting.length > 0;

  const handleSortingChange = useCallback(
    (next: SortingState) =>
      updatePreferences((current) => ({
        ...current,
        sort: sortingToMyAdsSort(next),
      })),
    [updatePreferences],
  );

  const handleColumnSizingChange = useCallback(
    (sizing: Record<string, number>) =>
      updatePreferences((current) => ({
        ...current,
        widths: normalizeMyAdsColumnWidths(sizing),
      })),
    [updatePreferences],
  );

  const updateMyAdsFilter = useCallback(
    <K extends keyof MyAdsFilterState>(
      field: K,
      value: MyAdsFilterState[K],
    ) => {
      setFilters((current) => ({ ...current, [field]: value }));
      setExpandedIds(new Set());
      setSelectedRowIds([]);
    },
    [],
  );

  const updateMyAdsRangeFilter = useCallback(
    (kind: "primary" | "monthlyRent", minValue: string, maxValue: string) => {
      setFilters((current) =>
        kind === "primary"
          ? {
              ...current,
              primaryAmountMin: minValue,
              primaryAmountMax: maxValue,
            }
          : {
              ...current,
              monthlyRentMin: minValue,
              monthlyRentMax: maxValue,
            },
      );
      setExpandedIds(new Set());
      setSelectedRowIds([]);
    },
    [],
  );

  const handleViewChange = (next: MyAdsView) => {
    setView(next);
    setExpandedIds(new Set());
    setSelectedRowIds([]);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setExpandedIds(new Set());
    setSelectedRowIds([]);
  };

  const handleFiltersReset = () => {
    setView("all");
    setSearch("");
    setFilters({ ...initialMyAdsFilters, siteIds: [] });
    handleSortingChange([]);
    setExpandedIds(new Set());
    setSelectedRowIds([]);
  };

  const updateActionDraft = (
    advertisementId: string,
    patch: Partial<AdvertisementActionDraft>,
  ) => {
    setActionDrafts((current) =>
      current.map((draft) =>
        draft.advertisement.id === advertisementId
          ? { ...draft, ...patch }
          : draft,
      ),
    );
  };

  const submitActionDrafts = () => {
    const validationError = validateActionDrafts(actionDrafts);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    actionMutation.mutate({
      drafts: actionDrafts,
      rationale: actionRationale,
    });
  };

  /** 선택은 편집 모드만 제어한다. 작성한 변경 초안은 명시적으로 취소할 때까지 유지한다. */
  const handleRowSelectionChange = useCallback((ids: string[]) => {
    setSelectedRowIds(ids);
  }, []);

  const draftAdvertisements = useMemo(
    () =>
      advertisements.filter((advertisement) => {
        const edit = inlineEdits[advertisement.id];
        return edit ? isInlineEditDirty(advertisement, edit) : false;
      }),
    [advertisements, inlineEdits],
  );

  const visibleDraftAdvertisements = useMemo(
    () =>
      sortedAdvertisements.filter((advertisement) => {
        const edit = inlineEdits[advertisement.id];
        return edit ? isInlineEditDirty(advertisement, edit) : false;
      }),
    [inlineEdits, sortedAdvertisements],
  );

  /**
   * 원래 값과 실제로 달라진 행만 수정안 대상이다.
   * 지금 화면에 보이고(sortedAdvertisements) 선택된 행으로 한정한다 —
   * 탭·검색·필터가 바뀌어 보이지 않게 된 행의 수정값이 제출에 섞이면
   * 사용자가 확인하지 못한 광고가 변경될 수 있다.
   */
  const dirtyAdvertisements = useMemo(() => {
    const selected = new Set(selectedRowIds);
    return visibleDraftAdvertisements.filter((advertisement) =>
      selected.has(advertisement.id),
    );
  }, [selectedRowIds, visibleDraftAdvertisements]);

  const submitInlineEdits = () => {
    const drafts: AdvertisementActionDraft[] = [];
    for (const advertisement of dirtyAdvertisements) {
      const edit = inlineEdits[advertisement.id];
      if (edit) drafts.push({ advertisement, ...edit });
    }
    if (drafts.length === 0) {
      toast.error("변경된 광고가 없습니다.");
      return;
    }
    const validationError = validateActionDrafts(drafts);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    actionMutation.mutate({ drafts, rationale: "" });
  };

  return (
    <div
      data-canonical-advertisement-source="listing-advertisements"
      className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white"
    >
      <MyAdsToolbar
        view={view}
        // 목록을 받은 적이 없으면(첫 로딩·오류) 0건으로 단정하지 않고 개수를 숨긴다.
        // 다시 받다가 실패하면 React Query가 이전 목록을 들고 있어 이전 개수가 남는다.
        counts={data ? counts : null}
        onViewChange={handleViewChange}
        search={search}
        onSearchChange={handleSearch}
        siteFilterOptions={siteFilterOptions}
        isSiteFilterOpen={isSiteFilterOpen}
        onSiteFilterOpenChange={setIsSiteFilterOpen}
        filters={filters}
        updateMyAdsFilter={updateMyAdsFilter}
        updateMyAdsRangeFilter={updateMyAdsRangeFilter}
        isFetching={isFetching}
        hasActiveFilters={hasActiveFilters}
        onFiltersReset={handleFiltersReset}
        trailingActions={
          // 매물관리 1행 오른쪽 등록 버튼과 같은 모양. 늘 보이며, 줄이 모자라면 검색칸이 먼저 줄고
          // 그래도 1행 폭이 800px보다 좁으면 아이콘만 남는다(이름은 aria-label·title로).
          <Button
            ref={registerAdButtonRef}
            size="sm"
            aria-label="광고 등록"
            title="광고 등록"
            aria-haspopup="dialog"
            className="h-[30px] shrink-0 rounded-[8px] px-3"
            onClick={() => openManualAdDialog({ mode: "create" })}
          >
            <Plus className="size-3.5" />
            <span className="@max-[50rem]:hidden">광고 등록</span>
          </Button>
        }
      />

      <section
        data-my-ads-results
        data-my-ads-table-style="property-list"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        {isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <CircleAlert className="size-6 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              내 광고 목록을 불러오지 못했습니다.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              <RefreshCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : (
          <MyAdsTableStateContext.Provider value={tableRowState}>
            <DataTable
              columns={columns}
              data={sortedAdvertisements}
              layout="full-height"
              variant="notion"
              propertyListTone
              rowHeight={37}
              // 펼친 패널이 100cqw로 표의 보이는 폭을 따라가게 한다(창이 좁아도 패널 오른쪽이 잘리지 않음).
              scrollerContainerQuery
              // 필터·검색·탭이 바뀌면 표를 다시 만들지 않고 맨 위로만 올린다(열 너비 유지).
              scrollResetKey={myAdsTableFilterScopeKey(
                view,
                debouncedSearch,
                filters,
              )}
              columnSizing={preferences.widths}
              onColumnSizingChange={handleColumnSizingChange}
              pinnedColumns={["site", "dong", "floor", "ho"]}
              columnGroupControls={[
                {
                  collapsed: areAdvertisementSourceColumnsCollapsed,
                  onToggle: () =>
                    setAreAdvertisementSourceColumnsCollapsed(
                      (collapsed) => !collapsed,
                    ),
                  anchorColumnId: "monthlyRent",
                  columnIds: [
                    "channel",
                    "naver",
                    "verification",
                    "exposurePeriod",
                  ],
                  label: "광고 정보",
                },
              ]}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              enableRowSelection
              selectedRowIds={selectedRowIds}
              onRowSelectionChange={handleRowSelectionChange}
              getRowSelectionLabel={(advertisement) =>
                `${advertisementLocationLabel(advertisement)} 선택`
              }
              // 매물관리처럼 선택 막대를 표 아래·상태 줄 위에 둔다. 표 위에 끼어들면 행을 체크할 때
              // 표가 36px 내려가 마우스 아래 행이 바뀐다.
              selectionToolbarPlacement="bottom"
              selectionItemLabel="광고"
              renderBulkActions={(selectedRows) => (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11.5px] text-muted-foreground">
                    {dirtyAdvertisements.length > 0
                      ? `변경 초안 ${dirtyAdvertisements.length}건 · 업무 등록 전`
                      : myAdsSelectionHint(selectedRows)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11.5px]"
                    disabled={
                      dirtyAdvertisements.length === 0 ||
                      actionMutation.isPending
                    }
                    onClick={submitInlineEdits}
                  >
                    {actionMutation.isPending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Send className="size-3" />
                    )}
                    {dirtyAdvertisements.length > 0
                      ? `${dirtyAdvertisements.length}건 광고업무`
                      : "광고업무"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11.5px] text-muted-foreground"
                    disabled={dirtyAdvertisements.length === 0}
                    onClick={() =>
                      resetInlineEdits(
                        dirtyAdvertisements.map(
                          (advertisement) => advertisement.id,
                        ),
                      )
                    }
                  >
                    <RotateCcw className="size-3" />
                    변경 취소
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11.5px] text-muted-foreground"
                    onClick={() => openActionEditor(selectedRows)}
                  >
                    <Pencil className="size-3" />
                    상세 편집
                  </Button>
                </div>
              )}
              expandedRowIds={expandedIds}
              estimateExpandedRowHeight={expandedPanelEstimate}
              renderExpandedRow={(advertisement) => (
                <div id={myAdsAnalysisPanelId(advertisement.id)}>
                  <AdvertisementAnalysisPanel
                    advertisement={advertisement}
                    onEditAdvertisement={() => openActionEditor([advertisement])}
                  />
                </div>
              )}
              isLoading={isLoading}
              emptyMessage={
                hasNarrowingConditions
                  ? "조건에 맞는 광고가 없습니다."
                  : "저장된 내 광고가 없습니다. 로컬 CP 읽기 작업 후 목록을 새로고침하거나, 오른쪽 위 '광고 등록'으로 직접 입력해 주세요."
              }
              renderStatusBar={() => (
                <>
                  <span className="tabular-nums">
                    표시 {sortedAdvertisements.length.toLocaleString()} / 전체{" "}
                    {totalAdvertisementCount.toLocaleString()}건
                  </span>
                  {isPartiallyLoaded && data && (
                    <span
                      className="inline-flex items-center gap-1 font-medium text-warning"
                      title={
                        data.truncated
                          ? `한 번에 ${(MY_ADS_MAX_PAGES * MY_ADS_PAGE_LIMIT).toLocaleString()}건까지만 불러옵니다. 검색이나 필터로 범위를 좁혀 주세요.`
                          : "불러오는 동안 목록이 바뀌어 일부가 빠졌을 수 있습니다. 다시 불러와 주세요."
                      }
                    >
                      <CircleAlert className="size-3" />
                      {data.truncated
                        ? `${data.items.length.toLocaleString()}건까지만 불러옴`
                        : `일부만 불러옴 (${data.items.length.toLocaleString()}건)`}
                    </span>
                  )}
                  {draftAdvertisements.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 font-medium text-warning">
                      <Pencil className="size-3" />
                      변경 초안 {draftAdvertisements.length}건
                    </span>
                  )}
                  {data && (
                    <>
                      {/* 조건에 맞는 광고를 출처로 나눈다. 수동 광고는 CP 광고에 넣어 세지 않는다. */}
                      <span className="ml-2 hidden items-center gap-1 lg:inline-flex">
                        <span className="size-1.5 rounded-full bg-success" />
                        CP 광고 {sourceCounts.cp}
                      </span>
                      <span className="hidden items-center gap-1 lg:inline-flex">
                        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                        수동 광고 {sourceCounts.manual}
                      </span>
                      <span className="hidden items-center gap-1 lg:inline-flex">
                        <span className="size-1.5 rounded-full bg-warning" />
                        비교 대기 {counts.comparison_pending}
                      </span>
                    </>
                  )}
                </>
              )}
            />
          </MyAdsTableStateContext.Provider>
        )}
      </section>
      <AdvertisementActionDialog
        open={actionDialogOpen}
        drafts={actionDrafts}
        rationale={actionRationale}
        isSubmitting={actionMutation.isPending}
        onOpenChange={(open) => {
          if (actionMutation.isPending) return;
          setActionDialogOpen(open);
          if (!open) {
            setActionDrafts([]);
            setActionRationale("");
          }
        }}
        onDraftChange={updateActionDraft}
        onRationaleChange={setActionRationale}
        onSubmit={submitActionDrafts}
      />
      <MyAdsManualAdDialog
        session={manualAdSession}
        open={isManualAdOpen}
        onOpenChange={setIsManualAdOpen}
        getReturnFocusTarget={({ leftList }) => {
          // 연 버튼이 사라졌거나, 저장한 광고가 종료되어 곧 목록에서 빠지면 툴바의 등록 버튼으로 돌아간다.
          const opener = manualAdOpener.current;
          return !leftList &&
            opener?.isConnected &&
            !opener.matches(":disabled")
            ? opener
            : registerAdButtonRef.current;
        }}
      />
    </div>
  );
}
