import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileText,
  Hash,
  Home,
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
import type { Listing, Site } from '@estate-erp/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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

const checkStatusMeta: Record<string, { label: string; dotClassName: string; textClassName: string }> = {
  unverified: { label: '미확인', dotClassName: 'bg-slate-400', textClassName: 'text-slate-700' },
  verified: { label: '확인완료', dotClassName: 'bg-emerald-600', textClassName: 'text-slate-900' },
  in_contract: { label: '거래중', dotClassName: 'bg-blue-600', textClassName: 'text-slate-900' },
  hold: { label: '보류', dotClassName: 'bg-amber-600', textClassName: 'text-slate-900' },
  done: { label: '종료', dotClassName: 'bg-slate-300', textClassName: 'text-slate-500' },
};

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-[#fdebec] text-[#d44c47]' },
  jeonse: { label: '전세', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  monthly: { label: '월세', className: 'bg-[#fbf3db] text-[#dfab01]' },
};

const sortDefinitions = [
  { field: 'price', label: '가격' },
  { field: 'createdAt', label: '등록일' },
  { field: 'updatedAt', label: '확인일' },
];

const sortOptions = [
  { value: 'createdAt:desc', field: 'createdAt', label: '등록일 최신순', direction: 'desc' },
  { value: 'updatedAt:desc', field: 'updatedAt', label: '확인일 최신순', direction: 'desc' },
  { value: 'price:asc', field: 'price', label: '가격 낮은순', direction: 'asc' },
  { value: 'price:desc', field: 'price', label: '가격 높은순', direction: 'desc' },
] satisfies Array<{ value: string; field: string; label: string; direction: 'asc' | 'desc' }>;

const statusTabs = [
  { value: 'all', label: '전체' },
  { value: 'verified', label: '확인완료' },
  { value: 'unverified', label: '미확인' },
  { value: 'in_contract', label: '거래중' },
  { value: 'hold', label: '보류' },
  { value: 'done', label: '종료' },
] as const;

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
  transactionType: string;
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
  transactionType: 'all',
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

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/properties/')({
  component: PropertiesPage,
});

function PropertiesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── State ─────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<(typeof statusTabs)[number]['value']>('all');
  const [propertyFilters, setPropertyFilters] = useState<PropertyFilterState>(initialPropertyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'createdAt', label: '등록일', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);

  const { data: sites = [], isLoading: isSitesLoading } = useQuery({
    queryKey: ['sites', 'property-filter'],
    queryFn: () => api.sites.findAll(),
    staleTime: 5 * 60_000,
  });

  const sitesById = useMemo(
    () => new Map(sites.map((site) => [site.id, site])),
    [sites],
  );

  // ── Derive API params from filters ────────────────────────────
  const apiParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit: 100,
      search: search.trim() || undefined,
      ...buildListingFilterParams(propertyFilters),
    };

    if (selectedStatus !== 'all') {
      params.checkStatus = selectedStatus;
    }

    if (activeSorts.length > 0) {
      params.sortBy = activeSorts[0].field;
      params.sortOrder = activeSorts[0].direction;
    }

    return params;
  }, [page, search, propertyFilters, selectedStatus, activeSorts]);

  // ── Query ─────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['listings', apiParams],
    queryFn: () => api.listings.findAll(apiParams as any),
  });

  const countBaseParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      page: 1,
      limit: 1,
      search: search.trim() || undefined,
      ...buildListingFilterParams(propertyFilters),
    };

    return params;
  }, [search, propertyFilters]);

  const statusCountQueries = useQueries({
    queries: statusTabs.map((tab) => ({
      queryKey: ['listings', 'status-count', tab.value, countBaseParams],
      queryFn: () =>
        api.listings.findAll({
          ...countBaseParams,
          ...(tab.value !== 'all' ? { checkStatus: tab.value } : {}),
        } as any),
      staleTime: 30_000,
    })),
  });

  const totalListings =
    statusCountQueries[0]?.data?.pagination?.total ?? data?.pagination?.total ?? 0;
  const activeFilterChips = useMemo(
    () => buildActiveFilterChips(search, propertyFilters, sitesById),
    [search, propertyFilters, sitesById],
  );
  const selectedSortValue =
    activeSorts.length > 0
      ? `${activeSorts[0].field}:${activeSorts[0].direction}`
      : 'createdAt:desc';

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
            items: old.items.map((listing) =>
              listing.id === id ? { ...listing, [field]: value } : listing,
            ),
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
    setSelectedStatus('all');
    setActiveSorts([{ field: 'createdAt', label: '등록일', direction: 'desc' }]);
    setSearch('');
    setSorting([{ id: 'createdAt', desc: true }]);
    setPage(1);
  }, []);

  const handleSortSelect = useCallback((value: string) => {
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

  const handleStatusTabChange = useCallback((status: string) => {
    setSelectedStatus(status as (typeof statusTabs)[number]['value']);
    setPage(1);
  }, []);

  const getStatusCount = useCallback((index: number) => {
    const queryTotal = statusCountQueries[index]?.data?.pagination?.total;
    return typeof queryTotal === 'number' ? queryTotal : 0;
  }, [statusCountQueries]);

  // ── Column definitions (ad-note style operational grid) ───────
  const columns = useMemo<ColumnDef<Listing, unknown>[]>(
    () => [
      {
        id: 'info',
        header: () => <TableHeaderLabel icon={<Tag className="size-4" />} label="거래" />,
        size: 86,
        enableSorting: false,
        cell: ({ row }) => {
          const listing = row.original;
          const transactionMeta = transactionTypeMeta[listing.transactionType];
          return (
            <div className="flex flex-col items-start gap-1">
              <Badge
                className={cn(
                  'rounded-[4px] border-transparent px-1.5 py-0.5 text-[12px] font-medium shadow-none',
                  transactionMeta?.className ?? 'bg-[#f1f1ef] text-[#787774]',
                )}
              >
                {transactionMeta?.label ?? listing.transactionType}
              </Badge>
              {listing.isHidden && (
                <Badge className="border-0 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  숨김
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: 'site',
        header: () => <TableHeaderLabel icon={<Type className="size-4" />} label="단지" />,
        size: 260,
        enableSorting: false,
        cell: ({ row }) => {
          const l = row.original;
          return (
            <div className="flex min-w-0 items-center">
              <span className="truncate text-[14px] font-semibold text-slate-900">
                {l.property?.site?.name ?? '매물 정보 없음'}
              </span>
            </div>
          );
        },
      },
      {
        id: 'type',
        header: () => <TableHeaderLabel icon={<Home className="size-4" />} label="유형" />,
        size: 110,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="truncate text-[13px] font-medium text-slate-800">
            {getSiteTypeLabel(row.original.property?.site?.type)}
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
            {formatAreaPyeong(row.original.property?.unit?.exclusiveAreaM2)}
          </span>
        ),
      },
      {
        id: 'dong',
        header: () => <TableHeaderLabel icon={<Hash className="size-4" />} label="동" />,
        size: 72,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="truncate text-[13px] text-slate-800">
            {getDongName(row.original)}
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
        accessorKey: 'checkStatus',
        header: () => <TableHeaderLabel icon={<Tag className="size-4" />} label="상태" />,
        size: 106,
        enableSorting: false,
        cell: ({ row }) => {
          const l = row.original;
          return (
            <StatusDropdown
              value={l.checkStatus}
              onChange={(value) => handleCellSave(l.id, 'checkStatus', value)}
            />
          );
        },
      },
      {
        accessorKey: 'price',
        header: () => <TableHeaderLabel icon={<CircleDollarSign className="size-4" />} label="가격" />,
        size: 150,
        enableSorting: true,
        cell: ({ row }) => {
          const l = row.original;
          return (
            <EditableCell
              recordId={l.id}
              field="price"
              value={l.price}
              onSave={handleCellSave}
              editType="number"
            >
              <PriceCell
                transactionType={l.transactionType}
                price={l.price}
                deposit={l.deposit}
                monthlyRent={l.monthlyRent}
              />
            </EditableCell>
          );
        },
      },
      {
        id: 'owner',
        header: () => <TableHeaderLabel icon={<User className="size-4" />} label="소유주" />,
        size: 150,
        enableSorting: false,
        cell: ({ row }) => {
          const owner = getOwnerContact(row.original);
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
        accessorKey: 'updatedAt',
        header: () => <TableHeaderLabel icon={<CalendarDays className="size-4" />} label="확인일" />,
        size: 92,
        enableSorting: true,
        cell: ({ row }) => (
          <DateCell value={row.original.updatedAt} relative />
        ),
      },
      {
        id: 'memo',
        header: () => <TableHeaderLabel icon={<FileText className="size-4" />} label="메모" />,
        size: 320,
        minSize: 220,
        enableSorting: false,
        cell: ({ row }) => (
          <p className="line-clamp-2 text-[11px] leading-snug text-slate-600">
            {getListingMemo(row.original)}
          </p>
        ),
      },
    ],
    [handleCellSave],
  );

  return (
    <CellEditProvider>
      <div className="flex h-[calc(100svh-6rem)] min-h-0 flex-col bg-white">
        <section className="border-b border-slate-200 bg-white px-6 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-slate-500">매물관리 · 목록</p>
              <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-slate-900">
                매물 {totalListings.toLocaleString()}건
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/properties/external-listings">
                  <Download className="size-3.5" />
                  매물 가져오기
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/properties/new">
                  <Plus className="size-3.5" />
                  새 매물 등록
                </Link>
              </Button>
            </div>
          </div>

          <Tabs value={selectedStatus} onValueChange={handleStatusTabChange} className="mt-5 gap-0">
            <TabsList
              variant="line"
              className="h-10 max-w-full justify-start overflow-x-auto rounded-none p-0"
            >
              {statusTabs.map((tab, index) => {
                const active = selectedStatus === tab.value;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="h-10 flex-none rounded-none border-0 px-3 text-[13px] data-[state=active]:bg-transparent data-[state=active]:text-slate-950"
                  >
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums',
                        active ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      {getStatusCount(index).toLocaleString()}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </section>

        <section className="border-b border-slate-200 bg-white px-6 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              <Building2 className="size-4 text-slate-700" />
              매물 테이블
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
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
                  options={sortOptions.map((option) => ({ value: option.value, label: option.label }))}
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
              description="특정 단지로 먼저 좁히고, 거래 방식과 매물 유형을 고릅니다."
            >
              <FilterField label="단지 검색" className="md:col-span-2 xl:col-span-3">
                <SiteSearchFilter
                  sites={sites}
                  value={propertyFilters.siteId}
                  onChange={(value) => updatePropertyFilter('siteId', value)}
                  isLoading={isSitesLoading}
                />
              </FilterField>
              <FilterField label="거래">
                <SelectFilter
                  value={propertyFilters.transactionType}
                  onChange={(value) => updatePropertyFilter('transactionType', value)}
                  options={transactionTypeOptions}
                />
              </FilterField>
              <FilterField label="매물유형">
                <SelectFilter
                  value={propertyFilters.siteType}
                  onChange={(value) => updatePropertyFilter('siteType', value)}
                  options={siteTypeOptions}
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-slate-200 bg-white">
            {/* Data Table */}
            <DataTable
              columns={columns}
              data={data?.items ?? []}
              totalCount={data?.pagination?.total ?? 0}
              pageCount={data?.pagination?.totalPages ?? 1}
              page={page}
              onPageChange={setPage}
              pageSize={100}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              enableRowSelection
              layout="full-height"
              variant="notion"
              rowHeight={44}
              onRowClick={(row) => navigate({ to: '/properties/$id', params: { id: row.propertyId } })}
              isLoading={isLoading}
              emptyMessage="매물이 없습니다."
            />
          </div>
        </section>
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

function StatusDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center rounded-md border border-transparent px-2.5 text-left transition-colors hover:border-slate-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
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
    dotClassName: 'bg-slate-300',
    textClassName: 'text-slate-700',
  };

  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('size-1.5 rounded-full', meta.dotClassName)} />
      <span className={cn('text-xs', meta.textClassName)}>{meta.label}</span>
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
}: {
  sites: Site[];
  value: string;
  onChange: (value: string) => void;
  isLoading: boolean;
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
        placeholder={isLoading ? '단지 불러오는 중...' : '단지명 또는 주소 검색'}
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
                <span className="truncate text-[13px] font-medium text-slate-900">{site.name}</span>
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
  if (filters.transactionType !== 'all') params.transactionType = filters.transactionType;
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
  sitesById: Map<string, Site>,
) {
  const chips: string[] = [];
  const trimmedSearch = search.trim();

  if (trimmedSearch) chips.push(`검색: ${trimmedSearch}`);
  if (filters.siteId) {
    chips.push(`단지: ${sitesById.get(filters.siteId)?.name ?? '선택한 단지'}`);
  }
  if (filters.transactionType !== 'all') {
    chips.push(`거래: ${getOptionLabel(transactionTypeOptions, filters.transactionType)}`);
  }
  if (filters.siteType !== 'all') {
    chips.push(`유형: ${getOptionLabel(siteTypeOptions, filters.siteType)}`);
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

function getOwnerContact(listing: Listing) {
  const contacts = listing.property?.propertyContacts ?? [];
  const owner = contacts.find((propertyContact) => propertyContact.role === 'owner');
  return owner?.contact ?? null;
}

function getDongName(listing: Listing) {
  const dong = listing.property?.unit?.dong;
  if (!dong || dong.isPlaceholder) return '-';
  return dong.name;
}

function getSiteTypeLabel(value?: string | null) {
  if (!value) return '-';
  return getOptionLabel(siteTypeOptions, value);
}

function getListingMemo(listing: Listing) {
  return listing.memo?.trim() || listing.property?.memo?.trim() || '-';
}

function formatAreaPyeong(value?: number | null) {
  if (!value) return '-';
  const squareMeters = Number(value);
  return `${(squareMeters * 0.3025).toFixed(1)}평`;
}
