import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import { toast } from "sonner";
import {
  BedDouble,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  GitBranch,
  Handshake,
  Info,
  List,
  ListFilter,
  Loader2,
  Map as MapIcon,
  Megaphone,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Tag,
  Type,
  UserSearch,
} from "lucide-react";
import type { ColumnDef, SortingState, VisibilityState } from "@tanstack/react-table";
import { api } from "@/lib/api";
import { ApiError } from "@estate-erp/api-client";
import type {
  Consultation,
  ListingIntake,
  ListingIntakeListing,
  Match,
  Property,
  PropertyListing,
  Tenant,
  UpdateListingDto,
} from "@estate-erp/api-client";
import {
  formatPrice,
  IntakeClosedReason,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
  MatchStage,
  normalizeMatchStage,
} from "@estate-erp/shared";
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
  PropertyColumnSettings,
  PropertySortControl,
  propertyTableColumns,
  propertyDetailColumnIds,
} from "./-components/property-table-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type MultiSelectOption } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";
import { formatPhoneNumber } from "@/lib/contacts";
import {
  CellEditProvider,
  EditableCell,
  type SortDefinition,
  type ChipOption,
  type CellSaveResult,
} from "@/components/data-table";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { tabResourceKeys } from "@/features/tabs/lib/tabResource";
import {
  getActiveDealListingIndex,
  getIntakeConfirmationState,
  getListingAvailability,
  getListingRowAvailability,
  planListingStatusChange,
} from "@/lib/listing-status";
import {
  getListingPrimaryPrice,
  getMoveInAvailability,
} from "./-property-list-view-utils";
import {
  ConsultationAddDialog,
  PropertyContactAddDialog,
} from "./-property-detail-dialogs";
import {
  PropertyListingsTable,
  type ListingSummary,
  type PropertyListingGroup,
} from "./-components/property-listings-table";
import {
  ChecklistFilterPanel,
  ToolbarFilterChip,
  ToolbarPillTabs,
  ToolbarPillToggle,
  ToolbarRegionColumn,
  ToolbarSearchBar,
  summarizeSelection,
  toolbarGhostButtonClassName,
  type AddFilterItem,
} from "./-components/property-toolbar";
import {
  AREA_RANGE_MAX,
  AREA_RANGE_MIN,
  AREA_RANGE_PRESETS,
  DateRangeFilter,
  FilterField,
  formatNumericRangeLabel,
  formatPriceRangeLabel,
  formatRangeNumber,
  MONTHLY_RENT_RANGE_MAX,
  MONTHLY_RENT_RANGE_MIN,
  MONTHLY_RENT_RANGE_PRESETS,
  NumericRangeFilterPanel,
  PopoverTitle,
  PRICE_RANGE_MAX,
  PRICE_RANGE_MIN,
  PRICE_RANGE_PRESETS,
} from "./-components/numeric-range-filter";
import {
  PropertyInspectorView,
  PropertyInspectorToolbar,
  type InspectorActivity,
  type InspectorAdRow,
  type InspectorChip,
  type InspectorDealRow,
  type InspectorMatchRow,
  type InspectorModel,
  type InspectorOffer,
  type InspectorPerson,
  type InspectorStat,
  type InspectorStep,
  type InspectorTodo,
} from "./-components/property-inspector-view";
import { PropertyInspectorProgressTab } from "./-components/property-inspector-progress-tab";
import { PropertyRegistrationDrawer } from "./-components/property-registration-drawer";
import type { PropertyRegistrationResult } from "./-property-registration-form";
import { getStatusMeta } from "@/lib/status-config";
import { PropertyListingCell } from "./-components/property-listing-cell";
import { PROPERTY_LISTING_ITEM_HEIGHT } from "./-property-table-metrics";
import {
  buildPropertyMapClustersFromOffsets,
  getNaverMapsPreconnectOrigins,
  removePropertyMapListeners,
  type PropertyMapClusterSource,
} from "./-property-map-utils";
import {
  PropertyBulkActions,
  PropertyRowActions,
} from "./-property-intake-actions";
import {
  PropertyMatchPanel,
  estimatePropertyMatchPanelHeight,
  getPropertyMatchCount,
} from "./-components/property-match-panel";
import { AdTableColumnHeader } from "./-components/property-ad-table-controls";
import { PropertyPanelSelectionCheckbox } from "./-components/property-panel-selection-checkbox";
import { PropertyAdEditableCell } from "./-components/property-ad-editable-cell";
import { adTableColumns, getAdChannelLabel, sortPropertyAdRows, type AdColumnId, type AdTableControls } from "./-components/property-ad-table-state";
import { matchStageOrder } from "../wanted-properties/-match-view-utils";

// ── Labels & Colors ─────────────────────────────────────────────

const listingAvailabilityMeta: Record<
  ListingAvailability,
  { label: string; dotClassName: string; pillClassName: string }
> = {
  [ListingAvailability.AVAILABLE]: {
    label: "활성",
    dotClassName: "bg-[#6c9b7a]",
    pillClassName: "bg-[#eef3ed] text-[#44745a]",
  },
  [ListingAvailability.PAUSED]: {
    label: "보류",
    dotClassName: "bg-[#dfab01]",
    pillClassName: "bg-[#fbf3db] text-[#9f6b00]",
  },
  [ListingAvailability.IN_CONTRACT]: {
    label: "거래중",
    dotClassName: "bg-[#529cca]",
    pillClassName: "bg-[#e7f3f8] text-[#337ea9]",
  },
  [ListingAvailability.CLOSED]: {
    label: "종료",
    dotClassName: "bg-[#b4b4b1]",
    pillClassName: "bg-[#f1f1ef] text-[#787774]",
  },
};

const transactionTypeMeta: Record<
  string,
  { label: string; className: string }
> = {
  sale: { label: "매매", className: "bg-[#fdebec] text-[#8f4b46]" },
  jeonse: { label: "전세", className: "bg-[#e7f3f8] text-[#337ea9]" },
  monthly: { label: "월세", className: "bg-[#fbf3db] text-[#8f6b1f]" },
};

// 웹의 합성 매물상태를 사용하되 pill 색상은 데스크톱 팔레트를 유지한다.
const listingAvailabilityChipOptions: ChipOption[] = Object.entries(
  listingAvailabilityMeta,
).map(([value, meta]) => ({
  value,
  label: meta.label,
  className: `${meta.pillClassName} rounded-full pl-[7px] pr-[9px]`,
  dotClassName: meta.dotClassName,
}));

const adStatusMeta: Record<string, { label: string; className: string }> = {
  active: { label: "광고중", className: "bg-[#eef3ed] text-[#44745a]" },
  ended: { label: "종료", className: "bg-[#f1f1ef] text-[#787774]" },
};

const contactRoleLabels: Record<string, string> = {
  owner: "소유주",
  co_owner: "공동소유",
  representative: "대리인",
  lawyer: "법무사",
  tax_agent: "세무사",
};

const sortDefinitions = propertyTableColumns;

const LISTINGS_PAGE_SIZE = 50;
function getMatchStageIndex(stage: string) {
  const normalizedStage = normalizeMatchStage(stage);
  return matchStageOrder.findIndex(
    (candidate) => candidate === normalizedStage,
  );
}

const listingAvailabilityFilterOptions: MultiSelectOption[] = Object.entries(
  listingAvailabilityMeta,
).map(([value, meta]) => ({
  value,
  label: meta.label,
}));
const NAVER_MAPS_NCP_KEY_ID = import.meta.env.VITE_NAVER_MAPS_NCP_KEY_ID as
  | string
  | undefined;

type NaverMapsApi = {
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  LatLngBounds: new (sw: unknown, ne: unknown) => unknown;
  Point: new (x: number, y: number) => NaverPoint;
  Map: new (
    element: HTMLElement,
    options?: Record<string, unknown>,
  ) => {
    setCenter: (coord: unknown) => void;
    setZoom: (zoom: number) => void;
    getZoom: () => number;
    getProjection: () => {
      fromCoordToOffset: (coord: unknown) => NaverPoint;
    };
    fitBounds?: (bounds: unknown, options?: Record<string, number>) => void;
  };
  Marker: new (options: Record<string, unknown>) => {
    setMap: (map: unknown | null) => void;
  };
  Event: {
    addListener: (
      target: unknown,
      eventName: string,
      handler: () => void,
    ) => unknown;
    removeListener?: (listener: unknown) => void;
  };
};

interface NaverLatLng {
  lat?: () => number;
  lng?: () => number;
}

interface NaverPoint {
  x: number;
  y: number;
}

declare global {
  interface Window {
    naver?: { maps?: NaverMapsApi };
    __estateErpNaverMapsPromise?: Promise<NaverMapsApi>;
  }
}

function handleMutationError(error: unknown) {
  if (error instanceof ApiError && error.statusCode === 409) {
    toast.error(
      "다른 사용자가 먼저 수정했습니다. 최신 내용으로 다시 불러옵니다.",
    );
    return;
  }

  toast.error("저장에 실패했습니다.");
}

const MANUAL_INTAKE_CLOSE_REASON_OPTIONS = [
  {
    value: IntakeClosedReason.WITHDRAWN,
    label: "의뢰 철회",
    description: "소유주가 매도·임대 의뢰를 거둬들였습니다.",
  },
  {
    value: IntakeClosedReason.EXTERNAL_DEAL_COMPLETED,
    label: "다른 중개사·직거래로 계약됨",
    description: "우리 사무소가 아닌 경로로 계약이 완료되었습니다.",
  },
  {
    value: IntakeClosedReason.OTHER,
    label: "기타",
    description: "위 사유에 해당하지 않는 종결입니다.",
  },
] as const;

type ManualIntakeCloseReason =
  (typeof MANUAL_INTAKE_CLOSE_REASON_OPTIONS)[number]["value"];

function getClosedStatusLabel(closedReason?: string | null) {
  const labels: Record<string, string> = {
    [IntakeClosedReason.DEAL_COMPLETED]: "종료 · 우리 거래",
    [IntakeClosedReason.EXTERNAL_DEAL_COMPLETED]: "종료 · 타 거래",
    [IntakeClosedReason.WITHDRAWN]: "종료 · 의뢰 철회",
    [IntakeClosedReason.UNAVAILABLE]: "종료 · 거래 불가",
    [IntakeClosedReason.SUPERSEDED]: "종료 · 의뢰 대체",
    [IntakeClosedReason.OTHER]: "종료 · 기타",
  };
  return (closedReason && labels[closedReason]) || "종료";
}
const PROPERTY_LISTING_STACK_ITEM_HEIGHT = PROPERTY_LISTING_ITEM_HEIGHT;
const PROPERTY_MAP_CLUSTER_GRID_SIZE = 84;
const PROPERTY_MAP_CLUSTER_MAX_ZOOM = 17;

const transactionTypeOptions = [
  { value: "all", label: "전체" },
  { value: "sale", label: "매매" },
  { value: "jeonse", label: "전세" },
  { value: "monthly", label: "월세" },
] as const;

const siteTypeOptions: MultiSelectOption[] = [
  { value: "apartment", label: "아파트" },
  { value: "officetel", label: "오피스텔" },
  { value: "villa", label: "빌라" },
  { value: "house", label: "단독/다가구" },
  { value: "commercial", label: "상가" },
  { value: "land", label: "토지" },
  { value: "living_accommodation", label: "생활숙박" },
] as const;

const advertisementFilterOptions = [
  { value: "all", label: "광고 전체" },
  { value: "with", label: "광고 있음" },
  { value: "without", label: "광고 없음" },
] as const;

const ROOM_COUNT_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "1", label: "1개" },
  { value: "2", label: "2개" },
  { value: "3", label: "3개" },
  { value: "4+", label: "4개 이상" },
] as const;

const BATH_ROOM_COUNT_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "1", label: "1개" },
  { value: "2", label: "2개" },
  { value: "3+", label: "3개 이상" },
] as const;

interface PropertyFilterState {
  siteIds: string[];
  provinceCode: string;
  districtCode: string;
  wardCode: string;
  dongSearch: string;
  unitSearch: string;
  siteTypes: string[];
  availabilities: string[];
  priceMin: string;
  priceMax: string;
  depositMin: string;
  depositMax: string;
  monthlyRentMin: string;
  monthlyRentMax: string;
  areaMin: string;
  areaMax: string;
  roomCount: string;
  bathRoomCount: string;
  moveInFrom: string;
  moveInTo: string;
  advertisement: "all" | "with" | "without";
}

const initialPropertyFilters: PropertyFilterState = {
  siteIds: [],
  provinceCode: "",
  districtCode: "",
  wardCode: "",
  dongSearch: "",
  unitSearch: "",
  siteTypes: [],
  availabilities: [],
  priceMin: "",
  priceMax: "",
  depositMin: "",
  depositMax: "",
  monthlyRentMin: "",
  monthlyRentMax: "",
  areaMin: "",
  areaMax: "",
  roomCount: "",
  bathRoomCount: "",
  moveInFrom: "",
  moveInTo: "",
  advertisement: "all",
};

type ListingProperty = NonNullable<ListingIntake["property"]>;
type PropertyViewMode = "list" | "map";
interface PropertyMapPoint extends PropertyMapClusterSource {
  id: string;
  siteId: string;
  siteName: string;
  address: string;
  lat: number;
  lng: number;
  groups: PropertyListingGroup[];
  groupCount: number;
  listingCount: number;
}
interface PropertyMapCluster {
  id: string;
  lat: number;
  lng: number;
  points: PropertyMapPoint[];
  groupCount: number;
  listingCount: number;
}

interface StartDealPrompt {
  propertyId: string;
  propertyLabel: string;
  listings: ListingSummary[];
  requiresListingSelection: boolean;
  intakeLifecycleStatus: IntakeLifecycleStatus;
}

interface ResumeClosedPrompt {
  intakeId: string;
  listingIds: string[];
  propertyLabel: string;
  targetAvailability: ListingAvailability;
  canResume: boolean;
  completedListingCount: number;
  resumableListingCount: number;
}

interface CloseIntakePrompt {
  intakeId: string;
  propertyLabel: string;
  activeDealCount: number;
  activeDealIds: string[];
}

interface ReactivateListingPrompt {
  propertyLabel: string;
  activeDealCount: number;
  activeDealIds: string[];
}

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/properties/")({
  component: PropertiesPage,
});

