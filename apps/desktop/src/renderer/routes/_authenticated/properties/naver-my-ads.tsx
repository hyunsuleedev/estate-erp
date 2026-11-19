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
  initialMyAdsFilters,
  viewTabs,
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
  withoutSentKinds,
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
  countAdvertisementsBySource,
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
        return getErrorMessage(error);
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
                      .catch((error: unknown) => toast.error(getErrorMessage(error)))
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
        if (next[flag]) delete next[flag];
        else next[flag] = true;
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

  // 초안이 있는 광고는 마지막으로 본 모습을 따로 들고 있는다. 검색은 서버에서 걸러 오므로,
  // 검색어를 바꾸면 그 광고가 받은 목록에서 빠질 수 있다 — 그렇다고 작성한 요청을 버리지 않는다.
  const draftedAdvertisementCache = useRef(
    new Map<string, ListingAdvertisementWithListing>(),
  );
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

  // 초안이 있는 광고 전부(지금 목록에 없는 것도). 요청 보내기 창과 건수가 이것을 쓴다.
  const draftedAdvertisements = useMemo(() => {
    const cache = draftedAdvertisementCache.current;
    for (const advertisement of advertisements) {
      if (drafts[advertisement.id]) cache.set(advertisement.id, advertisement);
    }
    for (const id of [...cache.keys()]) {
      if (!drafts[id]) cache.delete(id);
    }
    return Object.keys(drafts)
      .map((id) => cache.get(id))
      .filter((advertisement): advertisement is ListingAdvertisementWithListing =>
        Boolean(advertisement),
      );
  }, [advertisements, drafts]);

  /**
   * 요청 보내기. 광고마다 요청(과 업무)을 만든다. 한 건이 실패해도 나머지는 보내고,
   * 실패한 광고의 초안은 남긴다. 보낸 초안은 누른 순간의 것을 함께 넘긴다 — 요청이 늦게 시작돼도
   * (연결 끊김) 그 사이 고친 초안을 "보낸 것"으로 잘못 지우지 않게.
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
      const doneIds: string[] = [];
      const failures: string[] = [];
      // 일부 종류만 만들어지고 끊긴 광고: 만들어진 종류
      const partial: Record<string, CreateAdvertisementChangeRequestDto["kind"][]> = {};
      for (const advertisement of targets) {
        const requests = draftToRequests(advertisement, sent[advertisement.id], options);
        if (requests.length === 0) {
          failures.push(
            `${advertisementLocationLabel(advertisement)}: 보낼 수 있는 요청이 없습니다.`,
          );
          continue;
        }
        const created: CreateAdvertisementChangeRequestDto["kind"][] = [];
        try {
          for (const request of requests) {
            await api.listingAdvertisements.createChangeRequest(advertisement.id, request);
            created.push(request.kind);
          }
          doneIds.push(advertisement.id);
        } catch (error) {
          if (created.length > 0) partial[advertisement.id] = created;
          failures.push(
            `${advertisementLocationLabel(advertisement)}: ${getErrorMessage(error)}`,
          );
        }
      }
      return { doneIds, failures, partial };
    },
    onSuccess: ({ doneIds, failures, partial }, { sent, options }) => {
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
        // 일부만 만들어진 광고는 만들어진 종류만 초안에서 뺀다. 목록을 다시 받아 맞추는 것에 기대지 않는다 —
        // 검색에 가려진 광고는 다시 받은 목록에 없어, 남겨 두면 다시 보낼 때 이미 걸린 종류에서 계속 막힌다.
        for (const [id, kinds] of Object.entries(partial)) {
          if (!rest[id] || rest[id] !== sent[id]) continue;
          const left = withoutSentKinds(rest[id], kinds);
          if (left) rest[id] = left;
          else delete rest[id];
          changed = true;
        }
        return changed ? rest : all;
      });
      if (failures.length === 0) {
        setIsSendOpen(false);
        setIsConfirmingDiscard(false);
        setEditingCell(null);
        setModeState(null);
        toast.success(
          `${doneIds.length}건을 요청했습니다. ${options.assignedToId ? "맡긴 직원의 할 일에 등록됐습니다." : "광고 업무에 등록됐습니다."}`,
        );
        return;
      }
      setIsSendOpen(false);
      toast.error(
        `${failures.length}건을 요청하지 못했습니다${doneIds.length > 0 ? ` (${doneIds.length}건은 요청됨)` : ""}. ${failures[0]}`,
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
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
        .catch((error: unknown) => toast.error(getErrorMessage(error)))
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
    () => buildColumns({ areAdvertisementSourceColumnsCollapsed }),
    [areAdvertisementSourceColumnsCollapsed],
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
              aria-pressed={mode === "edit"}
              title="표에서 값을 바로 고칩니다. CP에 올라간 광고는 바뀌지 않습니다."
              className={cn(
                "h-[30px] shrink-0 gap-1.5 rounded-[8px] px-3 font-normal",
                mode === "edit" &&
                  "border-warning/40 bg-warning-soft font-medium text-warning hover:bg-warning-soft",
              )}
              onClick={() => void changeMode("edit")}
            >
              <Pencil className="size-3.5" />
              <span className="@max-[50rem]:hidden">기록 수정</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-my-ads-mode-button="request"
              aria-pressed={mode === "request"}
              title="바꿀 값을 적어 에이전트나 직원에게 요청합니다. 광고 값은 처리된 뒤 바뀝니다."
              className={cn(
                "h-[30px] shrink-0 gap-1.5 rounded-[8px] px-3 font-normal",
                mode === "request" &&
                  "border-info/40 bg-info-soft font-medium text-info hover:bg-info-soft",
              )}
              onClick={() => void changeMode("request")}
            >
              <Send className="size-3.5" />
              <span className="@max-[50rem]:hidden">변경 요청</span>
            </Button>
          {/* 매물관리 1행 오른쪽 등록 버튼과 같은 모양. 늘 보이며, 줄이 모자라면 검색칸이 먼저 줄고
              그래도 1행 폭이 800px보다 좁으면 아이콘만 남는다(이름은 aria-label·title로). */}
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
              <b className="font-semibold">기록 수정 중</b>
              <span>
                칸을 눌러 고치면 바로 저장됩니다. CP에 올라간 광고는 바뀌지 않습니다.
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
              <b className="font-semibold">변경 요청 작성 중</b>
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
                  {draftCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 font-medium text-info">
                      <Send className="size-3" />
                      보내지 않은 요청 {draftCount}건
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
