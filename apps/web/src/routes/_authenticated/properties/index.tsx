import {
  getIntakeConfirmationState,
  getListingAvailability,
  getListingRowAvailability,
  planListingStatusChange,
} from "@/lib/listing-status";
import { invalidateListingDerivedCaches } from "@/lib/listing-cache";
import {
  IntakeCheckResult,
  IntakeClosedReason,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
} from "@estate-erp/shared";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Fragment,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type UIEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeftRight,
  ArrowUpDown,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Columns3,
  DoorOpen,
  ExternalLink,
  FileText,
  GitBranch,
  Hash,
  Handshake,
  LayoutList,
  Loader2,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  Phone,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  SearchX,
  SlidersHorizontal,
  Tag,
  Type,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  BuyerRequirement,
  Consultation,
  Listing,
  ListingFilterSite,
  ListingIntake,
  ListingIntakesFilter,
  Match,
  Property,
  PropertyContact,
  PropertyListing,
  Tenant,
} from "@estate-erp/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PriceCell,
  CellEditProvider,
  EditableCell,
  type SortDefinition,
  type ChipOption,
} from "@/components/data-table";
import {
  SheetSection,
  SheetEmptyState,
  SheetNoticeRow,
  formatDateShort,
  formatDateTime,
  formatDaysAgo,
  getDaysSince,
  getDaysUntil,
  type QuickSheetNotice,
  type QuickSheetNoticeTone,
} from "@/components/quick-sheet";
import { EmptyState, StatusBadge } from "@/components/domain";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { getStatusMeta, PIPELINE_STEPS } from "@/lib/status-config";
import { formatArea, formatMoney, formatPhone } from "@/lib/format";
import {
  getMoveInAvailability,
  pickPrimaryIntake,
  TONE_CHIP_CLASSES,
  type IntakeRowSummary,
  type ListingProperty,
  type ListingSummary,
  type PropertyListingGroup,
} from "./-property-list-view-utils";
import {
  ListingCostSummary,
  PropertyBulkActions,
  PropertyRowActions,
  type ListingCostExtras,
} from "./-property-intake-actions";
import { PropertyMapView } from "./-property-map-view";
import { MatchCreateDialog } from "../matches/-match-create-dialog";

// ── Labels ──────────────────────────────────────────────────────
// 상태 뱃지 컬러/라벨은 StatusBadge + status-config가 단일 소스.

const adChannelLabels: Record<string, string> = {
  esiljang: "이실장",
  budongsanbank: "부동산뱅크",
};

const contactRoleLabels: Record<string, string> = {
  owner: "소유주",
  co_owner: "공동소유",
  representative: "대리인",
  lawyer: "법무사",
  tax_agent: "세무사",
};

const sortOptions = [
  {
    value: "price:asc",
    field: "price",
    label: "가격 낮은순",
    direction: "asc",
  },
  {
    value: "price:desc",
    field: "price",
    label: "가격 높은순",
    direction: "desc",
  },
] satisfies Array<{
  value: string;
  field: string;
  label: string;
  direction: "asc" | "desc";
}>;

/** Radix Select는 빈 문자열 value를 허용하지 않아 "정렬 없음" 센티널 사용 */
const SORT_NONE = "__sort_none__";

const LISTINGS_PAGE_SIZE = 50;

// ── 커스텀 그리드 (시안 grid-template-columns 재현) ──────────────
// 40 체크박스 / 234 단지 / 54 동 / 88 호수(±버튼) / 58 유형 / 92 면적 / 104 확인
// / 86 매물상태 / 64 매칭 / 60 광고 / 66 거래 / 150 가격 / 76 월세 / 116 입주 / 300 메모
// 관리비(88)/융자금(96) 옵션 컬럼은 월세 뒤에 삽입된다.
// 유형~광고 6개 컬럼은 호수 헤더의 ± 버튼으로 접을 수 있고, 접힌 공간은 메모가 흡수한다.
const GRID_FIXED_PREFIX = [40, 234, 54, 88] as const; // 체크/단지/동/호수(±버튼 포함 88)
const GRID_COLLAPSIBLE_MIDDLE = [58, 92, 104, 86, 64, 60] as const; // 유형~광고
const GRID_FIXED_REST = [66, 150, 76] as const; // 거래/가격/월세
const GRID_FIXED_TAIL = [116] as const; // 입주
const MEMO_COLUMN_WIDTH = 300;

/** sticky 고정 컬럼 left 오프셋: 체크박스 0 / 단지 40 / 동 274 / 호수 328 */
const STICKY_CELL =
  "sticky z-[1] bg-background transition-colors group-hover:bg-muted";

/** 그리드 셀 공통 보더 */
const CELL_BORDER = "border-b border-r border-border/60";

/** 매칭 파이프라인 순서 (packages/shared MatchStage ↔ status-config 라벨) */
const MATCH_STAGE_STEPS = PIPELINE_STEPS.matchStage ?? [];

function getMatchStageIndex(stage: string) {
  return MATCH_STAGE_STEPS.indexOf(stage);
}

const CONFIRMATION_STATE_VALUES = Object.values(IntakeConfirmationState);
const LISTING_AVAILABILITY_VALUES = Object.values(ListingAvailability);
const confirmationStateOptions = CONFIRMATION_STATE_VALUES.map((value) => ({
  value,
  label: getStatusMeta("confirmationState", value).label,
}));

const listingAvailabilityOptions = LISTING_AVAILABILITY_VALUES.map((value) => ({
  value,
  label: getStatusMeta("listingAvailability", value).label,
}));

const transactionTypeOptions = [
  { value: "all", label: "전체" },
  { value: "sale", label: "매매" },
  { value: "jeonse", label: "전세" },
  { value: "monthly", label: "월세" },
] as const;

const confirmationStateFilterOptions = [
  { value: "all", label: "전체" },
  ...confirmationStateOptions,
] as const;

const listingAvailabilityFilterOptions = [
  { value: "all", label: "전체" },
  ...listingAvailabilityOptions,
] as const;

const siteTypeOptions = [
  { value: "all", label: "전체" },
  { value: "apartment", label: "아파트" },
  { value: "officetel", label: "오피스텔" },
  { value: "villa", label: "빌라" },
  { value: "house", label: "단독/다가구" },
  { value: "commercial", label: "상가" },
  { value: "land", label: "토지" },
  { value: "living_accommodation", label: "생활숙박" },
] as const;

interface PropertyFilterState {
  siteId: string;
  confirmationState: string;
  availability: string;
  siteType: string;
  priceMin: string;
  priceMax: string;
  depositMin: string;
  depositMax: string;
  monthlyRentMin: string;
  monthlyRentMax: string;
  areaMin: string;
  areaMax: string;
}

interface StartDealPrompt {
  propertyId: string;
  propertyLabel: string;
  listings: ListingSummary[];
  requiresListingSelection: boolean;
}

interface ResumeClosedPrompt {
  intakeId: string;
  listingIds: string[];
  propertyLabel: string;
  canResume: boolean;
  completedListingCount: number;
  resumableListingCount: number;
}

interface CloseActiveDealsPrompt {
  intakeId: string;
  activeDealCount: number;
  expectedUpdatedAt?: string | null;
}

const initialPropertyFilters: PropertyFilterState = {
  siteId: "",
  confirmationState: "all",
  availability: "all",
  siteType: "all",
  priceMin: "",
  priceMax: "",
  depositMin: "",
  depositMax: "",
  monthlyRentMin: "",
  monthlyRentMax: "",
  areaMin: "",
  areaMax: "",
};

type PropertySheetNoticeTone = QuickSheetNoticeTone;
type PropertySheetNotice = QuickSheetNotice;

// ── Route ───────────────────────────────────────────────────────

type PropertyConfirmationState = (typeof CONFIRMATION_STATE_VALUES)[number];

interface PropertiesSearch {
  /** 대시보드 딥링크: /properties?confirmationState=unverified */
  confirmationState?: PropertyConfirmationState;
}

export const Route = createFileRoute("/_authenticated/properties/")({
  validateSearch: (search: Record<string, unknown>): PropertiesSearch => {
    const value = search.confirmationState;
    return CONFIRMATION_STATE_VALUES.includes(
      value as PropertyConfirmationState,
    )
      ? { confirmationState: value as PropertyConfirmationState }
      : {};
  },
  component: PropertiesPage,
});