function PropertiesPage() {
  const queryClient = useQueryClient();
  const createTab = useTabStore((s) => s.createTab);

  // ── State ─────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedTransactionType, setSelectedTransactionType] =
    useState<(typeof transactionTypeOptions)[number]["value"]>("all");
  const [propertyFilters, setPropertyFilters] = useState<PropertyFilterState>(
    initialPropertyFilters,
  );
  const [selectedIntakeId, setSelectedIntakeId] = useState<string | null>(null);
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);
  const [inspectorMotion, setInspectorMotion] = useState(true);
  const [registrationState, setRegistrationState] = useState<"closed" | "open" | "closing">("closed");
  const [registrationMotion, setRegistrationMotion] = useState(true);
  const [registrationPending, setRegistrationPending] = useState(false);
  const registrationPendingRef = useRef(false);
  const createPropertyButtonRef = useRef<HTMLButtonElement>(null);
  const handleRegistrationPendingChange = useCallback((pending: boolean) => {
    registrationPendingRef.current = pending;
    setRegistrationPending(pending);
  }, []);
  const closeRegistration = useCallback((animate = true) => {
    if (registrationPendingRef.current) return;
    setRegistrationMotion(animate);
    setRegistrationState("closing");
  }, []);
  const finishClosingRegistration = useCallback(() => {
    setRegistrationState("closed");
    createPropertyButtonRef.current?.focus({ preventScroll: true });
  }, []);
  const handlePropertyRegistered = useCallback(({ intakeId }: PropertyRegistrationResult) => {
    registrationPendingRef.current = false;
    setRegistrationPending(false);
    setRegistrationState("closed");
    setInspectorMotion(false);
    setIsInspectorClosing(false);
    setSelectedIntakeId(intakeId);
  }, []);
  const shouldRestorePropertyTableFocusRef = useRef(false);
  const [startDealPrompt, setStartDealPrompt] =
    useState<StartDealPrompt | null>(null);
  const [resumeClosedPrompt, setResumeClosedPrompt] =
    useState<ResumeClosedPrompt | null>(null);
  const [closeIntakePrompt, setCloseIntakePrompt] =
    useState<CloseIntakePrompt | null>(null);
  const [reactivateListingPrompt, setReactivateListingPrompt] =
    useState<ReactivateListingPrompt | null>(null);
  const [viewMode, setViewMode] = useState<PropertyViewMode>("list");
  // 펼친 의뢰 → 활성 탭. 매칭 열·광고 열 어느 쪽을 눌러도 같은 패널이 열리고
  // 패널 머리글 탭으로 연결 구매고객 ↔ 광고를 전환한다.
  const [expandedPanels, setExpandedPanels] = useState<
    ReadonlyMap<string, "match" | "ad">
  >(() => new Map());
  const [
    arePropertyDetailColumnsCollapsed,
    setArePropertyDetailColumnsCollapsed,
  ] = useState(true);
  const [isPriceFilterOpen, setIsPriceFilterOpen] = useState(false);
  const [isMonthlyRentFilterOpen, setIsMonthlyRentFilterOpen] = useState(false);
  const [isAreaFilterOpen, setIsAreaFilterOpen] = useState(false);
  const [isLocationFilterOpen, setIsLocationFilterOpen] = useState(false);
  const [isAvailabilityFilterOpen, setIsAvailabilityFilterOpen] = useState(false);
  // 필터 줄(둘째 줄) 접기. Notion의 필터 아이콘과 같은 동작이며 기본은 펼침.
  const [isFilterRowOpen, setIsFilterRowOpen] = useState(true);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  // 선택 표시 컬럼 — 융자금
  const [optionalColumns, setOptionalColumns] = useState({
    loanAmount: false,
  });
  const debouncedSearch = useDebouncedValue(search, 300);
  const debouncedDongSearch = useDebouncedValue(
    propertyFilters.dongSearch,
    300,
  );
  const debouncedUnitSearch = useDebouncedValue(
    propertyFilters.unitSearch,
    300,
  );

  const { data: filterSites = [], isLoading: isFilterSitesLoading } = useQuery({
    queryKey: ["listings", "filter-sites"],
    queryFn: () => api.listings.filterSites(),
    staleTime: 5 * 60_000,
  });

  const siteFilterOptions = useMemo<MultiSelectOption[]>(
    () =>
      filterSites
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "ko"))
        .map((site) => ({
          value: site.id,
          label: site.name,
          description:
            site.roadAddress ??
            site.jibunAddress ??
            getSiteTypeLabel(site.type),
          meta: `${site.propertyCount.toLocaleString()}건`,
        })),
    [filterSites],
  );
  const { data: provinces = [] } = useQuery({
    queryKey: ["regions", "provinces"],
    queryFn: () => api.regions.findProvinces(),
    staleTime: 24 * 60_000,
  });
  const { data: districts = [] } = useQuery({
    queryKey: ["regions", "districts", propertyFilters.provinceCode],
    queryFn: () =>
      api.regions.findDistricts(propertyFilters.provinceCode || undefined),
    enabled: Boolean(propertyFilters.provinceCode),
    staleTime: 24 * 60_000,
  });
  const { data: wards = [] } = useQuery({
    queryKey: ["regions", "wards", propertyFilters.districtCode],
    queryFn: () =>
      api.regions.findWards(propertyFilters.districtCode || undefined),
    enabled: Boolean(propertyFilters.districtCode),
    staleTime: 24 * 60_000,
  });
  const provinceOptions = useMemo(
    () => [
      { value: "", label: "전체" },
      ...provinces.map((province) => ({
        value: province.code,
        label: province.name,
      })),
    ],
    [provinces],
  );
  const districtOptions = useMemo(
    () => [
      { value: "", label: "전체" },
      ...districts.map((district) => ({
        value: district.code,
        label: district.name,
      })),
    ],
    [districts],
  );
  const wardOptions = useMemo(
    () => [
      { value: "", label: "전체" },
      ...wards.map((ward) => ({ value: ward.code, label: ward.name })),
    ],
    [wards],
  );

  // ── Derive API params from filters ────────────────────────────
  const apiParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      limit: LISTINGS_PAGE_SIZE,
      search: debouncedSearch.trim() || undefined,
      dong: debouncedDongSearch.trim() || undefined,
      unit: debouncedUnitSearch.trim() || undefined,
      includeClosed: true,
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
  }, [
    debouncedDongSearch,
    debouncedSearch,
    debouncedUnitSearch,
    propertyFilters,
    selectedTransactionType,
    activeSorts,
  ]);

  // ── Query ─────────────────────────────────────────────────────
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: ["listing-intakes", apiParams],
      queryFn: ({ pageParam }) =>
        api.listingIntakes.findAll({ ...apiParams, page: pageParam } as any),
      initialPageParam: 1,
      placeholderData: keepPreviousData,
      getNextPageParam: (lastPage) => {
        const { page: currentPage, hasNextPage: hasMore } = lastPage.pagination;
        return hasMore ? currentPage + 1 : undefined;
      },
    });

  const listingIntakes = useMemo(
    () => data?.pages.flatMap((pageData) => pageData.items) ?? [],
    [data?.pages],
  );
  const loadedIntakes = listingIntakes.length;
  const intakeCountLabel = `${loadedIntakes.toLocaleString()}${hasNextPage ? "+" : ""}`;
  const loadedListings = useMemo(
    () =>
      listingIntakes.reduce(
        (total, intake) => total + (intake.listings?.length ?? 0),
        0,
      ),
    [listingIntakes],
  );
  const listingUpdatedAtById = useMemo(() => {
    const map = new Map<string, string>();
    for (const intake of listingIntakes) {
      for (const listing of intake.listings ?? []) {
        map.set(listing.id, listing.updatedAt);
      }
    }
    return map;
  }, [listingIntakes]);
  const intakeUpdatedAtById = useMemo(() => {
    const map = new Map<string, string>();
    for (const intake of listingIntakes) {
      map.set(intake.id, intake.updatedAt);
    }
    return map;
  }, [listingIntakes]);

  const propertyGroups = useMemo(
    () => buildPropertyListingGroups(listingIntakes),
    [listingIntakes],
  );
  const mapApiParams = useMemo(() => {
    const { limit, page, ...params } = apiParams;
    void limit;
    void page;
    return params;
  }, [apiParams]);
  const {
    data: mapData,
    isLoading: isMapDataLoading,
    isError: isMapDataError,
  } = useQuery({
    queryKey: ["listing-intakes", "map", mapApiParams],
    queryFn: () => api.listingIntakes.map(mapApiParams as any),
    enabled: viewMode === "map",
    placeholderData: keepPreviousData,
  });
  const mapIntakes = mapData?.items ?? listingIntakes;
  const mapGroups = useMemo(
    () => buildPropertyListingGroups(mapIntakes),
    [mapIntakes],
  );
  const mapPoints = useMemo(
    () => buildPropertyMapPoints(mapGroups),
    [mapGroups],
  );
  useEffect(() => {
    const idleId = window.requestIdleCallback(preloadNaverMaps, {
      timeout: 2000,
    });
    return () => window.cancelIdleCallback(idleId);
  }, []);
  const selectedProvince = propertyFilters.provinceCode
    ? provinces.find(
        (province) => province.code === propertyFilters.provinceCode,
      )
    : undefined;
  const selectedDistrict = propertyFilters.districtCode
    ? districts.find(
        (district) => district.code === propertyFilters.districtCode,
      )
    : undefined;
  const selectedWard = propertyFilters.wardCode
    ? wards.find((ward) => ward.code === propertyFilters.wardCode)
    : undefined;
  const selectedRegionName =
    selectedWard?.name ?? selectedDistrict?.name ?? selectedProvince?.name;
  const priceDepositFilterSummary = getPriceDepositFilterSummary(
    propertyFilters,
    selectedTransactionType,
  );
  const monthlyRentFilterSummary = getRangeSummary(
    propertyFilters.monthlyRentMin,
    propertyFilters.monthlyRentMax,
    "만원",
  );
  const areaFilterSummary = getRangeSummary(
    propertyFilters.areaMin,
    propertyFilters.areaMax,
    "평",
  );
  const roomBathFilterSummary = getRoomBathFilterSummary(
    propertyFilters.roomCount,
    propertyFilters.bathRoomCount,
  );
  const moveInFilterSummary = getDateRangeSummary(
    propertyFilters.moveInFrom,
    propertyFilters.moveInTo,
  );

  const hasActiveFilters = Boolean(
    search.trim() ||
    propertyFilters.siteIds.length > 0 ||
    propertyFilters.provinceCode ||
    propertyFilters.districtCode ||
    propertyFilters.wardCode ||
    propertyFilters.dongSearch.trim() ||
    propertyFilters.unitSearch.trim() ||
    propertyFilters.siteTypes.length > 0 ||
    propertyFilters.availabilities.length > 0 ||
    propertyFilters.priceMin ||
    propertyFilters.priceMax ||
    propertyFilters.depositMin ||
    propertyFilters.depositMax ||
    propertyFilters.monthlyRentMin ||
    propertyFilters.monthlyRentMax ||
    propertyFilters.areaMin ||
    propertyFilters.areaMax ||
    propertyFilters.roomCount ||
    propertyFilters.bathRoomCount ||
    propertyFilters.moveInFrom ||
    propertyFilters.moveInTo ||
    propertyFilters.advertisement !== "all" ||
    activeSorts.length > 0,
  );

  // ── Inline edit mutation ──────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateListingDto }) =>
      api.listings.update(id, patch),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["listing-intakes"] });
    },
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
    },
    onError: (error) => {
      handleMutationError(error);
      queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
    },
  });
  const confirmMutation = useMutation({
    mutationFn: ({
      intakeId,
      result,
      expectedUpdatedAt,
    }: {
      intakeId: string;
      result:
        | "alive"
        | "price_changed"
        | "unavailable"
        | "no_answer"
        | "pending";
      expectedUpdatedAt?: string | null;
    }) =>
      api.listingIntakes.confirm(intakeId, {
        result,
        channel: "note",
        expectedUpdatedAt,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
      if (selectedIntakeId) {
        queryClient.invalidateQueries({
          queryKey: ["listing-intakes", "inspector", selectedIntakeId],
        });
      }
    },
    onError: (error) => {
      handleMutationError(error);
      queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
    },
  });
  const invalidateListingStatusQueries = useCallback(() => {
    for (const queryKey of [
      ["listing-intakes"],
      ["listings"],
      ["properties"],
      ["deals"],
      ["dashboard"],
      ["network"],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
    if (selectedIntakeId) {
      void queryClient.invalidateQueries({
        queryKey: ["listing-intakes", "inspector", selectedIntakeId],
      });
    }
  }, [queryClient, selectedIntakeId]);

  const rowLifecycleMutation = useMutation({
    mutationFn: ({
      intakeId,
      value,
      closedReason,
      expectedUpdatedAt,
    }: {
      intakeId: string;
      listingIds: string[];
      value: IntakeLifecycleStatus;
      closedReason?: ManualIntakeCloseReason | null;
      expectedUpdatedAt?: string | null;
    }) =>
      api.listingIntakes.updateLifecycleStatus(intakeId, value, {
        closedReason,
        expectedUpdatedAt,
      }),
    onSettled: invalidateListingStatusQueries,
    onError: (error) => {
      handleMutationError(error);
    },
  });
  const closeActiveDealsMutation = useMutation({
    mutationFn: ({
      intakeId,
      closedReason,
      expectedUpdatedAt,
    }: {
      intakeId: string;
      closedReason: ManualIntakeCloseReason;
      expectedUpdatedAt?: string | null;
    }) =>
      api.listingIntakes.closeWithActiveDeals(intakeId, {
        closedReason,
        expectedUpdatedAt,
      }),
    onSuccess: () => {
      toast.success("진행 거래를 취소하고 매물을 종료했습니다.");
      setCloseIntakePrompt(null);
    },
    onSettled: invalidateListingStatusQueries,
    onError: (error) => {
      handleMutationError(error);
    },
  });
  const reactivateListingMutation = useMutation({
    mutationFn: async ({ activeDealIds }: ReactivateListingPrompt) => {
      await Promise.all(
        activeDealIds.map((dealId) => api.deals.remove(dealId)),
      );
    },
    onSuccess: () => {
      toast.success("현재 거래를 삭제하고 매물을 활성화했습니다.");
      setReactivateListingPrompt(null);
    },
    onSettled: invalidateListingStatusQueries,
    onError: (error) => {
      handleMutationError(error);
    },
  });
  const intakeMemoMutation = useMutation({
    mutationFn: ({
      intakeId,
      memo,
      expectedUpdatedAt,
    }: {
      intakeId: string;
      memo: string | null;
      expectedUpdatedAt?: string | null;
    }) =>
      api.listingIntakes.update(intakeId, {
        memo,
        expectedUpdatedAt,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
      if (selectedIntakeId) {
        await queryClient.invalidateQueries({
          queryKey: ["listing-intakes", "inspector", selectedIntakeId],
        });
      }
    },
    onError: (error) => {
      handleMutationError(error);
      queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
    },
  });
  const handleCellSave = useCallback(
    async (recordId: string, field: string, value: unknown) => {
      await updateMutation.mutateAsync({
        id: recordId,
        patch: {
          [field]: value,
          expectedUpdatedAt: listingUpdatedAtById.get(recordId),
        } as UpdateListingDto,
      });
    },
    [listingUpdatedAtById, updateMutation],
  );
  const handleListingPatch = useCallback(
    async (recordId: string, patch: UpdateListingDto) => {
      await updateMutation.mutateAsync({
        id: recordId,
        patch: {
          ...patch,
          expectedUpdatedAt:
            patch.expectedUpdatedAt ?? listingUpdatedAtById.get(recordId),
        },
      });
    },
    [listingUpdatedAtById, updateMutation],
  );
  const handleInspectorListingUpdate = useCallback(
    async (recordId: string, patch: UpdateListingDto) => {
      await updateMutation.mutateAsync({
        id: recordId,
        patch: {
          ...patch,
          expectedUpdatedAt:
            patch.expectedUpdatedAt ?? listingUpdatedAtById.get(recordId),
        },
      });
    },
    [listingUpdatedAtById, updateMutation],
  );
  const handleIntakeConfirm = useCallback(
    (
      intakeId: string,
      result:
        | "alive"
        | "price_changed"
        | "unavailable"
        | "no_answer"
        | "pending",
    ) => {
      confirmMutation.mutate({
        intakeId,
        result,
        expectedUpdatedAt: intakeUpdatedAtById.get(intakeId),
      });
    },
    [confirmMutation, intakeUpdatedAtById],
  );
  const handleRowStatusSave = useCallback(
    (group: PropertyListingGroup, value: ListingAvailability) => {
      const intake = group.representative;
      const listingsWithIntake = group.listings.map((listing) => ({
        ...listing,
        intake: { lifecycleStatus: intake.lifecycleStatus },
      }));
      const currentValue = getListingRowAvailability(
        intake,
        listingsWithIntake,
      );
      const plan = planListingStatusChange(
        currentValue,
        value,
        listingsWithIntake,
      );
      const propertyLabel = [
        group.property?.site?.name,
        getDongName(group.property),
        group.property?.unit?.name,
      ]
        .filter((part) => part && part !== "-")
        .join(" ");

      if (plan.kind === "startDeal") {
        setStartDealPrompt({
          propertyId: group.propertyId,
          propertyLabel,
          listings: plan.candidates,
          requiresListingSelection: group.listings.length > 1,
          intakeLifecycleStatus: intake.lifecycleStatus,
        });
        return;
      }

      if (plan.kind === "reviewResume") {
        setResumeClosedPrompt({
          intakeId: intake.id,
          listingIds: group.listings.map((listing) => listing.id),
          propertyLabel,
          targetAvailability: value,
          canResume: plan.canResume,
          completedListingCount: plan.completedListingCount,
          resumableListingCount: plan.resumableListingCount,
        });
        return;
      }

      if (plan.kind === "closeWithActiveDeals") {
        setCloseIntakePrompt({
          intakeId: intake.id,
          propertyLabel,
          activeDealCount: plan.activeDealCount,
          activeDealIds: plan.activeDealIds,
        });
        return;
      }

      if (plan.kind === "deleteActiveDealsAndReactivate") {
        setReactivateListingPrompt({
          propertyLabel,
          activeDealCount: plan.activeDealCount,
          activeDealIds: plan.activeDealIds,
        });
        return;
      }

      if (plan.kind === "blocked") {
        toast.info(
          plan.reason === "allHaveActiveDeals"
            ? "모든 거래유형에 이미 진행 중인 Deal이 있습니다."
            : plan.reason === "completedDeal"
              ? "이미 거래 완료된 Deal이 있어 종료된 매물입니다."
              : plan.reason === "closedIntake"
                ? "종료된 의뢰입니다. 먼저 활성으로 재개해 주세요."
                : plan.reason === "noCandidates"
                  ? "Deal을 생성할 수 있는 거래유형이 없습니다."
                  : "거래중 상태는 연결된 Deal에서 단계를 변경하거나 취소해 주세요.",
        );
        return;
      }

      if (plan.kind === "noop") return;

      if (plan.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
        setCloseIntakePrompt({
          intakeId: intake.id,
          propertyLabel,
          activeDealCount: 0,
          activeDealIds: [],
        });
        return;
      }

      rowLifecycleMutation.mutate({
        intakeId: intake.id,
        listingIds: group.listings.map((listing) => listing.id),
        value: plan.lifecycleStatus,
        closedReason: null,
        expectedUpdatedAt: intakeUpdatedAtById.get(intake.id),
      });
    },
    [intakeUpdatedAtById, rowLifecycleMutation],
  );
  const handleInspectorAvailabilityChange = useCallback(
    (intake: ListingIntake, property: Property, value: ListingAvailability) => {
      handleRowStatusSave(
        {
          id: property.id,
          intakeId: intake.id,
          propertyId: property.id,
          property,
          representative: intake,
          listings: (intake.listings ?? []).map(toListingSummary),
          matchedIntakes: [intake],
        },
        value,
      );
    },
    [handleRowStatusSave],
  );
  const openPropertyInspector = useCallback((intakeId: string) => {
    if (registrationPendingRef.current) return;
    setRegistrationState("closed");
    setInspectorMotion(!document.activeElement?.matches(":focus-visible"));
    setIsInspectorClosing(false);
    setSelectedIntakeId(intakeId);
  }, []);
  const closePropertyInspector = useCallback((animate = true) => {
    shouldRestorePropertyTableFocusRef.current = true;
    setInspectorMotion(animate);
    setIsInspectorClosing(true);
  }, []);
  const finishClosingPropertyInspector = useCallback(() => {
    setSelectedIntakeId(null);
    setIsInspectorClosing(false);
  }, []);
  useEffect(() => {
    if (selectedIntakeId || !shouldRestorePropertyTableFocusRef.current) return;
    const timer = window.setTimeout(() => {
      document
        .querySelector<HTMLElement>("[data-property-table-scroller]")
        ?.focus({ preventScroll: true });
      shouldRestorePropertyTableFocusRef.current = false;
    }, 100);
    return () => window.clearTimeout(timer);
  }, [selectedIntakeId]);
  const handleIntakeMemoSave = useCallback(
    async (intakeId: string, value: unknown) => {
      const memo = parseEditorTextValue(value);
      await intakeMemoMutation.mutateAsync({
        intakeId,
        memo,
        expectedUpdatedAt: intakeUpdatedAtById.get(intakeId),
      });
    },
    [intakeMemoMutation, intakeUpdatedAtById],
  );
  // ── Filter handlers ───────────────────────────────────────────
  const updatePropertyFilter = useCallback(
    <K extends keyof PropertyFilterState>(
      field: K,
      value: PropertyFilterState[K],
    ) => {
      setPropertyFilters((prev) => ({ ...prev, [field]: value }));
      setPage(1);
    },
    [],
  );
  const handleProvinceFilterChange = useCallback((value: string) => {
    setPropertyFilters((prev) => ({
      ...prev,
      provinceCode: value,
      districtCode: "",
      wardCode: "",
    }));
    setPage(1);
  }, []);
  const handleDistrictFilterChange = useCallback((value: string) => {
    setPropertyFilters((prev) => ({
      ...prev,
      districtCode: value,
      wardCode: "",
    }));
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleFiltersReset = useCallback(() => {
    setPropertyFilters(initialPropertyFilters);
    setSelectedTransactionType("all");
    setActiveSorts([]);
    setSearch("");
    setSorting([]);
    setPage(1);
  }, []);

  // 특정 필터 필드만 초기값으로 되돌림 (chip X / summary pill X 공용).
  const clearFilterFields = useCallback(
    (fields: (keyof PropertyFilterState)[]) => {
      setPropertyFilters((prev) => {
        const next = { ...prev };
        for (const field of fields) {
          (next[field] as PropertyFilterState[typeof field]) =
            initialPropertyFilters[field];
        }
        return next;
      });
      setPage(1);
    },
    [],
  );

  const handleSortingChange = useCallback((newSorting: SortingState) => {
    setSorting(newSorting);
    if (newSorting.length > 0) {
      const s = newSorting[0];
      setActiveSorts([
        {
          field: s.id,
          label: sortDefinitions.find((d) => d.field === s.id)?.label ?? s.id,
          direction: s.desc ? "desc" : "asc",
        },
      ]);
    } else {
      setActiveSorts([]);
    }
    setPage(1);
  }, []);

  const handleTransactionTabChange = useCallback((transactionType: string) => {
    const nextTransactionType =
      transactionType as (typeof transactionTypeOptions)[number]["value"];
    setSelectedTransactionType(nextTransactionType);
    setPropertyFilters((previous) =>
      movePriceRangeForTransaction(previous, nextTransactionType),
    );
    setPage(1);
  }, []);

  const handlePriceRangeApply = useCallback(
    (range: [number, number]) => {
      setPropertyFilters((previous) =>
        applyPriceRangeFilter(
          previous,
          selectedTransactionType,
          range[0],
          range[1],
        ),
      );
      setPage(1);
      setIsPriceFilterOpen(false);
    },
    [selectedTransactionType],
  );

  const handleMonthlyRentRangeApply = useCallback((range: [number, number]) => {
    setPropertyFilters((previous) =>
      applyMonthlyRentRangeFilter(previous, range[0], range[1]),
    );
    setPage(1);
    setIsMonthlyRentFilterOpen(false);
  }, []);

  const handleAreaRangeApply = useCallback((range: [number, number]) => {
    setPropertyFilters((previous) =>
      applyAreaRangeFilter(previous, range[0], range[1]),
    );
    setPage(1);
    setIsAreaFilterOpen(false);
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleCreateProperty = useCallback(() => {
    setSelectedIntakeId(null);
    setIsInspectorClosing(false);
    shouldRestorePropertyTableFocusRef.current = false;
    setRegistrationMotion(!document.activeElement?.matches(":focus-visible"));
    setRegistrationState("open");
  }, []);

  // 열 아이콘을 누르면 그 탭으로 연다. 같은 탭이 이미 열려 있으면 닫고,
  // 다른 탭이 열려 있으면 탭만 바꾼다.
  const togglePanelTab = useCallback(
    (groupId: string, tab: "match" | "ad") => {
      setExpandedPanels((previous) => {
        const next = new Map(previous);
        if (next.get(groupId) === tab) {
          next.delete(groupId);
        } else {
          next.set(groupId, tab);
        }
        return next;
      });
    },
    [],
  );
  const toggleMatchRow = useCallback(
    (groupId: string) => togglePanelTab(groupId, "match"),
    [togglePanelTab],
  );
  const toggleAdRow = useCallback(
    (groupId: string) => togglePanelTab(groupId, "ad"),
    [togglePanelTab],
  );
  // 패널 머리글의 탭에서 호출 — 항상 그 탭을 연다 (닫지 않는다).
  const setPanelTab = useCallback((groupId: string, tab: "match" | "ad") => {
    setExpandedPanels((previous) => {
      if (previous.get(groupId) === tab) return previous;
      const next = new Map(previous);
      next.set(groupId, tab);
      return next;
    });
  }, []);

  const expandedRowIds = useMemo(
    () => new Set(expandedPanels.keys()),
    [expandedPanels],
  );

  // 매칭 패널은 고객 줄을 펼치면 높이가 달라져, 패널이 잰 실제 높이를 받아 쓴다.
  const [matchPanelHeights, setMatchPanelHeights] = useState<
    ReadonlyMap<string, number>
  >(() => new Map());
  const handleMatchPanelHeightChange = useCallback(
    (groupId: string, height: number) => {
      setMatchPanelHeights((previous) => {
        if (previous.get(groupId) === height) return previous;
        const next = new Map(previous);
        next.set(groupId, height);
        return next;
      });
    },
    [],
  );

  const renderExpandedPropertyRow = useCallback(
    (group: PropertyListingGroup) => {
      const tab = expandedPanels.get(group.id);
      if (!tab) return null;
      return (
        <PropertyMatchPanel
          group={group}
          activeTab={tab}
          onTabChange={setPanelTab}
          onHeightChange={handleMatchPanelHeightChange}
          adPanel={(controls) => <PropertyAdPanel group={group} controls={controls} />}
        />
      );
    },
    [expandedPanels, setPanelTab, handleMatchPanelHeightChange],
  );

  const getExpandedPropertyRowHeight = useCallback(
    (group: PropertyListingGroup) => {
      const tab = expandedPanels.get(group.id);
      if (tab === "ad") return estimatePropertyAdPanelHeight(group);
      if (tab === "match")
        return (
          matchPanelHeights.get(group.id) ??
          estimatePropertyMatchPanelHeight(group)
        );
      return 0;
    },
    [expandedPanels, matchPanelHeights],
  );

  const handleColumnVisibilityChange = useCallback((id: string, visible: boolean) => {
    if (id === "site") return;
    setColumnVisibility((previous) => ({
      ...previous,
      ...(visible && arePropertyDetailColumnsCollapsed && propertyDetailColumnIds.includes(id)
        ? Object.fromEntries(propertyDetailColumnIds.map((field) => [field, false]))
        : {}),
      [id]: visible,
    }));
    if (id === "loanAmount") setOptionalColumns({ loanAmount: visible });
    if (visible && propertyDetailColumnIds.includes(id)) setArePropertyDetailColumnsCollapsed(false);
  }, [arePropertyDetailColumnsCollapsed]);

  const togglePropertyDetailColumns = useCallback(() => {
    if (arePropertyDetailColumnsCollapsed && propertyDetailColumnIds.every((id) => columnVisibility[id] === false)) {
      setColumnVisibility((previous) => ({
        ...previous,
        ...Object.fromEntries(propertyDetailColumnIds.map((id) => [id, true])),
      }));
    }
    setArePropertyDetailColumnsCollapsed((previous) => !previous);
  }, [arePropertyDetailColumnsCollapsed, columnVisibility]);

  // ── Column definitions (property-grouped operational grid) ────
  const columns = useMemo<ColumnDef<PropertyListingGroup, unknown>[]>(
    () => [
      {
        id: "info",
        header: () => (
          <TableHeaderLabel icon={<Tag className="size-4" />} label="거래" />
        ),
        size: 74, // 좌우 여백20 + 아이콘16 + 간격6 + 14px 두 글자
        enableSorting: true,
        cell: ({ row }) => (
          <TransactionStack listings={row.original.listings} />
        ),
      },
      {
        id: "site",
        header: () => (
          <TableHeaderLabel icon={<Type className="size-4" />} label="단지" />
        ),
        size: 240,
        enableSorting: true,
        cell: ({ row }) => {
          const group = row.original;
          const isCurrentInspector =
            selectedIntakeId === group.intakeId && !isInspectorClosing;
          const inspectorAction = isCurrentInspector ? "닫기" : "열기";
          return (
            <div className="min-w-0">
              <span className="block truncate text-[14px] font-medium leading-[21px] text-foreground">
                {group.property?.site?.name ?? "매물 정보 없음"}
              </span>
              <span
                data-property-row-open
                className="pointer-events-none absolute right-1 top-1/2 z-[2] -translate-y-1/2 rounded-[6px] bg-white p-0.5 opacity-0 shadow-[0_8px_12px_rgba(25,25,25,0.027),0_2px_6px_rgba(25,25,25,0.027),0_0_0_1px_rgba(42,28,0,0.07)] group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
              >
                <button
                  type="button"
                  aria-label={`${group.property?.site?.name ?? "매물"} ${getDongName(group.property)}동 ${group.property?.unit?.name ?? ""}호 상세 ${inspectorAction}`}
                  aria-expanded={isCurrentInspector}
                  aria-controls={isCurrentInspector ? "property-inspector" : undefined}
                  title={isCurrentInspector ? "사이드 보기 닫기" : "사이드 보기에서 열기"}
                  className="flex h-5 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-1 text-[12px] font-medium leading-[18px] tracking-[0.5px] text-[#7d7a75] transition-[background-color] duration-[20ms] ease-in hover:bg-[rgba(33,27,23,0.051)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35"
                  style={{ fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isCurrentInspector) closePropertyInspector();
                    else openPropertyInspector(group.intakeId);
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <svg aria-hidden="true" viewBox="0 0 16 20" className="h-5 w-[15.25px] shrink-0 text-[#8e8b86]" fill="none">
                    <rect x="1" y="4.75" width="14" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                    <rect x="7.75" y="6.125" width="5.5" height="7.75" rx="0.5" fill="currentColor" />
                  </svg>
                  {inspectorAction}
                </button>
              </span>
            </div>
          );
        },
      },
      {
        id: "dong",
        header: () => (
          <TableHeaderLabel icon={<List className="size-4" />} label="동" />
        ),
        size: 58,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="truncate text-[14px] font-medium leading-[21px] text-foreground">
            {getDongName(row.original.property)}
          </span>
        ),
      },
      {
        id: "unit",
        header: () => (
          <TableHeaderLabel icon={<List className="size-4" />} label="호" />
        ),
        size: 58,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="truncate text-[14px] font-medium leading-[21px] text-foreground">
            {row.original.property?.unit?.name ?? ""}
          </span>
        ),
      },
      {
        id: "supplyArea",
        header: () => (
          <TableHeaderLabel icon={<Ruler className="size-4" />} label="공급" />
        ),
        size: 74,
        enableSorting: true,
        cell: ({ row }) => {
          const value = formatAreaPyeong(
            getSupplyAreaM2(row.original.property),
            0,
          );
          return (
            <span className="truncate text-[14px] leading-[21px] text-foreground tabular-nums">
              {value === "-" ? "" : value}
            </span>
          );
        },
      },
      ...(!arePropertyDetailColumnsCollapsed
        ? [
            {
              id: "unitType",
              header: () => (
                <TableHeaderLabel
                  icon={<Tag className="size-4" />}
                  label="타입"
                />
              ),
              size: 74,
              enableSorting: true,
              cell: ({ row }) => {
                const value = getUnitTypeName(row.original.property);
                return (
                  <span className="truncate text-[14px] leading-[21px] text-foreground">
                    {value === "-" ? "" : value}
                  </span>
                );
              },
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
            {
              id: "matching",
              header: () => (
                <TableHeaderLabel
                  icon={<UserSearch className="size-4" />}
                  label="매칭"
                />
              ),
              size: 74,
              enableSorting: true,
              cell: ({ row }) => (
                <ListingMatchToggle
                  group={row.original}
                  isOpen={expandedPanels.get(row.original.id) === "match"}
                  onToggle={toggleMatchRow}
                />
              ),
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
            {
              id: "advertisement",
              header: () => (
                <TableHeaderLabel
                  icon={<Megaphone className="size-4" />}
                  label="광고"
                />
              ),
              size: 74,
              enableSorting: true,
              cell: ({ row }) => (
                <ListingAdToggle
                  group={row.original}
                  isOpen={expandedPanels.get(row.original.id) === "ad"}
                  onToggle={toggleAdRow}
                />
              ),
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
            {
              id: "confirmationAt",
              header: () => (
                <TableHeaderLabel
                  icon={<Clock className="size-4" />}
                  label="확인"
                />
              ),
              size: 112,
              enableSorting: true,
              cell: ({ row }) => (
                <IntakeConfirmationCell
                  intake={row.original.representative}
                  onConfirm={handleIntakeConfirm}
                  isPending={
                    confirmMutation.isPending &&
                    confirmMutation.variables?.intakeId ===
                      row.original.representative.id
                  }
                />
              ),
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
          ]
        : []),
      {
        id: "listingAvailability",
        header: () => (
          <TableHeaderLabel
            icon={<Info className="size-4" />}
            label="매물상태"
          />
        ),
        size: 148,
        minSize: 96,
        enableSorting: true,
        meta: {
          cellClassName: "z-[2] overflow-visible",
        },
        cell: ({ row }) => (
          <ListingAvailabilityCell
            intake={row.original.representative}
            listings={row.original.listings}
            onChange={(value) => handleRowStatusSave(row.original, value)}
          />
        ),
      },
      {
        id: "price",
        header: () => (
          <TableHeaderLabel
            icon={<WonCircleIcon className="size-4" />}
            label="가격/보증금"
          />
        ),
        size: 155,
        enableSorting: true,
        meta: {
          listingCell: true,
          cellClassName: "hover:bg-muted/50",
          onCellClick: (
            _group: PropertyListingGroup,
            event: ReactMouseEvent<HTMLTableCellElement>,
          ) => {
            triggerStackCellEditor(event);
          },
        },
        cell: ({ row }) => (
          <ListingPriceDepositStack
            listings={row.original.listings}
            activeDealListingId={
              row.original.listings.length > 1
                ? (row.original.listings[
                    getActiveDealListingIndex(row.original.listings)
                  ]?.id ?? null)
                : null
            }
            onSave={handleCellSave}
            onPatch={handleListingPatch}
          />
        ),
      },
      {
        id: "monthlyRent",
        header: () => (
          <TableHeaderLabel
            icon={<WonCircleIcon className="size-4" />}
            label="월세"
          />
        ),
        size: 82,
        enableSorting: true,
        meta: {
          listingCell: true,
          cellClassName: "hover:bg-muted/50",
          onCellClick: (
            _group: PropertyListingGroup,
            event: ReactMouseEvent<HTMLTableCellElement>,
          ) => {
            triggerStackCellEditor(event);
          },
        },
        cell: ({ row }) => (
          <ListingMonthlyRentStack
            listings={row.original.listings}
            onPatch={handleListingPatch}
          />
        ),
      },
      ...(optionalColumns.loanAmount
        ? [
            {
              id: "loanAmount",
              header: () => (
                <TableHeaderLabel
                  icon={<WonCircleIcon className="size-4" />}
                  label="융자금"
                />
              ),
              size: 96,
              enableSorting: true,
              meta: {
                listingCell: true,
                cellClassName: "hover:bg-muted/50",
                onCellClick: (
                  _group: PropertyListingGroup,
                  event: ReactMouseEvent<HTMLTableCellElement>,
                ) => {
                  triggerStackCellEditor(event);
                },
              },
              cell: ({ row }) => (
                <ListingNumberFieldStack
                  listings={row.original.listings}
                  field="loanAmount"
                  onSave={handleCellSave}
                />
              ),
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
          ]
        : []),
      {
        id: "moveInAvailable",
        header: () => (
          <TableHeaderLabel
            icon={<Calendar className="size-4" />}
            label="입주가능일"
          />
        ),
        size: 120,
        enableSorting: true,
        meta: { listingCell: true },
        cell: ({ row }) => (
          <MoveInAvailableStack
            listings={row.original.listings}
            onPatch={handleListingPatch}
          />
        ),
      },
      {
        id: "memo",
        header: () => (
          <TableHeaderLabel
            icon={<PencilLine className="size-4" />}
            label="의뢰 메모"
          />
        ),
        size: 320,
        minSize: 220,
        enableResizing: false,
        enableSorting: true,
        meta: {
          cellClassName: "hover:bg-muted/50",
          grow: true,
          onCellClick: (
            _group: PropertyListingGroup,
            event: ReactMouseEvent<HTMLTableCellElement>,
          ) => {
            triggerStackCellEditor(event);
          },
        },
        cell: ({ row }) => (
          <IntakeMemoCell
            intake={row.original.representative}
            onSave={handleIntakeMemoSave}
          />
        ),
      },
    ],
    [
      arePropertyDetailColumnsCollapsed,
      handleCellSave,
      handleCreateProperty,
      handleIntakeConfirm,
      handleIntakeMemoSave,
      handleListingPatch,
      handleRowStatusSave,
      openPropertyInspector,
      closePropertyInspector,
      selectedIntakeId,
      isInspectorClosing,
      confirmMutation.isPending,
      confirmMutation.variables?.intakeId,
      expandedPanels,
      optionalColumns.loanAmount,
      toggleAdRow,
      toggleMatchRow,
    ],
  );

  // ── 툴바: 위치 · 가격 라벨 · 추가 필터 칩 ─────────────────────
  const selectedSiteSummary = summarizeSelection(
    siteFilterOptions,
    propertyFilters.siteIds,
  );
  const locationFilterLabel =
    selectedSiteSummary ?? selectedRegionName ?? "지역·단지 전체";
  const isLocationFilterNamed = Boolean(
    selectedSiteSummary ?? selectedRegionName,
  );
  const isLocationFilterActive = Boolean(
    propertyFilters.siteIds.length > 0 ||
    propertyFilters.provinceCode ||
    propertyFilters.dongSearch.trim() ||
    propertyFilters.unitSearch.trim(),
  );
  const priceFilterLabel = {
    all: "가격/보증금",
    sale: "매매가",
    jeonse: "전세가",
    monthly: "보증금",
  }[selectedTransactionType];

  const renderMonthlyRentPanel = (close: () => void) => (
    <NumericRangeFilterPanel
      ariaLabel="월세 필터"
      title="월세"
      description="월 납부액 기준 · 만원 단위"
      initialRange={getMonthlyRentRangeFilter(propertyFilters)}
      min={MONTHLY_RENT_RANGE_MIN}
      max={MONTHLY_RENT_RANGE_MAX}
      step={10}
      presets={MONTHLY_RENT_RANGE_PRESETS}
      tickLabels={["전체", "200만", "400만", "최대"]}
      formatLabel={(min, max) =>
        formatNumericRangeLabel(
          min,
          max,
          MONTHLY_RENT_RANGE_MIN,
          MONTHLY_RENT_RANGE_MAX,
          "만원",
          "전체 월세",
        )
      }
      thumbLabels={["최소 월세", "최대 월세"]}
      onApply={(range) => {
        handleMonthlyRentRangeApply(range);
        close();
      }}
      onClear={() => {
        clearFilterFields(["monthlyRentMin", "monthlyRentMax"]);
        close();
      }}
      onCancel={close}
    />
  );

  // 유형 · 입주일 · 광고. 다른 필터처럼 2행에 늘 칩으로 보인다 ("+ 필터" 메뉴는 두지 않는다).
  const extraFilterItems: (AddFilterItem & { onClear: () => void })[] = [
    {
      key: "siteTypes",
      label: "유형",
      icon: <Building2 />,
      summary: summarizeSelection(siteTypeOptions, propertyFilters.siteTypes),
      onClear: () => clearFilterFields(["siteTypes"]),
      contentClassName: "w-[240px] p-0",
      render: () => (
        <ChecklistFilterPanel
          options={siteTypeOptions}
          selected={propertyFilters.siteTypes}
          onChange={(values) => updatePropertyFilter("siteTypes", values)}
          searchable={false}
        />
      ),
    },
    {
      key: "moveIn",
      label: "입주일",
      icon: <CalendarDays />,
      summary: moveInFilterSummary,
      onClear: () => clearFilterFields(["moveInFrom", "moveInTo"]),
      contentClassName: "w-[320px] p-3",
      render: () => (
        <div className="space-y-3">
          <PopoverTitle
            title="입주일"
            description="입주가능일 시작 날짜 기준으로 검색합니다."
          />
          <DateRangeFilter
            fromValue={propertyFilters.moveInFrom}
            toValue={propertyFilters.moveInTo}
            onFromChange={(value) => updatePropertyFilter("moveInFrom", value)}
            onToChange={(value) => updatePropertyFilter("moveInTo", value)}
          />
        </div>
      ),
    },
    {
      key: "advertisement",
      label: "광고",
      icon: <Megaphone />,
      summary:
        propertyFilters.advertisement === "all"
          ? null
          : (advertisementFilterOptions
              .find((option) => option.value === propertyFilters.advertisement)
              ?.label.replace(/^광고\s*/, "") ?? null),
      onClear: () => clearFilterFields(["advertisement"]),
      contentClassName: "w-[200px] p-1",
      render: (close) => (
        <div role="radiogroup" aria-label="광고 필터">
          {advertisementFilterOptions.map((option) => {
            const isSelected = propertyFilters.advertisement === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  updatePropertyFilter(
                    "advertisement",
                    option.value as PropertyFilterState["advertisement"],
                  );
                  close();
                }}
                className="flex h-8 w-full items-center justify-between rounded-sm px-2 text-left text-[13px] hover:bg-[rgba(55,53,47,0.06)]"
              >
                {option.label}
                {isSelected && <Check className="size-3.5" />}
              </button>
            );
          })}
        </div>
      ),
    },
  ];

  // 초기화. 필터 줄이 접혀 있을 때는 찾기 줄 오른쪽으로 옮겨 계속 쓸 수 있게 한다.
  const filterRowActions = (
    <div className="flex shrink-0 items-center gap-0.5">
      {hasActiveFilters && (
        <>
          <button
            type="button"
            className={cn(toolbarGhostButtonClassName, "rounded-full")}
            onClick={handleFiltersReset}
          >
            <RotateCcw className="size-3.5" />
            초기화
          </button>
        </>
      )}
    </div>
  );

  return (
    <CellEditProvider>
      <div
        data-properties-page
        className="relative -m-4 flex min-h-0 flex-1 flex-col bg-white"
      >
        <section className="shrink-0 border-b border-border bg-white px-3 py-2.5">
          <div className="@container flex min-w-0 items-center gap-2">
            <ToolbarPillTabs
              shape="muted"
              ariaLabel="거래유형"
              value={selectedTransactionType}
              options={transactionTypeOptions}
              onChange={handleTransactionTabChange}
            />

            <ToolbarSearchBar
              shape="soft"
              popoverClassName="w-[736px] max-w-[calc(100vw-24px)]"
              label={locationFilterLabel}
              isPlaceholder={!isLocationFilterNamed}
              active={isLocationFilterActive}
              dong={propertyFilters.dongSearch}
              unit={propertyFilters.unitSearch}
              onDongChange={(value) => updatePropertyFilter("dongSearch", value)}
              onUnitChange={(value) => updatePropertyFilter("unitSearch", value)}
              onClear={() =>
                clearFilterFields([
                  "siteIds",
                  "provinceCode",
                  "districtCode",
                  "wardCode",
                  "dongSearch",
                  "unitSearch",
                ])
              }
              open={isLocationFilterOpen}
              onOpenChange={setIsLocationFilterOpen}
              search={search}
              onSearchChange={handleSearchChange}
              searchPlaceholder="주소, 연락처, 메모"
            >
              {/* 지역 세 단계와 단지 목록을 한 면에 펼친다 (시안: docs/mockups/ui-refresh/properties.html) */}
              <div className="grid h-[320px] grid-cols-[148px_128px_132px_minmax(0,1fr)]">
                <ToolbarRegionColumn
                  ariaLabel="시도"
                  value={propertyFilters.provinceCode}
                  onChange={handleProvinceFilterChange}
                  options={provinceOptions}
                  hasChildren
                />
                <ToolbarRegionColumn
                  ariaLabel="시군구"
                  value={propertyFilters.districtCode}
                  onChange={handleDistrictFilterChange}
                  options={districtOptions}
                  hint={
                    propertyFilters.provinceCode
                      ? undefined
                      : "시도를\n먼저 고르세요"
                  }
                  hasChildren
                />
                <ToolbarRegionColumn
                  ariaLabel="법정동"
                  value={propertyFilters.wardCode}
                  onChange={(value) => updatePropertyFilter("wardCode", value)}
                  options={wardOptions}
                  hint={
                    propertyFilters.districtCode
                      ? undefined
                      : "시군구를\n먼저 고르세요"
                  }
                />
                <div className="flex min-h-0 min-w-0 flex-col">
                  <ChecklistFilterPanel
                    options={siteFilterOptions}
                    selected={propertyFilters.siteIds}
                    onChange={(values) => updatePropertyFilter("siteIds", values)}
                    searchPlaceholder="단지명 또는 주소 검색"
                    emptyText="일치하는 단지가 없습니다."
                    isLoading={isFilterSitesLoading}
                    listClassName="max-h-none min-h-0 flex-1"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-border py-2 pl-3.5 pr-2.5">
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  단지를 고르지 않으면 지역 전체에서 찾습니다.
                </span>
                {propertyFilters.provinceCode && (
                  <button
                    type="button"
                    onClick={() =>
                      clearFilterFields([
                        "provinceCode",
                        "districtCode",
                        "wardCode",
                      ])
                    }
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground"
                  >
                    <RotateCcw className="size-3" />
                    지역 초기화
                  </button>
                )}
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setIsLocationFilterOpen(false)}
                >
                  완료
                </Button>
              </div>
            </ToolbarSearchBar>

            <button
              type="button"
              aria-label={isFilterRowOpen ? "필터 줄 접기" : "필터 줄 펼치기"}
              aria-pressed={isFilterRowOpen}
              title="필터"
              onClick={() => setIsFilterRowOpen((open) => !open)}
              className={cn(
                // 검색 아이콘과 한 쌍으로 보이게 줄 간격(8px)을 없앤다
                "-ml-2 inline-flex size-[30px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[rgba(60,52,40,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                // 접힌 채로 조건이 걸려 있으면 파랗게 알린다
                !isFilterRowOpen && hasActiveFilters
                  ? "text-[#2383e2]"
                  : "text-[#6f6c66] hover:text-foreground",
              )}
            >
              <ListFilter className="size-3.5" />
            </button>
            <PropertyColumnSettings
              isVisible={(id) => columns.some((column) => column.id === id) && columnVisibility[id] !== false}
              onVisibilityChange={handleColumnVisibilityChange}
              onReset={() => {
                setColumnVisibility({});
                setOptionalColumns({ loanAmount: false });
                setArePropertyDetailColumnsCollapsed(true);
              }}
            />
            <PropertySortControl sorting={sorting} onChange={handleSortingChange} />

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {!isFilterRowOpen && filterRowActions}
              <ToolbarPillToggle
                shape="muted"
                ariaLabel="매물 보기 방식"
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: "list", label: "목록", icon: <List /> },
                  { value: "map", label: "지도", icon: <MapIcon /> },
                ]}
              />
              <Button
                ref={createPropertyButtonRef}
                size="sm"
                aria-label="새 매물 등록"
                aria-expanded={registrationState === "open"}
                aria-controls={registrationState !== "closed" ? "property-registration" : undefined}
                className="h-[30px] shrink-0 rounded-[8px] px-3"
                onClick={handleCreateProperty}
              >
                <Plus className="size-3.5" />
                {/* 툴바 폭이 768px보다 좁으면 아이콘만 */}
                <span className="@max-3xl:hidden">새 매물 등록</span>
              </Button>
            </div>
          </div>
        </section>

        {/* 필터 줄과 표 머리는 구분선 없이 이어진다. 필터 아이콘으로 줄을 접을 수 있다. */}
        {isFilterRowOpen && (
        <section
          className={cn(
            // 칩이 두 줄로 넘어가도 초기화는 첫 줄 오른쪽에 남도록 위로 맞춘다
            "flex shrink-0 items-start gap-2 bg-white px-3 pt-2",
            // 목록 보기에서는 표가 위에 8px(접기 버튼이 걸치는 자리)을 따로 비우므로
            // 여기 아래 여백을 빼서 필터 줄과 표 사이가 벌어지지 않게 한다.
            viewMode === "list" ? "pb-0" : "pb-1.5",
          )}
        >
          {/* 필터가 모두 이 줄에 있으므로, 창이 좁으면 옆으로 숨기지 않고 다음 줄로 내린다 */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
            <ToolbarFilterChip
              label="매물상태"
              shape="soft"
              icon={<Info />}
              open={isAvailabilityFilterOpen}
              onOpenChange={setIsAvailabilityFilterOpen}
              summary={summarizeSelection(
                listingAvailabilityFilterOptions,
                propertyFilters.availabilities,
              )}
              onClear={() => clearFilterFields(["availabilities"])}
              contentClassName="w-[180px] p-0"
            >
              <ChecklistFilterPanel
                options={listingAvailabilityFilterOptions}
                selected={propertyFilters.availabilities}
                onChange={(values) =>
                  updatePropertyFilter("availabilities", values)
                }
                searchable={false}
              />
            </ToolbarFilterChip>

            <ToolbarFilterChip
              label={priceFilterLabel}
              shape="soft"
              icon={<WonCircleIcon />}
              summary={priceDepositFilterSummary}
              open={isPriceFilterOpen}
              onOpenChange={setIsPriceFilterOpen}
              onClear={() =>
                clearFilterFields([
                  "priceMin",
                  "priceMax",
                  "depositMin",
                  "depositMax",
                ])
              }
              contentClassName="w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
            >
              <PriceRangeFilterPanel
                initialRange={getPriceRangeFilter(
                  propertyFilters,
                  selectedTransactionType,
                )}
                onApply={handlePriceRangeApply}
                onClear={() => {
                  clearFilterFields([
                    "priceMin",
                    "priceMax",
                    "depositMin",
                    "depositMax",
                  ]);
                  setIsPriceFilterOpen(false);
                }}
                onCancel={() => setIsPriceFilterOpen(false)}
              />
            </ToolbarFilterChip>

            {/* 월세: 전체·월세 탭에서는 가격/보증금 바로 옆에 늘 보인다.
                매매·전세 탭에서는 값이 남아 있을 때만 같은 자리에 보여 지울 수 있게 한다. */}
            {(selectedTransactionType === "all" ||
              selectedTransactionType === "monthly" ||
              monthlyRentFilterSummary) && (
              <ToolbarFilterChip
                label="월세"
                shape="soft"
                icon={<WonCircleIcon />}
                summary={monthlyRentFilterSummary}
                open={isMonthlyRentFilterOpen}
                onOpenChange={setIsMonthlyRentFilterOpen}
                onClear={() =>
                  clearFilterFields(["monthlyRentMin", "monthlyRentMax"])
                }
                contentClassName="w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
              >
                {(close) => renderMonthlyRentPanel(close)}
              </ToolbarFilterChip>
            )}

            <ToolbarFilterChip
              label="공급평형"
              shape="soft"
              icon={<Ruler />}
              summary={areaFilterSummary}
              open={isAreaFilterOpen}
              onOpenChange={setIsAreaFilterOpen}
              onClear={() => clearFilterFields(["areaMin", "areaMax"])}
              contentClassName="w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
            >
              <NumericRangeFilterPanel
                ariaLabel="공급평형 필터"
                title="공급평형"
                description="공급면적 기준 · 평 단위"
                initialRange={getAreaRangeFilter(propertyFilters)}
                min={AREA_RANGE_MIN}
                max={AREA_RANGE_MAX}
                step={1}
                presets={AREA_RANGE_PRESETS}
                tickLabels={["전체", "20평", "40평", "60평", "최대"]}
                formatLabel={(min, max) =>
                  formatNumericRangeLabel(
                    min,
                    max,
                    AREA_RANGE_MIN,
                    AREA_RANGE_MAX,
                    "평",
                    "전체 면적",
                  )
                }
                thumbLabels={["최소 면적", "최대 면적"]}
                onApply={handleAreaRangeApply}
                onClear={() => {
                  clearFilterFields(["areaMin", "areaMax"]);
                  setIsAreaFilterOpen(false);
                }}
                onCancel={() => setIsAreaFilterOpen(false)}
              />
            </ToolbarFilterChip>

            <ToolbarFilterChip
              label="방/욕실"
              shape="soft"
              icon={<BedDouble />}
              summary={roomBathFilterSummary}
              onClear={() => clearFilterFields(["roomCount", "bathRoomCount"])}
              contentClassName="w-[280px]"
            >
              <div className="space-y-3">
                <PopoverTitle
                  title="방/욕실"
                  description="개별 호실 값이 있으면 우선하고, 없으면 평형 정보를 사용합니다."
                />
                <div className="grid grid-cols-2 gap-3">
                  <FilterField label="방 수">
                    <SelectFilter
                      ariaLabel="방 수 필터"
                      value={propertyFilters.roomCount}
                      onChange={(value) =>
                        updatePropertyFilter("roomCount", value)
                      }
                      options={ROOM_COUNT_FILTER_OPTIONS}
                    />
                  </FilterField>
                  <FilterField label="욕실 수">
                    <SelectFilter
                      ariaLabel="욕실 수 필터"
                      value={propertyFilters.bathRoomCount}
                      onChange={(value) =>
                        updatePropertyFilter("bathRoomCount", value)
                      }
                      options={BATH_ROOM_COUNT_FILTER_OPTIONS}
                    />
                  </FilterField>
                </div>
              </div>
            </ToolbarFilterChip>

            {extraFilterItems.map((item) => (
              <ToolbarFilterChip
                key={item.key}
                label={item.label}
                shape="soft"
                icon={item.icon}
                summary={item.summary}
                onClear={item.onClear}
                contentClassName={item.contentClassName}
              >
                {(close) => item.render(close)}
              </ToolbarFilterChip>
            ))}
          </div>

          {/* 초기화 — 필터 줄이 넘쳐도 가려지지 않게 오른쪽에 고정 */}
          {filterRowActions}
        </section>
        )}

        <section
          data-property-workspace
          className="relative flex min-h-0 flex-1 overflow-hidden bg-white px-0 py-0"
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
            {viewMode === "map" && (
              <div className="flex min-h-9 shrink-0 items-center border-b border-border/60 bg-[#f8f7f4] px-3 py-1.5 text-[12px] text-muted-foreground">
                {isLoading || isMapDataLoading ? (
                  <span>불러오는 중</span>
                ) : loadedIntakes === 0 && hasActiveFilters ? (
                  <span>조건을 줄이거나 초기화해 보세요.</span>
                ) : (
                  <span>
                    마커나 왼쪽 매물을 클릭하면 빠른 확인 패널이 열립니다.
                  </span>
                )}
              </div>
            )}
            {viewMode === "list" ? (
              <PropertyListingsTable
                columns={columns}
                data={propertyGroups}
                totalCount={loadedIntakes}
                pageSize={LISTINGS_PAGE_SIZE}
                sorting={sorting}
                onSortingChange={handleSortingChange}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={handleColumnVisibilityChange}
                columnFilterActions={{
                  site: () => setIsLocationFilterOpen(true),
                  supplyArea: () => { setIsFilterRowOpen(true); setIsAreaFilterOpen(true); },
                  listingAvailability: () => { setIsFilterRowOpen(true); setIsAvailabilityFilterOpen(true); },
                  price: () => { setIsFilterRowOpen(true); setIsPriceFilterOpen(true); },
                  ...((selectedTransactionType === "all" || selectedTransactionType === "monthly" || monthlyRentFilterSummary)
                    ? { monthlyRent: () => { setIsFilterRowOpen(true); setIsMonthlyRentFilterOpen(true); } }
                    : {}),
                }}
                onRowClick={(row) => openPropertyInspector(row.intakeId)}
                onRequestClose={
                  selectedIntakeId ? () => closePropertyInspector(false) : undefined
                }
                expandedRowIds={expandedRowIds}
                renderExpandedRow={renderExpandedPropertyRow}
                getExpandedRowHeight={getExpandedPropertyRowHeight}
                columnGroupControl={{
                  collapsed: arePropertyDetailColumnsCollapsed,
                  onToggle: togglePropertyDetailColumns,
                }}
                isLoading={isLoading}
                isLoadingMore={isFetchingNextPage}
                onEndReached={handleEndReached}
                emptyMessage={
                  hasActiveFilters
                    ? "조건에 맞는 매물이 없습니다."
                    : "등록된 매물이 없습니다."
                }
                renderBulkActions={(selectedRows) => (
                  <PropertyBulkActions groups={selectedRows} />
                )}
                renderStatusBar={() => (
                  <span>
                    의뢰 {intakeCountLabel}건 표시
                    {loadedListings > 0
                      ? ` · 거래 ${loadedListings.toLocaleString()}건`
                      : ""}
                    {hasNextPage && !isFetchingNextPage
                      ? " · 아래로 스크롤하면 더 불러옵니다"
                      : ""}
                    {isFetchingNextPage ? " · 더 불러오는 중..." : ""}
                  </span>
                )}
              />
            ) : (
              <PropertyMapView
                points={mapPoints.points}
                missingGroups={mapPoints.missingGroups}
                isLoading={
                  isLoading ||
                  (viewMode === "map" &&
                    isMapDataLoading &&
                    listingIntakes.length === 0)
                }
                isFallback={isMapDataError}
                truncated={Boolean(mapData?.truncated)}
                limit={mapData?.limit}
                hasActiveFilters={hasActiveFilters}
                onSelectIntake={openPropertyInspector}
              />
            )}
          </div>
        </section>
        {selectedIntakeId && (
            <PropertyInspector
              intakeId={selectedIntakeId}
              closing={isInspectorClosing}
              animate={inspectorMotion}
              onExited={finishClosingPropertyInspector}
              onClose={closePropertyInspector}
              onConfirm={(intakeId) => handleIntakeConfirm(intakeId, "alive")}
              isConfirming={
                confirmMutation.isPending &&
                confirmMutation.variables?.intakeId === selectedIntakeId
              }
              onSaveListing={handleInspectorListingUpdate}
              onAvailabilityChange={handleInspectorAvailabilityChange}
            />
        )}
        {registrationState !== "closed" && (
          <PropertyRegistrationDrawer
            closing={registrationState === "closing"}
            animate={registrationMotion}
            pending={registrationPending}
            onClose={closeRegistration}
            onExited={finishClosingRegistration}
            onCreated={handlePropertyRegistered}
            onPendingChange={handleRegistrationPendingChange}
              onExpanded={() => setRegistrationState("closed")}
          />
        )}
        {startDealPrompt && (
          <StartDealFromStatusDialog
            key={`${startDealPrompt.propertyId}:${startDealPrompt.listings.map((listing) => listing.id).join(",")}`}
            prompt={startDealPrompt}
            onClose={() => setStartDealPrompt(null)}
            onSuccess={invalidateListingStatusQueries}
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
                  value:
                    resumeClosedPrompt.targetAvailability ===
                    ListingAvailability.PAUSED
                      ? IntakeLifecycleStatus.HOLD
                      : IntakeLifecycleStatus.OPEN,
                  expectedUpdatedAt: intakeUpdatedAtById.get(
                    resumeClosedPrompt.intakeId,
                  ),
                },
                {
                  onSuccess: () => setResumeClosedPrompt(null),
                },
              );
            }}
          />
        )}
        {reactivateListingPrompt && (
          <ReactivateListingDialog
            prompt={reactivateListingPrompt}
            pending={reactivateListingMutation.isPending}
            onClose={() => setReactivateListingPrompt(null)}
            onConfirm={() =>
              reactivateListingMutation.mutate(reactivateListingPrompt)
            }
          />
        )}
        {closeIntakePrompt && (
          <CloseListingIntakeDialog
            key={closeIntakePrompt.intakeId}
            prompt={closeIntakePrompt}
            pending={
              closeActiveDealsMutation.isPending ||
              rowLifecycleMutation.isPending
            }
            onClose={() => setCloseIntakePrompt(null)}
            onCancelDealsAndClose={(closedReason) =>
              closeActiveDealsMutation.mutate({
                intakeId: closeIntakePrompt.intakeId,
                closedReason,
                expectedUpdatedAt: intakeUpdatedAtById.get(
                  closeIntakePrompt.intakeId,
                ),
              })
            }
            onCloseWithoutDeals={(closedReason) =>
              rowLifecycleMutation.mutate(
                {
                  intakeId: closeIntakePrompt.intakeId,
                  listingIds: [],
                  value: IntakeLifecycleStatus.CLOSED,
                  closedReason,
                  expectedUpdatedAt: intakeUpdatedAtById.get(
                    closeIntakePrompt.intakeId,
                  ),
                },
                {
                  onSuccess: () => {
                    toast.success("종결 사유를 기록하고 매물을 종료했습니다.");
                    setCloseIntakePrompt(null);
                  },
                },
              )
            }
            onCompleteDeal={() => {
              const dealId = closeIntakePrompt.activeDealIds[0];
              const route = dealId
                ? `/deals?dealId=${encodeURIComponent(dealId)}`
                : "/deals";
              const meta = getRouteMeta(route);
              createTab({ route, kind: meta.kind, title: meta.title });
              setCloseIntakePrompt(null);
            }}
          />
        )}
      </div>
    </CellEditProvider>
  );
}

// 가격 열 머리 아이콘. lucide에는 원화 기호가 없어 데모(docs/mockups/ui-refresh)와 같은 모양을 직접 그린다.
function WonCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 9l1.5 6L12 10l2.5 5L16 9" />
    </svg>
  );
}

function TableHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px] text-inherit">
      <span className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function PropertyMapView({
  points,
  missingGroups,
  isLoading,
  isFallback,
  truncated,
  limit,
  hasActiveFilters,
  onSelectIntake,
}: {
  points: PropertyMapPoint[];
  missingGroups: PropertyListingGroup[];
  isLoading: boolean;
  isFallback: boolean;
  truncated: boolean;
  limit?: number;
  hasActiveFilters: boolean;
  onSelectIntake: (intakeId: string) => void;
}) {
  if (isLoading) {
    return <PropertyMapSkeleton />;
  }

  if (points.length === 0 && missingGroups.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-white text-sm text-muted-foreground">
        {hasActiveFilters
          ? "조건에 맞는 매물이 없습니다."
          : "등록된 매물이 없습니다."}
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] bg-white">
      <aside className="flex min-h-0 flex-col border-r border-border bg-white">
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="text-[12px] font-medium text-foreground">
            지도 매물
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            좌표 있는 단지 {points.length.toLocaleString()}곳
            {truncated && limit ? ` · 최대 ${limit.toLocaleString()}건` : ""}
            {isFallback ? " · 목록 기준" : ""}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {points.flatMap((point) =>
            point.groups.map((group) => (
              <MapPropertyRow
                key={group.id}
                group={group}
                point={point}
                onClick={() => onSelectIntake(group.intakeId)}
              />
            )),
          )}
          {missingGroups.length > 0 && (
            <div className="border-t border-border bg-muted/20 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              좌표 미등록 {missingGroups.length.toLocaleString()}건
            </div>
          )}
          {missingGroups.map((group) => (
            <MapPropertyRow
              key={group.id}
              group={group}
              onClick={() => onSelectIntake(group.intakeId)}
              muted
            />
          ))}
        </div>
      </aside>

      <div className="relative min-h-0 overflow-hidden bg-[#f7f7f5]">
        <NaverPropertyMap
          points={points}
          missingCount={missingGroups.length}
          onSelectIntake={onSelectIntake}
        />
      </div>
    </div>
  );
}

function PropertyMapSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] bg-white">
      <div className="space-y-2 border-r border-border p-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-md" />
        ))}
      </div>
      <div className="relative bg-muted/30 p-4">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
    </div>
  );
}

function NaverPropertyMap({
  points,
  missingCount,
  onSelectIntake,
}: {
  points: PropertyMapPoint[];
  missingCount: number;
  onSelectIntake: (intakeId: string) => void;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<NaverMapsApi["Map"]> | null>(null);
  const markersRef = useRef<Array<InstanceType<NaverMapsApi["Marker"]>>>([]);
  const listenersRef = useRef<unknown[]>([]);
  const clusterListenersRef = useRef<unknown[]>([]);
  const hasAutoFittedRef = useRef(false);
  const [mapsApi, setMapsApi] = useState<NaverMapsApi | null>(() =>
    getReadyNaverMapsApi(),
  );
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >(getReadyNaverMapsApi() ? "ready" : "idle");

  useEffect(() => {
    if (mapsApi || !NAVER_MAPS_NCP_KEY_ID) return;

    let cancelled = false;
    setLoadState("loading");
    loadNaverMaps(NAVER_MAPS_NCP_KEY_ID)
      .then((loadedMapsApi) => {
        if (cancelled) return;
        setMapsApi(loadedMapsApi);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [mapsApi]);

  useEffect(() => {
    if (!mapsApi || !mapElementRef.current || mapRef.current) return;

    const centerPoint = points[0] ?? { lat: 37.5665, lng: 126.978 };
    mapRef.current = new mapsApi.Map(mapElementRef.current, {
      center: new mapsApi.LatLng(centerPoint.lat, centerPoint.lng),
      zoom: points.length > 0 ? 15 : 11,
      mapDataControl: false,
      scaleControl: true,
      // 확대/축소는 휠·트랙패드로 한다 (+/- 버튼 숨김)
      zoomControl: false,
    });
  }, [mapsApi, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapsApi || !map) return;

    const clearMarkers = () => {
      removePropertyMapListeners(listenersRef.current, (listener) =>
        mapsApi.Event.removeListener?.(listener),
      );
      for (const marker of markersRef.current) {
        marker.setMap(null);
      }
      listenersRef.current = [];
      markersRef.current = [];
    };

    const clearClusterListeners = () => {
      removePropertyMapListeners(clusterListenersRef.current, (listener) =>
        mapsApi.Event.removeListener?.(listener),
      );
      clusterListenersRef.current = [];
    };

    clearMarkers();
    clearClusterListeners();

    if (points.length === 0) return;

    const renderClusters = () => {
      clearMarkers();

      const clusters = buildPropertyMapClusters(points, map, mapsApi);

      for (const cluster of clusters) {
        const position = new mapsApi.LatLng(cluster.lat, cluster.lng);
        const isCluster = cluster.points.length > 1;
        const marker = new mapsApi.Marker({
          map,
          position,
          title: isCluster
            ? `${cluster.groupCount}건`
            : cluster.points[0].siteName,
          icon: {
            content: isCluster
              ? getNaverClusterMarkerHtml(cluster)
              : getNaverMarkerHtml(cluster.points[0]),
            anchor: isCluster
              ? new mapsApi.Point(24, 24)
              : new mapsApi.Point(20, 20),
          },
        });
        const listener = mapsApi.Event.addListener(marker, "click", () => {
          if (isCluster) {
            map.setCenter(position);
            map.setZoom(Math.min(map.getZoom() + 2, 19));
            return;
          }

          onSelectIntake(cluster.points[0].groups[0].intakeId);
        });
        markersRef.current.push(marker);
        listenersRef.current.push(listener);
      }
    };

    renderClusters();
    clusterListenersRef.current = [
      mapsApi.Event.addListener(map, "idle", renderClusters),
      mapsApi.Event.addListener(map, "zoom_changed", renderClusters),
    ];

    if (!hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true;
      if (points.length === 1) {
        map.setCenter(new mapsApi.LatLng(points[0].lat, points[0].lng));
        map.setZoom(16);
      } else {
        const bounds = getMapBounds(points);
        map.fitBounds?.(
          new mapsApi.LatLngBounds(
            new mapsApi.LatLng(bounds.minLat, bounds.minLng),
            new mapsApi.LatLng(bounds.maxLat, bounds.maxLng),
          ),
          { top: 64, right: 64, bottom: 64, left: 64 },
        );
      }
    }

    return () => {
      clearMarkers();
      clearClusterListeners();
    };
  }, [mapsApi, onSelectIntake, points]);

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={mapElementRef} className="h-full w-full" />
      <div className="absolute right-4 top-4 z-10 rounded-md border border-border bg-white/95 px-3 py-2 shadow-sm">
        <div className="text-[12px] font-medium text-foreground">
          지도 표시 {points.length.toLocaleString()}곳
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          좌표 없음 {missingCount.toLocaleString()}건
        </div>
      </div>
      {!NAVER_MAPS_NCP_KEY_ID && (
        <NaverMapOverlayMessage
          title="네이버 지도 키가 필요합니다"
          detail="VITE_NAVER_MAPS_NCP_KEY_ID를 설정하면 지도가 표시됩니다."
        />
      )}
      {NAVER_MAPS_NCP_KEY_ID && loadState === "loading" && (
        <NaverMapOverlayMessage
          title="네이버 지도를 불러오는 중입니다"
          detail="Maps JavaScript SDK를 초기화하고 있습니다."
        />
      )}
      {NAVER_MAPS_NCP_KEY_ID && loadState === "error" && (
        <NaverMapOverlayMessage
          title="네이버 지도 로딩 실패"
          detail={
            <>
              Web 서비스 URL 등록값과 ncpKeyId를 확인해 주세요.
              <br />
              현재 URL: {getNaverMapsServiceUrl()}
            </>
          }
        />
      )}
      {NAVER_MAPS_NCP_KEY_ID &&
        loadState === "ready" &&
        points.length === 0 && (
          <NaverMapOverlayMessage
            title="좌표가 등록된 매물이 없습니다"
            detail="단지 좌표가 있는 매물부터 지도에 표시됩니다."
          />
        )}
    </div>
  );
}

function NaverMapOverlayMessage({
  title,
  detail,
}: {
  title: string;
  detail: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/65">
      <div className="rounded-md border border-border bg-white px-4 py-3 text-center shadow-sm">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function getNaverMapsServiceUrl() {
  return window.location.href;
}

function buildPropertyMapClusters(
  points: PropertyMapPoint[],
  map: InstanceType<NaverMapsApi["Map"]>,
  mapsApi: NaverMapsApi,
): PropertyMapCluster[] {
  if (points.length === 0) return [];
  const zoom = map.getZoom();
  if (zoom > PROPERTY_MAP_CLUSTER_MAX_ZOOM) {
    return points.map((point) => buildSinglePropertyMapCluster(point));
  }

  const projection = map.getProjection();
  const offsetPoints = points.map((point) => {
    const coord = new mapsApi.LatLng(point.lat, point.lng);
    const offset = projection.fromCoordToOffset(coord);
    return {
      point,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  });

  return buildPropertyMapClustersFromOffsets(offsetPoints, {
    zoom,
    maxZoom: PROPERTY_MAP_CLUSTER_MAX_ZOOM,
    clusterRadius: PROPERTY_MAP_CLUSTER_GRID_SIZE,
  });
}

function buildSinglePropertyMapCluster(
  point: PropertyMapPoint,
): PropertyMapCluster {
  return {
    id: point.id,
    lat: point.lat,
    lng: point.lng,
    points: [point],
    groupCount: point.groupCount,
    listingCount: point.listingCount,
  };
}

function getReadyNaverMapsApi() {
  const mapsApi = window.naver?.maps;
  if (
    mapsApi &&
    typeof mapsApi.LatLng === "function" &&
    typeof mapsApi.LatLngBounds === "function" &&
    typeof mapsApi.Point === "function" &&
    typeof mapsApi.Map === "function" &&
    typeof mapsApi.Marker === "function" &&
    mapsApi.Event &&
    typeof mapsApi.Event.addListener === "function"
  ) {
    return mapsApi;
  }

  return null;
}

function loadNaverMaps(ncpKeyId: string) {
  const readyMapsApi = getReadyNaverMapsApi();
  if (readyMapsApi) {
    return Promise.resolve(readyMapsApi);
  }
  if (window.__estateErpNaverMapsPromise) {
    return window.__estateErpNaverMapsPromise;
  }

  const loading = new Promise<NaverMapsApi>(
    (resolve, reject) => {
      const existingScript = document.getElementById(
        "naver-maps-js-sdk",
      ) as HTMLScriptElement | null;

      const handleLoad = () => {
        const loadedMapsApi = getReadyNaverMapsApi();
        if (loadedMapsApi) {
          resolve(loadedMapsApi);
          return;
        }
        reject(new Error("NAVER Maps SDK loaded without ready maps API"));
      };

      if (existingScript) {
        const loadedMapsApi = getReadyNaverMapsApi();
        if (loadedMapsApi) {
          resolve(loadedMapsApi);
          return;
        }
        if (existingScript.dataset.loadState === "loaded") {
          reject(new Error("NAVER Maps SDK is present but not ready"));
          return;
        }
        existingScript.addEventListener("load", handleLoad, { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("NAVER Maps SDK failed to load")),
          {
            once: true,
          },
        );
        return;
      }

      const script = document.createElement("script");
      script.id = "naver-maps-js-sdk";
      script.async = true;
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(ncpKeyId)}`;
      script.addEventListener(
        "load",
        () => {
          script.dataset.loadState = "loaded";
          handleLoad();
        },
        { once: true },
      );
      script.addEventListener(
        "error",
        () => reject(new Error("NAVER Maps SDK failed to load")),
        { once: true },
      );
      document.head.appendChild(script);
    },
  );

  window.__estateErpNaverMapsPromise = loading;
  // 실패한 로드를 남겨 두면 앱을 다시 켤 때까지 지도를 열 수 없으므로 재시도할 수 있게 지운다.
  loading.catch(() => {
    delete window.__estateErpNaverMapsPromise;
    document.getElementById("naver-maps-js-sdk")?.remove();
  });

  return loading;
}

/** 지도 화면을 열 때 기다리지 않도록 SDK를 받아 둔다. 지도를 만들지 않으므로 타일은 받지 않는다. */
function preloadNaverMaps() {
  if (!NAVER_MAPS_NCP_KEY_ID || getReadyNaverMapsApi()) return;

  for (const origin of getNaverMapsPreconnectOrigins(window.location.protocol)) {
    if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
      continue;
    }
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    document.head.appendChild(link);
  }

  // 실패해도 지도 화면을 열 때 다시 시도하고 그 결과를 보여 준다.
  loadNaverMaps(NAVER_MAPS_NCP_KEY_ID).catch(() => undefined);
}

function getNaverMarkerHtml(point: PropertyMapPoint) {
  return `
    <div style="
      width: 40px;
      height: 40px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 3px solid #fff;
      background: #0f172a;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.24);
    ">${point.groups.length}</div>
  `;
}

function getNaverClusterMarkerHtml(cluster: PropertyMapCluster) {
  return `
    <div style="
      width: 48px;
      height: 48px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.95);
      background: #2563eb;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.28);
    ">${cluster.groupCount}</div>
  `;
}

function MapPropertyRow({
  group,
  point,
  onClick,
  muted,
}: {
  group: PropertyListingGroup;
  point?: PropertyMapPoint;
  onClick: () => void;
  muted?: boolean;
}) {
  const property = group.property;
  const siteName = property?.site?.name ?? "매물 정보 없음";
  const address =
    point?.address ??
    property?.site?.roadAddress ??
    property?.site?.jibunAddress ??
    "주소 미등록";
  const unitLabel = getPropertyMapUnitLabel(property);
  const priceLabel = getPropertyMapPriceLabel(group.listings);

  return (
    <button
      type="button"
      className={cn(
        "block w-full border-b border-border px-3 py-2.5 text-left hover:bg-muted/40",
        muted && "bg-muted/10",
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-foreground">
            {siteName}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {unitLabel && (
              <>
                <span className="font-medium text-foreground/80">
                  {unitLabel}
                </span>
                {" · "}
              </>
            )}
            {address}
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {group.listings.length.toLocaleString()}건
        </span>
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
        {group.listings.slice(0, 3).map((listing) => (
          <TransactionBadge
            key={listing.id}
            transactionType={listing.transactionType}
          />
        ))}
        <span className="truncate text-[12px] font-medium text-slate-700">
          {priceLabel}
        </span>
      </div>
    </button>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

const PROPERTY_INSPECTOR_MIN_WIDTH = 520;
const PROPERTY_INSPECTOR_MAX_WIDTH = 640;
const PROPERTY_INSPECTOR_DEFAULT_WIDTH = 584;

function PropertyInspector({
  intakeId,
  closing,
  animate,
  onExited,
  onClose,
  onConfirm,
  isConfirming,
  onSaveListing,
  onAvailabilityChange,
}: {
  intakeId: string;
  closing: boolean;
  animate: boolean;
  onExited: () => void;
  onClose: (animate?: boolean) => void;
  onConfirm: (intakeId: string) => void;
  isConfirming: boolean;
  onSaveListing: (id: string, patch: UpdateListingDto) => Promise<void>;
  onAvailabilityChange: (
    intake: ListingIntake,
    property: Property,
    value: ListingAvailability,
  ) => void;
}) {
  const [width, setWidth] = useState(PROPERTY_INSPECTOR_DEFAULT_WIDTH);
  useEffect(() => {
    if (!closing) return;
    // Hidden tabs and reduced motion may not dispatch transitionend.
    const timer = window.setTimeout(
      onExited,
      !animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 240,
    );
    return () => window.clearTimeout(timer);
  }, [closing, animate, onExited]);
  const {
    data: intake,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["listing-intakes", "inspector", intakeId],
    queryFn: () => api.listingIntakes.findOne(intakeId),
  });

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 메모 바로 편집 중의 Esc는 편집 취소이지 패널 닫기가 아니다.
      if (
        event.target instanceof Element &&
        event.target.closest("[data-inspector-inline-editor]")
      ) {
        return;
      }
      if (
        document.querySelector(
          // 확인창(AlertDialog)은 role이 alertdialog다. 이것도 떠 있으면 Esc는 확인창만 닫는다.
          '[role="dialog"], [role="alertdialog"], [role="listbox"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      onClose(false);
    };

    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () =>
      window.removeEventListener("keydown", handleWindowKeyDown, true);
  }, [onClose]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        '[role="dialog"], [role="alertdialog"], [role="listbox"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"], [data-inspector-inline-editor]',
      )
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onClose(false);
  };

  return (
    <aside
      id="property-inspector"
      data-property-inspector
      data-state={closing ? "closed" : "open"}
      data-motion={animate ? "slide" : "none"}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label="매물 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)]"
      style={{ width, maxWidth: "100%" }}
      onTransitionEnd={(event) => {
        if (
          closing &&
          event.target === event.currentTarget &&
          event.propertyName === "transform"
        ) {
          onExited();
        }
      }}
      onKeyDownCapture={handleKeyDown}
    >
      <PropertyInspectorResizeHandle width={width} onResize={setWidth} />
      {(isLoading || isError || !intake?.property) && (
        <PropertyInspectorToolbar onClose={onClose} />
      )}
      {isLoading && <PropertyInspectorSkeleton />}
      {!isLoading && isError && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-sm text-muted-foreground">
            매물 정보를 불러오지 못했습니다.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              다시 시도
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => onClose(event.detail !== 0)}
            >
              닫기
            </Button>
          </div>
        </div>
      )}
      {!isLoading && !isError && intake?.property && (
        <PropertyInspectorContent
          key={intake.id}
          intake={intake}
          property={intake.property}
          onClose={onClose}
          onConfirm={onConfirm}
          isConfirming={isConfirming}
          onSaveListing={onSaveListing}
          onAvailabilityChange={onAvailabilityChange}
        />
      )}
      {!isLoading && !isError && !intake?.property && (
        <div className="flex h-full items-center justify-center px-8 text-sm text-muted-foreground">
          의뢰 정보를 찾을 수 없습니다.
        </div>
      )}
    </aside>
  );
}

function PropertyInspectorResizeHandle({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      onResize(
        clampPropertyInspectorWidth(startWidth + startX - pointerEvent.clientX),
      );
    };
    const stopResizing = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      cleanupRef.current = null;
    };

    cleanupRef.current?.();
    cleanupRef.current = stopResizing;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing, { once: true });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onResize(clampPropertyInspectorWidth(width + 24));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onResize(clampPropertyInspectorWidth(width - 24));
    }
  };

  return (
    <div
      data-property-inspector-resize-handle
      role="separator"
      aria-label="상세 패널 너비 조절"
      aria-orientation="vertical"
      aria-valuemin={PROPERTY_INSPECTOR_MIN_WIDTH}
      aria-valuemax={PROPERTY_INSPECTOR_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none outline-none"
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-[#6c9b7a] group-focus-visible:bg-[#6c9b7a]" />
    </div>
  );
}

function clampPropertyInspectorWidth(value: number) {
  return Math.min(
    PROPERTY_INSPECTOR_MAX_WIDTH,
    Math.max(PROPERTY_INSPECTOR_MIN_WIDTH, value),
  );
}

function PropertyInspectorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b px-5 py-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="grid grid-cols-4 gap-2 border-b px-5 py-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12" />
        ))}
      </div>
      <div className="space-y-4 p-5">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    </div>
  );
}

function PropertyInspectorContent({
  intake,
  property,
  onClose,
  onConfirm,
  isConfirming,
  onSaveListing,
  onAvailabilityChange,
}: {
  intake: ListingIntake;
  property: Property;
  onClose: (animate?: boolean) => void;
  onConfirm: (intakeId: string) => void;
  isConfirming: boolean;
  onSaveListing: (id: string, patch: UpdateListingDto) => Promise<void>;
  onAvailabilityChange: (
    intake: ListingIntake,
    property: Property,
    value: ListingAvailability,
  ) => void;
}) {
  const queryClient = useQueryClient();
  const createTab = useTabStore((s) => s.createTab);
  const openOrRevealResource = useTabStore((s) => s.openOrRevealResource);
  const [isOpeningNewWindow, setIsOpeningNewWindow] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isConsultationOpen, setIsConsultationOpen] = useState(false);
  const intakeState = {
    lifecycleStatus: intake.lifecycleStatus,
    lifecycleChangedAt: intake.lifecycleChangedAt,
    lifecycleChangedBy: intake.lifecycleChangedBy,
    closedReason: intake.closedReason,
    lastCheckedAt: intake.lastCheckedAt,
    lastVerifiedAt: intake.lastVerifiedAt,
    lastCheckResult: intake.lastCheckResult,
    nextConfirmAt: intake.nextConfirmAt,
    isJointBrokerageRequired: intake.isJointBrokerageRequired,
    jointBrokeragePartner: intake.jointBrokeragePartner,
  };
  const listings = (intake.listings ?? [])
    .map((listing) => ({ ...listing, intake: intakeState }) as PropertyListing)
    .sort(comparePropertyListing);
  const propertyWithListings: Property = { ...property, listings };
  const contacts = property.propertyContacts ?? [];
  // 상세 API는 이 의뢰에 연결된 상담만 의뢰 최상위(intake.consultations)에 담는다.
  // 전체 페이지·연락처·매칭 등에서 매물이나 거래 조건에만 연결해 남긴 상담은 따로 받아 합친다.
  // 서버는 거래 조건(listingId)만 준 상담에 propertyId를 채우지 않으므로 거래 조건별로도 받는다.
  // 다른 의뢰나 다른 의뢰의 거래 조건에 연결된 상담은 이 의뢰 것이 아니므로 뺀다.
  const inspectorListingIds = (intake.listings ?? []).map(
    (listing) => listing.id,
  );
  const looseConsultationsKey = [
    "consultations",
    {
      propertyId: property.id,
      listingIds: inspectorListingIds,
      scope: "inspector",
    },
  ] as const;
  const {
    data: looseConsultationResult,
    isError: isConsultationsError,
    refetch: refetchConsultations,
  } = useQuery({
    queryKey: looseConsultationsKey,
    // 조회 하나(또는 중간 페이지 하나)가 실패해도 정상으로 받은 상담은 버리지 않고
    // complete=false로 표시한다. 예전 캐시는 섞지 않는다: 삭제되거나 다른 의뢰로 옮겨져
    // 정상 조회에서 빠진 상담이 되살아나기 때문이다. 빠진 것은 실패 안내로 알린다.
    queryFn: async () => {
      const results = await Promise.all([
        fetchAllConsultations({ propertyId: property.id }),
        ...inspectorListingIds.map((listingId) =>
          fetchAllConsultations({ listingId }),
        ),
      ]);
      const complete = results.every((result) => result.complete);
      const byId = new Map<string, Consultation>();
      for (const result of results) {
        for (const item of result.items) byId.set(item.id, item);
      }
      return { items: [...byId.values()], complete };
    },
    staleTime: 30_000,
  });
  const looseConsultations = looseConsultationResult?.items;
  const intakeConsultations =
    (intake as ListingIntake & { consultations?: Consultation[] })
      .consultations ??
    property.consultations ??
    [];
  const intakeListingIdSet = new Set(inspectorListingIds);
  // 종료된 의뢰에는 종료 뒤에 남긴 매물 상담을 붙이지 않는다 (같은 호실의 새 의뢰 몫).
  const intakeClosedAt =
    intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED
      ? new Date(intake.lifecycleChangedAt).getTime()
      : null;
  const consultations = [
    ...intakeConsultations,
    ...(looseConsultations ?? []).filter(
      (item) =>
        !item.listingIntakeId &&
        (!item.listingId || intakeListingIdSet.has(item.listingId)) &&
        (intakeClosedAt === null ||
          new Date(item.createdAt).getTime() <= intakeClosedAt) &&
        !intakeConsultations.some((linked) => linked.id === item.id),
    ),
  ];
  const owner =
    contacts.find((contact) => contact.role === "owner") ??
    contacts.find((contact) => contact.role === "co_owner") ??
    contacts[0];
  const title = property.site?.name ?? "매물 상세";
  const unitLabel = getPropertySheetUnitLabel(property);
  const availability = getListingRowAvailability(intake, listings);
  const {
    data: propertyMatches,
    isError: isMatchesError,
    refetch: refetchMatches,
  } = useQuery({
    queryKey: ["matches", { propertyId: property.id }],
    queryFn: () => api.matches.findAll({ propertyId: property.id }),
    staleTime: 30_000,
  });
  const suggestedContacts = contacts.flatMap((propertyContact) =>
    propertyContact.contact
      ? [
          {
            ...propertyContact.contact,
            label: getContactRoleLabel(propertyContact.role),
          },
        ]
      : [],
  );

  const invalidateInspector = () => {
    void queryClient.invalidateQueries({
      queryKey: ["listing-intakes", "inspector", intake.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
  };

  const openInNewTab = () => {
    const route = `/properties/${property.id}`;
    const meta = getRouteMeta(route);
    openOrRevealResource({
      route,
      kind: meta.kind,
      title: [title, unitLabel].filter(Boolean).join(" ") || meta.title,
      resourceKey: tabResourceKeys.entity("property", property.id),
    });
    onClose(false);
  };

  const openInNewWindow = async () => {
    if (isOpeningNewWindow) return;
    const route = `/properties/${property.id}`;
    const meta = getRouteMeta(route);
    const tabTitle = [title, unitLabel].filter(Boolean).join(" ") || meta.title;
    const tabsBridge = window.electronBridge?.tabs;
    if (!tabsBridge) {
      toast.error("새 창 열기는 데스크톱 앱에서만 사용할 수 있습니다.");
      return;
    }

    setIsOpeningNewWindow(true);
    try {
      const result = await tabsBridge.openPropertyWindow({
        propertyId: property.id,
        title: tabTitle,
      });
      if (!result.ok) {
        toast.error(result.error ?? "매물 상세 창을 열지 못했습니다.");
        return;
      }
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "매물 상세 창을 열지 못했습니다.",
      );
    } finally {
      setIsOpeningNewWindow(false);
    }
  };

  const openDeal = (dealId: string) => {
    const route = `/deals?dealId=${encodeURIComponent(dealId)}`;
    const meta = getRouteMeta(route);
    createTab({ route, kind: meta.kind, title: meta.title });
    onClose();
  };
  const openMatch = (matchId: string) => {
    const route = `/wanted-properties?matchId=${encodeURIComponent(matchId)}`;
    const meta = getRouteMeta(route);
    createTab({ route, kind: meta.kind, title: meta.title });
    onClose();
  };
  // 메모 바로 편집: 저장 뒤 패널 데이터를 다시 받아올 때까지 기다려야
  // 입력한 글이 예전 값으로 잠깐 되돌아가지 않는다.
  const refreshInspector = () =>
    queryClient.invalidateQueries({
      queryKey: ["listing-intakes", "inspector", intake.id],
    });
  const intakeMemoMutation = useMutation({
    mutationFn: (memo: string) =>
      api.listingIntakes.update(intake.id, {
        memo: memo || null,
        expectedUpdatedAt: intake.updatedAt,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
    },
    onError: handleMutationError,
  });
  const saveOfferMemo = async (listingId: string, memo: string) => {
    const listing = listings.find((item) => item.id === listingId);
    // 서버는 null도 받지만 클라이언트 DTO가 string이라 빈 문자열로 지운다.
    await onSaveListing(listingId, {
      memo,
      expectedUpdatedAt: listing?.updatedAt,
    });
    await refreshInspector();
  };
  const saveIntakeMemo = async (memo: string) => {
    await intakeMemoMutation.mutateAsync(memo);
    await refreshInspector();
  };
  const model = buildPropertyInspectorModel({
    intake,
    property,
    listings,
    consultations,
    matches: propertyMatches,
    matchesStatus: propertyMatches
      ? "ready"
      : isMatchesError
        ? "error"
        : "loading",
    // 실패하면 받아 둔 상담(이 의뢰 연결분 + 이전에 받은 것)은 보여주되 일부 누락을 알린다.
    consultationsStatus:
      isConsultationsError || looseConsultationResult?.complete === false
        ? "error"
        : looseConsultationResult
          ? "ready"
          : "loading",
    actions: {
      confirm: () => onConfirm(intake.id),
      addContact: () => setIsContactOpen(true),
      openDeal,
    },
  });

  return (
    <PropertyInspectorView
      model={model}
      onClose={onClose}
      onOpenNewTab={openInNewTab}
      onConfirm={() => onConfirm(intake.id)}
      isConfirming={isConfirming}
      onConsult={() => setIsConsultationOpen(true)}
      onEdit={() => setIsEditOpen(true)}
      onAddContact={() => setIsContactOpen(true)}
      headerActions={
        <PropertyRowActions
          listings={listings}
          intake={intake}
          triggerLabel="매물 작업 메뉴"
          onOpenInNewWindow={
            window.electronBridge?.tabs ? () => void openInNewWindow() : undefined
          }
          isOpeningNewWindow={isOpeningNewWindow}
        />
      }
      progressTab={
        <PropertyInspectorProgressTab
          listingIds={inspectorListingIds}
          matches={(propertyMatches ?? []).filter((match) =>
            intakeListingIdSet.has(match.listingId),
          )}
          matchesStatus={
            isMatchesError ? "error" : propertyMatches ? "ready" : "loading"
          }
          onRetryMatches={() => void refetchMatches()}
          onOpenMatch={openMatch}
          onOpenDeal={openDeal}
          typeMeta={(transactionType) =>
            transactionTypeMeta[transactionType] ?? {
              label: transactionType,
              className: "bg-[#f1f0ec] text-foreground",
            }
          }
        />
      }
      onRetryConsultations={() => void refetchConsultations()}
      onSaveOfferMemo={saveOfferMemo}
      onSaveIntakeMemo={saveIntakeMemo}
      dialogs={
        <>
          <PropertyInspectorEditDialog
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
            listings={listings}
            availability={availability}
            onSaveListing={onSaveListing}
            onAvailabilityChange={(value) =>
              onAvailabilityChange(intake, propertyWithListings, value)
            }
          />
          <PropertyContactAddDialog
            open={isContactOpen}
            onOpenChange={(open) => {
              setIsContactOpen(open);
              if (!open) invalidateInspector();
            }}
            propertyId={property.id}
          />
          <ConsultationAddDialog
            open={isConsultationOpen}
            onOpenChange={(open) => {
              setIsConsultationOpen(open);
              if (!open) invalidateInspector();
            }}
            propertyId={property.id}
            listingIntakeId={intake.id}
            suggestedContacts={suggestedContacts}
            defaultContact={owner?.contact ?? null}
          />
        </>
      }
    />
  );
}

/**
 * 상담 목록 API의 모든 페이지를 받는다 (서버 페이지당 최대 100건).
 * 중간에 실패해도 그때까지 받은 상담은 돌려주고 complete=false로 알린다.
 */
async function fetchAllConsultations(
  filters: NonNullable<Parameters<typeof api.consultations.findAll>[0]>,
): Promise<{ items: Consultation[]; complete: boolean }> {
  const items: Consultation[] = [];
  for (let page = 1; ; page += 1) {
    let result: Awaited<ReturnType<typeof api.consultations.findAll>>;
    try {
      result = await api.consultations.findAll({
        ...filters,
        limit: 100,
        page,
      });
    } catch {
      return { items, complete: false };
    }
    items.push(...result.items);
    if (result.items.length === 0 || page >= result.pagination.totalPages) {
      return { items, complete: true };
    }
  }
}

type InspectorListing = PropertyListing &
  Partial<Pick<ListingIntakeListing, "loanAmount" | "maintenanceFee">>;

const INSPECTOR_DIRECTION_LABELS: Record<string, string> = {
  E: "동향", EE: "동향", ES: "남동향", SE: "남동향", S: "남향", SS: "남향",
  SW: "남서향", WS: "남서향", W: "서향", WW: "서향", WN: "북서향", NW: "북서향",
  N: "북향", NN: "북향", NE: "북동향", EN: "북동향",
};

/** 패널 표시용: "2026.10.29" */
function formatInspectorFullDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

/** 패널 표시용: "11/03" */
function formatInspectorMonthDay(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

/** 패널의 매물상태 배지 색: 매물관리 표의 StatusIndicator와 같은 색을 쓴다. */
function getAvailabilityPalette(value: ListingAvailability) {
  const meta = listingAvailabilityMeta[value];
  return { pill: meta.pillClassName, dot: meta.dotClassName };
}

/** 패널 표시용: "14:30" (24시간) */
function formatInspectorTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getInspectorPriceDelta(
  listing: PropertyListing,
): InspectorOffer["delta"] {
  const latest = listing.priceHistories?.[0];
  if (!latest) return null;
  const usesPrice = listing.transactionType !== "monthly" && listing.price != null;
  const before = usesPrice ? latest.priceBefore : latest.depositBefore;
  const after = usesPrice ? latest.priceAfter : latest.depositAfter;
  if (before == null || after == null || before === after) return null;
  const diff = after - before;
  return {
    direction: diff < 0 ? "down" : "up",
    amountText: formatPrice(Math.abs(diff)),
    dateText: formatInspectorMonthDay(latest.createdAt),
  };
}

/**
 * 매물 상세 패널 표시 모델. 중개 업무 흐름(확인 → 광고 → 매칭 → 거래)에 맞춰
 * 상태·할 일·활동을 계산한다.
 */
function buildPropertyInspectorModel({
  intake,
  property,
  listings,
  consultations,
  matches,
  matchesStatus,
  consultationsStatus,
  actions,
}: {
  intake: ListingIntake;
  property: Property;
  listings: PropertyListing[];
  consultations: Consultation[];
  matches: Match[] | undefined;
  /** 매칭 조회 상태. 실패하면 "없음"으로 보이지 않게 따로 표시한다. */
  matchesStatus: "loading" | "error" | "ready";
  /** 매물·거래 조건에만 연결된 상담 조회 상태. 실패하면 일부 누락을 알린다. */
  consultationsStatus: "loading" | "error" | "ready";
  actions: {
    confirm: () => void;
    addContact: () => void;
    openDeal: (dealId: string) => void;
  };
}): InspectorModel {
  const contacts = property.propertyContacts ?? [];
  const tenants = (property.tenants ?? []).filter(
    (tenant) => tenant.status !== "moved",
  );
  const owner =
    contacts.find((contact) => contact.role === "owner") ??
    contacts.find((contact) => contact.role === "co_owner") ??
    contacts[0];
  const ownerPhone = owner?.contact?.phone ?? null;
  const isClosed = intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED;
  const typeLabelOf = (listing: PropertyListing) =>
    transactionTypeMeta[listing.transactionType]?.label ??
    listing.transactionType;

  // ── 호실 ──
  const siteName = property.site?.name ?? "매물";
  const siteTypeLabel = getSiteTypeLabel(property.site?.type);
  const unitTypeName = property.unit?.siteUnitType?.name;
  const dong =
    property.unit?.dong && !property.unit.dong.isPlaceholder
      ? property.unit.dong.name.replace(/\s*동$/, "")
      : null;
  const ho = property.unit?.name ? property.unit.name.replace(/\s*호$/, "") : null;
  const address =
    property.site?.roadAddress ?? property.site?.jibunAddress ?? null;
  const subline = [
    address,
    siteTypeLabel !== "-" ? siteTypeLabel : null,
    unitTypeName,
  ].filter((item): item is string => Boolean(item));

  // 핵심 수치: 공급/전용 · 층 · 방/욕실 · 향 (값이 있을 때만)
  const unitDetail = property.unit as
    | (NonNullable<Property["unit"]> & {
        roomCount?: number | null;
        bathRoomCount?: number | null;
      })
    | null
    | undefined;
  const unitTypeDetail = property.unit?.siteUnitType as
    | {
        supplyAreaM2: number | null;
        exclusiveAreaM2: number | null;
        roomCount?: number | null;
        bathRoomCount?: number | null;
        direction?: string | null;
      }
    | null
    | undefined;
  const supplyAreaM2 =
    property.unit?.supplyAreaM2 ?? unitTypeDetail?.supplyAreaM2 ?? null;
  const exclusiveAreaM2 =
    property.unit?.exclusiveAreaM2 ?? unitTypeDetail?.exclusiveAreaM2 ?? null;
  const areaText = [
    supplyAreaM2 ? `공급 ${formatAreaPyeong(supplyAreaM2)}` : null,
    exclusiveAreaM2 ? `전용 ${formatAreaPyeong(exclusiveAreaM2)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const roomCount = unitDetail?.roomCount ?? unitTypeDetail?.roomCount ?? null;
  const bathRoomCount =
    unitDetail?.bathRoomCount ?? unitTypeDetail?.bathRoomCount ?? null;
  const directionCode = unitTypeDetail?.direction?.trim();
  const stats = [
    areaText ? { kind: "area" as const, text: areaText } : null,
    property.unit?.floor != null
      ? { kind: "floor" as const, text: `${property.unit.floor}층` }
      : null,
    roomCount != null || bathRoomCount != null
      ? {
          kind: "room" as const,
          text: [
            roomCount != null ? `방 ${roomCount}` : null,
            bathRoomCount != null ? `욕실 ${bathRoomCount}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    directionCode
      ? {
          kind: "direction" as const,
          text:
            INSPECTOR_DIRECTION_LABELS[directionCode.toUpperCase()] ??
            directionCode,
        }
      : null,
  ].filter((stat): stat is InspectorStat => Boolean(stat));

  // ── 상태 칩 ──
  // 의뢰 생명주기와 매물 상태를 따로 띄우지 않고, 목록 표의 "매물상태"와
  // 같은 이름(활성 · 거래중 · 보류 · 종료 · 사유) 하나로 보여 준다.
  const availability = getListingRowAvailability(intake, listings);
  const chips: InspectorChip[] = [
    {
      label:
        availability === ListingAvailability.CLOSED
          ? getClosedStatusLabel(intake.closedReason)
          : listingAvailabilityMeta[availability].label,
      tone:
        availability === ListingAvailability.AVAILABLE
          ? "ok"
          : availability === ListingAvailability.IN_CONTRACT
            ? "deal"
            : availability === ListingAvailability.PAUSED
              ? "warn"
              : "neutral",
      palette: getAvailabilityPalette(availability),
    },
  ];
  if (intake.isJointBrokerageRequired) {
    chips.push({
      label: intake.jointBrokeragePartner?.name
        ? `공동중개 · ${intake.jointBrokeragePartner.name}`
        : "공동중개 필수",
      tone: "neutral",
    });
  }

  // ── 거래 조건 ──
  const offers: InspectorOffer[] = listings.map((rawListing) => {
    const listing = rawListing as InspectorListing;
    const meta = transactionTypeMeta[listing.transactionType];
    const listingAvailability = getListingAvailability(listing);
    const terms = [
      { label: "입주", value: getMoveInAvailability(listing).label },
      listing.loanAmount != null
        ? {
            label: "융자",
            value: listing.loanAmount === 0 ? "없음" : formatPrice(listing.loanAmount),
          }
        : null,
      listing.maintenanceFee != null
        ? {
            label: "관리비",
            value:
              listing.maintenanceFee === 0
                ? "없음"
                : formatPrice(listing.maintenanceFee),
          }
        : null,
      { label: "수정", value: formatDaysAgo(listing.updatedAt) },
    ].filter((term): term is { label: string; value: string } => Boolean(term));
    return {
      id: listing.id,
      typeLabel: meta?.label ?? listing.transactionType,
      typeClassName: meta?.className ?? "bg-[#f1f0ec] text-foreground",
      priceText: formatInspectorListingPrice(listing),
      status:
        listings.length > 1 &&
        listingAvailability !== ListingAvailability.AVAILABLE
          ? {
              label:
                listingAvailability === ListingAvailability.CLOSED
                  ? "종료"
                  : listingAvailabilityMeta[listingAvailability].label,
              tone:
                listingAvailability === ListingAvailability.IN_CONTRACT
                  ? "deal"
                  : "neutral",
              palette: getAvailabilityPalette(listingAvailability),
            }
          : null,
      delta: getInspectorPriceDelta(listing),
      terms,
      memo: listing.memo?.trim() || null,
    };
  });

  // ── 업무 흐름: 확인 → 광고 → 매칭 → 거래 ──
  const confirmState = getIntakeConfirmationState(intake);
  // 다음 확인 예정일은 확인 줄이 유일한 표시 위치라 상태마다 빠뜨리지 않는다.
  const nextConfirmText = intake.nextConfirmAt
    ? `다음 ${formatInspectorMonthDay(intake.nextConfirmAt)}`
    : null;
  const confirmStep: InspectorStep = isClosed
    ? {
        key: "confirm",
        label: "확인",
        value: "종료된 의뢰",
        detail: intake.lastVerifiedAt
          ? `마지막 확인 ${formatInspectorMonthDay(intake.lastVerifiedAt)}`
          : "확인 기록 없음",
        tone: "idle",
      }
    : confirmState === IntakeConfirmationState.VERIFIED
      ? {
          key: "confirm",
          label: "확인",
          value: "확인됨",
          detail: [formatDaysAgo(intake.lastVerifiedAt), nextConfirmText]
            .filter(Boolean)
            .join(" · "),
          tone: "done",
        }
      : confirmState === IntakeConfirmationState.OVERDUE
        ? {
            key: "confirm",
            label: "확인",
            value: "재확인 필요",
            detail: `${formatInspectorMonthDay(intake.nextConfirmAt)} 확인 예정이었음`,
            tone: "attention",
          }
        : confirmState === IntakeConfirmationState.NO_ANSWER
          ? {
              key: "confirm",
              label: "확인",
              value: "부재중",
              detail: [
                `${formatDaysAgo(intake.lastCheckedAt)} 연락 시도`,
                nextConfirmText,
              ]
                .filter(Boolean)
                .join(" · "),
              tone: "attention",
            }
          : {
              key: "confirm",
              label: "확인",
              value: "미확인",
              detail: [
                `접수 ${getDaysSince(intake.receivedAt) ?? 0}일째`,
                nextConfirmText,
              ]
                .filter(Boolean)
                .join(" · "),
              tone: "attention",
            };

  if (!isClosed) {
    chips.push(
      confirmState === IntakeConfirmationState.VERIFIED
        ? { label: `확인 ${formatDaysAgo(intake.lastVerifiedAt)}`, tone: "ok" }
        : {
            label:
              confirmState === IntakeConfirmationState.UNVERIFIED
                ? `미확인 · 접수 ${getDaysSince(intake.receivedAt) ?? 0}일째`
                : confirmStep.value,
            tone: "warn",
          },
    );
  }

  const ads = listings.flatMap((listing) =>
    (listing.advertisements ?? []).map((advertisement) => ({
      advertisement,
      listing,
    })),
  );
  const activeAds = ads.filter(
    ({ advertisement }) => advertisement.status === "active",
  );
  const adStep: InspectorStep =
    activeAds.length > 0
      ? {
          key: "ad",
          label: "광고",
          value: `${getAdChannelLabel(activeAds[0].advertisement.channel)} 게재중`,
          detail: [
            formatAdvertisementPrice(
              activeAds[0].listing,
              activeAds[0].advertisement,
            ),
            activeAds.length > 1 ? `외 ${activeAds.length - 1}건` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          tone: "done",
        }
      : {
          key: "ad",
          label: "광고",
          value: ads.length > 0 ? "게재 종료" : "미게재",
          detail:
            ads.length > 0
              ? `${getAdChannelLabel(ads[0].advertisement.channel)} 종료`
              : "",
          tone: "idle",
        };

  // 매칭 조회는 매물(Property) 단위라, 이 의뢰의 거래 조건에 걸린 것만 남긴다.
  const intakeListingIds = new Set(listings.map((listing) => listing.id));
  const activeMatches = (matches ?? [])
    .filter(
      (match) =>
        intakeListingIds.has(match.listingId) &&
        normalizeMatchStage(match.stage) !== MatchStage.CLOSED,
    )
    .sort((a, b) => getMatchStageIndex(b.stage) - getMatchStageIndex(a.stage));
  // 같은 고객이 매매·전세에 각각 매칭될 수 있으므로 고객 단위로 센다.
  const buyerKeys = new Set(
    activeMatches.map(
      (match) => match.buyerRequirement?.contact?.id ?? match.buyerReqId,
    ),
  );
  const buyerCount = buyerKeys.size;
  const topMatch = activeMatches[0];
  const buyerStep: InspectorStep =
    matchesStatus === "error"
      ? {
          key: "buyer",
          label: "매칭",
          value: "확인 불가",
          detail: "매칭을 불러오지 못했습니다",
          tone: "attention",
        }
      : matchesStatus === "loading" || !matches
        ? {
            key: "buyer",
            label: "매칭",
            value: "…",
            detail: "매칭을 불러오는 중",
            tone: "idle",
          }
        : buyerCount > 0 && topMatch
      ? {
          key: "buyer",
          label: "매칭",
          value: `${buyerCount}명`,
          detail: `${topMatch.buyerRequirement?.contact?.name ?? "매수 고객"} ${getStatusMeta("matchStage", normalizeMatchStage(topMatch.stage)).label}${buyerCount > 1 ? ` 외 ${buyerCount - 1}명` : ""}`,
          tone: "active",
        }
      : {
          key: "buyer",
          label: "매칭",
          value: "없음",
          detail: "",
          tone: "idle",
        };

  const deals = listings
    .flatMap((listing) =>
      (listing.deals ?? []).map((deal) => ({ ...deal, listing })),
    )
    .sort(
      (a, b) =>
        new Date(b.stageChangedAt ?? 0).getTime() -
        new Date(a.stageChangedAt ?? 0).getTime(),
    );
  const latestDeal = deals[0];
  const isDealDone =
    latestDeal && ["completed", "closed"].includes(latestDeal.stage);
  const dealStep: InspectorStep = latestDeal
    ? {
        key: "deal",
        label: "거래",
        value: getStatusMeta("dealStage", latestDeal.stage).label,
        detail: [
          typeLabelOf(latestDeal.listing),
          latestDeal.stageChangedAt
            ? `${formatInspectorMonthDay(latestDeal.stageChangedAt)} 변경`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        tone: isDealDone ? "done" : "active",
        action: {
          label: "거래 보기",
          onClick: () => actions.openDeal(latestDeal.id),
        },
      }
    : {
        key: "deal",
        label: "거래",
        value: "없음",
        detail: "",
        tone: "idle",
      };

  // ── 지금 할 일 ──
  const todos: InspectorTodo[] = [];
  if (listings.length === 0) {
    todos.push({
      id: "no-listing",
      title: "거래 조건 없음",
      detail: "매매·전세·월세 조건을 먼저 등록해야 합니다.",
      tone: "danger",
    });
  }
  if (!isClosed && confirmState !== IntakeConfirmationState.VERIFIED) {
    todos.push({
      id: "confirm",
      title:
        confirmState === IntakeConfirmationState.OVERDUE
          ? "재확인 기한이 지났습니다"
          : confirmState === IntakeConfirmationState.NO_ANSWER
            ? "소유주가 부재중이었습니다"
            : "한 번도 확인하지 않은 매물",
      detail: "광고 유지 전에 소유주에게 가격·거래 가능 여부를 확인하세요.",
      tone: "warning",
      action: { label: "확인 완료", onClick: actions.confirm },
    });
  }
  if (!ownerPhone) {
    todos.push({
      id: "owner",
      title: "소유주 연락처 없음",
      detail: "확인 전화를 하려면 소유주 또는 대리인 번호가 필요합니다.",
      tone: "danger",
      action: { label: "등록", onClick: actions.addContact },
    });
  }
  const expiringTenant = tenants.find((tenant) => {
    if (!tenant.contractEnd) return false;
    const daysUntilEnd = getDaysUntil(tenant.contractEnd);
    return daysUntilEnd >= 0 && daysUntilEnd <= 45;
  });
  if (expiringTenant?.contractEnd) {
    todos.push({
      id: "tenant",
      title: "세입자 계약 만기 임박",
      detail: `${expiringTenant.contact?.name ?? "세입자"} ${formatInspectorMonthDay(expiringTenant.contractEnd)} 만기 · 집 보여주기 일정 조율`,
      tone: "warning",
    });
  }

  // ── 사람 ──
  const people: InspectorPerson[] = [
    ...contacts.map((propertyContact) => ({
      id: propertyContact.id,
      name: propertyContact.contact?.name ?? "이름 없음",
      roleLabel: getContactRoleLabel(propertyContact.role),
      isPrimary: propertyContact.isPrimary,
      phone: propertyContact.contact?.phone ?? null,
      phoneLabel: propertyContact.contact?.phone
        ? formatPhoneNumber(propertyContact.contact.phone)
        : null,
      detail:
        [propertyContact.isResident ? "실거주" : null, propertyContact.memo]
          .filter(Boolean)
          .join(" · ") || null,
    })),
    ...tenants.map((tenant) => ({
      id: `tenant-${tenant.id}`,
      name: tenant.contact?.name ?? "이름 없음",
      roleLabel: "세입자",
      isPrimary: false,
      phone: tenant.contact?.phone ?? null,
      phoneLabel: tenant.contact?.phone
        ? formatPhoneNumber(tenant.contact.phone)
        : null,
      detail: `${getTenantStatusLabel(tenant.status)} · ${getTenantPeriodLabel(tenant)}`,
    })),
  ];

  // ── 최근 활동: 상담 · 가격 · 광고 · 거래 · 접수 ──
  const consultationTitles: Record<string, string> = {
    phone: "전화 상담",
    visit: "방문 상담",
    online: "온라인 상담",
  };
  // "매물 확인 완료" 버튼이 남기는 확인 기록. 종류(type)는 전화·방문이 아니면 online으로
  // 저장돼 "온라인 상담"처럼 보였다. 판별은 수정할 수 없는 purpose로 한다(본문은 수정 가능).
  // 본문 앞의 "[매물확인]" 머리말은 서버가 붙인 그대로일 때만 표시에서 뗀다.
  const CONFIRM_RECORD_PREFIX = "[매물확인]";
  const activities = [
    ...consultations.map((consultation) => {
      const content = consultation.content ?? "";
      const isConfirmRecord = consultation.purpose === "listing_confirm";
      return {
        id: `consultation-${consultation.id}`,
        kind: (isConfirmRecord
          ? "confirm"
          : consultation.type === "visit"
            ? "visit"
            : "consultation") as InspectorActivity["kind"],
        at: consultation.createdAt,
        // 상담은 하루에도 여러 번 오가므로 시각까지 보여준다.
        timeText: formatInspectorTime(consultation.createdAt),
        title: isConfirmRecord
          ? "매물 확인"
          : (consultationTitles[consultation.type] ?? "상담"),
        who: consultation.contact?.name ?? null,
        text:
          isConfirmRecord && content.startsWith(CONFIRM_RECORD_PREFIX)
            ? content.slice(CONFIRM_RECORD_PREFIX.length).trim()
            : content,
        quote: true,
        url: null,
      };
    }),
    ...listings.flatMap((listing) => [
      ...(listing.priceHistories ?? []).map((history) => ({
        id: `price-${history.id}`,
        kind: "price" as const,
        at: history.createdAt,
        title: "가격 변경",
        who: typeLabelOf(listing),
        text: `${formatPriceHistorySnapshot(listing.transactionType, {
          price: history.priceBefore,
          deposit: history.depositBefore,
          monthlyRent: history.monthlyRentBefore,
        })} → ${formatPriceHistorySnapshot(listing.transactionType, {
          price: history.priceAfter,
          deposit: history.depositAfter,
          monthlyRent: history.monthlyRentAfter,
        })}${history.reason ? ` · ${history.reason}` : ""}`,
        quote: false,
        url: null,
      })),
      ...(listing.advertisements ?? []).flatMap((advertisement) => [
        {
          id: `ad-start-${advertisement.id}`,
          kind: "ad" as const,
          at: advertisement.startedAt ?? advertisement.firstSeenAt,
          title: "광고 시작",
          who: getAdChannelLabel(advertisement.channel),
          text: [
            `${typeLabelOf(listing)} ${formatAdvertisementPrice(listing, advertisement)}`,
            advertisement.memo?.trim() || null,
          ]
            .filter(Boolean)
            .join(" · "),
          quote: false,
          url: advertisement.url ?? null,
        },
        ...(advertisement.status === "ended" && advertisement.endedAt
          ? [
              {
                id: `ad-end-${advertisement.id}`,
                kind: "ad" as const,
                at: advertisement.endedAt,
                title: "광고 종료",
                who: getAdChannelLabel(advertisement.channel),
                text: null,
                quote: false,
                url: null,
              },
            ]
          : []),
      ]),
      ...(listing.deals ?? []).map((deal) => ({
        id: `deal-${deal.id}`,
        kind: "deal" as const,
        at: deal.stageChangedAt,
        title: `거래 ${getStatusMeta("dealStage", deal.stage).label}`,
        who: typeLabelOf(listing),
        text: null,
        quote: false,
        url: null,
      })),
    ]),
    {
      id: "intake",
      kind: "intake" as const,
      at: intake.receivedAt,
      title: "의뢰 접수",
      who: owner?.contact?.name ?? null,
      text: null,
      quote: false,
      url: null,
    },
  ]
    .filter((item) => Boolean(item.at))
    .sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime())
    .map(({ at, ...item }) => ({ ...item, dateText: formatInspectorMonthDay(at) }));

  // ── 광고 탭 · 매칭·거래 탭 ──
  const matchRows: InspectorMatchRow[] = (matches ?? [])
    .filter((match) => intakeListingIds.has(match.listingId))
    .sort((a, b) => getMatchStageIndex(b.stage) - getMatchStageIndex(a.stage))
    .map((match) => {
      const stage = normalizeMatchStage(match.stage);
      const listing = listings.find((item) => item.id === match.listingId);
      return {
        id: match.id,
        buyerName: match.buyerRequirement?.contact?.name ?? "매수 고객",
        stageLabel: getStatusMeta("matchStage", stage).label,
        typeLabel: listing ? typeLabelOf(listing) : "",
        dateText: formatInspectorMonthDay(
          (match as Match & { updatedAt?: string }).updatedAt ?? null,
        ),
        closed: stage === MatchStage.CLOSED,
      };
    });
  const adRows: InspectorAdRow[] = ads
    .map(({ advertisement, listing }) => ({
      id: advertisement.id,
      channelLabel: getAdChannelLabel(advertisement.channel),
      active: advertisement.status === "active",
      priceText: `${typeLabelOf(listing)} ${formatAdvertisementPrice(listing, advertisement)}`,
      periodText: `${formatInspectorMonthDay(advertisement.startedAt ?? advertisement.firstSeenAt)} ~ ${
        advertisement.status === "active"
          ? "게재중"
          : formatInspectorMonthDay(advertisement.endedAt)
      }`,
      url: advertisement.url ?? null,
      memo: advertisement.memo?.trim() || null,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active));
  const dealRows: InspectorDealRow[] = deals.map((deal) => ({
    id: deal.id,
    stageLabel: getStatusMeta("dealStage", deal.stage).label,
    typeLabel: typeLabelOf(deal.listing),
    dateText: deal.stageChangedAt
      ? formatInspectorMonthDay(deal.stageChangedAt)
      : "-",
    done: ["completed", "closed"].includes(deal.stage),
  }));

  // 요약 탭 "매물 정보" 칸.
  // 거래 조건별 값(입주·융자·관리비·수정)은 조건이 하나일 때만 여기에 둔다.
  // 여러 개면 "거래 조건" 목록에 조건마다 따로 나오므로 섞지 않는다.
  const singleListing =
    listings.length === 1 ? (listings[0] as InspectorListing) : null;
  const formatOptionalAmount = (value: number | null | undefined) =>
    value == null ? "-" : value === 0 ? "없음" : formatPrice(value);
  const infoFacts = [
    ...(singleListing
      ? [
          { label: "입주", value: getMoveInAvailability(singleListing).label },
          { label: "융자", value: formatOptionalAmount(singleListing.loanAmount) },
          { label: "관리비", value: formatOptionalAmount(singleListing.maintenanceFee) },
          { label: "최근 수정", value: formatDaysAgo(singleListing.updatedAt) },
        ]
      : []),
    { label: "접수", value: formatInspectorFullDate(intake.receivedAt) },
  ];

  return {
    siteName,
    dong,
    ho,
    subline,
    stats,
    infoFacts,
    chips,
    offers,
    steps: [confirmStep, adStep, buyerStep, dealStep],
    todos: todos.slice(0, 4),
    people,
    activities,
    matches: matchRows,
    matchesStatus,
    consultationsStatus,
    ads: adRows,
    deals: dealRows,
    memo: intake.memo?.trim() || null,
  };
}

interface PropertyInspectorListingDraft {
  id: string;
  transactionType: string;
  price: string;
  deposit: string;
  monthlyRent: string;
}

function PropertyInspectorEditDialog({
  open,
  onOpenChange,
  listings,
  availability,
  onSaveListing,
  onAvailabilityChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: PropertyListing[];
  availability: ListingAvailability;
  onSaveListing: (id: string, patch: UpdateListingDto) => Promise<void>;
  onAvailabilityChange: (value: ListingAvailability) => void;
}) {
  const [drafts, setDrafts] = useState<PropertyInspectorListingDraft[]>([]);
  const [nextAvailability, setNextAvailability] = useState(availability);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDrafts(listings.map(toPropertyInspectorDraft));
    setNextAvailability(availability);
  }, [availability, listings, open]);

  const updateDraft = (
    id: string,
    patch: Partial<PropertyInspectorListingDraft>,
  ) => {
    setDrafts((previous) =>
      previous.map((draft) =>
        draft.id === id ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const hasChanges =
    nextAvailability !== availability ||
    drafts.some((draft) => {
      const listing = listings.find((candidate) => candidate.id === draft.id);
      return listing ? hasPropertyInspectorPriceChange(listing, draft) : false;
    });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const changedDrafts = drafts.filter((draft) => {
        const listing = listings.find((candidate) => candidate.id === draft.id);
        return listing
          ? hasPropertyInspectorPriceChange(listing, draft)
          : false;
      });
      await Promise.all(
        changedDrafts.map((draft) =>
          onSaveListing(
            draft.id,
            draft.transactionType === "monthly"
              ? {
                  deposit: parsePropertyInspectorNumber(draft.deposit),
                  monthlyRent: parsePropertyInspectorNumber(draft.monthlyRent),
                }
              : { price: parsePropertyInspectorNumber(draft.price) },
          ),
        ),
      );
      if (nextAvailability !== availability) {
        onAvailabilityChange(nextAvailability);
      }
      if (changedDrafts.length > 0) {
        toast.success("가격 정보를 저장했습니다.");
      }
      onOpenChange(false);
    } catch {
      // updateMutation의 onError가 충돌/저장 오류 메시지와 재조회까지 처리한다.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>가격·상태 수정</DialogTitle>
          <DialogDescription>
            거래유형별 가격과 현재 매물 상태를 한 번에 변경합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[58vh] space-y-5 overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-medium text-foreground">
              매물 상태
            </label>
            <Select
              value={nextAvailability}
              onValueChange={(value) =>
                setNextAvailability(value as ListingAvailability)
              }
            >
              <SelectTrigger className="mt-1.5 h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(listingAvailabilityMeta).map(
                  ([value, meta]) => (
                    <SelectItem key={value} value={value}>
                      {meta.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
              거래중 전환은 연결할 Deal을 선택하는 단계로 이어질 수 있습니다.
            </p>
          </div>

          <div className="divide-y divide-[#eeeeec] border-y border-[#eeeeec]">
            {drafts.map((draft) => (
              <div key={draft.id} className="py-3">
                <TransactionBadge transactionType={draft.transactionType} />
                {draft.transactionType === "monthly" ? (
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <label className="text-xs text-muted-foreground">
                      보증금 (만원)
                      <Input
                        type="number"
                        min={0}
                        value={draft.deposit}
                        onChange={(event) =>
                          updateDraft(draft.id, { deposit: event.target.value })
                        }
                        className="mt-1 h-9 text-right tabular-nums"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      월세 (만원)
                      <Input
                        type="number"
                        min={0}
                        value={draft.monthlyRent}
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            monthlyRent: event.target.value,
                          })
                        }
                        className="mt-1 h-9 text-right tabular-nums"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="mt-2 block text-xs text-muted-foreground">
                    {draft.transactionType === "sale" ? "매매가" : "전세가"}{" "}
                    (만원)
                    <Input
                      type="number"
                      min={0}
                      value={draft.price}
                      onChange={(event) =>
                        updateDraft(draft.id, { price: event.target.value })
                      }
                      className="mt-1 h-9 text-right tabular-nums"
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button disabled={!hasChanges || isSaving} onClick={handleSave}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toPropertyInspectorDraft(
  listing: PropertyListing,
): PropertyInspectorListingDraft {
  return {
    id: listing.id,
    transactionType: listing.transactionType,
    price: listing.price?.toString() ?? "",
    deposit: listing.deposit?.toString() ?? "",
    monthlyRent: listing.monthlyRent?.toString() ?? "",
  };
}

function hasPropertyInspectorPriceChange(
  listing: PropertyListing,
  draft: PropertyInspectorListingDraft,
) {
  if (draft.transactionType === "monthly") {
    return (
      parsePropertyInspectorNumber(draft.deposit) !== listing.deposit ||
      parsePropertyInspectorNumber(draft.monthlyRent) !== listing.monthlyRent
    );
  }
  return parsePropertyInspectorNumber(draft.price) !== listing.price;
}

function parsePropertyInspectorNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function formatInspectorListingPrice(
  listing: Pick<
    PropertyListing,
    "transactionType" | "price" | "deposit" | "monthlyRent"
  >,
) {
  if (listing.transactionType === "monthly") {
    return `${listing.deposit ? formatPrice(listing.deposit) : "-"} / ${
      listing.monthlyRent ? formatPrice(listing.monthlyRent) : "-"
    }`;
  }
  const price = listing.price ?? listing.deposit;
  return price ? formatPrice(price) : "-";
}

function StatusIndicator({ value, label }: { value: string; label?: string }) {
  const meta = listingAvailabilityMeta[value as ListingAvailability] ?? {
    label: value,
    dotClassName: "bg-[#b4b4b1]",
    pillClassName: "bg-[#f1f1ef] text-[#5f5e5b]",
  };

  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-[5px] rounded-full pl-[7px] pr-[9px] text-[14px] font-[450] leading-5",
        meta.pillClassName,
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", meta.dotClassName)} />
      <span className="truncate">{label ?? meta.label}</span>
    </span>
  );
}

export function CloseListingIntakeDialog({
  prompt,
  pending,
  onClose,
  onCancelDealsAndClose,
  onCloseWithoutDeals,
  onCompleteDeal,
}: {
  prompt: CloseIntakePrompt;
  pending: boolean;
  onClose: () => void;
  onCancelDealsAndClose: (closedReason: ManualIntakeCloseReason) => void;
  onCloseWithoutDeals: (closedReason: ManualIntakeCloseReason) => void;
  onCompleteDeal: () => void;
}) {
  const hasActiveDeals = prompt.activeDealCount > 0;
  const [step, setStep] = useState<"decision" | "reason">(
    hasActiveDeals ? "decision" : "reason",
  );
  const [closedReason, setClosedReason] =
    useState<ManualIntakeCloseReason | null>(null);
  const propertyLabel = prompt.propertyLabel || "선택한 매물";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {step === "decision" ? (
          <>
            <DialogHeader>
              <DialogTitle>진행 중인 거래가 있습니다</DialogTitle>
              <DialogDescription>
                {propertyLabel} 매물을 종료하려면 진행 중인 거래를 먼저 처리해야
                합니다.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
              {prompt.activeDealCount > 1
                ? `진행 중인 거래 ${prompt.activeDealCount}건이 연결되어 있습니다. 거래관리에서 각각 확인해 주세요.`
                : "거래를 취소하고 매물을 종료하거나, 거래 완료 절차로 이동할 수 있습니다."}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onClose}
              >
                돌아가기
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => setStep("reason")}
                >
                  거래 취소 후 종료
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={onCompleteDeal}
                >
                  거래 완료 처리
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>매물 종결 사유</DialogTitle>
              <DialogDescription>
                {hasActiveDeals
                  ? "진행 중인 거래를 취소하고 매물을 종료할 이유를 선택해 주세요."
                  : `${propertyLabel} 매물을 종료할 이유를 선택해 주세요.`}
              </DialogDescription>
            </DialogHeader>

            <RadioGroup
              value={closedReason ?? undefined}
              onValueChange={(value) =>
                setClosedReason(value as ManualIntakeCloseReason)
              }
              className="gap-2"
            >
              {MANUAL_INTAKE_CLOSE_REASON_OPTIONS.map((option) => {
                const id = `close-intake-${prompt.intakeId}-${option.value}`;
                return (
                  <label
                    key={option.value}
                    htmlFor={id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/50",
                      closedReason === option.value &&
                        "border-destructive/50 bg-destructive/5",
                    )}
                  >
                    <RadioGroupItem
                      id={id}
                      value={option.value}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {option.label}
                      </span>
                      <span className="block text-xs leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (hasActiveDeals) {
                    setStep("decision");
                    setClosedReason(null);
                  } else {
                    onClose();
                  }
                }}
              >
                {hasActiveDeals ? "이전" : "취소"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!closedReason || pending}
                onClick={() => {
                  if (!closedReason) return;
                  if (hasActiveDeals) {
                    onCancelDealsAndClose(closedReason);
                  } else {
                    onCloseWithoutDeals(closedReason);
                  }
                }}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {hasActiveDeals ? "거래 취소 후 종료" : "매물 종료"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReactivateListingDialog({
  prompt,
  pending,
  onClose,
  onConfirm,
}: {
  prompt: ReactivateListingPrompt;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const propertyLabel = prompt.propertyLabel || "선택한 매물";
  const dealLabel =
    prompt.activeDealCount > 1
      ? `연결된 현재 거래 ${prompt.activeDealCount}건`
      : "연결된 현재 거래";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>현재 거래를 취소하시겠습니까?</DialogTitle>
          <DialogDescription>
            {propertyLabel} 매물을 활성으로 되돌리려면 {dealLabel}를 삭제해야
            합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
          취소하면 {dealLabel}가 삭제되고 매물은 활성 상태로 변경됩니다. 삭제된
          거래는 복구할 수 없습니다.
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            돌아가기
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            거래 삭제 및 활성화
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  const targetLabel =
    prompt.targetAvailability === ListingAvailability.PAUSED ? "보류" : "활성";
  const targetLabelWithParticle =
    prompt.targetAvailability === ListingAvailability.PAUSED
      ? "보류로"
      : "활성으로";

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
              ? `종료된 의뢰를 ${targetLabelWithParticle} 재개할까요?`
              : `${targetLabel} 상태로 변경할 수 없습니다`}
          </DialogTitle>
          <DialogDescription>
            {prompt.canResume
              ? `${propertyLabel}의 종료된 의뢰를 다시 엽니다.`
              : `${propertyLabel}은 거래 완료된 Deal 때문에 종료 상태입니다.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
          {prompt.canResume ? (
            prompt.completedListingCount > 0 ? (
              <>
                완료 Deal이 없는 거래유형 {prompt.resumableListingCount}개를
                재개합니다. 거래 완료된 거래유형 {prompt.completedListingCount}
                개는 종료 상태를 유지합니다.
              </>
            ) : (
              `재개하면 종료 상태가 해제되고 매물 상태가 ${targetLabelWithParticle} 표시됩니다.`
            )
          ) : (
            "기존 완료 Deal의 단계를 되돌리거나 취소해야 합니다. 새로운 거래라면 새 의뢰를 등록해 주세요."
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
                {pending && <Loader2 className="size-4 animate-spin" />}
                {targetLabelWithParticle} 재개
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
  onSuccess,
}: {
  prompt: StartDealPrompt;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isSingleListing = !prompt.requiresListingSelection;
  const [selectedListingId, setSelectedListingId] = useState(() =>
    isSingleListing ? (prompt.listings[0]?.id ?? "") : "",
  );
  const selectedListing =
    prompt.listings.find((listing) => listing.id === selectedListingId) ?? null;

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedListing) {
        throw new Error("Deal을 생성할 거래유형을 선택해 주세요.");
      }
      return api.deals.create({
        propertyId: prompt.propertyId,
        listingId: selectedListing.id,
        transactionType: selectedListing.transactionType,
        resumeListing: true,
      });
    },
    onSuccess: () => {
      onSuccess();
      toast.success("Deal을 생성하고 매물 상태를 거래중으로 변경했습니다.");
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Deal 생성에 실패했습니다.");
    },
  });

  const resumesPausedListing =
    selectedListing?.isPaused ||
    prompt.intakeLifecycleStatus === IntakeLifecycleStatus.HOLD;

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
              : "거래중으로 변경할 거래유형 선택"}
          </DialogTitle>
          <DialogDescription>
            {isSingleListing
              ? `${prompt.propertyLabel || "선택한 매물"}에 Deal을 생성하면 상태가 거래중으로 변경됩니다.`
              : "Deal을 생성할 거래유형을 선택하세요. 선택한 거래유형만 거래중으로 전환됩니다."}
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
                      "border-[#529cca] bg-[#e7f3f8]/40",
                  )}
                >
                  <RadioGroupItem id={id} value={listing.id} />
                  <DealStartListingOption listing={listing} compact />
                </label>
              );
            })}
          </RadioGroup>
        )}

        {resumesPausedListing && (
          <p className="rounded-md bg-[#fbf3db] px-3 py-2 text-xs text-[#9f6b00]">
            Deal 생성과 함께 선택한 매물의 보류 상태를 해제합니다.
          </p>
        )}

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
      <TransactionBadge transactionType={listing.transactionType} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {getDealStartPriceLabel(listing)}
      </span>
    </div>
  );
}

