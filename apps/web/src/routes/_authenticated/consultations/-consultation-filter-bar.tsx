import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Dong, Site, Unit } from '@estate-erp/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getInitial } from './-consultation-badges';
import {
  getConsultationFilterChips,
  type ConsultationEntityFilters,
  type ConsultationFilterOption,
  type ConsultationQuickFilter,
} from './-consultation-view-utils';

export function ConsultationFilterBar({
  filters,
  sortOrder,
  onFiltersChange,
  onSortOrderChange,
  onReset,
}: {
  filters: ConsultationEntityFilters;
  sortOrder: 'asc' | 'desc';
  onFiltersChange: (updater: (current: ConsultationEntityFilters) => ConsultationEntityFilters) => void;
  onSortOrderChange: (value: 'asc' | 'desc') => void;
  onReset: () => void;
}) {
  const chips = getConsultationFilterChips(filters);
  const hasActiveFilters = chips.length > 0;

  const setQuickFilter = (quickFilter: ConsultationQuickFilter) => {
    onFiltersChange((current) => ({ ...current, quickFilter }));
  };

  const clearChip = (key: string) => {
    onFiltersChange((current) => {
      if (key === 'q') return { ...current, q: '' };
      if (key === 'quickFilter') return { ...current, quickFilter: 'all' };
      if (key === 'contact') return { ...current, contact: null };
      if (key === 'property') return { ...current, site: null, dong: null, unit: null };
      if (key === 'type') return { ...current, type: null };
      if (key === 'createdBy') return { ...current, createdBy: null };
      if (key === 'dateRange') return { ...current, dateFrom: null, dateTo: null };
      return current;
    });
  };

  return (
    <div className="space-y-0">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-1 rounded-md bg-muted/80 px-2">
          <Search className="size-3.5 text-muted-foreground" />
          <Input
            type="text"
            value={filters.q ?? ''}
            onChange={(event) => onFiltersChange((current) => ({ ...current, q: event.target.value }))}
            placeholder="상담 내용 검색..."
            className="h-8 w-44 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
          />
          {filters.q && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onFiltersChange((current) => ({ ...current, q: '' }))}
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="h-4 w-px bg-border/50" />

        <QuickFilterButton active={filters.quickFilter === 'all'} onClick={() => setQuickFilter('all')}>
          전체
        </QuickFilterButton>
        <QuickFilterButton active={filters.quickFilter === 'actionRequired'} onClick={() => setQuickFilter('actionRequired')}>
          후속 필요
        </QuickFilterButton>
        <QuickFilterButton active={filters.quickFilter === 'property'} onClick={() => setQuickFilter('property')}>
          매물 연결
        </QuickFilterButton>
        <QuickFilterButton active={filters.quickFilter === 'listingIntake'} onClick={() => setQuickFilter('listingIntake')}>
          의뢰 연결
        </QuickFilterButton>
        <QuickFilterButton active={filters.quickFilter === 'buyerRequirement'} onClick={() => setQuickFilter('buyerRequirement')}>
          구매요건
        </QuickFilterButton>
        <QuickFilterButton active={filters.quickFilter === 'unlinked'} onClick={() => setQuickFilter('unlinked')}>
          미연결
        </QuickFilterButton>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3.5" />
              필터
              {hasActiveFilters && (
                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {chips.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-[70vh] w-[390px] overflow-y-auto p-0">
            <div className="border-b border-slate-200 px-3 py-2">
              <div className="text-sm font-semibold text-slate-950">상세 필터</div>
              <div className="mt-0.5 text-xs text-muted-foreground">고객·매물·기간·기록자로 상담 범위를 좁힙니다.</div>
            </div>
            <div className="space-y-3 p-3">
              <ContactFilterPicker
                selected={filters.contact ?? null}
                onSelect={(contact) => onFiltersChange((current) => ({ ...current, contact }))}
              />
              <PropertyHierarchyFilter
                site={filters.site ?? null}
                dong={filters.dong ?? null}
                unit={filters.unit ?? null}
                onChange={(next) => onFiltersChange((current) => ({ ...current, ...next }))}
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="mb-2 text-xs font-semibold text-slate-700">상담유형</div>
                <Select
                  value={filters.type ?? 'all'}
                  onValueChange={(value) => onFiltersChange((current) => ({ ...current, type: value === 'all' ? null : value }))}
                >
                  <SelectTrigger size="sm" className="w-full bg-background">
                    <SelectValue placeholder="전체 유형" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 유형</SelectItem>
                    <SelectItem value="phone">전화</SelectItem>
                    <SelectItem value="visit">방문</SelectItem>
                    <SelectItem value="online">온라인</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <CreatedByFilterPicker
                selected={filters.createdBy ?? null}
                onSelect={(createdBy) => onFiltersChange((current) => ({ ...current, createdBy }))}
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700">기간</div>
                  {(filters.dateFrom || filters.dateTo) && (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => onFiltersChange((current) => ({ ...current, dateFrom: null, dateTo: null }))}
                    >
                      해제
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={filters.dateFrom ?? ''}
                    onChange={(event) =>
                      onFiltersChange((current) => ({ ...current, dateFrom: event.target.value || null }))
                    }
                    className="h-8 bg-background text-xs"
                  />
                  <span className="text-xs text-muted-foreground">~</span>
                  <Input
                    type="date"
                    value={filters.dateTo ?? ''}
                    onChange={(event) =>
                      onFiltersChange((current) => ({ ...current, dateTo: event.target.value || null }))
                    }
                    className="h-8 bg-background text-xs"
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        <Select value={sortOrder} onValueChange={(value) => onSortOrderChange(value as 'asc' | 'desc')}>
          <SelectTrigger size="sm" className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">최신순</SelectItem>
            <SelectItem value="asc">오래된순</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(hasActiveFilters || sortOrder !== 'desc') && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/30 px-3 py-1.5">
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="gap-1 rounded-md py-0.5 pr-1 text-xs font-normal"
            >
              <span className="font-medium">{chip.label}</span>
              <button
                type="button"
                onClick={() => clearChip(chip.key)}
                className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {sortOrder !== 'desc' && (
            <Badge variant="outline" className="rounded-md py-0.5 text-xs font-normal">
              등록일 ↑
            </Badge>
          )}
          <button type="button" onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground">
            초기화
          </button>
        </div>
      )}
    </div>
  );
}

function QuickFilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'outline' : 'ghost'}
      size="sm"
      className={cn(
        'h-8 px-2.5 text-xs',
        active ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'text-muted-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ContactFilterPicker({
  selected,
  onSelect,
}: {
  selected: ConsultationFilterOption | null;
  onSelect: (contact: ConsultationFilterOption | null) => void;
}) {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['consultation-filter-contacts', query],
    queryFn: () => api.contacts.findAll({ search: query || undefined, limit: 8, sortBy: 'updatedAt', sortOrder: 'desc' }),
  });

  const contacts = data?.items ?? [];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-700">고객</div>
        {selected && (
          <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => onSelect(null)}>
            해제
          </button>
        )}
      </div>
      {selected ? (
        <SelectedEntityButton label={selected.label} onClear={() => onSelect(null)} />
      ) : (
        <Command className="rounded-lg border border-slate-200 bg-background" shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="김소유, 전화번호, 태그 검색" />
          <CommandList className="max-h-44">
            <CommandEmpty>{isLoading ? '검색 중...' : '고객이 없습니다.'}</CommandEmpty>
            <CommandGroup>
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={`${contact.name} ${contact.phone ?? ''} ${contact.id}`}
                  onSelect={() => onSelect({ id: contact.id, label: contact.name })}
                  className="items-start"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium">
                    {getInitial(contact.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{contact.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{contact.phone ?? '연락처 없음'}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </div>
  );
}

function CreatedByFilterPicker({
  selected,
  onSelect,
}: {
  selected: ConsultationFilterOption | null;
  onSelect: (user: ConsultationFilterOption | null) => void;
}) {
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-2 text-xs font-semibold text-slate-700">기록자</div>
      <Select
        value={selected?.id ?? 'all'}
        onValueChange={(value) => {
          if (value === 'all') {
            onSelect(null);
            return;
          }
          const employee = employees.find((item) => item.id === value);
          onSelect(employee ? { id: employee.id, label: employee.name } : null);
        }}
      >
        <SelectTrigger size="sm" className="w-full bg-background">
          <SelectValue placeholder="전체 직원" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 직원</SelectItem>
          {employees.map((employee) => (
            <SelectItem key={employee.id} value={employee.id}>
              {employee.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PropertyHierarchyFilter({
  site,
  dong,
  unit,
  onChange,
}: {
  site: ConsultationFilterOption | null;
  dong: ConsultationFilterOption | null;
  unit: ConsultationFilterOption | null;
  onChange: (next: Partial<ConsultationEntityFilters>) => void;
}) {
  const [siteQuery, setSiteQuery] = useState('');
  const { data: sites = [] } = useQuery({
    queryKey: ['consultation-filter-sites'],
    queryFn: () => api.sites.findAll(),
  });
  const { data: dongs = [] } = useQuery({
    queryKey: ['consultation-filter-dongs', site?.id],
    queryFn: () => api.dongs.findAll(site?.id),
    enabled: Boolean(site?.id),
  });
  const { data: units = [] } = useQuery({
    queryKey: ['consultation-filter-units', site?.id, dong?.id],
    queryFn: () => api.units.findAll({ siteId: site?.id, dongId: dong?.id }),
    enabled: Boolean(site?.id),
  });

  const filteredSites = useMemo(() => {
    const query = siteQuery.trim().toLowerCase();
    if (!query) return sites.slice(0, 12);
    return sites.filter((item) => formatSiteSearchText(item).includes(query)).slice(0, 12);
  }, [siteQuery, sites]);
  const visibleDongs = dongs.filter((item) => !item.isPlaceholder);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-700">매물</div>
        {(site || dong || unit) && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => onChange({ site: null, dong: null, unit: null })}
          >
            해제
          </button>
        )}
      </div>

      <div className="space-y-2">
        {site ? (
          <SelectedEntityButton label={site.label} subLabel="단지/장소" onClear={() => onChange({ site: null, dong: null, unit: null })} />
        ) : (
          <Command className="rounded-lg border border-slate-200 bg-background">
            <CommandInput value={siteQuery} onValueChange={setSiteQuery} placeholder="고덕그라시움, 주소 검색" />
            <CommandList className="max-h-44">
              <CommandEmpty>단지나 장소가 없습니다.</CommandEmpty>
              <CommandGroup>
                {filteredSites.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.name} ${item.roadAddress ?? ''} ${item.jibunAddress ?? ''} ${item.id}`}
                    onSelect={() => onChange({ site: { id: item.id, label: item.name }, dong: null, unit: null })}
                    className="items-start"
                  >
                    <Building2 className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.roadAddress ?? item.jibunAddress ?? item.type}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        {site && visibleDongs.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">동 선택</div>
            <div className="flex max-h-20 flex-wrap gap-1 overflow-auto">
              {visibleDongs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11px]',
                    dong?.id === item.id ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-background text-slate-600',
                  )}
                  onClick={() => onChange({ dong: { id: item.id, label: formatDongLabel(item) }, unit: null })}
                >
                  {formatDongLabel(item)}
                </button>
              ))}
            </div>
          </div>
        )}

        {site && units.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">호 선택</div>
            <div className="grid max-h-24 grid-cols-3 gap-1 overflow-auto">
              {units.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11px]',
                    unit?.id === item.id ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-background text-slate-600',
                  )}
                  onClick={() => onChange({ unit: { id: item.id, label: formatUnitLabel(item) } })}
                >
                  {formatUnitLabel(item)}
                </button>
              ))}
            </div>
          </div>
        )}

        {site && units.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-200 bg-background px-2 py-2 text-[11px] text-muted-foreground">
            단독주택·토지처럼 동/호가 없는 매물은 단지/장소만으로 필터링합니다.
          </div>
        )}
      </div>
    </div>
  );
}

function SelectedEntityButton({
  label,
  subLabel,
  onClear,
}: {
  label: string;
  subLabel?: string;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-background px-2 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-950">{label}</div>
        {subLabel && <div className="text-[11px] text-muted-foreground">{subLabel}</div>}
      </div>
      <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={onClear}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function formatSiteSearchText(site: Site) {
  return [site.name, site.roadAddress, site.jibunAddress, site.type]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function formatDongLabel(dong: Dong) {
  return withSuffix(dong.name, '동');
}

function formatUnitLabel(unit: Unit) {
  return withSuffix(unit.name, '호');
}

function withSuffix(value: string, suffix: string) {
  const trimmed = value.trim();
  return trimmed.endsWith(suffix) ? trimmed : `${trimmed}${suffix}`;
}
