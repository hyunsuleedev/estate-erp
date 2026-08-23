import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Columns3,
  DoorOpen,
  ExternalLink,
  FileText,
  GitBranch,
  Handshake,
  Hash,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  Tag,
  Trash2,
  Type,
  UserPlus,
  X,
} from "lucide-react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { api } from "@/lib/api";
import { ApiError } from "@estate-erp/api-client";
import type {
  BuyerRequirement,
  Consultation,
  ListingIntake,
  ListingIntakeListing,
  Match,
  Property,
  PropertyContact,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MultiSelect,
  type MultiSelectOption,
} from "@/components/ui/multi-select";
import { StatusBadge } from "@/components/domain";
import { cn } from "@/lib/utils";
import { formatPhoneNumber } from "@/lib/contacts";
import { formatMoney } from "@/lib/format";
import {
  CellEditProvider,
  EditableCell,
  type SortDefinition,
  type ChipOption,
} from "@/components/data-table";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
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
  buildPropertyMapClustersFromOffsets,
  removePropertyMapListeners,
  type PropertyMapClusterSource,
} from "./-property-map-utils";
import {
  PropertyBulkActions,
  PropertyRowActions,
} from "./-property-intake-actions";
import { MatchCreateDialog } from "../matches/-match-create-dialog";
import { MatchConvertDialog } from "../matches/-match-convert-dialog";
import {
  MatchProgressTrack,
  type MatchProgressActions,
} from "../matches/-match-board";
import {
  buildViewingCalendarEventPayload,
  formatViewingEventTime,
  getMatchStageBlockReason,
  getMatchStageLabel,
  getUpcomingViewingEvent,
  matchStageOrder,
  shouldMoveToViewingOnSchedule,
  toCalendarEventUpdatePayload,
} from "../matches/-match-view-utils";

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
  className: meta.pillClassName,
}));

const adStatusMeta: Record<string, { label: string; className: string }> = {
  active: { label: "광고중", className: "bg-[#eef3ed] text-[#44745a]" },
  ended: { label: "종료", className: "bg-[#f1f1ef] text-[#787774]" },
};

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

// 정렬은 표 헤더 클릭으로 처리. 헤더 라벨 매핑만 유지.
const sortDefinitions = [
  { field: "info", label: "거래" },
  { field: "site", label: "단지" },
  { field: "dong", label: "동" },
  { field: "unit", label: "호" },
  { field: "supplyArea", label: "공급" },
  { field: "unitType", label: "타입" },
  { field: "matching", label: "매칭" },
  { field: "advertisement", label: "광고" },
  { field: "confirmationAt", label: "확인" },
  { field: "listingAvailability", label: "매물상태" },
  { field: "price", label: "가격" },
  { field: "monthlyRent", label: "월세" },
  { field: "loanAmount", label: "융자금" },
  { field: "moveInAvailable", label: "입주가능일" },
  { field: "memo", label: "의뢰 메모" },
];

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
const PROPERTY_LISTING_STACK_ITEM_HEIGHT = 33;
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

const PRICE_RANGE_MIN = 0;
const PRICE_RANGE_MAX = 30;
interface NumericRangePreset {
  label: string;
  min: number;
  max: number;
  isAll?: boolean;
}

const PRICE_RANGE_PRESETS: NumericRangePreset[] = [
  { label: "~5억", min: 0, max: 5 },
  { label: "5억대", min: 5, max: 10 },
  { label: "10억대", min: 10, max: 15 },
  { label: "15억대", min: 15, max: 20 },
  { label: "20억대", min: 20, max: 25 },
  { label: "25억대", min: 25, max: 30 },
  { label: "30억~", min: 30, max: 30 },
  { label: "전체", min: 0, max: 30, isAll: true },
];

const MONTHLY_RENT_RANGE_MIN = 0;
const MONTHLY_RENT_RANGE_MAX = 600;
const MONTHLY_RENT_RANGE_PRESETS: NumericRangePreset[] = [
  { label: "~100만", min: 0, max: 100 },
  { label: "100만대", min: 100, max: 200 },
  { label: "200만대", min: 200, max: 300 },
  { label: "300만대", min: 300, max: 400 },
  { label: "400만대", min: 400, max: 500 },
  { label: "500만대", min: 500, max: 600 },
  { label: "600만~", min: 600, max: 600 },
  { label: "전체", min: 0, max: 600, isAll: true },
];

const AREA_RANGE_MIN = 0;
const AREA_RANGE_MAX = 80;
const AREA_RANGE_PRESETS: NumericRangePreset[] = [
  { label: "~10평", min: 0, max: 10 },
  { label: "10평대", min: 10, max: 20 },
  { label: "20평대", min: 20, max: 30 },
  { label: "30평대", min: 30, max: 40 },
  { label: "40평대", min: 40, max: 50 },
  { label: "50평대", min: 50, max: 60 },
  { label: "60평대", min: 60, max: 70 },
  { label: "70평~", min: 70, max: 80 },
];

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

type PropertySheetNoticeTone = "danger" | "warning" | "neutral";

