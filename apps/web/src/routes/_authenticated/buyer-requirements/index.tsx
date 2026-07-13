import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  MoreHorizontal,
  Pencil,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  SquareArrowOutUpRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { BuyerRequirement } from '@estate-erp/api-client';
import { TRANSACTION_TYPE_LABELS } from '@estate-erp/shared';
import { formatDate, formatDday, formatPhone } from '@/lib/format';
import { STATUS_CONFIG } from '@/lib/status-config';
import { StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DataTable,
  ViewBar,
  DateCell,
  TextCell,
  type FilterDefinition,
  type ActiveFilter,
  type SortDefinition,
} from '@/components/data-table';
import { formatBudget, getFollowUpState, regionLabels, siteLabels } from './-buyer-utils';
import { ContactLogDialog } from './-contact-log-dialog';

/* ── 필터 정의 (StatusBadge 단일 소스의 라벨을 그대로 사용) ── */

const statusOptions = Object.entries(STATUS_CONFIG.buyerStatus).map(([value, meta]) => ({
  value,
  label: meta.label,
}));
const urgencyOptions = Object.entries(STATUS_CONFIG.buyerUrgency).map(([value, meta]) => ({
  value,
  label: meta.label,
}));
const txTypeOptions = Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const staticFilterDefinitions: FilterDefinition[] = [
  {
    id: 'status',
    field: 'status',
    label: '상태',
    type: 'multiSelect',
    operators: ['in'],
    options: statusOptions,
  },
  {
    id: 'urgency',
    field: 'urgency',
    label: '긴급도',
    type: 'multiSelect',
    operators: ['in'],
    options: urgencyOptions,
  },
  {
    id: 'transactionType',
    field: 'transactionType',
    label: '거래유형',
    type: 'multiSelect',
    operators: ['in'],
    options: txTypeOptions,
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
  {
    id: 'nextContact',
    field: 'nextContact',
    label: '다음 연락일',
    type: 'dateRange',
    operators: ['between'],
  },
];

const sortDefinitions = [
  { field: 'createdAt', label: '등록일' },
  { field: 'nextContactDate', label: '다음 연락일' },
  { field: 'urgency', label: '긴급도' },
];

/* ── 좌측 프리셋 (PRD: 전체 / 연락 필요 / 활성 / 매칭 진행중 / 완료) ── */

type PresetId = 'all' | 'due' | 'active' | 'matched' | 'completed';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'due', label: '연락 필요' },
  { id: 'active', label: '활성' },
  { id: 'matched', label: '매칭 진행중' },
  { id: 'completed', label: '완료' },
];

export const Route = createFileRoute('/_authenticated/buyer-requirements/')({
  component: BuyerRequirementsPage,
});

function BuyerRequirementsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<PresetId>('all');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'createdAt', label: '등록일', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);

  // 연락함 기록 (행 빠른 액션)
  const [contactLogTarget, setContactLogTarget] = useState<BuyerRequirement | null>(null);

  // 상단 툴바 검색 포커스용 ref (Cmd/Ctrl+F) — 검색창이 항상 노출되므로 직접 포커스
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+N → 신규 등록, Cmd/Ctrl+F → 검색 포커스
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        navigate({ to: '/buyer-requirements/new' });
      } else if (key === 'f') {
        e.preventDefault();
        const input = searchInputRef.current;
        if (input) {
          input.focus();
          input.select();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // Async filter defs — defined inside component so fetchOptions can close over
  // the api client.
  const allFilterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      ...staticFilterDefinitions,
      {
        id: 'assignedToId',
        field: 'assignedToId',
        label: '담당자',
        type: 'asyncMultiSelect',
        operators: ['in'],
        fetchOptions: async (q) => {
          const employees = await api.employees.findAll();
          return employees
            .filter((e) => e.isActive && (!q || e.name.includes(q)))
            .map((e) => ({ label: e.name, value: e.id }));
        },
      },
      {
        id: 'preferredSites',
        field: 'preferredSites',
        label: '희망 단지',
        type: 'asyncMultiSelect',
        operators: ['in'],
        fetchOptions: async (q) => {
          const sites = await api.officeSites.searchCentral(q);
          return sites.slice(0, 30).map((s) => ({
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
        } else if (base === 'nextContact') {
          if (filter.valueMin) params.nextContactAfter = filter.valueMin;
          if (filter.valueMax) params.nextContactBefore = filter.valueMax;
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
    // 프리셋은 필터보다 나중에 적용 — 프리셋의 status가 우선한다.
    if (preset === 'due') {
      params.status = 'active';
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      params.nextContactBefore = endOfToday.toISOString();
    } else if (preset === 'active') {
      params.status = 'active';
    } else if (preset === 'matched') {
      params.status = 'matched';
    } else if (preset === 'completed') {
      params.status = 'completed';
    }
    return params;
  }, [page, activeFilters, activeSorts, query, preset]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['buyer-requirements', apiParams],
    queryFn: () => api.buyerRequirements.findAll(apiParams as any),
  });

  // '연락 필요' 카운트 (due-contacts)
  const { data: dueContacts } = useQuery({
    queryKey: ['buyer-requirements', 'due-contacts'],
    queryFn: () => api.buyerRequirements.findDueContacts(),
  });
  const dueCount = dueContacts?.length ?? 0;

  const filteredItems = data?.items ?? [];

  const handleSortAdd = useCallback((sort: SortDefinition) => {
    setActiveSorts([sort]);
    setSorting([{ id: sort.field, desc: sort.direction === 'desc' }]);
    setPage(1);
  }, []);

  const openDetail = useCallback(
    (row: BuyerRequirement) => {
      navigate({ to: '/buyer-requirements/$id', params: { id: row.id } });
    },
    [navigate],
  );

  const columns = useMemo<ColumnDef<BuyerRequirement, unknown>[]>(
    () => [
      {
        id: 'customer',
        header: '고객',
        size: 190,
        cell: ({ row }) => {
          const contact = row.original.contact;
          if (!contact) return <span className="text-[13px] text-muted-foreground">-</span>;
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                to="/contacts/$id"
                params={{ id: contact.id }}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-[13px] font-medium hover:underline"
              >
                {contact.name}
              </Link>
              {contact.phone && (
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {formatPhone(contact.phone)}
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
          <StatusBadge kind="buyerStatus" status={row.original.status} size="sm" />
        ),
      },
      {
        accessorKey: 'urgency',
        header: '긴급',
        size: 70,
        cell: ({ row }) => (
          <StatusBadge kind="buyerUrgency" status={row.original.urgency} size="sm" />
        ),
      },
      {
        accessorKey: 'transactionType',
        header: '거래유형',
        size: 80,
        cell: ({ row }) =>
          row.original.transactionType ? (
            <StatusBadge kind="transactionType" status={row.original.transactionType} size="sm" />
          ) : (
            <span className="text-[13px] text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: 'budget',
        header: '예산',
        size: 170,
        cell: ({ row }) => {
          const text = formatBudget(row.original);
          if (text === '—') return <TextCell value="-" muted />;
          return <span className="truncate text-[13px] tabular-nums">{text}</span>;
        },
      },
      {
        id: 'preferred',
        header: '희망 지역 · 단지',
        size: 260,
        cell: ({ row }) => {
          const siteNames = siteLabels(row.original);
          const regions = regionLabels(row.original);
          if (!siteNames.length && !regions.length) {
            return <span className="text-[13px] text-muted-foreground">-</span>;
          }
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
              {regions.map((label) => (
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
        id: 'matches',
        header: '매칭',
        size: 60,
        cell: ({ row }) => {
          const n = row.original._count?.matches ?? 0;
          if (!n) return <span className="text-[13px] text-muted-foreground">-</span>;
          return <span className="text-[12px] font-medium tabular-nums text-info">{n}건</span>;
        },
      },
      {
        accessorKey: 'nextContactDate',
        header: '다음 연락',
        size: 120,
        enableSorting: true,
        cell: ({ row }) => {
          const v = row.original.nextContactDate;
          if (!v) return <span className="text-[13px] text-muted-foreground">-</span>;
          const state = getFollowUpState(v);
          return (
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  'text-[12px] tabular-nums',
                  state === 'overdue' && 'font-medium text-destructive',
                  state === 'today' && 'font-medium text-warning',
                  state === 'scheduled' && 'text-muted-foreground',
                )}
              >
                {formatDate(v)}
              </span>
              {state === 'overdue' && (
                <span className="shrink-0 rounded bg-destructive-soft px-1 py-px text-[10px] font-medium text-destructive">
                  {formatDday(v)}
                </span>
              )}
              {state === 'today' && (
                <span className="shrink-0 rounded bg-warning-soft px-1 py-px text-[10px] font-medium text-warning">
                  오늘
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'lastContactDate',
        header: '최근 상담',
        size: 100,
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
                stale ? 'font-medium text-destructive' : 'text-muted-foreground',
              )}
            >
              <DateCell value={v} relative />
            </span>
          );
        },
      },
      {
        id: 'assignedTo',
        header: '담당자',
        size: 80,
        cell: ({ row }) => (
          <span className="truncate text-[13px] text-muted-foreground">
            {row.original.assignedTo?.name ?? '-'}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        size: 90,
        enableSorting: true,
        cell: ({ row }) => <DateCell value={row.original.createdAt} relative />,
      },
      {
        id: 'actions',
        header: '',
        size: 44,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => openDetail(row.original)}>
                <SquareArrowOutUpRight className="size-3.5" />
                상세 열기
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setContactLogTarget(row.original)}>
                <PhoneCall className="size-3.5" />
                연락함 기록
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  navigate({
                    to: '/buyer-requirements/$id/edit',
                    params: { id: row.original.id },
                  })
                }
              >
                <Pencil className="size-3.5" />
                조건 수정
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [openDetail, navigate],
  );

  const total = data?.pagination?.total ?? 0;

  return (
    <div className="flex flex-col bg-white pt-4">
      {/* ── 페이지 타이틀 ── */}
      <div className="flex items-baseline gap-3 pb-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-foreground">구매 의뢰</h1>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          총 {total.toLocaleString()}건
        </span>
      </div>

      {/* ── 상단 툴바: 프리셋 탭 칩 + 검색 + 의뢰 등록 (디자인 시안) ── */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border pb-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const isActive = preset === p.id;
            // 칩 카운트: 활성 탭은 현재 조회 결과 총계, '연락 필요'는 항상 due 카운트 노출
            const count = isActive ? total : p.id === 'due' && dueCount > 0 ? dueCount : null;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPreset(p.id);
                  setPage(1);
                }}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors',
                  isActive
                    ? 'border-transparent bg-foreground text-background'
                    : 'border-border bg-white text-muted-foreground hover:bg-muted/60',
                )}
              >
                {p.label}
                {count !== null && (
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-[17px] items-center justify-center rounded-lg px-[5px] text-[10.5px] font-semibold tabular-nums',
                      isActive
                        ? 'bg-white/20 text-background'
                        : p.id === 'due'
                          ? 'bg-destructive-soft text-destructive'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* 검색 (Cmd/Ctrl+F 포커스) */}
        <div className="flex h-8 w-[200px] items-center gap-[7px] rounded-lg border border-border bg-muted px-[11px]">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="이름 · 조건 검색"
            className="w-full min-w-0 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/80"
          />
        </div>

        <Link
          to="/buyer-requirements/new"
          className="flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-foreground px-3.5 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Plus className="size-[15px]" />
          의뢰 등록
        </Link>
      </div>

      {/* ── 쿼리 바 + 목록 ── */}
      <div className="min-w-0 flex-1 space-y-3">
        {/* 쿼리 바: 필터 · 정렬 한 줄 묶음 (검색은 상단 툴바와 동일 상태 공유) */}
        <div className="border-b border-border/60">
          <ViewBar
            search={query}
            onSearchChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            searchPlaceholder="이름 · 조건 검색"
            filterDefinitions={allFilterDefinitions}
            activeFilters={activeFilters}
            onFilterAdd={(f) => {
              setActiveFilters((prev) => [...prev.filter((p) => p.field !== f.field), f]);
              setPage(1);
            }}
            onFilterRemove={(id) => {
              setActiveFilters((prev) => prev.filter((f) => f.id !== id));
              setPage(1);
            }}
            onFiltersReset={() => {
              setActiveFilters([]);
              setActiveSorts([{ field: 'createdAt', label: '등록일', direction: 'desc' }]);
              setPage(1);
            }}
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
          </div>

          {isError ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white py-16 text-center">
              <p className="text-sm text-muted-foreground">목록을 불러오지 못했습니다.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-3.5" />
                다시 시도
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-white">
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
                    setActiveSorts([
                      {
                        field: s[0].id,
                        label: def?.label ?? s[0].id,
                        direction: s[0].desc ? 'desc' : 'asc',
                      },
                    ]);
                  }
                }}
                rowHeight={36}
                pinnedColumns={['customer']}
                enableRowSelection
                // 선택 배지 바 (디자인 시안의 "n명 선택" 바 — DataTable 내장 바 사용)
                renderBulkActions={() => null}
                isLoading={isLoading}
                onRowClick={openDetail}
                emptyMessage={
                  query.trim() || activeFilters.length > 0 || preset !== 'all'
                    ? '검색 결과가 없습니다.'
                    : '구매 희망 고객이 없습니다. 우측 상단 "구매고객 등록"으로 첫 조건을 추가해보세요.'
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
                  const regions = regionLabels(focusedRow).join(', ');
                  const siteNames = siteLabels(focusedRow).join(', ');
                  const budget = formatBudget(focusedRow);
                  return (
                    <>
                      <span className="tabular-nums text-foreground/80">
                        {totalCount.toLocaleString()}명
                      </span>
                      <span className="text-border">|</span>
                      <span className="font-medium text-foreground">{contact?.name ?? '-'}</span>
                      {contact?.phone && (
                        <span className="tabular-nums text-foreground/70">
                          {formatPhone(contact.phone)}
                        </span>
                      )}
                      {budget !== '—' && (
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
          )}
      </div>

      {/* ── 연락함 기록 (행 빠른 액션) ── */}
      <ContactLogDialog
        open={contactLogTarget !== null}
        onOpenChange={(open) => {
          if (!open) setContactLogTarget(null);
        }}
        requirementId={contactLogTarget?.id ?? null}
        defaultNextContactDate={contactLogTarget?.nextContactDate}
        contactName={contactLogTarget?.contact?.name}
      />
    </div>
  );
}
