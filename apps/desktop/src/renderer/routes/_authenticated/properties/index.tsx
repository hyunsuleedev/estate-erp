import { createFileRoute, Link } from '@tanstack/react-router';
import { keepPreviousData, useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Fragment,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
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
  Minus,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  Tag,
  Trash2,
  Type,
  UserRound,
  X,
} from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { api } from '@/lib/api';
import { ApiError } from '@estate-erp/api-client';
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
} from '@estate-erp/api-client';
import {
  formatPrice,
  IntakeClosedReason,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
} from '@estate-erp/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { StatusBadge } from '@/components/domain';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/contacts';
import { formatMoney } from '@/lib/format';
import { getStatusMeta, PIPELINE_STEPS } from '@/lib/status-config';
import {
  PriceCell,
  CellEditProvider,
  EditableCell,
  type SortDefinition,
  type ChipOption,
} from '@/components/data-table';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import {
  getIntakeConfirmationState,
  getListingAvailability,
  getListingRowAvailability,
  planListingStatusChange,
} from '@/lib/listing-status';
import { getMoveInAvailability } from './-property-list-view-utils';
import {
  PropertyListingsTable,
  type ListingSummary,
  type PropertyListingGroup,
} from './-components/property-listings-table';
import {
  buildPropertyMapClustersFromOffsets,
  removePropertyMapListeners,
  type PropertyMapClusterSource,
} from './-property-map-utils';
import {
  ListingCostSummary,
  PropertyBulkActions,
  PropertyRowActions,
  type ListingCostExtras,
} from './-property-intake-actions';
import { MatchCreateDialog } from '../matches/-match-create-dialog';

// ── Labels & Colors ─────────────────────────────────────────────

const listingAvailabilityMeta: Record<
  ListingAvailability,
  { label: string; dotClassName: string; pillClassName: string }
> = {
  [ListingAvailability.AVAILABLE]: {
    label: '가용',
    dotClassName: 'bg-[#6c9b7a]',
    pillClassName: 'bg-[#eef3ed] text-[#44745a]',
  },
  [ListingAvailability.PAUSED]: {
    label: '보류',
    dotClassName: 'bg-[#dfab01]',
    pillClassName: 'bg-[#fbf3db] text-[#9f6b00]',
  },
  [ListingAvailability.IN_CONTRACT]: {
    label: '거래중',
    dotClassName: 'bg-[#529cca]',
    pillClassName: 'bg-[#e7f3f8] text-[#337ea9]',
  },
  [ListingAvailability.CLOSED]: {
    label: '종료',
    dotClassName: 'bg-[#b4b4b1]',
    pillClassName: 'bg-[#f1f1ef] text-[#787774]',
  },
};

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-[#fdebec] text-[#8f4b46]' },
  jeonse: { label: '전세', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  monthly: { label: '월세', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
};

// 웹의 합성 매물상태를 사용하되 pill 색상은 데스크톱 팔레트를 유지한다.
const listingAvailabilityChipOptions: ChipOption[] = Object.entries(listingAvailabilityMeta).map(([value, meta]) => ({
  value,
  label: meta.label,
  className: meta.pillClassName,
}));

const adStatusMeta: Record<string, { label: string; className: string }> = {
  planned: { label: '보류', className: 'bg-[#f1f1ef] text-[#5f5e5b]' },
  draft: { label: '준비', className: 'bg-[#f1f1ef] text-[#787774]' },
  active: { label: '광고중', className: 'bg-[#eef3ed] text-[#44745a]' },
  paused: { label: '중단', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
  ended: { label: '종료', className: 'bg-[#f1f1ef] text-[#787774]' },
  error: { label: '오류', className: 'bg-[#fbe4e4] text-[#9f5555]' },
};

const adChannelLabels: Record<string, string> = {
  naver: '네이버',
  asil: '아실',
  zigbang: '직방',
  dabang: '다방',
  hanbang: '한방',
  etc: '기타',
};

const contactRoleLabels: Record<string, string> = {
  owner: '소유주',
  co_owner: '공동소유',
  representative: '대리인',
  lawyer: '법무사',
  tax_agent: '세무사',
};

// 정렬은 표 헤더 클릭으로 처리. 헤더 라벨 매핑만 유지.
const sortDefinitions = [
  { field: 'price', label: '가격' },
  { field: 'createdAt', label: '등록일' },
  { field: 'updatedAt', label: '확인' },
];

const LISTINGS_PAGE_SIZE = 50;
const PROPERTY_QUICK_SHEET_OPEN_DURATION_MS = 280;
const PROPERTY_QUICK_SHEET_CONTENT_DELAY_MS = PROPERTY_QUICK_SHEET_OPEN_DURATION_MS + 20;
const MATCH_STAGE_STEPS = PIPELINE_STEPS.matchStage ?? [];

function getMatchStageIndex(stage: string) {
  return MATCH_STAGE_STEPS.indexOf(stage);
}

const listingAvailabilityFilterOptions: MultiSelectOption[] = Object.entries(listingAvailabilityMeta).map(
  ([value, meta]) => ({
    value,
    label: meta.label,
  }),
);
const NAVER_MAPS_NCP_KEY_ID = import.meta.env.VITE_NAVER_MAPS_NCP_KEY_ID as string | undefined;

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
    addListener: (target: unknown, eventName: string, handler: () => void) => unknown;
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
    toast.error('다른 사용자가 먼저 수정했습니다. 최신 내용으로 다시 불러옵니다.');
    return;
  }

  toast.error('저장에 실패했습니다.');
}
const PROPERTY_LISTING_STACK_ITEM_HEIGHT = 40;
const PROPERTY_MAP_CLUSTER_GRID_SIZE = 84;
const PROPERTY_MAP_CLUSTER_MAX_ZOOM = 17;

const transactionTypeOptions = [
  { value: 'all', label: '전체' },
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
] as const;

const siteTypeOptions: MultiSelectOption[] = [
  { value: 'apartment', label: '아파트' },
  { value: 'officetel', label: '오피스텔' },
  { value: 'villa', label: '빌라' },
  { value: 'house', label: '단독/다가구' },
  { value: 'commercial', label: '상가' },
  { value: 'land', label: '토지' },
  { value: 'living_accommodation', label: '생활숙박' },
] as const;

const advertisementFilterOptions = [
  { value: 'all', label: '광고 전체' },
  { value: 'with', label: '광고 있음' },
  { value: 'without', label: '광고 없음' },
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
  { label: '~5억', min: 0, max: 5 },
  { label: '5억대', min: 5, max: 10 },
  { label: '10억대', min: 10, max: 15 },
  { label: '15억대', min: 15, max: 20 },
  { label: '20억대', min: 20, max: 25 },
  { label: '25억대', min: 25, max: 30 },
  { label: '30억~', min: 30, max: 30 },
  { label: '전체', min: 0, max: 30, isAll: true },
];

const MONTHLY_RENT_RANGE_MIN = 0;
const MONTHLY_RENT_RANGE_MAX = 600;
const MONTHLY_RENT_RANGE_PRESETS: NumericRangePreset[] = [
  { label: '~100만', min: 0, max: 100 },
  { label: '100만대', min: 100, max: 200 },
  { label: '200만대', min: 200, max: 300 },
  { label: '300만대', min: 300, max: 400 },
  { label: '400만대', min: 400, max: 500 },
  { label: '500만대', min: 500, max: 600 },
  { label: '600만~', min: 600, max: 600 },
  { label: '전체', min: 0, max: 600, isAll: true },
];

const AREA_RANGE_MIN = 0;
const AREA_RANGE_MAX = 80;
const AREA_RANGE_PRESETS: NumericRangePreset[] = [
  { label: '~10평', min: 0, max: 10 },
  { label: '10평대', min: 10, max: 20 },
  { label: '20평대', min: 20, max: 30 },
  { label: '30평대', min: 30, max: 40 },
  { label: '40평대', min: 40, max: 50 },
  { label: '50평대', min: 50, max: 60 },
  { label: '60평대', min: 60, max: 70 },
  { label: '70평~', min: 70, max: 80 },
];

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
  moveInFrom: string;
  moveInTo: string;
  advertisement: 'all' | 'with' | 'without';
}

const initialPropertyFilters: PropertyFilterState = {
  siteIds: [],
  provinceCode: '',
  districtCode: '',
  wardCode: '',
  dongSearch: '',
  unitSearch: '',
  siteTypes: [],
  availabilities: [],
  priceMin: '',
  priceMax: '',
  depositMin: '',
  depositMax: '',
  monthlyRentMin: '',
  monthlyRentMax: '',
  areaMin: '',
  areaMax: '',
  moveInFrom: '',
  moveInTo: '',
  advertisement: 'all',
};

type ListingProperty = NonNullable<ListingIntake['property']>;
type PropertyViewMode = 'list' | 'map';
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

type PropertySheetNoticeTone = 'danger' | 'warning' | 'neutral';

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

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/properties/')({
  component: PropertiesPage,
});