function getDealStartPriceLabel(listing: ListingSummary) {
  if (listing.transactionType === "monthly") {
    const deposit = listing.deposit ? formatPrice(listing.deposit) : "-";
    const monthlyRent = listing.monthlyRent
      ? formatPrice(listing.monthlyRent)
      : "-";
    return `보증금 ${deposit} · 월세 ${monthlyRent}`;
  }

  const price = getListingPrimaryPrice(listing);
  return price ? formatPrice(price) : "-";
}

function getConfirmStatusMeta(value?: string | null) {
  if (value === "alive") {
    return { label: "살아있음", className: "text-emerald-700" };
  }
  if (value === "price_changed") {
    return { label: "가격변경", className: "text-amber-700" };
  }
  if (value === "unavailable") {
    return { label: "종료/불가", className: "text-rose-700" };
  }
  if (value === "no_answer") {
    return { label: "부재중", className: "text-slate-500" };
  }
  if (value === "pending") {
    return { label: "답변대기", className: "text-sky-700" };
  }
  return { label: "상태 미확인", className: "text-slate-400" };
}

function getListingStackStyle(listings: ListingSummary[]) {
  return {
    minHeight: Math.max(1, listings.length) * PROPERTY_LISTING_STACK_ITEM_HEIGHT,
  };
}

