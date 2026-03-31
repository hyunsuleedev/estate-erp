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
  ArrowUpRight,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Dong, Unit, OfficeSite } from '@estate-erp/api-client';
import {
  EstateGrid,
  type EstateGridColumn,
  type EstateGridSortState,
} from '@/components/estate-grid';
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

function MultiSelectFilter({
  label,
  placeholder,
  options,
  values,
  onChange,
  emptyLabel = '선택 가능한 항목이 없습니다',
}: {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState('');

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabels = useMemo(
    () =>
      options
        .filter((option) => values.includes(option.value))
        .map((option) => option.label),
    [options, values],
  );

  const toggleValue = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    onChange([...values, value]);
  };

  const triggerLabel =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(', ')
        : `${label} ${selectedLabels.length}개`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={values.length > 0 ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 justify-start gap-2 px-2 text-xs"
        >
          <span className="truncate">{triggerLabel}</span>
          {values.length > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-background text-[10px] text-foreground">
              {values.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuLabel className="flex items-center justify-between text-xs font-normal text-muted-foreground">
          <span>{label} 선택</span>
          {values.length > 0 && (
            <button
              type="button"
              className="text-[11px] hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange([]);
              }}
            >
              초기화
            </button>
          )}
        </DropdownMenuLabel>
        <div className="px-1 pb-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder={`${label} 검색...`}
            className="h-8 text-xs"
          />
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={values.includes(option.value)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => toggleValue(option.value)}
                className="gap-2 text-xs"
              >
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="truncate">{option.label}</span>
                  {option.helper && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {option.helper}
                    </span>
                  )}
                </div>
              </DropdownMenuCheckboxItem>
            ))
          ) : (
            <div className="px-2 py-3 text-xs text-muted-foreground">{emptyLabel}</div>
          )}
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
  const [unitSearch, setUnitSearch] = useState('');
  const [consultationSearch, setConsultationSearch] = useState('');
  const [unitSort, setUnitSort] = useState<EstateGridSortState | null>(null);

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
    mutationFn: (dto: { siteId: string; dongId?: string; name: string; exclusiveAreaM2?: number }) =>
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
    unitSearch.trim().length > 0 ||
    consultationSearch.trim().length > 0;

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

    if (unitSearch) {
      const q = unitSearch.toLowerCase();
      units = units.filter((unit) => unit.name.toLowerCase().includes(q));
    }

    if (consultationSearch) {
      const q = consultationSearch.toLowerCase();
      units = units.filter((unit) =>
        (unit.properties ?? []).some((property) =>
          (property.consultations ?? []).some((consultation) => {
            const phone = consultation.contact.phone?.toLowerCase() ?? '';
            return (
              consultation.content.toLowerCase().includes(q) ||
              consultation.contact.name.toLowerCase().includes(q) ||
              phone.includes(q)
            );
          }),
        ),
      );
    }

    const defaultSort = (a: Unit, b: Unit) => {
      const dongA = getDongName(a.dongId);
      const dongB = getDongName(b.dongId);
      if (dongA !== dongB) return dongA.localeCompare(dongB, 'ko', { numeric: true });
      return (a.floor ?? 0) - (b.floor ?? 0) || a.name.localeCompare(b.name, 'ko', { numeric: true });
    };

    if (!unitSort) {
      return units.sort(defaultSort);
    }

    const getOwnerLabel = (unit: Unit) =>
      (unit.properties ?? [])
        .flatMap((property) => property.propertyContacts)
        .filter((propertyContact) => propertyContact.role === 'owner')
        .map((propertyContact) => propertyContact.contact.name)[0] ?? '';

    const getTenantLabel = (unit: Unit) =>
      (unit.properties ?? []).flatMap((property) => property.tenants ?? []).map((tenant) => tenant.contact.name)[0] ?? '';

    const getListingLabel = (unit: Unit) => {
      const primary = unit.properties?.[0];
      if (!primary) return '';
      return formatPriceLabel(
        primary.transactionType,
        primary.price,
        primary.deposit,
        primary.monthlyRent,
      );
    };

    const getConsultationDate = (unit: Unit) => {
      const latest = (unit.properties ?? [])
        .flatMap((property) => property.consultations ?? [])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      return latest ? new Date(latest.createdAt).getTime() : 0;
    };

    const comparators: Record<string, (a: Unit, b: Unit) => number> = {
      dong: (a, b) => getDongName(a.dongId).localeCompare(getDongName(b.dongId), 'ko', { numeric: true }),
      name: (a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }),
      area: (a, b) =>
        (a.exclusiveAreaM2 ?? a.siteUnitType?.exclusiveAreaM2 ?? 0) -
        (b.exclusiveAreaM2 ?? b.siteUnitType?.exclusiveAreaM2 ?? 0),
      unitType: (a, b) =>
        (a.siteUnitType?.name ?? '').localeCompare(b.siteUnitType?.name ?? '', 'ko', { numeric: true }),
      owner: (a, b) => getOwnerLabel(a).localeCompare(getOwnerLabel(b), 'ko', { numeric: true }),
      tenant: (a, b) => getTenantLabel(a).localeCompare(getTenantLabel(b), 'ko', { numeric: true }),
      listing: (a, b) => getListingLabel(a).localeCompare(getListingLabel(b), 'ko', { numeric: true }),
      lastConsultation: (a, b) => getConsultationDate(a) - getConsultationDate(b),
    };

    const comparator = comparators[unitSort.columnId];
    if (!comparator) {
      return units.sort(defaultSort);
    }

    return units.sort((a, b) => {
      const result = comparator(a, b);
      if (result !== 0) {
        return unitSort.direction === 'asc' ? result : -result;
      }
      const fallback = defaultSort(a, b);
      return unitSort.direction === 'asc' ? fallback : -fallback;
    });
  }, [allUnits, consultationSearch, selectedDongIds, selectedUnitTypeIds, unitSearch, unitSort]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleSelectSite = (os: OfficeSite) => {
    setSelectedOfficeSite(os);
    setSelectedUnit(null);
    setSelectedDongIds([]);
    setSelectedUnitTypeIds([]);
    setUnitSearch('');
    setConsultationSearch('');
    setUnitSort(null);
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
    addUnitMutation.mutate({
      siteId: selectedSiteId,
      dongId: newUnit.dongId || undefined,
      name: newUnit.name.trim(),
      exclusiveAreaM2: newUnit.area ? Number(newUnit.area) : undefined,
    });
  };

  const resetUnitFilters = () => {
    setSelectedDongIds([]);
    setSelectedUnitTypeIds([]);
    setUnitSearch('');
    setConsultationSearch('');
  };

  // ── Render helpers ────────────────────────────────────────────

  const unitColumns: EstateGridColumn<Unit>[] = useMemo(() => [
    {
      id: 'open',
      header: '',
      width: 52,
      pinned: 'left',
      align: 'center',
      renderCell: (unit) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={(event) => {
            event.stopPropagation();
            handleSelectUnit(unit);
          }}
        >
          <ArrowUpRight className="size-3.5" />
        </Button>
      ),
    },
    ...(dongs.length > 0
      ? [{
          id: 'dong',
          header: '동',
          width: 90,
      pinned: 'left' as const,
      sortable: true,
      renderCell: (unit: Unit) => (
        <span className="text-[13px]">{getDongName(unit.dongId) || '-'}</span>
      ),
        }]
      : []),
    {
      id: 'name',
      header: '호수',
      width: 110,
      pinned: 'left',
      sortable: true,
      renderCell: (unit) => (
        <span className="text-[13px] font-medium">{unit.name}</span>
      ),
    },
    {
      id: 'area',
      header: '전용면적',
      width: 170,
      sortable: true,
      renderCell: (unit) => {
        const m2 = unit.exclusiveAreaM2 ?? unit.siteUnitType?.exclusiveAreaM2;
        if (!m2) return <span className="text-muted-foreground">-</span>;
        return (
          <span className="text-[13px] tabular-nums">
            {formatAreaPyeong(m2)}
            <span className="ml-1 text-[11px] text-muted-foreground">
              ({Number(m2)}m²)
            </span>
          </span>
        );
      },
    },
    {
      id: 'unitType',
      header: '타입',
      width: 90,
      sortable: true,
      renderCell: (unit) => {
        const typeName = unit.siteUnitType?.name;
        return typeName
          ? <span className="text-[13px]">{typeName}</span>
          : <span className="text-muted-foreground">-</span>;
      },
    },
    {
      id: 'owner',
      header: '소유자',
      width: 190,
      sortable: true,
      renderCell: (unit) => {
        const owners = (unit.properties ?? [])
          .flatMap((property) => property.propertyContacts)
          .filter((propertyContact) => propertyContact.role === 'owner')
          .map((propertyContact) => propertyContact.contact);

        if (!owners.length) return <span className="text-[12px] text-muted-foreground">-</span>;

        const primary = owners[0];
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px]">{primary.name}</span>
            {primary.phone && (
              <span className="shrink-0 text-[11px] text-muted-foreground">{primary.phone}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'tenant',
      header: '세입자',
      width: 190,
      sortable: true,
      renderCell: (unit) => {
        const tenants = (unit.properties ?? []).flatMap((property) => property.tenants ?? []);
        if (!tenants.length) return <span className="text-[12px] text-muted-foreground">-</span>;

        const primary = tenants[0];
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px]">{primary.contact.name}</span>
            {primary.contact.phone && (
              <span className="shrink-0 text-[11px] text-muted-foreground">{primary.contact.phone}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'listing',
      header: '등록 매물',
      width: 170,
      sortable: true,
      renderCell: (unit) => {
        const properties = unit.properties ?? [];
        if (!properties.length) return <span className="text-[12px] text-muted-foreground">-</span>;

        const primary = properties[0];
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
              {transactionTypeLabels[primary.transactionType] ?? primary.transactionType}
            </Badge>
            <span className="truncate text-[12px]">
              {formatPriceLabel(
                primary.transactionType,
                primary.price,
                primary.deposit,
                primary.monthlyRent,
              )}
            </span>
          </div>
        );
      },
    },
    {
      id: 'lastConsultation',
      header: '최근 상담',
      width: 260,
      sortable: true,
      renderCell: (unit) => {
        const consultations = (unit.properties ?? [])
          .flatMap((property) => property.consultations ?? [])
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (!consultations.length) return <span className="text-[12px] text-muted-foreground">-</span>;

        const latest = consultations[0];
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatShortDate(latest.createdAt)}
            </span>
            <span className="truncate text-[12px]">{latest.content}</span>
          </div>
        );
      },
    },
  ], [dongs, handleSelectUnit]);

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
    <div className="relative flex flex-1 min-h-0 -mx-4 -mb-4">
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
        <div className="flex-1 flex flex-col min-w-0 p-4 overflow-auto">
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
                {dongs.length > 0 && (
                  <MultiSelectFilter
                    label="동"
                    placeholder="전체 동"
                    options={dongOptions}
                    values={selectedDongIds}
                    onChange={setSelectedDongIds}
                  />
                )}
                {unitTypeOptions.length > 0 && (
                  <MultiSelectFilter
                    label="타입"
                    placeholder="전체 타입"
                    options={unitTypeOptions}
                    values={selectedUnitTypeIds}
                    onChange={setSelectedUnitTypeIds}
                  />
                )}
                <Separator orientation="vertical" className="mx-1 h-4" />
                <div className="relative min-w-52 flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="호수 검색..."
                    value={unitSearch}
                    onChange={(e) => setUnitSearch(e.target.value)}
                    className="h-8 border-0 bg-transparent pl-7 text-xs shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="relative min-w-52 flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="상담내역 검색..."
                    value={consultationSearch}
                    onChange={(e) => setConsultationSearch(e.target.value)}
                    className="h-8 border-0 bg-transparent pl-7 text-xs shadow-none focus-visible:ring-0"
                  />
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
              </div>

              {hasActiveUnitFilters && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {selectedDongIds.map((dongId) => (
                    <Badge key={dongId} variant="secondary" className="text-[10px] font-normal">
                      동 · {getDongName(dongId)}
                    </Badge>
                  ))}
                  {selectedUnitTypeIds.map((typeId) => {
                    const label = unitTypeOptions.find((option) => option.value === typeId)?.label ?? typeId;
                    return (
                      <Badge key={typeId} variant="secondary" className="text-[10px] font-normal">
                        타입 · {label}
                      </Badge>
                    );
                  })}
                  {unitSearch && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      호수 검색 · {unitSearch}
                    </Badge>
                  )}
                  {consultationSearch && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      상담 검색 · {consultationSearch}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* EstateGrid */}
            <div className="flex-1 overflow-auto">
              <EstateGrid
                columns={unitColumns}
                rows={filteredUnits}
                sort={unitSort}
                onSortChange={setUnitSort}
                onRowOpen={handleSelectUnit}
                emptyMessage={unitSearch ? '검색 결과가 없습니다' : '등록된 호수가 없습니다'}
              />
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
                    <span>{selectedUnitProperties.length}개 매물</span>
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
                            {selectedUnitProperties.length}건
                          </Badge>
                        </div>
                        {selectedUnitProperties.length > 0 ? (
                          <div className="grid gap-3 lg:grid-cols-2">
                            {selectedUnitProperties.map((property) => (
                              <div key={property.id} className="rounded-lg border p-4">
                                <div className="mb-2 flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    {transactionTypeLabels[property.transactionType] ?? property.transactionType}
                                  </Badge>
                                  <span className="text-sm font-medium">
                                    {formatPriceLabel(
                                      property.transactionType,
                                      property.price,
                                      property.deposit,
                                      property.monthlyRent,
                                    )}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  상태: {property.checkStatus}
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
