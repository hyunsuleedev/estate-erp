import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { BuyerRequirement } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import {
  DataTable,
  ViewBar,
  StatusBadgeCell,
  DateCell,
  TextCell,
  type FilterDefinition,
  type ActiveFilter,
  type SortDefinition,
} from '@/components/data-table';

const statusLabels: Record<string, string> = {
  active: '활성',
  matched: '매칭됨',
  completed: '완료',
  inactive: '비활성',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  matched: 'bg-blue-50 text-blue-700',
  completed: 'bg-gray-100 text-gray-600',
  inactive: 'bg-gray-50 text-gray-400',
};

const urgencyLabels: Record<string, string> = {
  urgent: '급',
  normal: '보통',
  flexible: '여유',
};

const urgencyColors: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700',
  normal: 'bg-gray-100 text-gray-700',
  flexible: 'bg-sky-50 text-sky-700',
};

const txTypeLabels: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

const filterDefinitions: FilterDefinition[] = [
  {
    id: 'status',
    field: 'status',
    label: '상태',
    type: 'multiSelect',
    operators: ['in'],
    options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
  },
  {
    id: 'urgency',
    field: 'urgency',
    label: '긴급도',
    type: 'multiSelect',
    operators: ['in'],
    options: Object.entries(urgencyLabels).map(([value, label]) => ({ value, label })),
  },
  {
    id: 'transactionType',
    field: 'transactionType',
    label: '거래유형',
    type: 'multiSelect',
    operators: ['in'],
    options: [
      { label: '매매', value: 'sale' },
      { label: '전세', value: 'jeonse' },
      { label: '월세', value: 'monthly' },
    ],
  },
  {
    id: 'price',
    field: 'price',
    label: '예산',
    type: 'numberRange',
    operators: ['between'],
    unit: '만원',
  },
  {
    id: 'deposit',
    field: 'deposit',
    label: '보증금',
    type: 'numberRange',
    operators: ['between'],
    unit: '만원',
  },
  {
    id: 'monthlyRent',
    field: 'monthlyRent',
    label: '월세',
    type: 'numberRange',
    operators: ['between'],
    unit: '만원',
  },
  {
    id: 'area',
    field: 'area',
    label: '면적',
    type: 'numberRange',
    operators: ['between'],
    unit: 'm²',
  },
  {
    id: 'moveIn',
    field: 'moveIn',
    label: '입주 희망일',
    type: 'dateRange',
    operators: ['between'],
  },
];

const sortDefinitions = [
  { field: 'createdAt', label: '등록일' },
  { field: 'urgency', label: '긴급도' },
];

export const Route = createFileRoute('/_authenticated/buyer-requirements/')({
  component: BuyerRequirementsPage,
});