function PropertiesPage() {
  const queryClient = useQueryClient();
  const { confirmationState: confirmationStateParam } = Route.useSearch();

  // ── State ─────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedTransactionType, setSelectedTransactionType] =
    useState<(typeof transactionTypeOptions)[number]["value"]>("all");
  const [propertyFilters, setPropertyFilters] = useState<PropertyFilterState>(
    () => ({
      ...initialPropertyFilters,
      ...(confirmationStateParam
        ? { confirmationState: confirmationStateParam }
        : {}),
    }),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [expandedAdRows, setExpandedAdRows] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [expandedMatchRows, setExpandedMatchRows] = useState<
    ReadonlySet<string>
  >(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null,
  );
  const [startDealPrompt, setStartDealPrompt] =
    useState<StartDealPrompt | null>(null);
  const [resumeClosedPrompt, setResumeClosedPrompt] =
    useState<ResumeClosedPrompt | null>(null);
  const [closeActiveDealsPrompt, setCloseActiveDealsPrompt] =
    useState<CloseActiveDealsPrompt | null>(null);

  // 대시보드 딥링크(confirmationState)로 재진입 시 필터 동기화
  useEffect(() => {
    if (!confirmationStateParam) return;
    setPropertyFilters((prev) =>
      prev.confirmationState === confirmationStateParam
        ? prev
        : { ...prev, confirmationState: confirmationStateParam },
    );
  }, [confirmationStateParam]);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([]);
  const [optionalColumns, setOptionalColumns] = useState({
    maintenanceFee: false,
    loanAmount: false,
  });
  const debouncedSearch = useDebouncedValue(search, 300);

  // 유형~광고 접기 (호수 헤더 ± 버튼)
  const [middleCollapsed, setMiddleCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("estate-erp.properties.middle-collapsed") ===
        "1",
  );
  const toggleMiddleCollapsed = useCallback(() => {
    setMiddleCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(
        "estate-erp.properties.middle-collapsed",
        next ? "1" : "0",
      );
      // 접으면 매칭/광고 칩이 숨어 닫을 수단이 없어지므로 열린 하위 패널도 함께 닫는다
      if (next) {
        setExpandedMatchRows(new Set());
        setExpandedAdRows(new Set());
      }
      return next;
    });
  }, []);

  // 옵션 컬럼(관리비/융자금)과 접기 상태를 반영한 grid-template-columns
  const gridColumnWidths = useMemo(() => {
    const widths: number[] = [...GRID_FIXED_PREFIX];
    if (!middleCollapsed) widths.push(...GRID_COLLAPSIBLE_MIDDLE);
    widths.push(...GRID_FIXED_REST);
    if (optionalColumns.maintenanceFee) widths.push(88);
    if (optionalColumns.loanAmount) widths.push(96);
    widths.push(...GRID_FIXED_TAIL, MEMO_COLUMN_WIDTH);
    return widths;
  }, [optionalColumns, middleCollapsed]);
  const gridTemplate = useMemo(() => {
    const columns = gridColumnWidths.map((width) => `${width}px`);
    // 접힘: 줄어든 폭만큼 메모(마지막 컬럼)가 남은 공간을 흡수
    if (middleCollapsed) {
      columns[columns.length - 1] = `minmax(${MEMO_COLUMN_WIDTH}px, 1fr)`;
    }
    return columns.join(" ");
  }, [gridColumnWidths, middleCollapsed]);
  const gridWidth = useMemo(
    () => gridColumnWidths.reduce((total, width) => total + width, 0),
    [gridColumnWidths],
  );

  const { data: filterSites = [], isLoading: isFilterSitesLoading } = useQuery({
    queryKey: ["listings", "filter-sites"],
    queryFn: () => api.listings.filterSites(),
    staleTime: 5 * 60_000,
  });

  const sitesById = useMemo(
    () => new Map(filterSites.map((site) => [site.id, site])),
    [filterSites],
  );

  // ── Derive API params from filters ────────────────────────────
  const apiParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      limit: LISTINGS_PAGE_SIZE,
      search: debouncedSearch.trim() || undefined,
      ...buildListingFilterParams(propertyFilters),
    };

    if (selectedTransactionType !== "all") {
      params.transactionType = selectedTransactionType;
    }

    if (activeSorts.length > 0) {
      params.sortBy = activeSorts[0].field;
      params.sortOrder = activeSorts[0].direction;
    }

    return params;
  }, [debouncedSearch, propertyFilters, selectedTransactionType, activeSorts]);

  // ── Query ─────────────────────────────────────────────────────
  const {
    data,
    isLoading,
    isError,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["listings", apiParams],
    queryFn: ({ pageParam }) =>
      api.listings.findAll({ ...apiParams, page: pageParam } as any),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page: currentPage, totalPages } = lastPage.pagination;
      return currentPage < totalPages ? currentPage + 1 : undefined;
    },
  });

  const mapApiParams = useMemo(() => {
    const params = { ...apiParams };
    delete params.limit;
    if (params.sortBy === "price") {
      delete params.sortBy;
      delete params.sortOrder;
    }
    return params as ListingIntakesFilter;
  }, [apiParams]);

  const {
    data: mapData,
    isLoading: isMapLoading,
    isError: isMapError,
    refetch: refetchMap,
  } = useQuery({
    queryKey: ["listing-intakes", "map", mapApiParams],
    queryFn: () => api.listingIntakes.map(mapApiParams),
    enabled: viewMode === "map",
    staleTime: 30_000,
  });

  // 의뢰 컨텍스트는 listings 응답의 listing.intake 에 실려 온다 —
  // 별도 오버레이 쿼리 없음 (이중 조회 + limit 정합성 구멍 제거).

  const listings = useMemo(
    () => data?.pages.flatMap((pageData) => pageData.items) ?? [],
    [data?.pages],
  );
  const totalListings = data?.pages[0]?.pagination.total ?? 0;
  const loadedListings = listings.length;

  const propertyGroups = useMemo(
    () => buildPropertyListingGroups(listings),
    [listings],
  );

  const activeFilterChips = useMemo(
    () => buildActiveFilterChips(search, propertyFilters, sitesById),
    [search, propertyFilters, sitesById],
  );
  const hasActiveFilters =
    activeFilterChips.length > 0 || selectedTransactionType !== "all";
  const selectedSortValue =
    activeSorts.length > 0 &&
    sortOptions.some(
      (option) =>
        option.value === `${activeSorts[0].field}:${activeSorts[0].direction}`,
    )
      ? `${activeSorts[0].field}:${activeSorts[0].direction}`
      : "";

  // ── 낙관적 캐시 패치 헬퍼 ─────────────────────────────────────
  // 목록은 useInfiniteQuery 라 캐시 형태가 { pages: [{ items }] } 다 —
  // { items } 만 패치하면 아무 효과가 없으므로 두 형태 모두 순회한다.
  const patchListingsCache = useCallback(
    (
      shouldPatch: (listingId: string) => boolean,
      patch: Record<string, unknown> | (<T extends object>(listing: T) => T),
    ) => {
      const applyPatch = <T extends object>(listing: T): T =>
        typeof patch === "function" ? patch(listing) : { ...listing, ...patch };
      const patchItems = (items: Listing[]): Listing[] =>
        items.map((listing) => {
          const nextListing = shouldPatch(listing.id)
            ? applyPatch(listing)
            : listing;
          const relatedListings = listing.property?.listings?.map(
            (relatedListing) =>
              shouldPatch(relatedListing.id)
                ? applyPatch(relatedListing)
                : relatedListing,
          );
          if (!relatedListings || !nextListing.property) return nextListing;
          return {
            ...nextListing,
            property: { ...nextListing.property, listings: relatedListings },
          };
        });

      queryClient.setQueriesData<unknown>(
        { queryKey: ["listings"] },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          if (
            "pages" in old &&
            Array.isArray((old as { pages: unknown }).pages)
          ) {
            const data = old as { pages: Array<{ items?: Listing[] }> };
            return {
              ...data,
              pages: data.pages.map((page) =>
                page.items ? { ...page, items: patchItems(page.items) } : page,
              ),
            };
          }
          if (
            "items" in old &&
            Array.isArray((old as { items: unknown }).items)
          ) {
            const data = old as { items: Listing[] };
            return { ...data, items: patchItems(data.items) };
          }
          return old;
        },
      );
    },
    [queryClient],
  );

  // 낙관적 업데이트 롤백 — listing:field 단위 in-flight 레지스트리.
  // 같은 필드에 A/B mutation 이 겹치면 "기준값(base)"은 최초 writer 진입 시의
  // 서버 값 하나만 기록되고, 마지막 writer 가 실패로 빠질 때만 base 로 복원한다.
  //  - A 실패 → B 진행 중이면 복원하지 않음 (B 소유)
  //  - B 도 실패 → writer 0 이 되는 시점에 base(진짜 서버 값) 복원
  //  - 성공이 하나라도 있으면 복원 없이 invalidate 재동기화에 맡김
  // 전체 스냅샷/단순 이전값 복원이 겹친 mutation 의 낙관적 값을 되살리는 문제를 막는다.
  const pendingEditsRef = useRef(
    new Map<
      string,
      {
        base: unknown;
        writers: number;
        anyFailed: boolean;
        anySucceeded: boolean;
      }
    >(),
  );
  const readListingField = useCallback(
    (listingId: string, field: string): unknown => {
      for (const [, data] of queryClient.getQueriesData({
        queryKey: ["listings"],
      })) {
        if (!data || typeof data !== "object") continue;
        const pages =
          "pages" in data && Array.isArray((data as { pages: unknown }).pages)
            ? (data as { pages: Array<{ items?: Listing[] }> }).pages
            : [data as { items?: Listing[] }];
        for (const page of pages) {
          if (!Array.isArray(page?.items)) continue;
          for (const listing of page.items) {
            if (listing.id === listingId) {
              return (listing as unknown as Record<string, unknown>)[field];
            }
            for (const related of listing.property?.listings ?? []) {
              if (related.id === listingId) {
                return (related as unknown as Record<string, unknown>)[field];
              }
            }
          }
        }
      }
      return undefined;
    },
    [queryClient],
  );
  /** onMutate 에서 호출 — writer 등록 후 정산용 키 목록 반환 */
  const registerOptimisticEdits = useCallback(
    (listingIds: string[], field: string) => {
      const keys: string[] = [];
      for (const listingId of listingIds) {
        const key = `${listingId}:${field}`;
        const entry = pendingEditsRef.current.get(key);
        if (entry) {
          entry.writers += 1;
        } else {
          pendingEditsRef.current.set(key, {
            base: readListingField(listingId, field),
            writers: 1,
            anyFailed: false,
            anySucceeded: false,
          });
        }
        keys.push(key);
      }
      return keys;
    },
    [readListingField],
  );
  /** onSuccess/onError 에서 호출 — 마지막 writer 가 전원 실패로 끝났을 때만 base 복원 */
  const settleOptimisticEdits = useCallback(
    (keys: string[], outcome: "success" | "error") => {
      for (const key of keys) {
        const entry = pendingEditsRef.current.get(key);
        if (!entry) continue;
        entry.writers -= 1;
        if (outcome === "error") entry.anyFailed = true;
        else entry.anySucceeded = true;
        if (entry.writers > 0) continue;
        pendingEditsRef.current.delete(key);
        if (entry.anyFailed && !entry.anySucceeded) {
          const sep = key.indexOf(":");
          const listingId = key.slice(0, sep);
          const field = key.slice(sep + 1);
          patchListingsCache((id) => id === listingId, { [field]: entry.base });
        }
      }
    },
    [patchListingsCache],
  );

  // ── Inline edit mutation ──────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      field,
      value,
    }: {
      id: string;
      field: string;
      value: unknown;
    }) => api.listings.update(id, { [field]: value }),
    onMutate: async ({ id, field, value }) => {
      await queryClient.cancelQueries({ queryKey: ["listings"] });
      const keys = registerOptimisticEdits([id], field);
      patchListingsCache((listingId) => listingId === id, { [field]: value });
      return { keys };
    },
    onSuccess: (_data, _variables, context) => {
      settleOptimisticEdits(context?.keys ?? [], "success");
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (error: Error, _variables, context) => {
      toast.error(error.message || "변경 사항 저장에 실패했습니다.");
      settleOptimisticEdits(context?.keys ?? [], "error");
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
  });

  const handleCellSave = useCallback(
    (recordId: string, field: string, value: unknown) => {
      updateMutation.mutate({ id: recordId, field, value });
    },
    [updateMutation],
  );

  // ── 의뢰 생명주기 전환 — 확인 이력·Deal 상태와 독립적으로 변경 ──
  const rowLifecycleMutation = useMutation({
    mutationFn: ({
      intakeId,
      value,
    }: {
      intakeId: string;
      listingIds: string[];
      value: IntakeLifecycleStatus;
    }) =>
      api.listingIntakes.updateLifecycleStatus(intakeId, value, {
        closedReason:
          value === IntakeLifecycleStatus.CLOSED
            ? IntakeClosedReason.WITHDRAWN
            : null,
      }),
    onMutate: async ({ listingIds, value }) => {
      await queryClient.cancelQueries({ queryKey: ["listings"] });
      const idSet = new Set(listingIds);
      patchListingsCache(
        (listingId) => idSet.has(listingId),
        <T extends object>(listing: T): T => {
          const intake = (
            listing as {
              intake?: {
                lifecycleStatus: string;
                lifecycleChangedAt: string;
                lifecycleChangedBy: string;
                closedReason: string | null;
              };
            }
          ).intake;
          return intake
            ? {
                ...listing,
                intake: {
                  ...intake,
                  lifecycleStatus: value,
                  lifecycleChangedAt: new Date().toISOString(),
                  lifecycleChangedBy: "user",
                  closedReason:
                    value === IntakeLifecycleStatus.CLOSED
                      ? IntakeClosedReason.WITHDRAWN
                      : null,
                },
              }
            : listing;
        },
      );
      return {};
    },
    onSettled: () => {
      // 생명주기는 파생 체인(그리드·시트·네트워크 노출)까지 바꾼다.
      invalidateListingDerivedCaches(queryClient);
    },
    onError: (error: Error) => {
      toast.error(error.message || "상태 변경에 실패했습니다.");
    },
  });
  const closeActiveDealsMutation = useMutation({
    mutationFn: ({
      intakeId,
      expectedUpdatedAt,
    }: CloseActiveDealsPrompt) =>
      api.listingIntakes.closeWithActiveDeals(intakeId, {
        expectedUpdatedAt,
      }),
    onSuccess: () => {
      toast.success("거래와 매물이 종료되었습니다.");
      setCloseActiveDealsPrompt(null);
    },
    onSettled: () => invalidateListingDerivedCaches(queryClient),
    onError: (error: Error) => {
      toast.error(error.message || "거래와 매물 종료에 실패했습니다.");
    },
  });

  const handleRowStatusSave = useCallback(
    ({
      intake,
      listings,
      propertyId,
      propertyLabel,
      value,
    }: {
      intake: IntakeRowSummary;
      listings: ListingSummary[];
      propertyId: string;
      propertyLabel: string;
      value: ListingAvailability;
    }) => {
      const currentValue = getListingRowAvailability(intake, listings);
      const plan = planListingStatusChange(currentValue, value, listings);

      if (plan.kind === "startDeal") {
        setStartDealPrompt({
          propertyId,
          propertyLabel,
          listings: plan.candidates,
          requiresListingSelection: listings.length > 1,
        });
        return;
      }

      if (plan.kind === "reviewResume") {
        setResumeClosedPrompt({
          intakeId: intake.id,
          listingIds: listings.map((listing) => listing.id),
          propertyLabel,
          canResume: plan.canResume,
          completedListingCount: plan.completedListingCount,
          resumableListingCount: plan.resumableListingCount,
        });
        return;
      }

      if (plan.kind === "closeWithActiveDeals") {
        setCloseActiveDealsPrompt({
          intakeId: intake.id,
          activeDealCount: plan.activeDealCount,
          expectedUpdatedAt: intake.updatedAt,
        });
        return;
      }

      if (plan.kind === "blocked") {
        toast.info(
          plan.reason === "allHaveActiveDeals"
            ? "모든 Listing에 이미 진행 중인 Deal이 있습니다."
            : plan.reason === "completedDeal"
              ? "이미 거래 완료된 Deal이 있어 종료된 Listing입니다. 기존 Deal을 되돌리거나 새 의뢰를 등록해 주세요."
              : plan.reason === "closedIntake"
                ? "의뢰 자체가 종료 상태입니다. 먼저 가용으로 재개해 주세요."
                : plan.reason === "noCandidates"
                  ? "Deal을 생성할 수 있는 Listing이 없습니다."
                  : "거래중 상태는 연결된 Deal에서 단계를 변경하거나 취소해 주세요.",
        );
        return;
      }

      if (plan.kind === "noop") return;

      rowLifecycleMutation.mutate({
        intakeId: intake.id,
        listingIds: listings.map((listing) => listing.id),
        value: plan.lifecycleStatus,
      });
    },
    [rowLifecycleMutation],
  );

  // ── 확인일 갱신 — 의뢰 확인 API에 명시적인 alive 결과를 기록 ──
  const refreshConfirmMutation = useMutation({
    mutationFn: async (intakeIds: string[]) => {
      const results = await Promise.allSettled(
        intakeIds.map((id) =>
          api.listingIntakes.confirm(id, {
            result: IntakeCheckResult.ALIVE,
            channel: "note",
            memo: "매물 목록에서 확인 완료",
          }),
        ),
      );
      const failed = results.filter(
        (result) => result.status === "rejected",
      ).length;
      return { failed, total: results.length };
    },
    onSuccess: ({ failed, total }) => {
      if (failed > 0) {
        toast.error(`${total - failed}건 갱신, ${failed}건 실패했습니다.`);
      } else {
        toast.success(`의뢰 ${total}건의 확인일을 오늘로 갱신했습니다.`);
      }
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "확인일 갱신에 실패했습니다.");
    },
  });

  // ── Filter handlers ───────────────────────────────────────────
  const updatePropertyFilter = useCallback(
    <K extends keyof PropertyFilterState>(
      field: K,
      value: PropertyFilterState[K],
    ) => {
      setPropertyFilters((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleFiltersReset = useCallback(() => {
    setPropertyFilters(initialPropertyFilters);
    setSelectedTransactionType("all");
    setActiveSorts([]);
    setSearch("");
  }, []);

  const handleSortSelect = useCallback((value: string) => {
    if (!value) {
      setActiveSorts([]);
      return;
    }

    const option =
      sortOptions.find((item) => item.value === value) ?? sortOptions[0];
    setActiveSorts([
      { field: option.field, label: option.label, direction: option.direction },
    ]);
  }, []);

  const handleTransactionTabChange = useCallback((transactionType: string) => {
    setSelectedTransactionType(
      transactionType as (typeof transactionTypeOptions)[number]["value"],
    );
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // 무한 스크롤 — 커스텀 그리드 스크롤 컨테이너에서 직접 감지
  const handleGridScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
        handleEndReached();
      }
    },
    [handleEndReached],
  );

  // ── 행 가상화 — 스택/펼침으로 높이가 가변이라 measureElement(ResizeObserver) 실측 사용.
  //    측정 캐시는 행 id에 묶어 정렬/필터로 순서가 바뀌어도 재사용되지 않게 한다 (DataTable과 동일 패턴).
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const getGroupKey = useCallback(
    (index: number) => propertyGroups[index]?.id ?? index,
    [propertyGroups],
  );
  const rowVirtualizer = useVirtualizer({
    count: propertyGroups.length,
    getScrollElement: () => gridScrollRef.current,
    estimateSize: () => 40,
    overscan: 10,
    getItemKey: getGroupKey,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalVirtualSize - virtualRows[virtualRows.length - 1].end
      : 0;

  // 광고/매칭 서브행(행 펼침) 토글
  const toggleAdRow = useCallback((groupId: string) => {
    setExpandedAdRows((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const toggleMatchRow = useCallback((groupId: string) => {
    setExpandedMatchRows((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // ── 벌크 선택 ─────────────────────────────────────────────────
  const toggleGroupSelect = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const selectedGroups = useMemo(
    () => propertyGroups.filter((group) => selectedGroupIds.has(group.id)),
    [propertyGroups, selectedGroupIds],
  );
  const allSelected =
    propertyGroups.length > 0 &&
    propertyGroups.every((group) => selectedGroupIds.has(group.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedGroupIds((prev) => {
      const everySelected =
        propertyGroups.length > 0 &&
        propertyGroups.every((group) => prev.has(group.id));
      return everySelected
        ? new Set()
        : new Set(propertyGroups.map((group) => group.id));
    });
  }, [propertyGroups]);

  const clearSelection = useCallback(() => setSelectedGroupIds(new Set()), []);

  const selectedIntakeIds = useMemo(() => {
    const ids = new Set<string>();
    selectedGroups.forEach((group) =>
      group.listings.forEach((listing) => ids.add(listing.intakeId)),
    );
    return Array.from(ids);
  }, [selectedGroups]);

  const intakeCount = useMemo(() => {
    const ids = new Set<string>();
    listings.forEach((listing) => ids.add(listing.intakeId));
    return ids.size;
  }, [listings]);
  const sortLabel =
    sortOptions.find((option) => option.value === selectedSortValue)?.label ??
    "정렬";

  return (
    <CellEditProvider>
      {/* 레이아웃 래퍼(p-4)의 좌우 패딩을 상쇄해 풀블리드로 — 매물장은 표 중심이라 여백 불필요 */}
      <div className="-mx-4 flex h-[calc(100svh-4rem)] min-h-0 flex-col bg-white">
        {/* 헤더: 거래유형 탭 + 리스트/지도 뷰 토글 + 매물 등록 */}
        <section className="flex flex-wrap items-center gap-2.5 border-b border-border bg-white px-6 py-3">
          <Tabs
            value={selectedTransactionType}
            onValueChange={handleTransactionTabChange}
            className="min-w-0 gap-0"
          >
            <TabsList className="max-w-full justify-start rounded-lg bg-secondary p-[3px]">
              {transactionTypeOptions.map((tab) => {
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex-none rounded-md border-0 px-3 py-[5px] text-[13px] font-medium shadow-none data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                  >
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          <div
            className="flex shrink-0 rounded-lg bg-secondary p-[3px]"
            role="group"
            aria-label="매물 보기 방식"
          >
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[12.5px] font-medium transition-colors",
                viewMode === "list"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutList className="size-3.5" />
              리스트
            </button>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              aria-pressed={viewMode === "map"}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[12.5px] font-medium transition-colors",
                viewMode === "map"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MapIcon className="size-3.5" />
              지도
            </button>
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            asChild
            className="h-[34px] shrink-0 rounded-[9px] px-3.5 text-[13px]"
          >
            <Link to="/properties/new">
              <Plus className="size-3.5" />
              매물 등록
            </Link>
          </Button>
        </section>

        {/* 필터 행: 확인/가용/유형 축 + 단지 검색 + 상세 필터 + 정렬 */}
        <section className="border-b border-border bg-white">
          <div className="flex flex-wrap items-center gap-[7px] px-6 py-2.5">
            <FilterPillSelect
              label="확인"
              value={propertyFilters.confirmationState}
              onChange={(value) =>
                updatePropertyFilter("confirmationState", value)
              }
              options={confirmationStateFilterOptions}
            />
            <FilterPillSelect
              label="가용"
              value={propertyFilters.availability}
              onChange={(value) => updatePropertyFilter("availability", value)}
              options={listingAvailabilityFilterOptions}
            />
            <FilterPillSelect
              label="유형"
              value={propertyFilters.siteType}
              onChange={(value) => updatePropertyFilter("siteType", value)}
              options={siteTypeOptions}
            />
            <div className="w-52 max-w-full">
              <SiteSearchFilter
                sites={filterSites}
                value={propertyFilters.siteId}
                onChange={(value) => updatePropertyFilter("siteId", value)}
                isLoading={isFilterSitesLoading}
                placeholder="단지 선택"
                showCounts
              />
            </div>
            <div className="mx-0.5 h-[18px] w-px bg-border" />
            <div className="relative w-[190px] max-w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="검색"
                className="h-8 rounded-lg border-border bg-muted pl-8 pr-8 text-[13px] shadow-none focus:border-input focus:bg-white"
              />
              {search && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => handleSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="property-filter-panel"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] transition-colors",
                filtersOpen
                  ? "border-foreground/30 bg-secondary text-foreground"
                  : "border-border bg-white text-foreground/80 hover:bg-muted",
              )}
            >
              <SlidersHorizontal className="size-3.5 text-muted-foreground" />
              상세 필터
              <ChevronDown
                className={cn(
                  "size-3 text-muted-foreground transition-transform",
                  filtersOpen && "rotate-180",
                )}
              />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[12.5px] text-foreground/80 hover:bg-muted"
                >
                  <Columns3 className="size-3.5 text-muted-foreground" />
                  컬럼
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuCheckboxItem
                  checked={optionalColumns.maintenanceFee}
                  onCheckedChange={(checked) =>
                    setOptionalColumns((prev) => ({
                      ...prev,
                      maintenanceFee: Boolean(checked),
                    }))
                  }
                >
                  관리비
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={optionalColumns.loanAmount}
                  onCheckedChange={(checked) =>
                    setOptionalColumns((prev) => ({
                      ...prev,
                      loanAmount: Boolean(checked),
                    }))
                  }
                >
                  융자금
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex-1" />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleFiltersReset}
                className="flex h-8 items-center gap-1.5 px-2.5 text-[12.5px] font-medium text-orange hover:text-orange/80"
              >
                <RotateCcw className="size-3.5" />
                초기화
              </button>
            )}
            <Select
              value={selectedSortValue === "" ? SORT_NONE : selectedSortValue}
              onValueChange={(value) =>
                handleSortSelect(value === SORT_NONE ? "" : value)
              }
            >
              <SelectTrigger
                size="sm"
                className="h-8 gap-1.5 rounded-lg border-border bg-white px-3 text-[12.5px] text-foreground/80 shadow-none"
              >
                <ArrowUpDown className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap">{sortLabel}</span>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={SORT_NONE} className="text-[13px]">
                  정렬 없음
                </SelectItem>
                {sortOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="text-[13px]"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            id="property-filter-panel"
            className={cn(
              "mx-6 mb-2.5 space-y-3 rounded-lg border border-border bg-muted/60 p-3",
              !filtersOpen && "hidden",
            )}
          >
            <FilterSection
              title="금액"
              description="가격은 만원 단위입니다. 월세는 보증금과 월세를 함께 좁힐 수 있습니다."
            >
              <RangeFilter
                label="가격"
                unit="만원"
                minValue={propertyFilters.priceMin}
                maxValue={propertyFilters.priceMax}
                onMinChange={(value) => updatePropertyFilter("priceMin", value)}
                onMaxChange={(value) => updatePropertyFilter("priceMax", value)}
              />
              <RangeFilter
                label="보증금"
                unit="만원"
                minValue={propertyFilters.depositMin}
                maxValue={propertyFilters.depositMax}
                onMinChange={(value) =>
                  updatePropertyFilter("depositMin", value)
                }
                onMaxChange={(value) =>
                  updatePropertyFilter("depositMax", value)
                }
              />
              <RangeFilter
                label="월세"
                unit="만원"
                minValue={propertyFilters.monthlyRentMin}
                maxValue={propertyFilters.monthlyRentMax}
                onMinChange={(value) =>
                  updatePropertyFilter("monthlyRentMin", value)
                }
                onMaxChange={(value) =>
                  updatePropertyFilter("monthlyRentMax", value)
                }
              />
            </FilterSection>

            <FilterSection
              title="면적"
              description="공급평형을 평으로 입력합니다."
            >
              <RangeFilter
                label="공급평형"
                unit="평"
                minValue={propertyFilters.areaMin}
                maxValue={propertyFilters.areaMax}
                onMinChange={(value) => updatePropertyFilter("areaMin", value)}
                onMaxChange={(value) => updatePropertyFilter("areaMax", value)}
              />
            </FilterSection>
          </div>

          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-6 pb-2.5">
              {activeFilterChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground/80"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 카운트 바 (+ 선택 시 벌크 액션) */}
        <div className="flex min-h-[33px] flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-6 py-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            매물 {propertyGroups.length.toLocaleString()}개
          </span>
          <span>
            {intakeCount != null
              ? `의뢰 ${intakeCount.toLocaleString()}건 · `
              : ""}
            거래 {loadedListings.toLocaleString()}/
            {totalListings.toLocaleString()}건
          </span>
          {selectedGroups.length > 0 && (
            <div className="ml-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-[22px] items-center rounded-full bg-foreground px-2.5 text-[11.5px] font-semibold tabular-nums text-background">
                {selectedGroups.length}개 선택
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 bg-white px-2 text-[11.5px] font-medium"
                disabled={refreshConfirmMutation.isPending}
                onClick={() => refreshConfirmMutation.mutate(selectedIntakeIds)}
              >
                <RefreshCw className="size-3" />
                확인일 갱신
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 bg-white px-2 text-[11.5px] font-medium"
                onClick={() =>
                  toast.info(
                    "광고 일괄 등록은 준비 중입니다. 매물 상세에서 광고를 등록해 주세요.",
                  )
                }
              >
                <Megaphone className="size-3" />
                광고 등록
              </Button>
              <PropertyBulkActions groups={selectedGroups} />
              <button
                type="button"
                onClick={clearSelection}
                className="px-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                선택 해제
              </button>
            </div>
          )}
        </div>

        <section className="flex min-h-0 flex-1 bg-white">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            {viewMode === "map" ? (
              <PropertyMapView
                items={mapData?.items ?? []}
                isLoading={isMapLoading}
                isError={isMapError}
                truncated={mapData?.truncated ?? false}
                limit={mapData?.limit}
                hasActiveFilters={hasActiveFilters}
                onSelectProperty={setSelectedPropertyId}
                onRetry={() => void refetchMap()}
              />
            ) : isError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
                <p className="text-sm text-muted-foreground">
                  매물 목록을 불러오지 못했습니다.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetch()}
                >
                  <RotateCcw className="size-3.5" />
                  다시 시도
                </Button>
              </div>
            ) : !isLoading && propertyGroups.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                {hasActiveFilters ? (
                  <EmptyState
                    icon={SearchX}
                    title="조건에 맞는 매물이 없습니다"
                    description="검색어나 필터 조건을 조정해 보세요."
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFiltersReset}
                      >
                        필터 초기화
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={Building2}
                    title="등록된 매물이 없습니다"
                    description="첫 매물을 등록하면 의뢰 확인 주기와 거래 현황을 한눈에 관리할 수 있습니다."
                    action={
                      <Button size="sm" asChild>
                        <Link to="/properties/new">
                          <Plus className="size-3.5" />새 매물 등록
                        </Link>
                      </Button>
                    }
                  />
                )}
              </div>
            ) : (
              <div
                ref={gridScrollRef}
                className="min-h-0 flex-1 overflow-auto"
                onScroll={handleGridScroll}
              >
                <div className="w-max min-w-full">
                  {/* 컬럼 헤더 (sticky top) */}
                  <div
                    className="sticky top-0 z-[3] grid bg-background"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div
                      className={cn(
                        "sticky left-0 z-[1] flex h-9 items-center justify-center bg-background",
                        CELL_BORDER,
                      )}
                    >
                      <GridCheckbox
                        checked={allSelected}
                        onToggle={toggleSelectAll}
                        label="전체 선택"
                      />
                    </div>
                    <GridHeaderCell
                      icon={Building2}
                      label="단지"
                      className="sticky left-[40px] z-[1] bg-background"
                    />
                    <GridHeaderCell
                      icon={MapPin}
                      label="동"
                      className="sticky left-[274px] z-[1] bg-background"
                    />
                    <div
                      className={cn(
                        "sticky left-[328px] z-[1] flex h-9 items-center gap-1 whitespace-nowrap border-b border-r border-border/60 border-r-foreground/20 bg-background px-2.5 text-[11.5px] text-muted-foreground/80",
                      )}
                    >
                      <Hash className="size-[13px] shrink-0 text-muted-foreground/60" />
                      호수
                      <button
                        type="button"
                        title={
                          middleCollapsed
                            ? "유형~광고 컬럼 펼치기"
                            : "유형~광고 컬럼 접기"
                        }
                        aria-label={
                          middleCollapsed
                            ? "유형~광고 컬럼 펼치기"
                            : "유형~광고 컬럼 접기"
                        }
                        aria-expanded={!middleCollapsed}
                        onClick={toggleMiddleCollapsed}
                        className="ml-auto flex size-5 shrink-0 items-center justify-center rounded border border-border/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        {middleCollapsed ? (
                          <Plus className="size-3" />
                        ) : (
                          <Minus className="size-3" />
                        )}
                      </button>
                    </div>
                    {!middleCollapsed && (
                      <>
                        <GridHeaderCell icon={Type} label="유형" />
                        <GridHeaderCell icon={Ruler} label="전용면적" />
                        <GridHeaderCell icon={CalendarDays} label="확인" />
                        <GridHeaderCell icon={Tag} label="매물상태" />
                        <GridHeaderCell icon={GitBranch} label="매칭" />
                        <GridHeaderCell icon={Megaphone} label="광고" />
                      </>
                    )}
                    <GridHeaderCell icon={ArrowLeftRight} label="거래유형" />
                    <GridHeaderCell icon={CircleDollarSign} label="가격" />
                    <GridHeaderCell icon={CircleDollarSign} label="월세" />
                    {optionalColumns.maintenanceFee && (
                      <GridHeaderCell icon={CircleDollarSign} label="관리비" />
                    )}
                    {optionalColumns.loanAmount && (
                      <GridHeaderCell icon={CircleDollarSign} label="융자금" />
                    )}
                    <GridHeaderCell icon={DoorOpen} label="입주" />
                    <GridHeaderCell icon={FileText} label="메모" last />
                  </div>

                  {isLoading ? (
                    <div
                      className="space-y-1.5 px-6 py-4"
                      style={{ width: gridWidth }}
                    >
                      {Array.from({ length: 8 }).map((_, index) => (
                        <Skeleton
                          key={index}
                          className="h-10 w-full max-w-[1200px] rounded-md"
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      {paddingTop > 0 && (
                        <div
                          style={{ height: paddingTop }}
                          aria-hidden="true"
                        />
                      )}
                      {virtualRows.map((virtualRow) => {
                        const group = propertyGroups[virtualRow.index];
                        if (!group) return null;
                        return (
                          // 래퍼 div가 행+펼침 패널 전체 높이를 실측 대상으로 노출
                          <div
                            key={group.id}
                            data-index={virtualRow.index}
                            ref={rowVirtualizer.measureElement}
                          >
                            <PropertyGridRow
                              group={group}
                              gridTemplate={gridTemplate}
                              gridWidth={gridWidth}
                              optionalColumns={optionalColumns}
                              middleCollapsed={middleCollapsed}
                              intake={pickPrimaryIntake(group.listings)}
                              selected={selectedGroupIds.has(group.id)}
                              onToggleSelect={() => toggleGroupSelect(group.id)}
                              onOpenSheet={() =>
                                setSelectedPropertyId(group.propertyId)
                              }
                              onSave={handleCellSave}
                              onRowStatusSave={handleRowStatusSave}
                              matchOpen={expandedMatchRows.has(group.id)}
                              adOpen={expandedAdRows.has(group.id)}
                              onToggleMatch={() => toggleMatchRow(group.id)}
                              onToggleAd={() => toggleAdRow(group.id)}
                              onRefreshConfirm={() =>
                                refreshConfirmMutation.mutate(
                                  Array.from(
                                    new Set(
                                      group.listings.map(
                                        (listing) => listing.intakeId,
                                      ),
                                    ),
                                  ),
                                )
                              }
                              refreshPending={refreshConfirmMutation.isPending}
                            />
                          </div>
                        );
                      })}
                      {paddingBottom > 0 && (
                        <div
                          style={{ height: paddingBottom }}
                          aria-hidden="true"
                        />
                      )}
                    </>
                  )}

                  {!isLoading && (hasNextPage || isFetchingNextPage) && (
                    <div
                      className="flex h-10 items-center justify-center text-[11.5px] text-muted-foreground"
                      style={{ width: gridWidth }}
                    >
                      {isFetchingNextPage
                        ? "더 불러오는 중..."
                        : `거래 ${loadedListings.toLocaleString()} / ${totalListings.toLocaleString()}건 표시 · 아래로 스크롤하면 더 불러옵니다`}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
        <PropertyQuickSheet
          propertyId={selectedPropertyId}
          onClose={() => setSelectedPropertyId(null)}
        />
        {startDealPrompt && (
          <StartDealFromStatusDialog
            key={`${startDealPrompt.propertyId}:${startDealPrompt.listings
              .map((listing) => listing.id)
              .join(",")}`}
            prompt={startDealPrompt}
            onClose={() => setStartDealPrompt(null)}
          />
        )}
        {resumeClosedPrompt && (
          <ResumeClosedListingDialog
            key={resumeClosedPrompt.intakeId}
            prompt={resumeClosedPrompt}
            pending={rowLifecycleMutation.isPending}
            onClose={() => setResumeClosedPrompt(null)}
            onResume={() => {
              if (!resumeClosedPrompt.canResume) return;
              rowLifecycleMutation.mutate(
                {
                  intakeId: resumeClosedPrompt.intakeId,
                  listingIds: resumeClosedPrompt.listingIds,
                  value: IntakeLifecycleStatus.OPEN,
                },
                {
                  onSuccess: () => setResumeClosedPrompt(null),
                },
              );
            }}
          />
        )}
        {closeActiveDealsPrompt && (
          <ConfirmDialog
            open
            onOpenChange={(open) => {
              if (!open) setCloseActiveDealsPrompt(null);
            }}
            title="연결된 거래가 있습니다"
            description={`${
              closeActiveDealsPrompt.activeDealCount > 1
                ? `진행 중인 거래 ${closeActiveDealsPrompt.activeDealCount}건을`
                : "진행 중인 거래를"
            } 종료 처리하고 매물도 종료하시겠습니까? 거래는 취소 이력으로 남습니다.`}
            confirmLabel="거래와 매물 종료"
            destructive
            loading={closeActiveDealsMutation.isPending}
            onConfirm={() =>
              closeActiveDealsMutation.mutate(closeActiveDealsPrompt)
            }
          />
        )}
      </div>
    </CellEditProvider>
  );
}

// ── 커스텀 그리드 빌딩 블록 ─────────────────────────────────────

function GridHeaderCell({
  icon: Icon,
  label,
  className,
  last,
}: {
  icon?: typeof Building2;
  label: string;
  className?: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-1.5 whitespace-nowrap border-b border-border/60 px-2.5 text-[11.5px] text-muted-foreground/80",
        !last && "border-r border-r-border/60",
        className,
      )}
    >
      {Icon && (
        <Icon className="size-[13px] shrink-0 text-muted-foreground/60" />
      )}
      {label}
    </div>
  );
}

function GridCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? "행 선택"}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex size-4 items-center justify-center rounded-[5px] border transition-colors",
        checked
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-transparent hover:border-muted-foreground/60",
      )}
    >
      <Check className="size-2.5" strokeWidth={3} />
    </button>
  );
}

/** 리스팅 스택 셀 — 한 호실의 거래(Listing)별로 세로 분할되는 컬럼 (거래/가격/월세/입주 등) */
function ListingStackCell({
  listings,
  className,
  children,
}: {
  listings: ListingSummary[];
  className?: string;
  children: (listing: ListingSummary) => ReactNode;
}) {
  return (
    <div
      className={cn("flex min-w-0 flex-col", CELL_BORDER, className)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing, index) => (
        <div
          key={listing.id}
          data-lane={listings.length > 1 ? index : undefined}
          className={cn(
            "flex min-h-10 min-w-0 flex-1 items-stretch",
            index > 0 && "border-t border-border/60",
          )}
        >
          {children(listing)}
        </div>
      ))}
    </div>
  );
}

/** 확인일 신선도 — 최근(≤7일) success / 오래됨(≤30일) warning / 그 이상 destructive */
function getConfirmFreshness(updatedAt: string | null) {
  const days = updatedAt ? getDaysSince(updatedAt) : null;
  if (days == null) {
    return {
      dot: "bg-muted-foreground/40",
      date: "text-muted-foreground",
      rel: "text-muted-foreground/70",
    };
  }
  if (days <= 7) {
    return {
      dot: "bg-success",
      date: "text-foreground",
      rel: "text-muted-foreground",
    };
  }
  if (days <= 30) {
    return { dot: "bg-warning", date: "text-warning", rel: "text-warning/80" };
  }
  return {
    dot: "bg-destructive",
    date: "text-destructive",
    rel: "text-destructive/80",
  };
}

function PropertyGridRow({
  group,
  gridTemplate,
  gridWidth,
  optionalColumns,
  middleCollapsed,
  intake,
  selected,
  onToggleSelect,
  onOpenSheet,
  onSave,
  onRowStatusSave,
  matchOpen,
  adOpen,
  onToggleMatch,
  onToggleAd,
  onRefreshConfirm,
  refreshPending,
}: {
  group: PropertyListingGroup;
  gridTemplate: string;
  gridWidth: number;
  optionalColumns: { maintenanceFee: boolean; loanAmount: boolean };
  /** 유형~광고 6개 컬럼 접힘 여부 (호수 헤더 ± 버튼) */
  middleCollapsed: boolean;
  intake: IntakeRowSummary | null;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenSheet: () => void;
  onSave: (recordId: string, field: string, value: unknown) => void;
  /** 합성 매물상태 전환. 거래중은 Deal 생성 확인 흐름으로 분기한다. */
  onRowStatusSave: (args: {
    intake: IntakeRowSummary;
    listings: ListingSummary[];
    propertyId: string;
    propertyLabel: string;
    value: ListingAvailability;
  }) => void;
  matchOpen: boolean;
  adOpen: boolean;
  onToggleMatch: () => void;
  onToggleAd: () => void;
  onRefreshConfirm: () => void;
  refreshPending: boolean;
}) {
  const property = group.property;
  const listings = group.listings;
  const latestUpdatedAt = getLatestListingUpdatedAt(group);
  const freshness = getConfirmFreshness(latestUpdatedAt);
  const matchCount = listings.reduce(
    (total, listing) => total + (listing._count?.matches ?? 0),
    0,
  );
  const adCount = listings.reduce(
    (total, listing) =>
      total +
      (listing.activeAdvertisementCount ??
        listing.activeAdvertisements?.length ??
        0),
    0,
  );
  const unitTypeName = getUnitTypeName(property);
  const typeLabel =
    unitTypeName !== "-"
      ? unitTypeName
      : getSiteTypeLabel(property?.site?.type);
  const intakeListings = intake
    ? listings.filter((listing) => listing.intakeId === intake.id)
    : [];
  const rowAvailability = intake
    ? getListingRowAvailability(intake, intakeListings)
    : null;
  const propertyLabel = [
    property?.site?.name,
    getDongName(property),
    property?.unit?.name,
  ]
    .filter((part) => part && part !== "-")
    .join(" ");

  return (
    <div>
      <div
        data-split-row={group.listings.length > 1 ? "" : undefined}
        className="group grid transition-colors hover:bg-muted"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {/* 1. 체크박스 (sticky) */}
        <div
          className={cn(
            "left-0 flex min-h-10 items-center justify-center",
            STICKY_CELL,
            CELL_BORDER,
          )}
        >
          <GridCheckbox checked={selected} onToggle={onToggleSelect} />
        </div>

        {/* 2. 단지 (sticky, 클릭 → 상세 시트) */}
        <button
          type="button"
          onClick={onOpenSheet}
          aria-label={`${property?.site?.name ?? "매물"} 상세 열기`}
          title="매물 상세 열기"
          className={cn(
            "left-[40px] flex min-h-10 cursor-pointer items-center gap-1.5 px-2.5 text-left outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            STICKY_CELL,
            CELL_BORDER,
          )}
        >
          <span className="truncate text-[13.5px] font-semibold text-foreground">
            {property?.site?.name ?? "매물 정보 없음"}
          </span>
          <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/50" />
        </button>

        {/* 3. 동 (sticky) */}
        <div
          className={cn(
            "left-[274px] flex min-h-10 items-center whitespace-nowrap px-2.5 text-[13px] font-medium text-foreground",
            STICKY_CELL,
            CELL_BORDER,
          )}
        >
          {getDongName(property)}
        </div>

        {/* 4. 호수 (sticky, 고정영역 구분 보더) */}
        <div
          className={cn(
            "left-[328px] flex min-h-10 min-w-0 items-center gap-1 whitespace-nowrap pl-2 pr-1 text-[13px] font-medium text-foreground",
            STICKY_CELL,
            "border-b border-r border-border/60 border-r-foreground/20",
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {property?.unit?.name ?? "-"}
          </span>
          <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <PropertyRowActions listings={listings} intake={intake} />
          </div>
        </div>

        {!middleCollapsed && (
          <>
            {/* 5. 유형 */}
            <div
              className={cn(
                "flex min-h-10 items-center whitespace-nowrap px-2 text-[13px] text-foreground/80",
                CELL_BORDER,
              )}
            >
              {typeLabel === "-" ? "" : typeLabel}
            </div>

            {/* 6. 전용면적 (시안 기준 — 공급면적은 툴팁) */}
            <div
              title={supplyAreaTitle(property)}
              className={cn(
                "flex min-h-10 items-center whitespace-nowrap px-2.5 text-[12.5px] tabular-nums text-foreground/80",
                CELL_BORDER,
              )}
            >
              {formatExclusiveArea(property)}
            </div>

            {/* 7. 확인 — 신선도 dot + 확인일 + 상대시간 + hover ⟳ */}
            <div
              className={cn(
                "flex min-h-10 items-center gap-1.5 px-2",
                CELL_BORDER,
              )}
            >
              <span
                className={cn(
                  "size-[7px] shrink-0 rounded-full",
                  freshness.dot,
                )}
              />
              <div className="flex min-w-0 flex-col leading-tight">
                <span
                  className={cn(
                    "text-[12px] font-medium tabular-nums",
                    freshness.date,
                  )}
                >
                  {latestUpdatedAt ? formatDateShort(latestUpdatedAt) : "-"}
                </span>
                <span className={cn("text-[10.5px]", freshness.rel)}>
                  {latestUpdatedAt ? formatDaysAgo(latestUpdatedAt) : ""}
                </span>
              </div>
              <button
                type="button"
                title="오늘로 확인 갱신"
                disabled={refreshPending}
                onClick={(event) => {
                  event.stopPropagation();
                  onRefreshConfirm();
                }}
                className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 disabled:opacity-40 group-hover:opacity-100"
              >
                <RefreshCw className="size-3.5" />
              </button>
            </div>

            {/* 8. 매물상태 — lifecycle + Deal에서 합성, 거래중 선택은 Deal 생성 */}
            <div className={cn("flex min-h-10 items-center px-1", CELL_BORDER)}>
              {intake && rowAvailability && (
                <EditableCell
                  recordId={intake.id}
                  field="listingAvailability"
                  value={rowAvailability}
                  onSave={(_recordId, _field, value) => {
                    onRowStatusSave({
                      intake,
                      listings: intakeListings,
                      propertyId: group.propertyId,
                      propertyLabel,
                      value: String(value) as ListingAvailability,
                    });
                  }}
                  editType="select-chip"
                  chipOptions={listingStatusChipOptions}
                >
                  <span className="flex h-full w-full items-center px-0.5">
                    <StatusBadge
                      kind="listingAvailability"
                      status={rowAvailability}
                      size="sm"
                    />
                  </span>
                </EditableCell>
              )}
            </div>

            {/* 9. 매칭 칩 — 클릭 → 연관 구매의뢰 패널 토글 */}
            <div
              className={cn(
                "flex min-h-10 items-center justify-center px-1",
                CELL_BORDER,
              )}
            >
              {matchCount > 0 && (
                <button
                  type="button"
                  title={
                    matchOpen ? "연관 구매의뢰 접기" : "연관 구매의뢰 펼치기"
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleMatch();
                  }}
                  className={cn(
                    "inline-flex h-5 items-center gap-0.5 rounded-full border px-[7px] text-[11px] font-bold tabular-nums transition-colors",
                    matchOpen
                      ? "border-transparent bg-warning text-white"
                      : "border-warning-soft bg-warning-soft/60 text-warning hover:bg-warning-soft",
                  )}
                >
                  <GitBranch className="size-3" />
                  {matchCount}
                </button>
              )}
            </div>

            {/* 10. 광고 칩 — 클릭 → 광고 노출 패널 토글 */}
            <div
              className={cn(
                "flex min-h-10 items-center justify-center px-1",
                CELL_BORDER,
              )}
            >
              {adCount > 0 && (
                <button
                  type="button"
                  title={adOpen ? "광고 현황 접기" : "광고 현황 펼치기"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleAd();
                  }}
                  className={cn(
                    "inline-flex h-5 items-center gap-0.5 rounded-full border px-[7px] text-[11px] font-bold tabular-nums transition-colors",
                    adOpen
                      ? "border-transparent bg-info text-white"
                      : "border-info-soft bg-info-soft/60 text-info hover:bg-info-soft",
                  )}
                >
                  <Megaphone className="size-3" />
                  {adCount}
                </button>
              )}
            </div>
          </>
        )}

        {/* 11. 거래유형 (리스팅 스택) — Deal 상태는 앞의 매물상태 칩이 담당 */}
        <ListingStackCell listings={listings}>
          {(listing) => (
            <div className="flex min-w-0 flex-col items-start justify-center gap-0.5 px-2 py-1">
              <TransactionMiniLabel transactionType={listing.transactionType} />
            </div>
          )}
        </ListingStackCell>

        {/* 12. 가격 (인라인 수정 + 보류 태그) */}
        <ListingStackCell listings={listings}>
          {(listing) => (
            <EditableCell
              recordId={listing.id}
              field={
                listing.transactionType === "monthly" ? "deposit" : "price"
              }
              value={
                listing.transactionType === "monthly"
                  ? listing.deposit
                  : listing.price
              }
              onSave={onSave}
              editType="number"
            >
              <span className="flex h-full w-full min-w-0 items-center gap-1.5 px-2.5">
                <PriceDepositValue listing={listing} />
                {listing.isPaused && (
                  <span className="shrink-0 rounded-[4px] bg-neutral-soft px-1 py-px text-[10px] font-semibold text-muted-foreground">
                    보류
                  </span>
                )}
              </span>
            </EditableCell>
          )}
        </ListingStackCell>

        {/* 13. 월세 */}
        <ListingStackCell listings={listings}>
          {(listing) =>
            listing.transactionType === "monthly" ? (
              <EditableCell
                recordId={listing.id}
                field="monthlyRent"
                value={listing.monthlyRent}
                onSave={onSave}
                editType="number"
              >
                <span className="flex h-full w-full items-center px-2.5">
                  <MonthlyRentValue listing={listing} />
                </span>
              </EditableCell>
            ) : (
              <span className="flex h-full w-full items-center px-2.5 text-[13px] text-muted-foreground/60">
                -
              </span>
            )
          }
        </ListingStackCell>

        {/* (옵션) 관리비 / 융자금 */}
        {optionalColumns.maintenanceFee && (
          <ListingStackCell listings={listings}>
            {(listing) => (
              <EditableCell
                recordId={listing.id}
                field="maintenanceFee"
                value={listing.maintenanceFee}
                onSave={onSave}
                editType="number"
              >
                <span className="flex h-full w-full items-center px-2.5 text-[12.5px] font-medium tabular-nums">
                  {listing.maintenanceFee
                    ? formatMoney(listing.maintenanceFee)
                    : "-"}
                </span>
              </EditableCell>
            )}
          </ListingStackCell>
        )}
        {optionalColumns.loanAmount && (
          <ListingStackCell listings={listings}>
            {(listing) => (
              <EditableCell
                recordId={listing.id}
                field="loanAmount"
                value={listing.loanAmount}
                onSave={onSave}
                editType="number"
              >
                <span className="flex h-full w-full items-center px-2.5 text-[12.5px] font-medium tabular-nums">
                  {listing.loanAmount ? formatMoney(listing.loanAmount) : "-"}
                </span>
              </EditableCell>
            )}
          </ListingStackCell>
        )}

        {/* 14. 입주 */}
        <ListingStackCell listings={listings}>
          {(listing) => (
            <EditableCell
              recordId={listing.id}
              field="moveInAvailableType"
              value={listing}
              chipValueOf={(v) =>
                (v as ListingSummary | undefined)?.moveInAvailableType ??
                "unknown"
              }
              onSave={onSave}
              onChipSave={(recordId, payload) => {
                onSave(recordId, "moveInAvailableType", payload.type);
                if (payload.dateWrites) {
                  for (const write of payload.dateWrites) {
                    onSave(recordId, write.field, write.value);
                  }
                }
              }}
              editType="select-chip"
              chipOptions={moveInAvailableChipOptions}
            >
              <span className="flex h-full w-full items-center px-2">
                <MoveInAvailableSummary listing={listing} />
              </span>
            </EditableCell>
          )}
        </ListingStackCell>

        {/* 15. 메모 (1줄 ellipsis, 인라인 수정) — 마지막 컬럼이라 border-r 만 제거 */}
        <ListingStackCell listings={listings} className="border-r-0">
          {(listing) => (
            <EditableCell
              recordId={listing.id}
              field="memo"
              value={listing.memo ?? ""}
              onSave={onSave}
              editType="text"
            >
              <span className="flex h-full w-full min-w-0 items-center px-2.5">
                <span
                  className={cn(
                    "truncate text-[12.5px]",
                    listing.memo?.trim()
                      ? "text-foreground/80"
                      : "text-muted-foreground/50",
                  )}
                >
                  {listing.memo?.trim() || "-"}
                </span>
              </span>
            </EditableCell>
          )}
        </ListingStackCell>
      </div>

      {/* 펼침 패널 — 연관 구매의뢰 / 광고 노출 */}
      {matchOpen && <PropertyMatchPanel group={group} width={gridWidth} />}
      {adOpen && <PropertyAdPanel group={group} width={gridWidth} />}
    </div>
  );
}

/** 전용면적 m² — 시안 기준 전용면적 단일 표기 (공급면적은 title 툴팁으로 보조) */
function formatExclusiveArea(property?: ListingProperty) {
  const exclusive = getExclusiveAreaM2(property);
  const trim = (value: number | string) => {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? String(Math.round(numeric * 10) / 10)
      : null;
  };
  const label = exclusive != null ? trim(exclusive) : null;
  return label ? `${label}㎡` : "";
}

function supplyAreaTitle(property?: ListingProperty) {
  const supply =
    property?.unit?.supplyAreaM2 ?? property?.unit?.siteUnitType?.supplyAreaM2;
  const numeric = Number(supply);
  return Number.isFinite(numeric) && supply != null
    ? `공급 ${Math.round(numeric * 10) / 10}㎡`
    : undefined;
}

// ── 펼침 패널: 연관 구매의뢰 (amber) ────────────────────────────

function PropertyMatchPanel({
  group,
  width,
}: {
  group: PropertyListingGroup;
  width: number;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const listingIds = useMemo(
    () => group.listings.map((listing) => listing.id),
    [group.listings],
  );

  // 펼칠 때 lazy fetch — 스택 거래별 병렬 조회 후 합치기
  const { data: matches = [], isLoading } = useQuery({
    queryKey: [
      "matches",
      "property-list-panel",
      group.id,
      listingIds.join(","),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        listingIds.map((listingId) => api.matches.findAll({ listingId })),
      );
      return results.flat();
    },
  });

  const stageMutation = useMutation({
    mutationFn: ({ matchId, stage }: { matchId: string; stage: string }) =>
      api.matches.updateStage(matchId, { stage }),
    onSuccess: () => {
      toast.success("매칭 단계를 변경했습니다.");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "매칭 단계 변경에 실패했습니다.");
    },
  });

  const sortedMatches = useMemo(
    () =>
      matches
        .slice()
        .sort(
          (a, b) => getMatchStageIndex(b.stage) - getMatchStageIndex(a.stage),
        ),
    [matches],
  );

  return (
    <div
      className="border-b border-border bg-warning-soft/30 py-3 pl-[60px] pr-4"
      style={{ width }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <GitBranch className="size-3.5 text-warning" />
        <span className="text-xs font-semibold text-warning">
          연관 구매의뢰 {matches.length}건
        </span>
        <span className="text-[11.5px] text-warning/60">· 진행 단계순</span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-warning-soft bg-white px-2.5 text-[11.5px] font-semibold text-warning hover:bg-warning-soft/40 hover:text-warning"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-3" />
          매칭 생성
        </Button>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">
          구매의뢰를 불러오는 중...
        </p>
      ) : sortedMatches.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          연결된 구매의뢰가 없습니다.
        </p>
      ) : (
        <div className="flex max-w-[960px] flex-col gap-1.5">
          {sortedMatches.map((match) => (
            <MatchPanelCard
              key={match.id}
              match={match}
              pending={stageMutation.isPending}
              onStageChange={(stage) =>
                stageMutation.mutate({ matchId: match.id, stage })
              }
            />
          ))}
        </div>
      )}
      <MatchCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        matches={matches}
      />
    </div>
  );
}

function MatchPanelCard({
  match,
  pending,
  onStageChange,
}: {
  match: Match;
  pending: boolean;
  onStageChange: (stage: string) => void;
}) {
  const buyer = match.buyerRequirement;
  const buyerName = buyer?.contact?.name ?? "구매자 미상";
  const buyerPhone = buyer?.contact?.phone;
  const tagItems = [
    buyer?.transactionType
      ? `${getStatusMeta("transactionType", buyer.transactionType).label} 희망`
      : null,
    buyer?.urgency ? getStatusMeta("buyerUrgency", buyer.urgency).label : null,
  ].filter(Boolean);
  const currentIndex = getMatchStageIndex(match.stage);

  return (
    <div className="rounded-lg border border-warning-soft bg-white px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2.5">
        <UserRound className="size-4 shrink-0 text-muted-foreground" />
        <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">
          {buyerName}
        </span>
        {tagItems.length > 0 && (
          <span className="truncate text-[11px] text-muted-foreground">
            {tagItems.join(" · ")}
          </span>
        )}
        <div className="h-3.5 w-px shrink-0 bg-border" />
        <span className="shrink-0 text-[11px] text-muted-foreground/70">
          예산
        </span>
        <span className="whitespace-nowrap text-[12px] font-medium tabular-nums text-foreground">
          {formatBuyerBudget(buyer)}
        </span>
        <div className="min-w-0 flex-1" />
        {buyerPhone && (
          <Button variant="outline" size="icon-sm" className="shrink-0" asChild>
            <a href={`tel:${buyerPhone}`} aria-label={`${buyerName} 전화`}>
              <Phone className="size-3.5" />
            </a>
          </Button>
        )}
      </div>
      <div className="flex items-center overflow-x-auto pb-0.5">
        {MATCH_STAGE_STEPS.map((stage, index) => {
          const meta = getStatusMeta("matchStage", stage);
          const isCurrent = stage === match.stage;
          const isPassed = currentIndex >= 0 && index < currentIndex;
          return (
            <Fragment key={stage}>
              <button
                type="button"
                disabled={pending || isCurrent}
                onClick={() => onStageChange(stage)}
                className={cn(
                  "inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors disabled:cursor-default",
                  isCurrent
                    ? "border-foreground bg-foreground text-background"
                    : isPassed
                      ? "border-transparent bg-warning-soft/70 text-warning hover:bg-warning-soft"
                      : "border-border bg-white text-muted-foreground hover:bg-muted",
                )}
              >
                {meta.label}
                {isCurrent && <ChevronDown className="size-2.5 opacity-70" />}
              </button>
              {index < MATCH_STAGE_STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-3.5 shrink-0",
                    index < currentIndex ? "bg-warning-soft" : "bg-border",
                  )}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** 구매의뢰 예산 라벨 — 월세는 보증금/월세, 그 외는 가격 범위 */
function formatBuyerBudget(buyer?: BuyerRequirement) {
  if (!buyer) return "-";
  if (buyer.transactionType === "monthly") {
    const deposit = buyer.depositMax ?? buyer.depositMin;
    const parts = [
      deposit ? formatMoney(deposit) : null,
      buyer.monthlyRentMax ? `월 ${formatMoney(buyer.monthlyRentMax)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : "-";
  }
  const min = buyer.priceMin ?? buyer.depositMin;
  const max = buyer.priceMax ?? buyer.depositMax;
  if (min && max) return `${formatMoney(min)}~${formatMoney(max)}`;
  if (max) return `~${formatMoney(max)}`;
  if (min) return `${formatMoney(min)}~`;
  return "-";
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function PropertyQuickSheet({
  propertyId,
  onClose,
}: {
  propertyId: string | null;
  onClose: () => void;
}) {
  const { data: property, isLoading } = useQuery({
    queryKey: ["properties", "quick-sheet", propertyId],
    queryFn: () => api.properties.findOne(propertyId as string),
    enabled: Boolean(propertyId),
  });

  return (
    <Sheet
      open={Boolean(propertyId)}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent
        side="right"
        className="!w-full !max-w-full !gap-0 overflow-hidden p-0 sm:!max-w-[720px]"
      >
        {propertyId && isLoading && <PropertySheetSkeleton />}
        {propertyId && !isLoading && property && (
          <PropertySheetContent property={property} onClose={onClose} />
        )}
        {propertyId && !isLoading && !property && (
          <div className="flex h-full flex-col">
            <SheetHeader className="sr-only">
              <SheetTitle>매물을 찾을 수 없습니다</SheetTitle>
              <SheetDescription>
                요청하신 매물 정보가 존재하지 않습니다.
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              매물을 찾을 수 없습니다.
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PropertySheetSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="sr-only">
        <SheetTitle>매물 빠른 확인</SheetTitle>
        <SheetDescription>매물 정보를 불러오는 중입니다.</SheetDescription>
      </SheetHeader>
      <div className="space-y-3 border-b px-6 py-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="space-y-5 p-6">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  );
}

function PropertySheetContent({
  property,
  onClose,
}: {
  property: Property;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const listings = (property.listings ?? [])
    .slice()
    .sort(comparePropertyListing);
  const contacts = property.propertyContacts ?? [];
  const tenants = property.tenants ?? [];
  const consultations = property.consultations ?? [];
  const title = property.site?.name ?? "매물 상세";
  const unitLabel = getPropertySheetUnitLabel(property);
  const unitTypeName = property.unit?.siteUnitType?.name;
  const floorLabel = property.unit?.floor ? `${property.unit.floor}층` : null;
  const unitSummaryItems = [
    unitTypeName ? `${unitTypeName}타입` : null,
    floorLabel,
  ].filter(Boolean);
  const address =
    property.site?.roadAddress ?? property.site?.jibunAddress ?? "주소 미등록";
  const owner =
    contacts.find((contact) => contact.role === "owner") ?? contacts[0];
  const ownerPhone = owner?.contact?.phone;
  const areaLabel = formatPropertySheetArea(property);
  const latestUpdatedAt = getLatestPropertyListingUpdatedAt(property);
  const notices = getPropertySheetNotices(property);
  const memo = listings.find((listing) => listing.memo?.trim())?.memo?.trim();

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <SheetHeader className="space-y-5 border-b border-border bg-muted/40 px-8 pb-6 pt-5">
        <div className="flex items-center justify-between gap-3 pr-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            빠른 확인
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              onClose();
              void navigate({
                to: "/properties/$id",
                params: { id: property.id },
              });
            }}
          >
            전체 페이지로 열기
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
        <div className="space-y-3">
          <SheetTitle className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[28px] font-bold leading-tight tracking-[-0.02em] text-foreground">
            <span>{title}</span>
            {unitLabel && <span className="text-foreground">{unitLabel}</span>}
          </SheetTitle>
          {unitSummaryItems.length > 0 && (
            <div className="text-[14px] leading-6 text-muted-foreground">
              {unitSummaryItems.join(" · ")}
            </div>
          )}
          <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{address}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Ruler className="size-3.5" />
              {areaLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              확인 {formatDateShort(latestUpdatedAt)}
            </span>
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {listings.map((listing) => (
              <TransactionBadge
                key={listing.id}
                transactionType={listing.transactionType}
              />
            ))}
            {listings[0] && (
              <>
                <StatusIndicator value={getListingAvailability(listings[0])} />
                {listings[0].intake && (
                  <StatusBadge
                    kind="confirmationState"
                    status={getIntakeConfirmationState(listings[0].intake)}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-[13px] font-medium"
            disabled={!ownerPhone}
            asChild={!!ownerPhone}
          >
            {ownerPhone ? (
              <a href={`tel:${ownerPhone}`}>
                <Phone className="size-3.5" />
                {owner?.contact?.name ?? "소유주"} 전화
              </a>
            ) : (
              <span>
                <Phone className="size-3.5" />
                소유주 연락처 없음
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-[13px] font-medium"
            asChild
          >
            <Link to="/properties/$id" params={{ id: property.id }}>
              <MessageSquare className="size-3.5" />
              상담 기록
            </Link>
          </Button>
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
        <SheetSection title="지금 확인할 것">
          {notices.length > 0 ? (
            <div className="space-y-2">
              {notices.map((notice) => (
                <SheetNoticeRow
                  key={`${notice.title}-${notice.detail}`}
                  notice={notice}
                />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="즉시 확인할 운영 이슈가 없습니다." compact />
          )}
        </SheetSection>

        <SheetSection title={`거래 카드 ${listings.length}`}>
          {listings.length > 0 ? (
            <div className="grid gap-2">
              {listings.map((listing) => (
                <PropertySheetListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="등록된 거래 정보가 없습니다." />
          )}
        </SheetSection>

        <SheetSection
          title={`가격 변경 ${getPropertySheetPriceHistoryCount(listings)}`}
        >
          <PropertySheetPriceHistoryList listings={listings} />
        </SheetSection>

        <SheetSection
          title={`광고 ${getPropertySheetAdvertisementCount(listings)}`}
        >
          <PropertySheetAdvertisementList listings={listings} />
        </SheetSection>

        <SheetSection title={`연락처 ${contacts.length + tenants.length}`}>
          {contacts.length > 0 || tenants.length > 0 ? (
            <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
              {contacts.map((contact) => (
                <PropertySheetContactRow
                  key={contact.id}
                  propertyContact={contact}
                />
              ))}
              {tenants.map((tenant) => (
                <PropertySheetTenantRow key={tenant.id} tenant={tenant} />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="등록된 소유주, 대리인, 임차인이 없습니다." />
          )}
        </SheetSection>

        <SheetSection title="최근 상담 / 메모">
          <div className="space-y-2">
            {memo && (
              <div className="rounded-md border border-[#eeeeec] bg-slate-50/60 p-3">
                <div className="mb-1 text-[11px] font-medium text-slate-500">
                  매물 메모
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {memo}
                </p>
              </div>
            )}
            {consultations.slice(0, 3).map((consultation) => (
              <PropertySheetConsultationRow
                key={consultation.id}
                consultation={consultation}
              />
            ))}
            {!memo && consultations.length === 0 && (
              <SheetEmptyState text="상담 기록과 메모가 없습니다." compact />
            )}
          </div>
        </SheetSection>
      </div>
    </div>
  );
}

// SheetSection / SheetEmptyState / SheetNoticeRow / 날짜 헬퍼는 @/components/quick-sheet 에서 import.

function PropertySheetListingCard({ listing }: { listing: PropertyListing }) {
  return (
    <div className="rounded-md border border-border bg-white p-3 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <TransactionBadge transactionType={listing.transactionType} />
          <StatusIndicator value={getListingAvailability(listing)} />
          <JointBrokerageBadge intake={listing.intake} />
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          확인 {formatDateShort(listing.updatedAt)}
        </span>
      </div>
      <div className="mt-2 text-[18px] font-semibold tracking-[-0.01em] text-foreground">
        <PriceCell
          transactionType={listing.transactionType}
          price={listing.price}
          deposit={listing.deposit}
          monthlyRent={listing.monthlyRent}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
        <span>등록 {formatDateShort(listing.createdAt)}</span>
        <span>확인 {formatDaysAgo(listing.updatedAt)}</span>
      </div>
      <ListingCostSummary
        listing={listing as PropertyListing & ListingCostExtras}
      />
      {listing.memo?.trim() && (
        <p className="mt-2.5 line-clamp-2 border-l-2 border-border pl-2.5 text-[12px] leading-5 text-muted-foreground">
          {listing.memo.trim()}
        </p>
      )}
    </div>
  );
}

function PropertySheetPriceHistoryList({
  listings,
}: {
  listings: PropertyListing[];
}) {
  const historyRows = listings
    .flatMap((listing) =>
      (listing.priceHistories ?? []).map((history) => ({
        listing,
        history,
      })),
    )
    .sort(
      (a, b) =>
        new Date(b.history.createdAt).getTime() -
        new Date(a.history.createdAt).getTime(),
    );

  if (historyRows.length === 0) {
    return <SheetEmptyState text="등록된 가격 변경 이력이 없습니다." compact />;
  }

  return (
    <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
      {historyRows.map(({ listing, history }) => (
        <PropertySheetPriceHistoryRow
          key={history.id}
          listing={listing}
          history={history}
        />
      ))}
    </div>
  );
}

function PropertySheetPriceHistoryRow({
  listing,
  history,
}: {
  listing: PropertyListing;
  history: NonNullable<PropertyListing["priceHistories"]>[number];
}) {
  const beforePrice = formatPriceHistorySnapshot(listing.transactionType, {
    price: history.priceBefore,
    deposit: history.depositBefore,
    monthlyRent: history.monthlyRentBefore,
  });
  const afterPrice = formatPriceHistorySnapshot(listing.transactionType, {
    price: history.priceAfter,
    deposit: history.depositAfter,
    monthlyRent: history.monthlyRentAfter,
  });

  return (
    <div className="px-3 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <TransactionBadge transactionType={listing.transactionType} />
        <span className="text-[11px] text-slate-500">
          {formatDateTime(history.createdAt)}
        </span>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="font-medium tabular-nums text-slate-500">
          {beforePrice}
        </span>
        <span className="text-slate-300">→</span>
        <span className="font-semibold tabular-nums text-slate-950">
          {afterPrice}
        </span>
      </div>
      {history.reason?.trim() && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">
          {history.reason.trim()}
        </p>
      )}
    </div>
  );
}

function PropertySheetAdvertisementList({
  listings,
}: {
  listings: PropertyListing[];
}) {
  const advertisementRows = listings.flatMap((listing) =>
    (listing.advertisements ?? []).map((advertisement) => ({
      listing,
      advertisement,
    })),
  );

  if (advertisementRows.length === 0) {
    return <SheetEmptyState text="등록된 광고 기록이 없습니다." compact />;
  }

  return (
    <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
      {advertisementRows.map(({ listing, advertisement }) => (
        <PropertySheetAdvertisementRow
          key={advertisement.id}
          listing={listing}
          advertisement={advertisement}
        />
      ))}
    </div>
  );
}

function PropertySheetAdvertisementRow({
  listing,
  advertisement,
}: {
  listing: PropertyListing;
  advertisement: NonNullable<PropertyListing["advertisements"]>[number];
}) {
  const priceLabel = formatAdvertisementPrice(listing, advertisement);
  const dateItems = [
    advertisement.startedAt
      ? `시작 ${formatDateShort(advertisement.startedAt)}`
      : null,
    advertisement.endedAt
      ? `종료 ${formatDateShort(advertisement.endedAt)}`
      : null,
    advertisement.lastCheckedAt
      ? `확인 ${formatDateShort(advertisement.lastCheckedAt)}`
      : null,
    advertisement.lastSyncedAt
      ? `동기화 ${formatDateShort(advertisement.lastSyncedAt)}`
      : null,
  ].filter(Boolean);

  return (
    <div className="px-3 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <TransactionBadge transactionType={listing.transactionType} />
        <StatusBadge kind="adStatus" status={advertisement.status} size="sm" />
        {advertisement.url ? (
          <a
            href={advertisement.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] font-medium leading-5 text-[#5f5e5b] hover:bg-[#e9e9e7]"
          >
            <span className="truncate">
              {getAdChannelLabel(advertisement.channel)}
            </span>
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="inline-flex rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] font-medium leading-5 text-[#5f5e5b]">
            {getAdChannelLabel(advertisement.channel)}
          </span>
        )}
        <span className="rounded-[4px] bg-[#f8f5f0] px-1.5 py-0.5 text-[11px] leading-5 text-[#8f6b1f]">
          {getAdvertisementSourceLabel(advertisement.source)}
        </span>
      </div>
      <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="min-w-0">
          <span className="text-slate-400">광고가 </span>
          <span className="font-medium text-slate-900">{priceLabel}</span>
        </div>
        <div className="min-w-0 truncate">
          <span className="text-slate-400">기간 </span>
          <span>{dateItems.length > 0 ? dateItems.join(" · ") : "-"}</span>
        </div>
      </div>
      {advertisement.memo?.trim() && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
          {advertisement.memo.trim()}
        </p>
      )}
    </div>
  );
}

function PropertySheetContactRow({
  propertyContact,
}: {
  propertyContact: PropertyContact;
}) {
  const name = propertyContact.contact?.name ?? "이름 없음";
  const phone = propertyContact.contact?.phone;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {name}
          </span>
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
            {getContactRoleLabel(propertyContact.role)}
          </span>
          {propertyContact.isPrimary && (
            <span className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] text-[#337ea9]">
              주 연락처
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {phone ? formatPhone(phone) : "연락처 없음"}
          {propertyContact.memo ? ` · ${propertyContact.memo}` : ""}
        </p>
      </div>
      {phone && (
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={`tel:${phone}`} aria-label={`${name} 전화`}>
            <Phone className="size-3.5" />
          </a>
        </Button>
      )}
    </div>
  );
}

function PropertySheetTenantRow({ tenant }: { tenant: Tenant }) {
  const name = tenant.contact?.name ?? "이름 없음";
  const phone = tenant.contact?.phone;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {name}
          </span>
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
            임차인
          </span>
          <span className="rounded-[4px] bg-[#fbf3db] px-1.5 py-0.5 text-[11px] text-[#8f6b1f]">
            {getTenantStatusLabel(tenant.status)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {phone ? formatPhone(phone) : "연락처 없음"} ·{" "}
          {getTenantPeriodLabel(tenant)}
        </p>
      </div>
      {phone && (
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={`tel:${phone}`} aria-label={`${name} 전화`}>
            <Phone className="size-3.5" />
          </a>
        </Button>
      )}
    </div>
  );
}

function PropertySheetConsultationRow({
  consultation,
}: {
  consultation: Consultation;
}) {
  return (
    <div className="rounded-md border border-[#eeeeec] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
          {consultation.type}
        </span>
        <span className="text-[11px] text-slate-500">
          {formatDateTime(consultation.createdAt)}
        </span>
        {consultation.contact?.name && (
          <span className="text-[11px] text-slate-500">
            · {consultation.contact.name}
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-700">
        {consultation.content}
      </p>
    </div>
  );
}

function StatusIndicator({ value }: { value: string }) {
  return <StatusBadge kind="listingAvailability" status={value} />;
}

function ResumeClosedListingDialog({
  prompt,
  pending,
  onClose,
  onResume,
}: {
  prompt: ResumeClosedPrompt;
  pending: boolean;
  onClose: () => void;
  onResume: () => void;
}) {
  const propertyLabel = prompt.propertyLabel || "선택한 매물";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {prompt.canResume
              ? "종료된 의뢰를 가용으로 재개할까요?"
              : "가용으로 변경할 수 없습니다"}
          </DialogTitle>
          <DialogDescription>
            {prompt.canResume
              ? `${propertyLabel}의 종료된 의뢰를 다시 엽니다.`
              : `${propertyLabel}의 Listing은 거래 완료된 Deal 때문에 종료 상태입니다.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
          {prompt.canResume ? (
            prompt.completedListingCount > 0 ? (
              <>
                완료 Deal이 없는 Listing {prompt.resumableListingCount}개를
                재개합니다. 거래 완료된 Listing {prompt.completedListingCount}
                개는 종료 상태를 유지합니다.
              </>
            ) : (
              "재개하면 의뢰 상태가 open으로 바뀌고 매물 상태가 가용으로 표시됩니다."
            )
          ) : (
            "기존 완료 Deal의 단계를 되돌리거나 취소해야 합니다. 새로운 거래라면 새 의뢰와 Listing을 등록해 주세요."
          )}
        </div>

        <DialogFooter>
          {prompt.canResume ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onClose}
              >
                취소
              </Button>
              <Button type="button" disabled={pending} onClick={onResume}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                가용으로 재개
              </Button>
            </>
          ) : (
            <Button type="button" onClick={onClose}>
              확인
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartDealFromStatusDialog({
  prompt,
  onClose,
}: {
  prompt: StartDealPrompt;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isSingleListing = !prompt.requiresListingSelection;
  const [selectedListingId, setSelectedListingId] = useState(() =>
    isSingleListing ? (prompt.listings[0]?.id ?? "") : "",
  );
  const selectedListing =
    prompt.listings.find((listing) => listing.id === selectedListingId) ?? null;

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedListing) {
        throw new Error("Deal을 생성할 Listing을 선택해 주세요.");
      }
      return api.deals.create({
        propertyId: prompt.propertyId,
        listingId: selectedListing.id,
        transactionType: selectedListing.transactionType,
        resumeListing: true,
      });
    },
    onSuccess: () => {
      invalidateListingDerivedCaches(queryClient);
      toast.success("Deal을 생성하고 매물 상태를 거래중으로 변경했습니다.");
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Deal 생성에 실패했습니다.");
    },
  });

  const resumesPausedListing =
    selectedListing?.isPaused ||
    selectedListing?.intake?.lifecycleStatus === IntakeLifecycleStatus.HOLD;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSingleListing
              ? "Deal을 생성하시겠습니까?"
              : "거래중으로 변경할 Listing 선택"}
          </DialogTitle>
          <DialogDescription>
            {isSingleListing
              ? `${prompt.propertyLabel || "선택한 매물"}에 Deal을 생성하면 상태가 거래중으로 변경됩니다.`
              : "Deal을 생성할 거래유형을 선택하세요. 선택한 Listing만 거래중으로 전환됩니다."}
          </DialogDescription>
        </DialogHeader>

        {isSingleListing && selectedListing ? (
          <DealStartListingOption listing={selectedListing} />
        ) : (
          <RadioGroup
            value={selectedListingId}
            onValueChange={setSelectedListingId}
            className="gap-2"
          >
            {prompt.listings.map((listing) => {
              const id = `start-deal-${listing.id}`;
              return (
                <label
                  key={listing.id}
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/50",
                    selectedListingId === listing.id &&
                      "border-info bg-info-soft/30",
                  )}
                >
                  <RadioGroupItem id={id} value={listing.id} />
                  <DealStartListingOption listing={listing} compact />
                </label>
              );
            })}
          </RadioGroup>
        )}

        {resumesPausedListing ? (
          <p className="rounded-md bg-warning-soft/50 px-3 py-2 text-xs text-warning">
            Deal 생성과 함께 선택한 Listing의 보류 상태를 해제합니다.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={!selectedListing || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Handshake className="size-4" />
            )}
            Deal 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DealStartListingOption({
  listing,
  compact = false,
}: {
  listing: ListingSummary;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2",
        !compact && "rounded-md border bg-muted/30 px-3 py-3",
      )}
    >
      <StatusBadge
        kind="transactionType"
        status={listing.transactionType}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {getDealStartPriceLabel(listing)}
      </span>
    </div>
  );
}

function getDealStartPriceLabel(listing: ListingSummary) {
  if (listing.transactionType === "monthly") {
    return `보증금 ${formatMoney(listing.deposit)} · 월세 ${formatMoney(
      listing.monthlyRent,
    )}`;
  }
  return formatMoney(listing.price);
}

const listingStatusChipOptions = listingAvailabilityOptions.map((option) => {
  const meta = getStatusMeta("listingAvailability", option.value);
  return {
    value: option.value,
    label: meta.label,
    className: TONE_CHIP_CLASSES[meta.tone],
  };
});

function PriceDepositValue({ listing }: { listing: ListingSummary }) {
  const value =
    listing.transactionType === "monthly"
      ? listing.deposit
      : (listing.price ?? listing.deposit);

  return (
    <span className="tabular-nums text-sm font-medium">
      {value ? formatMoney(value) : "-"}
    </span>
  );
}

function MonthlyRentValue({ listing }: { listing: ListingSummary }) {
  return (
    <span className="tabular-nums text-sm font-medium">
      {listing.monthlyRent ? formatMoney(listing.monthlyRent) : "-"}
    </span>
  );
}

// ── 펼침 패널: 광고 노출 (blue, 읽기 전용) ──────────────────────

function PropertyAdPanel({
  group,
  width,
}: {
  group: PropertyListingGroup;
  width: number;
}) {
  const adRows = group.listings.flatMap((listing) =>
    (listing.activeAdvertisements ?? []).map((advertisement) => ({
      listing,
      advertisement,
    })),
  );
  const activeAdvertisementCount = group.listings.reduce(
    (total, listing) =>
      total +
      (listing.activeAdvertisementCount ??
        listing.activeAdvertisements?.length ??
        0),
    0,
  );

  return (
    <div
      className="border-b border-border bg-info-soft/30 py-3 pl-[60px] pr-4"
      style={{ width }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Megaphone className="size-3.5 text-info" />
        <span className="text-xs font-semibold text-info">
          광고 노출 {activeAdvertisementCount}개
        </span>
        <span className="text-[11.5px] text-info/60">· CP사별 현황</span>
      </div>
      {adRows.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 광고가 없습니다.</p>
      ) : (
        <>
          <div className="flex items-center gap-1.5 pb-1.5 pl-[13px] pr-1">
            <span className="w-[52px] shrink-0 text-[11px] font-semibold text-muted-foreground">
              거래
            </span>
            <span className="w-[128px] shrink-0 text-[11px] font-semibold text-muted-foreground">
              CP사
            </span>
            <span className="w-[72px] shrink-0 text-[11px] font-semibold text-muted-foreground">
              상태
            </span>
            <span className="w-[130px] shrink-0 text-[11px] font-semibold text-muted-foreground">
              가격/보증금
            </span>
            <span className="w-[90px] shrink-0 text-[11px] font-semibold text-muted-foreground">
              월세
            </span>
            <span className="w-[72px] shrink-0 text-[11px] font-semibold text-muted-foreground">
              등록일
            </span>
          </div>
          <div className="flex max-w-[760px] flex-col gap-1.5">
            {adRows.map(({ listing, advertisement }) => (
              <div
                key={advertisement.id}
                className="flex items-center gap-1.5 rounded-lg border border-info-soft bg-white px-3 py-2"
              >
                <div className="w-[52px] shrink-0">
                  <TransactionMiniLabel
                    transactionType={listing.transactionType}
                  />
                </div>
                <div className="w-[128px] shrink-0 truncate text-[13px] font-semibold text-foreground">
                  {getAdChannelLabel(advertisement.channel)}
                </div>
                <div className="w-[72px] shrink-0">
                  <StatusBadge
                    kind="adStatus"
                    status={advertisement.status}
                    size="sm"
                  />
                </div>
                <div className="w-[130px] shrink-0 truncate text-[12.5px] font-medium tabular-nums text-foreground">
                  {(advertisement.advertisedPrice ??
                  advertisement.advertisedDeposit)
                    ? formatMoney(
                        advertisement.advertisedPrice ??
                          advertisement.advertisedDeposit,
                      )
                    : "-"}
                </div>
                <div className="w-[90px] shrink-0 truncate text-[12.5px] tabular-nums text-foreground/70">
                  {advertisement.advertisedMonthlyRent
                    ? formatMoney(advertisement.advertisedMonthlyRent)
                    : "-"}
                </div>
                <div className="w-[72px] shrink-0 truncate text-[12.5px] tabular-nums text-foreground/70">
                  {advertisement.startedAt
                    ? formatDateShort(advertisement.startedAt)
                    : "-"}
                </div>
                {advertisement.url && (
                  <a
                    href={advertisement.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-info hover:underline"
                  >
                    원문 보기
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const moveInAvailableChipOptions: ChipOption[] = [
  {
    value: "immediate",
    label: "즉시",
    className: "bg-neutral-soft text-neutral-strong",
  },
  {
    value: "date",
    label: "특정일 이후",
    className: "bg-neutral-soft text-neutral-strong",
    picker: "date",
    fromField: "moveInAvailableFrom",
    getPreselect: (rowValue) => {
      const listing = rowValue as ListingSummary | undefined;
      const raw = listing?.moveInAvailableFrom;
      if (!raw) return undefined;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? undefined : d;
    },
  },
  {
    value: "range",
    label: "기간 협의",
    className: "bg-neutral-soft text-neutral-strong",
    picker: "range",
    fromField: "moveInAvailableFrom",
    toField: "moveInAvailableTo",
    getPreselect: (rowValue) => {
      const listing = rowValue as ListingSummary | undefined;
      const fromRaw = listing?.moveInAvailableFrom;
      const toRaw = listing?.moveInAvailableTo;
      const from = fromRaw ? new Date(fromRaw) : undefined;
      const to = toRaw ? new Date(toRaw) : undefined;
      return {
        from: from && !Number.isNaN(from.getTime()) ? from : undefined,
        to: to && !Number.isNaN(to.getTime()) ? to : undefined,
      };
    },
  },
  {
    value: "negotiable",
    label: "협의",
    className: "bg-neutral-soft text-neutral-strong",
  },
  {
    value: "unknown",
    label: "확인 필요",
    className: "bg-warning-soft text-warning-strong",
  },
];

function MoveInAvailableSummary({ listing }: { listing: ListingSummary }) {
  const summary = getMoveInAvailability(listing);

  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      <span
        className={cn(
          "inline-flex w-fit max-w-full whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-5",
          summary.className,
        )}
      >
        <span className="truncate">{summary.label}</span>
      </span>
      {summary.detail && (
        <span className="truncate text-[11px] text-slate-500">
          {summary.detail}
        </span>
      )}
    </div>
  );
}

function TransactionBadge({ transactionType }: { transactionType: string }) {
  return <StatusBadge kind="transactionType" status={transactionType} />;
}

function TransactionMiniLabel({
  transactionType,
}: {
  transactionType: string;
}) {
  return (
    <StatusBadge
      kind="transactionType"
      status={transactionType}
      size="sm"
      className="min-w-8 justify-center"
    />
  );
}

function JointBrokerageBadge({
  intake,
  compact = false,
}: {
  intake?: {
    isJointBrokerageRequired: boolean;
    jointBrokeragePartner?: { name: string } | null;
  } | null;
  compact?: boolean;
}) {
  if (!intake?.isJointBrokerageRequired) return null;

  const label = compact
    ? "공동"
    : `공동필수${intake.jointBrokeragePartner?.name ? ` · ${intake.jointBrokeragePartner.name}` : ""}`;

  return (
    <span className="inline-flex max-w-full rounded-[4px] bg-[#fbf3db] px-1.5 py-0.5 text-[11px] font-medium leading-5 text-[#8f6b1f]">
      <span className="truncate">{label}</span>
    </span>
  );
}

function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function FilterSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-3">
        <h3 className="text-xs font-semibold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{children}</div>
    </div>
  );
}

function SiteSearchFilter({
  sites,
  value,
  onChange,
  isLoading,
  placeholder = "단지명 또는 주소 검색",
  showCounts = false,
}: {
  sites: ListingFilterSite[];
  value: string;
  onChange: (value: string) => void;
  isLoading: boolean;
  placeholder?: string;
  showCounts?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectedSite = sites.find((site) => site.id === value);

  const filteredSites = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const candidates = normalizedQuery
      ? sites.filter((site) =>
          [
            site.name,
            site.roadAddress,
            site.jibunAddress,
            getSiteTypeLabel(site.type),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : sites;

    return candidates
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .slice(0, 8);
  }, [query, sites]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        value={open ? query : (selectedSite?.name ?? query)}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={isLoading ? "단지 불러오는 중..." : placeholder}
        className="h-8 bg-white pl-8 pr-8 text-[13px]"
      />
      {(selectedSite || query) && (
        <button
          type="button"
          aria-label="단지 선택 지우기"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            setQuery("");
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="size-3.5" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {filteredSites.length > 0 ? (
            filteredSites.map((site) => (
              <button
                key={site.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(site.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-slate-50",
                  value === site.id && "bg-slate-50",
                )}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-slate-900">
                    {site.name}
                  </span>
                  {showCounts && (
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {site.propertyCount}건
                    </span>
                  )}
                </span>
                <span className="truncate text-[11px] text-slate-500">
                  {site.roadAddress ??
                    site.jibunAddress ??
                    getSiteTypeLabel(site.type)}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              일치하는 단지가 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 필터 pill — 비활성 시 흰 pill("상태"), 값 선택 시 다크 pill("상태 미확인" + 해제 버튼).
 * 디자인 시안의 fPills 대응.
 */
function FilterPillSelect({
  label,
  value,
  onChange,
  options,
  inactiveValue = "all",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  inactiveValue?: string;
}) {
  const isActive = value !== inactiveValue;
  const currentLabel = options.find((option) => option.value === value)?.label;

  return (
    <div
      className={cn(
        "flex h-8 items-center overflow-hidden rounded-lg border transition-colors",
        isActive
          ? "border-foreground bg-foreground"
          : "border-border bg-white hover:bg-muted",
      )}
    >
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          size="sm"
          className={cn(
            "h-full gap-1 rounded-none border-0 bg-transparent px-2.5 text-[12.5px] shadow-none focus-visible:ring-0",
            isActive
              ? "font-medium text-white [&_svg]:text-white/70"
              : "text-foreground/80 [&_svg]:text-muted-foreground",
          )}
        >
          <span className="whitespace-nowrap">{label}</span>
          {isActive && (
            <span className="whitespace-nowrap">{currentLabel}</span>
          )}
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-[13px]"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isActive && (
        <button
          type="button"
          aria-label={`${label} 필터 해제`}
          onClick={() => onChange(inactiveValue)}
          className="flex h-full w-[22px] items-center justify-center text-white/80 hover:bg-white/15 hover:text-white"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

function RangeFilter({
  label,
  unit,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  unit: string;
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  return (
    <FilterField label={`${label} (${unit})`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          value={minValue}
          onChange={(event) => onMinChange(event.target.value)}
          placeholder="최소"
          className="h-8 bg-white px-2 text-[13px]"
        />
        <span className="text-xs text-slate-400">~</span>
        <Input
          type="number"
          inputMode="decimal"
          value={maxValue}
          onChange={(event) => onMaxChange(event.target.value)}
          placeholder="최대"
          className="h-8 bg-white px-2 text-[13px]"
        />
      </div>
    </FilterField>
  );
}

function buildListingFilterParams(filters: PropertyFilterState) {
  const params: Record<string, string | number | boolean | undefined> = {};

  if (filters.siteId) params.siteId = filters.siteId;
  if (filters.confirmationState !== "all") {
    params.confirmationState = filters.confirmationState;
  }
  if (filters.availability !== "all") {
    params.availability = filters.availability;
    if (filters.availability === ListingAvailability.CLOSED) {
      params.includeClosed = true;
    }
  }
  if (filters.siteType !== "all") params.siteType = filters.siteType;

  addNumberParam(params, "priceMin", filters.priceMin);
  addNumberParam(params, "priceMax", filters.priceMax);
  addNumberParam(params, "depositMin", filters.depositMin);
  addNumberParam(params, "depositMax", filters.depositMax);
  addNumberParam(params, "monthlyRentMin", filters.monthlyRentMin);
  addNumberParam(params, "monthlyRentMax", filters.monthlyRentMax);

  const areaMin = parseNumberFilter(filters.areaMin);
  const areaMax = parseNumberFilter(filters.areaMax);
  if (areaMin !== undefined) params.areaMin = pyeongToSquareMeters(areaMin);
  if (areaMax !== undefined) params.areaMax = pyeongToSquareMeters(areaMax);

  return params;
}

function buildActiveFilterChips(
  search: string,
  filters: PropertyFilterState,
  sitesById: Map<string, ListingFilterSite>,
) {
  const chips: string[] = [];
  const trimmedSearch = search.trim();

  if (trimmedSearch) chips.push(`검색: ${trimmedSearch}`);
  if (filters.siteId) {
    chips.push(`단지: ${sitesById.get(filters.siteId)?.name ?? "선택한 단지"}`);
  }
  if (filters.siteType !== "all") {
    chips.push(`유형: ${getOptionLabel(siteTypeOptions, filters.siteType)}`);
  }
  if (filters.confirmationState !== "all") {
    chips.push(
      `확인: ${getOptionLabel(confirmationStateFilterOptions, filters.confirmationState)}`,
    );
  }
  if (filters.availability !== "all") {
    chips.push(
      `가용: ${getOptionLabel(listingAvailabilityFilterOptions, filters.availability)}`,
    );
  }

  addRangeChip(chips, "가격", filters.priceMin, filters.priceMax, "만원");
  addRangeChip(chips, "공급평형", filters.areaMin, filters.areaMax, "평");
  addRangeChip(chips, "보증금", filters.depositMin, filters.depositMax, "만원");
  addRangeChip(
    chips,
    "월세",
    filters.monthlyRentMin,
    filters.monthlyRentMax,
    "만원",
  );

  return chips;
}

function addNumberParam(
  params: Record<string, string | number | boolean | undefined>,
  key: string,
  value: string,
) {
  const numberValue = parseNumberFilter(value);
  if (numberValue !== undefined) params[key] = numberValue;
}

function parseNumberFilter(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function pyeongToSquareMeters(value: number) {
  return Number((value / 0.3025).toFixed(2));
}

function addRangeChip(
  chips: string[],
  label: string,
  minValue: string,
  maxValue: string,
  unit: string,
) {
  const min = minValue.trim();
  const max = maxValue.trim();
  if (!min && !max) return;
  if (min && max) chips.push(`${label}: ${min}~${max}${unit}`);
  else if (min) chips.push(`${label}: ${min}${unit} 이상`);
  else chips.push(`${label}: ${max}${unit} 이하`);
}

function getOptionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function buildPropertyListingGroups(listings: Listing[]) {
  const groups = new Map<string, PropertyListingGroup>();

  listings.forEach((listing) => {
    const existing = groups.get(listing.propertyId);
    if (existing) {
      existing.matchedListings.push(listing);
      existing.listings = mergeListingSummaries(
        existing.listings,
        collectPropertyListings(listing),
      );
      return;
    }

    groups.set(listing.propertyId, {
      id: listing.propertyId,
      propertyId: listing.propertyId,
      property: listing.property,
      representative: listing,
      matchedListings: [listing],
      listings: collectPropertyListings(listing),
    });
  });

  return Array.from(groups.values());
}

function collectPropertyListings(listing: Listing) {
  return mergeListingSummaries(
    [toListingSummary(listing)],
    (listing.property?.listings ?? []).map(toListingSummary),
  );
}

function mergeListingSummaries(
  baseListings: ListingSummary[],
  incomingListings: ListingSummary[],
) {
  const byId = new Map<string, ListingSummary>();
  [...baseListings, ...incomingListings].forEach((listing) => {
    const previous = byId.get(listing.id);
    byId.set(
      listing.id,
      previous ? mergeDefinedFields(previous, listing) : listing,
    );
  });

  return Array.from(byId.values()).sort(compareListingSummary);
}

/** 같은 매물이 두 소스(최상위/property.listings)에서 오면 정의된 값만 덮어쓴다.
 *  (중첩 응답에 빠진 필드가 undefined로 지워지는 것 방지) */
function mergeDefinedFields(
  previous: ListingSummary,
  next: ListingSummary,
): ListingSummary {
  const merged: Record<string, unknown> = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as unknown as ListingSummary;
}

function toListingSummary(listing: ListingSummary): ListingSummary {
  return {
    id: listing.id,
    intakeId: listing.intakeId,
    transactionType: listing.transactionType,
    price: listing.price,
    deposit: listing.deposit,
    monthlyRent: listing.monthlyRent,
    maintenanceFee: listing.maintenanceFee,
    maintenanceFeeIncludes: listing.maintenanceFeeIncludes,
    loanAmount: listing.loanAmount,
    premium: listing.premium,
    privateMemo: listing.privateMemo,
    moveInAvailableType: listing.moveInAvailableType,
    moveInAvailableFrom: listing.moveInAvailableFrom,
    moveInAvailableTo: listing.moveInAvailableTo,
    isPaused: listing.isPaused,
    intake: listing.intake,
    deals: listing.deals,
    memo: listing.memo,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    activeAdvertisements: listing.activeAdvertisements,
    activeAdvertisementCount: listing.activeAdvertisementCount,
    advertisements: listing.advertisements,
    priceHistories: listing.priceHistories,
    _count: listing._count,
  };
}

function compareListingSummary(a: ListingSummary, b: ListingSummary) {
  const typeOrder =
    getTransactionTypeOrder(a.transactionType) -
    getTransactionTypeOrder(b.transactionType);
  if (typeOrder !== 0) return typeOrder;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function getTransactionTypeOrder(value: string) {
  if (value === "sale") return 0;
  if (value === "jeonse") return 1;
  if (value === "monthly") return 2;
  return 99;
}

function getAdChannelLabel(channel: string) {
  return adChannelLabels[channel] ?? channel;
}

function getAdvertisementSourceLabel(source: string) {
  if (source === "manual") return "입력";
  if (source === "cp_sync") return "CP연동";
  return source;
}

function getPropertySheetAdvertisementCount(listings: PropertyListing[]) {
  return listings.reduce(
    (total, listing) => total + (listing.advertisements?.length ?? 0),
    0,
  );
}

function getPropertySheetPriceHistoryCount(listings: PropertyListing[]) {
  return listings.reduce(
    (total, listing) => total + (listing.priceHistories?.length ?? 0),
    0,
  );
}

function formatPriceHistorySnapshot(
  transactionType: string,
  value: {
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
  },
) {
  if (transactionType === "monthly") {
    const deposit = value.deposit ? formatMoney(value.deposit) : "-";
    const monthlyRent = value.monthlyRent
      ? formatMoney(value.monthlyRent)
      : "-";
    return `${deposit} / ${monthlyRent}`;
  }

  const price = value.price ?? value.deposit;
  return price ? formatMoney(price) : "-";
}

function formatAdvertisementPrice(
  listing: { transactionType: string },
  advertisement: {
    advertisedPrice?: number | null;
    advertisedDeposit?: number | null;
    advertisedMonthlyRent?: number | null;
  },
) {
  if (listing.transactionType === "monthly") {
    const deposit = advertisement.advertisedDeposit
      ? formatMoney(advertisement.advertisedDeposit)
      : "-";
    const monthlyRent = advertisement.advertisedMonthlyRent
      ? formatMoney(advertisement.advertisedMonthlyRent)
      : "-";
    return `${deposit} / ${monthlyRent}`;
  }

  const price =
    advertisement.advertisedPrice ?? advertisement.advertisedDeposit;
  return price ? formatMoney(price) : "-";
}

function getDongName(property?: ListingProperty) {
  const dong = property?.unit?.dong;
  if (!dong || dong.isPlaceholder) return "-";
  return dong.name;
}

function getExclusiveAreaM2(property?: ListingProperty) {
  return (
    property?.unit?.exclusiveAreaM2 ??
    property?.unit?.siteUnitType?.exclusiveAreaM2
  );
}

function getUnitTypeName(property?: ListingProperty) {
  return property?.unit?.siteUnitType?.name ?? "-";
}

function getSiteTypeLabel(value?: string | null) {
  if (!value) return "-";
  return getOptionLabel(siteTypeOptions, value);
}

function getPropertySheetUnitLabel(property: Property) {
  const dongName =
    property.unit?.dong && !property.unit.dong.isPlaceholder
      ? property.unit.dong.name
      : "";
  return [dongName, property.unit?.name].filter(Boolean).join(" ");
}

function getPropertySheetExclusiveAreaM2(property: Property) {
  return (
    property.unit?.exclusiveAreaM2 ??
    property.unit?.siteUnitType?.exclusiveAreaM2
  );
}

function getPropertySheetSupplyAreaM2(property: Property) {
  return (
    property.unit?.supplyAreaM2 ?? property.unit?.siteUnitType?.supplyAreaM2
  );
}

function formatPropertySheetArea(property: Property) {
  const exclusive = getPropertySheetExclusiveAreaM2(property);
  const supply = getPropertySheetSupplyAreaM2(property);

  if (exclusive && supply) {
    return `전용 ${formatArea(exclusive)} · 공급 ${formatArea(supply)}`;
  }
  if (exclusive) return `전용 ${formatArea(exclusive)}`;
  if (supply) return `공급 ${formatArea(supply)}`;
  return "-";
}

function getLatestPropertyListingUpdatedAt(property: Property) {
  return (property.listings ?? []).reduce<string | null>((latest, listing) => {
    const checkedAt =
      listing.intake?.lastCheckedAt ?? listing.intake?.lastVerifiedAt ?? null;
    if (!checkedAt) return latest;
    if (!latest) return checkedAt;
    return new Date(checkedAt).getTime() > new Date(latest).getTime()
      ? checkedAt
      : latest;
  }, null);
}

function comparePropertyListing(a: PropertyListing, b: PropertyListing) {
  const typeOrder =
    getTransactionTypeOrder(a.transactionType) -
    getTransactionTypeOrder(b.transactionType);
  if (typeOrder !== 0) return typeOrder;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function getPropertySheetNotices(property: Property): PropertySheetNotice[] {
  const listings = property.listings ?? [];
  const contacts = property.propertyContacts ?? [];
  const tenants = property.tenants ?? [];
  const consultations = property.consultations ?? [];
  const notices: PropertySheetNotice[] = [];
  const owner =
    contacts.find((contact) => contact.role === "owner") ?? contacts[0];
  const latestUpdatedAt = getLatestPropertyListingUpdatedAt(property);
  const daysSinceLatestCheck = getDaysSince(latestUpdatedAt);
  const unverifiedListings = listings.filter(
    (listing) =>
      listing.intake &&
      getIntakeConfirmationState(listing.intake) ===
        IntakeConfirmationState.UNVERIFIED,
  );
  const jointRequiredListings = listings.filter(
    (listing) => listing.intake?.isJointBrokerageRequired,
  );
  const expiringTenant = tenants.find((tenant) => {
    if (!tenant.contractEnd) return false;
    const daysUntilEnd = getDaysUntil(tenant.contractEnd);
    return daysUntilEnd >= 0 && daysUntilEnd <= 45;
  });

  if (listings.length === 0) {
    notices.push({
      title: "거래 정보 없음",
      detail: "매매, 전세, 월세 중 등록된 거래 카드가 없습니다.",
      tone: "danger",
    });
  }

  if (unverifiedListings.length > 0) {
    notices.push({
      title: "확인 필요한 거래",
      detail: `${formatTransactionTypeList(unverifiedListings)} ${unverifiedListings.length}건이 미확인 상태입니다.`,
      tone: "warning",
    });
  }

  if (jointRequiredListings.length > 0) {
    notices.push({
      title: "공동중개 필수",
      detail: `${formatJointBrokerageRequirementList(jointRequiredListings)} 조건을 확인해야 합니다.`,
      tone: "warning",
    });
  }

  if (!owner?.contact?.phone) {
    notices.push({
      title: "소유주 연락처 없음",
      detail:
        "목록에서 바로 전화할 수 있도록 소유주 또는 대리인 번호를 등록해야 합니다.",
      tone: "danger",
    });
  }

  if (daysSinceLatestCheck !== null && daysSinceLatestCheck >= 30) {
    notices.push({
      title: "확인일 오래됨",
      detail: `마지막 확인이 ${daysSinceLatestCheck}일 전입니다. 광고 유지 전 소유주 확인이 필요합니다.`,
      tone: "warning",
    });
  }

  if (expiringTenant?.contractEnd) {
    notices.push({
      title: "임차 계약 만기 임박",
      detail: `${expiringTenant.contact?.name ?? "임차인"} 계약 종료가 ${formatDateShort(expiringTenant.contractEnd)}입니다.`,
      tone: "warning",
    });
  }

  const hasAnyListingMemo = (property.listings ?? []).some((listing) =>
    listing.memo?.trim(),
  );
  if (!hasAnyListingMemo && consultations.length === 0) {
    notices.push({
      title: "상담 기록 없음",
      detail:
        "최근 통화나 확인 메모가 없어 매물 히스토리를 판단하기 어렵습니다.",
      tone: "neutral",
    });
  }

  return notices.slice(0, 5);
}

function getContactRoleLabel(role: string) {
  return contactRoleLabels[role] ?? role;
}

function getTenantPeriodLabel(tenant: Tenant) {
  if (!tenant.contractStart && !tenant.contractEnd) return "계약 기간 미등록";
  return `${formatDateShort(tenant.contractStart)} - ${formatDateShort(tenant.contractEnd)}`;
}

function getTenantStatusLabel(status: string) {
  if (status === "residing") return "거주중";
  if (status === "moving_out") return "퇴거예정";
  if (status === "moved") return "퇴거완료";
  return status;
}

function formatTransactionTypeList(
  listings: Pick<PropertyListing, "transactionType">[],
) {
  const labels = Array.from(
    new Set(
      listings.map(
        (listing) =>
          getStatusMeta("transactionType", listing.transactionType).label,
      ),
    ),
  );
  return labels.join(", ");
}

function formatJointBrokerageRequirementList(
  listings: Pick<PropertyListing, "transactionType" | "intake">[],
) {
  return listings
    .map((listing) => {
      const transactionLabel = getStatusMeta(
        "transactionType",
        listing.transactionType,
      ).label;
      return listing.intake?.jointBrokeragePartner?.name
        ? `${transactionLabel} ${listing.intake.jointBrokeragePartner.name}`
        : `${transactionLabel} 파트너 미지정`;
    })
    .join(", ");
}

function getLatestListingUpdatedAt(group: PropertyListingGroup) {
  return group.listings.reduce<string | null>((latest, listing) => {
    const checkedAt =
      listing.intake?.lastCheckedAt ?? listing.intake?.lastVerifiedAt ?? null;
    if (!checkedAt) return latest;
    if (!latest) return checkedAt;
    return new Date(checkedAt).getTime() > new Date(latest).getTime()
      ? checkedAt
      : latest;
  }, null);
}