function PropertiesPage() {
  const queryClient = useQueryClient();
  const openTab = useTabStore((s) => s.openTab);

  // ── State ─────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedTransactionType, setSelectedTransactionType] =
    useState<(typeof transactionTypeOptions)[number]['value']>('all');
  const [propertyFilters, setPropertyFilters] = useState<PropertyFilterState>(initialPropertyFilters);
  const [selectedIntakeId, setSelectedIntakeId] = useState<string | null>(null);
  const [startDealPrompt, setStartDealPrompt] = useState<StartDealPrompt | null>(null);
  const [resumeClosedPrompt, setResumeClosedPrompt] = useState<ResumeClosedPrompt | null>(null);
  const [viewMode, setViewMode] = useState<PropertyViewMode>('list');
  const [expandedAdRows, setExpandedAdRows] = useState<ReadonlySet<string>>(() => new Set());
  const [expandedMatchRows, setExpandedMatchRows] = useState<ReadonlySet<string>>(() => new Set());
  const [arePropertyDetailColumnsCollapsed, setArePropertyDetailColumnsCollapsed] = useState(true);
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
  const debouncedDongSearch = useDebouncedValue(propertyFilters.dongSearch, 300);
  const debouncedUnitSearch = useDebouncedValue(propertyFilters.unitSearch, 300);

  const { data: filterSites = [], isLoading: isFilterSitesLoading } = useQuery({
    queryKey: ['listings', 'filter-sites'],
    queryFn: () => api.listings.filterSites(),
    staleTime: 5 * 60_000,
  });

  const siteFilterOptions = useMemo<MultiSelectOption[]>(
    () =>
      filterSites
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        .map((site) => ({
          value: site.id,
          label: site.name,
          description: site.roadAddress ?? site.jibunAddress ?? getSiteTypeLabel(site.type),
          meta: `${site.propertyCount.toLocaleString()}건`,
        })),
    [filterSites],
  );
  const { data: provinces = [] } = useQuery({
    queryKey: ['regions', 'provinces'],
    queryFn: () => api.regions.findProvinces(),
    staleTime: 24 * 60_000,
  });
  const { data: districts = [] } = useQuery({
    queryKey: ['regions', 'districts', propertyFilters.provinceCode],
    queryFn: () => api.regions.findDistricts(propertyFilters.provinceCode || undefined),
    enabled: Boolean(propertyFilters.provinceCode),
    staleTime: 24 * 60_000,
  });
  const { data: wards = [] } = useQuery({
    queryKey: ['regions', 'wards', propertyFilters.districtCode],
    queryFn: () => api.regions.findWards(propertyFilters.districtCode || undefined),
    enabled: Boolean(propertyFilters.districtCode),
    staleTime: 24 * 60_000,
  });
  const provinceOptions = useMemo(
    () => [
      { value: '', label: '전체' },
      ...provinces.map((province) => ({
        value: province.code,
        label: province.name,
      })),
    ],
    [provinces],
  );
  const districtOptions = useMemo(
    () => [
      { value: '', label: '전체' },
      ...districts.map((district) => ({
        value: district.code,
        label: district.name,
      })),
    ],
    [districts],
  );
  const wardOptions = useMemo(
    () => [{ value: '', label: '전체' }, ...wards.map((ward) => ({ value: ward.code, label: ward.name }))],
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

    if (selectedTransactionType !== 'all') {
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
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['listing-intakes', apiParams],
    queryFn: ({ pageParam }) => api.listingIntakes.findAll({ ...apiParams, page: pageParam } as any),
    initialPageParam: 1,
    placeholderData: keepPreviousData,
    getNextPageParam: (lastPage) => {
      const { page: currentPage, hasNextPage: hasMore } = lastPage.pagination;
      return hasMore ? currentPage + 1 : undefined;
    },
  });

  const listingIntakes = useMemo(() => data?.pages.flatMap((pageData) => pageData.items) ?? [], [data?.pages]);
  const loadedIntakes = listingIntakes.length;
  const intakeCountLabel = `${loadedIntakes.toLocaleString()}${hasNextPage ? '+' : ''}`;
  const loadedListings = useMemo(
    () => listingIntakes.reduce((total, intake) => total + (intake.listings?.length ?? 0), 0),
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

  const propertyGroups = useMemo(() => buildPropertyListingGroups(listingIntakes), [listingIntakes]);
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
    queryKey: ['listing-intakes', 'map', mapApiParams],
    queryFn: () => api.listingIntakes.map(mapApiParams as any),
    enabled: viewMode === 'map',
    placeholderData: keepPreviousData,
  });
  const mapIntakes = mapData?.items ?? listingIntakes;
  const mapGroups = useMemo(() => buildPropertyListingGroups(mapIntakes), [mapIntakes]);
  const mapPoints = useMemo(() => buildPropertyMapPoints(mapGroups), [mapGroups]);
  const selectedProvince = propertyFilters.provinceCode
    ? provinces.find((province) => province.code === propertyFilters.provinceCode)
    : undefined;
  const selectedDistrict = propertyFilters.districtCode
    ? districts.find((district) => district.code === propertyFilters.districtCode)
    : undefined;
  const selectedWard = propertyFilters.wardCode
    ? wards.find((ward) => ward.code === propertyFilters.wardCode)
    : undefined;
  const selectedRegionName = selectedWard?.name ?? selectedDistrict?.name ?? selectedProvince?.name;
  const priceDepositFilterSummary = getPriceDepositFilterSummary(propertyFilters, selectedTransactionType);
  const monthlyRentFilterSummary = getRangeSummary(
    propertyFilters.monthlyRentMin,
    propertyFilters.monthlyRentMax,
    '만원',
  );
  const areaFilterSummary = getRangeSummary(propertyFilters.areaMin, propertyFilters.areaMax, '평');
  const moveInFilterSummary = getDateRangeSummary(propertyFilters.moveInFrom, propertyFilters.moveInTo);

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
    propertyFilters.moveInFrom ||
    propertyFilters.moveInTo ||
    propertyFilters.advertisement !== 'all' ||
    activeSorts.length > 0,
  );

  // ── Inline edit mutation ──────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateListingDto }) => api.listings.update(id, patch),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['listing-intakes'] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
    },
    onError: (error) => {
      handleMutationError(error);
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
    },
  });
  const confirmMutation = useMutation({
    mutationFn: ({
      intakeId,
      result,
      expectedUpdatedAt,
    }: {
      intakeId: string;
      result: 'alive' | 'price_changed' | 'unavailable' | 'no_answer' | 'pending';
      expectedUpdatedAt?: string | null;
    }) =>
      api.listingIntakes.confirm(intakeId, {
        result,
        channel: 'note',
        expectedUpdatedAt,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
      if (selectedIntakeId) {
        queryClient.invalidateQueries({
          queryKey: ['listing-intakes', 'quick-sheet', selectedIntakeId],
        });
      }
    },
    onError: (error) => {
      handleMutationError(error);
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
    },
  });
  const invalidateListingStatusQueries = useCallback(() => {
    for (const queryKey of [['listing-intakes'], ['listings'], ['properties'], ['deals'], ['dashboard'], ['network']]) {
      void queryClient.invalidateQueries({ queryKey });
    }
    if (selectedIntakeId) {
      void queryClient.invalidateQueries({
        queryKey: ['listing-intakes', 'quick-sheet', selectedIntakeId],
      });
    }
  }, [queryClient, selectedIntakeId]);

  const rowLifecycleMutation = useMutation({
    mutationFn: ({
      intakeId,
      value,
      expectedUpdatedAt,
    }: {
      intakeId: string;
      listingIds: string[];
      value: IntakeLifecycleStatus;
      expectedUpdatedAt?: string | null;
    }) =>
      api.listingIntakes.updateLifecycleStatus(intakeId, value, {
        closedReason: value === IntakeLifecycleStatus.CLOSED ? IntakeClosedReason.WITHDRAWN : null,
        expectedUpdatedAt,
      }),
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
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
      if (selectedIntakeId) {
        queryClient.invalidateQueries({
          queryKey: ['listing-intakes', 'quick-sheet', selectedIntakeId],
        });
      }
    },
    onError: (error) => {
      handleMutationError(error);
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
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
          expectedUpdatedAt: patch.expectedUpdatedAt ?? listingUpdatedAtById.get(recordId),
        },
      });
    },
    [listingUpdatedAtById, updateMutation],
  );
  const handleIntakeConfirm = useCallback(
    (intakeId: string, result: 'alive' | 'price_changed' | 'unavailable' | 'no_answer' | 'pending') => {
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
      const currentValue = getListingRowAvailability(intake, listingsWithIntake);
      const plan = planListingStatusChange(currentValue, value, listingsWithIntake);
      const propertyLabel = [group.property?.site?.name, getDongName(group.property), group.property?.unit?.name]
        .filter((part) => part && part !== '-')
        .join(' ');

      if (plan.kind === 'startDeal') {
        setStartDealPrompt({
          propertyId: group.propertyId,
          propertyLabel,
          listings: plan.candidates,
          requiresListingSelection: group.listings.length > 1,
          intakeLifecycleStatus: intake.lifecycleStatus,
        });
        return;
      }

      if (plan.kind === 'reviewResume') {
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

      if (plan.kind === 'blocked') {
        toast.info(
          plan.reason === 'allHaveActiveDeals'
            ? '모든 거래유형에 이미 진행 중인 Deal이 있습니다.'
            : plan.reason === 'completedDeal'
              ? '이미 거래 완료된 Deal이 있어 종료된 매물입니다.'
              : plan.reason === 'closedIntake'
                ? '종료된 의뢰입니다. 먼저 가용으로 재개해 주세요.'
                : plan.reason === 'noCandidates'
                  ? 'Deal을 생성할 수 있는 거래유형이 없습니다.'
                  : '거래중 상태는 연결된 Deal에서 단계를 변경하거나 취소해 주세요.',
        );
        return;
      }

      if (plan.kind === 'noop') return;

      rowLifecycleMutation.mutate({
        intakeId: intake.id,
        listingIds: group.listings.map((listing) => listing.id),
        value: plan.lifecycleStatus,
        expectedUpdatedAt: intakeUpdatedAtById.get(intake.id),
      });
    },
    [intakeUpdatedAtById, rowLifecycleMutation],
  );
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
    <K extends keyof PropertyFilterState>(field: K, value: PropertyFilterState[K]) => {
      setPropertyFilters((prev) => ({ ...prev, [field]: value }));
      setPage(1);
    },
    [],
  );
  const handleProvinceFilterChange = useCallback((value: string) => {
    setPropertyFilters((prev) => ({
      ...prev,
      provinceCode: value,
      districtCode: '',
      wardCode: '',
    }));
    setPage(1);
  }, []);
  const handleDistrictFilterChange = useCallback((value: string) => {
    setPropertyFilters((prev) => ({
      ...prev,
      districtCode: value,
      wardCode: '',
    }));
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleFiltersReset = useCallback(() => {
    setPropertyFilters(initialPropertyFilters);
    setSelectedTransactionType('all');
    setActiveSorts([]);
    setSearch('');
    setSorting([]);
    setPage(1);
  }, []);

  // 특정 필터 필드만 초기값으로 되돌림 (chip X / summary pill X 공용).
  const clearFilterFields = useCallback((fields: (keyof PropertyFilterState)[]) => {
    setPropertyFilters((prev) => {
      const next = { ...prev };
      for (const field of fields) {
        (next[field] as PropertyFilterState[typeof field]) = initialPropertyFilters[field];
      }
      return next;
    });
    setPage(1);
  }, []);

  const handleSortingChange = useCallback((newSorting: SortingState) => {
    setSorting(newSorting);
    if (newSorting.length > 0) {
      const s = newSorting[0];
      setActiveSorts([
        {
          field: s.id,
          label: sortDefinitions.find((d) => d.field === s.id)?.label ?? s.id,
          direction: s.desc ? 'desc' : 'asc',
        },
      ]);
    } else {
      setActiveSorts([]);
    }
    setPage(1);
  }, []);

  const handleTransactionTabChange = useCallback((transactionType: string) => {
    const nextTransactionType = transactionType as (typeof transactionTypeOptions)[number]['value'];
    setSelectedTransactionType(nextTransactionType);
    setPropertyFilters((previous) => movePriceRangeForTransaction(previous, nextTransactionType));
    setPage(1);
  }, []);

  const handlePriceRangeApply = useCallback(
    (range: [number, number]) => {
      setPropertyFilters((previous) =>
        applyPriceRangeFilter(previous, selectedTransactionType, range[0], range[1]),
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
    setPropertyFilters((previous) => applyAreaRangeFilter(previous, range[0], range[1]));
    setPage(1);
    setIsAreaFilterOpen(false);
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleCreateProperty = useCallback(() => {
    const route = '/properties/new';
    const meta = getRouteMeta(route);
    openTab({ route, kind: meta.kind, title: meta.title });
  }, [openTab]);

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
        {expandedMatchRows.has(group.id) && <PropertyMatchPanel group={group} />}
        {expandedAdRows.has(group.id) && <PropertyAdPanel group={group} />}
      </>
    ),
    [expandedAdRows, expandedMatchRows],
  );

  const getExpandedPropertyRowHeight = useCallback(
    (group: PropertyListingGroup) =>
      (expandedMatchRows.has(group.id) ? estimatePropertyMatchPanelHeight(group) : 0) +
      (expandedAdRows.has(group.id) ? estimatePropertyAdPanelHeight(group) : 0),
    [expandedAdRows, expandedMatchRows],
  );

  // ── Column definitions (property-grouped operational grid) ────
  const columns = useMemo<ColumnDef<PropertyListingGroup, unknown>[]>(
    () => [
      {
        id: 'info',
        header: () => <TableHeaderLabel icon={<Tag className="size-4" />} label="거래" />,
        size: 60,
        enableSorting: false,
        cell: ({ row }) => <TransactionStack listings={row.original.listings} />,
      },
      {
        id: 'site',
        header: () => <TableHeaderLabel icon={<Type className="size-4" />} label="단지" />,
        size: 240,
        enableSorting: false,
        cell: ({ row }) => {
          const group = row.original;
          return (
            <div className="flex min-w-0 items-center">
              <span className="truncate text-[14px] font-semibold text-slate-900">
                {group.property?.site?.name ?? '매물 정보 없음'}
              </span>
            </div>
          );
        },
      },
      {
        id: 'dong',
        header: () => <TableHeaderLabel icon={<Hash className="size-4" />} label="동" />,
        size: 58,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="truncate text-[13px] font-medium text-slate-900">{getDongName(row.original.property)}</span>
        ),
      },
      {
        id: 'unit',
        header: () => <TableHeaderLabel icon={<Hash className="size-4" />} label="호" />,
        size: 58,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="truncate text-[13px] font-medium text-slate-900">
            {row.original.property?.unit?.name ?? ''}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">작업</span>,
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableResizing: false,
        enableSorting: false,
        meta: {
          cellClassName: 'px-0',
        },
        cell: ({ row }) => <PropertyRowActions listings={row.original.listings} intake={row.original.representative} />,
      },
      ...(!arePropertyDetailColumnsCollapsed
        ? [
            {
              id: 'unitType',
              header: () => <TableHeaderLabel icon={<Type className="size-4" />} label="타입" />,
              size: 58,
              enableSorting: false,
              cell: ({ row }) => {
                const value = getUnitTypeName(row.original.property);
                return <span className="truncate text-[13px] text-slate-700">{value === '-' ? '' : value}</span>;
              },
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
            {
              id: 'exclusiveArea',
              header: () => <TableHeaderLabel icon={<Ruler className="size-4" />} label="전용면적" />,
              size: 96,
              enableSorting: false,
              cell: ({ row }) => {
                const value = formatAreaPyeong(getExclusiveAreaM2(row.original.property));
                return <span className="truncate text-[13px] text-slate-700 tabular-nums">{value === '-' ? '' : value}</span>;
              },
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
            {
              id: 'matching',
              header: () => <TableHeaderLabel icon={<GitBranch className="size-4" />} label="매칭" />,
              size: 64,
              enableSorting: false,
              cell: ({ row }) => (
                <ListingMatchToggle
                  group={row.original}
                  isOpen={expandedMatchRows.has(row.original.id)}
                  onToggle={toggleMatchRow}
                />
              ),
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
            {
              id: 'advertisement',
              header: () => <TableHeaderLabel icon={<Megaphone className="size-4" />} label="광고" />,
              size: 64,
              enableSorting: false,
              cell: ({ row }) => (
                <ListingAdToggle
                  group={row.original}
                  isOpen={expandedAdRows.has(row.original.id)}
                  onToggle={toggleAdRow}
                />
              ),
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
            {
              id: 'updatedAt',
              header: () => <TableHeaderLabel icon={<CalendarDays className="size-4" />} label="확인" />,
              size: 112,
              enableSorting: true,
              cell: ({ row }) => (
                <IntakeConfirmationCell
                  intake={row.original.representative}
                  onConfirm={handleIntakeConfirm}
                  isPending={
                    confirmMutation.isPending &&
                    confirmMutation.variables?.intakeId === row.original.representative.id
                  }
                />
              ),
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
          ]
        : []),
      {
        id: 'listingAvailability',
        header: () => <TableHeaderLabel icon={<Tag className="size-4" />} label="매물상태" />,
        size: 120,
        enableSorting: false,
        cell: ({ row }) => (
          <ListingAvailabilityCell
            intake={row.original.representative}
            listings={row.original.listings}
            onChange={(value) => handleRowStatusSave(row.original, value)}
          />
        ),
      },
      {
        id: 'price',
        header: () => <TableHeaderLabel icon={<CircleDollarSign className="size-4" />} label="가격/보증금" />,
        size: 155,
        enableSorting: true,
        meta: {
          cellClassName: 'hover:bg-muted/50',
          onCellDoubleClick: (_group: PropertyListingGroup, event: ReactMouseEvent<HTMLTableCellElement>) => {
            triggerStackCellEditor(event);
          },
        },
        cell: ({ row }) => (
          <ListingPriceDepositStack
            listings={row.original.listings}
            onSave={handleCellSave}
            onPatch={handleListingPatch}
          />
        ),
      },
      {
        id: 'monthlyRent',
        header: () => <TableHeaderLabel icon={<CircleDollarSign className="size-4" />} label="월세" />,
        size: 82,
        enableSorting: false,
        meta: {
          cellClassName: 'hover:bg-muted/50',
          onCellDoubleClick: (_group: PropertyListingGroup, event: ReactMouseEvent<HTMLTableCellElement>) => {
            triggerStackCellEditor(event);
          },
        },
        cell: ({ row }) => <ListingMonthlyRentStack listings={row.original.listings} onPatch={handleListingPatch} />,
      },
      ...(optionalColumns.loanAmount
        ? [
            {
              id: 'loanAmount',
              header: () => <TableHeaderLabel icon={<CircleDollarSign className="size-4" />} label="융자금" />,
              size: 96,
              enableSorting: false,
              meta: {
                cellClassName: 'hover:bg-muted/50',
                onCellDoubleClick: (_group: PropertyListingGroup, event: ReactMouseEvent<HTMLTableCellElement>) => {
                  triggerStackCellEditor(event);
                },
              },
              cell: ({ row }) => (
                <ListingNumberFieldStack listings={row.original.listings} field="loanAmount" onSave={handleCellSave} />
              ),
            } satisfies ColumnDef<PropertyListingGroup, unknown>,
          ]
        : []),
    {
      id: 'moveInAvailable',
      header: () => <TableHeaderLabel icon={<DoorOpen className="size-4" />} label="입주가능일" />,
      size: 120,
      enableSorting: false,
      cell: ({ row }) => <MoveInAvailableStack listings={row.original.listings} onPatch={handleListingPatch} />,
    },
    {
      id: 'memo',
      header: () => <TableHeaderLabel icon={<FileText className="size-4" />} label="의뢰 메모" />,
      size: 320,
      minSize: 220,
      enableResizing: false,
      enableSorting: false,
      meta: {
        cellClassName: 'hover:bg-muted/50',
        grow: true,
        onCellDoubleClick: (_group: PropertyListingGroup, event: ReactMouseEvent<HTMLTableCellElement>) => {
          triggerStackCellEditor(event);
        },
      },
      cell: ({ row }) => <IntakeMemoCell intake={row.original.representative} onSave={handleIntakeMemoSave} />,
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
      <div data-properties-page className="-m-4 flex min-h-0 flex-1 flex-col bg-white">
        <section className="border-b border-border bg-white px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Tabs value={selectedTransactionType} onValueChange={handleTransactionTabChange} className="min-w-0 gap-0">
                <TabsList className="max-w-full justify-start bg-muted">
                  {transactionTypeOptions.map((tab) => {
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="flex-none border-0 px-3 text-[13px] shadow-none data-[state=active]:border data-[state=active]:border-[#d9d9d6] data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
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
                onChange={(values) => updatePropertyFilter('siteIds', values)}
                ariaLabel="단지 필터"
                placeholder="단지 전체"
                searchPlaceholder="단지명 또는 주소 검색"
                emptyText="일치하는 단지가 없습니다."
                isLoading={isFilterSitesLoading}
                maxCount={1}
                className={cn(
                  'h-8 min-w-[150px] max-w-[280px] border-border bg-white px-2.5 text-[13px] shadow-none',
                  propertyFilters.siteIds.length > 0 && 'border-foreground/25 bg-foreground/[0.06]',
                )}
                badgeClassName="m-0 h-5 border-border bg-white px-1.5 text-[11px] text-foreground shadow-none"
                popoverClassName="w-[360px]"
              />

              <div className="relative w-20">
                <Input
                  value={propertyFilters.dongSearch}
                  onChange={(event) => updatePropertyFilter('dongSearch', event.target.value)}
                  placeholder="동"
                  className="h-8 border-transparent bg-white px-2 pr-6 text-[13px] shadow-none hover:border-border focus:border-input"
                />
                {propertyFilters.dongSearch && (
                  <button
                    type="button"
                    aria-label="동 검색 지우기"
                    onClick={() => updatePropertyFilter('dongSearch', '')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="relative w-20">
                <Input
                  value={propertyFilters.unitSearch}
                  onChange={(event) => updatePropertyFilter('unitSearch', event.target.value)}
                  placeholder="호"
                  className="h-8 border-transparent bg-white px-2 pr-6 text-[13px] shadow-none hover:border-border focus:border-input"
                />
                {propertyFilters.unitSearch && (
                  <button
                    type="button"
                    aria-label="호 검색 지우기"
                    onClick={() => updatePropertyFilter('unitSearch', '')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="relative ml-1 w-56 max-w-full">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="주소, 연락처, 메모"
                  className="h-8 border-transparent bg-white pl-8 pr-8 text-[13px] shadow-none hover:border-border focus:border-input"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => handleSearchChange('')}
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

        <section className="border-b border-border bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPopoverChip
              label="지역"
              value={selectedRegionName ?? '전체'}
              active={Boolean(propertyFilters.provinceCode || propertyFilters.districtCode || propertyFilters.wardCode)}
              tier={2}
              onClear={() => clearFilterFields(['provinceCode', 'districtCode', 'wardCode'])}
              contentClassName="w-[360px]"
            >
              <div className="space-y-3">
                <PopoverTitle title="지역" description="시도, 시군구, 법정동을 한 번에 좁힙니다." />
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
                      onChange={(value) => updatePropertyFilter('wardCode', value)}
                      options={wardOptions}
                    />
                  </FilterField>
                </div>
              </div>
            </FilterPopoverChip>

            <MultiSelect
              options={siteTypeOptions}
              selected={propertyFilters.siteTypes}
              onChange={(values) => updatePropertyFilter('siteTypes', values)}
              ariaLabel="유형 필터"
              placeholder="유형 전체"
              searchPlaceholder="유형 검색"
              emptyText="일치하는 유형이 없습니다."
              maxCount={1}
              className={cn(
                'h-8 min-w-[126px] max-w-[220px] border-border bg-white px-2.5 text-[13px] shadow-none',
                propertyFilters.siteTypes.length > 0 && 'border-foreground/25 bg-foreground/[0.06]',
              )}
              badgeClassName="m-0 h-5 border-border bg-white px-1.5 text-[11px] text-foreground shadow-none"
              popoverClassName="w-[240px]"
            />

            <MultiSelect
              options={listingAvailabilityFilterOptions}
              selected={propertyFilters.availabilities}
              onChange={(values) => updatePropertyFilter('availabilities', values)}
              ariaLabel="매물상태 필터"
              placeholder="매물상태 전체"
              searchPlaceholder="매물상태 검색"
              emptyText="일치하는 상태가 없습니다."
              maxCount={1}
              className={cn(
                'h-8 min-w-[150px] max-w-[240px] border-border bg-white px-2.5 text-[13px] shadow-none',
                propertyFilters.availabilities.length > 0 && 'border-foreground/25 bg-foreground/[0.06]',
              )}
              badgeClassName="m-0 h-5 border-border bg-white px-1.5 text-[11px] text-foreground shadow-none"
              popoverClassName="w-[240px]"
            />

            <FilterPopoverChip
              label="가격/보증금"
              value={priceDepositFilterSummary ?? '전체'}
              active={Boolean(priceDepositFilterSummary)}
              tier={2}
              open={isPriceFilterOpen}
              onOpenChange={setIsPriceFilterOpen}
              onClear={() => clearFilterFields(['priceMin', 'priceMax', 'depositMin', 'depositMax'])}
              contentClassName="w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
            >
              <PriceRangeFilterPanel
                initialRange={getPriceRangeFilter(propertyFilters, selectedTransactionType)}
                onApply={handlePriceRangeApply}
                onClear={() => {
                  clearFilterFields(['priceMin', 'priceMax', 'depositMin', 'depositMax']);
                  setIsPriceFilterOpen(false);
                }}
                onCancel={() => setIsPriceFilterOpen(false)}
              />
            </FilterPopoverChip>

            <FilterPopoverChip
              label="월세"
              value={monthlyRentFilterSummary ?? '전체'}
              active={Boolean(monthlyRentFilterSummary)}
              tier={3}
              open={isMonthlyRentFilterOpen}
              onOpenChange={setIsMonthlyRentFilterOpen}
              onClear={() => clearFilterFields(['monthlyRentMin', 'monthlyRentMax'])}
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
                tickLabels={['전체', '200만', '400만', '최대']}
                formatLabel={(min, max) =>
                  formatNumericRangeLabel(
                    min,
                    max,
                    MONTHLY_RENT_RANGE_MIN,
                    MONTHLY_RENT_RANGE_MAX,
                    '만원',
                    '전체 월세',
                  )
                }
                thumbLabels={['최소 월세', '최대 월세']}
                onApply={handleMonthlyRentRangeApply}
                onClear={() => {
                  clearFilterFields(['monthlyRentMin', 'monthlyRentMax']);
                  setIsMonthlyRentFilterOpen(false);
                }}
                onCancel={() => setIsMonthlyRentFilterOpen(false)}
              />
            </FilterPopoverChip>

            <FilterPopoverChip
              label="면적"
              value={areaFilterSummary ?? '전체'}
              active={Boolean(areaFilterSummary)}
              tier={2}
              open={isAreaFilterOpen}
              onOpenChange={setIsAreaFilterOpen}
              onClear={() => clearFilterFields(['areaMin', 'areaMax'])}
              contentClassName="w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
            >
              <NumericRangeFilterPanel
                ariaLabel="면적 필터"
                title="전용면적"
                description="전용면적 기준 · 평 단위"
                initialRange={getAreaRangeFilter(propertyFilters)}
                min={AREA_RANGE_MIN}
                max={AREA_RANGE_MAX}
                step={1}
                presets={AREA_RANGE_PRESETS}
                tickLabels={['전체', '20평', '40평', '60평', '최대']}
                formatLabel={(min, max) =>
                  formatNumericRangeLabel(
                    min,
                    max,
                    AREA_RANGE_MIN,
                    AREA_RANGE_MAX,
                    '평',
                    '전체 면적',
                  )
                }
                thumbLabels={['최소 면적', '최대 면적']}
                onApply={handleAreaRangeApply}
                onClear={() => {
                  clearFilterFields(['areaMin', 'areaMax']);
                  setIsAreaFilterOpen(false);
                }}
                onCancel={() => setIsAreaFilterOpen(false)}
              />
            </FilterPopoverChip>

            <FilterPopoverChip
              label="입주일"
              value={moveInFilterSummary ?? '전체'}
              active={Boolean(moveInFilterSummary)}
              tier={3}
              onClear={() => clearFilterFields(['moveInFrom', 'moveInTo'])}
              contentClassName="w-[320px]"
            >
              <div className="space-y-3">
                <PopoverTitle title="입주일" description="입주가능일 시작 날짜 기준으로 검색합니다." />
                <DateRangeFilter
                  fromValue={propertyFilters.moveInFrom}
                  toValue={propertyFilters.moveInTo}
                  onFromChange={(value) => updatePropertyFilter('moveInFrom', value)}
                  onToChange={(value) => updatePropertyFilter('moveInTo', value)}
                />
              </div>
            </FilterPopoverChip>

            <Select
              value={propertyFilters.advertisement}
              onValueChange={(value) =>
                updatePropertyFilter(
                  'advertisement',
                  value as PropertyFilterState['advertisement'],
                )
              }
            >
              <SelectTrigger
                size="sm"
                aria-label="광고 필터"
                className={cn(
                  'h-8 w-[116px] border-border bg-white px-2.5 text-xs text-muted-foreground shadow-none',
                  propertyFilters.advertisement !== 'all' &&
                    'border-foreground/25 bg-foreground/[0.06] text-foreground',
                )}
              >
                <Megaphone className="size-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {advertisementFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-[13px]">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 표시 설정과 초기화 — 우측 정렬 */}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="mr-0.5 hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 xl:inline">
                표시
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground">
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

        <section className="flex min-h-0 flex-1 bg-white px-0 py-0">
          <div data-property-table-scroll-scope className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="relative flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border/60 bg-muted/20 px-3 py-1.5 text-[12px] text-muted-foreground">
              {viewMode === 'list' && (
                <>
                  {!arePropertyDetailColumnsCollapsed && (
                    <>
                      <span
                        aria-hidden="true"
                        data-column-group-line="property-details"
                        className="pointer-events-none absolute left-[482px] top-1/2 z-[9] h-px w-[404px] -translate-y-1/2 bg-slate-400"
                      />
                      <span
                        aria-hidden="true"
                        data-column-group-cap="property-details"
                        className="pointer-events-none absolute left-[886px] top-1/2 z-[9] h-2 w-px -translate-x-full -translate-y-[0.5px] bg-slate-400"
                      />
                    </>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={
                      arePropertyDetailColumnsCollapsed ? '타입–확인 컬럼 펼치기' : '타입–확인 컬럼 접기'
                    }
                    aria-expanded={!arePropertyDetailColumnsCollapsed}
                    title={
                      arePropertyDetailColumnsCollapsed ? '타입–확인 컬럼 펼치기' : '타입–확인 컬럼 접기'
                    }
                    data-column-group-toggle="property-details"
                    className="pointer-events-auto absolute left-[472px] top-1/2 z-10 size-5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-slate-400 bg-white p-0 text-slate-600 shadow-none hover:border-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setArePropertyDetailColumnsCollapsed((previous) => !previous)}
                  >
                    {arePropertyDetailColumnsCollapsed ? (
                      <Plus className="size-3" />
                    ) : (
                      <Minus className="size-3" />
                    )}
                  </Button>
                </>
              )}
              {isLoading || (viewMode === 'map' && isMapDataLoading) ? (
                <span>불러오는 중</span>
              ) : loadedIntakes === 0 && hasActiveFilters ? (
                <span>조건을 줄이거나 초기화해 보세요.</span>
              ) : viewMode === 'map' ? (
                <span>마커나 우측 매물을 클릭하면 빠른 확인 패널이 열립니다.</span>
              ) : null}
            </div>
            {viewMode === 'list' ? (
              <PropertyListingsTable
                columns={columns}
                data={propertyGroups}
                totalCount={loadedIntakes}
                pageSize={LISTINGS_PAGE_SIZE}
                sorting={sorting}
                onSortingChange={handleSortingChange}
                onRowClick={(row) => setSelectedIntakeId(row.intakeId)}
                expandedRowIds={expandedRowIds}
                renderExpandedRow={renderExpandedPropertyRow}
                getExpandedRowHeight={getExpandedPropertyRowHeight}
                isLoading={isLoading}
                isLoadingMore={isFetchingNextPage}
                onEndReached={handleEndReached}
                emptyMessage={hasActiveFilters ? '조건에 맞는 매물이 없습니다.' : '등록된 매물이 없습니다.'}
                renderBulkActions={(selectedRows) => <PropertyBulkActions groups={selectedRows} />}
                renderStatusBar={() => (
                  <span>
                    의뢰 {intakeCountLabel}건 표시
                    {loadedListings > 0 ? ` · 거래 ${loadedListings.toLocaleString()}건` : ''}
                    {hasNextPage && !isFetchingNextPage ? ' · 아래로 스크롤하면 더 불러옵니다' : ''}
                    {isFetchingNextPage ? ' · 더 불러오는 중...' : ''}
                  </span>
                )}
              />
            ) : (
              <PropertyMapView
                points={mapPoints.points}
                missingGroups={mapPoints.missingGroups}
                isLoading={isLoading || (viewMode === 'map' && isMapDataLoading && listingIntakes.length === 0)}
                isFallback={isMapDataError}
                truncated={Boolean(mapData?.truncated)}
                limit={mapData?.limit}
                hasActiveFilters={hasActiveFilters}
                onSelectIntake={setSelectedIntakeId}
              />
            )}
          </div>
        </section>
        <PropertyQuickSheet intakeId={selectedIntakeId} onClose={() => setSelectedIntakeId(null)} />
        {startDealPrompt && (
          <StartDealFromStatusDialog
            key={`${startDealPrompt.propertyId}:${startDealPrompt.listings.map((listing) => listing.id).join(',')}`}
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
                    resumeClosedPrompt.targetAvailability === ListingAvailability.PAUSED
                      ? IntakeLifecycleStatus.HOLD
                      : IntakeLifecycleStatus.OPEN,
                  expectedUpdatedAt: intakeUpdatedAtById.get(resumeClosedPrompt.intakeId),
                },
                {
                  onSuccess: () => setResumeClosedPrompt(null),
                },
              );
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
      <span className="shrink-0 [&>svg]:size-3 [&>svg]:text-muted-foreground/70">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function ViewModeSwitch({ value, onChange }: { value: PropertyViewMode; onChange: (value: PropertyViewMode) => void }) {
  return (
    <div
      role="group"
      aria-label="매물 보기 방식"
      className="flex h-8 items-center rounded-md border border-border bg-white p-0.5"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1.5 rounded-[5px] px-2.5 text-xs font-medium',
          value === 'list' ? 'bg-muted text-foreground shadow-sm hover:bg-muted' : 'text-muted-foreground',
        )}
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
      >
        <List className="size-3.5" />
        목록
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1.5 rounded-[5px] px-2.5 text-xs font-medium',
          value === 'map' ? 'bg-muted text-foreground shadow-sm hover:bg-muted' : 'text-muted-foreground',
        )}
        onClick={() => onChange('map')}
        aria-pressed={value === 'map'}
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
        {hasActiveFilters ? '조건에 맞는 매물이 없습니다.' : '등록된 매물이 없습니다.'}
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] bg-white">
      <div className="relative min-h-0 overflow-hidden border-r border-border bg-[#f7f7f5]">
        <NaverPropertyMap points={points} missingCount={missingGroups.length} onSelectIntake={onSelectIntake} />
      </div>

      <aside className="flex min-h-0 flex-col bg-white">
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="text-[12px] font-medium text-foreground">지도 매물</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            좌표 있는 단지 {points.length.toLocaleString()}곳
            {truncated && limit ? ` · 최대 ${limit.toLocaleString()}건` : ''}
            {isFallback ? ' · 목록 기준' : ''}
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
            <MapPropertyRow key={group.id} group={group} onClick={() => onSelectIntake(group.intakeId)} muted />
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
  const mapRef = useRef<InstanceType<NaverMapsApi['Map']> | null>(null);
  const markersRef = useRef<Array<InstanceType<NaverMapsApi['Marker']>>>([]);
  const listenersRef = useRef<unknown[]>([]);
  const clusterListenersRef = useRef<unknown[]>([]);
  const hasAutoFittedRef = useRef(false);
  const [mapsApi, setMapsApi] = useState<NaverMapsApi | null>(() => getReadyNaverMapsApi());
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    getReadyNaverMapsApi() ? 'ready' : 'idle',
  );

  useEffect(() => {
    if (mapsApi || !NAVER_MAPS_NCP_KEY_ID) return;

    let cancelled = false;
    setLoadState('loading');
    loadNaverMaps(NAVER_MAPS_NCP_KEY_ID)
      .then((loadedMapsApi) => {
        if (cancelled) return;
        setMapsApi(loadedMapsApi);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState('error');
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
      removePropertyMapListeners(listenersRef.current, (listener) => mapsApi.Event.removeListener?.(listener));
      for (const marker of markersRef.current) {
        marker.setMap(null);
      }
      listenersRef.current = [];
      markersRef.current = [];
    };

    const clearClusterListeners = () => {
      removePropertyMapListeners(clusterListenersRef.current, (listener) => mapsApi.Event.removeListener?.(listener));
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
          title: isCluster ? `${cluster.groupCount}건` : cluster.points[0].siteName,
          icon: {
            content: isCluster ? getNaverClusterMarkerHtml(cluster) : getNaverMarkerHtml(cluster.points[0]),
            anchor: isCluster ? new mapsApi.Point(24, 24) : new mapsApi.Point(20, 20),
          },
        });
        const listener = mapsApi.Event.addListener(marker, 'click', () => {
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
      mapsApi.Event.addListener(map, 'idle', renderClusters),
      mapsApi.Event.addListener(map, 'zoom_changed', renderClusters),
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
        <div className="text-[12px] font-medium text-foreground">지도 표시 {points.length.toLocaleString()}곳</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">좌표 없음 {missingCount.toLocaleString()}건</div>
      </div>
      {!NAVER_MAPS_NCP_KEY_ID && (
        <NaverMapOverlayMessage
          title="네이버 지도 키가 필요합니다"
          detail="VITE_NAVER_MAPS_NCP_KEY_ID를 설정하면 지도가 표시됩니다."
        />
      )}
      {NAVER_MAPS_NCP_KEY_ID && loadState === 'loading' && (
        <NaverMapOverlayMessage
          title="네이버 지도를 불러오는 중입니다"
          detail="Maps JavaScript SDK를 초기화하고 있습니다."
        />
      )}
      {NAVER_MAPS_NCP_KEY_ID && loadState === 'error' && (
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
      {NAVER_MAPS_NCP_KEY_ID && loadState === 'ready' && points.length === 0 && (
        <NaverMapOverlayMessage
          title="좌표가 등록된 매물이 없습니다"
          detail="단지 좌표가 있는 매물부터 지도에 표시됩니다."
        />
      )}
    </div>
  );
}

function NaverMapOverlayMessage({ title, detail }: { title: string; detail: ReactNode }) {
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
  map: InstanceType<NaverMapsApi['Map']>,
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

function buildSinglePropertyMapCluster(point: PropertyMapPoint): PropertyMapCluster {
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
    typeof mapsApi.LatLng === 'function' &&
    typeof mapsApi.LatLngBounds === 'function' &&
    typeof mapsApi.Point === 'function' &&
    typeof mapsApi.Map === 'function' &&
    typeof mapsApi.Marker === 'function' &&
    mapsApi.Event &&
    typeof mapsApi.Event.addListener === 'function'
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

  window.__estateErpNaverMapsPromise = new Promise<NaverMapsApi>((resolve, reject) => {
    const existingScript = document.getElementById('naver-maps-js-sdk') as HTMLScriptElement | null;

    const handleLoad = () => {
      const loadedMapsApi = getReadyNaverMapsApi();
      if (loadedMapsApi) {
        resolve(loadedMapsApi);
        return;
      }
      reject(new Error('NAVER Maps SDK loaded without ready maps API'));
    };

    if (existingScript) {
      const loadedMapsApi = getReadyNaverMapsApi();
      if (loadedMapsApi) {
        resolve(loadedMapsApi);
        return;
      }
      if (existingScript.dataset.loadState === 'loaded') {
        reject(new Error('NAVER Maps SDK is present but not ready'));
        return;
      }
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', () => reject(new Error('NAVER Maps SDK failed to load')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = 'naver-maps-js-sdk';
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(ncpKeyId)}`;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loadState = 'loaded';
        handleLoad();
      },
      { once: true },
    );
    script.addEventListener('error', () => reject(new Error('NAVER Maps SDK failed to load')), { once: true });
    document.head.appendChild(script);
  });

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
  const siteName = property?.site?.name ?? '매물 정보 없음';
  const address = point?.address ?? property?.site?.roadAddress ?? property?.site?.jibunAddress ?? '주소 미등록';
  const unitLabel = getPropertyMapUnitLabel(property);
  const priceLabel = getPropertyMapPriceLabel(group.listings);

  return (
    <button
      type="button"
      className={cn(
        'block w-full border-b border-border px-3 py-2.5 text-left hover:bg-muted/40',
        muted && 'bg-muted/10',
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-foreground">{siteName}</div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {[unitLabel, address].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">{group.listings.length.toLocaleString()}건</span>
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
        {group.listings.slice(0, 3).map((listing) => (
          <TransactionBadge key={listing.id} transactionType={listing.transactionType} />
        ))}
        <span className="truncate text-[12px] font-medium text-slate-700">{priceLabel}</span>
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

function PropertyQuickSheet({ intakeId, onClose }: { intakeId: string | null; onClose: () => void }) {
  const { data: intake, isLoading } = useQuery({
    queryKey: ['listing-intakes', 'quick-sheet', intakeId],
    queryFn: () => api.listingIntakes.findOne(intakeId as string),
    enabled: Boolean(intakeId),
  });

  // 무거운 상세 트리는 짧은 drawer 전환이 끝난 뒤 mount해 이동 중 frame drop을 막는다.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    if (!intakeId) {
      setContentReady(false);
      return;
    }
    const timer = window.setTimeout(() => setContentReady(true), PROPERTY_QUICK_SHEET_CONTENT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [intakeId]);

  return (
    <Sheet open={Boolean(intakeId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        data-property-quick-sheet
        side="right"
        showCloseButton={false}
        className="!w-full !max-w-full !gap-0 overflow-hidden p-0 sm:!max-w-[720px]"
      >
        {intakeId && (!contentReady || isLoading) && <PropertySheetSkeleton />}
        {intakeId && contentReady && !isLoading && intake?.property && (
          <PropertySheetContent
            intake={intake}
            property={{ ...intake.property, listings: intake.listings ?? [] }}
            onClose={onClose}
          />
        )}
        {intakeId && contentReady && !isLoading && !intake?.property && (
          <div className="flex h-full flex-col">
            <SheetHeader className="sr-only">
              <SheetTitle>의뢰를 찾을 수 없습니다</SheetTitle>
              <SheetDescription>요청하신 의뢰 정보가 존재하지 않습니다.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              의뢰를 찾을 수 없습니다.
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
        <SheetTitle>의뢰 빠른 확인</SheetTitle>
        <SheetDescription>의뢰 정보를 불러오는 중입니다.</SheetDescription>
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
  intake,
  property,
  onClose,
}: {
  intake: ListingIntake;
  property: Property;
  onClose: () => void;
}) {
  const openTab = useTabStore((s) => s.openTab);
  const listings = (property.listings ?? []).slice().sort(comparePropertyListing);
  const contacts = property.propertyContacts ?? [];
  const tenants = property.tenants ?? [];
  const consultations = property.consultations ?? [];
  const title = property.site?.name ?? '매물 상세';
  const unitLabel = getPropertySheetUnitLabel(property);
  const unitTypeName = property.unit?.siteUnitType?.name;
  const floorLabel = property.unit?.floor ? `${property.unit.floor}층` : null;
  const unitSummaryItems = [unitTypeName ? `${unitTypeName}타입` : null, floorLabel].filter(Boolean);
  const address = property.site?.roadAddress ?? property.site?.jibunAddress ?? '주소 미등록';
  const owner = contacts.find((contact) => contact.role === 'owner') ?? contacts[0];
  const ownerPhone = owner?.contact?.phone;
  const areaLabel = formatPropertySheetArea(property);
  const notices = getPropertySheetNotices(property);
  const intakeListings = listings.filter((listing) => listing.intakeId === intake.id);
  const availability = getListingRowAvailability(intake, intakeListings);
  const memo = intake.memo?.trim() || listings.find((listing) => listing.memo?.trim())?.memo?.trim();

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-8 py-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          의뢰 빠른 확인
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const route = `/properties/${property.id}`;
              const meta = getRouteMeta(route);
              const tabTitle = [title, unitLabel].filter(Boolean).join(' ') || meta.title;
              onClose();
              openTab({ route, kind: meta.kind, title: tabTitle });
            }}
          >
            <ExternalLink />
            전체 페이지로 열기
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="닫기">
            <X />
          </Button>
        </div>
      </div>
      <SheetHeader className="space-y-5 border-b border-border px-8 pb-6 pt-5">
        <div className="space-y-3">
          <SheetTitle className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[28px] font-bold leading-tight tracking-[-0.02em] text-foreground">
            <span>{title}</span>
            {unitLabel && <span className="text-foreground">{unitLabel}</span>}
          </SheetTitle>
          {unitSummaryItems.length > 0 && (
            <div className="text-[14px] leading-6 text-muted-foreground">{unitSummaryItems.join(' · ')}</div>
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
              확인 {intake.lastCheckedAt ? formatDateShort(intake.lastCheckedAt) : '미확인'}
            </span>
            <span>접수 {formatDateShort(intake.receivedAt)}</span>
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {listings.map((listing) => (
              <TransactionBadge key={listing.id} transactionType={listing.transactionType} />
            ))}
            <StatusIndicator value={availability} />
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
                {owner?.contact?.name ?? '소유주'} 전화
              </a>
            ) : (
              <span>
                <Phone className="size-3.5" />
                소유주 연락처 없음
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[13px] font-medium" asChild>
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
                <PropertySheetNoticeRow key={`${notice.title}-${notice.detail}`} notice={notice} />
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

        <SheetSection title={`가격 변경 ${getPropertySheetPriceHistoryCount(listings)}`}>
          <PropertySheetPriceHistoryList listings={listings} />
        </SheetSection>

        <SheetSection title={`광고 ${getPropertySheetAdvertisementCount(listings)}`}>
          <PropertySheetAdvertisementList listings={listings} />
        </SheetSection>

        <SheetSection title={`연락처 ${contacts.length + tenants.length}`}>
          {contacts.length > 0 || tenants.length > 0 ? (
            <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
              {contacts.map((contact) => (
                <PropertySheetContactRow key={contact.id} propertyContact={contact} />
              ))}
              {tenants.map((tenant) => (
                <PropertySheetTenantRow key={tenant.id} tenant={tenant} />
              ))}
            </div>
          ) : (
            <SheetEmptyState
              text="등록된 소유주, 대리인, 임차인이 없습니다. 소유주 연락처가 있어야 목록과 상세에서 바로 전화할 수 있습니다."
              action={
                <Link
                  to="/properties/$id"
                  params={{ id: property.id }}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-white px-3 text-[12px] font-medium text-foreground hover:bg-muted"
                >
                  전체 페이지에서 상담/관련인 추가
                </Link>
              }
            />
          )}
        </SheetSection>

        <SheetSection title="최근 상담 / 메모">
          <div className="space-y-2">
            {memo && (
              <div className="rounded-md border border-[#eeeeec] bg-slate-50/60 p-3">
                <div className="mb-1 text-[11px] font-medium text-slate-500">의뢰 메모</div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{memo}</p>
              </div>
            )}
            {consultations.slice(0, 3).map((consultation) => (
              <PropertySheetConsultationRow key={consultation.id} consultation={consultation} />
            ))}
            {!memo && consultations.length === 0 && <SheetEmptyState text="상담 기록과 메모가 없습니다." compact />}
          </div>
        </SheetSection>
      </div>
    </div>
  );
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function PropertySheetNoticeRow({ notice }: { notice: PropertySheetNotice }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <span
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          notice.tone === 'danger' && 'bg-[#e03e3e]',
          notice.tone === 'warning' && 'bg-[#dfab01]',
          notice.tone === 'neutral' && 'bg-[#9b9a97]',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-foreground">{notice.title}</div>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{notice.detail}</p>
      </div>
    </div>
  );
}

function PropertySheetListingCard({ listing }: { listing: PropertyListing }) {
  return (
    <div className="rounded-md border border-border bg-white p-3 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <TransactionBadge transactionType={listing.transactionType} />
          <StatusIndicator value={getListingAvailability(listing)} />
          <JointBrokerageBadge intake={listing.intake} />
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">확인 {formatDateShort(listing.updatedAt)}</span>
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
      <ListingCostSummary listing={listing as PropertyListing & ListingCostExtras} />
      {listing.memo?.trim() && (
        <p className="mt-2.5 line-clamp-2 border-l-2 border-border pl-2.5 text-[12px] leading-5 text-muted-foreground">
          {listing.memo.trim()}
        </p>
      )}
    </div>
  );
}

function PropertySheetPriceHistoryList({ listings }: { listings: PropertyListing[] }) {
  const historyRows = listings
    .flatMap((listing) =>
      (listing.priceHistories ?? []).map((history) => ({
        listing,
        history,
      })),
    )
    .sort((a, b) => new Date(b.history.createdAt).getTime() - new Date(a.history.createdAt).getTime());

  if (historyRows.length === 0) {
    return <SheetEmptyState text="등록된 가격 변경 이력이 없습니다." compact />;
  }

  return (
    <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
      {historyRows.map(({ listing, history }) => (
        <PropertySheetPriceHistoryRow key={history.id} listing={listing} history={history} />
      ))}
    </div>
  );
}

function PropertySheetPriceHistoryRow({
  listing,
  history,
}: {
  listing: PropertyListing;
  history: NonNullable<PropertyListing['priceHistories']>[number];
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
        <span className="text-[11px] text-slate-500">{formatDateTime(history.createdAt)}</span>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="font-medium tabular-nums text-slate-500">{beforePrice}</span>
        <span className="text-slate-300">→</span>
        <span className="font-semibold tabular-nums text-slate-950">{afterPrice}</span>
      </div>
      {history.reason?.trim() && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">{history.reason.trim()}</p>
      )}
    </div>
  );
}

function PropertySheetAdvertisementList({ listings }: { listings: PropertyListing[] }) {
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
        <PropertySheetAdvertisementRow key={advertisement.id} listing={listing} advertisement={advertisement} />
      ))}
    </div>
  );
}

function PropertySheetAdvertisementRow({
  listing,
  advertisement,
}: {
  listing: PropertyListing;
  advertisement: NonNullable<PropertyListing['advertisements']>[number];
}) {
  const statusMeta = adStatusMeta[advertisement.status] ?? adStatusMeta.draft;
  const priceLabel = formatAdvertisementPrice(listing, advertisement);
  const dateItems = [
    advertisement.startedAt ? `시작 ${formatDateShort(advertisement.startedAt)}` : null,
    advertisement.endedAt ? `종료 ${formatDateShort(advertisement.endedAt)}` : null,
    advertisement.lastCheckedAt ? `확인 ${formatDateShort(advertisement.lastCheckedAt)}` : null,
    advertisement.lastSyncedAt ? `동기화 ${formatDateShort(advertisement.lastSyncedAt)}` : null,
  ].filter(Boolean);

  return (
    <div className="px-3 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <TransactionBadge transactionType={listing.transactionType} />
        <span
          className={cn(
            'inline-flex rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5',
            statusMeta.className,
          )}
        >
          {statusMeta.label}
        </span>
        {advertisement.url ? (
          <a
            href={advertisement.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] font-medium leading-5 text-[#5f5e5b] hover:bg-[#e9e9e7]"
          >
            <span className="truncate">{getAdChannelLabel(advertisement.channel)}</span>
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
          <span>{dateItems.length > 0 ? dateItems.join(' · ') : '-'}</span>
        </div>
      </div>
      {advertisement.memo?.trim() && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{advertisement.memo.trim()}</p>
      )}
    </div>
  );
}

function PropertySheetContactRow({ propertyContact }: { propertyContact: PropertyContact }) {
  const name = propertyContact.contact?.name ?? '이름 없음';
  const phone = propertyContact.contact?.phone;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">{name}</span>
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
            {getContactRoleLabel(propertyContact.role)}
          </span>
          {propertyContact.isPrimary && (
            <span className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] text-[#337ea9]">주 연락처</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {phone ?? '연락처 없음'}
          {propertyContact.memo ? ` · ${propertyContact.memo}` : ''}
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
  const name = tenant.contact?.name ?? '이름 없음';
  const phone = tenant.contact?.phone;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">{name}</span>
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">임차인</span>
          <span className="rounded-[4px] bg-[#fbf3db] px-1.5 py-0.5 text-[11px] text-[#8f6b1f]">
            {getTenantStatusLabel(tenant.status)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {phone ?? '연락처 없음'} · {getTenantPeriodLabel(tenant)}
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

function PropertySheetConsultationRow({ consultation }: { consultation: Consultation }) {
  return (
    <div className="rounded-md border border-[#eeeeec] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">{consultation.type}</span>
        <span className="text-[11px] text-slate-500">{formatDateTime(consultation.createdAt)}</span>
        {consultation.contact?.name && (
          <span className="text-[11px] text-slate-500">· {consultation.contact.name}</span>
        )}
      </div>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-700">{consultation.content}</p>
    </div>
  );
}

function SheetActionButton({
  icon,
  label,
  href,
  disabled,
  emphasis,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  disabled?: boolean;
  emphasis?: boolean;
}) {
  const className = cn(
    'flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
    emphasis
      ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-800'
      : 'border-[#eeeeec] bg-white text-slate-700 hover:bg-slate-50',
    disabled && 'pointer-events-none opacity-45',
  );

  if (href) {
    return (
      <a className={className} href={href}>
        {icon}
        <span className="truncate">{label}</span>
      </a>
    );
  }

  return (
    <button type="button" className={className} disabled={disabled}>
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SheetEmptyState({ text, compact = false, action }: { text: string; compact?: boolean; action?: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-md border border-dashed border-[#e3e2df] px-3 text-center text-sm text-slate-500',
        compact ? 'py-4' : 'py-8',
      )}
    >
      <div>{text}</div>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

function StatusIndicator({ value }: { value: string }) {
  const meta = listingAvailabilityMeta[value as ListingAvailability] ?? {
    label: value,
    dotClassName: 'bg-[#b4b4b1]',
    pillClassName: 'bg-[#f1f1ef] text-[#5f5e5b]',
  };

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
        meta.pillClassName,
      )}
    >
      <span className={cn('size-1.5 rounded-full', meta.dotClassName)} />
      <span className="truncate">{meta.label}</span>
    </span>
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
  const propertyLabel = prompt.propertyLabel || '선택한 매물';
  const targetLabel = prompt.targetAvailability === ListingAvailability.PAUSED ? '보류' : '가용';
  const targetLabelWithParticle =
    prompt.targetAvailability === ListingAvailability.PAUSED ? '보류로' : '가용으로';

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
                완료 Deal이 없는 거래유형 {prompt.resumableListingCount}개를 재개합니다. 거래 완료된 거래유형{' '}
                {prompt.completedListingCount}
                개는 종료 상태를 유지합니다.
              </>
            ) : (
              `재개하면 종료 상태가 해제되고 매물 상태가 ${targetLabelWithParticle} 표시됩니다.`
            )
          ) : (
            '기존 완료 Deal의 단계를 되돌리거나 취소해야 합니다. 새로운 거래라면 새 의뢰를 등록해 주세요.'
          )}
        </div>

        <DialogFooter>
          {prompt.canResume ? (
            <>
              <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
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
    isSingleListing ? (prompt.listings[0]?.id ?? '') : '',
  );
  const selectedListing = prompt.listings.find((listing) => listing.id === selectedListingId) ?? null;

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedListing) {
        throw new Error('Deal을 생성할 거래유형을 선택해 주세요.');
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
      toast.success('Deal을 생성하고 매물 상태를 거래중으로 변경했습니다.');
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Deal 생성에 실패했습니다.');
    },
  });

  const resumesPausedListing = selectedListing?.isPaused || prompt.intakeLifecycleStatus === IntakeLifecycleStatus.HOLD;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isSingleListing ? 'Deal을 생성하시겠습니까?' : '거래중으로 변경할 거래유형 선택'}</DialogTitle>
          <DialogDescription>
            {isSingleListing
              ? `${prompt.propertyLabel || '선택한 매물'}에 Deal을 생성하면 상태가 거래중으로 변경됩니다.`
              : 'Deal을 생성할 거래유형을 선택하세요. 선택한 거래유형만 거래중으로 전환됩니다.'}
          </DialogDescription>
        </DialogHeader>

        {isSingleListing && selectedListing ? (
          <DealStartListingOption listing={selectedListing} />
        ) : (
          <RadioGroup value={selectedListingId} onValueChange={setSelectedListingId} className="gap-2">
            {prompt.listings.map((listing) => {
              const id = `start-deal-${listing.id}`;
              return (
                <label
                  key={listing.id}
                  htmlFor={id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/50',
                    selectedListingId === listing.id && 'border-[#529cca] bg-[#e7f3f8]/40',
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
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
            취소
          </Button>
          <Button type="button" disabled={!selectedListing || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Handshake className="size-4" />}
            Deal 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DealStartListingOption({ listing, compact = false }: { listing: ListingSummary; compact?: boolean }) {
  return (
    <div
      className={cn('flex min-w-0 flex-1 items-center gap-2', !compact && 'rounded-md border bg-muted/30 px-3 py-3')}
    >
      <TransactionBadge transactionType={listing.transactionType} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{getDealStartPriceLabel(listing)}</span>
    </div>
  );
}

function getDealStartPriceLabel(listing: ListingSummary) {
  if (listing.transactionType === 'monthly') {
    const deposit = listing.deposit ? formatPrice(listing.deposit) : '-';
    const monthlyRent = listing.monthlyRent ? formatPrice(listing.monthlyRent) : '-';
    return `보증금 ${deposit} · 월세 ${monthlyRent}`;
  }

  const price = listing.transactionType === 'jeonse' ? listing.deposit : listing.price;
  return price ? formatPrice(price) : '-';
}

function getConfirmStatusMeta(value?: string | null) {
  if (value === 'alive') {
    return { label: '살아있음', className: 'text-emerald-700' };
  }
  if (value === 'price_changed') {
    return { label: '가격변경', className: 'text-amber-700' };
  }
  if (value === 'unavailable') {
    return { label: '종료/불가', className: 'text-rose-700' };
  }
  if (value === 'no_answer') {
    return { label: '부재중', className: 'text-slate-500' };
  }
  if (value === 'pending') {
    return { label: '답변대기', className: 'text-sky-700' };
  }
  return { label: '상태 미확인', className: 'text-slate-400' };
}

function getListingStackStyle(listings: ListingSummary[]) {
  return listings.length > 1 ? { minHeight: listings.length * PROPERTY_LISTING_STACK_ITEM_HEIGHT } : undefined;
}

function triggerStackCellEditor(event: ReactMouseEvent<HTMLTableCellElement>) {
  const target = event.target instanceof Element ? event.target : null;
  const directEditor = target?.closest('.cursor-text');
  const editors = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('.cursor-text'));
  const editor =
    directEditor instanceof HTMLElement && event.currentTarget.contains(directEditor)
      ? directEditor
      : getNearestEditorByY(editors, event.clientY);

  if (!editor) return;

  event.preventDefault();
  event.stopPropagation();
  editor.dispatchEvent(
    new MouseEvent('dblclick', {
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
    const editorDistance = Math.abs(y - (editorRect.top + editorRect.height / 2));
    const nearestDistance = Math.abs(y - (nearestRect.top + nearestRect.height / 2));
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

  return (
    <div className="-mx-2.5 flex h-full items-stretch" onClick={(event) => event.stopPropagation()}>
      <EditableCell
        recordId={intake.id}
        field="listingAvailability"
        value={availability}
        onSave={(_id, _field, value) => onChange(String(value) as ListingAvailability)}
        editType="select-chip"
        chipOptions={listingAvailabilityChipOptions}
      >
        <span className="flex h-full w-full items-center px-2.5">
          <StatusIndicator value={availability} />
        </span>
      </EditableCell>
    </div>
  );
}

function getConfirmFreshness(checkedAt: string | null) {
  const days = checkedAt ? getDaysSince(checkedAt) : null;
  if (days == null) {
    return {
      dot: 'bg-muted-foreground/40',
      date: 'text-muted-foreground',
      relative: 'text-muted-foreground/70',
    };
  }
  if (days <= 7) {
    return {
      dot: 'bg-success',
      date: 'text-foreground',
      relative: 'text-muted-foreground',
    };
  }
  if (days <= 30) {
    return {
      dot: 'bg-warning',
      date: 'text-warning',
      relative: 'text-warning/80',
    };
  }
  return {
    dot: 'bg-destructive',
    date: 'text-destructive',
    relative: 'text-destructive/80',
  };
}

function IntakeConfirmationCell({
  intake,
  onConfirm,
  isPending,
}: {
  intake: ListingIntake;
  onConfirm: (intakeId: string, result: 'alive' | 'price_changed' | 'unavailable' | 'no_answer' | 'pending') => void;
  isPending?: boolean;
}) {
  const checkedAt = intake.lastCheckedAt ?? intake.lastVerifiedAt;
  const freshness = getConfirmFreshness(checkedAt);

  return (
    <div className="flex h-8 min-w-0 items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      <span className={cn('size-[7px] shrink-0 rounded-full', freshness.dot)} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={cn('truncate text-[12px] font-medium tabular-nums', freshness.date)}>
          {checkedAt ? formatDateShort(checkedAt) : '-'}
        </span>
        <span className={cn('truncate text-[10.5px]', freshness.relative)}>
          {checkedAt ? formatDaysAgo(checkedAt) : ''}
        </span>
      </div>
      <button
        type="button"
        title="오늘로 확인 갱신"
        aria-label="오늘로 확인 갱신"
        disabled={isPending}
        className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 disabled:opacity-40 group-hover:opacity-100"
        onClick={() => onConfirm(intake.id, 'alive')}
      >
        <RefreshCw className={cn('size-3.5', isPending && 'animate-spin')} />
      </button>
    </div>
  );
}

function ListingPriceDepositStack({
  listings,
  onSave,
  onPatch,
}: {
  listings: ListingSummary[];
  onSave: (recordId: string, field: string, value: unknown) => void;
  onPatch: (recordId: string, patch: UpdateListingDto) => void;
}) {
  const hasMultiple = listings.length > 1;
  return (
    <div
      className={cn('-mx-2.5 flex h-full min-w-0 flex-col items-stretch', hasMultiple && 'divide-y divide-[#d9d9d6]')}
      style={getListingStackStyle(listings)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing) => (
        <div key={listing.id} className="flex min-w-0 flex-1 items-center">
          {listing.transactionType === 'monthly' ? (
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
              portalAnchor={hasMultiple ? 'self' : 'tableCell'}
              hoverHighlight={false}
            >
              <span className="flex h-full w-full items-center gap-1.5 px-2.5">
                {hasMultiple && <TransactionMiniLabel transactionType={listing.transactionType} />}
                <PriceDepositValue listing={listing} />
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
              portalAnchor={hasMultiple ? 'self' : 'tableCell'}
              hoverHighlight={false}
            >
              <span className="flex h-full w-full items-center gap-1.5 px-2.5">
                {hasMultiple && <TransactionMiniLabel transactionType={listing.transactionType} />}
                <PriceDepositValue listing={listing} />
              </span>
            </EditableCell>
          )}
        </div>
      ))}
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
      className={cn('-mx-2.5 flex h-full min-w-0 flex-col items-stretch', hasMultiple && 'divide-y divide-[#d9d9d6]')}
      style={getListingStackStyle(listings)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing) => (
        <div key={listing.id} className="flex min-w-0 flex-1 items-center">
          {listing.transactionType === 'monthly' ? (
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
              portalAnchor={hasMultiple ? 'self' : 'tableCell'}
              hoverHighlight={false}
            >
              <span className="flex h-full w-full items-center px-2.5">
                <MonthlyRentValue listing={listing} />
              </span>
            </EditableCell>
          ) : (
            <span className="flex h-full w-full items-center px-2.5 text-[13px] text-muted-foreground">-</span>
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
  field: 'loanAmount';
  onSave: (recordId: string, field: string, value: unknown) => void;
}) {
  const hasMultiple = listings.length > 1;
  return (
    <div
      className={cn('-mx-2.5 flex h-full min-w-0 flex-col items-stretch', hasMultiple && 'divide-y divide-[#d9d9d6]')}
      style={getListingStackStyle(listings)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing) => (
        <div key={listing.id} className="flex min-w-0 flex-1 items-center">
          <EditableCell
            recordId={listing.id}
            field={field}
            value={listing[field]}
            onSave={(recordId, savedField, value) => {
              onSave(recordId, savedField, parseEditorCellValue(value));
            }}
            editType="number"
            activation="doubleClick"
            portalAnchor={hasMultiple ? 'self' : 'tableCell'}
            hoverHighlight={false}
          >
            <span className="flex h-full w-full items-center px-2.5 text-sm font-medium tabular-nums">
              {listing[field] ? formatPrice(listing[field] as number) : '-'}
            </span>
          </EditableCell>
        </div>
      ))}
    </div>
  );
}

function PriceDepositValue({ listing }: { listing: ListingSummary }) {
  const value = listing.transactionType === 'monthly' ? listing.deposit : (listing.price ?? listing.deposit);

  return <span className="tabular-nums text-sm font-medium">{value ? formatPrice(value) : '-'}</span>;
}

function MonthlyRentValue({ listing }: { listing: ListingSummary }) {
  return (
    <span className="tabular-nums text-sm font-medium">
      {listing.monthlyRent ? formatPrice(listing.monthlyRent) : '-'}
    </span>
  );
}

function parseEditorCellValue(value: unknown) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEditorTextValue(value: unknown) {
  const trimmed = String(value ?? '').trim();
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
      variant={isOpen ? 'secondary' : 'outline'}
      size="xs"
      aria-expanded={isOpen}
      aria-controls={panelId}
      aria-label={`${count}건의 ${label} ${isOpen ? '접기' : '펼치기'}`}
      title={isOpen ? `${label} 접기` : `${label} 펼치기`}
      onClick={onToggle}
      className="min-w-11 px-1.5 text-[11px] tabular-nums shadow-none"
    >
      {icon}
      {count}
      <ChevronDown
        aria-hidden="true"
        className={cn('size-3 transition-transform duration-150', isOpen && 'rotate-180')}
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
        label="연관 구매의뢰"
        onToggle={() => onToggle(group.id)}
      />
    </div>
  );
}

function getPropertyMatchCount(group: PropertyListingGroup) {
  return group.listings.reduce((total, listing) => total + (listing._count?.matches ?? 0), 0);
}

function estimatePropertyMatchPanelHeight(group: PropertyListingGroup) {
  return 76 + Math.max(1, getPropertyMatchCount(group)) * 116;
}

function PropertyMatchPanel({ group }: { group: PropertyListingGroup }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const listingIds = useMemo(() => group.listings.map((listing) => listing.id), [group.listings]);
  const { data: matches = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['matches', 'property-list-panel', group.id, listingIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(listingIds.map((listingId) => api.matches.findAll({ listingId })));
      return results.flat();
    },
  });

  const stageMutation = useMutation({
    mutationFn: ({ matchId, stage }: { matchId: string; stage: string }) =>
      api.matches.updateStage(matchId, { stage }),
    onSuccess: () => {
      toast.success('매칭 단계를 변경했습니다.');
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || '매칭 단계 변경에 실패했습니다.');
    },
  });

  const sortedMatches = useMemo(
    () => matches.slice().sort((a, b) => getMatchStageIndex(b.stage) - getMatchStageIndex(a.stage)),
    [matches],
  );

  return (
    <div
      id={`property-match-panel-${group.id}`}
      role="region"
      aria-label={`${group.property?.site?.name ?? '매물'} 연관 구매의뢰`}
      className="border-b border-border bg-[#fbfbfa] py-3 pl-[60px] pr-4"
    >
      <div className="max-w-[1120px]">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center text-[#8f6b1f]">
              <GitBranch className="size-3.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-semibold text-foreground">연관 구매의뢰</span>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
                  {isLoading ? getPropertyMatchCount(group) : matches.length}
                </span>
                <span className="text-[11px] text-muted-foreground">진행 단계가 높은 순</span>
              </div>
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
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            구매의뢰를 불러오는 중...
          </div>
        ) : isError ? (
          <div className="flex h-20 items-center justify-between rounded-lg border border-destructive/20 bg-white px-3.5">
            <span className="text-xs text-destructive">연결된 구매의뢰를 불러오지 못했습니다.</span>
            <Button variant="outline" size="xs" onClick={() => void refetch()}>
              다시 시도
            </Button>
          </div>
        ) : sortedMatches.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            연결된 구매의뢰가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
            {sortedMatches.map((match) => (
              <MatchPanelCard
                key={match.id}
                match={match}
                pending={stageMutation.isPending && stageMutation.variables?.matchId === match.id}
                onStageChange={(stage) => stageMutation.mutate({ matchId: match.id, stage })}
              />
            ))}
          </div>
        )}
      </div>

      <MatchCreateDialog open={createOpen} onOpenChange={setCreateOpen} matches={matches} />
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
  const buyerName = buyer?.contact?.name ?? '구매자 미상';
  const buyerPhone = buyer?.contact?.phone;
  const currentIndex = getMatchStageIndex(match.stage);
  const currentStageLabel = getStatusMeta('matchStage', match.stage).label;
  const areaLabel = formatBuyerArea(buyer);
  const requirementNote = formatBuyerRequirementNote(buyer, match.memo);

  return (
    <article className="group bg-white px-3.5 py-3 transition-colors hover:bg-muted/20">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <UserRound className="size-3.5" />
          </span>
          <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">{buyerName}</span>
          {buyer?.transactionType && (
            <StatusBadge kind="transactionType" status={buyer.transactionType} size="sm" />
          )}
          {buyer?.urgency && <StatusBadge kind="buyerUrgency" status={buyer.urgency} size="sm" />}
          <span className="h-3.5 w-px shrink-0 bg-border" />
          <span className="truncate text-[10.5px] text-muted-foreground">
            {buyerPhone ? formatPhoneNumber(buyerPhone) : '연락처 없음'}
            {buyer?.assignedTo?.name ? ` · 담당 ${buyer.assignedTo.name}` : ''}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge kind="matchStage" status={match.stage} size="sm" />
          {buyerPhone && (
            <Button variant="outline" size="icon-sm" className="size-7 shrink-0 shadow-none" asChild>
              <a href={`tel:${buyerPhone}`} aria-label={`${buyerName} ${formatPhoneNumber(buyerPhone)} 전화`}>
                <Phone className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 text-[11px]">
        <div className="inline-flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">예산</span>
          <span className="whitespace-nowrap font-medium tabular-nums text-foreground">{formatBuyerBudget(buyer)}</span>
        </div>
        {areaLabel && (
          <div className="inline-flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">면적</span>
            <span className="whitespace-nowrap font-medium tabular-nums text-foreground">{areaLabel}</span>
          </div>
        )}
        {buyer?.moveInDate && (
          <div className="inline-flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">입주</span>
            <span className="whitespace-nowrap font-medium text-foreground">{formatDateShort(buyer.moveInDate)}</span>
          </div>
        )}
        {requirementNote && (
          <div className="inline-flex min-w-[240px] flex-1 items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">조건</span>
            <span className="truncate text-foreground">{requirementNote}</span>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-3 border-t border-border/70 pt-2.5">
        <div className="flex w-12 shrink-0 flex-col">
          <span className="text-[10.5px] font-medium text-muted-foreground">진행</span>
          <span className="truncate text-[9.5px] text-muted-foreground/75">{currentStageLabel}</span>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto pb-0.5">
          <div className="flex min-w-[700px] items-center">
            {MATCH_STAGE_STEPS.map((stage, index) => {
              const meta = getStatusMeta('matchStage', stage);
              const isCurrent = stage === match.stage;
              const isPassed = currentIndex >= 0 && index < currentIndex;

              return (
                <Fragment key={stage}>
                  <button
                    type="button"
                    disabled={pending || isCurrent}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={
                      isCurrent
                        ? `${meta.label}, 현재 단계`
                        : `${buyerName} 매칭 단계를 ${meta.label}(으)로 변경`
                    }
                    title={isCurrent ? '현재 단계' : `${meta.label}(으)로 변경`}
                    onClick={() => onStageChange(stage)}
                    className={cn(
                      'inline-flex h-6 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[10.5px] font-semibold transition-colors disabled:cursor-default',
                      isCurrent
                        ? 'border-foreground bg-foreground text-background'
                        : isPassed
                          ? 'border-[#ead9aa] bg-[#fbf3db]/70 text-[#8f6b1f] hover:bg-[#fbf3db]'
                          : 'border-border bg-white text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {pending && isCurrent ? <Loader2 className="size-3 animate-spin" /> : meta.label}
                  </button>
                  {index < MATCH_STAGE_STEPS.length - 1 && (
                    <span
                      data-match-stage-connector="true"
                      aria-hidden="true"
                      className={cn(
                        'mx-1.5 h-px min-w-3 flex-1',
                        index < currentIndex ? 'bg-[#dfc56d]' : 'bg-border',
                      )}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

function formatBuyerBudget(buyer?: BuyerRequirement) {
  if (!buyer) return '-';
  if (buyer.transactionType === 'monthly') {
    const deposit = buyer.depositMax ?? buyer.depositMin;
    const parts = [
      deposit ? formatMoney(deposit) : null,
      buyer.monthlyRentMax ? `월 ${formatMoney(buyer.monthlyRentMax)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : '-';
  }

  const min = buyer.priceMin ?? buyer.depositMin;
  const max = buyer.priceMax ?? buyer.depositMax;
  if (min && max && min !== max) return `${formatMoney(min)} ~ ${formatMoney(max)}`;
  return formatMoney(max ?? min).replace('—', '-');
}

function formatBuyerArea(buyer?: BuyerRequirement) {
  if (!buyer) return null;
  const min = buyer.areaMin ? formatAreaPyeong(buyer.areaMin) : null;
  const max = buyer.areaMax ? formatAreaPyeong(buyer.areaMax) : null;
  if (min && max && min !== max) return `${min} ~ ${max}`;
  return max ?? min;
}

function formatBuyerRequirementNote(buyer: BuyerRequirement | undefined, matchMemo: string | null) {
  const conditions = [
    ...(buyer?.mustConditions ?? []),
    ...(buyer?.preferConditions ?? []),
  ].filter((condition) => condition.trim());
  if (conditions.length > 0) {
    const visible = conditions.slice(0, 3).join(' · ');
    return conditions.length > 3 ? `${visible} 외 ${conditions.length - 3}개` : visible;
  }
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
  const adCount = getPropertyAdRows(group).length;

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
    (listing.advertisements ?? []).map((advertisement) => ({
      listing,
      advertisement,
    })),
  );
}

function PropertyAdPanel({ group }: { group: PropertyListingGroup }) {
  const adRows = getPropertyAdRows(group);

  return (
    <div
      id={`property-ad-panel-${group.id}`}
      role="region"
      aria-label={`${group.property?.site?.name ?? '매물'} 광고 현황`}
      className="border-b border-border bg-[#f3f9fb] py-3 pl-[60px] pr-4"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Megaphone className="size-3.5 text-[#337ea9]" />
        <span className="text-xs font-semibold text-[#337ea9]">광고 노출 {adRows.length}개</span>
        <span className="text-[11.5px] text-[#6b9fba]">· CP사별 현황</span>
      </div>

      {adRows.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 광고가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[650px] max-w-[760px]">
            <div className="flex items-center gap-1.5 pb-1.5 pl-[13px] pr-1">
              <span className="w-[52px] shrink-0 text-[11px] font-semibold text-muted-foreground">거래</span>
              <span className="w-[128px] shrink-0 text-[11px] font-semibold text-muted-foreground">CP사</span>
              <span className="w-[72px] shrink-0 text-[11px] font-semibold text-muted-foreground">상태</span>
              <span className="w-[130px] shrink-0 text-[11px] font-semibold text-muted-foreground">가격/보증금</span>
              <span className="w-[90px] shrink-0 text-[11px] font-semibold text-muted-foreground">월세</span>
              <span className="w-[72px] shrink-0 text-[11px] font-semibold text-muted-foreground">등록일</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {adRows.map(({ listing, advertisement }) => {
                const statusMeta = adStatusMeta[advertisement.status] ?? adStatusMeta.draft;
                const advertisedPrice = advertisement.advertisedPrice ?? advertisement.advertisedDeposit;

                return (
                  <div
                    key={advertisement.id}
                    className="flex items-center gap-1.5 rounded-lg border border-[#d8ebf3] bg-white px-3 py-2"
                  >
                    <div className="w-[52px] shrink-0">
                      <TransactionMiniLabel transactionType={listing.transactionType} />
                    </div>
                    <div className="w-[128px] shrink-0 truncate text-[13px] font-semibold text-foreground">
                      {getAdChannelLabel(advertisement.channel)}
                    </div>
                    <div className="w-[72px] shrink-0">
                      <span
                        className={cn(
                          'inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-5',
                          statusMeta.className,
                        )}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className="w-[130px] shrink-0 truncate text-[12.5px] font-medium tabular-nums text-foreground">
                      {advertisedPrice != null ? formatPrice(advertisedPrice) : '-'}
                    </div>
                    <div className="w-[90px] shrink-0 truncate text-[12.5px] tabular-nums text-foreground/70">
                      {advertisement.advertisedMonthlyRent != null
                        ? formatPrice(advertisement.advertisedMonthlyRent)
                        : '-'}
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
  intake: PropertyListingGroup['representative'];
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
      hoverHighlight={false}
    >
      <p className="line-clamp-2 min-w-0 px-2.5 text-[11px] leading-snug text-slate-600">
        {value || <span className="text-slate-400">-</span>}
      </p>
    </EditableCell>
  );
}

const moveInAvailableChipOptions: ChipOption[] = [
  {
    value: 'immediate',
    label: '즉시',
    className: 'bg-[#eef3ed] text-[#44745a]',
  },
  {
    value: 'date',
    label: '특정일 이후',
    className: 'bg-[#e7f3f8] text-[#337ea9]',
    picker: 'date',
    fromField: 'moveInAvailableFrom',
    getPreselect: (rowValue) => {
      const listing = rowValue as ListingSummary | undefined;
      const raw = listing?.moveInAvailableFrom;
      if (!raw) return undefined;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? undefined : d;
    },
  },
  {
    value: 'range',
    label: '기간 협의',
    className: 'bg-[#fbf3db] text-[#8f6b1f]',
    picker: 'range',
    fromField: 'moveInAvailableFrom',
    toField: 'moveInAvailableTo',
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
    value: 'negotiable',
    label: '협의',
    className: 'bg-[#fbf3db] text-[#8f6b1f]',
  },
  {
    value: 'unknown',
    label: '확인 필요',
    className: 'bg-[#f1f1ef] text-[#787774]',
  },
];

function MoveInAvailableStack({
  listings,
  onPatch,
}: {
  listings: ListingSummary[];
  onPatch: (recordId: string, patch: UpdateListingDto) => void;
}) {
  return (
    <div
      className={cn(
        '-mx-2.5 flex h-full min-w-0 flex-col items-stretch',
        listings.length > 1 && 'divide-y divide-[#d9d9d6]',
      )}
      style={getListingStackStyle(listings)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing) => (
        <div key={listing.id} className="flex min-w-0 flex-1 items-center">
          <EditableCell
            recordId={listing.id}
            field="moveInAvailableType"
            value={listing}
            chipValueOf={(v) => (v as ListingSummary | undefined)?.moveInAvailableType ?? 'unknown'}
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
          'inline-flex w-fit max-w-full whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-5',
          summary.className,
        )}
      >
        <span className="truncate">{summary.label}</span>
      </span>
      {summary.detail && <span className="truncate text-[11px] text-slate-500">{summary.detail}</span>}
    </div>
  );
}

function TransactionBadge({ transactionType }: { transactionType: string }) {
  const transactionMeta = transactionTypeMeta[transactionType];
  return (
    <span
      className={cn(
        'inline-flex max-w-full rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
        transactionMeta?.className ?? 'bg-[#f1f1ef] text-[#787774]',
      )}
    >
      {transactionMeta?.label ?? transactionType}
    </span>
  );
}

function TransactionMiniLabel({ transactionType }: { transactionType: string }) {
  const transactionMeta = transactionTypeMeta[transactionType];
  return (
    <span
      className={cn(
        'inline-flex min-w-8 justify-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5',
        transactionMeta?.className ?? 'bg-[#f1f1ef] text-[#787774]',
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
    ? '공동'
    : `공동필수${intake.jointBrokeragePartner?.name ? ` · ${intake.jointBrokeragePartner.name}` : ''}`;

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
            'h-8 max-w-[240px] gap-1.5 rounded-md border text-xs',
            onClear && active ? 'pl-2.5 pr-1.5' : 'px-2.5',
            // 활성: 강한 inverse (모노톤)
            active && 'border-foreground/25 bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.09]',
            // 비활성 + tier별 weight
            !active && tier === 1 && 'border-border bg-white text-foreground hover:border-foreground/40',
            !active && tier === 2 && 'border-transparent text-muted-foreground hover:border-border hover:bg-white',
            !active && tier === 3 && 'border-transparent text-muted-foreground/70 hover:border-border hover:bg-white',
          )}
        >
          <span className={cn('shrink-0', active ? 'text-muted-foreground' : 'text-muted-foreground')}>{label}</span>
          <span
            className={cn('min-w-0 truncate', active ? 'font-semibold text-foreground' : 'font-medium text-foreground')}
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
      <PopoverContent align="start" className={cn('w-80 p-3', contentClassName)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function PopoverTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>
    </div>
  );
}

function FilterField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function SelectFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const SENTINEL = '__all__';
  return (
    <Select value={value === '' ? SENTINEL : value} onValueChange={(next) => onChange(next === SENTINEL ? '' : next)}>
      <SelectTrigger size="sm" className="w-full border-border bg-white text-[13px] text-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value === '' ? SENTINEL : option.value} className="text-[13px]">
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
      tickLabels={['전체', '10억', '20억', '최대']}
      formatLabel={formatPriceRangeLabel}
      thumbLabels={['최소 가격', '최대 가격']}
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
  const [selectedPresetSpan, setSelectedPresetSpan] = useState<[number, number] | null>(() =>
    getNumericPresetSpan(initialRange, segments),
  );
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
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>
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
              (segmentIndex === selectedPresetSpan[0] || segmentIndex === selectedPresetSpan[1]);
            const isAllSelected = isAllPreset && selectedPresetSpan === null && isFullRange;
            const isSelected = isInSelectedSpan || isAllSelected;
            return (
              <Button
                key={preset.label}
                type="button"
                variant={isSpanEdge || isAllSelected ? 'default' : 'ghost'}
                size="sm"
                aria-pressed={isSelected}
                data-range-state={isSelected ? (isSpanEdge || isAllSelected ? 'edge' : 'inside') : 'off'}
                onClick={() => handlePresetClick(preset)}
                className={cn(
                  'h-8 rounded-none border-b border-r px-1 text-[11px] shadow-none',
                  isInSelectedSpan &&
                    !isSpanEdge &&
                    'bg-muted text-foreground hover:bg-muted hover:text-foreground',
                  !isSelected && 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
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
            <Button type="button" variant="outline" size="sm" onClick={onCancel} className="text-[11px]">
              취소
            </Button>
            <Button type="button" size="sm" onClick={() => onApply(draftRange)} className="text-[11px]">
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
    { label: '1개월 내', months: 1 },
    { label: '3개월 내', months: 3 },
    { label: '6개월 내', months: 6 },
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
              onFromChange('');
              onToChange('');
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

  if (filters.siteIds.length > 0) params.siteIds = filters.siteIds.join(',');
  if (filters.provinceCode) params.provinceCode = filters.provinceCode;
  if (filters.districtCode) params.districtCode = filters.districtCode;
  if (filters.wardCode) params.wardCode = filters.wardCode;
  if (filters.siteTypes.length > 0) params.siteTypes = filters.siteTypes.join(',');
  if (filters.availabilities.length > 0) params.availabilities = filters.availabilities.join(',');
  // 가격(매매가/전세가)은 state를 억 단위로 보관 → API는 만원 단위 (×10000)
  addEokParam(params, 'priceMin', filters.priceMin);
  addEokParam(params, 'priceMax', filters.priceMax);
  // 보증금·월세는 만원 단위 그대로 (월세를 억으로 받으면 200→200억 버그)
  addNumberParam(params, 'depositMin', filters.depositMin);
  addNumberParam(params, 'depositMax', filters.depositMax);
  addNumberParam(params, 'monthlyRentMin', filters.monthlyRentMin);
  addNumberParam(params, 'monthlyRentMax', filters.monthlyRentMax);

  if (filters.advertisement !== 'all') {
    params.hasAdvertisement = filters.advertisement === 'with';
  }
  if (filters.moveInFrom) params.moveInFrom = filters.moveInFrom;
  if (filters.moveInTo) params.moveInTo = filters.moveInTo;

  const areaMin = parseNumberFilter(filters.areaMin);
  const areaMax = parseNumberFilter(filters.areaMax);
  if (areaMin !== undefined) params.areaMin = pyeongToSquareMeters(areaMin);
  if (areaMax !== undefined) params.areaMax = pyeongToSquareMeters(areaMax);

  return params;
}

function addNumberParam(params: Record<string, string | number | boolean | undefined>, key: string, value: string) {
  const numberValue = parseNumberFilter(value);
  if (numberValue !== undefined) params[key] = numberValue;
}

/** 억 단위 입력값을 만원 단위 API 파라미터로 변환 (1억 = 10,000만원). */
function addEokParam(params: Record<string, string | number | boolean | undefined>, key: string, value: string) {
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
  transactionType: (typeof transactionTypeOptions)[number]['value'],
) {
  const usesDeposit = transactionType === 'monthly';
  const minValue = usesDeposit ? filters.depositMin : filters.priceMin;
  const maxValue = usesDeposit ? filters.depositMax : filters.priceMax;
  if (!minValue.trim() && !maxValue.trim()) return null;

  const range = getPriceRangeFilter(filters, transactionType);
  return formatPriceRangeLabel(range[0], range[1]);
}

function getPriceRangeFilter(
  filters: PropertyFilterState,
  transactionType: (typeof transactionTypeOptions)[number]['value'],
): [number, number] {
  const usesDeposit = transactionType === 'monthly';
  const divisor = usesDeposit ? 10000 : 1;
  const rawMin = parseNumberFilter(usesDeposit ? filters.depositMin : filters.priceMin);
  const rawMax = parseNumberFilter(usesDeposit ? filters.depositMax : filters.priceMax);
  const min = clampPriceRange(rawMin === undefined ? PRICE_RANGE_MIN : rawMin / divisor);
  const max = clampPriceRange(rawMax === undefined ? PRICE_RANGE_MAX : rawMax / divisor);

  return min <= max ? [min, max] : [max, min];
}

function getMonthlyRentRangeFilter(filters: PropertyFilterState): [number, number] {
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
  transactionType: (typeof transactionTypeOptions)[number]['value'],
  rawMin: number,
  rawMax: number,
) {
  const min = clampPriceRange(Math.min(rawMin, rawMax));
  const max = clampPriceRange(Math.max(rawMin, rawMax));
  const minValue = min <= PRICE_RANGE_MIN ? '' : formatRangeNumber(min);
  const maxValue = max >= PRICE_RANGE_MAX ? '' : formatRangeNumber(max);

  if (transactionType === 'monthly') {
    return {
      ...filters,
      priceMin: '',
      priceMax: '',
      depositMin: minValue ? eokToManwon(minValue) : '',
      depositMax: maxValue ? eokToManwon(maxValue) : '',
    };
  }

  return {
    ...filters,
    priceMin: minValue,
    priceMax: maxValue,
    depositMin: '',
    depositMax: '',
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
    min <= rangeMin ? '' : formatRangeNumber(min),
    max >= rangeMax ? '' : formatRangeNumber(max),
  ];
}

function movePriceRangeForTransaction(
  filters: PropertyFilterState,
  transactionType: (typeof transactionTypeOptions)[number]['value'],
) {
  if (transactionType === 'monthly') {
    const hasDepositRange = Boolean(filters.depositMin || filters.depositMax);
    return {
      ...filters,
      priceMin: '',
      priceMax: '',
      depositMin: hasDepositRange ? filters.depositMin : eokToManwon(filters.priceMin),
      depositMax: hasDepositRange ? filters.depositMax : eokToManwon(filters.priceMax),
    };
  }

  const hasPriceRange = Boolean(filters.priceMin || filters.priceMax);
  return {
    ...filters,
    priceMin: hasPriceRange ? filters.priceMin : manwonToEok(filters.depositMin),
    priceMax: hasPriceRange ? filters.priceMax : manwonToEok(filters.depositMax),
    depositMin: '',
    depositMax: '',
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
  if (min <= PRICE_RANGE_MIN && max >= PRICE_RANGE_MAX) return '전체 가격';
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
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function eokToManwon(value: string) {
  const numberValue = parseNumberFilter(value);
  return numberValue === undefined ? '' : formatRangeNumber(numberValue * 10000);
}

function manwonToEok(value: string) {
  const numberValue = parseNumberFilter(value);
  return numberValue === undefined ? '' : formatRangeNumber(numberValue / 10000);
}

function getOptionLabel(options: ReadonlyArray<{ value: string; label: string }>, value: string) {
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
    listings: (intake.listings ?? []).map(toListingSummary).sort(compareListingSummary),
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
      address: site.roadAddress ?? site.jibunAddress ?? '주소 미등록',
      lat,
      lng,
      groups: [group],
      groupCount: 1,
      listingCount: group.listings.length,
    });
  }

  return {
    points: Array.from(pointMap.values()).sort(
      (a, b) => b.groups.length - a.groups.length || a.siteName.localeCompare(b.siteName),
    ),
    missingGroups,
  };
}

function readCoordinate(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
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
  if (!property?.unit) return '';
  return [getDongName(property), property.unit.name].filter((item) => item && item !== '-').join(' ');
}

function getPropertyMapPriceLabel(listings: ListingSummary[]) {
  if (listings.length === 0) return '가격 미등록';
  return listings
    .slice(0, 2)
    .map((listing) => {
      if (listing.transactionType === 'monthly') {
        const deposit = listing.deposit ? formatPrice(listing.deposit) : '-';
        const rent = listing.monthlyRent ? formatPrice(listing.monthlyRent) : '-';
        return `${deposit}/${rent}`;
      }
      const price = listing.transactionType === 'jeonse' ? listing.deposit : listing.price;
      return price ? formatPrice(price) : '-';
    })
    .join(' · ');
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
    advertisements: listing.advertisements,
    priceHistories: listing.priceHistories,
    _count: listing._count,
  };
}

function compareListingSummary(a: ListingSummary, b: ListingSummary) {
  const typeOrder = getTransactionTypeOrder(a.transactionType) - getTransactionTypeOrder(b.transactionType);
  if (typeOrder !== 0) return typeOrder;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function getTransactionTypeOrder(value: string) {
  if (value === 'sale') return 0;
  if (value === 'jeonse') return 1;
  if (value === 'monthly') return 2;
  return 99;
}

function getOwnerContact(property?: ListingProperty) {
  const contacts = property?.propertyContacts ?? [];
  const owner = contacts.find((propertyContact) => propertyContact.role === 'owner');
  return owner?.contact ?? null;
}

function getAdChannelLabel(channel: string) {
  return adChannelLabels[channel] ?? channel;
}

function getAdvertisementSourceLabel(source: string) {
  if (source === 'manual') return '입력';
  if (source === 'external_observed') return '외부확인';
  if (source === 'cp_sync') return 'CP연동';
  return source;
}

function getPropertySheetAdvertisementCount(listings: PropertyListing[]) {
  return listings.reduce((total, listing) => total + (listing.advertisements?.length ?? 0), 0);
}

function getPropertySheetPriceHistoryCount(listings: PropertyListing[]) {
  return listings.reduce((total, listing) => total + (listing.priceHistories?.length ?? 0), 0);
}

function formatPriceHistorySnapshot(
  transactionType: string,
  value: {
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
  },
) {
  if (transactionType === 'monthly') {
    const deposit = value.deposit ? formatPrice(value.deposit) : '-';
    const monthlyRent = value.monthlyRent ? formatPrice(value.monthlyRent) : '-';
    return `${deposit} / ${monthlyRent}`;
  }

  const price = value.price ?? value.deposit;
  return price ? formatPrice(price) : '-';
}

function formatAdvertisementPrice(
  listing: Pick<PropertyListing, 'transactionType'>,
  advertisement: NonNullable<PropertyListing['advertisements']>[number],
) {
  if (listing.transactionType === 'monthly') {
    const deposit = advertisement.advertisedDeposit ? formatPrice(advertisement.advertisedDeposit) : '-';
    const monthlyRent = advertisement.advertisedMonthlyRent ? formatPrice(advertisement.advertisedMonthlyRent) : '-';
    return `${deposit} / ${monthlyRent}`;
  }

  const price = advertisement.advertisedPrice ?? advertisement.advertisedDeposit;
  return price ? formatPrice(price) : '-';
}

function getDongName(property?: ListingProperty) {
  const dong = property?.unit?.dong;
  if (!dong || dong.isPlaceholder) return '-';
  return dong.name.replace(/\s*동$/, '');
}

function getExclusiveAreaM2(property?: ListingProperty) {
  return property?.unit?.exclusiveAreaM2 ?? property?.unit?.siteUnitType?.exclusiveAreaM2;
}

function getUnitTypeName(property?: ListingProperty) {
  return property?.unit?.siteUnitType?.name ?? '-';
}

function getSiteTypeLabel(value?: string | null) {
  if (!value) return '-';
  return getOptionLabel(siteTypeOptions, value);
}

function getPropertySheetUnitLabel(property: Property) {
  const dongName = property.unit?.dong && !property.unit.dong.isPlaceholder ? property.unit.dong.name : '';
  return [dongName, property.unit?.name].filter(Boolean).join(' ');
}

function getPropertySheetExclusiveAreaM2(property: Property) {
  return property.unit?.exclusiveAreaM2 ?? property.unit?.siteUnitType?.exclusiveAreaM2;
}

function getPropertySheetSupplyAreaM2(property: Property) {
  return property.unit?.supplyAreaM2 ?? property.unit?.siteUnitType?.supplyAreaM2;
}

function formatPropertySheetArea(property: Property) {
  const exclusive = getPropertySheetExclusiveAreaM2(property);
  const supply = getPropertySheetSupplyAreaM2(property);

  if (exclusive && supply) {
    return `전용 ${formatAreaPyeong(exclusive)} · 공급 ${formatAreaPyeong(supply)}`;
  }
  if (exclusive) return `전용 ${formatAreaPyeong(exclusive)}`;
  if (supply) return `공급 ${formatAreaPyeong(supply)}`;
  return '-';
}

function getLatestPropertyListingUpdatedAt(property: Property) {
  const latestListingUpdatedAt = (property.listings ?? []).reduce<string | null>((latest, listing) => {
    if (!latest) return listing.updatedAt;
    return new Date(listing.updatedAt).getTime() > new Date(latest).getTime() ? listing.updatedAt : latest;
  }, null);

  return latestListingUpdatedAt ?? property.updatedAt;
}

function comparePropertyListing(a: PropertyListing, b: PropertyListing) {
  const typeOrder = getTransactionTypeOrder(a.transactionType) - getTransactionTypeOrder(b.transactionType);
  if (typeOrder !== 0) return typeOrder;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function getPropertySheetNotices(property: Property): PropertySheetNotice[] {
  const listings = property.listings ?? [];
  const contacts = property.propertyContacts ?? [];
  const tenants = property.tenants ?? [];
  const consultations = property.consultations ?? [];
  const notices: PropertySheetNotice[] = [];
  const owner = contacts.find((contact) => contact.role === 'owner') ?? contacts[0];
  const latestUpdatedAt = getLatestPropertyListingUpdatedAt(property);
  const daysSinceLatestCheck = getDaysSince(latestUpdatedAt);
  const unverifiedListings = listings.filter(
    (listing) => listing.intake && getIntakeConfirmationState(listing.intake) === IntakeConfirmationState.UNVERIFIED,
  );
  const jointRequiredListings = listings.filter((listing) => listing.intake?.isJointBrokerageRequired);
  const expiringTenant = tenants.find((tenant) => {
    if (!tenant.contractEnd) return false;
    const daysUntilEnd = getDaysUntil(tenant.contractEnd);
    return daysUntilEnd >= 0 && daysUntilEnd <= 45;
  });

  if (listings.length === 0) {
    notices.push({
      title: '거래 정보 없음',
      detail: '매매, 전세, 월세 중 등록된 거래 카드가 없습니다.',
      tone: 'danger',
    });
  }

  if (unverifiedListings.length > 0) {
    notices.push({
      title: '확인 필요한 거래',
      detail: `${formatTransactionTypeList(unverifiedListings)} ${unverifiedListings.length}건이 미확인 상태입니다.`,
      tone: 'warning',
    });
  }

  if (jointRequiredListings.length > 0) {
    notices.push({
      title: '공동중개 필수',
      detail: `${formatJointBrokerageRequirementList(jointRequiredListings)} 조건을 확인해야 합니다.`,
      tone: 'warning',
    });
  }

  if (!owner?.contact?.phone) {
    notices.push({
      title: '소유주 연락처 없음',
      detail: '목록에서 바로 전화할 수 있도록 소유주 또는 대리인 번호를 등록해야 합니다.',
      tone: 'danger',
    });
  }

  if (daysSinceLatestCheck !== null && daysSinceLatestCheck >= 30) {
    notices.push({
      title: '확인일 오래됨',
      detail: `마지막 확인이 ${daysSinceLatestCheck}일 전입니다. 광고 유지 전 소유주 확인이 필요합니다.`,
      tone: 'warning',
    });
  }

  if (expiringTenant?.contractEnd) {
    notices.push({
      title: '임차 계약 만기 임박',
      detail: `${expiringTenant.contact?.name ?? '임차인'} 계약 종료가 ${formatDateShort(expiringTenant.contractEnd)}입니다.`,
      tone: 'warning',
    });
  }

  const hasAnyListingMemo = listings.some((listing) => listing.memo?.trim());
  if (!hasAnyListingMemo && consultations.length === 0) {
    notices.push({
      title: '상담 기록 없음',
      detail: '최근 통화나 확인 메모가 없어 매물 히스토리를 판단하기 어렵습니다.',
      tone: 'neutral',
    });
  }

  return notices.slice(0, 5);
}

function formatDateShort(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getContactRoleLabel(role: string) {
  return contactRoleLabels[role] ?? role;
}

function getTenantPeriodLabel(tenant: Tenant) {
  if (!tenant.contractStart && !tenant.contractEnd) return '계약 기간 미등록';
  return `${formatDateShort(tenant.contractStart)} - ${formatDateShort(tenant.contractEnd)}`;
}

function getTenantStatusLabel(status: string) {
  if (status === 'residing') return '거주중';
  if (status === 'moving_out') return '퇴거예정';
  if (status === 'moved') return '퇴거완료';
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
  if (days === null) return '-';
  if (days === 0) return '오늘';
  return `${days}일 전`;
}

function formatTransactionTypeList(listings: Pick<PropertyListing, 'transactionType'>[]) {
  const labels = Array.from(
    new Set(listings.map((listing) => transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType)),
  );
  return labels.join(', ');
}

function formatJointBrokerageRequirementList(listings: Pick<PropertyListing, 'transactionType' | 'intake'>[]) {
  return listings
    .map((listing) => {
      const transactionLabel = transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType;
      return listing.intake?.jointBrokeragePartner?.name
        ? `${transactionLabel} ${listing.intake.jointBrokeragePartner.name}`
        : `${transactionLabel} 파트너 미지정`;
    })
    .join(', ');
}

function formatAreaPyeong(value?: number | null) {
  if (!value) return '-';
  const squareMeters = Number(value);
  return `${(squareMeters * 0.3025).toFixed(1)}평`;
}
