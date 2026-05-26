import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  Building2,
  Home,
  ChevronDown,
  ChevronRight,
  MapPin,
  LayoutList,
  FolderTree,
  PanelLeftIcon,
  User,
  FileText,
  MoreHorizontal,
  Ruler,
  Layers,
  Calendar,
  LayoutGrid,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Dong, Unit, OfficeSite } from '@estate-erp/api-client';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ── Labels ──────────────────────────────────────────────────────

const siteTypeLabels: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독주택',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

const siteTypeShort: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피',
  villa: '빌라',
  house: '단독',
  commercial: '상가',
  land: '토지',
  living_accommodation: '숙박',
};

const transactionTypeLabels: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

// ── Helpers ─────────────────────────────────────────────────────

function SiteIcon({ type }: { type: string }) {
  switch (type) {
    case 'apartment':
    case 'officetel':
    case 'living_accommodation':
    case 'commercial':
      return <Building2 className="size-4 shrink-0" />;
    default:
      return <Home className="size-4 shrink-0" />;
  }
}

function extractRegion(address: string | null): string {
  if (!address) return '기타';
  const match = address.match(/([가-힣]+구)\s*([가-힣]+동)?/);
  if (match) return match[2] ? `${match[1]} ${match[2]}` : match[1];
  const cityMatch = address.match(/([가-힣]+[시군])/);
  return cityMatch ? cityMatch[1] : '기타';
}