function getListingStackItemStyle(listings: ListingSummary[]) {
  return listings.length > 1
    ? { height: PROPERTY_LISTING_STACK_ITEM_HEIGHT }
    : undefined;
}

function triggerStackCellEditor(event: ReactMouseEvent<HTMLTableCellElement>) {
  const target = event.target instanceof Element ? event.target : null;
  const listingCells = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-listing-cell-id]"),
  );
  const surface = target?.closest<HTMLElement>("[data-listing-cell-id]")
    ?? getNearestEditorByY(listingCells, event.clientY)
    ?? event.currentTarget;
  const editor = surface.querySelector<HTMLElement>("[data-editable-cell-trigger]:not(:disabled)");
  if (!editor) return;
  event.preventDefault();
  event.stopPropagation();
  editor.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
}

function getNearestEditorByY(editors: HTMLElement[], y: number) {
  if (editors.length <= 1) return editors[0] ?? null;

  return editors.reduce<HTMLElement | null>((nearest, editor) => {
    if (!nearest) return editor;
    const editorRect = editor.getBoundingClientRect();
    const nearestRect = nearest.getBoundingClientRect();
    const editorDistance = Math.abs(
      y - (editorRect.top + editorRect.height / 2),
    );
    const nearestDistance = Math.abs(
      y - (nearestRect.top + nearestRect.height / 2),
    );
    return editorDistance < nearestDistance ? editor : nearest;
  }, null);
}