function BuyerRequirementsPage() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'createdAt', label: '등록일', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);

  // Async filter defs — defined inside component so fetchOptions can close over
  // the api client.
  const allFilterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      ...filterDefinitions,
      {
        id: 'preferredSites',
        field: 'preferredSites',
        label: '희망 단지',
        type: 'asyncMultiSelect',
        operators: ['in'],
        fetchOptions: async (q) => {
          const sites = await api.officeSites.searchCentral(q);
          return sites.slice(0, 30).map((s: any) => ({
            label: s.name,
            value: s.id,
          }));
        },
      },
      {
        id: 'preferredRegions',
        field: 'preferredRegions',
        label: '희망 지역',
        type: 'asyncMultiSelect',
        operators: ['in'],
        fetchOptions: async (q) => {
          const results = await api.regions.search(q, 20);
          return results.map((r) => ({
            // Value encodes level so apiParams knows where to send it:
            // "district:11740", "ward:1174010100", "province:11"
            value: `${r.level}:${r.code}`,
            label: r.fullName,
          }));
        },
      },
    ],
    [],
  );

  const apiParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit: 20,
      sortBy: activeSorts[0]?.field as any,
      sortOrder: activeSorts[0]?.direction ?? 'desc',
    };
    if (query.trim()) params.search = query.trim();
    for (const filter of activeFilters) {
      // Preferred sites: CSV of site UUIDs
      if (filter.field === 'preferredSites' && filter.values?.length) {
        params.preferredSiteIds = filter.values.join(',');
        continue;
      }
      // Preferred regions: values are "level:code" pairs; split into 3 CSVs
      if (filter.field === 'preferredRegions' && filter.values?.length) {
        const provinceCodes: string[] = [];
        const districtCodes: string[] = [];
        const wardCodes: string[] = [];
        for (const v of filter.values) {
          const [level, code] = v.split(':');
          if (level === 'province') provinceCodes.push(code);
          else if (level === 'district') districtCodes.push(code);
          else if (level === 'ward') wardCodes.push(code);
        }
        if (provinceCodes.length) params.provinceCodes = provinceCodes.join(',');
        if (districtCodes.length) params.districtCodes = districtCodes.join(',');
        if (wardCodes.length) params.wardCodes = wardCodes.join(',');
        continue;
      }
      // multiSelect → CSV
      if (filter.operator === 'in' && filter.values?.length) {
        params[filter.field] = filter.values.join(',');
        continue;
      }
      // numberRange / dateRange → split to {fieldMin, fieldMax} or
      // {fieldAfter, fieldBefore} for date.
      if (filter.operator === 'between') {
        const base = filter.field;
        if (base === 'moveIn') {
          if (filter.valueMin) params[`${base}After`] = filter.valueMin;
          if (filter.valueMax) params[`${base}Before`] = filter.valueMax;
        } else if (base === 'monthlyRent') {
          // BuyerRequirement only stores monthlyRentMax (upper bound).
          // Interpret the filter's max as "monthly rent ceiling the buyer tolerates >= filter.min".
          if (filter.valueMin) params.monthlyRentMax = Number(filter.valueMin);
        } else {
          if (filter.valueMin) params[`${base}Min`] = Number(filter.valueMin);
          if (filter.valueMax) params[`${base}Max`] = Number(filter.valueMax);
        }
        continue;
      }
      // legacy single-value
      params[filter.field] = filter.value;
    }
    return params;
  }, [page, activeFilters, activeSorts, query]);

  const { data, isLoading } = useQuery({
    queryKey: ['buyer-requirements', apiParams],
    queryFn: () => api.buyerRequirements.findAll(apiParams as any),
  });

  const filteredItems = data?.items ?? [];

  const handleSortAdd = useCallback((sort: SortDefinition) => {
    setActiveSorts([sort]);
    setSorting([{ id: sort.field, desc: sort.direction === 'desc' }]);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<BuyerRequirement, unknown>[]>(
    () => [
      {
        id: 'customer',
        header: '고객',
        size: 200,
        cell: ({ row }) => {
          const contact = row.original.contact;
          if (!contact) return <span className="text-[13px] text-muted-foreground">-</span>;
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-medium">{contact.name}</span>
              {contact.phone && (
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {contact.phone}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: '상태',
        size: 80,
        cell: ({ row }) => (
          <StatusBadgeCell value={row.original.status} labels={statusLabels} colors={statusColors} />
        ),
      },
      {
        accessorKey: 'urgency',
        header: '긴급',
        size: 70,
        cell: ({ row }) => (
          <StatusBadgeCell value={row.original.urgency} labels={urgencyLabels} colors={urgencyColors} />
        ),
      },
      {
        accessorKey: 'transactionType',
        header: '거래유형',
        size: 80,
        cell: ({ row }) => (
          <span className="text-[13px]">
            {row.original.transactionType
              ? txTypeLabels[row.original.transactionType] ?? row.original.transactionType
              : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'budget',
        header: '예산',
        size: 160,
        cell: ({ row }) => {
          const r = row.original;
          if (!r.priceMin && !r.priceMax) return <TextCell value="-" muted />;
          const min = r.priceMin ? formatPrice(r.priceMin) : '';
          const max = r.priceMax ? formatPrice(r.priceMax) : '';
          return (
            <span className="tabular-nums text-[13px]">
              {min && max ? `${min} ~ ${max}` : min || `~ ${max}`}
            </span>
          );
        },
      },
      {
        id: 'preferred',
        header: '희망 지역 · 단지',
        size: 320,
        cell: ({ row }) => {
          const sites = row.original.preferredSites ?? [];
          const regions = row.original.preferredRegions ?? [];
          if (!sites.length && !regions.length) {
            return <span className="text-[13px] text-muted-foreground">-</span>;
          }
          const regionLabels = regions
            .map((r) => r.ward?.name ?? r.district?.name ?? r.province?.name ?? '')
            .filter(Boolean);
          const siteNames = sites.map((s) => s.site?.name ?? '').filter(Boolean);
          return (
            <div className="flex min-w-0 items-center gap-1 overflow-hidden">
              {siteNames.map((name) => (
                <span
                  key={`site-${name}`}
                  className="shrink-0 truncate rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
                >
                  {name}
                </span>
              ))}
              {regionLabels.map((label) => (
                <span
                  key={`region-${label}`}
                  className="shrink-0 truncate rounded-md border border-border/60 bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: 'lastContactDate',
        header: '최근 상담',
        size: 110,
        enableSorting: true,
        cell: ({ row }) => {
          const v = row.original.lastContactDate;
          if (!v) return <span className="text-[13px] text-muted-foreground">-</span>;
          const days = Math.floor(
            (Date.now() - new Date(v).getTime()) / (1000 * 60 * 60 * 24),
          );
          const stale = days >= 90;
          return (
            <span
              className={cn(
                'text-[12px] tabular-nums',
                stale ? 'text-red-600 font-medium' : 'text-muted-foreground',
              )}
            >
              <DateCell value={v} relative />
            </span>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        size: 90,
        enableSorting: true,
        cell: ({ row }) => <DateCell value={row.original.createdAt} relative />,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">구매고객</h1>
          <span className="text-xs text-muted-foreground">
            {data?.pagination?.total ?? 0}건
          </span>
        </div>
      </div>

      {/* 쿼리 바: 검색 · 필터 · 정렬 한 줄 묶음 */}
      <ViewBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="고객명 · 전화 · 단지 · 메모 검색"
        filterDefinitions={allFilterDefinitions}
        activeFilters={activeFilters}
        onFilterAdd={(f) => { setActiveFilters((prev) => [...prev.filter((p) => p.field !== f.field), f]); setPage(1); }}
        onFilterRemove={(id) => { setActiveFilters((prev) => prev.filter((f) => f.id !== id)); setPage(1); }}
        onFiltersReset={() => { setActiveFilters([]); setActiveSorts([{ field: 'createdAt', label: '등록일', direction: 'desc' }]); setPage(1); }}
        inlineFilters={[
          'preferredRegions',
          'preferredSites',
          'status',
          'urgency',
          'transactionType',
          'price',
          'area',
        ]}
        sortDefinitions={sortDefinitions}
        activeSorts={activeSorts}
        onSortAdd={handleSortAdd}
        onSortRemove={() => setActiveSorts([])}
      />

      <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredItems}
          totalCount={data?.pagination?.total ?? 0}
          pageCount={data?.pagination?.totalPages ?? 1}
          page={page}
          onPageChange={setPage}
          pageSize={20}
          sorting={sorting}
          onSortingChange={(s) => {
            setSorting(s);
            if (s.length > 0) {
              const def = sortDefinitions.find((d) => d.field === s[0].id);
              setActiveSorts([{ field: s[0].id, label: def?.label ?? s[0].id, direction: s[0].desc ? 'desc' : 'asc' }]);
            }
          }}
          rowHeight={36}
          pinnedColumns={['customer']}
          enableRowSelection
          isLoading={isLoading}
          emptyMessage={
            query.trim() || activeFilters.length > 0
              ? '검색 결과가 없습니다.'
              : '구매 희망 고객이 없습니다.'
          }
          renderStatusBar={({ focusedRow, totalCount }) => {
            if (!focusedRow) {
              return (
                <span className="tabular-nums">
                  총 {totalCount.toLocaleString()}명
                </span>
              );
            }
            const contact = focusedRow.contact;
            const regionLabels = (focusedRow.preferredRegions ?? []).map((r) =>
              r.ward?.name ?? r.district?.name ?? r.province?.name ?? '',
            ).filter(Boolean);
            const regions = regionLabels.join(', ');
            const siteNames = (focusedRow.preferredSites ?? [])
              .map((s) => s.site?.name)
              .filter(Boolean)
              .join(', ');
            const budget =
              focusedRow.priceMin || focusedRow.priceMax
                ? `${focusedRow.priceMin ? formatPrice(focusedRow.priceMin) : ''}${
                    focusedRow.priceMin && focusedRow.priceMax ? ' ~ ' : ''
                  }${focusedRow.priceMax ? formatPrice(focusedRow.priceMax) : ''}`
                : null;
            return (
              <>
                <span className="tabular-nums text-foreground/80">
                  {totalCount.toLocaleString()}명
                </span>
                <span className="text-border">|</span>
                <span className="font-medium text-foreground">{contact?.name ?? '-'}</span>
                {contact?.phone && (
                  <span className="tabular-nums text-foreground/70">{contact.phone}</span>
                )}
                {budget && (
                  <>
                    <span className="text-border">|</span>
                    <span>예산 {budget}</span>
                  </>
                )}
                {regions && (
                  <>
                    <span className="text-border">|</span>
                    <span className="truncate">희망지역 {regions}</span>
                  </>
                )}
                {siteNames && (
                  <>
                    <span className="text-border">|</span>
                    <span className="truncate">희망단지 {siteNames}</span>
                  </>
                )}
              </>
            );
          }}
        />
      </div>
    </div>
  );
}
