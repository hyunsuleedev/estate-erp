import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Clock3,
  ExternalLink,
  Link2,
  ListChecks,
  MessageSquareText,
  Phone,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Contact, Dong, Site, Unit } from '@estate-erp/api-client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  buildConsultationApiParams,
  getConsultationActionLabel,
  getConsultationContextCards,
  getConsultationContextLabels,
  getConsultationFilterChips,
  getConsultationOutcomeLabel,
  getConsultationPreview,
  getSelectedConsultation,
  getConsultationSignal,
  groupConsultationsByDay,
  type ConsultationContextCard,
  type ConsultationEntityFilters,
  type ConsultationFilterOption,
  type ConsultationQuickFilter,
  type ConsultationListItem,
} from './-consultation-view-utils';

const typeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

const typeColors: Record<string, string> = {
  phone: 'bg-blue-50 text-blue-700',
  visit: 'bg-emerald-50 text-emerald-700',
  online: 'bg-violet-50 text-violet-700',
};

const typeDots: Record<string, string> = {
  phone: 'bg-blue-500',
  visit: 'bg-emerald-500',
  online: 'bg-violet-500',
};

const initialFilters: ConsultationEntityFilters = {
  q: '',
  quickFilter: 'all',
  contact: null,
  site: null,
  dong: null,
  unit: null,
  type: null,
};

export const Route = createFileRoute('/_authenticated/consultations/')({
  component: ConsultationsPage,
});

function ConsultationsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ConsultationEntityFilters>(initialFilters);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null);

  const apiParams = useMemo(
    () => buildConsultationApiParams({ page, sortOrder, filters }),
    [page, sortOrder, filters],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['consultations', apiParams],
    queryFn: () => api.consultations.findAll(apiParams),
  });

  const consultations = data?.items ?? [];
  const dayGroups = useMemo(
    () => groupConsultationsByDay(consultations),
    [consultations],
  );
  const selectedConsultation = useMemo(
    () => getSelectedConsultation(consultations, selectedConsultationId),
    [consultations, selectedConsultationId],
  );

  const updateFilters = (updater: (current: ConsultationEntityFilters) => ConsultationEntityFilters) => {
    setFilters(updater);
    setPage(1);
  };

  return (
    <div className="space-y-4 pb-4">
      <section className="rounded-[10px] border border-slate-200 bg-background">
        <ConsultationFilterBar
          filters={filters}
          sortOrder={sortOrder}
          onFiltersChange={updateFilters}
          onSortOrderChange={(value) => {
            setSortOrder(value);
            setPage(1);
          }}
          onReset={() => {
            setFilters(initialFilters);
            setSortOrder('desc');
            setPage(1);
          }}
        />
      </section>

      <section className="min-h-0 overflow-hidden rounded-[10px] border border-slate-200 bg-background">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">대화 원장</h2>
            <p className="text-xs text-muted-foreground">날짜별 상담과 업무 신호를 한 번에 확인합니다.</p>
          </div>
          <Badge variant="outline" className="rounded-lg bg-background text-[11px] text-slate-500">
            {consultations.length}건 표시
          </Badge>
        </div>

        <div data-testid="consultation-ledger-flow">
          {isLoading ? (
            <ConsultationLoading />
          ) : dayGroups.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground">상담 기록이 없습니다.</div>
          ) : (
            <div className="px-4 py-3">
              {dayGroups.map((group) => (
                <ConsultationDayGroup
                  key={group.key}
                  label={group.label}
                  items={group.items}
                  selectedId={selectedConsultationId}
                  onSelect={setSelectedConsultationId}
                />
              ))}
            </div>
          )}
        </div>

        <PaginationFooter
          page={page}
          totalPages={data?.pagination?.totalPages ?? 1}
          total={data?.pagination?.total ?? 0}
          onPageChange={setPage}
        />
      </section>

      <Sheet open={selectedConsultation !== null} onOpenChange={(open) => !open && setSelectedConsultationId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[560px]">
          {selectedConsultation && <ConsultationDetailSheet consultation={selectedConsultation} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ConsultationFilterBar({
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
        <QuickFilterButton active={filters.quickFilter === 'buyerRequirement'} onClick={() => setQuickFilter('buyerRequirement')}>
          구매요건
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
          <PopoverContent align="start" className="w-[390px] p-0">
            <div className="border-b border-slate-200 px-3 py-2">
              <div className="text-sm font-semibold text-slate-950">엔티티 필터</div>
              <div className="mt-0.5 text-xs text-muted-foreground">고객과 매물을 선택해서 상담 범위를 좁힙니다.</div>
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
        <Command className="rounded-lg border border-slate-200 bg-background">
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

function ConsultationDayGroup({
  label,
  items,
  selectedId,
  onSelect,
}: {
  label: string;
  items: ConsultationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-2 rounded-full bg-slate-400" />
        <h3 className="text-sm font-medium text-slate-900">{label}</h3>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        {items.map((consultation) => (
          <ConsultationTimelineRow
            key={consultation.id}
            consultation={consultation}
            selected={consultation.id === selectedId}
            onSelect={() => onSelect(consultation.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ConsultationTimelineRow({
  consultation,
  selected,
  onSelect,
}: {
  consultation: ConsultationListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const signal = getConsultationSignal(consultation);
  const outcome = getConsultationOutcomeLabel(consultation);
  const contextLabels = getConsultationContextLabels(consultation);

  return (
    <button
      type="button"
      className={cn(
        'group/row flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/30',
        selected && 'bg-slate-50',
      )}
      onClick={onSelect}
    >
      <Avatar className="mt-0.5 size-8">
        <AvatarFallback className="text-xs">{getInitial(consultation.contact?.name)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{consultation.contact?.name ?? '미지정 고객'}</span>
          <TypeBadge type={consultation.type} />
          <Badge className={cn('rounded-md px-1.5 text-[10px]', signal.className)}>{signal.label}</Badge>
          <Badge variant="outline" className="rounded-md px-1.5 text-[10px] text-slate-500">
            {outcome}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-700">
          {getConsultationPreview(consultation.content, 132)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="size-3" />
            {formatTime(consultation.createdAt)}
          </span>
          {contextLabels.slice(0, 3).map((label) => (
            <Badge key={label} variant="outline" className="rounded-md bg-background px-1.5 text-[10px] text-slate-500">
              {label}
            </Badge>
          ))}
        </div>
      </div>

      <ArrowRight className="mt-2 size-4 text-slate-300 opacity-0 transition-opacity group-hover/row:opacity-100" />
    </button>
  );
}

function ConsultationDetailSheet({ consultation }: { consultation: ConsultationListItem }) {
  const signal = getConsultationSignal(consultation);
  const contextCards = getConsultationContextCards(consultation);
  const actionLabel = getConsultationActionLabel(consultation);

  return (
    <>
      <SheetHeader className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <Avatar className="size-9">
            <AvatarFallback>{getInitial(consultation.contact?.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base font-semibold text-slate-950">
              {consultation.contact?.name ?? '미지정 고객'}
            </SheetTitle>
            <SheetDescription className="truncate text-xs text-muted-foreground">
              {consultation.contact?.phone ?? '연락처 없음'}
            </SheetDescription>
          </div>
          <TypeBadge type={consultation.type} />
        </div>
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div data-testid="consultation-detail-sheet" className="space-y-5 px-5 py-4">
          <PanelSection title="상담 결과">
            <div className="grid grid-cols-2 gap-2">
              <InfoTile label="업무 신호" value={signal.label} icon={MessageSquareText} className={signal.className} />
              <InfoTile label="결과" value={getConsultationOutcomeLabel(consultation)} icon={ListChecks} />
            </div>
          </PanelSection>

          <PanelSection title="연결 맥락">
            {contextCards.length > 0 ? (
              <div className="space-y-2">
                {contextCards.map((card) => (
                  <ConsultationContextLinkCard key={`${card.key}-${card.title}`} card={card} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-sm text-muted-foreground">
                연결된 매물, 리스팅, 매칭, 구매요건이 없습니다.
              </div>
            )}
          </PanelSection>

          <PanelSection title="후속 액션 후보">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3">
              <div className="flex items-start gap-2">
                <ListChecks className="mt-0.5 size-4 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-indigo-950">{actionLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-indigo-900/80">
                    관련 레코드에 반영할지 확인하고 업무나 일정으로 이어갈 항목입니다.
                  </p>
                  <Button asChild variant="outline" size="xs" className="mt-3 border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100">
                    <Link to="/tasks">업무에서 관리</Link>
                  </Button>
                </div>
              </div>
            </div>
          </PanelSection>

          <PanelSection title="상담 전문">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{consultation.content}</p>
            </div>
          </PanelSection>

          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-xs text-muted-foreground">
            <MetaLine icon={CalendarClock} label={formatDateTime(consultation.createdAt)} />
            <MetaLine icon={UserRound} label={consultation.createdBy?.name ?? '담당자 미지정'} />
            <MetaLine icon={Phone} label={consultation.contact?.phone ?? '연락처 없음'} />
            <MetaLine icon={Building2} label={consultation.property?.site?.name ?? '매물 미연결'} />
          </div>
        </div>
      </ScrollArea>
    </>
  );
}

function ConsultationContextLinkCard({ card }: { card: ConsultationContextCard }) {
  const content = <ConsultationContextCardContent card={card} />;

  if (card.to === '/contacts/$id' && card.params) {
    return (
      <Link to="/contacts/$id" params={card.params} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
        {content}
      </Link>
    );
  }

  if (card.to === '/properties/$id' && card.params) {
    return (
      <Link to="/properties/$id" params={card.params} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
        {content}
      </Link>
    );
  }

  if (card.to === '/matches') {
    return (
      <Link to="/matches" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
        {content}
      </Link>
    );
  }

  if (card.to === '/buyer-requirements') {
    return (
      <Link to="/buyer-requirements" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
        {content}
      </Link>
    );
  }

  return (
    <Link to="/properties" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
      {content}
    </Link>
  );
}

function ConsultationContextCardContent({ card }: { card: ConsultationContextCard }) {
  const Icon = contextCardIcons[card.key] ?? Link2;

  return (
    <div className="group/context flex items-start gap-3 rounded-lg border border-slate-200 bg-background px-3 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50">
      <div className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', contextCardIconClasses[card.key])}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-md bg-white px-1.5 text-[10px] text-slate-500">
            {card.label}
          </Badge>
          <ExternalLink className="size-3 text-slate-300 transition-colors group-hover/context:text-slate-500" />
        </div>
        <div className="mt-1 truncate text-sm font-medium text-slate-950">{card.title}</div>
        <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{card.description}</div>
      </div>
    </div>
  );
}

const contextCardIcons: Record<ConsultationContextCard['key'], ComponentType<{ className?: string }>> = {
  contact: UserRound,
  property: Building2,
  listing: Link2,
  match: ArrowRight,
  buyerRequirement: ListChecks,
};

const contextCardIconClasses: Record<ConsultationContextCard['key'], string> = {
  contact: 'bg-sky-50 text-sky-700',
  property: 'bg-emerald-50 text-emerald-700',
  listing: 'bg-blue-50 text-blue-700',
  match: 'bg-violet-50 text-violet-700',
  buyerRequirement: 'bg-amber-50 text-amber-700',
};

function InfoTile({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5', className)}>
      <div className="flex items-center gap-1.5 text-[11px] text-current/70">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-current">{value}</div>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function MetaLine({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge className={cn('rounded-md px-1.5 text-[10px]', typeColors[type] ?? 'bg-slate-100 text-slate-700')}>
      <span className={cn('size-1.5 rounded-full', typeDots[type] ?? 'bg-slate-400')} />
      {typeLabels[type] ?? type}
    </Badge>
  );
}

function PaginationFooter({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-muted-foreground">
      <span>전체 {total}건</span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          이전
        </Button>
        <span className="min-w-14 text-center">
          {page} / {Math.max(1, totalPages)}
        </span>
        <Button type="button" variant="outline" size="xs" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          다음
        </Button>
      </div>
    </div>
  );
}

function ConsultationLoading() {
  return (
    <div className="space-y-3 px-4 py-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

function getInitial(name: string | null | undefined) {
  return name?.trim().charAt(0) || '?';
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