function TransactionStack({ listings }: { listings: ListingSummary[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      {listings.map((listing) => (
        <div key={listing.id} className="flex items-center gap-1">
          <TransactionBadge
            transactionType={listing.transactionType}
            className="h-5 py-0 text-[14px] font-[450] leading-5"
          />
        </div>
      ))}
    </div>
  );
}

function ListingAvailabilityCell({
  intake,
  listings,
  onChange,
}: {
  intake: ListingIntake;
  listings: ListingSummary[];
  onChange: (value: ListingAvailability) => void;
}) {
  const availability = getListingRowAvailability(
    intake,
    listings.map((listing) => ({
      ...listing,
      intake: { lifecycleStatus: intake.lifecycleStatus },
    })),
  );
  const activeDealListingIndex = getActiveDealListingIndex(listings);
  const activeDealListing = listings[activeDealListingIndex];
  const showActiveDealConnector =
    listings.length > 1 &&
    availability === ListingAvailability.IN_CONTRACT &&
    activeDealListingIndex >= 0;
  const activeTransactionLabel = activeDealListing
    ? (transactionTypeMeta[activeDealListing.transactionType]?.label ??
      activeDealListing.transactionType)
    : null;

  return (
    <div
      className="-mx-2.5 relative flex h-full items-stretch overflow-visible"
      style={getListingStackStyle(listings)}
      data-active-deal-status={showActiveDealConnector ? "true" : undefined}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative z-10 flex w-full items-stretch self-stretch">
        <EditableCell
          recordId={intake.id}
          field="listingAvailability"
          value={availability}
          chipValueOf={(value) => String(value ?? "")}
          ariaLabel="매물상태"
          onSave={(_id, _field, value) =>
            onChange(String(value) as ListingAvailability)
          }
          editType="select-chip"
          chipOptions={listingAvailabilityChipOptions}
        >
          <span
            className={cn(
              "h-full w-full px-2.5",
              showActiveDealConnector
                ? "grid grid-cols-[max-content_minmax(0,1fr)] items-stretch gap-x-1.5"
                : "flex items-center",
            )}
          >
            <span className="relative z-10 flex min-w-0 items-center">
              <StatusIndicator
                value={availability}
                label={
                  availability === ListingAvailability.CLOSED
                    ? getClosedStatusLabel(intake.closedReason)
                    : undefined
                }
              />
              {showActiveDealConnector && activeTransactionLabel && (
                <span className="sr-only">
                  {activeTransactionLabel} listing에 활성 Deal 연결
                </span>
              )}
            </span>
            {showActiveDealConnector && (
              <ActiveDealListingConnector
                listingCount={listings.length}
                targetIndex={activeDealListingIndex}
              />
            )}
          </span>
        </EditableCell>
      </div>
    </div>
  );
}

function ActiveDealListingConnector({
  listingCount,
  targetIndex,
}: {
  listingCount: number;
  targetIndex: number;
}) {
  const height = listingCount * PROPERTY_LISTING_STACK_ITEM_HEIGHT;
  const startY = height / 2;
  const targetY =
    targetIndex * PROPERTY_LISTING_STACK_ITEM_HEIGHT +
    PROPERTY_LISTING_STACK_ITEM_HEIGHT / 2;
  // 컬럼 폭이 바뀌어도 곡선과 끝점은 고정하고 수평 구간만 늘린다.
  // 곡선 시작점이 상태 칩 오른쪽 모서리에 닿도록 grid 간격(gap-x-1.5)만큼 왼쪽으로 확장한다.
  const chipGap = 6;
  const curveWidth = 28;
  const path = `M 0 ${startY} C 12 ${startY}, 22 ${targetY}, ${curveWidth + chipGap} ${targetY}`;

  return (
    <span
      data-active-deal-connector-frame
      className="pointer-events-none relative -mr-4 h-full min-w-0 w-[calc(100%+1rem)] self-stretch opacity-60 transition-opacity duration-150 ease-out group-hover:opacity-100"
      style={{ height }}
      aria-hidden="true"
    >
      <svg
        data-active-deal-connector
        className="absolute inset-y-0 -left-1.5 w-[34px] overflow-visible"
        style={{ height }}
        viewBox={`0 0 ${curveWidth + chipGap} ${height}`}
      >
        <path
          d={path}
          className="fill-none stroke-[#529cca]"
          strokeWidth="1.25"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        data-active-deal-connector-line
        className="absolute right-0 h-px -translate-y-1/2 bg-[#529cca]"
        style={{ left: curveWidth, top: targetY }}
      />
      <span
        data-active-deal-connector-end
        className="absolute right-0 size-[5px] translate-x-1/2 -translate-y-1/2 rounded-full bg-[#529cca]"
        style={{ top: targetY }}
      />
    </span>
  );
}

function getConfirmFreshness(checkedAt: string | null) {
  const days = checkedAt ? getDaysSince(checkedAt) : null;
  if (days == null) {
    return {
      dot: "bg-muted-foreground/40",
      date: "text-muted-foreground",
      relative: "text-muted-foreground/70",
    };
  }
  if (days <= 7) {
    return {
      dot: "bg-success",
      date: "text-foreground",
      relative: "text-muted-foreground",
    };
  }
  if (days <= 30) {
    return {
      dot: "bg-warning",
      date: "text-warning",
      relative: "text-warning/80",
    };
  }
  return {
    dot: "bg-destructive",
    date: "text-destructive",
    relative: "text-destructive/80",
  };
}

function IntakeConfirmationCell({
  intake,
  onConfirm,
  isPending,
}: {
  intake: ListingIntake;
  onConfirm: (
    intakeId: string,
    result: "alive" | "price_changed" | "unavailable" | "no_answer" | "pending",
  ) => void;
  isPending?: boolean;
}) {
  const checkedAt = intake.lastCheckedAt ?? intake.lastVerifiedAt;
  const freshness = getConfirmFreshness(checkedAt);

  return (
    <div
      className="flex h-9 min-w-0 items-center gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      <span className={cn("size-[7px] shrink-0 rounded-full", freshness.dot)} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn(
            "truncate text-[13px] font-[450] leading-4 tabular-nums",
            freshness.date,
          )}
        >
          {checkedAt ? formatDateShort(checkedAt) : "-"}
        </span>
        <span className={cn("truncate text-[11px] leading-[14px]", freshness.relative)}>
          {checkedAt ? formatDaysAgo(checkedAt) : ""}
        </span>
      </div>
      <button
        type="button"
        title="오늘로 확인 갱신"
        aria-label="오늘로 확인 갱신"
        disabled={isPending}
        className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 disabled:opacity-40 group-hover:opacity-100"
        onClick={() => onConfirm(intake.id, "alive")}
      >
        <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />
      </button>
    </div>
  );
}

function ListingPriceDepositStack({
  listings,
  activeDealListingId,
  onSave,
  onPatch,
}: {
  listings: ListingSummary[];
  activeDealListingId: string | null;
  onSave: (recordId: string, field: string, value: unknown) => CellSaveResult;
  onPatch: (recordId: string, patch: UpdateListingDto) => CellSaveResult;
}) {
  const hasMultiple = listings.length > 1;
  return (
    <div
      className={cn(
        "-mx-2.5 flex h-full min-w-0 flex-col items-stretch",
        hasMultiple && "divide-y divide-[#d9d9d6]",
      )}
      style={getListingStackStyle(listings)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing) => {
        const isActiveDealListing = listing.id === activeDealListingId;
        return (
          <PropertyListingCell
            key={listing.id}
            listingId={listing.id}
            data-active-deal-listing={isActiveDealListing ? "true" : undefined}
            className={cn(
              "flex min-w-0 items-center transition-colors duration-150",
              hasMultiple ? "flex-none" : "flex-1",
              isActiveDealListing && "group-hover:bg-[#e7f3f8]/40",
            )}
            style={getListingStackItemStyle(listings)}
          >
            {listing.transactionType === "monthly" ? (
              <EditableCell
                recordId={listing.id}
                field="deposit"
                value={listing.deposit}
                onSave={(recordId, field, value) => {
                  return onPatch(recordId, {
                    [field]: parseEditorCellValue(value),
                  } as UpdateListingDto);
                }}
                editType="number"
                numberMinimum={0}
                numberUnit="만원"
                commitOnBlur
                activation="click"
                portalAnchor={hasMultiple ? "self" : "tableCell"}
                editorChrome="floating"
                hoverHighlight={false}
              >
                <span className="flex h-full w-full items-center gap-1.5 px-2.5">
                  {hasMultiple && (
                    <TransactionMiniLabel
                      transactionType={listing.transactionType}
                      className="h-5 py-0 text-[14px] font-[450] leading-5"
                    />
                  )}
                  <PriceDepositValue listing={listing} />
                  {isActiveDealListing && (
                    <span className="sr-only">활성 Deal 연결 대상</span>
                  )}
                </span>
              </EditableCell>
            ) : (
              <EditableCell
                recordId={listing.id}
                field="price"
                value={listing.price}
                onSave={onSave}
                editType="number"
                numberMinimum={0}
                numberUnit="만원"
                commitOnBlur
                activation="click"
                portalAnchor={hasMultiple ? "self" : "tableCell"}
                editorChrome="floating"
                hoverHighlight={false}
              >
                <span className="flex h-full w-full items-center gap-1.5 px-2.5">
                  {hasMultiple && (
                    <TransactionMiniLabel
                      transactionType={listing.transactionType}
                      className="h-5 py-0 text-[14px] font-[450] leading-5"
                    />
                  )}
                  <PriceDepositValue listing={listing} />
                  {isActiveDealListing && (
                    <span className="sr-only">활성 Deal 연결 대상</span>
                  )}
                </span>
              </EditableCell>
            )}
          </PropertyListingCell>
        );
      })}
    </div>
  );
}

function ListingMonthlyRentStack({
  listings,
  onPatch,
}: {
  listings: ListingSummary[];
  onPatch: (recordId: string, patch: UpdateListingDto) => CellSaveResult;
}) {
  const hasMultiple = listings.length > 1;
  return (
    <div
      className={cn(
        "-mx-2.5 flex h-full min-w-0 flex-col items-stretch",
        hasMultiple && "divide-y divide-[#d9d9d6]",
      )}
      style={getListingStackStyle(listings)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing) => (
        <PropertyListingCell
          key={listing.id}
          listingId={listing.id}
          className={cn(
            "flex min-w-0 items-center",
            hasMultiple ? "flex-none" : "flex-1",
          )}
          style={getListingStackItemStyle(listings)}
        >
          {listing.transactionType === "monthly" ? (
            <EditableCell
              recordId={listing.id}
              field="monthlyRent"
              value={listing.monthlyRent}
              onSave={(recordId, field, value) => {
                return onPatch(recordId, {
                  [field]: parseEditorCellValue(value),
                } as UpdateListingDto);
              }}
              editType="number"
              numberMinimum={0}
              numberUnit="만원"
              commitOnBlur
              activation="click"
              portalAnchor={hasMultiple ? "self" : "tableCell"}
              editorChrome="floating"
              hoverHighlight={false}
            >
              <span className="flex h-full w-full items-center px-2.5">
                <MonthlyRentValue listing={listing} />
              </span>
            </EditableCell>
          ) : (
            <span className="flex h-full w-full items-center px-2.5 text-[14px] leading-[21px] text-muted-foreground">
              -
            </span>
          )}
        </PropertyListingCell>
      ))}
    </div>
  );
}

// 선택 컬럼(융자금)용 숫자 필드 스택
function ListingNumberFieldStack({
  listings,
  field,
  onSave,
}: {
  listings: ListingSummary[];
  field: "loanAmount";
  onSave: (recordId: string, field: string, value: unknown) => CellSaveResult;
}) {
  const hasMultiple = listings.length > 1;
  return (
    <div
      className={cn(
        "-mx-2.5 flex h-full min-w-0 flex-col items-stretch",
        hasMultiple && "divide-y divide-[#d9d9d6]",
      )}
      style={getListingStackStyle(listings)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing) => (
        <PropertyListingCell
          key={listing.id}
          listingId={listing.id}
          className={cn(
            "flex min-w-0 items-center",
            hasMultiple ? "flex-none" : "flex-1",
          )}
          style={getListingStackItemStyle(listings)}
        >
          <EditableCell
            recordId={listing.id}
            field={field}
            value={listing[field]}
            onSave={(recordId, savedField, value) => {
              return onSave(recordId, savedField, parseEditorCellValue(value));
            }}
            editType="number"
            numberMinimum={0}
            numberUnit="만원"
            commitOnBlur
            activation="click"
            portalAnchor={hasMultiple ? "self" : "tableCell"}
            editorChrome="floating"
            hoverHighlight={false}
          >
            <span className="flex h-full w-full items-center px-2.5 text-[14px] font-[450] leading-[21px] tabular-nums">
              {listing[field] ? formatPrice(listing[field] as number) : "-"}
            </span>
          </EditableCell>
        </PropertyListingCell>
      ))}
    </div>
  );
}

function PriceDepositValue({ listing }: { listing: ListingSummary }) {
  const value = getListingPrimaryPrice(listing);

  return (
    <span className="tabular-nums text-[14px] font-[450] leading-[21px]">
      {value ? formatPrice(value) : "-"}
    </span>
  );
}

function MonthlyRentValue({ listing }: { listing: ListingSummary }) {
  return (
    <span className="tabular-nums text-[14px] font-[450] leading-[21px]">
      {listing.monthlyRent ? formatPrice(listing.monthlyRent) : "-"}
    </span>
  );
}

function parseEditorCellValue(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("유효한 금액을 입력해 주세요.");
  return parsed;
}

function parseEditorTextValue(value: unknown) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

// 노션식 셀 버튼: 테두리·배경 없이 아이콘 + 숫자 + 화살표를 글자처럼 둔다.
// 호버·열림에만 옅은 배경이 생긴다.
function ListingPanelToggle({
  count,
  icon,
  isOpen,
  panelId,
  label,
  onToggle,
}: {
  count: number;
  icon: ReactNode;
  isOpen: boolean;
  panelId: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={panelId}
      aria-label={`${count}건의 ${label} ${isOpen ? "접기" : "펼치기"}`}
      title={isOpen ? `${label} 접기` : `${label} 펼치기`}
      onClick={onToggle}
      className={cn(
        // 숫자는 같은 행의 다른 칸과 같은 글자색. 아이콘과 화살표만 옅게 둔다.
        "inline-flex h-6 items-center gap-1 rounded px-1 text-[14px] font-[450] leading-[21px] tabular-nums text-foreground transition-colors",
        !isOpen && "hover:bg-foreground/[0.06]",
      )}
    >
      <span className="text-muted-foreground/70 [&_svg]:size-3">{icon}</span>
      {count}
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "size-3 text-muted-foreground/70 transition-transform duration-150",
          isOpen && "rotate-180",
        )}
      />
    </button>
  );
}

function ListingMatchToggle({
  group,
  isOpen,
  onToggle,
}: {
  group: PropertyListingGroup;
  isOpen: boolean;
  onToggle: (groupId: string) => void;
}) {
  const matchCount = getPropertyMatchCount(group);

  return (
    <div
      className="-mx-2.5 flex h-full items-center justify-center"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <ListingPanelToggle
        count={matchCount}
        icon={<GitBranch className="size-3" />}
        isOpen={isOpen}
        panelId={`property-expand-panel-${group.id}`}
        label="연결 구매고객"
        onToggle={() => onToggle(group.id)}
      />
    </div>
  );
}

function ListingAdToggle({
  group,
  isOpen,
  onToggle,
}: {
  group: PropertyListingGroup;
  isOpen: boolean;
  onToggle: (groupId: string) => void;
}) {
  const adCount = getPropertyActiveAdvertisementCount(group);

  return (
    <div
      className="-mx-2.5 flex h-full items-center justify-center"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <ListingPanelToggle
        count={adCount}
        icon={<Megaphone className="size-3" />}
        isOpen={isOpen}
        panelId={`property-expand-panel-${group.id}`}
        label="광고 현황"
        onToggle={() => onToggle(group.id)}
      />
    </div>
  );
}

function estimatePropertyAdPanelHeight(group: PropertyListingGroup) {
  // Panel padding/border 25 + tabs 32 + header 36 + 37px data rows.
  return 93 + Math.max(1, getPropertyAdRows(group).length) * 37;
}

function getPropertyAdRows(group: PropertyListingGroup) {
  return group.listings.flatMap((listing) =>
    (listing.activeAdvertisements ?? []).map((advertisement) => ({
      listing,
      advertisement,
    })),
  );
}

function getPropertyActiveAdvertisementCount(group: PropertyListingGroup) {
  return group.listings.reduce(
    (total, listing) =>
      total +
      (listing.activeAdvertisementCount ??
        listing.activeAdvertisements?.length ??
        0),
    0,
  );
}