interface PropertySheetNotice {
  title: string;
  detail: string;
  tone: PropertySheetNoticeTone;
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
  const [expandedAdRows, setExpandedAdRows] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedMatchRows, setExpandedMatchRows] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [
    arePropertyDetailColumnsCollapsed,
    setArePropertyDetailColumnsCollapsed,
  ] = useState(true);
  const [isPriceFilterOpen, setIsPriceFilterOpen] = useState(false);
  const [isMonthlyRentFilterOpen, setIsMonthlyRentFilterOpen] = useState(false);
  const [isAreaFilterOpen, setIsAreaFilterOpen] = useState(false);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
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
      queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
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
  const handleCellSave = useCallback(
    (recordId: string, field: string, value: unknown) => {
      updateMutation.mutate({
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
    (recordId: string, patch: UpdateListingDto) => {
      updateMutation.mutate({
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
  const closePropertyInspector = useCallback(() => {
    shouldRestorePropertyTableFocusRef.current = true;
    setSelectedIntakeId(null);
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
    (intakeId: string, value: unknown) => {
      const memo = parseEditorTextValue(value);
      intakeMemoMutation.mutate({
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
    const route = "/properties/new";
    const meta = getRouteMeta(route);
    createTab({ route, kind: meta.kind, title: meta.title });
  }, [createTab]);

  const toggleAdRow = useCallback((groupId: string) => {
    setExpandedAdRows((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const toggleMatchRow = useCallback((groupId: string) => {
    setExpandedMatchRows((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const expandedRowIds = useMemo(
    () => new Set([...expandedMatchRows, ...expandedAdRows]),
    [expandedAdRows, expandedMatchRows],
  );

  const renderExpandedPropertyRow = useCallback(
    (group: PropertyListingGroup) => (
      <>
        {expandedMatchRows.has(group.id) && (
          <PropertyMatchPanel group={group} />
        )}
        {expandedAdRows.has(group.id) && <PropertyAdPanel group={group} />}
      </>
    ),
    [expandedAdRows, expandedMatchRows],
  );

  const getExpandedPropertyRowHeight = useCallback(
    (group: PropertyListingGroup) =>
      (expandedMatchRows.has(group.id)
        ? estimatePropertyMatchPanelHeight(group)
        : 0) +
      (expandedAdRows.has(group.id) ? estimatePropertyAdPanelHeight(group) : 0),
    [expandedAdRows, expandedMatchRows],
  );

  // ── Column definitions (property-grouped operational grid) ────
  const columns = useMemo<ColumnDef<PropertyListingGroup, unknown>[]>(
    () => [
      {
        id: "info",
        header: () => (
          <TableHeaderLabel icon={<Tag className="size-4" />} label="거래" />
        ),
        size: 60,
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
          return (
            <div className="flex min-w-0 items-center">
              <span className="truncate text-[14px] font-semibold text-slate-900">
                {group.property?.site?.name ?? "매물 정보 없음"}
              </span>
            </div>
          );
        },
      },
      {
        id: "dong",
        header: () => (
          <TableHeaderLabel icon={<Hash className="size-4" />} label="동" />
        ),
        size: 58,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="truncate text-[13px] font-medium text-slate-900">
            {getDongName(row.original.property)}
          </span>
        ),
      },
      {
        id: "unit",
        header: () => (
          <TableHeaderLabel icon={<Hash className="size-4" />} label="호" />
        ),
        size: 58,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="truncate text-[13px] font-medium text-slate-900">
            {row.original.property?.unit?.name ?? ""}
          </span>
        ),
      },
      {
        id: "supplyArea",
        header: () => (
          <TableHeaderLabel icon={<Ruler className="size-4" />} label="공급" />
        ),
        size: 72,
        enableSorting: true,
        cell: ({ row }) => {
          const value = formatAreaPyeong(
            getSupplyAreaM2(row.original.property),
            0,
          );
          return (
            <span className="truncate text-[13px] text-slate-700 tabular-nums">
              {value === "-" ? "" : value}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">작업</span>,
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableResizing: false,
        enableSorting: false,
        meta: {
          cellClassName: "px-0",
        },
        cell: ({ row }) => (
          <PropertyRowActions
            listings={row.original.listings}
            intake={row.original.representative}
          />
        ),
      },
      ...(!arePropertyDetailColumnsCollapsed
        ? [
            {
              id: "unitType",
              header: () => (
                <TableHeaderLabel
                  icon={<Type className="size-4" />}
                  label="타입"
                />
              ),
              size: 58,
              enableSorting: true,
              cell: ({ row }) => {
                const value = getUnitTypeName(row.original.property);
                return (
                  <span className="truncate text-[13px] text-slate-700">
                    {value === "-" ? "" : value}
                  </span>
                );
              },
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
            {
              id: "matching",
              header: () => (
                <TableHeaderLabel
                  icon={<GitBranch className="size-4" />}
                  label="매칭"
                />
              ),
              size: 64,
              enableSorting: true,
              cell: ({ row }) => (
                <ListingMatchToggle
                  group={row.original}
                  isOpen={expandedMatchRows.has(row.original.id)}
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
              size: 64,
              enableSorting: true,
              cell: ({ row }) => (
                <ListingAdToggle
                  group={row.original}
                  isOpen={expandedAdRows.has(row.original.id)}
                  onToggle={toggleAdRow}
                />
              ),
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
            {
              id: "confirmationAt",
              header: () => (
                <TableHeaderLabel
                  icon={<CalendarDays className="size-4" />}
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
            icon={<Tag className="size-4" />}
            label="매물상태"
          />
        ),
        size: 120,
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
            icon={<CircleDollarSign className="size-4" />}
            label="가격/보증금"
          />
        ),
        size: 155,
        enableSorting: true,
        meta: {
          cellClassName: "hover:bg-muted/50",
          onCellDoubleClick: (
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
            icon={<CircleDollarSign className="size-4" />}
            label="월세"
          />
        ),
        size: 82,
        enableSorting: true,
        meta: {
          cellClassName: "hover:bg-muted/50",
          onCellDoubleClick: (
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
                  icon={<CircleDollarSign className="size-4" />}
                  label="융자금"
                />
              ),
              size: 96,
              enableSorting: true,
              meta: {
                cellClassName: "hover:bg-muted/50",
                onCellDoubleClick: (
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
            icon={<DoorOpen className="size-4" />}
            label="입주가능일"
          />
        ),
        size: 120,
        enableSorting: true,
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
            icon={<FileText className="size-4" />}
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
          onCellDoubleClick: (
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
      confirmMutation.isPending,
      confirmMutation.variables?.intakeId,
      expandedAdRows,
      expandedMatchRows,
      optionalColumns.loanAmount,
      toggleAdRow,
      toggleMatchRow,
    ],
  );

  return (
    <CellEditProvider>
      <div
        data-properties-page
        className="relative -m-4 flex min-h-0 flex-1 flex-col bg-white"
      >
        <section className="shrink-0 border-b border-border bg-white px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Tabs
                value={selectedTransactionType}
                onValueChange={handleTransactionTabChange}
                className="min-w-0 shrink-0 gap-0"
              >
                <TabsList className="max-w-full justify-start border border-border/80 bg-[#f5f4f1] p-0.5">
                  {transactionTypeOptions.map((tab) => {
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="flex-none border-0 px-3 text-[13px] text-muted-foreground shadow-none data-[state=active]:border data-[state=active]:border-[#d9d9d6] data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
                      >
                        <span>{tab.label}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>

              <MultiSelect
                options={siteFilterOptions}
                selected={propertyFilters.siteIds}
                onChange={(values) => updatePropertyFilter("siteIds", values)}
                ariaLabel="단지 필터"
                placeholder="단지 전체"
                searchPlaceholder="단지명 또는 주소 검색"
                emptyText="일치하는 단지가 없습니다."
                isLoading={isFilterSitesLoading}
                maxCount={1}
                className={cn(
                  "h-8 min-w-[150px] max-w-[280px] shrink-0 border-transparent bg-[#f7f6f3] px-2.5 text-[13px] shadow-none hover:border-border",
                  propertyFilters.siteIds.length > 0 &&
                    "border-foreground/25 bg-foreground/[0.06]",
                )}
                badgeClassName="m-0 h-5 border-border bg-white px-1.5 text-[11px] text-foreground shadow-none"
                popoverClassName="w-[360px]"
              />

              <div className="relative w-20">
                <Input
                  value={propertyFilters.dongSearch}
                  onChange={(event) =>
                    updatePropertyFilter("dongSearch", event.target.value)
                  }
                  placeholder="동"
                  className="h-8 border-transparent bg-[#f7f6f3] px-2 pr-6 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
                />
                {propertyFilters.dongSearch && (
                  <button
                    type="button"
                    aria-label="동 검색 지우기"
                    onClick={() => updatePropertyFilter("dongSearch", "")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="relative w-20">
                <Input
                  value={propertyFilters.unitSearch}
                  onChange={(event) =>
                    updatePropertyFilter("unitSearch", event.target.value)
                  }
                  placeholder="호"
                  className="h-8 border-transparent bg-[#f7f6f3] px-2 pr-6 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
                />
                {propertyFilters.unitSearch && (
                  <button
                    type="button"
                    aria-label="호 검색 지우기"
                    onClick={() => updatePropertyFilter("unitSearch", "")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="relative ml-1 min-w-[160px] max-w-56 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="주소, 연락처, 메모"
                  className="h-8 border-transparent bg-[#f7f6f3] pl-8 pr-8 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => handleSearchChange("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ViewModeSwitch value={viewMode} onChange={setViewMode} />
              <Button
                size="sm"
                className="shrink-0 px-3.5"
                onClick={handleCreateProperty}
              >
                <Plus className="size-3.5" />새 매물 등록
              </Button>
            </div>
          </div>
        </section>

        <section className="shrink-0 overflow-x-auto border-b border-border bg-[#faf9f6] px-3 py-2">
          <div className="flex w-full min-w-max items-center gap-2">
            <div className="flex shrink-0 items-center gap-1.5">
              <FilterPopoverChip
                label="지역"
                value={selectedRegionName ?? "전체"}
                active={Boolean(
                  propertyFilters.provinceCode ||
                  propertyFilters.districtCode ||
                  propertyFilters.wardCode,
                )}
                tier={2}
                onClear={() =>
                  clearFilterFields([
                    "provinceCode",
                    "districtCode",
                    "wardCode",
                  ])
                }
                contentClassName="w-[360px]"
              >
                <div className="space-y-3">
                  <PopoverTitle
                    title="지역"
                    description="시도, 시군구, 법정동을 한 번에 좁힙니다."
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <FilterField label="시도">
                      <SelectFilter
                        value={propertyFilters.provinceCode}
                        onChange={handleProvinceFilterChange}
                        options={provinceOptions}
                      />
                    </FilterField>
                    <FilterField label="시군구">
                      <SelectFilter
                        value={propertyFilters.districtCode}
                        onChange={handleDistrictFilterChange}
                        options={districtOptions}
                      />
                    </FilterField>
                    <FilterField label="법정동">
                      <SelectFilter
                        value={propertyFilters.wardCode}
                        onChange={(value) =>
                          updatePropertyFilter("wardCode", value)
                        }
                        options={wardOptions}
                      />
                    </FilterField>
                  </div>
                </div>
              </FilterPopoverChip>

              <MultiSelect
                options={siteTypeOptions}
                selected={propertyFilters.siteTypes}
                onChange={(values) => updatePropertyFilter("siteTypes", values)}
                ariaLabel="유형 필터"
                placeholder="유형 전체"
                searchPlaceholder="유형 검색"
                emptyText="일치하는 유형이 없습니다."
                maxCount={1}
                className={cn(
                  "h-8 min-w-[126px] max-w-[220px] border-border bg-white px-2.5 text-[13px] shadow-none",
                  propertyFilters.siteTypes.length > 0 &&
                    "border-foreground/25 bg-foreground/[0.06]",
                )}
                badgeClassName="m-0 h-5 border-border bg-white px-1.5 text-[11px] text-foreground shadow-none"
                popoverClassName="w-[240px]"
              />
            </div>

            <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />

            <div className="flex shrink-0 items-center gap-1.5">
              <MultiSelect
                options={listingAvailabilityFilterOptions}
                selected={propertyFilters.availabilities}
                onChange={(values) =>
                  updatePropertyFilter("availabilities", values)
                }
                ariaLabel="매물상태 필터"
                placeholder="매물상태 전체"
                searchPlaceholder="매물상태 검색"
                emptyText="일치하는 상태가 없습니다."
                maxCount={1}
                className={cn(
                  "h-8 min-w-[150px] max-w-[240px] border-border bg-white px-2.5 text-[13px] shadow-none",
                  propertyFilters.availabilities.length > 0 &&
                    "border-foreground/25 bg-foreground/[0.06]",
                )}
                badgeClassName="m-0 h-5 border-border bg-white px-1.5 text-[11px] text-foreground shadow-none"
                popoverClassName="w-[240px]"
              />

              <FilterPopoverChip
                label="가격/보증금"
                value={priceDepositFilterSummary ?? "전체"}
                active={Boolean(priceDepositFilterSummary)}
                tier={2}
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
              </FilterPopoverChip>

              <FilterPopoverChip
                label="월세"
                value={monthlyRentFilterSummary ?? "전체"}
                active={Boolean(monthlyRentFilterSummary)}
                tier={3}
                open={isMonthlyRentFilterOpen}
                onOpenChange={setIsMonthlyRentFilterOpen}
                onClear={() =>
                  clearFilterFields(["monthlyRentMin", "monthlyRentMax"])
                }
                contentClassName="w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
              >
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
                  onApply={handleMonthlyRentRangeApply}
                  onClear={() => {
                    clearFilterFields(["monthlyRentMin", "monthlyRentMax"]);
                    setIsMonthlyRentFilterOpen(false);
                  }}
                  onCancel={() => setIsMonthlyRentFilterOpen(false)}
                />
              </FilterPopoverChip>

              <FilterPopoverChip
                label="공급평형"
                value={areaFilterSummary ?? "전체"}
                active={Boolean(areaFilterSummary)}
                tier={2}
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
              </FilterPopoverChip>

              <FilterPopoverChip
                label="방/욕실"
                value={roomBathFilterSummary ?? "전체"}
                active={Boolean(roomBathFilterSummary)}
                tier={2}
                onClear={() =>
                  clearFilterFields(["roomCount", "bathRoomCount"])
                }
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
              </FilterPopoverChip>

              <FilterPopoverChip
                label="입주일"
                value={moveInFilterSummary ?? "전체"}
                active={Boolean(moveInFilterSummary)}
                tier={3}
                onClear={() => clearFilterFields(["moveInFrom", "moveInTo"])}
                contentClassName="w-[320px]"
              >
                <div className="space-y-3">
                  <PopoverTitle
                    title="입주일"
                    description="입주가능일 시작 날짜 기준으로 검색합니다."
                  />
                  <DateRangeFilter
                    fromValue={propertyFilters.moveInFrom}
                    toValue={propertyFilters.moveInTo}
                    onFromChange={(value) =>
                      updatePropertyFilter("moveInFrom", value)
                    }
                    onToChange={(value) =>
                      updatePropertyFilter("moveInTo", value)
                    }
                  />
                </div>
              </FilterPopoverChip>
            </div>

            <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />

            <div className="flex shrink-0 items-center gap-1.5">
              <Select
                value={propertyFilters.advertisement}
                onValueChange={(value) =>
                  updatePropertyFilter(
                    "advertisement",
                    value as PropertyFilterState["advertisement"],
                  )
                }
              >
                <SelectTrigger
                  size="sm"
                  aria-label="광고 필터"
                  className={cn(
                    "h-8 w-[116px] border-border bg-white px-2.5 text-xs text-muted-foreground shadow-none",
                    propertyFilters.advertisement !== "all" &&
                      "border-foreground/25 bg-foreground/[0.06] text-foreground",
                  )}
                >
                  <Megaphone className="size-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {advertisementFilterOptions.map((option) => (
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

            {/* 표시 설정과 초기화 — 우측 정렬 */}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="mr-0.5 hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 xl:inline">
                표시
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                  >
                    <Columns3 className="size-3.5" />
                    컬럼
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
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

              {hasActiveFilters && (
                <>
                  <div className="mx-0.5 h-4 w-px bg-border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                    onClick={handleFiltersReset}
                  >
                    <RotateCcw className="size-3.5" />
                    초기화
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

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
                    마커나 우측 매물을 클릭하면 빠른 확인 패널이 열립니다.
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
                onRowClick={(row) => setSelectedIntakeId(row.intakeId)}
                onRequestClose={
                  selectedIntakeId ? closePropertyInspector : undefined
                }
                expandedRowIds={expandedRowIds}
                renderExpandedRow={renderExpandedPropertyRow}
                getExpandedRowHeight={getExpandedPropertyRowHeight}
                columnGroupControl={{
                  collapsed: arePropertyDetailColumnsCollapsed,
                  onToggle: () =>
                    setArePropertyDetailColumnsCollapsed(
                      (previous) => !previous,
                    ),
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
                onSelectIntake={setSelectedIntakeId}
              />
            )}
          </div>
        </section>
        {selectedIntakeId && (
          <>
            <div
              data-property-inspector-backdrop
              aria-hidden="true"
              className="absolute inset-0 z-40 cursor-default bg-slate-950/10"
              onClick={closePropertyInspector}
            />
            <PropertyInspector
              intakeId={selectedIntakeId}
              onClose={closePropertyInspector}
              onConfirm={(intakeId) => handleIntakeConfirm(intakeId, "alive")}
              isConfirming={
                confirmMutation.isPending &&
                confirmMutation.variables?.intakeId === selectedIntakeId
              }
              onSaveListing={handleInspectorListingUpdate}
              onAvailabilityChange={handleInspectorAvailabilityChange}
            />
          </>
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

function TableHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal text-muted-foreground">
      <span className="shrink-0 [&>svg]:size-3 [&>svg]:text-muted-foreground/70">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function ViewModeSwitch({
  value,
  onChange,
}: {
  value: PropertyViewMode;
  onChange: (value: PropertyViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="매물 보기 방식"
      className="flex h-8 items-center rounded-md border border-border bg-[#f5f4f1] p-0.5"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 gap-1.5 rounded-[5px] px-2.5 text-xs font-medium",
          value === "list"
            ? "border border-border/80 bg-white text-foreground shadow-sm hover:bg-white"
            : "text-muted-foreground",
        )}
        onClick={() => onChange("list")}
        aria-pressed={value === "list"}
      >
        <List className="size-3.5" />
        목록
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 gap-1.5 rounded-[5px] px-2.5 text-xs font-medium",
          value === "map"
            ? "border border-border/80 bg-white text-foreground shadow-sm hover:bg-white"
            : "text-muted-foreground",
        )}
        onClick={() => onChange("map")}
        aria-pressed={value === "map"}
      >
        <MapIcon className="size-3.5" />
        지도
      </Button>
    </div>
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
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] bg-white">
      <div className="relative min-h-0 overflow-hidden border-r border-border bg-[#f7f7f5]">
        <NaverPropertyMap
          points={points}
          missingCount={missingGroups.length}
          onSelectIntake={onSelectIntake}
        />
      </div>

      <aside className="flex min-h-0 flex-col bg-white">
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
    </div>
  );
}

function PropertyMapSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] bg-white">
      <div className="relative border-r border-border bg-muted/30 p-4">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      <div className="space-y-2 p-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-md" />
        ))}
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
      zoomControl: true,
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
      <div className="absolute left-4 top-4 z-10 rounded-md border border-border bg-white/95 px-3 py-2 shadow-sm">
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

  window.__estateErpNaverMapsPromise = new Promise<NaverMapsApi>(
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

  return window.__estateErpNaverMapsPromise;
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
            {[unitLabel, address].filter(Boolean).join(" · ")}
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
  onClose,
  onConfirm,
  isConfirming,
  onSaveListing,
  onAvailabilityChange,
}: {
  intakeId: string;
  onClose: () => void;
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
      if (
        document.querySelector(
          '[role="dialog"], [role="listbox"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      onClose();
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
        '[role="dialog"], [role="listbox"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]',
      )
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <aside
      data-property-inspector
      aria-label="매물 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-[#dddcd8] bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.1)]"
      style={{ width }}
      onKeyDownCapture={handleKeyDown}
    >
      <PropertyInspectorResizeHandle width={width} onResize={setWidth} />
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
            <Button variant="ghost" size="sm" onClick={onClose}>
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
  onClose: () => void;
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
  const [activeTab, setActiveTab] = useState("overview");
  const [isOpeningFullPage, setIsOpeningFullPage] = useState(false);
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
  const tenants = property.tenants ?? [];
  const consultations = property.consultations ?? [];
  const owner =
    contacts.find((contact) => contact.role === "owner") ?? contacts[0];
  const ownerPhone = owner?.contact?.phone;
  const title = property.site?.name ?? "매물 상세";
  const unitLabel = getPropertySheetUnitLabel(property);
  const address =
    property.site?.roadAddress ?? property.site?.jibunAddress ?? "주소 미등록";
  const primaryListing = listings[0];
  const availability = getListingRowAvailability(intake, listings);
  const moveIn = primaryListing
    ? getMoveInAvailability(primaryListing)
    : { label: "-", detail: null };
  const notices = getPropertySheetNotices(propertyWithListings);
  const memo =
    intake.memo?.trim() ||
    listings.find((listing) => listing.memo?.trim())?.memo?.trim();
  const activityCount =
    getPropertySheetAdvertisementCount(listings) +
    getPropertySheetPriceHistoryCount(listings);
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

  const openFullPage = async () => {
    if (isOpeningFullPage) return;
    const route = `/properties/${property.id}`;
    const meta = getRouteMeta(route);
    const tabTitle = [title, unitLabel].filter(Boolean).join(" ") || meta.title;
    const tabsBridge = window.electronBridge?.tabs;
    if (!tabsBridge) {
      toast.error("새 창 열기는 데스크톱 앱에서만 사용할 수 있습니다.");
      return;
    }

    setIsOpeningFullPage(true);
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
      setIsOpeningFullPage(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#e7e5df] px-3 pl-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          매물 상세
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            aria-label="전체 페이지를 새 창으로 열기"
            disabled={isOpeningFullPage}
            onClick={() => void openFullPage()}
          >
            {isOpeningFullPage ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ExternalLink className="size-3.5" />
            )}
            {isOpeningFullPage ? "여는 중..." : "전체 페이지"}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="상세 패널 닫기"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="shrink-0 border-b border-[#e7e5df] px-5 pb-4 pt-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-foreground">
              {title}
              {unitLabel && (
                <span className="ml-2 text-foreground/80">{unitLabel}</span>
              )}
            </h2>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{address}</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-muted-foreground">대표 가격</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
              {primaryListing
                ? formatInspectorListingPrice(primaryListing)
                : "-"}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-x-3 border-y border-[#eeeeec] py-2.5">
          <PropertyInspectorFact
            icon={<CircleDollarSign />}
            label="거래"
            value={
              primaryListing
                ? (transactionTypeMeta[primaryListing.transactionType]?.label ??
                  primaryListing.transactionType)
                : "-"
            }
          />
          <PropertyInspectorFact
            icon={<DoorOpen />}
            label="입주"
            value={moveIn.label}
          />
          <PropertyInspectorFact
            icon={<Ruler />}
            label="면적"
            value={formatPropertySheetArea(property)}
          />
          <PropertyInspectorFact
            icon={<Clock3 />}
            label="최근 확인"
            value={
              intake.lastCheckedAt
                ? formatDateShort(intake.lastCheckedAt)
                : "미확인"
            }
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PropertyInspectorState
            label="의뢰 상태"
            value={getIntakeLifecycleLabel(intake.lifecycleStatus)}
            className={getIntakeLifecycleClassName(intake.lifecycleStatus)}
          />
          <PropertyInspectorState
            label="매물 상태"
            value={listingAvailabilityMeta[availability].label}
            className={listingAvailabilityMeta[availability].pillClassName}
          />
          {listings.length > 1 && (
            <span className="text-[11px] text-muted-foreground">
              거래유형 {listings.length}개
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <Button
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            disabled={isConfirming}
            onClick={() => onConfirm(intake.id)}
          >
            {isConfirming ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            확인 완료
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => setIsConsultationOpen(true)}
          >
            <MessageSquare className="size-3.5" />
            상담 기록
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => setIsEditOpen(true)}
          >
            <Pencil className="size-3.5" />
            가격·상태
          </Button>
          {ownerPhone ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              asChild
            >
              <a href={`tel:${ownerPhone}`}>
                <Phone className="size-3.5" />
                소유주 전화
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() => setIsContactOpen(true)}
            >
              <UserPlus className="size-3.5" />
              소유주 등록
            </Button>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          aria-label="매물 상세 구역"
          className="h-10 w-full shrink-0 justify-start gap-5 border-b border-[#e7e5df] px-5 py-0"
        >
          <TabsTrigger
            value="overview"
            className="h-10 flex-none border-0 px-0 text-xs focus-visible:border-0"
          >
            요약
          </TabsTrigger>
          <TabsTrigger
            value="contacts"
            className="h-10 flex-none border-0 px-0 text-xs focus-visible:border-0"
          >
            연락·상담
            {contacts.length + tenants.length + consultations.length > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {contacts.length + tenants.length + consultations.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="h-10 flex-none border-0 px-0 text-xs focus-visible:border-0"
          >
            광고·이력
            {activityCount > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {activityCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="min-h-0 overflow-y-auto px-5 py-4"
        >
          <div className="space-y-6">
            {notices.length > 0 && (
              <PropertyInspectorSection title="지금 확인할 것">
                <div className="divide-y divide-[#eeeeec] border-y border-[#eeeeec]">
                  {notices.map((notice) => (
                    <PropertyInspectorNoticeRow
                      key={`${notice.title}-${notice.detail}`}
                      notice={notice}
                      action={
                        notice.title === "소유주 연락처 없음" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-xs"
                            onClick={() => setIsContactOpen(true)}
                          >
                            등록
                          </Button>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              </PropertyInspectorSection>
            )}

            <PropertyInspectorSection
              title={`가격·거래 조건 ${listings.length}`}
            >
              {listings.length > 0 ? (
                <div className="divide-y divide-[#eeeeec] border-y border-[#eeeeec]">
                  {listings.map((listing) => (
                    <PropertyInspectorListingRow
                      key={listing.id}
                      listing={listing}
                    />
                  ))}
                </div>
              ) : (
                <PropertyInspectorEmptyText text="등록된 거래 조건이 없습니다." />
              )}
            </PropertyInspectorSection>

            {memo && (
              <PropertyInspectorSection title="의뢰 메모">
                <p className="whitespace-pre-wrap border-l-2 border-[#d8d6d0] pl-3 text-[13px] leading-6 text-slate-700">
                  {memo}
                </p>
              </PropertyInspectorSection>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="contacts"
          className="min-h-0 overflow-y-auto px-5 py-4"
        >
          <div className="space-y-6">
            <PropertyInspectorSection
              title={`관련인 ${contacts.length + tenants.length}`}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setIsContactOpen(true)}
                >
                  <UserPlus className="size-3.5" />
                  관련인 추가
                </Button>
              }
            >
              {contacts.length > 0 || tenants.length > 0 ? (
                <div className="divide-y divide-[#eeeeec] border-y border-[#eeeeec]">
                  {contacts.map((contact) => (
                    <PropertyInspectorContactRow
                      key={contact.id}
                      propertyContact={contact}
                    />
                  ))}
                  {tenants.map((tenant) => (
                    <PropertyInspectorTenantRow
                      key={tenant.id}
                      tenant={tenant}
                    />
                  ))}
                </div>
              ) : (
                <PropertyInspectorEmptyText text="등록된 소유주, 대리인, 임차인이 없습니다." />
              )}
            </PropertyInspectorSection>

            <PropertyInspectorSection
              title={`최근 상담 ${consultations.length}`}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setIsConsultationOpen(true)}
                >
                  <Plus className="size-3.5" />
                  상담 기록
                </Button>
              }
            >
              {consultations.length > 0 ? (
                <div className="divide-y divide-[#eeeeec] border-y border-[#eeeeec]">
                  {consultations.map((consultation) => (
                    <PropertyInspectorConsultationRow
                      key={consultation.id}
                      consultation={consultation}
                    />
                  ))}
                </div>
              ) : (
                <PropertyInspectorEmptyText text="상담 기록이 없습니다." />
              )}
            </PropertyInspectorSection>
          </div>
        </TabsContent>

        <TabsContent
          value="activity"
          className="min-h-0 overflow-y-auto px-5 py-4"
        >
          <PropertyInspectorSection title="광고·가격 활동">
            <PropertyInspectorActivityTimeline listings={listings} />
          </PropertyInspectorSection>
        </TabsContent>
      </Tabs>

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
        suggestedContacts={suggestedContacts}
        defaultContact={owner?.contact ?? null}
      />
    </div>
  );
}

function PropertyInspectorFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground [&>svg]:size-3">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className="mt-1 truncate text-[12px] font-medium text-foreground"
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function PropertyInspectorState({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn("rounded-[4px] px-1.5 py-0.5 font-medium", className)}
      >
        {value}
      </span>
    </span>
  );
}

function PropertyInspectorSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex h-7 items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function PropertyInspectorNoticeRow({
  notice,
  action,
}: {
  notice: PropertySheetNotice;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className={cn(
          "mt-1.5 size-1.5 shrink-0 rounded-full",
          notice.tone === "danger" && "bg-[#e03e3e]",
          notice.tone === "warning" && "bg-[#dfab01]",
          notice.tone === "neutral" && "bg-[#9b9a97]",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-foreground">
          {notice.title}
        </div>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
          {notice.detail}
        </p>
      </div>
      {action}
    </div>
  );
}

function PropertyInspectorListingRow({
  listing,
}: {
  listing: PropertyListing;
}) {
  const moveIn = getMoveInAvailability(listing);
  const availability = getListingAvailability(listing);
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <TransactionBadge transactionType={listing.transactionType} />
            <StatusIndicator
              value={availability}
              label={
                availability === ListingAvailability.CLOSED
                  ? getClosedStatusLabel(listing.intake?.closedReason)
                  : undefined
              }
            />
            <JointBrokerageBadge intake={listing.intake} />
          </div>
          <div className="mt-1.5 text-base font-semibold tabular-nums text-foreground">
            {formatInspectorListingPrice(listing)}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] leading-5 text-muted-foreground">
          <div>입주 {moveIn.label}</div>
          <div>수정 {formatDaysAgo(listing.updatedAt)}</div>
        </div>
      </div>
      {listing.memo?.trim() && (
        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {listing.memo.trim()}
        </p>
      )}
    </div>
  );
}

function PropertyInspectorContactRow({
  propertyContact,
}: {
  propertyContact: PropertyContact;
}) {
  const name = propertyContact.contact?.name ?? "이름 없음";
  const phone = propertyContact.contact?.phone;
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{name}</span>
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[10px] text-[#5f5e5b]">
            {getContactRoleLabel(propertyContact.role)}
          </span>
          {propertyContact.isPrimary && (
            <span className="text-[10px] text-[#337ea9]">주 연락처</span>
          )}
        </div>
        <p className="mt-1 truncate text-[12px] text-muted-foreground">
          {phone ?? "전화번호 없음"}
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

function PropertyInspectorTenantRow({ tenant }: { tenant: Tenant }) {
  const name = tenant.contact?.name ?? "이름 없음";
  const phone = tenant.contact?.phone;
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{name}</span>
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[10px] text-[#5f5e5b]">
            임차인
          </span>
          <span className="text-[10px] text-[#8f6b1f]">
            {getTenantStatusLabel(tenant.status)}
          </span>
        </div>
        <p className="mt-1 truncate text-[12px] text-muted-foreground">
          {phone ?? "전화번호 없음"} · {getTenantPeriodLabel(tenant)}
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

function PropertyInspectorConsultationRow({
  consultation,
}: {
  consultation: Consultation;
}) {
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[#5f5e5b]">
          {consultation.type}
        </span>
        <span>{formatDateTime(consultation.createdAt)}</span>
        {consultation.contact?.name && (
          <span>· {consultation.contact.name}</span>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-slate-700">
        {consultation.content}
      </p>
    </div>
  );
}

interface PropertyInspectorActivityItem {
  id: string;
  kind: "price" | "advertisement";
  occurredAt: string | null;
  title: string;
  detail: string;
  note?: string | null;
  url?: string | null;
}

function PropertyInspectorActivityTimeline({
  listings,
}: {
  listings: PropertyListing[];
}) {
  const items = listings
    .flatMap<PropertyInspectorActivityItem>((listing) => [
      ...(listing.priceHistories ?? []).map((history) => ({
        id: `price-${history.id}`,
        kind: "price" as const,
        occurredAt: history.createdAt,
        title: `${transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType} 가격 변경`,
        detail: `${formatPriceHistorySnapshot(listing.transactionType, {
          price: history.priceBefore,
          deposit: history.depositBefore,
          monthlyRent: history.monthlyRentBefore,
        })} → ${formatPriceHistorySnapshot(listing.transactionType, {
          price: history.priceAfter,
          deposit: history.depositAfter,
          monthlyRent: history.monthlyRentAfter,
        })}`,
        note: history.reason,
      })),
      ...(listing.advertisements ?? []).map((advertisement) => ({
        id: `advertisement-${advertisement.id}`,
        kind: "advertisement" as const,
        occurredAt:
          advertisement.lastSyncedAt ??
          advertisement.lastCheckedAt ??
          advertisement.startedAt ??
          advertisement.endedAt ??
          advertisement.updatedAt,
        title: `${getAdChannelLabel(advertisement.channel)} · ${adStatusMeta[advertisement.status]?.label ?? advertisement.status}`,
        detail: `${transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType} ${formatAdvertisementPrice(listing, advertisement)}`,
        note: advertisement.memo,
        url: advertisement.url,
      })),
    ])
    .sort(
      (a, b) =>
        new Date(b.occurredAt ?? 0).getTime() -
        new Date(a.occurredAt ?? 0).getTime(),
    );

  if (items.length === 0) {
    return (
      <PropertyInspectorEmptyText text="광고 또는 가격 변경 이력이 없습니다." />
    );
  }

  return (
    <ol className="border-y border-[#eeeeec]">
      {items.map((item, index) => (
        <li
          key={item.id}
          className={cn(
            "relative flex gap-3 py-3",
            index < items.length - 1 && "border-b border-[#eeeeec]",
          )}
        >
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#f3f3f1] text-muted-foreground">
            {item.kind === "price" ? (
              <CircleDollarSign className="size-3.5" />
            ) : (
              <Megaphone className="size-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-[13px] font-medium text-foreground">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 hover:underline"
                  >
                    <span className="truncate">{item.title}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : (
                  item.title
                )}
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatDateTime(item.occurredAt)}
              </span>
            </div>
            <p className="mt-1 text-[12px] font-medium tabular-nums text-slate-700">
              {item.detail}
            </p>
            {item.note?.trim() && (
              <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                {item.note.trim()}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PropertyInspectorEmptyText({ text }: { text: string }) {
  return (
    <p className="border-y border-[#eeeeec] py-3 text-[12px] text-muted-foreground">
      {text}
    </p>
  );
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

function getIntakeLifecycleLabel(value: IntakeLifecycleStatus) {
  if (value === IntakeLifecycleStatus.OPEN) return "진행";
  if (value === IntakeLifecycleStatus.HOLD) return "보류";
  return "종료";
}

function getIntakeLifecycleClassName(value: IntakeLifecycleStatus) {
  if (value === IntakeLifecycleStatus.OPEN)
    return "bg-[#eef3ed] text-[#44745a]";
  if (value === IntakeLifecycleStatus.HOLD)
    return "bg-[#fbf3db] text-[#9f6b00]";
  return "bg-[#f1f1ef] text-[#787774]";
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
        "inline-flex max-w-full items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5",
        meta.pillClassName,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dotClassName)} />
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
  return listings.length > 1
    ? { minHeight: listings.length * PROPERTY_LISTING_STACK_ITEM_HEIGHT }
    : undefined;
}

function getListingStackItemStyle(listings: ListingSummary[]) {
  return listings.length > 1
    ? { height: PROPERTY_LISTING_STACK_ITEM_HEIGHT }
    : undefined;
}

function triggerStackCellEditor(event: ReactMouseEvent<HTMLTableCellElement>) {
  const target = event.target instanceof Element ? event.target : null;
  const directEditor = target?.closest(".cursor-text");
  const editors = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(".cursor-text"),
  );
  const editor =
    directEditor instanceof HTMLElement &&
    event.currentTarget.contains(directEditor)
      ? directEditor
      : getNearestEditorByY(editors, event.clientY);

  if (!editor) return;

  event.preventDefault();
  event.stopPropagation();
  editor.dispatchEvent(
    new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: event.clientX,
      clientY: event.clientY,
    }),
  );
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
          <TransactionBadge transactionType={listing.transactionType} />
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
      className="flex h-8 min-w-0 items-center gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      <span className={cn("size-[7px] shrink-0 rounded-full", freshness.dot)} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn(
            "truncate text-[12px] font-medium tabular-nums",
            freshness.date,
          )}
        >
          {checkedAt ? formatDateShort(checkedAt) : "-"}
        </span>
        <span className={cn("truncate text-[10.5px]", freshness.relative)}>
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
  onSave: (recordId: string, field: string, value: unknown) => void;
  onPatch: (recordId: string, patch: UpdateListingDto) => void;
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
          <div
            key={listing.id}
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
                  onPatch(recordId, {
                    [field]: parseEditorCellValue(value),
                  } as UpdateListingDto);
                }}
                editType="number"
                activation="doubleClick"
                portalAnchor={hasMultiple ? "self" : "tableCell"}
                editorChrome="floating"
                hoverHighlight={false}
              >
                <span className="flex h-full w-full items-center gap-1.5 px-2.5">
                  {hasMultiple && (
                    <TransactionMiniLabel
                      transactionType={listing.transactionType}
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
                activation="doubleClick"
                portalAnchor={hasMultiple ? "self" : "tableCell"}
                editorChrome="floating"
                hoverHighlight={false}
              >
                <span className="flex h-full w-full items-center gap-1.5 px-2.5">
                  {hasMultiple && (
                    <TransactionMiniLabel
                      transactionType={listing.transactionType}
                    />
                  )}
                  <PriceDepositValue listing={listing} />
                  {isActiveDealListing && (
                    <span className="sr-only">활성 Deal 연결 대상</span>
                  )}
                </span>
              </EditableCell>
            )}
          </div>
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
  onPatch: (recordId: string, patch: UpdateListingDto) => void;
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
        <div
          key={listing.id}
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
                onPatch(recordId, {
                  [field]: parseEditorCellValue(value),
                } as UpdateListingDto);
              }}
              editType="number"
              activation="doubleClick"
              portalAnchor={hasMultiple ? "self" : "tableCell"}
              editorChrome="floating"
              hoverHighlight={false}
            >
              <span className="flex h-full w-full items-center px-2.5">
                <MonthlyRentValue listing={listing} />
              </span>
            </EditableCell>
          ) : (
            <span className="flex h-full w-full items-center px-2.5 text-[13px] text-muted-foreground">
              -
            </span>
          )}
        </div>
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
  onSave: (recordId: string, field: string, value: unknown) => void;
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
        <div
          key={listing.id}
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
              onSave(recordId, savedField, parseEditorCellValue(value));
            }}
            editType="number"
            activation="doubleClick"
            portalAnchor={hasMultiple ? "self" : "tableCell"}
            editorChrome="floating"
            hoverHighlight={false}
          >
            <span className="flex h-full w-full items-center px-2.5 text-sm font-medium tabular-nums">
              {listing[field] ? formatPrice(listing[field] as number) : "-"}
            </span>
          </EditableCell>
        </div>
      ))}
    </div>
  );
}

function PriceDepositValue({ listing }: { listing: ListingSummary }) {
  const value = getListingPrimaryPrice(listing);

  return (
    <span className="tabular-nums text-sm font-medium">
      {value ? formatPrice(value) : "-"}
    </span>
  );
}

function MonthlyRentValue({ listing }: { listing: ListingSummary }) {
  return (
    <span className="tabular-nums text-sm font-medium">
      {listing.monthlyRent ? formatPrice(listing.monthlyRent) : "-"}
    </span>
  );
}

function parseEditorCellValue(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEditorTextValue(value: unknown) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

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
    <Button
      type="button"
      variant={isOpen ? "secondary" : "outline"}
      size="xs"
      aria-expanded={isOpen}
      aria-controls={panelId}
      aria-label={`${count}건의 ${label} ${isOpen ? "접기" : "펼치기"}`}
      title={isOpen ? `${label} 접기` : `${label} 펼치기`}
      onClick={onToggle}
      className="min-w-11 px-1.5 text-[11px] tabular-nums shadow-none"
    >
      {icon}
      {count}
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "size-3 transition-transform duration-150",
          isOpen && "rotate-180",
        )}
      />
    </Button>
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

  if (matchCount === 0) return null;

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
        panelId={`property-match-panel-${group.id}`}
        label="연결 구매고객"
        onToggle={() => onToggle(group.id)}
      />
    </div>
  );
}

function getPropertyMatchCount(group: PropertyListingGroup) {
  return group.listings.reduce(
    (total, listing) => total + (listing._count?.matches ?? 0),
    0,
  );
}

function estimatePropertyMatchPanelHeight(group: PropertyListingGroup) {
  return 76 + Math.max(1, getPropertyMatchCount(group)) * 116;
}

function PropertyMatchPanel({ group }: { group: PropertyListingGroup }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const listingIds = useMemo(
    () => group.listings.map((listing) => listing.id),
    [group.listings],
  );
  const {
    data: matches = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
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
    onSuccess: (_updatedMatch, variables) => {
      toast.success(
        variables.stage === MatchStage.CLOSED
          ? "매칭을 종료했습니다."
          : `${getMatchStageLabel(variables.stage)} 단계로 변경했습니다.`,
      );
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "매칭 단계 변경에 실패했습니다.");
    },
  });

  const memoMutation = useMutation({
    mutationFn: ({ match, memo }: { match: Match; memo: string | null }) =>
      api.matches.updateMemo(match.id, {
        memo,
        expectedUpdatedAt: match.updatedAt,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      toast.success("매칭 메모를 저장했습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "매칭 메모 저장에 실패했습니다.");
    },
  });

  const viewingScheduleMutation = useMutation({
    mutationFn: async ({
      match,
      startLocalValue,
    }: {
      match: Match;
      startLocalValue: string;
    }) => {
      const blockReason = getMatchStageBlockReason(match, MatchStage.VIEWING);
      if (blockReason) throw new Error(blockReason);

      const payload = buildViewingCalendarEventPayload(match, startLocalValue);
      const upcomingViewingEvent = getUpcomingViewingEvent(match);

      if (upcomingViewingEvent) {
        await api.calendarEvents.update(
          upcomingViewingEvent.id,
          toCalendarEventUpdatePayload(payload),
        );
      } else {
        await api.calendarEvents.create(payload);
      }

      if (shouldMoveToViewingOnSchedule(match.stage)) {
        await api.matches.updateStage(match.id, { stage: MatchStage.VIEWING });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("방문 일정을 저장했습니다.");
    },
    onError: (error: Error) => {
      toast.error(`방문 일정 저장에 실패했습니다: ${error.message}`);
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

  const summary = useMemo(
    () =>
      sortedMatches.reduce(
        (counts, match) => {
          const stage = normalizeMatchStage(match.stage);
          if (stage === MatchStage.DEAL_CREATED) counts.converted += 1;
          else if (stage === MatchStage.CLOSED) counts.closed += 1;
          else counts.active += 1;
          return counts;
        },
        { active: 0, converted: 0, closed: 0 },
      ),
    [sortedMatches],
  );

  const handleStageChange = (matchId: string, stage: string) => {
    const match = matches.find((candidate) => candidate.id === matchId);
    if (match) {
      const blockReason = getMatchStageBlockReason(match, stage);
      if (blockReason) {
        toast.error("단계 이동 전 확인이 필요합니다.", {
          description: blockReason,
        });
        return;
      }
    }

    if (stage === MatchStage.DEAL_CREATED) {
      setConvertMatchId(matchId);
      return;
    }

    stageMutation.mutate({ matchId, stage });
  };

  const progressActions: MatchProgressActions = {
    isUpdating: stageMutation.isPending,
    isScheduling: viewingScheduleMutation.isPending,
    onStageChange: handleStageChange,
    onScheduleViewing: (match, startLocalValue) =>
      viewingScheduleMutation.mutate({ match, startLocalValue }),
  };

  const convertMatch =
    matches.find((match) => match.id === convertMatchId) ?? null;

  return (
    <div
      id={`property-match-panel-${group.id}`}
      role="region"
      aria-label={`${group.property?.site?.name ?? "매물"} 연결 구매고객`}
      className="border-b border-border bg-[#fbfbfa] py-3 pl-[60px] pr-4"
    >
      <div className="max-w-[1320px]">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
              <GitBranch className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs tabular-nums">
              <span className="text-[12.5px] font-semibold text-foreground">
                연결 구매고객
              </span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-[10.5px] font-semibold text-muted-foreground">
                {isLoading ? getPropertyMatchCount(group) : matches.length}
              </span>
              {!isLoading && summary.active > 0 && (
                <span className="rounded-md border border-info/25 bg-info-soft px-1.5 py-0.5 font-medium text-info-strong">
                  진행 {summary.active}
                </span>
              )}
              {!isLoading && summary.converted > 0 && (
                <span className="rounded-md border border-success/25 bg-success-soft px-1.5 py-0.5 font-medium text-success">
                  거래 {summary.converted}
                </span>
              )}
              {!isLoading && summary.closed > 0 && (
                <span className="rounded-md border border-destructive/25 bg-destructive-soft px-1.5 py-0.5 font-medium text-destructive-strong">
                  종료 {summary.closed}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 border-border bg-white px-2.5 text-[11.5px] font-semibold text-foreground shadow-none hover:bg-muted"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3" />
            매칭 생성
          </Button>
        </div>

        {isLoading ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            구매고객을 불러오는 중...
          </div>
        ) : isError ? (
          <div className="ml-8 flex h-20 items-center justify-between rounded-lg border border-destructive/20 bg-white px-3.5">
            <span className="text-xs text-destructive">
              연결된 구매고객을 불러오지 못했습니다.
            </span>
            <Button variant="outline" size="xs" onClick={() => void refetch()}>
              다시 시도
            </Button>
          </div>
        ) : sortedMatches.length === 0 ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            연결된 구매고객이 없습니다.
          </div>
        ) : (
          <div
            data-property-match-branch-list
            className="relative ml-8 space-y-1 pl-12"
          >
            <span
              data-property-match-branch-trunk
              aria-hidden="true"
              className="pointer-events-none absolute -top-2 bottom-0 left-0 w-px bg-border"
            />
            {sortedMatches.map((match, index) => (
              <PropertyBuyerMatchLane
                key={match.id}
                match={match}
                isLast={index === sortedMatches.length - 1}
                actions={progressActions}
                isSavingMemo={
                  memoMutation.isPending &&
                  memoMutation.variables?.match.id === match.id
                }
                onSaveMemo={(memo) =>
                  memoMutation
                    .mutateAsync({ match, memo })
                    .then(() => undefined)
                }
              />
            ))}
          </div>
        )}
      </div>

      <MatchCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        matches={matches}
      />

      <MatchConvertDialog
        match={convertMatch}
        open={convertMatchId !== null}
        onOpenChange={(open) => {
          if (!open) setConvertMatchId(null);
        }}
      />
    </div>
  );
}

function PropertyBuyerMatchLane({
  match,
  isLast,
  actions,
  isSavingMemo,
  onSaveMemo,
}: {
  match: Match;
  isLast: boolean;
  actions: MatchProgressActions;
  isSavingMemo: boolean;
  onSaveMemo: (memo: string | null) => Promise<void>;
}) {
  const buyer = match.buyerRequirement;
  const buyerName = buyer?.contact?.name ?? "구매자 미상";
  const buyerPhone = buyer?.contact?.phone;
  const areaLabel = formatBuyerArea(buyer);
  const requirementNote = formatBuyerRequirementNote(buyer, null);
  const upcomingViewingEvent = getUpcomingViewingEvent(match);
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState(match.memo ?? "");
  const saveInFlightRef = useRef(false);
  const skipBlurSaveRef = useRef(false);

  const startMemoEdit = () => {
    skipBlurSaveRef.current = false;
    setMemoDraft(match.memo ?? "");
    setIsEditingMemo(true);
  };

  const cancelMemoEdit = () => {
    if (saveInFlightRef.current) return;
    skipBlurSaveRef.current = true;
    setMemoDraft(match.memo ?? "");
    setIsEditingMemo(false);
  };

  const saveMemo = async () => {
    if (saveInFlightRef.current) return;

    const nextMemo = memoDraft.trim();
    if (nextMemo === (match.memo?.trim() ?? "")) {
      skipBlurSaveRef.current = true;
      setIsEditingMemo(false);
      return;
    }

    saveInFlightRef.current = true;
    try {
      await onSaveMemo(nextMemo || null);
      skipBlurSaveRef.current = true;
      setIsEditingMemo(false);
    } catch {
      // mutation이 오류를 안내하며 입력 상태는 재시도를 위해 유지한다.
    } finally {
      saveInFlightRef.current = false;
    }
  };

  return (
    <article
      data-property-match-branch
      className="relative grid gap-3 rounded-md px-2 py-2.5 hover:bg-muted/30 xl:grid-cols-[minmax(260px,320px)_minmax(620px,1fr)_auto] xl:items-center"
    >
      {isLast && (
        <span
          data-property-match-branch-end
          aria-hidden="true"
          className="pointer-events-none absolute -left-12 bottom-0 top-[calc(50%_-_32px)] z-[1] w-0.5 bg-[#fbfbfa]"
        />
      )}
      <svg
        data-property-match-branch-connector
        aria-hidden="true"
        viewBox="0 0 48 64"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -left-12 top-1/2 z-[2] h-16 w-12 -translate-y-1/2 overflow-visible text-border"
      >
        <path
          d="M0 0C0 18 14 32 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {buyer ? (
            <Link
              to="/buyer-requirements/$id"
              params={{ id: buyer.id }}
              className="min-w-0 truncate text-[13px] font-semibold text-foreground hover:underline"
            >
              {buyerName}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
              {buyerName}
            </span>
          )}
          {buyer?.transactionType && (
            <StatusBadge
              kind="transactionType"
              status={buyer.transactionType}
              size="sm"
            />
          )}
          {buyer?.urgency && (
            <StatusBadge kind="buyerUrgency" status={buyer.urgency} size="sm" />
          )}
          {normalizeMatchStage(match.stage) === MatchStage.CLOSED && (
            <span className="rounded-md border border-destructive/25 bg-destructive-soft px-1.5 py-0.5 text-xs font-medium text-destructive-strong">
              종료
            </span>
          )}
          {normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED && (
            <span className="rounded-md border border-success/25 bg-success-soft px-1.5 py-0.5 text-xs font-medium text-success">
              거래 전환
            </span>
          )}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {buyerPhone ? formatPhoneNumber(buyerPhone) : "연락처 없음"}
            {buyer?.assignedTo?.name ? ` · 담당 ${buyer.assignedTo.name}` : ""}
          </span>
        </div>
        <dl className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <div className="flex min-w-0 items-baseline gap-1">
            <dt className="shrink-0 text-muted-foreground">예산</dt>
            <dd className="truncate font-semibold tabular-nums text-foreground">
              {formatBuyerBudget(buyer)}
            </dd>
          </div>
          {areaLabel && (
            <div className="flex min-w-0 items-baseline gap-1">
              <dt className="shrink-0 text-muted-foreground">면적</dt>
              <dd className="truncate font-medium tabular-nums text-foreground">
                {areaLabel}
              </dd>
            </div>
          )}
          {buyer?.moveInDate && (
            <div className="flex min-w-0 items-baseline gap-1">
              <dt className="shrink-0 text-muted-foreground">입주</dt>
              <dd className="truncate font-medium text-foreground">
                {formatDateShort(buyer.moveInDate)}
              </dd>
            </div>
          )}
        </dl>
        {requirementNote && (
          <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
            조건 · {requirementNote}
          </p>
        )}
      </div>

      <div className="min-w-0 overflow-x-auto">
        <MatchProgressTrack match={match} actions={actions} />
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          {isEditingMemo ? (
            <Input
              autoFocus
              aria-label={`${buyerName} 매칭 메모`}
              value={memoDraft}
              placeholder="메모 입력"
              title="Enter 저장 · Esc 취소"
              className="h-7 min-w-0 flex-1 px-2 py-0 text-xs shadow-none"
              disabled={isSavingMemo}
              onChange={(event) => setMemoDraft(event.target.value)}
              onBlur={() => {
                if (skipBlurSaveRef.current) {
                  skipBlurSaveRef.current = false;
                  return;
                }
                void saveMemo();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelMemoEdit();
                  return;
                }
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void saveMemo();
                }
              }}
            />
          ) : (
            <button
              type="button"
              data-property-match-memo-trigger
              aria-label={`${buyerName} 매칭 메모 편집`}
              title="클릭하여 메모 편집"
              className="group/memo flex min-h-6 min-w-0 flex-1 items-center gap-1 rounded-sm px-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={startMemoEdit}
            >
              <span
                className={cn(
                  "line-clamp-1",
                  !match.memo?.trim() && "italic text-muted-foreground/70",
                )}
              >
                {match.memo?.trim() || "메모 추가"}
              </span>
              <Pencil
                aria-hidden="true"
                className="size-3 shrink-0 opacity-0 group-hover/memo:opacity-100 group-focus-visible/memo:opacity-100"
              />
            </button>
          )}
          <span
            role="status"
            aria-live="polite"
            className="shrink-0 tabular-nums"
          >
            {isSavingMemo
              ? "저장 중…"
              : upcomingViewingEvent
                ? `방문 ${formatViewingEventTime(upcomingViewingEvent)}`
                : `${formatDateShort(match.updatedAt)} 수정`}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        {buyerPhone && (
          <Button
            variant="outline"
            size="icon-sm"
            className="size-7 shrink-0 shadow-none"
            asChild
          >
            <a
              href={`tel:${buyerPhone}`}
              aria-label={`${buyerName} ${formatPhoneNumber(buyerPhone)} 전화`}
            >
              <Phone className="size-3.5" />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}

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
  if (min && max && min !== max)
    return `${formatMoney(min)} ~ ${formatMoney(max)}`;
  return formatMoney(max ?? min).replace("—", "-");
}

function formatBuyerArea(buyer?: BuyerRequirement) {
  if (!buyer) return null;
  const min = buyer.areaMin ? formatAreaPyeong(buyer.areaMin) : null;
  const max = buyer.areaMax ? formatAreaPyeong(buyer.areaMax) : null;
  if (min && max && min !== max) return `${min} ~ ${max}`;
  return max ?? min;
}

function formatBuyerRequirementNote(
  buyer: BuyerRequirement | undefined,
  matchMemo: string | null,
) {
  return matchMemo?.trim() || buyer?.memo?.trim() || null;
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

  if (adCount === 0) return null;

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
        panelId={`property-ad-panel-${group.id}`}
        label="광고 현황"
        onToggle={() => onToggle(group.id)}
      />
    </div>
  );
}

function estimatePropertyAdPanelHeight(group: PropertyListingGroup) {
  return 72 + Math.max(1, getPropertyAdRows(group).length) * 44;
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

function PropertyAdPanel({ group }: { group: PropertyListingGroup }) {
  const adRows = getPropertyAdRows(group);
  const activeAdvertisementCount = getPropertyActiveAdvertisementCount(group);

  return (
    <div
      id={`property-ad-panel-${group.id}`}
      role="region"
      aria-label={`${group.property?.site?.name ?? "매물"} 광고 현황`}
      className="border-b border-border bg-[#f3f9fb] py-3 pl-[60px] pr-4"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Megaphone className="size-3.5 text-[#337ea9]" />
        <span className="text-xs font-semibold text-[#337ea9]">
          광고 노출 {activeAdvertisementCount}개
        </span>
        <span className="text-[11.5px] text-[#6b9fba]">· CP사별 현황</span>
      </div>

      {adRows.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 광고가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[650px] max-w-[760px]">
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

            <div className="flex flex-col gap-1.5">
              {adRows.map(({ listing, advertisement }) => {
                const statusMeta =
                  adStatusMeta[advertisement.status] ?? adStatusMeta.active;
                const advertisedPrice =
                  advertisement.advertisedPrice ??
                  advertisement.advertisedDeposit;

                return (
                  <div
                    key={advertisement.id}
                    className="flex items-center gap-1.5 rounded-lg border border-[#d8ebf3] bg-white px-3 py-2"
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
                      <span
                        className={cn(
                          "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-5",
                          statusMeta.className,
                        )}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className="w-[130px] shrink-0 truncate text-[12.5px] font-medium tabular-nums text-foreground">
                      {advertisedPrice != null
                        ? formatPrice(advertisedPrice)
                        : "-"}
                    </div>
                    <div className="w-[90px] shrink-0 truncate text-[12.5px] tabular-nums text-foreground/70">
                      {advertisement.advertisedMonthlyRent != null
                        ? formatPrice(advertisement.advertisedMonthlyRent)
                        : "-"}
                    </div>
                    <div className="w-[72px] shrink-0 truncate text-[12.5px] tabular-nums text-foreground/70">
                      {formatDateShort(advertisement.startedAt)}
                    </div>
                    {advertisement.url && (
                      <a
                        href={advertisement.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-[#337ea9] hover:underline"
                      >
                        원문 보기
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntakeMemoCell({
  intake,
  onSave,
}: {
  intake: PropertyListingGroup["representative"];
  onSave: (intakeId: string, value: unknown) => void;
}) {
  const value = intake.memo?.trim();
  return (
    <EditableCell
      recordId={intake.id}
      field="memo"
      value={intake.memo}
      onSave={(recordId, _field, newValue) => {
        onSave(recordId, newValue);
      }}
      editType="text"
      activation="doubleClick"
      portalAnchor="tableCell"
      editorChrome="floating"
      hoverHighlight={false}
    >
      <span className="line-clamp-2 min-w-0 text-[13px] leading-4 text-slate-600">
        {value || <span className="text-slate-400">-</span>}
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
  onPatch: (recordId: string, patch: UpdateListingDto) => void;
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
        <div
          key={listing.id}
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
              onPatch(recordId, { [field]: value } as UpdateListingDto);
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
              onPatch(recordId, patch);
            }}
            editType="select-chip"
            chipOptions={moveInAvailableChipOptions}
          >
            <span className="flex h-full w-full items-center gap-1.5 px-2.5">
              <MoveInAvailableSummary listing={listing} />
            </span>
          </EditableCell>
        </div>
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
  const transactionMeta = transactionTypeMeta[transactionType];
  return (
    <span
      className={cn(
        "inline-flex max-w-full rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5",
        transactionMeta?.className ?? "bg-[#f1f1ef] text-[#787774]",
      )}
    >
      {transactionMeta?.label ?? transactionType}
    </span>
  );
}

function TransactionMiniLabel({
  transactionType,
}: {
  transactionType: string;
}) {
  const transactionMeta = transactionTypeMeta[transactionType];
  return (
    <span
      className={cn(
        "inline-flex min-w-8 justify-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5",
        transactionMeta?.className ?? "bg-[#f1f1ef] text-[#787774]",
      )}
    >
      {transactionMeta?.label ?? transactionType}
    </span>
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

function FilterPopoverChip({
  label,
  value,
  active,
  tier = 2,
  open,
  onOpenChange,
  onClear,
  contentClassName,
  children,
}: {
  label: string;
  value: string;
  active?: boolean;
  /** 사용 빈도 기반 시각 계층. 1 = 강조(항상 테두리), 2 = 기본, 3 = 약화(작고 옅게). */
  tier?: 1 | 2 | 3;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 활성 상태에서 X 한 번으로 이 필터만 해제. */
  onClear?: () => void;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 max-w-[240px] gap-1.5 rounded-md border border-border bg-white text-xs shadow-none",
            onClear && active ? "pl-2.5 pr-1.5" : "px-2.5",
            // 활성: 강한 inverse (모노톤)
            active &&
              "border-foreground/25 bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.09]",
            // 비활성 + tier별 weight
            !active &&
              tier === 1 &&
              "text-foreground hover:border-foreground/40 hover:bg-white",
            !active &&
              tier === 2 &&
              "text-muted-foreground hover:border-foreground/30 hover:bg-white",
            !active &&
              tier === 3 &&
              "text-muted-foreground/80 hover:border-foreground/30 hover:bg-white",
          )}
        >
          <span
            className={cn(
              "shrink-0",
              active ? "text-muted-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              "min-w-0 truncate",
              active
                ? "font-semibold text-foreground"
                : "font-medium text-foreground",
            )}
          >
            {value}
          </span>
          {onClear && active ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`${label} 필터 해제`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClear();
              }}
              className="ml-0.5 inline-flex shrink-0 items-center justify-center rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="size-3" />
            </span>
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-80 p-3", contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function PopoverTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
        {description}
      </p>
    </div>
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

function NumericRangeFilterPanel({
  ariaLabel,
  title,
  description,
  initialRange,
  min,
  max,
  step,
  presets,
  tickLabels,
  formatLabel,
  thumbLabels,
  onApply,
  onClear,
  onCancel,
}: {
  ariaLabel: string;
  title: string;
  description: string;
  initialRange: [number, number];
  min: number;
  max: number;
  step: number;
  presets: NumericRangePreset[];
  tickLabels: string[];
  formatLabel: (min: number, max: number) => string;
  thumbLabels: [string, string];
  onApply: (range: [number, number]) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const segments = presets.filter((preset) => !preset.isAll);
  const [draftRange, setDraftRange] = useState<[number, number]>(initialRange);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [selectedPresetSpan, setSelectedPresetSpan] = useState<
    [number, number] | null
  >(() => getNumericPresetSpan(initialRange, segments));
  const isFullRange = draftRange[0] === min && draftRange[1] === max;

  const handleSliderChange = (value: number[]) => {
    const nextRange: [number, number] = [value[0] ?? min, value[1] ?? max];
    setDraftRange(nextRange);
    setRangeAnchor(null);
    setSelectedPresetSpan(getNumericPresetSpan(nextRange, segments));
  };

  const handlePresetClick = (preset: NumericRangePreset) => {
    if (preset.isAll) {
      setDraftRange([min, max]);
      setRangeAnchor(null);
      setSelectedPresetSpan(null);
      return;
    }

    const presetIndex = segments.indexOf(preset);
    if (presetIndex < 0) return;

    if (rangeAnchor === null) {
      setDraftRange([preset.min, preset.max]);
      setRangeAnchor(presetIndex);
      setSelectedPresetSpan([presetIndex, presetIndex]);
      return;
    }

    const spanStart = Math.min(rangeAnchor, presetIndex);
    const spanEnd = Math.max(rangeAnchor, presetIndex);
    const startPreset = segments[spanStart];
    const endPreset = segments[spanEnd];
    if (!startPreset || !endPreset) return;

    setDraftRange([startPreset.min, endPreset.max]);
    setRangeAnchor(null);
    setSelectedPresetSpan([spanStart, spanEnd]);
  };

  return (
    <div aria-label={ariaLabel}>
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {description}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${title} 필터 닫기`}
          onClick={onCancel}
          className="-mr-1 text-muted-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="px-[18px] pb-[14px] pt-[18px]">
        <div className="mb-[18px] text-center text-[21px] font-bold tracking-[-0.025em] text-foreground">
          {formatLabel(draftRange[0], draftRange[1])}
        </div>

        <div className="mb-2 px-2">
          <Slider
            min={min}
            max={max}
            step={step}
            minStepsBetweenThumbs={0}
            value={draftRange}
            onValueChange={handleSliderChange}
            aria-label={`${title} 범위`}
            thumbLabels={thumbLabels}
            className="[&_[data-slot=slider-range]]:bg-foreground [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-[1.5px] [&_[data-slot=slider-thumb]]:border-foreground [&_[data-slot=slider-thumb]]:bg-background [&_[data-slot=slider-thumb]]:shadow-md [&_[data-slot=slider-thumb]]:hover:ring-0 [&_[data-slot=slider-track]]:h-1"
          />
          <div className="mt-3 flex justify-between text-[10px] tabular-nums text-muted-foreground/70">
            {tickLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>

        <div
          className="mt-3 grid grid-cols-4 border-l border-t"
          role="group"
          aria-label={`${title} 빠른 선택`}
        >
          {presets.map((preset) => {
            const segmentIndex = preset.isAll ? -1 : segments.indexOf(preset);
            const isAllPreset = Boolean(preset.isAll);
            const isInSelectedSpan =
              !isAllPreset &&
              selectedPresetSpan !== null &&
              segmentIndex >= selectedPresetSpan[0] &&
              segmentIndex <= selectedPresetSpan[1];
            const isSpanEdge =
              isInSelectedSpan &&
              selectedPresetSpan !== null &&
              (segmentIndex === selectedPresetSpan[0] ||
                segmentIndex === selectedPresetSpan[1]);
            const isAllSelected =
              isAllPreset && selectedPresetSpan === null && isFullRange;
            const isSelected = isInSelectedSpan || isAllSelected;
            return (
              <Button
                key={preset.label}
                type="button"
                variant={isSpanEdge || isAllSelected ? "default" : "ghost"}
                size="sm"
                aria-pressed={isSelected}
                data-range-state={
                  isSelected
                    ? isSpanEdge || isAllSelected
                      ? "edge"
                      : "inside"
                    : "off"
                }
                onClick={() => handlePresetClick(preset)}
                className={cn(
                  "h-8 rounded-none border-b border-r px-1 text-[11px] shadow-none",
                  isInSelectedSpan &&
                    !isSpanEdge &&
                    "bg-muted text-foreground hover:bg-muted hover:text-foreground",
                  !isSelected &&
                    "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>

        <div className="mt-[13px] flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="-ml-2 px-2 text-[11px] font-normal text-muted-foreground"
          >
            <Trash2 className="size-3.5" />
            조건 삭제
          </Button>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-[11px]"
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onApply(draftRange)}
              className="text-[11px]"
            >
              적용
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(base: Date, months: number) {
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}

function DateRangeFilter({
  fromValue,
  toValue,
  onFromChange,
  onToChange,
}: {
  fromValue: string;
  toValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  // 입주 가능 시작일이 "지금부터 N개월 내"인 매물로 좁히는 빠른 옵션.
  const applyWithin = (months: number) => {
    const today = new Date();
    onFromChange(toISODate(today));
    onToChange(toISODate(addMonths(today, months)));
  };
  const withinOptions = [
    { label: "1개월 내", months: 1 },
    { label: "3개월 내", months: 3 },
    { label: "6개월 내", months: 6 },
  ];

  return (
    <FilterField label="입주가능일">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {withinOptions.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => applyWithin(option.months)}
            className="h-7 rounded-full border border-border bg-white px-2.5 text-[12px] text-foreground transition-colors hover:bg-muted"
          >
            {option.label}
          </button>
        ))}
        {(fromValue || toValue) && (
          <button
            type="button"
            onClick={() => {
              onFromChange("");
              onToChange("");
            }}
            className="h-7 rounded-full px-2.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            지우기
          </button>
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <Input
          type="date"
          value={fromValue}
          onChange={(event) => onFromChange(event.target.value)}
          className="h-8 bg-white px-2 text-[13px]"
        />
        <span className="text-xs text-slate-400">~</span>
        <Input
          type="date"
          value={toValue}
          onChange={(event) => onToChange(event.target.value)}
          className="h-8 bg-white px-2 text-[13px]"
        />
      </div>
    </FilterField>
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

function getNumericPresetSpan(
  range: [number, number],
  segments: NumericRangePreset[],
): [number, number] | null {
  if (segments.length === 0) return null;
  if (
    range[0] === segments[0]?.min &&
    range[1] === segments[segments.length - 1]?.max
  ) {
    return null;
  }

  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    if (segments[startIndex]?.min !== range[0]) continue;

    for (let endIndex = startIndex; endIndex < segments.length; endIndex += 1) {
      if (segments[endIndex]?.max === range[1]) return [startIndex, endIndex];
    }
  }

  return null;
}

function formatPriceRangeLabel(min: number, max: number) {
  if (min <= PRICE_RANGE_MIN && max >= PRICE_RANGE_MAX) return "전체 가격";
  if (min <= PRICE_RANGE_MIN) return `${formatRangeNumber(max)}억 이하`;
  if (max >= PRICE_RANGE_MAX) return `${formatRangeNumber(min)}억 이상`;
  if (min === max) return `${formatRangeNumber(min)}억`;
  return `${formatRangeNumber(min)}억–${formatRangeNumber(max)}억`;
}

function formatNumericRangeLabel(
  min: number,
  max: number,
  rangeMin: number,
  rangeMax: number,
  unit: string,
  fullRangeLabel: string,
) {
  if (min <= rangeMin && max >= rangeMax) return fullRangeLabel;
  if (min <= rangeMin) return `${formatRangeNumber(max)}${unit} 이하`;
  if (max >= rangeMax) return `${formatRangeNumber(min)}${unit} 이상`;
  if (min === max) return `${formatRangeNumber(min)}${unit}`;
  return `${formatRangeNumber(min)}${unit}–${formatRangeNumber(max)}${unit}`;
}

function clampPriceRange(value: number) {
  return Math.min(PRICE_RANGE_MAX, Math.max(PRICE_RANGE_MIN, value));
}

function clampNumericRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatRangeNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
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

function getPropertyMapUnitLabel(property?: ListingProperty) {
  if (!property?.unit) return "";
  return [getDongName(property), property.unit.name]
    .filter((item) => item && item !== "-")
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

function getAdChannelLabel(channel: string) {
  return adChannelLabels[channel] ?? channel;
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
    return `전용 ${formatAreaPyeong(exclusive)} · 공급 ${formatAreaPyeong(supply)}`;
  }
  if (exclusive) return `전용 ${formatAreaPyeong(exclusive)}`;
  if (supply) return `공급 ${formatAreaPyeong(supply)}`;
  return "-";
}

function getLatestPropertyListingUpdatedAt(property: Property) {
  const latestListingUpdatedAt = (property.listings ?? []).reduce<
    string | null
  >((latest, listing) => {
    if (!latest) return listing.updatedAt;
    return new Date(listing.updatedAt).getTime() > new Date(latest).getTime()
      ? listing.updatedAt
      : latest;
  }, null);

  return latestListingUpdatedAt ?? property.updatedAt;
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

  const hasAnyListingMemo = listings.some((listing) => listing.memo?.trim());
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

function formatDateShort(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function formatTransactionTypeList(
  listings: Pick<PropertyListing, "transactionType">[],
) {
  const labels = Array.from(
    new Set(
      listings.map(
        (listing) =>
          transactionTypeMeta[listing.transactionType]?.label ??
          listing.transactionType,
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
      const transactionLabel =
        transactionTypeMeta[listing.transactionType]?.label ??
        listing.transactionType;
      return listing.intake?.jointBrokeragePartner?.name
        ? `${transactionLabel} ${listing.intake.jointBrokeragePartner.name}`
        : `${transactionLabel} 파트너 미지정`;
    })
    .join(", ");
}

function formatAreaPyeong(value?: number | null, fractionDigits = 1) {
  if (!value) return "-";
  const squareMeters = Number(value);
  return `${(squareMeters * 0.3025).toFixed(fractionDigits)}평`;
}
