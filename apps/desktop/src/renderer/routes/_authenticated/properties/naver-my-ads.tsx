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
  Pencil,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CreateAdvertisementChangeRequestDto,
  AdvertisementChangeRequest,
  ListingAdvertisementWithListing,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { type MultiSelectOption } from "@/components/ui/multi-select";
import {
  buildChannelFilterOptions,
  initialMyAdsFilters,
  viewTabs,
  type MyAdsFilterOption,
  type MyAdsFilterState,
  type MyAdsView,
} from "./-my-ads/my-ads-types";
import { getErrorMessage } from "./-my-ads/my-ads-format";
import {
  advertisementMatchesFilters,
  advertisementMatchesView,
  hasMyAdsNarrowingConditions,
  myAdsTableFilterScopeKey,
} from "./-my-ads/my-ads-filters";
import { sortAdvertisements } from "./-my-ads/my-ads-sort";
import { buildColumns } from "./-my-ads/my-ads-columns";
import {
  amountProblem,
  buildRecordEdit,
  currentAmount,
  currentFloorExposure,
  draftToRequests,
  editBlockReason,
  fieldLabel,
  flagBlockReason,
  parseManwonCell,
  withDraftValue,
  type MyAdsEditableField,
  type MyAdsMode,
  type MyAdsRequestDraft,
  type MyAdsRequestDrafts,
} from "./-my-ads/my-ads-modes";
import {
  MyAdsRequestSendDialog,
  type RequestSendOptions,
} from "./-my-ads/my-ads-request-send-dialog";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
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
import { MyAdsToolbar } from "./-my-ads/my-ads-toolbar";
import { MyAdsLinkDialog } from "./-my-ads/my-ads-link-dialog";
import { MyAdsPeek } from "./-my-ads/my-ads-peek";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { MyAdsLocationAdDialog } from "./-my-ads/my-ads-location-ad-dialog";
import {
  advertisementSite,
  changeRequestSummary,
} from "./-my-ads/my-ads-link";
import {
  countAdvertisementsBySyncState,
} from "./-my-ads/my-ads-manual-ad-state";
import {
  MyAdsTableStateContext,
  type MyAdsPanelTab,
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

function searchText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** 매물 상세의 "내광고관리"가 그 호실의 광고만 거른 채 연다 (?siteId=&dong=&ho=) */
type NaverMyAdsSearch = { siteId?: string; dong?: string; ho?: string };

export const Route = createFileRoute("/_authenticated/properties/naver-my-ads")(
  {
    validateSearch: (search: Record<string, unknown>): NaverMyAdsSearch => ({
      siteId:
        typeof search.siteId === "string" && search.siteId ? search.siteId : undefined,
      // 주소의 "103"·"1502"는 라우터가 숫자로 읽는다 — 글자로 되돌린다
      dong: searchText(search.dong),
      ho: searchText(search.ho),
    }),
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
  const placeSearch = Route.useSearch();
  const [filters, setFilters] = useState<MyAdsFilterState>(() => ({
    ...initialMyAdsFilters,
    siteIds: placeSearch.siteId ? [placeSearch.siteId] : [],
    dongSearch: placeSearch.dong ?? "",
    unitSearch: placeSearch.ho ?? "",
  }));
  // 이미 열린 탭으로 다른 호실을 열어도 그 호실로 다시 거른다
  const placeSearchKey = [placeSearch.siteId, placeSearch.dong, placeSearch.ho].join("|");
  const appliedPlaceSearchKey = useRef(placeSearchKey);
  useEffect(() => {
    if (appliedPlaceSearchKey.current === placeSearchKey) return;
    appliedPlaceSearchKey.current = placeSearchKey;
    if (!placeSearch.siteId && !placeSearch.dong && !placeSearch.ho) return;
    setFilters({
      ...initialMyAdsFilters,
      siteIds: placeSearch.siteId ? [placeSearch.siteId] : [],
      dongSearch: placeSearch.dong ?? "",
      unitSearch: placeSearch.ho ?? "",
    });
  }, [placeSearch.dong, placeSearch.ho, placeSearch.siteId, placeSearchKey]);
  const sorting = useMemo(
    () => myAdsSortToSorting(preferences.sort),
    [preferences.sort],
  );
  // "광고 정보" 묶음(CP사·링크·검증방식·노출기간)은 접힌 채로 연다. 필요할 때 머리글의 단추로 편다.
  const [
    areAdvertisementSourceColumnsCollapsed,
    setAreAdvertisementSourceColumnsCollapsed,
  ] = useState(true);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  /** 펼친 영역의 탭. 한 번에 한 줄만 펼치므로 화면에 하나다 */
  const [panelTab, setPanelTab] = useState<MyAdsPanelTab>("analysis");
  /**
   * 고치기 모드. 평소(null)에는 표가 읽기 전용이다.
   *   edit     칸을 눌러 고치면 우리 기록이 바로 바뀐다
   *   request  칸을 눌러 바꿀 값을 적으면 초안으로 모이고, "요청 보내기"에서 업무가 된다
   */
  const [mode, setModeState] = useState<MyAdsMode | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  /** 변경 요청 초안 (광고 id → 초안). 보내기 전까지 광고도 업무도 바뀌지 않는다 */
  const [drafts, setDraftsState] = useState<MyAdsRequestDrafts>({});
  // 확정 · 보내기 · 모드 전환은 "지금 초안"을 바로 읽어야 해서 상태와 함께 고친다
  const draftsRef = useRef(drafts);
  const setDrafts = useCallback(
    (update: (current: MyAdsRequestDrafts) => MyAdsRequestDrafts) => {
      const next = update(draftsRef.current);
      if (next === draftsRef.current) return;
      draftsRef.current = next;
      setDraftsState(next);
    },
    [],
  );
  const [editingCell, setEditingCell] = useState<{
    id: string;
    field: MyAdsEditableField;
  } | null>(null);
  /** 열려 있는 입력칸이 걸어 두는 "지금 값 확정" 함수 */
  const editorCommitRef = useRef<(() => Promise<boolean>) | null>(null);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isSiteFilterOpen, setIsSiteFilterOpen] = useState(false);
  /**
   * 광고 수동입력(새 광고 등록 · 수동 광고 수정). 닫혀도 마지막 세션을 들고 있어
   * 닫히는 동안 내용이 비지 않고, 다시 열면 id가 바뀌어 입력이 처음부터 시작된다.
   */
  const [manualAdSession, setManualAdSession] =
    useState<ManualAdDialogSession | null>(null);
  const [isManualAdOpen, setIsManualAdOpen] = useState(false);
  /**
   * 옆 상세 패널. 다른 목록 화면과 같은 방식이다: 닫을 때는 미끄러져 나간 뒤에 내용을 치운다.
   * 키보드로 열고 닫을 때는 움직임을 쓰지 않는다.
   */
  const [peekAdvertisementId, setPeekAdvertisementId] = useState<string | null>(null);
  const [isPeekClosing, setIsPeekClosing] = useState(false);
  const [peekMotion, setPeekMotion] = useState(true);
  const openPeek = useCallback((advertisementId: string) => {
    setPeekMotion(!document.activeElement?.matches(":focus-visible"));
    setIsPeekClosing(false);
    setPeekAdvertisementId(advertisementId);
  }, []);
  const closePeek = useCallback((animate = true) => {
    setPeekMotion(animate);
    setIsPeekClosing(true);
  }, []);
  const finishClosingPeek = useCallback(() => {
    setPeekAdvertisementId(null);
    setIsPeekClosing(false);
  }, []);
  const createTab = useTabStore((state) => state.createTab);
  const openPropertyTab = useCallback(
    (propertyId: string) => {
      const route = `/properties/${propertyId}`;
      const meta = getRouteMeta(route);
      createTab({ route, kind: meta.kind, title: meta.title });
    },
    [createTab],
  );
  /** 매물 없이 위치로 넣는 등록 창 */
  const [isLocationAdOpen, setIsLocationAdOpen] = useState(false);
  const manualAdSessionCount = useRef(0);
  const manualAdOpener = useRef<HTMLElement | null>(null);
  const registerAdButtonRef = useRef<HTMLButtonElement>(null);

  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["listing-advertisements", "my-ads", filters.status, debouncedSearch],
    // 서버는 한 번에 100건까지만 준다. 전체 건수까지 모든 쪽을 이어 받는다.
    queryFn: () =>
      loadAllAdvertisementPages((page) =>
        api.listingAdvertisements.findAll({
          search: debouncedSearch || undefined,
          status: filters.status === "all" ? undefined : filters.status,
          page,
          limit: MY_ADS_PAGE_LIMIT,
          sortBy: "updatedAt",
          sortOrder: "desc",
        }),
      ),
    // 검색어가 바뀌어 새로 받는 동안 이전 결과를 그대로 보여 준다(스켈레톤 깜빡임 방지).
    placeholderData: keepPreviousData,
  });
  const cpAccountsQuery = useQuery({
    queryKey: ["cp-accounts"],
    queryFn: () => api.listingAdvertisements.findCpAccounts(),
    staleTime: 60_000,
  });
  const cpAccounts = useMemo(() => cpAccountsQuery.data ?? [], [cpAccountsQuery.data]);
  const hasMultipleCpAccounts = useMemo(
    () => cpAccounts.filter((account) => account.isActive !== false).length > 1,
    [cpAccounts],
  );
  const cpAccountOptions = useMemo<MyAdsFilterOption[]>(
    () =>
      cpAccounts.length > 1
        ? [
            { value: "all", label: "계정 전체" },
            ...cpAccounts.map((account) => ({
              value: account.id,
              label: account.accountName
                ? `${account.accountName} (${account.accountKey})`
                : account.accountKey,
            })),
          ]
        : [],
    [cpAccounts],
  );
  const advertisements = useMemo(() => data?.items ?? [], [data]);
  const channelOptions = useMemo(
    () => buildChannelFilterOptions(advertisements),
    [advertisements],
  );
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
      const site = advertisementSite(advertisement);
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
  // 패널의 광고는 목록의 탭 · 필터와 상관없이 받은 광고 전체에서 찾는다
  // (필터를 바꿔 그 줄이 표에서 빠져도 보고 있던 패널이 닫히지 않게). 목록에서 아예 사라지면 닫는다.
  const peekAdvertisement = useMemo(
    () =>
      advertisements.find(
        (advertisement) => advertisement.id === peekAdvertisementId,
      ) ?? null,
    [advertisements, peekAdvertisementId],
  );
  const openPeekId = isPeekClosing ? null : (peekAdvertisement?.id ?? null);
  useEffect(() => {
    if (peekAdvertisementId && data && !peekAdvertisement) finishClosingPeek();
  }, [data, finishClosingPeek, peekAdvertisement, peekAdvertisementId]);
  const togglePeek = useCallback(
    (advertisement: ListingAdvertisementWithListing) => {
      if (openPeekId === advertisement.id) closePeek();
      else openPeek(advertisement.id);
    },
    [closePeek, openPeek, openPeekId],
  );

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
    () => sortAdvertisements(filteredAdvertisements, sorting, drafts),
    [drafts, filteredAdvertisements, sorting],
  );
  const syncCounts = useMemo(
    () => countAdvertisementsBySyncState(filterScopedAdvertisements),
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

  // 목록에서 사라진 광고의 펼침은 지운다. 남겨 두면 펼친 행이 없는데도 가상 스크롤이 꺼질 수 있다.
  useEffect(() => {
    const visibleIds = new Set(
      sortedAdvertisements.map((advertisement) => advertisement.id),
    );
    setExpandedIds((current) => {
      if ([...current].every((id) => visibleIds.has(id))) return current;
      return new Set([...current].filter((id) => visibleIds.has(id)));
    });
  }, [sortedAdvertisements]);

  const refreshAdvertisements = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["listing-advertisements"] }),
    [queryClient],
  );

  /** 열려 있는 입력칸의 값을 먼저 확정한다. 틀린 값이면 false — 하려던 일을 멈춘다 */
  const flushEditor = useCallback(
    async () => (editorCommitRef.current ? editorCommitRef.current() : true),
    [],
  );

  /**
   * 모드를 켜거나 끈다(같은 버튼을 다시 누르면 꺼진다).
   * - 고치던 칸이 틀린 값이면 바꾸지 않는다. 열린 입력칸을 든 채 넘어가면 그 모드에서는 고칠 수 없는 칸에
   *   값이 들어갈 수 있다.
   * - 작성한 요청이 있으면 어느 길로 나가든 먼저 묻는다.
   */
  const changeMode = useCallback(
    async (next: MyAdsMode | null) => {
      if (!(await flushEditor())) return;
      if (
        modeRef.current === "request" &&
        Object.keys(draftsRef.current).length > 0
      ) {
        setIsConfirmingDiscard(true);
        return;
      }
      setEditingCell(null);
      setModeState(modeRef.current === next ? null : next);
    },
    [flushEditor],
  );
  const discardDrafts = useCallback(() => {
    setDrafts(() => ({}));
    setIsConfirmingDiscard(false);
    setEditingCell(null);
    setModeState(null);
  }, [setDrafts]);

  /** 무엇을 요청하는지 바로 아래에서 보이게, 그 줄을 펼치고 요청 탭을 연다 */
  const showRequestsOf = useCallback((advertisementId: string) => {
    setExpandedIds((current) =>
      current.size === 1 && current.has(advertisementId)
        ? current
        : new Set([advertisementId]),
    );
    setPanelTab("requests");
  }, []);

  const startEdit = useCallback(
    async (
      advertisement: ListingAdvertisementWithListing,
      field: MyAdsEditableField,
    ) => {
      const current = modeRef.current;
      if (!current) return;
      const blocked = editBlockReason(advertisement, field, current);
      if (blocked) {
        toast.info(blocked);
        return;
      }
      if (!(await flushEditor())) return;
      setEditingCell({ id: advertisement.id, field });
    },
    [flushEditor],
  );
  const cancelEdit = useCallback(() => setEditingCell(null), []);

  const commitEdit = useCallback(
    async (
      advertisement: ListingAdvertisementWithListing,
      field: "primary" | "monthlyRent",
      text: string,
    ): Promise<string | null> => {
      const current = modeRef.current;
      if (!current) {
        setEditingCell(null);
        return null;
      }
      const value = parseManwonCell(text);
      const problem = amountProblem(advertisement, field, value);
      if (problem || value === null) return problem ?? "금액을 적어 주세요.";
      // 칸이 버튼이 아니어도 여기서 한 번 더 막는다
      const blocked = editBlockReason(advertisement, field, current);
      if (blocked) return blocked;

      if (current === "request") {
        setDrafts((all) => {
          const next = withDraftValue(advertisement, all[advertisement.id], field, value);
          const rest = { ...all };
          if (next) rest[advertisement.id] = next;
          else delete rest[advertisement.id];
          return rest;
        });
        setEditingCell(null);
        showRequestsOf(advertisement.id);
        return null;
      }

      const before = currentAmount(advertisement, field);
      if (before === value) {
        setEditingCell(null);
        return null;
      }
      try {
        await api.listingAdvertisements.update(
          advertisement.id,
          buildRecordEdit(advertisement, field, value),
        );
      } catch (error) {
        // 입력칸을 닫지 않는다. 쓴 값이 남아 있어 그대로 다시 저장할 수 있다.
        return getErrorMessage(error, "저장하지 못했습니다. 다시 시도해 주세요.");
      }
      await refreshAdvertisements();
      setEditingCell(null);
      const label = fieldLabel(advertisement, field);
      toast.success(
        `${advertisementLocationLabel(advertisement)} ${label} ${formatMoney(before)} → ${formatMoney(value)}`,
        {
          description: "기록만 고쳤습니다. CP에 올라간 광고는 바뀌지 않습니다.",
          action:
            before == null
              ? undefined
              : {
                  label: "되돌리기",
                  onClick: () => {
                    // 방금 저장한 값이 그대로일 때만 되돌린다
                    void api.listingAdvertisements
                      .update(advertisement.id, {
                        ...buildRecordEdit(
                          { ...advertisement, ...buildRecordEdit(advertisement, field, value), expected: undefined } as ListingAdvertisementWithListing,
                          field,
                          before,
                        ),
                      })
                      .then(() => {
                        toast.success("되돌렸습니다.");
                      })
                      .catch((error: unknown) =>
                        toast.error(getErrorMessage(error, "되돌리지 못했습니다. 다시 시도해 주세요.")),
                      )
                      .finally(() => void refreshAdvertisements());
                  },
                },
        },
      );
      return null;
    },
    [refreshAdvertisements, setDrafts, showRequestsOf],
  );

  const toggleFloorRequest = useCallback(
    (advertisement: ListingAdvertisementWithListing) => {
      if (modeRef.current !== "request") return;
      const blocked = editBlockReason(advertisement, "floorExposure", "request");
      if (blocked) {
        toast.info(blocked);
        return;
      }
      const current = currentFloorExposure(advertisement);
      if (!current) return;
      setDrafts((all) => {
        const draft = all[advertisement.id];
        const next =
          draft?.floorExposure !== undefined
            ? withDraftValue(advertisement, draft, "floorExposure", current)
            : withDraftValue(
                advertisement,
                draft,
                "floorExposure",
                current === "exact" ? "band" : "exact",
              );
        const rest = { ...all };
        if (next) rest[advertisement.id] = next;
        else delete rest[advertisement.id];
        return rest;
      });
      showRequestsOf(advertisement.id);
    },
    [setDrafts, showRequestsOf],
  );

  const toggleDraftFlag = useCallback(
    (
      advertisement: ListingAdvertisementWithListing,
      flag: "readvertise" | "takedown",
    ) => {
      if (modeRef.current !== "request") return;
      const blocked = flagBlockReason(advertisement, flag);
      if (blocked) {
        toast.info(blocked);
        return;
      }
      setDrafts((all) => {
        const next: MyAdsRequestDraft = { ...all[advertisement.id] };
        if (flag === "takedown") {
          if (next.takedown) delete next.takedown;
          else {
            delete next.readvertise;
            delete next.primary;
            delete next.monthlyRent;
            delete next.floorExposure;
            next.takedown = true;
          }
        } else {
          if (next.readvertise) delete next.readvertise;
          else {
            delete next.takedown;
            next.readvertise = true;
          }
        }
        const rest = { ...all };
        if (Object.keys(next).length > 0) rest[advertisement.id] = next;
        else delete rest[advertisement.id];
        return rest;
      });
    },
    [setDrafts],
  );

  const dropDraft = useCallback(
    (advertisementId: string, key: keyof MyAdsRequestDraft) => {
      setDrafts((all) => {
        if (all[advertisementId]?.[key] === undefined) return all;
        const next: MyAdsRequestDraft = { ...all[advertisementId] };
        delete next[key];
        const rest = { ...all };
        if (Object.keys(next).length > 0) rest[advertisementId] = next;
        else delete rest[advertisementId];
        return rest;
      });
    },
    [setDrafts],
  );

  // 초안이 있는 광고는 마지막으로 본 모습을 따로 들고 있는다. useMemo 안이 아니라 effect에서 동기화한다.
  const [draftedCacheVersion, setDraftedCacheVersion] = useState(0);
  const draftedAdvertisementCache = useRef(
    new Map<string, ListingAdvertisementWithListing>(),
  );
  useEffect(() => {
    const cache = draftedAdvertisementCache.current;
    let changed = false;
    for (const advertisement of advertisements) {
      if (drafts[advertisement.id] && cache.get(advertisement.id) !== advertisement) {
        cache.set(advertisement.id, advertisement);
        changed = true;
      }
    }
    for (const id of [...cache.keys()]) {
      if (!drafts[id]) {
        cache.delete(id);
        changed = true;
      }
    }
    if (changed) setDraftedCacheVersion((v) => v + 1);
  }, [advertisements, drafts]);
  // 목록이 새로 오면 받은 광고의 초안만 다시 맞춘다: 그 사이 같은 종류의 요청이 걸렸거나 요청할 수 없게 된
  // 칸의 초안은 뺀다(남겨 두면 보낼 수 없는 줄이 "작성 중"으로 남는다).
  // 목록에 없는 광고의 초안은 건드리지 않는다. 검색 · 탭 · 필터로 안 보이는 것일 뿐이다.
  useEffect(() => {
    if (!data) return;
    const byId = new Map(advertisements.map((advertisement) => [advertisement.id, advertisement]));
    setDrafts((all) => {
      let changed = false;
      const next: Record<string, MyAdsRequestDraft> = {};
      for (const [id, draft] of Object.entries(all)) {
        const advertisement = byId.get(id);
        if (!advertisement) {
          next[id] = draft;
          continue;
        }
        const kept: MyAdsRequestDraft = { ...draft };
        let touched = false;
        for (const field of ["primary", "monthlyRent", "floorExposure"] as const) {
          if (
            kept[field] !== undefined &&
            editBlockReason(advertisement, field, "request") !== null
          ) {
            delete kept[field];
            touched = true;
          }
        }
        for (const flag of ["readvertise", "takedown"] as const) {
          if (kept[flag] && flagBlockReason(advertisement, flag) !== null) {
            delete kept[flag];
            touched = true;
          }
        }
        if (!touched) next[id] = draft;
        else if (Object.keys(kept).length > 0) next[id] = kept;
        changed ||= touched;
      }
      return changed ? next : all;
    });
  }, [advertisements, data, setDrafts]);

  const draftedAdvertisements = useMemo(() => {
    void draftedCacheVersion;
    const byId = new Map(advertisements.map((ad) => [ad.id, ad]));
    return Object.keys(drafts)
      .map((id) => byId.get(id) ?? draftedAdvertisementCache.current.get(id))
      .filter((advertisement): advertisement is ListingAdvertisementWithListing =>
        Boolean(advertisement),
      );
  }, [advertisements, draftedCacheVersion, drafts]);

  /**
   * 요청 보내기. 초안 전체를 하나의 묶음 업무(Task 1건 + AdvertisementChangeRequest N건)로 보낸다.
   */
  const sendMutation = useMutation({
    mutationFn: async ({
      options,
      sent,
      targets,
    }: {
      options: RequestSendOptions;
      sent: MyAdsRequestDrafts;
      targets: ListingAdvertisementWithListing[];
    }) => {
      const items: CreateAdvertisementChangeRequestDto[] = [];
      const targetAdIds: string[] = [];
      for (const advertisement of targets) {
        const requests = draftToRequests(advertisement, sent[advertisement.id]);
        for (const req of requests) {
          items.push(req);
        }
        if (requests.length > 0) targetAdIds.push(advertisement.id);
      }
      if (items.length === 0) {
        throw new Error("보낼 수 있는 요청이 없습니다.");
      }
      await api.listingAdvertisements.createChangeRequestsBatch({
        items,
        assignedToId: options.assignedToId,
        dueDate: options.dueDate,
        memo: options.memo,
      });
      return { doneIds: targetAdIds };
    },
    onSuccess: ({ doneIds }, { sent, options }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void refreshAdvertisements();
      // 보낸 뒤 손대지 않은 초안만 지운다
      setDrafts((all) => {
        const rest = { ...all };
        let changed = false;
        for (const id of doneIds) {
          if (rest[id] && rest[id] === sent[id]) {
            delete rest[id];
            changed = true;
          }
        }
        return changed ? rest : all;
      });
      setIsSendOpen(false);
      setIsConfirmingDiscard(false);
      setEditingCell(null);
      setModeState(null);
      toast.success(
        `${doneIds.length}건을 요청했습니다. ${options.assignedToId ? "맡긴 직원의 업무로 등록했습니다." : "광고 업무로 등록했습니다."}`,
      );
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "요청을 보내지 못했습니다. 다시 시도해 주세요.")),
  });
  const openSend = useCallback(async () => {
    if (!(await flushEditor())) return;
    if (Object.keys(draftsRef.current).length === 0) return;
    setIsSendOpen(true);
  }, [flushEditor]);

  /**
   * 요청 거두기. 여러 요청을 잇달아 거둘 수 있어 진행 중인 요청을 하나씩 따로 센다
   * (같은 요청을 두 번 보내지 않고, 먼저 누른 것의 버튼이 다시 살아나지 않는다).
   */
  const [cancellingRequestIds, setCancellingRequestIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const cancellingRequestIdsRef = useRef<Set<string>>(new Set());
  const cancelRequest = useCallback(
    (request: AdvertisementChangeRequest) => {
      if (cancellingRequestIdsRef.current.has(request.id)) return;
      cancellingRequestIdsRef.current.add(request.id);
      setCancellingRequestIds(new Set(cancellingRequestIdsRef.current));
      void api.listingAdvertisements
        .cancelChangeRequest(request.id)
        .then(() => {
          toast.success(`요청을 거뒀습니다 (${changeRequestSummary(request)}).`);
        })
        .catch((error: unknown) =>
          toast.error(getErrorMessage(error, "요청을 거두지 못했습니다. 다시 시도해 주세요.")),
        )
        .finally(async () => {
          // 실패해도 목록을 다시 받는다(이미 끝난 요청이었을 수 있다). 받은 뒤에 버튼을 푼다.
          void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          await queryClient.invalidateQueries({
            queryKey: ["listing-advertisements"],
          });
          cancellingRequestIdsRef.current.delete(request.id);
          setCancellingRequestIds(new Set(cancellingRequestIdsRef.current));
        });
    },
    [queryClient],
  );

  /** 매물 연결 창. 닫히는 동안 내용이 비지 않게 마지막 광고를 들고 있는다. */
  const [linkTarget, setLinkTarget] =
    useState<ListingAdvertisementWithListing | null>(null);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const openLinkDialog = useCallback(
    (advertisement: ListingAdvertisementWithListing) => {
      setLinkTarget(advertisement);
      setIsLinkOpen(true);
    },
    [],
  );

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

  /** 직접 입력한 광고는 채널 · 날짜까지 고치는 수정 창이 따로 있다 */
  const openManualEdit = useCallback(
    (advertisement: ListingAdvertisementWithListing) =>
      openManualAdDialog({ mode: "edit", advertisement }),
    [openManualAdDialog],
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
    setExpandedIds((previous) => {
      const next = nextMyAdsExpandedIds(previous, id);
      // 새로 펼칠 때: 작성 중인 요청이 있으면 요청 탭, 아니면 비교 분석부터
      if (next.has(id)) setPanelTab(draftsRef.current[id] ? "requests" : "analysis");
      return next;
    });
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

  // 열 정의는 열 구성(광고 정보 접힘)이 바뀔 때만 새로 만든다. 모드 · 펼침 · 고치는 칸 · 초안은
  // tableRowState 컨텍스트로 칸에 건넨다 — 열 정의가 바뀌면 모든 칸이 새로 마운트되어
  // 입력 중인 가격 칸이 닫힌다.
  const columns = useMemo(
    () =>
      buildColumns({
        areAdvertisementSourceColumnsCollapsed,
        hasMultipleCpAccounts,
      }),
    [areAdvertisementSourceColumnsCollapsed, hasMultipleCpAccounts],
  );
  const tableRowState = useMemo<MyAdsTableRowState>(
    () => ({
      expandedIds,
      onToggleExpanded: toggleExpanded,
      mode,
      editingCell,
      drafts,
      onStartEdit: (advertisement, field) => void startEdit(advertisement, field),
      onCommitEdit: commitEdit,
      onCancelEdit: cancelEdit,
      editorCommitRef,
      onToggleFloorRequest: toggleFloorRequest,
      panelTab,
      onPanelTabChange: setPanelTab,
      onToggleDraftFlag: toggleDraftFlag,
      onDropDraft: dropDraft,
      onOpenLink: openLinkDialog,
      peekId: openPeekId,
      onTogglePeek: togglePeek,
      onCancelRequest: cancelRequest,
      cancellingRequestIds,
    }),
    [
      cancelEdit,
      cancelRequest,
      cancellingRequestIds,
      commitEdit,
      drafts,
      dropDraft,
      editingCell,
      expandedIds,
      mode,
      openLinkDialog,
      openPeekId,
      panelTab,
      startEdit,
      toggleDraftFlag,
      toggleExpanded,
      toggleFloorRequest,
      togglePeek,
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
    },
    [],
  );

  const handleViewChange = (next: MyAdsView) => {
    setView(next);
    setExpandedIds(new Set());
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setExpandedIds(new Set());
  };

  const handleFiltersReset = () => {
    setView("all");
    setSearch("");
    setFilters({ ...initialMyAdsFilters, siteIds: [] });
    handleSortingChange([]);
    setExpandedIds(new Set());
  };

  const draftCount = Object.keys(drafts).length;

  return (
    <div
      data-canonical-advertisement-source="listing-advertisements"
      // relative: 옆 상세 패널이 이 화면 안에서 오른쪽에 붙는다
      className="relative -m-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white"
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
        channelOptions={channelOptions}
        cpAccountOptions={cpAccountOptions}
        isSiteFilterOpen={isSiteFilterOpen}
        onSiteFilterOpenChange={setIsSiteFilterOpen}
        filters={filters}
        updateMyAdsFilter={updateMyAdsFilter}
        updateMyAdsRangeFilter={updateMyAdsRangeFilter}
        isFetching={isFetching}
        hasActiveFilters={hasActiveFilters}
        onFiltersReset={handleFiltersReset}
        trailingActions={
          <>
            {/* 고치기는 두 가지다. 평소에는 표가 읽기 전용이고, 눌러서 들어와야만 고칠 수 있다. */}
            <Button
              variant="outline"
              size="sm"
              data-my-ads-mode-button="edit"
              aria-label="기록 수정·추가"
              aria-pressed={mode === "edit"}
              title="표에서 값을 바로 고치거나 아래 '+ 광고 기록 추가'로 기록을 넣습니다. CP에 올라간 광고는 바뀌지 않습니다."
              className={cn(
                "h-[30px] shrink-0 gap-1.5 rounded-[8px] px-3 font-normal",
                mode === "edit" &&
                  "border-warning/40 bg-warning-soft font-medium text-warning hover:bg-warning-soft",
              )}
              onClick={() => void changeMode("edit")}
            >
              <Pencil className="size-3.5" />
              <span className="@max-[50rem]:hidden">기록 수정·추가</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-my-ads-mode-button="request"
              aria-label="광고 요청"
              aria-pressed={mode === "request"}
              title="바꿀 값을 적어 에이전트나 직원에게 요청합니다. 광고 값은 처리된 뒤 반영됩니다."
              className={cn(
                "h-[30px] shrink-0 gap-1.5 rounded-[8px] px-3 font-normal",
                mode === "request" &&
                  "border-info/40 bg-info-soft font-medium text-info hover:bg-info-soft",
              )}
              onClick={() => void changeMode("request")}
            >
              <Send className="size-3.5" />
              <span className="@max-[50rem]:hidden">광고 요청</span>
            </Button>
          </>
        }
      />

      {/* 모드 띠: 지금 무엇을 하고 있는지 화면 전체에서 보이게 */}
      {mode && (
        <div
          data-my-ads-mode-bar={mode}
          role="status"
          className={cn(
            "flex min-h-[38px] shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-1 text-[13px]",
            mode === "edit" ? "bg-warning-soft text-warning" : "bg-info-soft text-info",
          )}
        >
          {mode === "edit" ? (
            <>
              <b className="font-semibold">기록 수정·추가 중</b>
              <span>
                칸을 눌러 고치거나 아래 '+ 광고 기록 추가'로 기록을 넣습니다. CP에 올라간 광고는 바뀌지 않습니다.
              </span>
              <span className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                className="h-[26px] bg-white/75 px-2.5 text-[12.5px] font-normal text-foreground"
                onClick={() => void changeMode(null)}
              >
                끝내기
              </Button>
            </>
          ) : isConfirmingDiscard ? (
            <>
              <b className="font-semibold">작성한 요청 {draftCount}건을 버릴까요?</b>
              <span className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                autoFocus
                className="h-[26px] bg-white/75 px-2.5 text-[12.5px] font-normal text-foreground"
                onClick={() => setIsConfirmingDiscard(false)}
              >
                계속 작성
              </Button>
              <Button size="sm" className="h-[26px] px-2.5 text-[12.5px]" onClick={discardDrafts}>
                버리기
              </Button>
            </>
          ) : (
            <>
              <b className="font-semibold">광고 요청 작성 중</b>
              <span className="rounded-full bg-white/70 px-2 font-semibold tabular-nums leading-5">
                {draftCount}건
              </span>
              <span>
                칸을 눌러 바꿀 값을 적으세요. 보내기 전까지 광고와 업무는 바뀌지 않습니다.
              </span>
              <span className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                className="h-[26px] bg-white/75 px-2.5 text-[12.5px] font-normal text-foreground"
                onClick={() => void changeMode(null)}
              >
                취소
              </Button>
              <Button
                size="sm"
                className="h-[26px] gap-1 px-2.5 text-[12.5px]"
                disabled={draftCount === 0 || sendMutation.isPending}
                onClick={() => void openSend()}
              >
                <Send className="size-3" />
                요청 보내기
              </Button>
            </>
          )}
        </div>
      )}

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
              expandedRowIds={expandedIds}
              estimateExpandedRowHeight={expandedPanelEstimate}
              renderExpandedRow={(advertisement) => (
                <div id={myAdsAnalysisPanelId(advertisement.id)}>
                  <AdvertisementAnalysisPanel
                    advertisement={advertisement}
                    onEditAdvertisement={() => openManualEdit(advertisement)}
                  />
                </div>
              )}
              isLoading={isLoading}
              emptyMessage={
                hasNarrowingConditions ? (
                  "조건에 맞는 광고가 없습니다."
                ) : (
                  // 광고가 하나도 없는 사무소: 무엇이 어떻게 들어오는지와 바로 하는 단추(연락처 목록과 같은 모양)
                  <span className="flex flex-col items-center gap-2 py-2 text-center">
                    <span className="text-[14px] text-foreground">아직 저장된 광고가 없습니다.</span>
                    <span className="text-[13px]">
                      이실장·부동산뱅크 같은 광고 사이트에 올린 광고는 사무소 PC의 자동화 도구가 읽어 와 여기에
                      쌓입니다. 도구 없이 쓰려면 광고를 직접 적어 두세요.
                    </span>
                    <Button
                      size="sm"
                      className="mt-1 h-[30px] rounded-[8px] px-3"
                      onClick={() => {
                        setModeState("edit");
                        openManualAdDialog({ mode: "create" });
                      }}
                    >
                      <Plus className="size-3.5" />
                      광고 기록 추가
                    </Button>
                  </span>
                )
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
                  {draftCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 font-medium text-info">
                      <Send className="size-3" />
                      보내지 않은 요청 {draftCount}건
                    </span>
                  )}
                  {data && (
                    <>
                      <span className="ml-2 hidden items-center gap-1 lg:inline-flex">
                        <span className="size-1.5 rounded-full bg-success" />
                        CP 연동 {(syncCounts.synced + syncCounts.manualOverride).toLocaleString()}
                      </span>
                      {syncCounts.manualOverride > 0 && (
                        <span className="hidden items-center gap-1 lg:inline-flex">
                          <span className="size-1.5 rounded-full bg-warning" />
                          직접 수정됨 {syncCounts.manualOverride}
                        </span>
                      )}
                      <span className="hidden items-center gap-1 lg:inline-flex">
                        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                        직접 기록 {syncCounts.manual}
                      </span>
                      <span className="hidden items-center gap-1 lg:inline-flex">
                        <span className="size-1.5 rounded-full bg-warning" />
                        비교 대기 {counts.comparison_pending}
                      </span>
                      {counts.unlinked > 0 && (
                        <span className="hidden items-center gap-1 lg:inline-flex">
                          <span className="size-1.5 rounded-full bg-destructive/70" />
                          연결 안 됨 {counts.unlinked}
                        </span>
                      )}
                    </>
                  )}
                </>
              )}
            />
            {!isLoading && (
              <div className="shrink-0 border-t border-border bg-white px-3 py-1">
                <button
                  ref={registerAdButtonRef}
                  type="button"
                  data-my-ads-bottom-add
                  aria-disabled={mode !== "edit"}
                  onClick={() => {
                    if (mode === "edit") {
                      openManualAdDialog({ mode: "create" });
                    } else {
                      toast.info(
                        "수동으로 광고 기록을 추가·수정하려면 '기록 수정·추가' 모드를 켜 주세요. 에이전트에게 실제 광고 작업을 맡기려면 '광고 요청'을 이용해 주세요.",
                      );
                    }
                  }}
                  title={
                    mode === "edit"
                      ? "새 광고 기록을 직접 추가합니다"
                      : "수동 추가·수정은 '기록 수정·추가' 모드를 켜 주세요. 에이전트 실행은 '광고 요청'을 이용해 주세요."
                  }
                  className={cn(
                    "flex h-8 w-full items-center gap-1.5 rounded px-2 text-left text-[13px] transition-colors",
                    mode === "edit"
                      ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                      : "text-muted-foreground/60 hover:bg-muted/50 hover:text-muted-foreground",
                  )}
                >
                  <Plus className="size-3.5" />
                  광고 기록 추가
                </button>
              </div>
            )}
          </MyAdsTableStateContext.Provider>
        )}
      </section>
      <MyAdsRequestSendDialog
        open={isSendOpen}
        advertisements={draftedAdvertisements}
        drafts={drafts}
        isSending={sendMutation.isPending}
        onOpenChange={setIsSendOpen}
        onSend={(options) =>
          sendMutation.mutate({
            options,
            sent: draftsRef.current,
            targets: draftedAdvertisements,
          })
        }
      />
      {peekAdvertisement && (
        <MyAdsPeek
          advertisement={peekAdvertisement}
          closing={isPeekClosing}
          animate={peekMotion}
          onClose={closePeek}
          onExited={finishClosingPeek}
          onOpenProperty={openPropertyTab}
          onOpenLink={openLinkDialog}
        />
      )}
      <MyAdsLinkDialog
        advertisement={linkTarget}
        open={isLinkOpen}
        onOpenChange={setIsLinkOpen}
      />
      <MyAdsLocationAdDialog
        open={isLocationAdOpen}
        onOpenChange={setIsLocationAdOpen}
      />
      <MyAdsManualAdDialog
        session={manualAdSession}
        open={isManualAdOpen}
        onOpenChange={setIsManualAdOpen}
        onUseLocation={() => {
          setIsManualAdOpen(false);
          setIsLocationAdOpen(true);
        }}
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
