import { createFileRoute, Link } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  DoorOpen,
  ExternalLink,
  FileText,
  Handshake,
  Hash,
  MapPin,
  Megaphone,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  Tag,
  Type,
  User,
  X,
} from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { api } from '@/lib/api';
import { ApiError } from '@estate-erp/api-client';
import type {
  Consultation,
  ListingIntake,
  ListingFilterSite,
  Property,
  PropertyContact,
  PropertyListing,
  Tenant,
  UpdateListingDto,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/contacts';
import {
  PriceCell,
  CellEditProvider,
  EditableCell,
  type SortDefinition,
  type ChipOption,
} from '@/components/data-table';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { getListingIntakeStatusOptions, getMoveInAvailability } from './-property-list-view-utils';
import {
  PropertyListingsTable,
  type ListingSummary,
  type PropertyListingGroup,
} from './-components/property-listings-table';

// ── Labels & Colors ─────────────────────────────────────────────

const checkStatusMeta: Record<string, { label: string; dotClassName: string; pillClassName: string }> = {
  unverified: { label: '미확인', dotClassName: 'bg-[#9b9a97]', pillClassName: 'bg-[#f1f1ef] text-[#5f5e5b]' },
  verified: { label: '확인완료', dotClassName: 'bg-[#6c9b7a]', pillClassName: 'bg-[#eef3ed] text-[#44745a]' },
  in_contract: { label: '거래중', dotClassName: 'bg-[#529cca]', pillClassName: 'bg-[#e7f3f8] text-[#337ea9]' },
  hold: { label: '보류', dotClassName: 'bg-[#dfab01]', pillClassName: 'bg-[#fbf3db] text-[#9f6b00]' },
  done: { label: '종료', dotClassName: 'bg-[#b4b4b1]', pillClassName: 'bg-[#f1f1ef] text-[#787774]' },
};

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-[#fdebec] text-[#8f4b46]' },
  jeonse: { label: '전세', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  monthly: { label: '월세', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
};

const adStatusMeta: Record<string, { label: string; className: string }> = {
  planned: { label: '보류', className: 'bg-[#f1f1ef] text-[#5f5e5b]' },
  draft: { label: '준비', className: 'bg-[#f1f1ef] text-[#787774]' },
  active: { label: '광고중', className: 'bg-[#eef3ed] text-[#44745a]' },
  paused: { label: '중단', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
  ended: { label: '종료', className: 'bg-[#f1f1ef] text-[#787774]' },
  error: { label: '오류', className: 'bg-[#fbe4e4] text-[#9f5555]' },
};

const intakeStatusMeta: Record<string, { label: string; className: string }> = {
  unverified: { label: '미확인', className: 'bg-[#f1f1ef] text-[#5f5e5b]' },
  verified: { label: '확인완료', className: 'bg-[#eef3ed] text-[#44745a]' },
  in_contract: { label: '거래중', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  hold: { label: '보류', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
  done: { label: '종료', className: 'bg-[#f1f1ef] text-[#787774]' },
  active: { label: '미확인', className: 'bg-[#f1f1ef] text-[#5f5e5b]' },
  paused: { label: '보류', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
  completed: { label: '종료', className: 'bg-[#f1f1ef] text-[#787774]' },
  cancelled: { label: '종료', className: 'bg-[#f1f1ef] text-[#787774]' },
  alive: { label: '살아있음', className: 'bg-[#eef3ed] text-[#44745a]' },
  price_changed: { label: '가격변경', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
  unavailable: { label: '불가', className: 'bg-[#fbe4e4] text-[#9f5555]' },
  no_answer: { label: '부재중', className: 'bg-[#f1f1ef] text-[#787774]' },
  pending: { label: '답변대기', className: 'bg-[#e7f3f8] text-[#337ea9]' },
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

const sortDefinitions = [
  { field: 'price', label: '가격' },
  { field: 'createdAt', label: '등록일' },
  { field: 'updatedAt', label: '확인일' },
];

const sortOptions = [
  { value: 'price:asc', field: 'price', label: '가격 낮은순', direction: 'asc' },
  { value: 'price:desc', field: 'price', label: '가격 높은순', direction: 'desc' },
] satisfies Array<{ value: string; field: string; label: string; direction: 'asc' | 'desc' }>;

const sortFilterOptions = [
  { value: '', label: '정렬' },
  ...sortOptions.map((option) => ({ value: option.value, label: option.label })),
];

const LISTINGS_PAGE_SIZE = 50;
const intakeStatusOptions = getListingIntakeStatusOptions();

function handleMutationError(error: unknown) {
  if (error instanceof ApiError && error.statusCode === 409) {
    toast.error('다른 사용자가 먼저 수정했습니다. 최신 내용으로 다시 불러옵니다.');
    return;
  }

  toast.error('저장에 실패했습니다.');
}
const PROPERTY_LISTING_STACK_ITEM_HEIGHT = 40;

const transactionTypeOptions = [
  { value: 'all', label: '전체' },
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
] as const;

const siteTypeOptions = [
  { value: 'all', label: '전체' },
  { value: 'apartment', label: '아파트' },
  { value: 'officetel', label: '오피스텔' },
  { value: 'villa', label: '빌라' },
  { value: 'house', label: '단독/다가구' },
  { value: 'commercial', label: '상가' },
  { value: 'land', label: '토지' },
  { value: 'living_accommodation', label: '생활숙박' },
] as const;

const intakeStatusFilterOptions = [
  { value: 'all', label: '전체' },
  ...intakeStatusOptions,
] as const;

interface PropertyFilterState {
  siteId: string;
  siteType: string;
  intakeStatus: string;
  priceMin: string;
  priceMax: string;
  depositMin: string;
  depositMax: string;
  monthlyRentMin: string;
  monthlyRentMax: string;
  areaMin: string;
  areaMax: string;
  includeHidden: boolean;
}

const initialPropertyFilters: PropertyFilterState = {
  siteId: '',
  siteType: 'all',
  intakeStatus: 'all',
  priceMin: '',
  priceMax: '',
  depositMin: '',
  depositMax: '',
  monthlyRentMin: '',
  monthlyRentMax: '',
  areaMin: '',
  areaMax: '',
  includeHidden: false,
};

type ListingProperty = NonNullable<ListingIntake['property']>;

type PropertySheetNoticeTone = 'danger' | 'warning' | 'neutral';

interface PropertySheetNotice {
  title: string;
  detail: string;
  tone: PropertySheetNoticeTone;
}

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/properties/')({
  component: PropertiesPage,
});

function PropertiesPage() {
  const queryClient = useQueryClient();

  // ── State ─────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedTransactionType, setSelectedTransactionType] =
    useState<(typeof transactionTypeOptions)[number]['value']>('all');
  const [propertyFilters, setPropertyFilters] = useState<PropertyFilterState>(initialPropertyFilters);
  const [selectedIntakeId, setSelectedIntakeId] = useState<string | null>(null);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: filterSites = [], isLoading: isFilterSitesLoading } = useQuery({
    queryKey: ['listings', 'filter-sites', propertyFilters.includeHidden],
    queryFn: () => api.listings.filterSites({
      includeHidden: propertyFilters.includeHidden || undefined,
    }),
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
      includeInactive: true,
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
  }, [debouncedSearch, propertyFilters, selectedTransactionType, activeSorts]);

  // ── Query ─────────────────────────────────────────────────────
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['listing-intakes', apiParams],
    queryFn: ({ pageParam }) =>
      api.listingIntakes.findAll({ ...apiParams, page: pageParam } as any),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page: currentPage, totalPages } = lastPage.pagination;
      return currentPage < totalPages ? currentPage + 1 : undefined;
    },
  });

  const listingIntakes = useMemo(
    () => data?.pages.flatMap((pageData) => pageData.items) ?? [],
    [data?.pages],
  );
  const totalIntakes = data?.pages[0]?.pagination.total ?? 0;
  const loadedIntakes = listingIntakes.length;
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

  const propertyGroups = useMemo(
    () => buildPropertyListingGroups(listingIntakes),
    [listingIntakes],
  );
  const activeFilterSummary = getActiveFilterSummary({
    search,
    selectedTransactionType,
    propertyFilters,
    selectedSiteName: propertyFilters.siteId
      ? sitesById.get(propertyFilters.siteId)?.name
      : undefined,
    activeSorts,
  });

  const selectedSortValue =
    activeSorts.length > 0 &&
    sortOptions.some((option) => option.value === `${activeSorts[0].field}:${activeSorts[0].direction}`)
      ? `${activeSorts[0].field}:${activeSorts[0].direction}`
      : '';
  const selectedSite = propertyFilters.siteId
    ? sitesById.get(propertyFilters.siteId)
    : undefined;
  const amountFilterSummary = getAmountFilterSummary(propertyFilters);
  const areaFilterSummary = getRangeSummary(propertyFilters.areaMin, propertyFilters.areaMax, '평');
  const hasActiveFilters = Boolean(
    search.trim() ||
      propertyFilters.siteId ||
      propertyFilters.siteType !== 'all' ||
      propertyFilters.intakeStatus !== 'all' ||
      propertyFilters.priceMin ||
      propertyFilters.priceMax ||
      propertyFilters.depositMin ||
      propertyFilters.depositMax ||
      propertyFilters.monthlyRentMin ||
      propertyFilters.monthlyRentMax ||
      propertyFilters.areaMin ||
      propertyFilters.areaMax ||
      propertyFilters.includeHidden ||
      activeSorts.length > 0,
  );

  // ── Inline edit mutation ──────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateListingDto }) =>
      api.listings.update(id, patch),
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
        queryClient.invalidateQueries({ queryKey: ['listing-intakes', 'quick-sheet', selectedIntakeId] });
      }
    },
    onError: (error) => {
      handleMutationError(error);
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
    },
  });
  const intakeStatusMutation = useMutation({
    mutationFn: ({
      intakeId,
      status,
      expectedUpdatedAt,
    }: {
      intakeId: string;
      status: string;
      expectedUpdatedAt?: string | null;
    }) =>
      api.listingIntakes.updateStatus(intakeId, status, { expectedUpdatedAt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
      if (selectedIntakeId) {
        queryClient.invalidateQueries({ queryKey: ['listing-intakes', 'quick-sheet', selectedIntakeId] });
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
    (
      intakeId: string,
      result: 'alive' | 'price_changed' | 'unavailable' | 'no_answer' | 'pending',
    ) => {
      confirmMutation.mutate({
        intakeId,
        result,
        expectedUpdatedAt: intakeUpdatedAtById.get(intakeId),
      });
    },
    [confirmMutation, intakeUpdatedAtById],
  );
  const handleIntakeStatusChange = useCallback(
    (intakeId: string, status: string) => {
      intakeStatusMutation.mutate({
        intakeId,
        status,
        expectedUpdatedAt: intakeUpdatedAtById.get(intakeId),
      });
    },
    [intakeStatusMutation, intakeUpdatedAtById],
  );

  // ── Filter handlers ───────────────────────────────────────────
  const updatePropertyFilter = useCallback(
    <K extends keyof PropertyFilterState>(field: K, value: PropertyFilterState[K]) => {
      setPropertyFilters((prev) => ({ ...prev, [field]: value }));
      setPage(1);
    },
    [],
  );

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

  const handleSortSelect = useCallback((value: string) => {
    if (!value) {
      setActiveSorts([]);
      setSorting([]);
      setPage(1);
      return;
    }

    const option = sortOptions.find((item) => item.value === value) ?? sortOptions[0];
    setActiveSorts([{ field: option.field, label: option.label, direction: option.direction }]);
    setSorting([{ id: option.field, desc: option.direction === 'desc' }]);
    setPage(1);
  }, []);

  const handleSortingChange = useCallback((newSorting: SortingState) => {
    setSorting(newSorting);
    if (newSorting.length > 0) {
      const s = newSorting[0];
      setActiveSorts([{
        field: s.id,
        label: sortDefinitions.find((d) => d.field === s.id)?.label ?? s.id,
        direction: s.desc ? 'desc' : 'asc',
      }]);
    } else {
      setActiveSorts([]);
    }
    setPage(1);
  }, []);

  const handleTransactionTabChange = useCallback((transactionType: string) => {
    setSelectedTransactionType(transactionType as (typeof transactionTypeOptions)[number]['value']);
    setPage(1);
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

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
        size: 260,
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
          <span className="truncate text-[13px] font-medium text-slate-900">
            {getDongName(row.original.property)}
          </span>
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
        id: 'unitType',
        header: () => <TableHeaderLabel icon={<Type className="size-4" />} label="타입" />,
        size: 58,
        enableSorting: false,
        cell: ({ row }) => {
          const value = getUnitTypeName(row.original.property);
          return (
            <span className="truncate text-[13px] text-slate-700">
              {value === '-' ? '' : value}
            </span>
          );
        },
      },
      {
        id: 'exclusiveArea',
        header: () => <TableHeaderLabel icon={<Ruler className="size-4" />} label="전용면적" />,
        size: 96,
        enableSorting: false,
        cell: ({ row }) => {
          const value = formatAreaPyeong(getExclusiveAreaM2(row.original.property));
          return (
            <span className="truncate text-[13px] text-slate-700 tabular-nums">
              {value === '-' ? '' : value}
            </span>
          );
        },
      },
      {
        id: 'confirmAction',
        header: () => <TableHeaderLabel icon={<Check className="size-4" />} label="확인" />,
        size: 78,
        enableSorting: false,
        cell: ({ row }) => (
          <IntakeConfirmButton
            intake={row.original.representative}
            onConfirm={handleIntakeConfirm}
            isPending={confirmMutation.isPending}
          />
        ),
      },
      {
        id: 'updatedAt',
        header: () => <TableHeaderLabel icon={<CalendarDays className="size-4" />} label="확인일" />,
        size: 96,
        enableSorting: true,
        cell: ({ row }) => (
          <IntakeConfirmedAtCell intake={row.original.representative} />
        ),
      },
      {
        id: 'intakeStatus',
        header: () => <TableHeaderLabel icon={<Tag className="size-4" />} label="상태" />,
        size: 110,
        enableSorting: false,
        cell: ({ row }) => (
          <IntakeStatusCell
            intake={row.original.representative}
            onChange={handleIntakeStatusChange}
            isPending={
              intakeStatusMutation.isPending &&
              intakeStatusMutation.variables?.intakeId === row.original.representative.id
            }
          />
        ),
      },
      {
        id: 'price',
        header: () => <TableHeaderLabel icon={<CircleDollarSign className="size-4" />} label="가격" />,
        size: 184,
        enableSorting: true,
        cell: ({ row }) => (
          <ListingPriceStack
            listings={row.original.listings}
            onSave={handleCellSave}
            onPatch={handleListingPatch}
          />
        ),
      },
      {
        id: 'advertisement',
        header: () => <TableHeaderLabel icon={<Megaphone className="size-4" />} label="광고" />,
        size: 138,
        enableSorting: false,
        cell: ({ row }) => <ListingAdStack listings={row.original.listings} />,
      },
      {
        id: 'moveInAvailable',
        header: () => <TableHeaderLabel icon={<DoorOpen className="size-4" />} label="입주가능일" />,
        size: 140,
        enableSorting: false,
        cell: ({ row }) => <MoveInAvailableStack listings={row.original.listings} onSave={handleCellSave} />,
      },
      {
        id: 'owner',
        header: () => <TableHeaderLabel icon={<User className="size-4" />} label="소유주" />,
        size: 150,
        enableSorting: false,
        cell: ({ row }) => {
          const owner = getOwnerContact(row.original.property);
          return (
            <div className="flex min-w-0 flex-col justify-center leading-none">
              {owner?.phone && (
                <span className="truncate text-[13px] font-semibold leading-4 text-slate-900 tabular-nums">
                  {formatPhoneNumber(owner.phone)}
                </span>
              )}
              <span className="truncate text-[11px] font-medium leading-3 text-slate-500">
                {owner?.name ?? '미등록'}
              </span>
            </div>
          );
        },
      },
      {
        id: 'tenant',
        header: () => <TableHeaderLabel icon={<User className="size-4" />} label="세입자" />,
        size: 154,
        enableSorting: false,
        cell: ({ row }) => <TenantCell tenant={getCurrentTenant(row.original.property)} />,
      },
      {
        id: 'jointBrokerage',
        header: () => <TableHeaderLabel icon={<Handshake className="size-4" />} label="공동중개" />,
        size: 88,
        enableSorting: false,
        cell: ({ row }) => <JointBrokerageCell intake={row.original.representative} />,
      },
      {
        id: 'memo',
        header: () => <TableHeaderLabel icon={<FileText className="size-4" />} label="의뢰 메모" />,
        size: 320,
        minSize: 220,
        enableSorting: false,
        cell: ({ row }) => <IntakeMemoCell memo={row.original.representative.memo} />,
      },
    ],
    [
      handleCellSave,
      handleIntakeConfirm,
      handleIntakeStatusChange,
      handleListingPatch,
      confirmMutation.isPending,
      intakeStatusMutation.isPending,
    ],
  );

  return (
    <CellEditProvider>
      <div className="-m-4 flex min-h-0 flex-1 flex-col bg-white">
        <section className="border-b border-border bg-white px-3 py-2">
          <div className="flex items-start justify-between gap-4">
            <Tabs value={selectedTransactionType} onValueChange={handleTransactionTabChange} className="min-w-0 flex-1 gap-0">
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
            <Button size="sm" asChild className="mt-1 shrink-0 px-3.5">
              <Link to="/properties/new">
                <Plus className="size-3.5" />
                새 매물 등록
              </Link>
            </Button>
          </div>
        </section>

        <section className="border-b border-border bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative mr-1 w-64 max-w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="검색"
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

            <FilterPopoverChip
              label="단지"
              value={selectedSite?.name ?? '전체'}
              active={Boolean(propertyFilters.siteId)}
            >
              <div className="space-y-2">
                <PopoverTitle title="단지" description="단지명 또는 주소로 매물을 좁힙니다." />
                <SiteSearchFilter
                  sites={filterSites}
                  value={propertyFilters.siteId}
                  onChange={(value) => updatePropertyFilter('siteId', value)}
                  isLoading={isFilterSitesLoading}
                  showCounts
                />
              </div>
            </FilterPopoverChip>

            <FilterPopoverChip
              label="유형"
              value={getOptionLabel(siteTypeOptions, propertyFilters.siteType)}
              active={propertyFilters.siteType !== 'all'}
            >
              <div className="space-y-2">
                <PopoverTitle title="매물유형" description="아파트, 오피스텔, 상가 등 건물 유형을 선택합니다." />
                <SelectFilter
                  value={propertyFilters.siteType}
                  onChange={(value) => updatePropertyFilter('siteType', value)}
                  options={siteTypeOptions}
                />
              </div>
            </FilterPopoverChip>

            <FilterPopoverChip
              label="상태"
              value={getOptionLabel(intakeStatusFilterOptions, propertyFilters.intakeStatus)}
              active={propertyFilters.intakeStatus !== 'all'}
            >
              <div className="space-y-2">
                <PopoverTitle title="상태" description="의뢰 상태로 매물을 좁힙니다." />
                <SelectFilter
                  value={propertyFilters.intakeStatus}
                  onChange={(value) => updatePropertyFilter('intakeStatus', value)}
                  options={intakeStatusFilterOptions}
                />
              </div>
            </FilterPopoverChip>

            <FilterPopoverChip
              label="금액"
              value={amountFilterSummary ?? '전체'}
              active={Boolean(amountFilterSummary)}
              contentClassName="w-[360px]"
            >
              <div className="space-y-3">
                <PopoverTitle title="금액" description="만원 단위로 입력합니다." />
                <RangeFilter
                  label="가격"
                  unit="만원"
                  minValue={propertyFilters.priceMin}
                  maxValue={propertyFilters.priceMax}
                  onMinChange={(value) => updatePropertyFilter('priceMin', value)}
                  onMaxChange={(value) => updatePropertyFilter('priceMax', value)}
                />
                <RangeFilter
                  label="보증금"
                  unit="만원"
                  minValue={propertyFilters.depositMin}
                  maxValue={propertyFilters.depositMax}
                  onMinChange={(value) => updatePropertyFilter('depositMin', value)}
                  onMaxChange={(value) => updatePropertyFilter('depositMax', value)}
                />
                <RangeFilter
                  label="월세"
                  unit="만원"
                  minValue={propertyFilters.monthlyRentMin}
                  maxValue={propertyFilters.monthlyRentMax}
                  onMinChange={(value) => updatePropertyFilter('monthlyRentMin', value)}
                  onMaxChange={(value) => updatePropertyFilter('monthlyRentMax', value)}
                />
              </div>
            </FilterPopoverChip>

            <FilterPopoverChip
              label="면적"
              value={areaFilterSummary ?? '전체'}
              active={Boolean(areaFilterSummary)}
              contentClassName="w-[320px]"
            >
              <div className="space-y-3">
                <PopoverTitle title="전용면적" description="평 단위로 입력합니다." />
                <RangeFilter
                  label="전용면적"
                  unit="평"
                  minValue={propertyFilters.areaMin}
                  maxValue={propertyFilters.areaMax}
                  onMinChange={(value) => updatePropertyFilter('areaMin', value)}
                  onMaxChange={(value) => updatePropertyFilter('areaMax', value)}
                />
              </div>
            </FilterPopoverChip>

            <Button
              variant={propertyFilters.includeHidden ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(
                'h-8 gap-1.5 px-2.5 text-xs',
                propertyFilters.includeHidden
                  ? 'border border-border bg-muted text-foreground'
                  : 'text-muted-foreground',
              )}
              onClick={() => updatePropertyFilter('includeHidden', !propertyFilters.includeHidden)}
            >
              {propertyFilters.includeHidden && <Check className="size-3.5" />}
              숨김 포함
            </Button>

            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-40">
                <SelectFilter
                  value={selectedSortValue}
                  onChange={handleSortSelect}
                  options={sortFilterOptions}
                />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground" onClick={handleFiltersReset}>
                  <RotateCcw className="size-3.5" />
                  초기화
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 bg-white px-0 py-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-1.5 text-[12px] text-muted-foreground">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-foreground">
                  매물 {propertyGroups.length.toLocaleString()}개
                </span>
                <span>의뢰 {loadedIntakes.toLocaleString()} / {totalIntakes.toLocaleString()}건 · 거래 {loadedListings.toLocaleString()}건</span>
                {activeFilterSummary.length > 0 ? (
                  <span className="min-w-0 truncate">
                    필터: {activeFilterSummary.join(' · ')}
                  </span>
                ) : (
                  <span>전체 조건</span>
                )}
              </div>
              {isLoading ? (
                <span>불러오는 중</span>
              ) : totalIntakes === 0 && hasActiveFilters ? (
                <span>조건을 줄이거나 초기화해 보세요.</span>
              ) : (
                <span>행 더블클릭 시 빠른 확인 패널을 엽니다.</span>
              )}
            </div>
            {/* Data Table */}
            <PropertyListingsTable
              columns={columns}
              data={propertyGroups}
              totalCount={totalIntakes}
              pageSize={LISTINGS_PAGE_SIZE}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              onRowClick={(row) => setSelectedIntakeId(row.intakeId)}
              isLoading={isLoading}
              isLoadingMore={isFetchingNextPage}
              onEndReached={handleEndReached}
              emptyMessage={hasActiveFilters ? '조건에 맞는 매물이 없습니다.' : '등록된 매물이 없습니다.'}
              renderStatusBar={() => (
                <span>
                  의뢰 {loadedIntakes.toLocaleString()} / {totalIntakes.toLocaleString()}건 표시
                  {loadedListings > 0 ? ` · 거래 ${loadedListings.toLocaleString()}건` : ''}
                  {hasNextPage && !isFetchingNextPage ? ' · 아래로 스크롤하면 더 불러옵니다' : ''}
                  {isFetchingNextPage ? ' · 더 불러오는 중...' : ''}
                </span>
              )}
            />
          </div>
        </section>
        <PropertyQuickSheet
          intakeId={selectedIntakeId}
          onClose={() => setSelectedIntakeId(null)}
        />
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

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function PropertyQuickSheet({
  intakeId,
  onClose,
}: {
  intakeId: string | null;
  onClose: () => void;
}) {
  const { data: intake, isLoading } = useQuery({
    queryKey: ['listing-intakes', 'quick-sheet', intakeId],
    queryFn: () => api.listingIntakes.findOne(intakeId as string),
    enabled: Boolean(intakeId),
  });

  // shadcn Sheet의 open animation은 500ms (data-[state=open]:duration-500).
  // animation 동안 무거운 PropertySheetContent (헤더/거래카드/임차/타임라인 등 큰
  // React 트리)를 mount하면 메인 스레드가 점유되어 CSS slide가 frame drop.
  // animation이 완전히 끝난 뒤(550ms)에만 무거운 트리 mount + 그 전에는 가벼운
  // Skeleton만. 닫힐 때 즉시 reset해 다음 open에서도 deferred 동작.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    if (!intakeId) {
      setContentReady(false);
      return;
    }
    const timer = window.setTimeout(() => setContentReady(true), 550);
    return () => window.clearTimeout(timer);
  }, [intakeId]);

  return (
    <Sheet open={Boolean(intakeId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
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
  const unitSummaryItems = [
    unitTypeName ? `${unitTypeName}타입` : null,
    floorLabel,
  ].filter(Boolean);
  const address = property.site?.roadAddress ?? property.site?.jibunAddress ?? '주소 미등록';
  const owner = contacts.find((contact) => contact.role === 'owner') ?? contacts[0];
  const ownerPhone = owner?.contact?.phone;
  const areaLabel = formatPropertySheetArea(property);
  const notices = getPropertySheetNotices(property);
  const intakeStatus = intakeStatusMeta[intake.status] ?? {
    label: intake.status,
    className: 'bg-[#f1f1ef] text-[#5f5e5b]',
  };
  const confirmStatus = intakeStatusMeta[intake.confirmStatus] ?? {
    label: intake.confirmStatus === 'unknown' ? '미확인' : intake.confirmStatus,
    className: 'bg-[#f1f1ef] text-[#5f5e5b]',
  };
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
              const tabTitle =
                [title, unitLabel].filter(Boolean).join(' ') || meta.title;
              onClose();
              openTab({ route, kind: meta.kind, title: tabTitle });
            }}
          >
            <ExternalLink />
            전체 페이지로 열기
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="닫기"
          >
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
            <div className="text-[14px] leading-6 text-muted-foreground">
              {unitSummaryItems.join(' · ')}
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
              확인 {intake.confirmedAt ? formatDateShort(intake.confirmedAt) : '미확인'}
            </span>
            <span>접수 {formatDateShort(intake.receivedAt)}</span>
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {listings.map((listing) => (
              <TransactionBadge key={listing.id} transactionType={listing.transactionType} />
            ))}
            <span
              className={cn(
                'inline-flex max-w-full rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
                intakeStatus.className,
              )}
            >
              {intakeStatus.label}
            </span>
            <span
              className={cn(
                'inline-flex max-w-full rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
                confirmStatus.className,
              )}
            >
              {confirmStatus.label}
            </span>
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
            {!memo && consultations.length === 0 && (
              <SheetEmptyState text="상담 기록과 메모가 없습니다." compact />
            )}
          </div>
        </SheetSection>
      </div>
    </div>
  );
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
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
          <StatusIndicator value={listing.checkStatus} />
          <JointBrokerageBadge listing={listing} />
          {listing.isHidden && (
            <span className="inline-flex rounded-md bg-[#fbe4e4] px-1.5 py-0.5 text-[11px] font-medium leading-5 text-[#9f5555]">
              숨김
            </span>
          )}
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
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">
          {history.reason.trim()}
        </p>
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
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
          {advertisement.memo.trim()}
        </p>
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
            <span className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] text-[#337ea9]">
              주 연락처
            </span>
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
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
            임차인
          </span>
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

function TenantCell({ tenant }: { tenant?: Tenant | null }) {
  if (!tenant) {
    return <span className="text-[13px] text-slate-400">-</span>;
  }

  const detail = getTenantListDetail(tenant);
  const name = tenant.contact?.name ?? '세입자';
  const phone = tenant.contact?.phone;

  return (
    <div className="flex min-w-0 flex-col justify-center leading-none">
      {phone ? (
        <>
          <span className="truncate text-[13px] font-semibold leading-4 text-slate-900 tabular-nums">
            {formatPhoneNumber(phone)}
          </span>
          <span className="truncate text-[11px] font-medium leading-3 text-slate-500">
            {name} · {detail}
          </span>
        </>
      ) : (
        <>
          <span className="truncate text-[13px] font-semibold leading-4 text-slate-900">
            {name}
          </span>
          <span className="truncate text-[11px] font-medium leading-3 text-slate-500">
            {detail}
          </span>
        </>
      )}
    </div>
  );
}

function PropertySheetConsultationRow({ consultation }: { consultation: Consultation }) {
  return (
    <div className="rounded-md border border-[#eeeeec] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
          {consultation.type}
        </span>
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

function SheetEmptyState({
  text,
  compact = false,
  action,
}: {
  text: string;
  compact?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={cn(
      'rounded-md border border-dashed border-[#e3e2df] px-3 text-center text-sm text-slate-500',
      compact ? 'py-4' : 'py-8',
    )}>
      <div>{text}</div>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

function StatusIndicator({ value }: { value: string }) {
  const meta = checkStatusMeta[value] ?? {
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
  return listings.length > 1
    ? { minHeight: listings.length * PROPERTY_LISTING_STACK_ITEM_HEIGHT }
    : undefined;
}

function TransactionStack({ listings }: { listings: ListingSummary[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      {listings.map((listing) => (
        <div key={listing.id} className="flex items-center gap-1">
          <TransactionBadge transactionType={listing.transactionType} />
          {listing.isHidden && (
            <span className="inline-flex rounded-[4px] bg-[#fbe4e4] px-1.5 py-0.5 text-[11px] font-medium leading-5 text-[#9f5555]">
              숨김
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function IntakeConfirmedAtCell({ intake }: { intake: ListingIntake }) {
  return (
    <div className="flex min-w-0 flex-col py-1">
      <span className="truncate text-[12px] font-medium leading-5 text-slate-800">
        {intake.confirmedAt ? formatDateShort(intake.confirmedAt) : '미확인'}
      </span>
      {intake.nextConfirmAt && (
        <span className="truncate text-[11px] leading-4 text-slate-400">
          다음 {formatDateShort(intake.nextConfirmAt)}
        </span>
      )}
    </div>
  );
}

function IntakeStatusCell({
  intake,
  onChange,
  isPending,
}: {
  intake: ListingIntake;
  onChange: (intakeId: string, status: string) => void;
  isPending?: boolean;
}) {
  const meta = intakeStatusMeta[intake.status] ?? {
    label: intake.status,
    className: 'bg-[#f1f1ef] text-[#5f5e5b]',
  };

  return (
    <div className="-mx-2.5 flex h-10 items-center" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isPending}
            className="flex h-full w-full items-center px-2.5 text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              className={cn(
                'inline-flex max-w-full rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
                meta.className,
              )}
            >
              <span className="truncate">{meta.label}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-32">
          {intakeStatusOptions.map((option) => {
            const optionMeta = intakeStatusMeta[option.value] ?? {
              label: option.label,
              className: 'bg-[#f1f1ef] text-[#5f5e5b]',
            };
            const isSelected = option.value === intake.status;

            return (
              <DropdownMenuItem
                key={option.value}
                className="gap-2 text-xs"
                disabled={isSelected}
                onSelect={() => {
                  if (!isSelected) {
                    onChange(intake.id, option.value);
                  }
                }}
              >
                <span
                  className={cn(
                    'inline-flex rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
                    optionMeta.className,
                  )}
                >
                  {optionMeta.label}
                </span>
                {isSelected && <Check className="ml-auto size-3.5 text-slate-500" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function IntakeConfirmButton({
  intake,
  onConfirm,
  isPending,
}: {
  intake: ListingIntake;
  onConfirm: (
    intakeId: string,
    result: 'alive' | 'price_changed' | 'unavailable' | 'no_answer' | 'pending',
  ) => void;
  isPending?: boolean;
}) {
  return (
    <div className="flex items-center py-1" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isPending}
            className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="size-3.5 text-slate-500" />
            확인
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {confirmResultOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              className="text-xs"
              onClick={(event) => event.stopPropagation()}
              onSelect={() => onConfirm(intake.id, option.value)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function JointBrokerageCell({ intake }: { intake: ListingIntake }) {
  if (!intake.isJointBrokerageRequired) {
    return <span className="text-[12px] text-slate-400">-</span>;
  }

  return (
    <span className="inline-flex rounded-[4px] bg-[#fbf3db] px-1.5 py-0.5 text-[12px] font-medium leading-5 text-[#8f6b1f]">
      필수
    </span>
  );
}

function ListingPriceStack({
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
      className={cn(
        '-mx-2.5 flex h-full min-w-0 flex-col items-stretch',
        hasMultiple && 'divide-y divide-[#d9d9d6]',
      )}
      style={getListingStackStyle(listings)}
      onClick={(event) => event.stopPropagation()}
    >
      {listings.map((listing) => (
        <div
          key={listing.id}
          className="flex min-w-0 flex-1 items-center"
        >
          {listing.transactionType === 'monthly' ? (
            <MonthlyRentPriceEditor
              listing={listing}
              showTransactionLabel={hasMultiple}
              onSave={(patch) => onPatch(listing.id, patch)}
            />
          ) : (
            <EditableCell
              recordId={listing.id}
              field="price"
              value={listing.price}
              onSave={onSave}
              editType="number"
              activation="doubleClick"
            >
              <span className="flex h-full w-full items-center gap-1.5 px-2.5">
                {hasMultiple && <TransactionMiniLabel transactionType={listing.transactionType} />}
                <PriceCell
                  transactionType={listing.transactionType}
                  price={listing.price}
                  deposit={listing.deposit}
                  monthlyRent={listing.monthlyRent}
                />
              </span>
            </EditableCell>
          )}
        </div>
      ))}
    </div>
  );
}

function MonthlyRentPriceEditor({
  listing,
  showTransactionLabel,
  onSave,
}: {
  listing: ListingSummary;
  showTransactionLabel: boolean;
  onSave: (patch: UpdateListingDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deposit, setDeposit] = useState(() => formatEditorNumber(listing.deposit));
  const [monthlyRent, setMonthlyRent] = useState(() => formatEditorNumber(listing.monthlyRent));

  useEffect(() => {
    if (!open) {
      setDeposit(formatEditorNumber(listing.deposit));
      setMonthlyRent(formatEditorNumber(listing.monthlyRent));
    }
  }, [listing.deposit, listing.monthlyRent, open]);

  const save = () => {
    onSave({
      deposit: parseEditorNumber(deposit),
      monthlyRent: parseEditorNumber(monthlyRent),
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-full w-full items-center gap-1.5 rounded-sm px-2.5 text-left hover:bg-muted/50"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
        >
          {showTransactionLabel && <TransactionMiniLabel transactionType={listing.transactionType} />}
          <PriceCell
            transactionType={listing.transactionType}
            price={listing.price}
            deposit={listing.deposit}
            monthlyRent={listing.monthlyRent}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-3"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-3">
          <PopoverTitle title="월세 조건" description="만원 단위로 입력합니다." />
          <div className="grid grid-cols-[56px_1fr] items-center gap-2">
            <span className="text-[12px] text-muted-foreground">보증금</span>
            <Input
              value={deposit}
              onChange={(event) => setDeposit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
              type="number"
              inputMode="numeric"
              className="h-8 px-2 text-[13px]"
              autoFocus
            />
            <span className="text-[12px] text-muted-foreground">월세</span>
            <Input
              value={monthlyRent}
              onChange={(event) => setMonthlyRent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
              type="number"
              inputMode="numeric"
              className="h-8 px-2 text-[13px]"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button size="sm" className="h-8 px-3" onClick={save}>
              저장
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatEditorNumber(value?: number | null) {
  return value === null || value === undefined ? '' : String(value);
}

function parseEditorNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function ListingAdStack({ listings }: { listings: ListingSummary[] }) {
  const hasMultiple = listings.length > 1;
  return (
    <div
      className={cn(
        '-mx-2.5 flex h-full min-w-0 flex-col items-stretch',
        hasMultiple && 'divide-y divide-[#d9d9d6]',
      )}
      style={getListingStackStyle(listings)}
    >
      {listings.map((listing) => (
        <div
          key={listing.id}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-2.5"
        >
          {hasMultiple && <TransactionMiniLabel transactionType={listing.transactionType} />}
          <AdIndicator advertisements={listing.advertisements ?? []} />
        </div>
      ))}
    </div>
  );
}

function IntakeMemoCell({ memo }: { memo: string | null | undefined }) {
  const value = memo?.trim();
  return (
    <p className="line-clamp-2 min-w-0 text-[11px] leading-snug text-slate-600">
      {value || <span className="text-slate-400">-</span>}
    </p>
  );
}

function AdIndicator({
  advertisements,
}: {
  advertisements: NonNullable<ListingSummary['advertisements']>;
}) {
  const primaryAd = getPrimaryAdvertisement(advertisements);

  if (!primaryAd) {
    return (
      <span className="inline-flex max-w-full rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[12px] font-medium leading-5 text-[#787774]">
        미등록
      </span>
    );
  }

  const activeCount = advertisements.filter((advertisement) => advertisement.status === 'active').length;
  const statusMeta = adStatusMeta[primaryAd.status] ?? adStatusMeta.draft;
  const channelLabel = getAdChannelLabel(primaryAd.channel);
  const label = activeCount > 1 && primaryAd.status === 'active'
    ? `${channelLabel} 외 ${activeCount - 1}`
    : channelLabel;

  return (
    <span className="inline-flex min-w-0 max-w-full flex-1 items-center gap-1 overflow-hidden">
      <span
        className={cn(
          'inline-flex min-w-0 max-w-[96px] shrink rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-5',
          statusMeta.className,
        )}
      >
        <span className="truncate">{label}</span>
      </span>
    </span>
  );
}

const moveInAvailableChipOptions: ChipOption[] = [
  { value: 'immediate', label: '즉시', className: 'bg-[#eef3ed] text-[#44745a]' },
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
  { value: 'negotiable', label: '협의', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
  { value: 'unknown', label: '확인 필요', className: 'bg-[#f1f1ef] text-[#787774]' },
];

const confirmResultOptions = [
  { label: '살아있음', value: 'alive' },
  { label: '가격변경', value: 'price_changed' },
  { label: '거래완료/불가', value: 'unavailable' },
  { label: '부재중', value: 'no_answer' },
  { label: '답변대기', value: 'pending' },
] as const;

function MoveInAvailableStack({
  listings,
  onSave,
}: {
  listings: ListingSummary[];
  onSave: (recordId: string, field: string, value: unknown) => void;
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
        <div
          key={listing.id}
          className="flex min-w-0 flex-1 items-center"
        >
          <EditableCell
            recordId={listing.id}
            field="moveInAvailableType"
            value={listing}
            chipValueOf={(v) => (v as ListingSummary | undefined)?.moveInAvailableType ?? 'unknown'}
            onSave={onSave}
            onChipSave={(recordId, payload) => {
              onSave(recordId, 'moveInAvailableType', payload.type);
              if (payload.dateWrites) {
                for (const write of payload.dateWrites) {
                  onSave(recordId, write.field, write.value);
                }
              }
            }}
            editType="select-chip"
            chipOptions={moveInAvailableChipOptions}
          >
            <span className="flex h-full w-full items-center gap-1.5 px-2.5">
              {listings.length > 1 && <TransactionMiniLabel transactionType={listing.transactionType} />}
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
      {summary.detail && (
        <span className="truncate text-[11px] text-slate-500">{summary.detail}</span>
      )}
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
  listing,
  compact = false,
}: {
  listing: Pick<PropertyListing, 'isJointBrokerageRequired' | 'jointBrokeragePartner'>;
  compact?: boolean;
}) {
  if (!listing.isJointBrokerageRequired) return null;

  const label = compact
    ? '공동'
    : `공동필수${listing.jointBrokeragePartner?.name ? ` · ${listing.jointBrokeragePartner.name}` : ''}`;

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
  contentClassName,
  children,
}: {
  label: string;
  value: string;
  active?: boolean;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 max-w-[220px] gap-1.5 rounded-md border px-2.5 text-xs',
            active
              ? 'border-border bg-muted text-foreground hover:bg-muted'
              : 'border-transparent text-muted-foreground hover:border-border hover:bg-white',
          )}
        >
          <span className="shrink-0 text-muted-foreground">{label}</span>
          <span className="min-w-0 truncate font-medium text-foreground">{value}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-80 p-3', contentClassName)}>
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
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function SiteSearchFilter({
  sites,
  value,
  onChange,
  isLoading,
  placeholder = '단지명 또는 주소 검색',
  showCounts = false,
}: {
  sites: ListingFilterSite[];
  value: string;
  onChange: (value: string) => void;
  isLoading: boolean;
  placeholder?: string;
  showCounts?: boolean;
}) {
  const [query, setQuery] = useState('');
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
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : sites;

    return candidates
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .slice(0, 8);
  }, [query, sites]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        value={open ? query : selectedSite?.name ?? query}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={isLoading ? '단지 불러오는 중...' : placeholder}
        className="h-8 bg-white pl-8 pr-8 text-[13px]"
      />
      {(selectedSite || query) && (
        <button
          type="button"
          aria-label="단지 선택 지우기"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange('');
            setQuery('');
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
                  setQuery('');
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-slate-50',
                  value === site.id && 'bg-slate-50',
                )}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-slate-900">{site.name}</span>
                  {showCounts && (
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {site.propertyCount}건
                    </span>
                  )}
                </span>
                <span className="truncate text-[11px] text-slate-500">
                  {site.roadAddress ?? site.jibunAddress ?? getSiteTypeLabel(site.type)}
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
    <Select
      value={value === '' ? SENTINEL : value}
      onValueChange={(next) => onChange(next === SENTINEL ? '' : next)}
    >
      <SelectTrigger
        size="sm"
        className="w-full border-border bg-white text-[13px] text-foreground"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value === '' ? SENTINEL : option.value}
            className="text-[13px]"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  if (filters.siteType !== 'all') params.siteType = filters.siteType;
  if (filters.intakeStatus !== 'all') params.status = filters.intakeStatus;
  if (filters.includeHidden) params.includeHidden = true;

  addNumberParam(params, 'priceMin', filters.priceMin);
  addNumberParam(params, 'priceMax', filters.priceMax);
  addNumberParam(params, 'depositMin', filters.depositMin);
  addNumberParam(params, 'depositMax', filters.depositMax);
  addNumberParam(params, 'monthlyRentMin', filters.monthlyRentMin);
  addNumberParam(params, 'monthlyRentMax', filters.monthlyRentMax);

  const areaMin = parseNumberFilter(filters.areaMin);
  const areaMax = parseNumberFilter(filters.areaMax);
  if (areaMin !== undefined) params.areaMin = pyeongToSquareMeters(areaMin);
  if (areaMax !== undefined) params.areaMax = pyeongToSquareMeters(areaMax);

  return params;
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

function getActiveFilterSummary({
  search,
  selectedTransactionType,
  propertyFilters,
  selectedSiteName,
  activeSorts,
}: {
  search: string;
  selectedTransactionType: (typeof transactionTypeOptions)[number]['value'];
  propertyFilters: PropertyFilterState;
  selectedSiteName?: string;
  activeSorts: SortDefinition[];
}) {
  const summary: string[] = [];
  const trimmedSearch = search.trim();

  if (selectedTransactionType !== 'all') {
    summary.push(getOptionLabel(transactionTypeOptions, selectedTransactionType));
  }
  if (trimmedSearch) summary.push(`검색 ${trimmedSearch}`);
  if (propertyFilters.siteId) summary.push(selectedSiteName ?? '선택 단지');
  if (propertyFilters.siteType !== 'all') {
    summary.push(getOptionLabel(siteTypeOptions, propertyFilters.siteType));
  }

  const amount = getAmountFilterSummary(propertyFilters);
  const area = getRangeSummary(propertyFilters.areaMin, propertyFilters.areaMax, '평');
  if (amount) summary.push(amount);
  if (area) summary.push(area);
  if (propertyFilters.includeHidden) summary.push('숨김 포함');
  if (activeSorts[0]) summary.push(`정렬 ${activeSorts[0].label}`);

  return summary;
}

function getRangeSummary(minValue: string, maxValue: string, unit: string) {
  const min = minValue.trim();
  const max = maxValue.trim();
  if (!min && !max) return null;
  if (min && max) return `${min}~${max}${unit}`;
  if (min) return `${min}${unit} 이상`;
  return `${max}${unit} 이하`;
}

function getAmountFilterSummary(filters: PropertyFilterState) {
  const price = getRangeSummary(filters.priceMin, filters.priceMax, '만원');
  const deposit = getRangeSummary(filters.depositMin, filters.depositMax, '만원');
  const monthly = getRangeSummary(filters.monthlyRentMin, filters.monthlyRentMax, '만원');
  const summaries = [
    price && `가격 ${price}`,
    deposit && `보증금 ${deposit}`,
    monthly && `월세 ${monthly}`,
  ].filter(Boolean);

  if (summaries.length === 0) return null;
  if (summaries.length === 1) return summaries[0] as string;
  return `${summaries.length}개 조건`;
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
    listings: (intake.listings ?? []).map(toListingSummary).sort(compareListingSummary),
  }));
}

function toListingSummary(listing: ListingSummary): ListingSummary {
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
    checkStatus: listing.checkStatus,
    isHidden: listing.isHidden,
    memo: listing.memo,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    advertisements: listing.advertisements,
    priceHistories: listing.priceHistories,
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

function getPrimaryAdvertisement(
  advertisements: NonNullable<ListingSummary['advertisements']>,
) {
  return advertisements
    .slice()
    .sort((a, b) => getAdStatusOrder(a.status) - getAdStatusOrder(b.status) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

function getAdStatusOrder(status: string) {
  if (status === 'active') return 0;
  if (status === 'paused') return 1;
  if (status === 'planned') return 2;
  if (status === 'draft') return 3;
  if (status === 'error') return 4;
  if (status === 'ended') return 5;
  return 9;
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
  value: { price: number | null; deposit: number | null; monthlyRent: number | null },
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
    const deposit = advertisement.advertisedDeposit
      ? formatPrice(advertisement.advertisedDeposit)
      : '-';
    const monthlyRent = advertisement.advertisedMonthlyRent
      ? formatPrice(advertisement.advertisedMonthlyRent)
      : '-';
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
  const dongName =
    property.unit?.dong && !property.unit.dong.isPlaceholder ? property.unit.dong.name : '';
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
    return new Date(listing.updatedAt).getTime() > new Date(latest).getTime()
      ? listing.updatedAt
      : latest;
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
  const unverifiedListings = listings.filter((listing) => listing.checkStatus === 'unverified');
  const hiddenListings = listings.filter((listing) => listing.isHidden);
  const jointRequiredListings = listings.filter((listing) => listing.isJointBrokerageRequired);
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

  if (hiddenListings.length > 0) {
    notices.push({
      title: '숨김 거래 포함',
      detail: `${formatTransactionTypeList(hiddenListings)} 거래가 목록에서 숨김 처리되어 있습니다.`,
      tone: 'neutral',
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

function getCurrentTenant(property?: ListingProperty) {
  const activeTenants = (property?.tenants ?? []).filter((tenant) => tenant.status !== 'moved');
  if (activeTenants.length === 0) return null;

  return [...activeTenants].sort((a, b) => {
    const priorityDiff = getTenantListPriority(a) - getTenantListPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    return getTenantSortTime(a.contractEnd) - getTenantSortTime(b.contractEnd);
  })[0];
}

function getTenantListPriority(tenant: Tenant) {
  if (tenant.status === 'moving_out') return 0;
  if (tenant.status === 'residing') return 1;
  return 2;
}

function getTenantSortTime(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function getTenantListDetail(tenant: Tenant) {
  if (tenant.status === 'moving_out' && tenant.moveOutDate) {
    return `퇴거 ${formatDateShort(tenant.moveOutDate)}`;
  }

  if (tenant.contractEnd) {
    return `만기 ${formatDateShort(tenant.contractEnd)}`;
  }

  return getTenantStatusLabel(tenant.status);
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

function formatJointBrokerageRequirementList(
  listings: Pick<PropertyListing, 'transactionType' | 'jointBrokeragePartner'>[],
) {
  return listings
    .map((listing) => {
      const transactionLabel = transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType;
      return listing.jointBrokeragePartner?.name
        ? `${transactionLabel} ${listing.jointBrokeragePartner.name}`
        : `${transactionLabel} 파트너 미지정`;
    })
    .join(', ');
}


function formatAreaPyeong(value?: number | null) {
  if (!value) return '-';
  const squareMeters = Number(value);
  return `${(squareMeters * 0.3025).toFixed(1)}평`;
}
