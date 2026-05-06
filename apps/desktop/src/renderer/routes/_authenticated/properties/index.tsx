import { createFileRoute, Link } from '@tanstack/react-router';
import { keepPreviousData, useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useMemo, type ReactNode } from 'react';
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
  SlidersHorizontal,
  Tag,
  Type,
  User,
  X,
} from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { api } from '@/lib/api';
import type {
  Consultation,
  Listing,
  ListingFilterSite,
  Property,
  PropertyContact,
  PropertyListing,
  Tenant,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { cn } from '@/lib/utils';
import {
  DataTable,
  PriceCell,
  DateCell,
  CellEditProvider,
  EditableCell,
  type SortDefinition,
} from '@/components/data-table';

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

const checkStatusOptions = [
  { label: '미확인', value: 'unverified' },
  { label: '확인완료', value: 'verified' },
  { label: '거래중', value: 'in_contract' },
  { label: '보류', value: 'hold' },
  { label: '종료', value: 'done' },
] as const;

const transactionTypeOptions = [
  { value: 'all', label: '전체' },
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
] as const;

const checkStatusFilterOptions = [
  { value: 'all', label: '전체' },
  ...checkStatusOptions,
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

interface PropertyFilterState {
  siteId: string;
  checkStatus: string;
  siteType: string;
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
  checkStatus: 'all',
  siteType: 'all',
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

type ListingSummary = Pick<
  Listing,
  | 'id'
  | 'transactionType'
  | 'price'
  | 'deposit'
  | 'monthlyRent'
  | 'moveInAvailableType'
  | 'moveInAvailableFrom'
  | 'moveInAvailableTo'
  | 'isJointBrokerageRequired'
  | 'jointBrokeragePartnerId'
  | 'jointBrokeragePartner'
  | 'checkStatus'
  | 'isHidden'
  | 'memo'
  | 'createdAt'
  | 'updatedAt'
  | 'advertisements'
  | 'priceHistories'
>;
type ListingProperty = NonNullable<Listing['property']>;

interface PropertyListingGroup {
  id: string;
  propertyId: string;
  property?: ListingProperty;
  representative: Listing;
  listings: ListingSummary[];
  matchedListings: Listing[];
}

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

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
      search: search.trim() || undefined,
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
  }, [page, search, propertyFilters, selectedTransactionType, activeSorts]);

  // ── Query ─────────────────────────────────────────────────────
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['listings', apiParams],
    queryFn: ({ pageParam }) =>
      api.listings.findAll({ ...apiParams, page: pageParam } as any),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page: currentPage, totalPages } = lastPage.pagination;
      return currentPage < totalPages ? currentPage + 1 : undefined;
    },
    placeholderData: keepPreviousData,
  });

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
  const selectedSortValue =
    activeSorts.length > 0 &&
    sortOptions.some((option) => option.value === `${activeSorts[0].field}:${activeSorts[0].direction}`)
      ? `${activeSorts[0].field}:${activeSorts[0].direction}`
      : '';

  // ── Inline edit mutation ──────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: unknown }) =>
      api.listings.update(id, { [field]: value }),
    onMutate: async ({ id, field, value }) => {
      await queryClient.cancelQueries({ queryKey: ['listings'] });
      queryClient.setQueriesData<{ items: Listing[] }>(
        { queryKey: ['listings'] },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((listing) => {
              const nextListing =
                listing.id === id ? { ...listing, [field]: value } : listing;
              const relatedListings = listing.property?.listings?.map((relatedListing) =>
                relatedListing.id === id
                  ? { ...relatedListing, [field]: value }
                  : relatedListing,
              );

              if (!relatedListings || !nextListing.property) return nextListing;
              return {
                ...nextListing,
                property: {
                  ...nextListing.property,
                  listings: relatedListings,
                },
              };
            }),
          };
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });

  const handleCellSave = useCallback(
    (recordId: string, field: string, value: unknown) => {
      updateMutation.mutate({ id: recordId, field, value });
    },
    [updateMutation],
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
        size: 72,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="truncate text-[13px] text-slate-800">
            {getDongName(row.original.property)}
          </span>
        ),
      },
      {
        id: 'unit',
        header: () => <TableHeaderLabel icon={<Hash className="size-4" />} label="호" />,
        size: 88,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="truncate text-[13px] font-medium text-slate-900">
            {row.original.property?.unit?.name ?? '-'}
          </span>
        ),
      },
      {
        id: 'unitType',
        header: () => <TableHeaderLabel icon={<Type className="size-4" />} label="타입" />,
        size: 88,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="truncate text-[13px] text-slate-700">
            {getUnitTypeName(row.original.property)}
          </span>
        ),
      },
      {
        id: 'exclusiveArea',
        header: () => <TableHeaderLabel icon={<Ruler className="size-4" />} label="전용면적" />,
        size: 96,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="truncate text-[13px] text-slate-700 tabular-nums">
            {formatAreaPyeong(getExclusiveAreaM2(row.original.property))}
          </span>
        ),
      },
      {
        id: 'checkStatus',
        header: () => <TableHeaderLabel icon={<Tag className="size-4" />} label="상태" />,
        size: 156,
        enableSorting: false,
        cell: ({ row }) => (
          <ListingStatusStack
            listings={row.original.listings}
            onChange={(listingId, value) => handleCellSave(listingId, 'checkStatus', value)}
          />
        ),
      },
      {
        id: 'price',
        header: () => <TableHeaderLabel icon={<CircleDollarSign className="size-4" />} label="가격" />,
        size: 184,
        enableSorting: true,
        cell: ({ row }) => (
          <ListingPriceStack listings={row.original.listings} onSave={handleCellSave} />
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
        size: 130,
        enableSorting: false,
        cell: ({ row }) => <MoveInAvailableStack listings={row.original.listings} />,
      },
      {
        id: 'owner',
        header: () => <TableHeaderLabel icon={<User className="size-4" />} label="소유주" />,
        size: 150,
        enableSorting: false,
        cell: ({ row }) => {
          const owner = getOwnerContact(row.original.property);
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] font-medium text-slate-800">
                {owner?.name ?? '-'}
              </span>
              {owner?.phone && (
                <span className="truncate text-[12px] text-slate-500 tabular-nums">
                  {owner.phone}
                </span>
              )}
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
        id: 'updatedAt',
        header: () => <TableHeaderLabel icon={<CalendarDays className="size-4" />} label="확인일" />,
        size: 92,
        enableSorting: true,
        cell: ({ row }) => (
          <DateCell value={getLatestListingUpdatedAt(row.original)} relative />
        ),
      },
      {
        id: 'jointBrokerage',
        header: () => <TableHeaderLabel icon={<Handshake className="size-4" />} label="공동중개" />,
        size: 154,
        enableSorting: false,
        cell: ({ row }) => <JointBrokerageStack listings={row.original.listings} />,
      },
      {
        id: 'memo',
        header: () => <TableHeaderLabel icon={<FileText className="size-4" />} label="메모" />,
        size: 320,
        minSize: 220,
        enableSorting: false,
        cell: ({ row }) => (
          <p className="line-clamp-2 text-[11px] leading-snug text-slate-600">
            {getGroupMemo(row.original)}
          </p>
        ),
      },
    ],
    [handleCellSave],
  );

  return (
    <CellEditProvider>
      <div className="flex h-[calc(100svh-5rem)] min-h-0 flex-col bg-white">
        <section className="border-b border-slate-200 bg-white px-6 pb-2 pt-3">
          <div className="flex items-start justify-between gap-4">
            <Tabs value={selectedTransactionType} onValueChange={handleTransactionTabChange} className="min-w-0 flex-1 gap-0">
              <TabsList className="max-w-full justify-start overflow-x-auto bg-slate-100/70">
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

        <section className="border-b border-slate-200 bg-white px-6 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div />
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="w-56 max-w-full">
                <SiteSearchFilter
                  sites={filterSites}
                  value={propertyFilters.siteId}
                  onChange={(value) => updatePropertyFilter('siteId', value)}
                  isLoading={isFilterSitesLoading}
                  placeholder="단지 선택"
                  showCounts
                />
              </div>
              <div className="relative w-64 max-w-full">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="검색"
                  className="h-8 border-transparent bg-white pl-8 pr-8 text-[13px] shadow-none hover:border-slate-200 focus:border-slate-300"
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
              <div className="w-40">
                <SelectFilter
                  value={selectedSortValue}
                  onChange={handleSortSelect}
                  options={sortFilterOptions}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs text-slate-600"
                aria-expanded={filtersOpen}
                aria-controls="property-filter-panel"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal className="size-3.5" />
                Filter
                <ChevronDown
                  className={cn('size-3.5 transition-transform', filtersOpen && 'rotate-180')}
                />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs text-slate-600" onClick={handleFiltersReset}>
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            </div>
          </div>

          <div
            id="property-filter-panel"
            className={cn('mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3', !filtersOpen && 'hidden')}
          >
            <FilterSection
              title="단지 / 매물"
              description="특정 단지로 먼저 좁히고, 매물 유형과 확인 상태를 고릅니다."
            >
              <FilterField label="단지 검색" className="md:col-span-2 xl:col-span-3">
                <SiteSearchFilter
                  sites={filterSites}
                  value={propertyFilters.siteId}
                  onChange={(value) => updatePropertyFilter('siteId', value)}
                  isLoading={isFilterSitesLoading}
                />
              </FilterField>
              <FilterField label="매물유형">
                <SelectFilter
                  value={propertyFilters.siteType}
                  onChange={(value) => updatePropertyFilter('siteType', value)}
                  options={siteTypeOptions}
                />
              </FilterField>
              <FilterField label="상태">
                <SelectFilter
                  value={propertyFilters.checkStatus}
                  onChange={(value) => updatePropertyFilter('checkStatus', value)}
                  options={checkStatusFilterOptions}
                />
              </FilterField>
            </FilterSection>

            <FilterSection
              title="금액"
              description="가격은 만원 단위입니다. 월세는 보증금과 월세를 함께 좁힐 수 있습니다."
            >
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
            </FilterSection>

            <FilterSection
              title="면적 / 보기"
              description="전용면적은 평으로 입력하고, 숨김 매물 포함 여부를 조정합니다."
            >
              <RangeFilter
                label="전용면적"
                unit="평"
                minValue={propertyFilters.areaMin}
                maxValue={propertyFilters.areaMax}
                onMinChange={(value) => updatePropertyFilter('areaMin', value)}
                onMaxChange={(value) => updatePropertyFilter('areaMax', value)}
              />
              <FilterField label="표시 옵션">
                <label className="flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600">
                  <Checkbox
                    checked={propertyFilters.includeHidden}
                    onCheckedChange={(checked) => updatePropertyFilter('includeHidden', checked === true)}
                  />
                  숨김 매물 포함
                </label>
              </FilterField>
            </FilterSection>
          </div>

          {activeFilterChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {activeFilterChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-1 bg-white px-6 py-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            {/* Data Table */}
            <DataTable
              columns={columns}
              data={propertyGroups}
              totalCount={totalListings}
              pageCount={1}
              page={page}
              onPageChange={setPage}
              pageSize={LISTINGS_PAGE_SIZE}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              enableRowSelection
              pinnedColumns={['info', 'site', 'dong', 'unit']}
              layout="full-height"
              variant="notion"
              rowHeight="auto"
              onRowClick={(row) => setSelectedPropertyId(row.propertyId)}
              isLoading={isLoading}
              isLoadingMore={isFetchingNextPage}
              onEndReached={handleEndReached}
              emptyMessage="매물이 없습니다."
              renderStatusBar={() => (
                <span>
                  거래 {loadedListings.toLocaleString()} / {totalListings.toLocaleString()}건 표시
                  {hasNextPage && !isFetchingNextPage ? ' · 아래로 스크롤하면 더 불러옵니다' : ''}
                  {isFetchingNextPage ? ' · 더 불러오는 중...' : ''}
                </span>
              )}
            />
          </div>
        </section>
        <PropertyQuickSheet
          propertyId={selectedPropertyId}
          onClose={() => setSelectedPropertyId(null)}
        />
      </div>
    </CellEditProvider>
  );
}

function TableHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-500">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function PropertyQuickSheet({
  propertyId,
  onClose,
}: {
  propertyId: string | null;
  onClose: () => void;
}) {
  const { data: property, isLoading } = useQuery({
    queryKey: ['properties', 'quick-sheet', propertyId],
    queryFn: () => api.properties.findOne(propertyId as string),
    enabled: Boolean(propertyId),
  });

  return (
    <Sheet open={Boolean(propertyId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="!w-full !max-w-full !gap-0 overflow-hidden p-0 sm:!max-w-[720px]"
      >
        {propertyId && isLoading && <PropertySheetSkeleton />}
        {propertyId && !isLoading && property && <PropertySheetContent property={property} />}
        {propertyId && !isLoading && !property && (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            매물을 찾을 수 없습니다.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PropertySheetSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b px-6 py-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </SheetHeader>
      <div className="space-y-5 p-6">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  );
}

function PropertySheetContent({ property }: { property: Property }) {
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
  const latestUpdatedAt = getLatestPropertyListingUpdatedAt(property);
  const notices = getPropertySheetNotices(property);
  const memo = property.memo?.trim() || listings.find((listing) => listing.memo?.trim())?.memo?.trim();

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <SheetHeader className="space-y-4 border-b border-[#eeeeec] px-6 py-5">
        <div className="flex items-center justify-between gap-3 pr-8">
          <div className="text-xs font-medium text-slate-500">빠른 확인</div>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" asChild>
            <Link to="/properties/$id" params={{ id: property.id }}>
              전체 페이지로 열기
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
        <div className="space-y-2">
          <SheetTitle className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[24px] font-semibold leading-7 tracking-[-0.01em] text-slate-950">
            <span>{title}</span>
            {unitLabel && <span className="text-slate-950">{unitLabel}</span>}
          </SheetTitle>
          {unitSummaryItems.length > 0 && (
            <div className="text-[15px] font-medium leading-6 text-slate-800">
              {unitSummaryItems.join(' · ')}
            </div>
          )}
          <SheetDescription className="space-y-2 text-xs text-slate-500">
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{address}</span>
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Ruler className="size-3.5" />
                {areaLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                확인 {formatDateShort(latestUpdatedAt)}
              </span>
            </span>
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-1.5">
            {listings.map((listing) => (
              <TransactionBadge key={listing.id} transactionType={listing.transactionType} />
            ))}
            {listings[0] && <StatusIndicator value={listings[0].checkStatus} />}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <SheetActionButton
            icon={<Phone className="size-4" />}
            label={ownerPhone ? `${owner?.contact?.name ?? '소유주'} 전화` : '소유주 연락처 없음'}
            href={ownerPhone ? `tel:${ownerPhone}` : undefined}
            disabled={!ownerPhone}
            emphasis
          />
          <Button variant="outline" size="sm" className="h-9 gap-2 px-3 text-sm font-medium" asChild>
            <Link to="/properties/$id" params={{ id: property.id }}>
              <MessageSquare className="size-4" />
              상담 기록 보기
              <ExternalLink className="size-3.5" />
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
            <SheetEmptyState text="등록된 소유주, 대리인, 임차인이 없습니다." />
          )}
        </SheetSection>

        <SheetSection title="최근 상담 / 메모">
          <div className="space-y-2">
            {memo && (
              <div className="rounded-md border border-[#eeeeec] bg-slate-50/60 p-3">
                <div className="mb-1 text-[11px] font-medium text-slate-500">매물 메모</div>
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
    <section className="space-y-3">
      <h3 className="text-[12px] font-semibold text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function PropertySheetNoticeRow({ notice }: { notice: PropertySheetNotice }) {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2.5',
      notice.tone === 'danger' && 'border-red-100 bg-red-50/70',
      notice.tone === 'warning' && 'border-amber-100 bg-amber-50/70',
      notice.tone === 'neutral' && 'border-[#eeeeec] bg-slate-50/70',
    )}>
      <div className={cn(
        'text-sm font-semibold',
        notice.tone === 'danger' && 'text-red-800',
        notice.tone === 'warning' && 'text-amber-800',
        notice.tone === 'neutral' && 'text-slate-800',
      )}>
        {notice.title}
      </div>
      <p className="mt-0.5 text-xs leading-5 text-slate-600">{notice.detail}</p>
    </div>
  );
}

function PropertySheetListingCard({ listing }: { listing: PropertyListing }) {
  return (
    <div className="rounded-md border border-[#eeeeec] bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <TransactionBadge transactionType={listing.transactionType} />
          <StatusIndicator value={listing.checkStatus} />
          <JointBrokerageBadge listing={listing} />
          {listing.isHidden && (
            <span className="inline-flex rounded-[4px] bg-[#fbe4e4] px-1.5 py-0.5 text-[11px] font-medium leading-5 text-[#9f5555]">
              숨김
            </span>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-slate-500">
          확인 {formatDateShort(listing.updatedAt)}
        </span>
      </div>
      <div className="mt-2 text-[17px] font-semibold text-slate-950">
        <PriceCell
          transactionType={listing.transactionType}
          price={listing.price}
          deposit={listing.deposit}
          monthlyRent={listing.monthlyRent}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <span>등록 {formatDateShort(listing.createdAt)}</span>
        <span>확인 {formatDaysAgo(listing.updatedAt)}</span>
      </div>
      {listing.memo?.trim() && (
        <p className="mt-2 line-clamp-2 rounded bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-600">
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

  const phone = tenant.contact?.phone;

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-[13px] font-medium text-slate-800">
        {tenant.contact?.name ?? '세입자'}
      </span>
      {phone && (
        <span className="truncate text-[12px] text-slate-500 tabular-nums">
          {phone}
        </span>
      )}
      <span className="truncate text-[12px] text-slate-500">
        {getTenantListDetail(tenant)}
      </span>
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

function SheetEmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={cn(
      'rounded-md border border-dashed border-[#e3e2df] px-3 text-center text-sm text-slate-500',
      compact ? 'py-4' : 'py-8',
    )}>
      {text}
    </div>
  );
}

function StatusDropdown({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center rounded-[4px] text-left transition-colors hover:bg-slate-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
            compact ? 'p-px' : 'p-0.5',
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <StatusIndicator value={value} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36" onClick={(event) => event.stopPropagation()}>
        {checkStatusOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="text-xs"
            onSelect={() => {
              if (option.value !== value) onChange(option.value);
            }}
          >
            <StatusIndicator value={option.value} />
            {option.value === value && <Check className="ml-auto size-3.5 text-slate-500" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

function JointBrokerageStack({ listings }: { listings: ListingSummary[] }) {
  const jointRequiredListings = listings.filter((listing) => listing.isJointBrokerageRequired);

  if (jointRequiredListings.length === 0) {
    return <span className="text-[12px] text-slate-400">-</span>;
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 py-1">
      {jointRequiredListings.map((listing) => (
        <div key={listing.id} className="flex min-w-0 items-start gap-1.5">
          {listings.length > 1 && <TransactionMiniLabel transactionType={listing.transactionType} />}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="w-fit rounded-[4px] bg-[#fbf3db] px-1.5 py-0.5 text-[12px] font-medium leading-5 text-[#8f6b1f]">
              공동필수
            </span>
            <span className="truncate text-[11px] leading-5 text-slate-500">
              {listing.jointBrokeragePartner?.name ?? '파트너 미지정'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListingStatusStack({
  listings,
  onChange,
}: {
  listings: ListingSummary[];
  onChange: (listingId: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-1 py-1" onClick={(event) => event.stopPropagation()}>
      {listings.map((listing) => (
        <div key={listing.id} className="flex items-center gap-1.5">
          {listings.length > 1 && <TransactionMiniLabel transactionType={listing.transactionType} />}
          <StatusDropdown
            value={listing.checkStatus}
            onChange={(value) => onChange(listing.id, value)}
            compact
          />
        </div>
      ))}
    </div>
  );
}

function ListingPriceStack({
  listings,
  onSave,
}: {
  listings: ListingSummary[];
  onSave: (recordId: string, field: string, value: unknown) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 py-1" onClick={(event) => event.stopPropagation()}>
      {listings.map((listing) => (
        <div key={listing.id} className="flex min-w-0 items-center gap-1.5">
          {listings.length > 1 && <TransactionMiniLabel transactionType={listing.transactionType} />}
          <EditableCell
            recordId={listing.id}
            field="price"
            value={listing.price}
            onSave={onSave}
            editType="number"
          >
            <PriceCell
              transactionType={listing.transactionType}
              price={listing.price}
              deposit={listing.deposit}
              monthlyRent={listing.monthlyRent}
            />
          </EditableCell>
        </div>
      ))}
    </div>
  );
}

function ListingAdStack({ listings }: { listings: ListingSummary[] }) {
  return (
    <div className="flex min-w-0 max-w-full flex-col items-start gap-1 overflow-hidden py-1">
      {listings.map((listing) => (
        <div key={listing.id} className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
          {listings.length > 1 && <TransactionMiniLabel transactionType={listing.transactionType} />}
          <AdIndicator advertisements={listing.advertisements ?? []} />
        </div>
      ))}
    </div>
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
          'inline-flex min-w-0 max-w-[64px] shrink rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
          statusMeta.className,
        )}
      >
        <span className="truncate">{label}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">{statusMeta.label}</span>
    </span>
  );
}

function MoveInAvailableStack({ listings }: { listings: ListingSummary[] }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 py-1">
      {listings.map((listing) => (
        <div key={listing.id} className="flex min-w-0 items-center gap-1.5">
          {listings.length > 1 && <TransactionMiniLabel transactionType={listing.transactionType} />}
          <MoveInAvailableSummary listing={listing} />
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
          'w-fit rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
          summary.className,
        )}
      >
        {summary.label}
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
  listing: Pick<ListingSummary, 'isJointBrokerageRequired' | 'jointBrokeragePartner'>;
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {children}
      </div>
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
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-800 shadow-xs outline-none transition-colors focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
  if (filters.checkStatus !== 'all') params.checkStatus = filters.checkStatus;
  if (filters.siteType !== 'all') params.siteType = filters.siteType;
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

function buildActiveFilterChips(
  search: string,
  filters: PropertyFilterState,
  sitesById: Map<string, ListingFilterSite>,
) {
  const chips: string[] = [];
  const trimmedSearch = search.trim();

  if (trimmedSearch) chips.push(`검색: ${trimmedSearch}`);
  if (filters.siteId) {
    chips.push(`단지: ${sitesById.get(filters.siteId)?.name ?? '선택한 단지'}`);
  }
  if (filters.siteType !== 'all') {
    chips.push(`유형: ${getOptionLabel(siteTypeOptions, filters.siteType)}`);
  }
  if (filters.checkStatus !== 'all') {
    chips.push(`상태: ${getOptionLabel(checkStatusFilterOptions, filters.checkStatus)}`);
  }

  addRangeChip(chips, '가격', filters.priceMin, filters.priceMax, '만원');
  addRangeChip(chips, '전용면적', filters.areaMin, filters.areaMax, '평');
  addRangeChip(chips, '보증금', filters.depositMin, filters.depositMax, '만원');
  addRangeChip(chips, '월세', filters.monthlyRentMin, filters.monthlyRentMax, '만원');
  if (filters.includeHidden) chips.push('숨김 포함');

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
      existing.listings = mergeListingSummaries(existing.listings, collectPropertyListings(listing));
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
    byId.set(listing.id, listing);
  });

  return Array.from(byId.values()).sort(compareListingSummary);
}

function toListingSummary(listing: ListingSummary): ListingSummary {
  return {
    id: listing.id,
    transactionType: listing.transactionType,
    price: listing.price,
    deposit: listing.deposit,
    monthlyRent: listing.monthlyRent,
    moveInAvailableType: listing.moveInAvailableType,
    moveInAvailableFrom: listing.moveInAvailableFrom,
    moveInAvailableTo: listing.moveInAvailableTo,
    isJointBrokerageRequired: listing.isJointBrokerageRequired,
    jointBrokeragePartnerId: listing.jointBrokeragePartnerId,
    jointBrokeragePartner: listing.jointBrokeragePartner,
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

function getMoveInAvailability(
  listing: Pick<ListingSummary, 'moveInAvailableType' | 'moveInAvailableFrom' | 'moveInAvailableTo'>,
) {
  const type = listing.moveInAvailableType ?? 'unknown';
  const from = listing.moveInAvailableFrom;
  const to = listing.moveInAvailableTo;

  if (type === 'immediate') {
    return {
      label: '즉시',
      detail: null,
      className: 'bg-[#eef3ed] text-[#44745a]',
    };
  }

  if (type === 'date') {
    return {
      label: from ? `${formatDateShort(from)} 이후` : '확인 필요',
      detail: null,
      className: from ? 'bg-[#e7f3f8] text-[#337ea9]' : 'bg-[#f1f1ef] text-[#787774]',
    };
  }

  if (type === 'range') {
    return {
      label: formatMoveInRange(from, to),
      detail: '기간 협의',
      className: 'bg-[#fbf3db] text-[#8f6b1f]',
    };
  }

  if (type === 'negotiable') {
    return {
      label: '협의',
      detail: null,
      className: 'bg-[#fbf3db] text-[#8f6b1f]',
    };
  }

  if (type === 'by_balance') {
    return {
      label: '잔금일 협의',
      detail: null,
      className: 'bg-[#f8f5f0] text-[#8f6b1f]',
    };
  }

  if (type === 'after_tenant_move_out') {
    return {
      label: '퇴거 후',
      detail: null,
      className: 'bg-[#f1f1ef] text-[#5f5e5b]',
    };
  }

  return {
    label: '확인 필요',
    detail: null,
    className: 'bg-[#f1f1ef] text-[#787774]',
  };
}

function formatMoveInRange(from?: string | null, to?: string | null) {
  if (from && to) return `${formatDateShort(from)}~${formatDateShort(to)}`;
  if (from) return `${formatDateShort(from)}~`;
  if (to) return `~${formatDateShort(to)}`;
  return '협의';
}

function getDongName(property?: ListingProperty) {
  const dong = property?.unit?.dong;
  if (!dong || dong.isPlaceholder) return '-';
  return dong.name;
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

  if (!property.memo?.trim() && consultations.length === 0) {
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

function getGroupMemo(group: PropertyListingGroup) {
  return (
    group.listings.find((listing) => listing.memo?.trim())?.memo?.trim() ||
    group.property?.memo?.trim() ||
    '-'
  );
}

function getLatestListingUpdatedAt(group: PropertyListingGroup) {
  return group.listings.reduce<string | null>((latest, listing) => {
    if (!latest) return listing.updatedAt;
    return new Date(listing.updatedAt).getTime() > new Date(latest).getTime()
      ? listing.updatedAt
      : latest;
  }, null);
}

function formatAreaPyeong(value?: number | null) {
  if (!value) return '-';
  const squareMeters = Number(value);
  return `${(squareMeters * 0.3025).toFixed(1)}평`;
}