function formatAreaPyeong(m2: number | null | undefined): string {
  if (!m2) return '-';
  const pyeong = (Number(m2) * 0.3025).toFixed(1);
  return `${pyeong}평`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatPriceLabel(
  transactionType: string,
  price: number | null,
  deposit: number | null,
  monthlyRent: number | null,
): string {
  if (transactionType === 'monthly') {
    const depositText = deposit ? `${deposit.toLocaleString()}만` : '-';
    const monthlyText = monthlyRent ? `${monthlyRent.toLocaleString()}만` : '-';
    return `${depositText} / ${monthlyText}`;
  }

  const value = transactionType === 'sale' ? price : deposit;
  if (!value) return '-';
  return `${value.toLocaleString()}만`;
}

interface MultiSelectOption {
  value: string;
  label: string;
  helper?: string;
}

interface PositionedUnit {
  unit: Unit;
  floor: number;
  lineNo: number;
}

interface LayoutSection {
  key: string;
  label: string;
  floors: number[];
  lineNos: number[];
  cellMap: Map<string, PositionedUnit>;
  unpositionedUnits: Unit[];
}

function parseUnitPlacement(unit: Unit): { floor: number | null; lineNo: number | null } {
  const digits = unit.name.replace(/\D/g, '');
  const fallbackFloor = digits.length >= 3 ? Number.parseInt(digits.slice(0, -2), 10) : null;
  const fallbackLineNo = digits.length >= 2 ? Number.parseInt(digits.slice(-2), 10) : null;

  return {
    floor: unit.floor ?? (Number.isNaN(fallbackFloor) ? null : fallbackFloor),
    lineNo: unit.lineNo ?? (Number.isNaN(fallbackLineNo) ? null : fallbackLineNo),
  };
}

function formatFloorLabel(floor: number): string {
  if (floor === 0) return 'P';
  if (floor < 0) return `B${Math.abs(floor)}`;
  return `${floor}`;
}

function UnitLayoutBoard({
  sections,
  selectedUnitId,
  onUnitOpen,
}: {
  sections: LayoutSection[];
  selectedUnitId?: string | null;
  onUnitOpen?: (unit: Unit) => void;
}) {
  const hasPositionedUnits = sections.some((section) => section.floors.length > 0 && section.lineNos.length > 0);

  if (!hasPositionedUnits) {
    const allUnits = sections.flatMap((section) => section.unpositionedUnits);

    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <LayoutGrid className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium">배치표를 그릴 수 있는 층/라인 정보가 없습니다</h3>
            <p className="text-xs text-muted-foreground">
              현재 호수 데이터에 `floor` 또는 `lineNo`가 비어 있습니다. 호수명 숫자도 함께
              파싱했지만, 배치 기준을 만들 수 있는 데이터가 부족합니다.
            </p>
          </div>
          {allUnits.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {allUnits.slice(0, 16).map((unit) => (
                <Badge key={unit.id} variant="secondary" className="text-[10px] font-normal">
                  {unit.name}
                </Badge>
              ))}
              {allUnits.length > 16 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  +{allUnits.length - 16}개
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] font-normal">
          일반
        </Badge>
        <Badge variant="secondary" className="text-[10px] font-normal">
          상담 있음
        </Badge>
        <Badge className="bg-violet-500/15 text-[10px] font-normal text-violet-700 hover:bg-violet-500/15 dark:text-violet-200">
          매물 있음
        </Badge>
      </div>

      <div className="space-y-6">
        {sections.map((section) => {
          const showTitle = sections.length > 1 || section.label !== '전체';
          return (
            <section key={section.key} className="space-y-3">
              {showTitle && (
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{section.label}</h3>
                  <span className="text-xs text-muted-foreground">
                    {section.floors.length}층 · {section.lineNos.length}라인
                  </span>
                </div>
              )}

              {section.floors.length > 0 && section.lineNos.length > 0 ? (
                <div className="overflow-auto rounded-xl border border-border/60 bg-muted/10 p-3">
                  <div
                    className="grid gap-1.5"
                    style={{
                      gridTemplateColumns: `56px repeat(${section.lineNos.length}, minmax(88px, 1fr))`,
                      minWidth: 56 + section.lineNos.length * 88,
                    }}
                  >
                    <div />
                    {section.lineNos.map((lineNo) => (
                      <div
                        key={`header-${section.key}-${lineNo}`}
                        className="flex h-7 items-center justify-center rounded-md text-[10px] font-medium text-muted-foreground"
                      >
                        {String(lineNo).padStart(2, '0')}
                      </div>
                    ))}

                    {section.floors.map((floor) => (
                      <>
                        <div
                          key={`floor-${section.key}-${floor}`}
                          className="flex min-h-16 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground"
                        >
                          {formatFloorLabel(floor)}F
                        </div>
                        {section.lineNos.map((lineNo) => {
                          const positionedUnit = section.cellMap.get(`${floor}:${lineNo}`);

                          if (!positionedUnit) {
                            return (
                              <div
                                key={`empty-${section.key}-${floor}-${lineNo}`}
                                className="min-h-16 rounded-lg border border-dashed border-border/60 bg-background/30"
                              />
                            );
                          }

                          const { unit } = positionedUnit;
                          const hasListing = (unit.properties ?? []).some(
                            (property) => (property.listings?.length ?? 0) > 0,
                          );
                          const hasConsultation = (unit.properties ?? []).some(
                            (property) => (property.consultations?.length ?? 0) > 0,
                          );
                          const isSelected = selectedUnitId === unit.id;

                          return (
                            <button
                              key={unit.id}
                              type="button"
                              onClick={() => onUnitOpen?.(unit)}
                              className={cn(
                                'group flex min-h-16 flex-col items-center justify-center rounded-lg border px-2 py-1 text-center transition-colors',
                                isSelected &&
                                  'border-primary bg-primary text-primary-foreground shadow-sm',
                                !isSelected &&
                                  hasListing &&
                                  'border-violet-500/30 bg-violet-500/12 hover:bg-violet-500/16',
                                !isSelected &&
                                  !hasListing &&
                                  hasConsultation &&
                                  'border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/14',
                                !isSelected &&
                                  !hasListing &&
                                  !hasConsultation &&
                                  'border-border/70 bg-background hover:bg-accent/60',
                              )}
                            >
                              <span className="text-sm font-semibold leading-none">{unit.name}</span>
                              <span
                                className={cn(
                                  'mt-1 text-[10px] leading-none',
                                  isSelected
                                    ? 'text-primary-foreground/80'
                                    : 'text-muted-foreground',
                                )}
                              >
                                {unit.siteUnitType?.name ?? formatAreaPyeong(unit.exclusiveAreaM2)}
                              </span>
                            </button>
                          );
                        })}
                      </>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  이 동은 배치 가능한 층/라인 정보가 없습니다.
                </div>
              )}

              {section.unpositionedUnits.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    배치 불가 호수
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {section.unpositionedUnits.map((unit) => (
                      <button
                        key={`${section.key}-unplaced-${unit.id}`}
                        type="button"
                        onClick={() => onUnitOpen?.(unit)}
                        className={cn(
                          'rounded-md border px-2 py-1 text-[11px] transition-colors',
                          selectedUnitId === unit.id
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border/60 bg-background hover:bg-accent',
                        )}
                      >
                        {unit.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}


// ── Inline filter dropdown (동/타입) ────────────────────────────

interface MultiFilterOption {
  value: string;
  label: string;
}

function MultiFilterDropdown({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: MultiFilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const isAll = values.length === 0;
  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const trigger = (() => {
    if (isAll) return `전체 ${label}`;
    if (selectedLabels.length === 1) return selectedLabels[0];
    return `${selectedLabels[0]} 외 ${selectedLabels.length - 1}`;
  })();
  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);
  return (
    <DropdownMenu onOpenChange={(open) => !open && setQuery('')}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isAll ? 'ghost' : 'secondary'}
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="max-w-24 truncate">{trigger}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border/60 p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <Input
              autoFocus
              placeholder={`${label} 검색`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 border-border/60 pl-6 pr-6 text-xs"
            />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setQuery('')}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
        <div className="p-2">
          <button
            type="button"
            className={cn(
              'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors',
              isAll ? 'bg-accent font-medium' : 'hover:bg-accent/60',
            )}
            onClick={() => onChange([])}
          >
            <span
              className={cn(
                'flex size-3.5 items-center justify-center rounded-sm border',
                isAll ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
            >
              {isAll && '✓'}
            </span>
            전체 {label}
          </button>
          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                검색 결과 없음
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked = values.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs tabular-nums hover:bg-accent/60"
                    onClick={() => toggle(option.value)}
                  >
                    <span
                      className={cn(
                        'flex size-3.5 items-center justify-center rounded-sm border text-[10px]',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                    >
                      {checked && '✓'}
                    </span>
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/sites/')({
  component: SitesPage,
});

function SitesPage() {
  const queryClient = useQueryClient();

  // ── Sidebar state ─────────────────────────────────────────────
  const [buildingSearch, setBuildingSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'region' | 'type'>('none');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isSiteNavOpen, setIsSiteNavOpen] = useState(true);

  // ── Selection state ───────────────────────────────────────────
  const [selectedOfficeSite, setSelectedOfficeSite] = useState<OfficeSite | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedDongIds, setSelectedDongIds] = useState<string[]>([]);
  const [selectedUnitTypeIds, setSelectedUnitTypeIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [unitSort, setUnitSort] = useState<SortingState>([]);
  const [unitViewMode, setUnitViewMode] = useState<'table' | 'layout'>('table');

  // ── Modal state ───────────────────────────────────────────────
  const [showAddSiteDialog, setShowAddSiteDialog] = useState(false);
  const [showAddDongDialog, setShowAddDongDialog] = useState(false);
  const [showAddUnitDialog, setShowAddUnitDialog] = useState(false);
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [newDongName, setNewDongName] = useState('');
  const [newUnit, setNewUnit] = useState({ name: '', area: '', dongId: '' });

  // ── Queries ───────────────────────────────────────────────────

  const { data: officeSites = [], isLoading: isLoadingList } = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  });

  const selectedSiteId = selectedOfficeSite?.siteId;

  const { data: siteDetail } = useQuery({
    queryKey: ['sites', selectedSiteId],
    queryFn: () => api.sites.findOne(selectedSiteId!),
    enabled: !!selectedSiteId,
  });

  const { data: searchResults } = useQuery({
    queryKey: ['office-sites-search', siteSearchQuery],
    queryFn: () => api.officeSites.searchCentral(siteSearchQuery),
    enabled: siteSearchQuery.length >= 2,
  });

  // ── Mutations ─────────────────────────────────────────────────

  const addSiteMutation = useMutation({
    mutationFn: (siteId: string) => api.officeSites.add({ siteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      setSiteSearchQuery('');
      setShowAddSiteDialog(false);
    },
  });

  const removeSiteMutation = useMutation({
    mutationFn: (id: string) => api.officeSites.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      if (selectedOfficeSite?.id === removeSiteMutation.variables) {
        setSelectedOfficeSite(null);
        setSelectedUnit(null);
      }
    },
  });

  const addDongMutation = useMutation({
    mutationFn: (dto: { siteId: string; name: string }) => api.dongs.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', selectedSiteId] });
      setNewDongName('');
      setShowAddDongDialog(false);
    },
  });

  const addUnitMutation = useMutation({
    mutationFn: (dto: { siteId: string; dongId: string; name: string; exclusiveAreaM2?: number }) =>
      api.units.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', selectedSiteId] });
      setNewUnit({ name: '', area: '', dongId: '' });
      setShowAddUnitDialog(false);
    },
  });

  // ── Derived data ──────────────────────────────────────────────

  const existingSiteIds = new Set(officeSites.map((os) => os.siteId));

  const filteredSites = useMemo(() => {
    if (!buildingSearch) return officeSites;
    const q = buildingSearch.toLowerCase();
    return officeSites.filter((os) => {
      const site = os.site;
      if (!site) return false;
      return (
        site.name.toLowerCase().includes(q) ||
        site.roadAddress?.toLowerCase().includes(q) ||
        site.jibunAddress?.toLowerCase().includes(q)
      );
    });
  }, [officeSites, buildingSearch]);

  const groupedSites = useMemo(() => {
    if (groupBy === 'none') return null;
    const groups: Record<string, OfficeSite[]> = {};
    for (const os of filteredSites) {
      const site = os.site;
      if (!site) continue;
      const key =
        groupBy === 'region'
          ? extractRegion(site.roadAddress || site.jibunAddress)
          : (siteTypeLabels[site.type] ?? site.type);
      if (!groups[key]) groups[key] = [];
      groups[key].push(os);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [filteredSites, groupBy]);

  const dongs: Dong[] = siteDetail?.dongs ?? [];
  const allUnits: Unit[] = siteDetail?.units ?? [];

  const getDongName = (dongId: string | null) =>
    dongs.find((d) => d.id === dongId)?.name ?? '';

  const dongOptions = useMemo<MultiSelectOption[]>(
    () =>
      dongs.map((dong) => ({
        value: dong.id,
        label: dong.name,
        helper: `${allUnits.filter((unit) => unit.dongId === dong.id).length}호`,
      })),
    [allUnits, dongs],
  );

  const unitTypeOptions = useMemo<MultiSelectOption[]>(() => {
    const typeMap = new Map<string, MultiSelectOption>();

    for (const unit of allUnits) {
      if (!unit.siteUnitTypeId || !unit.siteUnitType?.name) continue;
      if (!typeMap.has(unit.siteUnitTypeId)) {
        typeMap.set(unit.siteUnitTypeId, {
          value: unit.siteUnitTypeId,
          label: unit.siteUnitType.name,
          helper: `${allUnits.filter((item) => item.siteUnitTypeId === unit.siteUnitTypeId).length}호`,
        });
      }
    }

    return Array.from(typeMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'ko', { numeric: true }),
    );
  }, [allUnits]);

  const hasActiveUnitFilters =
    selectedDongIds.length > 0 ||
    selectedUnitTypeIds.length > 0 ||
    query.trim().length > 0;

  const filteredUnits = useMemo(() => {
    let units = allUnits;

    if (selectedDongIds.length > 0) {
      units = units.filter((unit) => !!unit.dongId && selectedDongIds.includes(unit.dongId));
    }

    if (selectedUnitTypeIds.length > 0) {
      units = units.filter(
        (unit) => !!unit.siteUnitTypeId && selectedUnitTypeIds.includes(unit.siteUnitTypeId),
      );
    }

    const q = query.trim().toLowerCase();
    if (q) {
      units = units.filter((unit) => {
        if (unit.name.toLowerCase().includes(q)) return true;
        const properties = unit.properties ?? [];
        for (const property of properties) {
          for (const pc of property.propertyContacts ?? []) {
            if (pc.contact.name.toLowerCase().includes(q)) return true;
            if (pc.contact.phone?.toLowerCase().includes(q)) return true;
          }
          for (const tenant of property.tenants ?? []) {
            if (tenant.contact.name.toLowerCase().includes(q)) return true;
            if (tenant.contact.phone?.toLowerCase().includes(q)) return true;
          }
          for (const consultation of property.consultations ?? []) {
            if (consultation.content.toLowerCase().includes(q)) return true;
            if (consultation.contact.name.toLowerCase().includes(q)) return true;
            if (consultation.contact.phone?.toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    const defaultSort = (a: Unit, b: Unit) => {
      const dongA = getDongName(a.dongId);
      const dongB = getDongName(b.dongId);
      if (dongA !== dongB) return dongA.localeCompare(dongB, 'ko', { numeric: true });
      return (a.floor ?? 0) - (b.floor ?? 0) || a.name.localeCompare(b.name, 'ko', { numeric: true });
    };

    const activeSort = unitSort[0];
    if (!activeSort) {
      return units.sort(defaultSort);
    }

    const getOwnerLabel = (unit: Unit) =>
      (unit.properties ?? [])
        .flatMap((property) => property.propertyContacts)
        .filter((propertyContact) => propertyContact.role === 'owner')
        .map((propertyContact) => propertyContact.contact.name)[0] ?? '';

    const getTenantLabel = (unit: Unit) =>
      (unit.properties ?? [])
        .flatMap((property) => property.tenants ?? [])
        .map((tenant) => tenant.contact.name)[0] ?? '';

    const getListingLabel = (unit: Unit) => {
      const primaryListing = (unit.properties ?? [])
        .flatMap((property) => property.listings ?? [])
        [0];
      if (!primaryListing) return '';
      return formatPriceLabel(
        primaryListing.transactionType,
        primaryListing.price,
        primaryListing.deposit,
        primaryListing.monthlyRent,
      );
    };

    const getConsultationDate = (unit: Unit) => {
      const latest = (unit.properties ?? [])
        .flatMap((property) => property.consultations ?? [])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      return latest ? new Date(latest.createdAt).getTime() : 0;
    };

    const getOwnerContact = (unit: Unit) =>
      (unit.properties ?? [])
        .flatMap((property) => property.propertyContacts)
        .filter((pc) => pc.role === 'owner')
        .map((pc) => pc.contact)[0];

    const comparators: Record<string, (a: Unit, b: Unit) => number> = {
      dong: (a, b) => getDongName(a.dongId).localeCompare(getDongName(b.dongId), 'ko', { numeric: true }),
      name: (a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }),
      supplyArea: (a, b) =>
        Number(a.supplyAreaM2 ?? a.siteUnitType?.supplyAreaM2 ?? 0) -
        Number(b.supplyAreaM2 ?? b.siteUnitType?.supplyAreaM2 ?? 0),
      exclusiveArea: (a, b) =>
        Number(a.exclusiveAreaM2 ?? a.siteUnitType?.exclusiveAreaM2 ?? 0) -
        Number(b.exclusiveAreaM2 ?? b.siteUnitType?.exclusiveAreaM2 ?? 0),
      unitType: (a, b) =>
        (a.siteUnitType?.name ?? '').localeCompare(b.siteUnitType?.name ?? '', 'ko', { numeric: true }),
      owner: (a, b) => getOwnerLabel(a).localeCompare(getOwnerLabel(b), 'ko', { numeric: true }),
      tenant: (a, b) => getTenantLabel(a).localeCompare(getTenantLabel(b), 'ko', { numeric: true }),
      listing: (a, b) => getListingLabel(a).localeCompare(getListingLabel(b), 'ko', { numeric: true }),
      lastConsultation: (a, b) => getConsultationDate(a) - getConsultationDate(b),
      lastConsultationDate: (a, b) => getConsultationDate(a) - getConsultationDate(b),
    };

    const comparator = comparators[activeSort.id];
    if (!comparator) {
      return units.sort(defaultSort);
    }

    const direction: 'asc' | 'desc' = activeSort.desc ? 'desc' : 'asc';
    return units.sort((a, b) => {
      const result = comparator(a, b);
      if (result !== 0) {
        return direction === 'asc' ? result : -result;
      }
      const fallback = defaultSort(a, b);
      return direction === 'asc' ? fallback : -fallback;
    });
  }, [allUnits, query, selectedDongIds, selectedUnitTypeIds, unitSort]);

  const layoutSections = useMemo<LayoutSection[]>(() => {
    const sectionMap = new Map<
      string,
      {
        key: string;
        label: string;
        positionedUnits: PositionedUnit[];
        unpositionedUnits: Unit[];
      }
    >();

    for (const unit of filteredUnits) {
      const sectionKey = dongs.length > 0 ? unit.dongId ?? '__no_dong__' : '__site__';
      const sectionLabel =
        dongs.length > 0 ? getDongName(unit.dongId) || '미지정 동' : '전체';

      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, {
          key: sectionKey,
          label: sectionLabel,
          positionedUnits: [],
          unpositionedUnits: [],
        });
      }

      const section = sectionMap.get(sectionKey)!;
      const placement = parseUnitPlacement(unit);

      if (placement.floor == null || placement.lineNo == null) {
        section.unpositionedUnits.push(unit);
        continue;
      }

      section.positionedUnits.push({
        unit,
        floor: placement.floor,
        lineNo: placement.lineNo,
      });
    }

    return Array.from(sectionMap.values())
      .sort((a, b) => a.label.localeCompare(b.label, 'ko', { numeric: true }))
      .map((section) => {
        const floors = Array.from(
          new Set(section.positionedUnits.map((item) => item.floor)),
        ).sort((a, b) => b - a);
        const lineNos = Array.from(
          new Set(section.positionedUnits.map((item) => item.lineNo)),
        ).sort((a, b) => a - b);
        const cellMap = new Map<string, PositionedUnit>();

        for (const item of section.positionedUnits) {
          cellMap.set(`${item.floor}:${item.lineNo}`, item);
        }

        return {
          key: section.key,
          label: section.label,
          floors,
          lineNos,
          cellMap,
          unpositionedUnits: section.unpositionedUnits.sort((a, b) =>
            a.name.localeCompare(b.name, 'ko', { numeric: true }),
          ),
        };
      });
  }, [dongs.length, filteredUnits, getDongName]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleSelectSite = (os: OfficeSite) => {
    setSelectedOfficeSite(os);
    setSelectedUnit(null);
    setSelectedDongIds([]);
    setSelectedUnitTypeIds([]);
    setQuery('');
    setUnitSort([]);
  };

  const handleSelectUnit = useCallback((unit: Unit) => {
    setSelectedUnit(unit);
  }, []);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleAddDong = () => {
    if (!newDongName.trim() || !selectedSiteId) return;
    addDongMutation.mutate({ siteId: selectedSiteId, name: newDongName.trim() });
  };

  const handleAddUnit = () => {
    if (!newUnit.name.trim() || !selectedSiteId) return;
    // 동이 미선택이면 placeholder Dong(단일 동 건물) 또는 첫 번째 Dong으로 자동 할당
    const fallbackDongId =
      dongs.find((d) => d.isPlaceholder)?.id ?? dongs[0]?.id;
    const dongId = newUnit.dongId || fallbackDongId;
    if (!dongId) return; // Site에 Dong이 하나도 없으면 생성 불가
    addUnitMutation.mutate({
      siteId: selectedSiteId,
      dongId,
      name: newUnit.name.trim(),
      exclusiveAreaM2: newUnit.area ? Number(newUnit.area) : undefined,
    });
  };

  const resetUnitFilters = () => {
    setSelectedDongIds([]);
    setSelectedUnitTypeIds([]);
    setQuery('');
  };

  // ── Render helpers ────────────────────────────────────────────

  const unitColumns: ColumnDef<Unit>[] = useMemo(() => [
    ...(dongs.length > 0
      ? [{
          id: 'dong',
          header: '동',
          size: 80,
          enableSorting: true,
          cell: ({ row }) => (
            <span className="text-[13px]">{getDongName(row.original.dongId) || '-'}</span>
          ),
        } satisfies ColumnDef<Unit>]
      : []),
    {
      id: 'name',
      header: '호수',
      size: 90,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-[13px] font-medium tabular-nums">{row.original.name}</span>
      ),
    },
    {
      id: 'supplyArea',
      header: '공급',
      size: 80,
      enableSorting: true,
      cell: ({ row }) => {
        const unit = row.original;
        const m2 = unit.supplyAreaM2 ?? unit.siteUnitType?.supplyAreaM2;
        if (!m2) return <span className="text-[13px] text-muted-foreground">-</span>;
        return <span className="text-[13px] tabular-nums">{formatAreaPyeong(m2)}</span>;
      },
    },
    {
      id: 'exclusiveArea',
      header: '전용',
      size: 80,
      enableSorting: true,
      cell: ({ row }) => {
        const unit = row.original;
        const m2 = unit.exclusiveAreaM2 ?? unit.siteUnitType?.exclusiveAreaM2;
        if (!m2) return <span className="text-[13px] text-muted-foreground">-</span>;
        return <span className="text-[13px] tabular-nums">{formatAreaPyeong(m2)}</span>;
      },
    },
    {
      id: 'unitType',
      header: '타입',
      size: 70,
      enableSorting: true,
      cell: ({ row }) => {
        const typeName = row.original.siteUnitType?.name;
        return typeName
          ? <span className="text-[13px]">{typeName}</span>
          : <span className="text-[13px] text-muted-foreground">-</span>;
      },
    },
    {
      id: 'owner',
      header: '소유자',
      size: 200,
      enableSorting: true,
      cell: ({ row }) => {
        const contact = (row.original.properties ?? [])
          .flatMap((property) => property.propertyContacts)
          .filter((pc) => pc.role === 'owner')
          .map((pc) => pc.contact)[0];
        if (!contact) return <span className="text-[13px] text-muted-foreground">-</span>;
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px]">{contact.name}</span>
            {contact.phone && (
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{contact.phone}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'tenant',
      header: '세입자',
      size: 170,
      enableSorting: true,
      cell: ({ row }) => {
        const tenants = (row.original.properties ?? []).flatMap((property) => property.tenants ?? []);
        if (!tenants.length) return <span className="text-[13px] text-muted-foreground">-</span>;

        const primary = tenants[0];
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px]">{primary.contact.name}</span>
            {primary.contact.phone && (
              <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{primary.contact.phone}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'listing',
      header: '등록 매물',
      size: 160,
      enableSorting: true,
      cell: ({ row }) => {
        const listings = (row.original.properties ?? []).flatMap((property) => property.listings ?? []);
        if (!listings.length) return <span className="text-[13px] text-muted-foreground">-</span>;

        const primary = listings[0];
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
              {transactionTypeLabels[primary.transactionType] ?? primary.transactionType}
            </Badge>
            <span className="truncate text-[13px]">
              {formatPriceLabel(
                primary.transactionType,
                primary.price,
                primary.deposit,
                primary.monthlyRent,
              )}
            </span>
            {listings.length > 1 && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">
                +{listings.length - 1}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'lastConsultation',
      header: '최근 상담',
      size: 260,
      enableSorting: true,
      cell: ({ row }) => {
        const latest = (row.original.properties ?? [])
          .flatMap((property) => property.consultations ?? [])
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (!latest) return <span className="text-[13px] text-muted-foreground">-</span>;
        return <span className="truncate text-[13px]">{latest.content}</span>;
      },
    },
    {
      id: 'lastConsultationDate',
      header: '상담일',
      size: 96,
      enableSorting: true,
      cell: ({ row }) => {
        const latest = (row.original.properties ?? [])
          .flatMap((property) => property.consultations ?? [])
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (!latest) return <span className="text-[13px] text-muted-foreground">-</span>;
        return (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {formatShortDate(latest.createdAt)}
          </span>
        );
      },
    },
  ], [dongs, handleSelectUnit]);

  const unitPinnedColumns = useMemo(
    () => (dongs.length > 0 ? ['dong', 'name'] : ['name']),
    [dongs.length],
  );

  const renderSiteItem = (os: OfficeSite) => {
    const site = os.site;
    if (!site) return null;
    const isActive = selectedOfficeSite?.id === os.id;
    return (
      <div
        key={os.id}
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors',
          'hover:bg-accent',
          isActive && 'bg-accent font-medium',
        )}
        onClick={() => handleSelectSite(os)}
      >
        <div className="flex-1 min-w-0">
          <div className="truncate text-[13px]">{site.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {site.roadAddress || site.jibunAddress || '-'}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 font-normal">
          {siteTypeShort[site.type] ?? site.type}
        </Badge>
      </div>
    );
  };

  const selectedUnitProperties = selectedUnit?.properties ?? [];
  const selectedUnitListings = selectedUnitProperties.flatMap((property) => property.listings ?? []);
  const selectedUnitOwners = selectedUnitProperties
    .flatMap((property) => property.propertyContacts)
    .filter((propertyContact) => propertyContact.role === 'owner')
    .map((propertyContact) => propertyContact.contact);
  const selectedUnitTenants = selectedUnitProperties.flatMap((property) => property.tenants ?? []);
  const selectedUnitConsultations = selectedUnitProperties
    .flatMap((property) => property.consultations ?? [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const siteNavToggleLabel = isSiteNavOpen ? '건물명 리스트 접기' : '건물명 리스트 펼치기';

  // ── JSX ───────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-1 min-h-0 -m-4">
      {/* ─── Sidebar (단지 Nav) ──────────────────────────────── */}
      <div
        className={cn(
          'relative shrink-0 overflow-visible transition-[width] duration-200 ease-linear',
          isSiteNavOpen ? 'w-64' : 'w-0',
        )}
      >
        <aside
          className={cn(
            'absolute inset-y-0 left-0 z-10 flex w-64 flex-col bg-background transition-[transform,opacity] duration-200 ease-linear',
            isSiteNavOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none',
          )}
        >
          {/* Search + group */}
          <div className="border-b border-border/40 p-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="건물명, 주소 검색..."
                value={buildingSearch}
                onChange={(e) => setBuildingSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="flex gap-1">
              {([
                { key: 'none', label: '전체', Icon: LayoutList },
                { key: 'region', label: '지역', Icon: MapPin },
                { key: 'type', label: '유형', Icon: FolderTree },
              ] as const).map(({ key, label, Icon }) => (
                <Button
                  key={key}
                  variant={groupBy === key ? 'secondary' : 'ghost'}
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => {
                    setGroupBy(key);
                    if (key !== 'none' && groupedSites) {
                      setExpandedGroups(new Set(groupedSites.map(([k]) => k)));
                    }
                  }}
                >
                  <Icon className="size-3 mr-1" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Site list */}
          <ScrollArea className="flex-1">
            {isLoadingList ? (
              <div className="p-2 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2">
                    <Skeleton className="size-4 rounded" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            ) : groupBy === 'none' ? (
              <div className="p-1.5 space-y-0.5">
                {filteredSites.length === 0 ? (
                  <div className="py-8 text-xs text-muted-foreground text-center">
                    {buildingSearch ? '검색 결과가 없습니다' : '관리 단지가 없습니다'}
                  </div>
                ) : (
                  filteredSites.map(renderSiteItem)
                )}
              </div>
            ) : (
              <div className="p-1.5 space-y-0.5">
                {groupedSites?.map(([groupKey, items]) => (
                  <div key={groupKey}>
                    <div
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-xs font-medium text-muted-foreground"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      {expandedGroups.has(groupKey) ? (
                        <ChevronDown className="size-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3 text-muted-foreground" />
                      )}
                      <span className="flex-1 uppercase tracking-wide">{groupKey}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                        {items.length}
                      </Badge>
                    </div>
                    {expandedGroups.has(groupKey) && (
                      <div className="ml-2 space-y-0.5">{items.map(renderSiteItem)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Add site button */}
          <div className="p-2 border-t border-border/40">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs border border-border/40"
              onClick={() => setShowAddSiteDialog(true)}
            >
              <Plus className="size-3.5 mr-1" />
              단지 추가
            </Button>
          </div>
        </aside>
      </div>
      {isSiteNavOpen && (
        <Separator orientation="vertical" className="bg-border/80" />
      )}

      {/* ─── Main area (list + sheet) ────────────────────────── */}
      {selectedOfficeSite && siteDetail ? (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 p-4 overflow-hidden">
          {/* ViewBar-style panel + Grid */}
          <div className="rounded-xl border border-border/60 bg-background flex-1 flex flex-col min-h-0">
            {/* Filter bar (ViewBar pattern) */}
            <div className="border-b border-border/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setIsSiteNavOpen((prev) => !prev)}
                  aria-label={siteNavToggleLabel}
                >
                  <PanelLeftIcon className="size-4" />
                </Button>
                <Separator orientation="vertical" className="h-4" />

                {/* 동 / 타입 필터 */}
                {dongOptions.length > 0 && (
                  <MultiFilterDropdown
                    label="동"
                    options={dongOptions}
                    values={selectedDongIds}
                    onChange={setSelectedDongIds}
                  />
                )}
                {unitTypeOptions.length > 0 && (
                  <MultiFilterDropdown
                    label="타입"
                    options={unitTypeOptions}
                    values={selectedUnitTypeIds}
                    onChange={setSelectedUnitTypeIds}
                  />
                )}

                <Separator orientation="vertical" className="mx-1 h-4" />

                {/* 통합 검색창 */}
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="호수 · 이름 · 전화 · 상담내용 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-8 border-0 bg-transparent pl-7 pr-7 text-xs shadow-none focus-visible:ring-0"
                  />
                  {query && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setQuery('')}
                      aria-label="검색어 지우기"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                {hasActiveUnitFilters && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={resetUnitFilters}
                  >
                    <X className="size-3" />
                    초기화
                  </Button>
                )}

                <div className="ml-auto flex items-center rounded-md border border-border/60 bg-background p-0.5">
                  <Button
                    variant={unitViewMode === 'table' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => setUnitViewMode('table')}
                  >
                    <LayoutList className="size-3.5" />
                    테이블
                  </Button>
                  <Button
                    variant={unitViewMode === 'layout' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => setUnitViewMode('layout')}
                  >
                    <LayoutGrid className="size-3.5" />
                    배치표
                  </Button>
                </div>
              </div>
            </div>

            {/* Units View */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {unitViewMode === 'table' ? (
                <DataTable
                  columns={unitColumns}
                  data={filteredUnits}
                  sorting={unitSort}
                  onSortingChange={setUnitSort}
                  onRowClick={handleSelectUnit}
                  layout="full-height"
                  rowHeight={36}
                  pinnedColumns={unitPinnedColumns}
                  enableRowSelection
                  emptyMessage={hasActiveUnitFilters ? '검색 결과가 없습니다' : '등록된 호수가 없습니다'}
                  renderStatusBar={({ focusedRow, totalCount }) => {
                    if (!focusedRow) {
                      return (
                        <span className="tabular-nums">
                          총 {totalCount.toLocaleString()}개 호수
                        </span>
                      );
                    }
                    const dongName = getDongName(focusedRow.dongId);
                    const owner = (focusedRow.properties ?? [])
                      .flatMap((property) => property.propertyContacts)
                      .filter((pc) => pc.role === 'owner')
                      .map((pc) => pc.contact)[0];
                    return (
                      <>
                        <span className="tabular-nums text-foreground/80">
                          {totalCount.toLocaleString()}개 호수
                        </span>
                        <span className="text-border">|</span>
                        <span className="font-medium text-foreground">
                          {selectedOfficeSite?.site?.name} {dongName} {focusedRow.name}호
                        </span>
                        {owner && (
                          <>
                            <span className="text-border">|</span>
                            <span>소유자: {owner.name}</span>
                            {owner.phone && (
                              <span className="tabular-nums text-foreground/70">{owner.phone}</span>
                            )}
                          </>
                        )}
                      </>
                    );
                  }}
                />
              ) : (
                <UnitLayoutBoard
                  sections={layoutSections}
                  selectedUnitId={selectedUnit?.id}
                  onUnitOpen={handleSelectUnit}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── No site selected ──────────────────────────────────── */
        <div className="flex-1 flex flex-col min-w-0 p-4">
          <div className="flex items-center gap-2 pb-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setIsSiteNavOpen((prev) => !prev)}
              aria-label={siteNavToggleLabel}
            >
              <PanelLeftIcon className="size-4" />
            </Button>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs text-muted-foreground">관리 단지 패널</span>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Building2 className="size-14 mx-auto mb-3 opacity-20" />
              <h3 className="text-sm font-medium mb-1">단지를 선택하세요</h3>
              <p className="text-xs">왼쪽에서 관리 단지를 선택하면 호수 목록이 표시됩니다</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Unit Detail Dialog ──────────────────────────────── */}
      <Dialog open={!!selectedUnit} onOpenChange={(open) => { if (!open) setSelectedUnit(null); }}>
        <DialogContent className="max-h-[85vh] overflow-hidden p-0 gap-0 sm:max-w-5xl">
          {selectedUnit && siteDetail && (
            <>
              <DialogHeader className="border-b px-6 py-5 text-left">
                <div className="flex items-center gap-2">
                  <Home className="size-4 text-muted-foreground" />
                  <DialogTitle className="text-base">
                    {getDongName(selectedUnit.dongId)} {selectedUnit.name}
                  </DialogTitle>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {siteTypeLabels[siteDetail.type] ?? siteDetail.type}
                  </Badge>
                </div>
                <DialogDescription className="flex items-center gap-1 text-xs">
                  <MapPin className="size-3" />
                  {siteDetail.name} · {siteDetail.roadAddress || siteDetail.jibunAddress || '-'}
                </DialogDescription>
              </DialogHeader>

              <div className="border-b px-6 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                    <Link to="/properties/new">
                      <FileText className="mr-1.5 size-3.5" />
                      매물 등록
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>수정</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">삭제</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{selectedUnitListings.length}개 매물</span>
                    <span>·</span>
                    <span>{selectedUnitConsultations.length}건 상담</span>
                  </div>
                </div>
              </div>

              <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
                <div className="border-b px-6 py-2">
                  <TabsList variant="line" className="h-8">
                    <TabsTrigger value="overview" className="px-3 text-xs">개요</TabsTrigger>
                    <TabsTrigger value="people" className="px-3 text-xs">소유자/세입자</TabsTrigger>
                    <TabsTrigger value="consultations" className="px-3 text-xs">상담</TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1">
                  <TabsContent value="overview" className="p-6">
                    <div className="space-y-6">
                      <section>
                        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          기본 정보
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Building2 className="size-3" />
                              단지
                            </div>
                            <div className="text-sm font-medium">{siteDetail.name}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Ruler className="size-3" />
                              전용면적
                            </div>
                            <div className="text-sm font-medium">
                              {selectedUnit.exclusiveAreaM2
                                ? `${Number(selectedUnit.exclusiveAreaM2)}m² (${formatAreaPyeong(selectedUnit.exclusiveAreaM2)})`
                                : '-'}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Layers className="size-3" />
                              층
                            </div>
                            <div className="text-sm font-medium">
                              {selectedUnit.floor != null ? `${selectedUnit.floor}층` : '-'}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin className="size-3" />
                              주소
                            </div>
                            <div className="truncate text-sm font-medium">
                              {siteDetail.roadAddress || siteDetail.jibunAddress || '-'}
                            </div>
                          </div>
                        </div>
                      </section>

                      <Separator />

                      <section>
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            등록 매물
                          </h3>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {selectedUnitListings.length}건
                          </Badge>
                        </div>
                        {selectedUnitListings.length > 0 ? (
                          <div className="grid gap-3 lg:grid-cols-2">
                            {selectedUnitListings.map((listing) => (
                              <div key={listing.id} className="rounded-lg border p-4">
                                <div className="mb-2 flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    {transactionTypeLabels[listing.transactionType] ?? listing.transactionType}
                                  </Badge>
                                  <span className="text-sm font-medium">
                                    {formatPriceLabel(
                                      listing.transactionType,
                                      listing.price,
                                      listing.deposit,
                                      listing.monthlyRent,
                                    )}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  상태: {listing.checkStatus}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed p-6 text-center">
                            <FileText className="mx-auto mb-2 size-6 text-muted-foreground/30" />
                            <p className="text-xs text-muted-foreground">
                              아직 등록된 매물이 없습니다
                            </p>
                          </div>
                        )}
                      </section>
                    </div>
                  </TabsContent>

                  <TabsContent value="people" className="p-6">
                    <div className="grid gap-6 lg:grid-cols-2">
                      <section>
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            <User className="size-3" />
                            소유자
                          </h3>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {selectedUnitOwners.length}
                          </Badge>
                        </div>
                        {selectedUnitOwners.length > 0 ? (
                          <div className="space-y-2">
                            {selectedUnitOwners.map((owner, index) => (
                              <div key={`${owner.id}-${index}`} className="rounded-lg border p-3">
                                <div className="text-sm font-medium">{owner.name}</div>
                                <div className="text-xs text-muted-foreground">{owner.phone || '전화번호 없음'}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed p-6 text-center">
                            <User className="mx-auto mb-2 size-6 text-muted-foreground/30" />
                            <p className="text-xs text-muted-foreground">연결된 소유자가 없습니다</p>
                          </div>
                        )}
                      </section>

                      <section>
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            <Home className="size-3" />
                            세입자
                          </h3>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {selectedUnitTenants.length}
                          </Badge>
                        </div>
                        {selectedUnitTenants.length > 0 ? (
                          <div className="space-y-2">
                            {selectedUnitTenants.map((tenant) => (
                              <div key={tenant.id} className="rounded-lg border p-3">
                                <div className="text-sm font-medium">{tenant.contact.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {tenant.contact.phone || '전화번호 없음'}
                                </div>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  보증금 {tenant.deposit?.toLocaleString() ?? '-'}만 / 월세 {tenant.monthlyRent?.toLocaleString() ?? '-'}만
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed p-6 text-center">
                            <Home className="mx-auto mb-2 size-6 text-muted-foreground/30" />
                            <p className="text-xs text-muted-foreground">연결된 세입자가 없습니다</p>
                          </div>
                        )}
                      </section>
                    </div>
                  </TabsContent>

                  <TabsContent value="consultations" className="p-6">
                    <section>
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          <Calendar className="size-3" />
                          상담 기록
                        </h3>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {selectedUnitConsultations.length}
                        </Badge>
                      </div>
                      {selectedUnitConsultations.length > 0 ? (
                        <div className="space-y-2">
                          {selectedUnitConsultations.map((consultation) => (
                            <div key={consultation.id} className="rounded-lg border p-4">
                              <div className="mb-1 flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] font-normal">
                                  {consultation.type}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">
                                  {formatShortDate(consultation.createdAt)}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {consultation.contact.name}
                                </span>
                              </div>
                              <p className="text-sm">{consultation.content}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center">
                          <Calendar className="mx-auto mb-2 size-6 text-muted-foreground/30" />
                          <p className="text-xs text-muted-foreground">상담 기록이 없습니다</p>
                        </div>
                      )}
                    </section>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Add Site Dialog ─────────────────────────────────── */}
      <Dialog open={showAddSiteDialog} onOpenChange={setShowAddSiteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>관리 단지 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="단지명 검색 (2글자 이상)..."
                value={siteSearchQuery}
                onChange={(e) => setSiteSearchQuery(e.target.value)}
                autoFocus
                className="pl-8"
              />
            </div>
            {searchResults && searchResults.length > 0 && (
              <ScrollArea className="max-h-60">
                <div className="space-y-0.5">
                  {searchResults.map((site) => (
                    <div
                      key={site.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-accent transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{site.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {site.roadAddress || site.jibunAddress || '-'}
                        </p>
                      </div>
                      {existingSiteIds.has(site.id) ? (
                        <Badge variant="secondary" className="text-[10px] shrink-0">추가됨</Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 text-xs shrink-0 ml-2"
                          onClick={() => addSiteMutation.mutate(site.id)}
                          disabled={addSiteMutation.isPending}
                        >
                          추가
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            {siteSearchQuery.length >= 2 && searchResults?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                검색 결과가 없습니다
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Add Dong Dialog ─────────────────────────────────── */}
      <Dialog open={showAddDongDialog} onOpenChange={setShowAddDongDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>동 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">동 이름</Label>
              <Input
                placeholder="예: 101동"
                value={newDongName}
                onChange={(e) => setNewDongName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAddDong()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddDongDialog(false)}>
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleAddDong}
              disabled={!newDongName.trim() || addDongMutation.isPending}
            >
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Unit Dialog ─────────────────────────────────── */}
      <Dialog open={showAddUnitDialog} onOpenChange={setShowAddUnitDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>호수 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {dongs.length > 0 && (
              <div>
                <Label className="text-sm">동</Label>
                <Select value={newUnit.dongId} onValueChange={(v) => setNewUnit({ ...newUnit, dongId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="동 선택 (선택)" />
                  </SelectTrigger>
                  <SelectContent>
                    {dongs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-sm">호수</Label>
              <Input
                placeholder="예: 301호"
                value={newUnit.name}
                onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm">전용면적 (m²)</Label>
              <Input
                type="number"
                placeholder="예: 84.97"
                value={newUnit.area}
                onChange={(e) => setNewUnit({ ...newUnit, area: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUnit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddUnitDialog(false)}>
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleAddUnit}
              disabled={!newUnit.name.trim() || addUnitMutation.isPending}
            >
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