// 연결 구매고객 패널의 '광고' 탭 내용. 바깥 배경·여백·머리글은 그 패널이
// 대고, 여기서는 광고 목록만 그린다.
function PropertyAdPanel({ group, controls }: { group: PropertyListingGroup; controls: AdTableControls }) {
  const { preferences, selection, ...headerControls } = controls;
  const adRows = sortPropertyAdRows(getPropertyAdRows(group), preferences.sort);
  const allSelected = adRows.length > 0 && adRows.every(row => selection.selectedIds.has(row.advertisement.id));
  const icons: Record<AdColumnId, ReactNode> = {
    trade: <Tag />, channel: <Megaphone />, status: <Info />, price: <WonCircleIcon />,
    monthlyRent: <WonCircleIcon />, startedAt: <CalendarDays />, memo: <PencilLine />, url: <ExternalLink />,
  };

  return (
    <div
      data-property-ad-panel
      role="region"
      aria-label={`${group.property?.site?.name ?? "매물"} 광고 현황`}
    >
      <div role="table" aria-label="광고 현황 표">
        <div className="relative -ml-9 pl-9">
          {adRows.length > 0 && (
            <PropertyPanelSelectionCheckbox
              kind="ad"
              label="표시된 광고 모두 선택"
              checked={allSelected ? true : selection.selectedIds.size > 0 ? 'indeterminate' : false}
              onCheckedChange={selection.onSelectAll}
            />
          )}
        <div data-property-ad-header role="row" className="grid h-9 grid-cols-[var(--ad-table-columns)] border-b border-border text-[13px] font-normal leading-[1.6154] text-muted-foreground">
          {adTableColumns.map(column => (
            <AdTableColumnHeader
              key={column.id} column={column} icon={icons[column.id]}
              sort={preferences.sort} {...headerControls}
            />
          ))}
        </div>
        </div>
        <div role="rowgroup">
          {adRows.length === 0 ? (
            <div role="row">
              <div role="cell" aria-colspan={adTableColumns.length} className="flex h-[37px] items-center border-b border-border px-2.5 text-[13px] text-muted-foreground">
                등록된 광고가 없습니다.
              </div>
            </div>
          ) : adRows.map(({ listing, advertisement }) => {
            const statusMeta = adStatusMeta[advertisement.status] ?? adStatusMeta.active;
            const priceField = listing.transactionType === "sale" ? "advertisedPrice" : "advertisedDeposit";
            const advertisedPrice = advertisement[priceField];
            const priceText = advertisedPrice != null ? formatPrice(advertisedPrice) : "—";
            const rentText = advertisement.advertisedMonthlyRent != null
              ? formatPrice(advertisement.advertisedMonthlyRent) : "—";
            const channelLabel = getAdChannelLabel(advertisement.channel);
            const cellLabel = `${channelLabel} ${transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType} 광고`;
            const isSelected = selection.selectedIds.has(advertisement.id);

            return (
              <div key={advertisement.id} className="group/ad-selection relative -ml-9 pl-9">
                <PropertyPanelSelectionCheckbox
                  kind="ad"
                  label={`${channelLabel} ${transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType} 광고 선택`}
                  checked={isSelected}
                  onCheckedChange={selected => selection.onChange(advertisement.id, selected)}
                />
              <div
                role="row"
                data-property-ad-row={advertisement.id}
                data-selected={isSelected || undefined}
                aria-selected={isSelected}
                className="grid h-[37px] grid-cols-[var(--ad-table-columns)] border-b border-border text-[14px] font-[450] leading-[1.5] text-foreground hover:bg-muted data-[selected=true]:bg-info-soft/40 [&>div]:min-w-0 [&>div]:content-center [&>div]:px-2.5 [&>div:not(:last-child)]:border-r [&>div:not(:last-child)]:border-border"
              >
                <div role="cell">
                  <TransactionMiniLabel
                    transactionType={listing.transactionType}
                    className="h-5 rounded-[3px] py-0 text-[13px] font-normal leading-none"
                  />
                </div>
                <div role="cell" title={channelLabel} className="px-0!">
                  <PropertyAdEditableCell advertisement={advertisement} field="channel" label={`${cellLabel} 채널`}>
                    <span className="block truncate">{channelLabel}</span>
                  </PropertyAdEditableCell>
                </div>
                <div role="cell" className="px-0!">
                  <PropertyAdEditableCell advertisement={advertisement} field="status" label={`${cellLabel} 상태`}>
                  <span className={cn(
                    "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full pl-[7px] pr-[9px] text-[13px] font-normal leading-none",
                    statusMeta.className,
                  )}>
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />
                    {statusMeta.label}
                  </span>
                  </PropertyAdEditableCell>
                </div>
                <div role="cell" title={priceText} className="px-0! tabular-nums">
                  <PropertyAdEditableCell advertisement={advertisement} field={priceField} label={`${cellLabel} ${listing.transactionType === "sale" ? "가격" : "보증금"}`}>
                    <span className="block truncate">{priceText}</span>
                  </PropertyAdEditableCell>
                </div>
                <div role="cell" title={rentText} className={cn("tabular-nums", listing.transactionType === "monthly" && "px-0!")}>
                  {listing.transactionType === "monthly" ? <PropertyAdEditableCell advertisement={advertisement} field="advertisedMonthlyRent" label={`${cellLabel} 월세`}>
                    <span className="block truncate">{rentText}</span>
                  </PropertyAdEditableCell> : <span className="block truncate">{rentText}</span>}
                </div>
                <div role="cell" className="px-0! tabular-nums">
                  <PropertyAdEditableCell advertisement={advertisement} field="startedAt" label={`${cellLabel} 등록일`}>{formatDateShort(advertisement.startedAt)}</PropertyAdEditableCell>
                </div>
                <div role="cell" title={advertisement.memo?.trim() || undefined} className="px-0!">
                  <PropertyAdEditableCell advertisement={advertisement} field="memo" label={`${cellLabel} 메모`}>
                    <span className="block truncate">{advertisement.memo?.trim() || "—"}</span>
                  </PropertyAdEditableCell>
                </div>
                <div role="cell" className="px-0!">
                  <PropertyAdEditableCell advertisement={advertisement} field="url" label={`${cellLabel} 원문 주소`}>
                    <span className="block truncate text-[13px] text-muted-foreground">{advertisement.url ? "원문 주소" : "—"}</span>
                  </PropertyAdEditableCell>
                </div>
              </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IntakeMemoCell({
  intake,
  onSave,
}: {
  intake: PropertyListingGroup["representative"];
  onSave: (intakeId: string, value: unknown) => CellSaveResult;
}) {
  const value = intake.memo?.trim();
  return (
    <EditableCell
      recordId={intake.id}
      field="memo"
      value={intake.memo}
      onSave={(recordId, _field, newValue) => {
        return onSave(recordId, newValue);
      }}
      editType="text"
      ariaLabel="의뢰 메모"
      multiline
      commitOnBlur
      activation="click"
      portalAnchor="tableCell"
      editorChrome="floating"
      hoverHighlight={false}
    >
      <span className="block min-w-0 py-[7.5px] text-[14px] font-[450] leading-[21px] text-foreground">
        <span className="line-clamp-2">
          {value || <span className="text-muted-foreground">-</span>}
        </span>
      </span>
    </EditableCell>
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

function MoveInAvailableStack({
  listings,
  onPatch,
}: {
  listings: ListingSummary[];
  onPatch: (recordId: string, patch: UpdateListingDto) => CellSaveResult;
}) {
  const hasMultiple = listings.length > 1;
  return (
    <div
      className={cn(
        "-mx-2.5 flex h-full min-w-0 flex-col items-stretch",
        hasMultiple && "divide-y divide-[#d9d9d6]",
      )}
      style={getListingStackStyle(listings)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing) => (
        <PropertyListingCell
          key={listing.id}
          listingId={listing.id}
          className={cn(
            "flex min-w-0 items-center",
            hasMultiple ? "flex-none" : "flex-1",
          )}
          style={getListingStackItemStyle(listings)}
        >
          <EditableCell
            recordId={listing.id}
            field="moveInAvailableType"
            value={listing}
            chipValueOf={(v) =>
              (v as ListingSummary | undefined)?.moveInAvailableType ??
              "unknown"
            }
            onSave={(recordId, field, value) => {
              return onPatch(recordId, { [field]: value } as UpdateListingDto);
            }}
            onChipSave={(recordId, payload) => {
              const patch: UpdateListingDto = {
                moveInAvailableType: payload.type,
              };
              if (payload.dateWrites) {
                for (const write of payload.dateWrites) {
                  Object.assign(patch, { [write.field]: write.value });
                }
              }
              return onPatch(recordId, patch);
            }}
            editType="select-chip"
            chipOptions={moveInAvailableChipOptions}
          >
            <span className="flex h-full w-full items-center gap-1.5 px-2.5">
              <MoveInAvailableSummary listing={listing} />
            </span>
          </EditableCell>
        </PropertyListingCell>
      ))}
    </div>
  );
}

function MoveInAvailableSummary({ listing }: { listing: ListingSummary }) {
  const summary = getMoveInAvailability(listing);

  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      <span
        className={cn(
          "inline-flex h-5 w-fit max-w-full whitespace-nowrap rounded-[4px] px-1.5 text-[14px] font-[450] leading-5",
          summary.className,
        )}
      >
        <span className="truncate">{summary.label}</span>
      </span>
      {summary.detail && (
        <span className="truncate text-[11px] text-muted-foreground">
          {summary.detail}
        </span>
      )}
    </div>
  );
}

function TransactionBadge({ transactionType, className }: { transactionType: string; className?: string }) {
  const transactionMeta = transactionTypeMeta[transactionType];
  return (
    <span
      className={cn(
        "inline-flex max-w-full rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5",
        transactionMeta?.className ?? "bg-[#f1f1ef] text-[#787774]",
        className,
      )}
    >
      {transactionMeta?.label ?? transactionType}
    </span>
  );
}

function TransactionMiniLabel({
  transactionType,
  className,
}: {
  transactionType: string;
  className?: string;
}) {
  const transactionMeta = transactionTypeMeta[transactionType];
  return (
    <span
      className={cn(
        "inline-flex min-w-8 shrink-0 items-center justify-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5",
        transactionMeta?.className ?? "bg-[#f1f1ef] text-[#787774]",
        className,
      )}
    >
      {transactionMeta?.label ?? transactionType}
    </span>
  );
}

function SelectFilter({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel?: string;
}) {
  const SENTINEL = "__all__";
  return (
    <Select
      value={value === "" ? SENTINEL : value}
      onValueChange={(next) => onChange(next === SENTINEL ? "" : next)}
    >
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className="w-full border-border bg-white text-[13px] text-foreground"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value === "" ? SENTINEL : option.value}
            className="text-[13px]"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PriceRangeFilterPanel({
  initialRange,
  onApply,
  onClear,
  onCancel,
}: {
  initialRange: [number, number];
  onApply: (range: [number, number]) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  return (
    <NumericRangeFilterPanel
      ariaLabel="가격 필터"
      title="가격"
      description="매매가·보증금 기준"
      initialRange={initialRange}
      min={PRICE_RANGE_MIN}
      max={PRICE_RANGE_MAX}
      step={0.5}
      presets={PRICE_RANGE_PRESETS}
      tickLabels={["전체", "10억", "20억", "최대"]}
      formatLabel={formatPriceRangeLabel}
      thumbLabels={["최소 가격", "최대 가격"]}
      onApply={onApply}
      onClear={onClear}
      onCancel={onCancel}
    />
  );
}

function buildListingFilterParams(filters: PropertyFilterState) {
  const params: Record<string, string | number | boolean | undefined> = {};

  if (filters.siteIds.length > 0) params.siteIds = filters.siteIds.join(",");
  if (filters.provinceCode) params.provinceCode = filters.provinceCode;
  if (filters.districtCode) params.districtCode = filters.districtCode;
  if (filters.wardCode) params.wardCode = filters.wardCode;
  if (filters.siteTypes.length > 0)
    params.siteTypes = filters.siteTypes.join(",");
  if (filters.availabilities.length > 0)
    params.availabilities = filters.availabilities.join(",");
  // 가격(매매가/전세가)은 state를 억 단위로 보관 → API는 만원 단위 (×10000)
  addEokParam(params, "priceMin", filters.priceMin);
  addEokParam(params, "priceMax", filters.priceMax);
  // 보증금·월세는 만원 단위 그대로 (월세를 억으로 받으면 200→200억 버그)
  addNumberParam(params, "depositMin", filters.depositMin);
  addNumberParam(params, "depositMax", filters.depositMax);
  addNumberParam(params, "monthlyRentMin", filters.monthlyRentMin);
  addNumberParam(params, "monthlyRentMax", filters.monthlyRentMax);

  if (filters.advertisement !== "all") {
    params.hasAdvertisement = filters.advertisement === "with";
  }
  if (filters.moveInFrom) params.moveInFrom = filters.moveInFrom;
  if (filters.moveInTo) params.moveInTo = filters.moveInTo;

  const areaMin = parseNumberFilter(filters.areaMin);
  const areaMax = parseNumberFilter(filters.areaMax);
  if (areaMin !== undefined) params.areaMin = pyeongToSquareMeters(areaMin);
  if (areaMax !== undefined) params.areaMax = pyeongToSquareMeters(areaMax);

  addEffectiveCountFilter(
    params,
    "roomCount",
    "roomCountMin",
    filters.roomCount,
  );
  addEffectiveCountFilter(
    params,
    "bathRoomCount",
    "bathRoomCountMin",
    filters.bathRoomCount,
  );

  return params;
}

function addEffectiveCountFilter(
  params: Record<string, string | number | boolean | undefined>,
  exactKey: string,
  minKey: string,
  value: string,
) {
  if (!value) return;
  if (value.endsWith("+")) {
    params[minKey] = Number(value.slice(0, -1));
    return;
  }
  params[exactKey] = Number(value);
}

function addNumberParam(
  params: Record<string, string | number | boolean | undefined>,
  key: string,
  value: string,
) {
  const numberValue = parseNumberFilter(value);
  if (numberValue !== undefined) params[key] = numberValue;
}

/** 억 단위 입력값을 만원 단위 API 파라미터로 변환 (1억 = 10,000만원). */
function addEokParam(
  params: Record<string, string | number | boolean | undefined>,
  key: string,
  value: string,
) {
  const numberValue = parseNumberFilter(value);
  if (numberValue !== undefined) params[key] = Math.round(numberValue * 10000);
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

function getRangeSummary(minValue: string, maxValue: string, unit: string) {
  const min = minValue.trim();
  const max = maxValue.trim();
  if (!min && !max) return null;
  if (min && max) return `${min}~${max}${unit}`;
  if (min) return `${min}${unit} 이상`;
  return `${max}${unit} 이하`;
}

function getRoomBathFilterSummary(roomCount: string, bathRoomCount: string) {
  const parts = [
    roomCount ? `방 ${roomCount}` : null,
    bathRoomCount ? `욕실 ${bathRoomCount}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function getDateRangeSummary(fromValue: string, toValue: string) {
  const from = fromValue.trim();
  const to = toValue.trim();
  if (!from && !to) return null;
  if (from && to) return `${from}~${to}`;
  if (from) return `${from} 이후`;
  return `${to} 이전`;
}

function getPriceDepositFilterSummary(
  filters: PropertyFilterState,
  transactionType: (typeof transactionTypeOptions)[number]["value"],
) {
  const usesDeposit = transactionType === "monthly";
  const minValue = usesDeposit ? filters.depositMin : filters.priceMin;
  const maxValue = usesDeposit ? filters.depositMax : filters.priceMax;
  if (!minValue.trim() && !maxValue.trim()) return null;

  const range = getPriceRangeFilter(filters, transactionType);
  return formatPriceRangeLabel(range[0], range[1]);
}

function getPriceRangeFilter(
  filters: PropertyFilterState,
  transactionType: (typeof transactionTypeOptions)[number]["value"],
): [number, number] {
  const usesDeposit = transactionType === "monthly";
  const divisor = usesDeposit ? 10000 : 1;
  const rawMin = parseNumberFilter(
    usesDeposit ? filters.depositMin : filters.priceMin,
  );
  const rawMax = parseNumberFilter(
    usesDeposit ? filters.depositMax : filters.priceMax,
  );
  const min = clampPriceRange(
    rawMin === undefined ? PRICE_RANGE_MIN : rawMin / divisor,
  );
  const max = clampPriceRange(
    rawMax === undefined ? PRICE_RANGE_MAX : rawMax / divisor,
  );

  return min <= max ? [min, max] : [max, min];
}

function getMonthlyRentRangeFilter(
  filters: PropertyFilterState,
): [number, number] {
  return getNumericRangeFilter(
    filters.monthlyRentMin,
    filters.monthlyRentMax,
    MONTHLY_RENT_RANGE_MIN,
    MONTHLY_RENT_RANGE_MAX,
  );
}

function getAreaRangeFilter(filters: PropertyFilterState): [number, number] {
  return getNumericRangeFilter(
    filters.areaMin,
    filters.areaMax,
    AREA_RANGE_MIN,
    AREA_RANGE_MAX,
  );
}

function getNumericRangeFilter(
  minValue: string,
  maxValue: string,
  rangeMin: number,
  rangeMax: number,
): [number, number] {
  const rawMin = parseNumberFilter(minValue);
  const rawMax = parseNumberFilter(maxValue);
  const min = clampNumericRange(rawMin ?? rangeMin, rangeMin, rangeMax);
  const max = clampNumericRange(rawMax ?? rangeMax, rangeMin, rangeMax);

  return min <= max ? [min, max] : [max, min];
}

function applyPriceRangeFilter(
  filters: PropertyFilterState,
  transactionType: (typeof transactionTypeOptions)[number]["value"],
  rawMin: number,
  rawMax: number,
) {
  const min = clampPriceRange(Math.min(rawMin, rawMax));
  const max = clampPriceRange(Math.max(rawMin, rawMax));
  const minValue = min <= PRICE_RANGE_MIN ? "" : formatRangeNumber(min);
  const maxValue = max >= PRICE_RANGE_MAX ? "" : formatRangeNumber(max);

  if (transactionType === "monthly") {
    return {
      ...filters,
      priceMin: "",
      priceMax: "",
      depositMin: minValue ? eokToManwon(minValue) : "",
      depositMax: maxValue ? eokToManwon(maxValue) : "",
    };
  }

  return {
    ...filters,
    priceMin: minValue,
    priceMax: maxValue,
    depositMin: "",
    depositMax: "",
  };
}

function applyMonthlyRentRangeFilter(
  filters: PropertyFilterState,
  rawMin: number,
  rawMax: number,
) {
  const [minValue, maxValue] = getNumericRangeValues(
    rawMin,
    rawMax,
    MONTHLY_RENT_RANGE_MIN,
    MONTHLY_RENT_RANGE_MAX,
  );
  return {
    ...filters,
    monthlyRentMin: minValue,
    monthlyRentMax: maxValue,
  };
}

function applyAreaRangeFilter(
  filters: PropertyFilterState,
  rawMin: number,
  rawMax: number,
) {
  const [minValue, maxValue] = getNumericRangeValues(
    rawMin,
    rawMax,
    AREA_RANGE_MIN,
    AREA_RANGE_MAX,
  );
  return {
    ...filters,
    areaMin: minValue,
    areaMax: maxValue,
  };
}

function getNumericRangeValues(
  rawMin: number,
  rawMax: number,
  rangeMin: number,
  rangeMax: number,
): [string, string] {
  const min = clampNumericRange(Math.min(rawMin, rawMax), rangeMin, rangeMax);
  const max = clampNumericRange(Math.max(rawMin, rawMax), rangeMin, rangeMax);
  return [
    min <= rangeMin ? "" : formatRangeNumber(min),
    max >= rangeMax ? "" : formatRangeNumber(max),
  ];
}

function movePriceRangeForTransaction(
  filters: PropertyFilterState,
  transactionType: (typeof transactionTypeOptions)[number]["value"],
) {
  if (transactionType === "monthly") {
    const hasDepositRange = Boolean(filters.depositMin || filters.depositMax);
    return {
      ...filters,
      priceMin: "",
      priceMax: "",
      depositMin: hasDepositRange
        ? filters.depositMin
        : eokToManwon(filters.priceMin),
      depositMax: hasDepositRange
        ? filters.depositMax
        : eokToManwon(filters.priceMax),
    };
  }

  const hasPriceRange = Boolean(filters.priceMin || filters.priceMax);
  return {
    ...filters,
    priceMin: hasPriceRange
      ? filters.priceMin
      : manwonToEok(filters.depositMin),
    priceMax: hasPriceRange
      ? filters.priceMax
      : manwonToEok(filters.depositMax),
    depositMin: "",
    depositMax: "",
  };
}

function clampPriceRange(value: number) {
  return Math.min(PRICE_RANGE_MAX, Math.max(PRICE_RANGE_MIN, value));
}

function clampNumericRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function eokToManwon(value: string) {
  const numberValue = parseNumberFilter(value);
  return numberValue === undefined
    ? ""
    : formatRangeNumber(numberValue * 10000);
}

function manwonToEok(value: string) {
  const numberValue = parseNumberFilter(value);
  return numberValue === undefined
    ? ""
    : formatRangeNumber(numberValue / 10000);
}

function getOptionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function buildPropertyListingGroups(intakes: ListingIntake[]) {
  return intakes.map((intake) => ({
    id: intake.id,
    intakeId: intake.id,
    propertyId: intake.propertyId,
    property: intake.property,
    representative: intake,
    matchedIntakes: [intake],
    listings: (intake.listings ?? [])
      .map(toListingSummary)
      .sort(compareListingSummary),
  }));
}

function buildPropertyMapPoints(groups: PropertyListingGroup[]) {
  const pointMap = new Map<string, PropertyMapPoint>();
  const missingGroups: PropertyListingGroup[] = [];

  for (const group of groups) {
    const site = group.property?.site;
    const lat = readCoordinate(site?.lat);
    const lng = readCoordinate(site?.lng);

    if (!site || lat === null || lng === null) {
      missingGroups.push(group);
      continue;
    }

    const key = `${site.id}:${lat}:${lng}`;
    const existing = pointMap.get(key);
    if (existing) {
      existing.groups.push(group);
      existing.groupCount += 1;
      existing.listingCount += group.listings.length;
      continue;
    }

    pointMap.set(key, {
      id: key,
      siteId: site.id,
      siteName: site.name,
      address: site.roadAddress ?? site.jibunAddress ?? "주소 미등록",
      lat,
      lng,
      groups: [group],
      groupCount: 1,
      listingCount: group.listings.length,
    });
  }

  return {
    points: Array.from(pointMap.values()).sort(
      (a, b) =>
        b.groups.length - a.groups.length ||
        a.siteName.localeCompare(b.siteName),
    ),
    missingGroups,
  };
}

function readCoordinate(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getMapBounds(points: PropertyMapPoint[]) {
  if (points.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }

  return points.reduce(
    (bounds, point) => ({
      minLat: Math.min(bounds.minLat, point.lat),
      maxLat: Math.max(bounds.maxLat, point.lat),
      minLng: Math.min(bounds.minLng, point.lng),
      maxLng: Math.max(bounds.maxLng, point.lng),
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLng: points[0].lng,
      maxLng: points[0].lng,
    },
  );
}

/** 지도 목록의 동·호 표시: "101동 3404호" (단일동 건물은 호만) */
function getPropertyMapUnitLabel(property?: ListingProperty) {
  if (!property?.unit) return "";
  const dongName = getDongName(property);
  const unitName = property.unit.name.replace(/\s*호$/, "");
  return [
    dongName && dongName !== "-" ? `${dongName}동` : null,
    unitName && unitName !== "-" ? `${unitName}호` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function getPropertyMapPriceLabel(listings: ListingSummary[]) {
  if (listings.length === 0) return "가격 미등록";
  return listings
    .slice(0, 2)
    .map((listing) => {
      if (listing.transactionType === "monthly") {
        const deposit = listing.deposit ? formatPrice(listing.deposit) : "-";
        const rent = listing.monthlyRent
          ? formatPrice(listing.monthlyRent)
          : "-";
        return `${deposit}/${rent}`;
      }
      const price = getListingPrimaryPrice(listing);
      return price ? formatPrice(price) : "-";
    })
    .join(" · ");
}

function toListingSummary(listing: ListingIntakeListing): ListingSummary {
  return {
    id: listing.id,
    intakeId: listing.intakeId,
    transactionType: listing.transactionType,
    price: listing.price,
    deposit: listing.deposit,
    monthlyRent: listing.monthlyRent,
    moveInAvailableType: listing.moveInAvailableType,
    moveInAvailableFrom: listing.moveInAvailableFrom,
    moveInAvailableTo: listing.moveInAvailableTo,
    isPaused: listing.isPaused,
    deals: listing.deals,
    maintenanceFee: listing.maintenanceFee,
    loanAmount: listing.loanAmount,
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

function formatPriceHistorySnapshot(
  transactionType: string,
  value: {
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
  },
) {
  if (transactionType === "monthly") {
    const deposit = value.deposit ? formatPrice(value.deposit) : "-";
    const monthlyRent = value.monthlyRent
      ? formatPrice(value.monthlyRent)
      : "-";
    return `${deposit} / ${monthlyRent}`;
  }

  const price = value.price ?? value.deposit;
  return price ? formatPrice(price) : "-";
}

function formatAdvertisementPrice(
  listing: Pick<PropertyListing, "transactionType">,
  advertisement: NonNullable<PropertyListing["advertisements"]>[number],
) {
  if (listing.transactionType === "monthly") {
    const deposit = advertisement.advertisedDeposit
      ? formatPrice(advertisement.advertisedDeposit)
      : "-";
    const monthlyRent = advertisement.advertisedMonthlyRent
      ? formatPrice(advertisement.advertisedMonthlyRent)
      : "-";
    return `${deposit} / ${monthlyRent}`;
  }

  const price =
    advertisement.advertisedPrice ?? advertisement.advertisedDeposit;
  return price ? formatPrice(price) : "-";
}

function getDongName(property?: ListingProperty) {
  const dong = property?.unit?.dong;
  if (!dong || dong.isPlaceholder) return "-";
  return dong.name.replace(/\s*동$/, "");
}

function getSupplyAreaM2(property?: ListingProperty) {
  return (
    property?.unit?.supplyAreaM2 ?? property?.unit?.siteUnitType?.supplyAreaM2
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

function comparePropertyListing(a: PropertyListing, b: PropertyListing) {
  const typeOrder =
    getTransactionTypeOrder(a.transactionType) -
    getTransactionTypeOrder(b.transactionType);
  if (typeOrder !== 0) return typeOrder;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function formatDateShort(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
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

function getDaysSince(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function getDaysUntil(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function formatDaysAgo(value?: string | null) {
  const days = getDaysSince(value);
  if (days === null) return "-";
  if (days === 0) return "오늘";
  return `${days}일 전`;
}

function formatAreaPyeong(value?: number | null, fractionDigits = 1) {
  if (!value) return "-";
  const squareMeters = Number(value);
  return `${(squareMeters * 0.3025).toFixed(fractionDigits)}평`;
}
