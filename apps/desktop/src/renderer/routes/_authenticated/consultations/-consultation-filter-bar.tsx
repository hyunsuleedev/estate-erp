import { formatUnitLabel as formatSharedUnitLabel } from '@estate-erp/shared';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, Link2, PenLine, RotateCcw, UserRound, Waypoints, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Dong, Site, Unit } from '@estate-erp/api-client';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ToolbarFilterChip,
  ToolbarSelectPanel,
  toolbarGhostButtonClassName,
} from '../properties/-components/property-toolbar';
import { getInitial } from './-consultation-badges';
import {
  type ConsultationEntityFilters,
  type ConsultationFilterOption,
  type ConsultationQuickFilter,
} from './-consultation-view-utils';

const TYPE_OPTIONS = [
  { value: 'phone', label: '전화' },
  { value: 'visit', label: '방문' },
  { value: 'online', label: '문자·온라인' },
];

/** 무엇에 연결된 상담인지 */
const CONTEXT_OPTIONS = [
  { value: 'property', label: '매물 연결' },
  { value: 'listingIntake', label: '의뢰 연결' },
  { value: 'buyerRequirement', label: '희망 조건 연결' },
  { value: 'unlinked', label: '연결 없음' },
];

function formatDateRange(from: string | null | undefined, to: string | null | undefined): string | null {
  const short = (value: string) => value.slice(2).replaceAll('-', '.');
  if (from && to) return `${short(from)} ~ ${short(to)}`;
  if (from) return `${short(from)} 이후`;
  if (to) return `${short(to)} 까지`;
  return null;
}

/**
 * 상담분석의 필터 줄. 매물관리의 필터 줄과 같은 부품(ToolbarFilterChip, shape="soft")을 쓴다:
 * 테두리 없이 "아이콘 이름 ⌄"만 놓고, 값이 걸린 필터만 파란 알약으로 뜬다.
 * 검색은 보기 탭 옆(화면 쪽)에 있고, 정렬은 표 머리의 "일시"를 눌러 바꾼다.
 */
export function ConsultationFilterBar({
  filters,
  onFiltersChange,
  onReset,
  hasActiveFilters,
}: {
  filters: ConsultationEntityFilters;
  onFiltersChange: (updater: (current: ConsultationEntityFilters) => ConsultationEntityFilters) => void;
  onReset: () => void;
  /** 초기화할 것이 있는지 (검색어 · 정렬 포함 — 화면이 판단한다) */
  hasActiveFilters: boolean;
}) {
  const placeSummary = [filters.site?.label, filters.dong?.label, filters.unit?.label].filter(Boolean).join(' ') || null;
  // 후속 필요(actionRequired)는 보기 탭으로 옮겨 갔다. 남아 있는 값이면 연결 조건이 없는 것으로 본다
  const contextValue = CONTEXT_OPTIONS.some((option) => option.value === filters.quickFilter)
    ? filters.quickFilter
    : 'all';

  return (
    <section data-consultation-filter-row className="flex shrink-0 items-start gap-2 bg-white px-3 pb-1.5 pt-2">
      {/* 필터가 모두 이 줄에 있으므로, 창이 좁으면 옆으로 숨기지 않고 다음 줄로 내린다 */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
        <ToolbarFilterChip
          label="고객"
          shape="soft"
          icon={<UserRound />}
          summary={filters.contact?.label ?? null}
          onClear={() => onFiltersChange((current) => ({ ...current, contact: null }))}
          contentClassName="w-[320px] p-0"
        >
          {(close) => (
            <ContactFilterPicker
              selected={filters.contact ?? null}
              onSelect={(contact) => {
                onFiltersChange((current) => ({ ...current, contact }));
                if (contact) close();
              }}
            />
          )}
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="매물"
          shape="soft"
          icon={<Building2 />}
          summary={placeSummary}
          onClear={() => onFiltersChange((current) => ({ ...current, site: null, dong: null, unit: null }))}
          contentClassName="w-[360px] max-w-[calc(100vw-24px)] p-0"
        >
          <PropertyHierarchyFilter
            site={filters.site ?? null}
            dong={filters.dong ?? null}
            unit={filters.unit ?? null}
            onChange={(next) => onFiltersChange((current) => ({ ...current, ...next }))}
          />
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="방식"
          shape="soft"
          icon={<Waypoints />}
          summary={TYPE_OPTIONS.find((option) => option.value === filters.type)?.label ?? null}
          onClear={() => onFiltersChange((current) => ({ ...current, type: null }))}
          contentClassName="w-[180px] p-0"
        >
          {(close) => (
            <ToolbarSelectPanel
              options={TYPE_OPTIONS}
              value={filters.type ?? 'all'}
              onChange={(value) => onFiltersChange((current) => ({ ...current, type: value === 'all' ? null : value }))}
              onClose={close}
            />
          )}
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="연결"
          shape="soft"
          icon={<Link2 />}
          summary={CONTEXT_OPTIONS.find((option) => option.value === contextValue)?.label ?? null}
          onClear={() => onFiltersChange((current) => ({ ...current, quickFilter: 'all' }))}
          contentClassName="w-[200px] p-0"
        >
          {(close) => (
            <ToolbarSelectPanel
              options={CONTEXT_OPTIONS}
              value={contextValue}
              onChange={(value) =>
                onFiltersChange((current) => ({ ...current, quickFilter: value as ConsultationQuickFilter }))
              }
              onClose={close}
            />
          )}
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="상담자"
          shape="soft"
          icon={<PenLine />}
          summary={filters.createdBy?.label ?? null}
          onClear={() => onFiltersChange((current) => ({ ...current, createdBy: null }))}
          contentClassName="w-[220px] p-0"
        >
          {(close) => (
            <CreatedByFilterPicker
              selected={filters.createdBy ?? null}
              onSelect={(createdBy) => {
                onFiltersChange((current) => ({ ...current, createdBy }));
                close();
              }}
            />
          )}
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="기간"
          shape="soft"
          icon={<CalendarDays />}
          summary={formatDateRange(filters.dateFrom, filters.dateTo)}
          onClear={() => onFiltersChange((current) => ({ ...current, dateFrom: null, dateTo: null }))}
          contentClassName="w-[300px] p-3"
        >
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="시작일"
              value={filters.dateFrom ?? ''}
              onChange={(event) => onFiltersChange((current) => ({ ...current, dateFrom: event.target.value || null }))}
              className="h-8 text-[13px]"
            />
            <span className="text-xs text-muted-foreground">~</span>
            <Input
              type="date"
              aria-label="종료일"
              value={filters.dateTo ?? ''}
              onChange={(event) => onFiltersChange((current) => ({ ...current, dateTo: event.target.value || null }))}
              className="h-8 text-[13px]"
            />
          </div>
        </ToolbarFilterChip>
      </div>

      {/* 초기화 — 필터 줄이 넘쳐도 가려지지 않게 오른쪽에 고정 */}
      {hasActiveFilters && (
        <button type="button" className={cn(toolbarGhostButtonClassName, 'shrink-0 rounded-full')} onClick={onReset}>
          <RotateCcw className="size-3.5" />
          초기화
        </button>
      )}
    </section>
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
    <div className="p-3">
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
                    <div className="truncate text-xs tabular-nums text-muted-foreground">
                      {contact.phone ? formatPhone(contact.phone) : '전화번호 없음'}
                    </div>
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
    <div className="p-3">
      <div className="mb-2 text-xs font-semibold text-slate-700">상담자</div>
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
  const { data: dongs = [], isSuccess: dongsLoaded } = useQuery({
    queryKey: ['consultation-filter-dongs', site?.id],
    queryFn: () => api.dongs.findAll(site?.id),
    enabled: Boolean(site?.id),
  });
  const visibleDongs = dongs.filter((item) => !item.isPlaceholder);
  // 호는 동을 고른 뒤에 받는다. 동이 있는 단지에서 단지만 고른 채로 부르면 단지의 모든 호(수천 개)가 온다.
  // 동 구분이 없는 건물(다가구 · 상가)은 고를 동이 없으므로 바로 받는다.
  const canLoadUnits =
    Boolean(site?.id) && dongsLoaded && (visibleDongs.length === 0 || Boolean(dong?.id));
  const { data: units = [], isSuccess: unitsLoaded } = useQuery({
    queryKey: ['consultation-filter-units', site?.id, dong?.id],
    queryFn: () => api.units.findAll({ siteId: site?.id, dongId: dong?.id }),
    enabled: canLoadUnits,
  });

  const filteredSites = useMemo(() => {
    const query = siteQuery.trim().toLowerCase();
    if (!query) return sites.slice(0, 12);
    return sites.filter((item) => formatSiteSearchText(item).includes(query)).slice(0, 12);
  }, [siteQuery, sites]);

  return (
    <div className="p-3">
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

        {site && visibleDongs.length === 0 && unitsLoaded && units.length === 0 && (
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
  return formatSharedUnitLabel(unit);
}

function withSuffix(value: string, suffix: string) {
  const trimmed = value.trim();
  return trimmed.endsWith(suffix) ? trimmed : `${trimmed}${suffix}`;
}
