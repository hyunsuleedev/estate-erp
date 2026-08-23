import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Hash,
  Map as MapIcon,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  RotateCcw,
  Ruler,
  Star,
  Tag,
  Trash2,
  Type,
  User,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  Dong,
  Unit,
  OfficeSite,
  UnitPropertyContact,
} from '@estate-erp/api-client';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog, EmptyState } from '@/components/domain';
import { cn } from '@/lib/utils';
import { formatDate, formatPhone, formatPyeong } from '@/lib/format';
import {
  extractRegionFromSite,
  filterOfficeSites,
  filterUnitsByRecordPresence,
  formatListingPrice,
  getInitialDongScope,
  getSiteGroupKeys,
  groupOfficeSites,
  isDefaultDongScope,
  parseUnitPlacement,
  prioritizeFavoriteOfficeSites,
  siteTypeLabels,
  siteTypeShort,
  type LayoutSection,
  type MultiSelectOption,
  type OccupancyStatus,
  type PositionedUnit,
  type RecordPresenceFilter,
  type SiteGroupMode,
} from './-site-helpers';
import { MultiFilterDropdown } from './-multi-filter-dropdown';
import { UnitLayoutBoard } from './-unit-layout-board';
import { UnitDetailDialog } from './-unit-detail-dialog';
import { ExpiryBoard } from './-expiry-board';

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/sites/')({
  component: SitesPage,
});

type UnitViewMode = 'table' | 'layout' | 'occupancy' | 'expiry';
type DongScope = { siteId: string; dongIds: string[] };
type DongWithUnitCount = Dong & { _count?: { units: number } | null };

const unitListingTransactionMeta: Record<
  string,
  { label: string; className: string }
> = {
  sale: { label: '매매', className: 'bg-[#fdebec] text-[#8f4b46]' },
  jeonse: { label: '전세', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  monthly: { label: '월세', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
};

const UNIT_RELATIONSHIP_COLUMN_IDS = ['tenant', 'listing'] as const;
const UNIT_RELATIONSHIP_COLUMN_ID_SET = new Set<string>(
  UNIT_RELATIONSHIP_COLUMN_IDS,
);

function UnitTableHeaderLabel({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal text-muted-foreground">
      <span className="shrink-0 [&>svg]:size-3 [&>svg]:text-muted-foreground/70">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function UnitTableEmptyCell() {
  return <span className="sr-only">미등록</span>;
}

function getUnitOwnerContacts(unit: Unit): UnitPropertyContact[] {
  const uniqueOwners = new Map<string, UnitPropertyContact>();
  for (const owner of (unit.properties ?? [])
    .flatMap((property) => property.propertyContacts ?? [])
    .filter((propertyContact) => propertyContact.role === 'owner')) {
    const existing = uniqueOwners.get(owner.contact.id);
    if (!existing || (owner.isPrimary && !existing.isPrimary)) {
      uniqueOwners.set(owner.contact.id, owner);
    }
  }
  return Array.from(uniqueOwners.values()).sort(
    (left, right) =>
      Number(right.isPrimary) - Number(left.isPrimary) ||
      left.contact.name.localeCompare(right.contact.name, 'ko'),
  );
}

const registeredPresenceOptions: ReadonlyArray<{
  value: RecordPresenceFilter;
  label: string;
}> = [
  { value: 'all', label: '전체' },
  { value: 'present', label: '등록' },
  { value: 'missing', label: '미등록' },
];

const existencePresenceOptions: ReadonlyArray<{
  value: RecordPresenceFilter;
  label: string;
}> = [
  { value: 'all', label: '전체' },
  { value: 'present', label: '있음' },
  { value: 'missing', label: '없음' },
];

function UnitRecordFilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: RecordPresenceFilter;
  onChange: (value: RecordPresenceFilter) => void;
  options: ReadonlyArray<{ value: RecordPresenceFilter; label: string }>;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as RecordPresenceFilter)}
    >
      <SelectTrigger
        size="sm"
        aria-label={`${label} 필터`}
        className={cn(
          'h-8 w-[128px] border-border bg-white px-2.5 text-xs font-normal text-foreground shadow-none',
          value !== 'all' && 'border-foreground/25 bg-foreground/[0.06]',
        )}
      >
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SitesPage() {
  const queryClient = useQueryClient();

  // ── Sidebar state ─────────────────────────────────────────────
  const [buildingSearch, setBuildingSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedSiteRegions, setSelectedSiteRegions] = useState<string[]>([]);
  const [selectedSiteTypes, setSelectedSiteTypes] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<SiteGroupMode>('none');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isSiteNavOpen, setIsSiteNavOpen] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<OfficeSite | null>(null);

  // ── Selection state ───────────────────────────────────────────
  const [selectedOfficeSite, setSelectedOfficeSite] = useState<OfficeSite | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [dongScope, setDongScope] = useState<DongScope | null>(null);
  const [selectedUnitTypeIds, setSelectedUnitTypeIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [unitSort, setUnitSort] = useState<SortingState>([]);
  const [unitViewMode, setUnitViewMode] = useState<UnitViewMode>('table');
  const [areUnitRelationshipColumnsCollapsed, setAreUnitRelationshipColumnsCollapsed] =
    useState(true);
  const [occupancyFilter, setOccupancyFilter] = useState<OccupancyStatus[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<RecordPresenceFilter>('all');
  const [tenantFilter, setTenantFilter] = useState<RecordPresenceFilter>('all');
  const [listingFilter, setListingFilter] = useState<RecordPresenceFilter>('all');
  const [consultationFilter, setConsultationFilter] =
    useState<RecordPresenceFilter>('all');

  // ── Modal state ───────────────────────────────────────────────
  const [showAddSiteDialog, setShowAddSiteDialog] = useState(false);
  const [showAddDongDialog, setShowAddDongDialog] = useState(false);
  const [showAddUnitDialog, setShowAddUnitDialog] = useState(false);
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [newDongName, setNewDongName] = useState('');
  const [newUnit, setNewUnit] = useState({ name: '', area: '', dongId: '' });

  // ── Refs (키보드 단축키) ──────────────────────────────────────
  const unitSearchRef = useRef<HTMLInputElement>(null);
  const buildingSearchRef = useRef<HTMLInputElement>(null);
  const didAutoSelectOfficeSite = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      (unitSearchRef.current ?? buildingSearchRef.current)?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Queries ───────────────────────────────────────────────────

  const {
    data: officeSites = [],
    isLoading: isLoadingList,
    isError: isListError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  });

  useEffect(() => {
    const firstOfficeSite = officeSites[0];
    if (
      didAutoSelectOfficeSite.current ||
      isLoadingList ||
      isListError ||
      !firstOfficeSite
    ) {
      return;
    }

    didAutoSelectOfficeSite.current = true;
    setSelectedOfficeSite((current) => current ?? firstOfficeSite);
  }, [isListError, isLoadingList, officeSites]);

  const selectedSiteId = selectedOfficeSite?.siteId;

  const {
    data: siteDetail,
    isLoading: isLoadingDetail,
    isError: isDetailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['sites', selectedSiteId, 'overview'],
    queryFn: () => {
      if (!selectedSiteId) throw new Error('단지가 선택되지 않았습니다');
      return api.sites.overview(selectedSiteId);
    },
    enabled: !!selectedSiteId,
  });

  const hasDongScopeForSite = dongScope?.siteId === selectedSiteId;
  const selectedDongIds = dongScope && dongScope.siteId === selectedSiteId
    ? dongScope.dongIds
    : getInitialDongScope(siteDetail?.defaultDongId ?? null);

  useEffect(() => {
    if (!siteDetail || hasDongScopeForSite) return;
    setDongScope({
      siteId: siteDetail.id,
      dongIds: getInitialDongScope(siteDetail.defaultDongId),
    });
  }, [hasDongScopeForSite, siteDetail]);

  const usesOverviewUnits =
    !!siteDetail && isDefaultDongScope(selectedDongIds, siteDetail.defaultDongId);
  const selectedDongScopeKey =
    selectedDongIds.length > 0 ? [...selectedDongIds].sort().join(',') : 'all';
  const shouldLoadScopedUnits =
    !!selectedSiteId &&
    !!siteDetail &&
    hasDongScopeForSite &&
    siteDetail.type !== 'land' &&
    !usesOverviewUnits;

  const {
    data: scopedUnits,
    isLoading: isLoadingUnits,
    isError: isUnitsError,
    refetch: refetchUnits,
  } = useQuery({
    queryKey: ['sites', selectedSiteId, 'units', selectedDongScopeKey],
    queryFn: () => {
      if (!selectedSiteId) throw new Error('단지가 선택되지 않았습니다');
      return api.units.findAll({
        siteId: selectedSiteId,
        dongIds: selectedDongIds.length > 0 ? selectedDongIds : undefined,
      });
    },
    enabled: shouldLoadScopedUnits,
  });

  const { data: searchResults, isError: isSearchError } = useQuery({
    queryKey: ['office-sites-search', siteSearchQuery],
    queryFn: () => api.officeSites.searchCentral(siteSearchQuery),
    enabled: siteSearchQuery.length >= 2,
  });

  // ── Mutations ─────────────────────────────────────────────────

  const addSiteMutation = useMutation({
    mutationFn: (siteId: string) => api.officeSites.add({ siteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      toast.success('관리단지에 추가했습니다');
      setSiteSearchQuery('');
      setShowAddSiteDialog(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '단지 추가에 실패했습니다');
    },
  });

  const removeSiteMutation = useMutation({
    mutationFn: (id: string) => api.officeSites.remove(id),
    onSuccess: (_data, removedId) => {
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      if (selectedOfficeSite?.id === removedId) {
        setSelectedOfficeSite(officeSites.find((site) => site.id !== removedId) ?? null);
        setSelectedUnitId(null);
        setDongScope(null);
        setSelectedUnitTypeIds([]);
        setQuery('');
        setUnitSort([]);
        setOccupancyFilter([]);
      }
      setRemoveTarget(null);
      toast.success('관리단지에서 제거했습니다');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '관리단지 제거에 실패했습니다');
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: Pick<OfficeSite, 'id' | 'isFavorite'>) =>
      api.officeSites.update(id, { isFavorite: !isFavorite }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['office-sites'] });
      const previousSites = queryClient.getQueryData<OfficeSite[]>(['office-sites']);
      const previousSelectedSite = selectedOfficeSite;

      queryClient.setQueryData<OfficeSite[]>(['office-sites'], (current = []) =>
        current.map((officeSite) =>
          officeSite.id === id
            ? { ...officeSite, isFavorite: !officeSite.isFavorite }
            : officeSite,
        ),
      );
      setSelectedOfficeSite((current) =>
        current?.id === id
          ? { ...current, isFavorite: !current.isFavorite }
          : current,
      );

      return { previousSites, previousSelectedSite };
    },
    onError: (error, variables, context) => {
      if (context?.previousSites) {
        queryClient.setQueryData(['office-sites'], context.previousSites);
      }
      setSelectedOfficeSite((current) =>
        current?.id === variables.id
          ? (context?.previousSelectedSite ?? null)
          : current,
      );
      toast.error(
        error instanceof Error ? error.message : '즐겨찾기 변경에 실패했습니다',
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
    },
  });

  const addDongMutation = useMutation({
    mutationFn: (dto: { siteId: string; name: string }) => api.dongs.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', selectedSiteId] });
      toast.success('동을 추가했습니다');
      setNewDongName('');
      setShowAddDongDialog(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '동 추가에 실패했습니다');
    },
  });

  const dongs: DongWithUnitCount[] = siteDetail?.dongs ?? [];
  const allUnits: Unit[] = usesOverviewUnits ? (siteDetail?.units ?? []) : (scopedUnits ?? []);

  const addUnitMutation = useMutation({
    mutationFn: async (dto: { name: string; area: string; dongId: string }) => {
      if (!selectedSiteId) throw new Error('단지가 선택되지 않았습니다');
      // 동이 미선택이면 placeholder Dong(단일 동 건물) 또는 첫 번째 Dong으로 자동 할당.
      // Dong이 하나도 없으면 '본동'을 먼저 생성한다 (빌라/단독 클라이언트 경로).
      let dongId =
        dto.dongId || dongs.find((dong) => dong.isPlaceholder)?.id || dongs[0]?.id || '';
      if (!dongId) {
        const created = await api.dongs.create({ siteId: selectedSiteId, name: '본동' });
        dongId = created.id;
      }
      return api.units.create({
        siteId: selectedSiteId,
        dongId,
        name: dto.name.trim(),
        exclusiveAreaM2: dto.area ? Number(dto.area) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', selectedSiteId] });
      toast.success('호수를 추가했습니다');
      setNewUnit({ name: '', area: '', dongId: '' });
      setShowAddUnitDialog(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '호수 추가에 실패했습니다');
    },
  });

  // ── Derived data ──────────────────────────────────────────────

  const existingSiteIds = new Set(officeSites.map((os) => os.siteId));

  const siteRegionOptions = useMemo<MultiSelectOption[]>(() => {
    const counts = new Map<string, number>();
    for (const officeSite of officeSites) {
      if (!officeSite.site) continue;
      const region = extractRegionFromSite(officeSite.site);
      counts.set(region, (counts.get(region) ?? 0) + 1);
    }
    return Array.from(counts, ([value, count]) => ({
      value,
      label: value,
      helper: `${count.toLocaleString()}개`,
    })).sort((left, right) => left.label.localeCompare(right.label, 'ko'));
  }, [officeSites]);

  const siteTypeFilterOptions = useMemo<MultiSelectOption[]>(() => {
    const counts = new Map<string, number>();
    for (const officeSite of officeSites) {
      if (!officeSite.site) continue;
      counts.set(officeSite.site.type, (counts.get(officeSite.site.type) ?? 0) + 1);
    }
    return Array.from(counts, ([value, count]) => ({
      value,
      label: siteTypeLabels[value] ?? value,
      helper: `${count.toLocaleString()}개`,
    })).sort((left, right) => left.label.localeCompare(right.label, 'ko'));
  }, [officeSites]);

  const hasSiteSearch = buildingSearch.trim().length > 0;
  const hasSiteFacetFilter =
    selectedSiteRegions.length > 0 || selectedSiteTypes.length > 0;
  const hasSiteFilter = hasSiteSearch || favoritesOnly || hasSiteFacetFilter;
  const filteredSites = useMemo(() => {
    const matchingSites = filterOfficeSites(officeSites, buildingSearch, {
      regions: selectedSiteRegions,
      types: selectedSiteTypes,
    });
    const scopedSites = favoritesOnly
      ? matchingSites.filter((officeSite) => officeSite.isFavorite)
      : matchingSites;
    return prioritizeFavoriteOfficeSites(scopedSites);
  }, [
    officeSites,
    buildingSearch,
    favoritesOnly,
    selectedSiteRegions,
    selectedSiteTypes,
  ]);

  const groupedSites = useMemo(
    () => groupOfficeSites(filteredSites, groupBy),
    [filteredSites, groupBy],
  );

  useEffect(() => {
    if (!hasSiteFilter || !groupedSites?.length) return;
    setExpandedGroups(new Set(groupedSites.map(([groupKey]) => groupKey)));
  }, [groupedSites, hasSiteFilter]);

  const getDongName = useCallback(
    (dongId: string | null) => dongs.find((d) => d.id === dongId)?.name ?? '',
    [dongs],
  );

  const selectedUnit = useMemo(
    () => (selectedUnitId ? (allUnits.find((unit) => unit.id === selectedUnitId) ?? null) : null),
    [allUnits, selectedUnitId],
  );

  // placeholder Dong(단일 동 건물)은 동 필터에서 숨긴다
  const dongOptions = useMemo<MultiSelectOption[]>(
    () =>
      dongs
        .filter((dong) => !dong.isPlaceholder)
        .map((dong) => ({
          value: dong.id,
          label: dong.name,
          helper: `${(dong._count?.units ?? 0).toLocaleString()}호`,
        })),
    [dongs],
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

  const hasChangedDongScope =
    !!siteDetail?.defaultDongId &&
    hasDongScopeForSite &&
    !isDefaultDongScope(selectedDongIds, siteDetail.defaultDongId);
  const hasActiveUnitContentFilters =
    selectedUnitTypeIds.length > 0 ||
    query.trim().length > 0 ||
    ownerFilter !== 'all' ||
    tenantFilter !== 'all' ||
    listingFilter !== 'all' ||
    consultationFilter !== 'all';
  const hasActiveUnitFilters = hasChangedDongScope || hasActiveUnitContentFilters;

  const filteredUnits = useMemo(() => {
    let units = filterUnitsByRecordPresence(allUnits, {
      owner: ownerFilter,
      tenant: tenantFilter,
      listing: listingFilter,
      consultation: consultationFilter,
    });

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

    const getOwnerName = (unit: Unit) =>
      getUnitOwnerContacts(unit)[0]?.contact.name ?? '';

    const getOwnerPhone = (unit: Unit) =>
      getUnitOwnerContacts(unit)[0]?.contact.phone ?? '';

    const getTenantLabel = (unit: Unit) =>
      (unit.properties ?? [])
        .flatMap((property) => property.tenants ?? [])
        .map((tenant) => tenant.contact.name)[0] ?? '';

    const getListingLabel = (unit: Unit) => {
      const primaryListing = (unit.properties ?? [])
        .flatMap((property) => property.listings ?? [])[0];
      if (!primaryListing) return '';
      return formatListingPrice(primaryListing);
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
      supplyArea: (a, b) =>
        Number(a.supplyAreaM2 ?? a.siteUnitType?.supplyAreaM2 ?? 0) -
        Number(b.supplyAreaM2 ?? b.siteUnitType?.supplyAreaM2 ?? 0),
      exclusiveArea: (a, b) =>
        Number(a.exclusiveAreaM2 ?? a.siteUnitType?.exclusiveAreaM2 ?? 0) -
        Number(b.exclusiveAreaM2 ?? b.siteUnitType?.exclusiveAreaM2 ?? 0),
      unitType: (a, b) =>
        (a.siteUnitType?.name ?? '').localeCompare(b.siteUnitType?.name ?? '', 'ko', { numeric: true }),
      ownerName: (a, b) => getOwnerName(a).localeCompare(getOwnerName(b), 'ko', { numeric: true }),
      ownerPhone: (a, b) => getOwnerPhone(a).localeCompare(getOwnerPhone(b), 'ko', { numeric: true }),
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
  }, [
    allUnits,
    consultationFilter,
    getDongName,
    listingFilter,
    ownerFilter,
    query,
    selectedUnitTypeIds,
    tenantFilter,
    unitSort,
  ]);

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

    const hasRealDongs = dongs.some((dong) => !dong.isPlaceholder);

    for (const unit of filteredUnits) {
      const sectionKey = hasRealDongs ? (unit.dongId ?? '__no_dong__') : '__site__';
      const sectionLabel = hasRealDongs ? getDongName(unit.dongId) || '미지정 동' : '전체';

      let section = sectionMap.get(sectionKey);
      if (!section) {
        section = {
          key: sectionKey,
          label: sectionLabel,
          positionedUnits: [],
          unpositionedUnits: [],
        };
        sectionMap.set(sectionKey, section);
      }

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
  }, [dongs, filteredUnits, getDongName]);

  // ── Handlers ──────────────────────────────────────────────────

  const resetSiteFilters = () => {
    setBuildingSearch('');
    setFavoritesOnly(false);
    setSelectedSiteRegions([]);
    setSelectedSiteTypes([]);
  };

  const handleSelectSite = (os: OfficeSite) => {
    setSelectedOfficeSite(os);
    setSelectedUnitId(null);
    setDongScope(null);
    setSelectedUnitTypeIds([]);
    setQuery('');
    setUnitSort([]);
    setOccupancyFilter([]);
    setOwnerFilter('all');
    setTenantFilter('all');
    setListingFilter('all');
    setConsultationFilter('all');
  };

  const handleDongScopeChange = (dongIds: string[]) => {
    if (!selectedSiteId) return;
    setDongScope({ siteId: selectedSiteId, dongIds });
    setSelectedUnitId(null);
    setSelectedUnitTypeIds([]);
    setQuery('');
    setOccupancyFilter([]);
    setOwnerFilter('all');
    setTenantFilter('all');
    setListingFilter('all');
    setConsultationFilter('all');
  };

  const handleSelectUnit = useCallback((unit: Unit) => {
    setSelectedUnitId(unit.id);
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
    addUnitMutation.mutate(newUnit);
  };

  const resetUnitFilters = () => {
    if (selectedSiteId && siteDetail) {
      setDongScope({
        siteId: selectedSiteId,
        dongIds: getInitialDongScope(siteDetail.defaultDongId),
      });
    }
    setSelectedUnitTypeIds([]);
    setQuery('');
    setOccupancyFilter([]);
    setOwnerFilter('all');
    setTenantFilter('all');
    setListingFilter('all');
    setConsultationFilter('all');
  };

  // ── Render helpers ────────────────────────────────────────────

  const unitColumns: ColumnDef<Unit>[] = useMemo(() => {
    const columns: ColumnDef<Unit>[] = [
    ...(dongs.some((dong) => !dong.isPlaceholder)
      ? [{
          id: 'dong',
          header: () => (
            <UnitTableHeaderLabel icon={<Building2 />} label="동" />
          ),
          size: 68,
          enableSorting: true,
          cell: ({ row }) => (
            <span className="truncate text-[13px] font-medium text-slate-700">
              {getDongName(row.original.dongId) || ''}
            </span>
          ),
        } satisfies ColumnDef<Unit>]
      : []),
    {
      id: 'name',
      header: () => <UnitTableHeaderLabel icon={<Hash />} label="호" />,
      size: 72,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="truncate text-[13px] font-semibold tabular-nums text-slate-900">
          {row.original.name}
        </span>
      ),
    },
    {
      id: 'supplyArea',
      header: () => <UnitTableHeaderLabel icon={<Ruler />} label="공급" />,
      size: 78,
      enableSorting: true,
      cell: ({ row }) => {
        const unit = row.original;
        const m2 = unit.supplyAreaM2 ?? unit.siteUnitType?.supplyAreaM2;
        if (!m2) return <UnitTableEmptyCell />;
        return (
          <span className="whitespace-nowrap text-[13px] tabular-nums text-slate-700">
            {formatPyeong(m2)}
          </span>
        );
      },
    },
    {
      id: 'exclusiveArea',
      header: () => <UnitTableHeaderLabel icon={<Ruler />} label="전용" />,
      size: 78,
      enableSorting: true,
      cell: ({ row }) => {
        const unit = row.original;
        const m2 = unit.exclusiveAreaM2 ?? unit.siteUnitType?.exclusiveAreaM2;
        if (!m2) return <UnitTableEmptyCell />;
        return (
          <span className="whitespace-nowrap text-[13px] tabular-nums text-slate-700">
            {formatPyeong(m2)}
          </span>
        );
      },
    },
    {
      id: 'unitType',
      header: () => <UnitTableHeaderLabel icon={<Type />} label="타입" />,
      size: 72,
      enableSorting: true,
      cell: ({ row }) => {
        const typeName = row.original.siteUnitType?.name;
        return typeName ? (
          <span className="truncate text-[13px] text-slate-700">
            {typeName}
          </span>
        ) : (
          <UnitTableEmptyCell />
        );
      },
    },
    {
      id: 'ownerName',
      header: () => <UnitTableHeaderLabel icon={<User />} label="소유자명" />,
      size: 140,
      minSize: 112,
      enableSorting: true,
      cell: ({ row }) => {
        const owners = getUnitOwnerContacts(row.original);
        const primaryOwner = owners[0];
        if (!primaryOwner) return <UnitTableEmptyCell />;
        const ownerNames = owners.map(({ contact }) => contact.name).join('\n');
        return (
          <div className="flex min-w-0 items-center gap-1.5" title={ownerNames}>
            <span className="truncate text-[13px] font-medium text-slate-900">
              {primaryOwner.contact.name}
            </span>
            {owners.length > 1 && (
              <span className="shrink-0 rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[10px] font-medium text-[#787774]">
                외 {owners.length - 1}명
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'ownerPhone',
      header: () => (
        <UnitTableHeaderLabel icon={<Phone />} label="소유자 전화번호" />
      ),
      size: 132,
      minSize: 120,
      enableSorting: true,
      cell: ({ row }) => {
        const owners = getUnitOwnerContacts(row.original);
        const primaryOwner = owners[0];
        const phone = primaryOwner?.contact.phone;
        if (!phone) return <UnitTableEmptyCell />;
        const phoneSummary = owners
          .flatMap(({ contact }) =>
            contact.phone ? [`${contact.name} ${formatPhone(contact.phone)}`] : [],
          )
          .join('\n');
        return (
          <span
            className="block min-w-0 truncate whitespace-nowrap text-[12px] tabular-nums text-slate-500"
            title={phoneSummary}
          >
            {formatPhone(phone)}
          </span>
        );
      },
    },
    {
      id: 'tenant',
      header: () => <UnitTableHeaderLabel icon={<Users />} label="세입자" />,
      size: 180,
      enableSorting: true,
      cell: ({ row }) => {
        const tenants = (row.original.properties ?? []).flatMap(
          (property) => property.tenants ?? [],
        );
        if (!tenants.length) return <UnitTableEmptyCell />;

        const primary = tenants[0];
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-slate-800">
              {primary.contact.name}
            </span>
            {primary.contact.phone && (
              <span className="shrink-0 text-[12px] tabular-nums text-slate-500">
                {formatPhone(primary.contact.phone)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'listing',
      header: () => <UnitTableHeaderLabel icon={<Tag />} label="등록 매물" />,
      size: 180,
      enableSorting: true,
      cell: ({ row }) => {
        const listings = (row.original.properties ?? []).flatMap(
          (property) => property.listings ?? [],
        );
        if (!listings.length) return <UnitTableEmptyCell />;

        const primary = listings[0];
        const transactionMeta = unitListingTransactionMeta[
          primary.transactionType
        ] ?? {
          label: primary.transactionType,
          className: 'bg-[#f1f1ef] text-[#787774]',
        };
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'inline-flex shrink-0 rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
                transactionMeta.className,
              )}
            >
              {transactionMeta.label}
            </span>
            <span
              className="truncate text-[13px] font-medium tabular-nums text-slate-900"
              title={formatListingPrice(primary)}
            >
              {formatListingPrice(primary)}
            </span>
            {listings.length > 1 && (
              <span className="shrink-0 rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[10px] font-medium text-[#787774]">
                +{listings.length - 1}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'lastConsultation',
      header: () => (
        <UnitTableHeaderLabel icon={<MessageSquareText />} label="최근 상담" />
      ),
      size: 280,
      minSize: 220,
      enableSorting: true,
      meta: { fill: true },
      cell: ({ row }) => {
        const latest = (row.original.properties ?? [])
          .flatMap((property) => property.consultations ?? [])
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime(),
          )[0];
        if (!latest) return <UnitTableEmptyCell />;
        return (
          <div className="flex min-w-0 items-center gap-1.5" title={latest.content}>
            <span className="max-w-20 shrink-0 truncate text-[12px] font-medium text-slate-700">
              {latest.contact.name}
            </span>
            <span className="text-slate-300">·</span>
            <span className="truncate text-[13px] text-slate-700">
              {latest.content}
            </span>
          </div>
        );
      },
    },
    {
      id: 'lastConsultationDate',
      header: () => (
        <UnitTableHeaderLabel icon={<CalendarDays />} label="상담일" />
      ),
      size: 100,
      enableSorting: true,
      cell: ({ row }) => {
        const latest = (row.original.properties ?? [])
          .flatMap((property) => property.consultations ?? [])
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime(),
          )[0];
        if (!latest) return <UnitTableEmptyCell />;
        return (
          <span className="whitespace-nowrap text-[12px] tabular-nums text-slate-500">
            {formatDate(latest.createdAt)}
          </span>
        );
      },
    },
  ];

    return columns.filter((column) => {
      const columnId = column.id ?? '';
      return !(
        areUnitRelationshipColumnsCollapsed &&
        UNIT_RELATIONSHIP_COLUMN_ID_SET.has(columnId)
      );
    });
  }, [areUnitRelationshipColumnsCollapsed, dongs, getDongName]);

  const unitPinnedColumns = useMemo(
    () => (dongs.some((dong) => !dong.isPlaceholder) ? ['dong', 'name'] : ['name']),
    [dongs],
  );

  const renderSiteItem = (os: OfficeSite) => {
    const site = os.site;
    if (!site) return null;
    const isActive = selectedOfficeSite?.id === os.id;
    const dongCount = site._count?.dongs ?? site.totalDongs;
    const unitCount = site._count?.units ?? site.totalUnits;
    const subline = [
      extractRegionFromSite(site),
      dongCount ? `${dongCount}개동` : null,
      unitCount ? `${unitCount}호` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <div
        key={os.id}
        className={cn(
          'group mb-1 flex items-start gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60',
          isActive && 'bg-accent shadow-sm ring-1 ring-border/60 hover:bg-accent',
        )}
      >
        <button
          type="button"
          className="min-w-0 flex-1 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          aria-pressed={isActive}
          onClick={() => handleSelectSite(os)}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {site.name}
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full bg-secondary px-[7px] py-px text-[10px] font-medium text-muted-foreground',
                isActive && 'bg-background/80 text-foreground/70',
              )}
            >
              {siteTypeShort[site.type] ?? site.type}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground/90">
            {subline || site.roadAddress || site.jibunAddress || '-'}
          </div>
        </button>
        <button
          type="button"
          disabled={
            toggleFavoriteMutation.isPending &&
            toggleFavoriteMutation.variables?.id === os.id
          }
          onClick={() => toggleFavoriteMutation.mutate(os)}
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md outline-none transition-[color,opacity,transform] active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-40',
            os.isFavorite
              ? 'text-yellow-500 opacity-100'
              : 'text-muted-foreground/50 opacity-0 hover:text-yellow-500 group-hover:opacity-100 focus-visible:opacity-100',
          )}
          aria-label={`${site.name} ${os.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}`}
          title={os.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        >
          <Star
            className={cn('size-3.5', os.isFavorite && 'fill-current')}
            strokeWidth={1.7}
          />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={`${site.name} 단지 메뉴`}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setRemoveTarget(os)}
            >
              <Trash2 className="size-3.5" />
              관리단지에서 제거
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const canManageUnits = !!siteDetail && siteDetail.type !== 'land';

  // 선택 범위와 전체 호수 메타
  const realDongCount = dongs.filter((dong) => !dong.isPlaceholder).length;
  const totalUnitCount = siteDetail?._count?.units ?? siteDetail?.totalUnits ?? allUnits.length;
  const selectedDongName =
    selectedDongIds.length === 1 ? getDongName(selectedDongIds[0]) : '';
  const unitScopeLabel =
    selectedDongIds.length > 1
      ? `${selectedDongIds.length}개 동`
      : selectedDongName || (realDongCount > 0 ? '전체 동' : '');

  // ── JSX ───────────────────────────────────────────────────────

  return (
    <div className="relative -m-4 flex min-h-0 flex-1">
      {/* ─── Sidebar (단지 Nav) ──────────────────────────────── */}
      {isSiteNavOpen ? (
        <aside className="flex w-[260px] shrink-0 flex-col border-r bg-background">
          {/* 헤더: 타이틀 + 단지 추가 + 접기 */}
          <div className="flex items-center gap-1.5 px-3 pb-2 pt-[11px]">
            <span className="text-[13px] font-semibold">관리단지</span>
            <span className="text-xs text-muted-foreground/80 tabular-nums">
              {hasSiteFilter ? `${filteredSites.length}/${officeSites.length}` : officeSites.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'size-[26px] rounded-[7px] transition-[color,background-color,transform] active:scale-[0.96]',
                favoritesOnly
                  ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100 hover:text-yellow-700'
                  : 'text-muted-foreground/70 hover:text-foreground',
              )}
              onClick={() => setFavoritesOnly((current) => !current)}
              aria-label={favoritesOnly ? '즐겨찾기 필터 해제' : '즐겨찾기만 보기'}
              aria-pressed={favoritesOnly}
              title={favoritesOnly ? '즐겨찾기 필터 해제' : '즐겨찾기만 보기'}
            >
              <Star className={cn('size-3.5', favoritesOnly && 'fill-current')} />
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="h-[26px] gap-1 rounded-[7px] px-2 text-[11.5px] font-medium text-foreground/80"
              onClick={() => setShowAddSiteDialog(true)}
              title="단지 추가"
            >
              <Plus className="size-3" />
              단지 추가
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-[26px] rounded-[7px] text-muted-foreground/80 hover:text-foreground"
              onClick={() => setIsSiteNavOpen(false)}
              aria-label="목록 접기"
              title="목록 접기"
            >
              <ChevronsLeft className="size-3.5" />
            </Button>
          </div>

          {/* 단지 묶음 방식 */}
          <div className="px-2.5 pb-1.5">
            <div
              className="flex rounded-lg bg-secondary p-0.5"
              role="group"
              aria-label="단지 묶음 방식"
            >
              {([
                { key: 'none', label: '목록' },
                { key: 'region', label: '지역별' },
                { key: 'type', label: '유형별' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={groupBy === key}
                  className={cn(
                    'flex-1 rounded-md py-1 text-[11.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70',
                    groupBy === key
                      ? 'bg-background font-semibold shadow-sm'
                      : 'font-medium text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => {
                    setGroupBy(key);
                    setExpandedGroups(new Set(getSiteGroupKeys(filteredSites, key)));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 검색 */}
          <div className="px-2.5 pb-2">
            <div className="flex h-[30px] items-center gap-1.5 rounded-lg border border-border/80 bg-muted px-2">
              <Search className="size-3.5 shrink-0 text-muted-foreground/70" />
              <input
                ref={buildingSearchRef}
                placeholder="단지명 · 주소 · 유형 검색"
                value={buildingSearch}
                onChange={(e) => setBuildingSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setBuildingSearch('');
                }}
                aria-label="관리단지 검색"
                className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
              />
              {buildingSearch && (
                <button
                  type="button"
                  className="rounded-sm text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                  onClick={() => {
                    setBuildingSearch('');
                    buildingSearchRef.current?.focus();
                  }}
                  aria-label="관리단지 검색 지우기"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* 실제 단지 조건 */}
          {(siteRegionOptions.length > 0 || siteTypeFilterOptions.length > 0) && (
            <div className="px-2.5 pb-2">
              <div className="mb-1 flex h-5 items-center justify-between">
                <span className="text-[10.5px] font-medium text-muted-foreground">
                  단지 필터
                </span>
                {hasSiteFilter && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1 text-[10.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={resetSiteFilters}
                  >
                    <RotateCcw className="size-2.5" />
                    초기화
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {siteRegionOptions.length > 0 && (
                  <MultiFilterDropdown
                    label="지역"
                    options={siteRegionOptions}
                    values={selectedSiteRegions}
                    onChange={setSelectedSiteRegions}
                    triggerClassName="min-w-0 flex-1"
                  />
                )}
                {siteTypeFilterOptions.length > 0 && (
                  <MultiFilterDropdown
                    label="유형"
                    options={siteTypeFilterOptions}
                    values={selectedSiteTypes}
                    onChange={setSelectedSiteTypes}
                    triggerClassName="min-w-0 flex-1"
                  />
                )}
              </div>
            </div>
          )}

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
            ) : isListError ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <p className="text-xs text-muted-foreground">관리단지 목록을 불러오지 못했습니다</p>
                <Button variant="outline" size="sm" onClick={() => refetchList()}>
                  <RotateCcw className="size-3.5" />
                  다시 시도
                </Button>
              </div>
            ) : filteredSites.length === 0 ? (
              <div className="px-2 pb-2.5">
                {hasSiteFilter ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <p className="text-xs text-muted-foreground">조건에 맞는 관리단지가 없습니다</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11.5px]"
                      onClick={resetSiteFilters}
                    >
                      필터 초기화
                    </Button>
                  </div>
                ) : (
                  <EmptyState
                    icon={Building2}
                    title="관리 단지가 없습니다"
                    description="자주 다루는 단지를 추가해보세요"
                    action={
                      <Button size="sm" variant="outline" onClick={() => setShowAddSiteDialog(true)}>
                        <Plus className="size-3.5" />
                        단지 추가
                      </Button>
                    }
                    className="py-8"
                  />
                )}
              </div>
            ) : groupBy === 'none' ? (
              <div className="px-2 pb-2.5">
                {filteredSites.map(renderSiteItem)}
              </div>
            ) : (
              <div className="px-2 pb-2.5">
                {groupedSites?.map(([groupKey, items]) => (
                  <div key={groupKey}>
                    <div
                      className="flex cursor-pointer items-center gap-[5px] rounded-md px-1.5 pb-1 pt-2 text-[11px] font-semibold text-muted-foreground/90 hover:text-foreground"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      {expandedGroups.has(groupKey) ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                      <span>{groupKey}</span>
                      <span className="font-medium text-muted-foreground/50 tabular-nums">
                        {items.length}
                      </span>
                    </div>
                    {expandedGroups.has(groupKey) && <div>{items.map(renderSiteItem)}</div>}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>
      ) : (
        /* ─── 접힌 사이드바 레일 ─────────────────────────────── */
        <div className="flex w-[38px] shrink-0 flex-col items-center gap-2 border-r bg-background pt-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-[26px] rounded-[7px] text-muted-foreground/80 hover:text-foreground"
            onClick={() => setIsSiteNavOpen(true)}
            aria-label="목록 펼치기"
            title="목록 펼치기"
          >
            <ChevronsRight className="size-3.5" />
          </Button>
          <MapIcon className="size-[15px] text-muted-foreground/40" />
        </div>
      )}

      {/* ─── Main area ───────────────────────────────────────── */}
      {!selectedOfficeSite ? (
        /* ── No site selected ──────────────────────────────────── */
        <div className="flex flex-1 items-center justify-center min-w-0 p-4">
          <EmptyState
            icon={Building2}
            title={officeSites.length > 0 ? '단지를 선택하세요' : '관리 단지를 추가하세요'}
            description={
              officeSites.length > 0
                ? '왼쪽에서 관리 단지를 선택하면 호수 목록이 표시됩니다'
                : '자주 다루는 단지를 추가하면 호수와 연락처를 한곳에서 관리할 수 있습니다'
            }
            action={
              officeSites.length > 0 ? (
                <Button variant="outline" size="sm" onClick={() => handleSelectSite(officeSites[0])}>
                  첫 단지 열기
                </Button>
              ) : (
                <Button size="sm" onClick={() => setShowAddSiteDialog(true)}>
                  <Plus className="size-3.5" />
                  단지 추가
                </Button>
              )
            }
          />
        </div>
      ) : isLoadingDetail ? (
        /* ── Detail loading ────────────────────────────────────── */
        <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-40 rounded-md" />
              <Skeleton className="h-3 w-64 rounded-md" />
            </div>
            <Skeleton className="ml-auto h-8 w-72 rounded-lg" />
          </div>
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </div>
      ) : isDetailError ? (
        /* ── Detail error ──────────────────────────────────────── */
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={Building2}
            title="단지 정보를 불러오지 못했습니다"
            description="네트워크 상태를 확인한 뒤 다시 시도해주세요"
            action={
              <Button variant="outline" size="sm" onClick={() => refetchDetail()}>
                <RotateCcw className="size-3.5" />
                다시 시도
              </Button>
            }
          />
        </div>
      ) : siteDetail ? (
        <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
          {/* 1차 필터: 선택 범위 · 검색 · 보기 방식 */}
          <div className="shrink-0 border-b border-border/60">
            <div className="overflow-x-auto px-5 py-2">
              <div className="flex w-full min-w-max items-center gap-1.5">
                {dongOptions.length > 0 && (
                  <MultiFilterDropdown
                    label="동"
                    options={dongOptions}
                    values={selectedDongIds}
                    onChange={handleDongScopeChange}
                    allOptionLabel={`전체 동 · ${totalUnitCount.toLocaleString()}호`}
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
                {(dongOptions.length > 0 || unitTypeOptions.length > 0) && (
                  <div className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
                )}

                <div className="flex h-8 w-[280px] min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-[#f7f6f3] px-2.5 hover:border-border focus-within:border-input focus-within:bg-white">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    ref={unitSearchRef}
                    placeholder="호수 · 이름 · 전화 · 상담 검색 (/)"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="호수, 이름, 전화번호, 상담 내용 검색"
                    disabled={isLoadingUnits}
                    className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
                  />
                  {query && (
                    <button
                      type="button"
                      className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setQuery('')}
                      aria-label="검색어 지우기"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex-1" />
                <div
                  className="flex rounded-lg bg-secondary p-[3px]"
                  role="group"
                  aria-label="단지 보기 방식"
                >
                  {([
                    { key: 'table', label: '호수 목록' },
                    { key: 'layout', label: '배치표' },
                    { key: 'occupancy', label: '점유상태' },
                    { key: 'expiry', label: '만기/변동' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={unitViewMode === key}
                      className={cn(
                        'whitespace-nowrap rounded-md px-2.5 py-[5px] text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70',
                        unitViewMode === key
                          ? 'bg-background font-semibold shadow-sm'
                          : 'font-medium text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => setUnitViewMode(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {canManageUnits && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5 text-xs">
                        <Plus className="size-3.5" />
                        동·호수 추가
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setShowAddDongDialog(true)}>
                        동 추가
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowAddUnitDialog(true)}>
                        호수 추가
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* 2차 필터: 호수별 CRM 등록 상태 */}
            <div className="overflow-x-auto border-t border-border/60 bg-[#faf9f6] px-5 py-2">
              <div className="flex w-full min-w-max items-center gap-1.5">
                <UnitRecordFilterSelect
                  label="소유자"
                  value={ownerFilter}
                  onChange={setOwnerFilter}
                  options={registeredPresenceOptions}
                />
                <UnitRecordFilterSelect
                  label="세입자"
                  value={tenantFilter}
                  onChange={setTenantFilter}
                  options={existencePresenceOptions}
                />
                <UnitRecordFilterSelect
                  label="등록 매물"
                  value={listingFilter}
                  onChange={setListingFilter}
                  options={registeredPresenceOptions}
                />
                <UnitRecordFilterSelect
                  label="상담"
                  value={consultationFilter}
                  onChange={setConsultationFilter}
                  options={existencePresenceOptions}
                />

                {hasActiveUnitFilters && (
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={resetUnitFilters}
                  >
                    <RotateCcw className="size-3" />
                    초기화
                  </button>
                )}

                <div className="flex-1" />
                <span
                  className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
                  aria-live="polite"
                >
                  {isLoadingUnits
                    ? `${unitScopeLabel || '호수'} 불러오는 중`
                    : hasActiveUnitContentFilters
                    ? `${filteredUnits.length.toLocaleString()} / ${allUnits.length.toLocaleString()}호`
                    : `${unitScopeLabel ? `${unitScopeLabel} · ` : ''}${allUnits.length.toLocaleString()}호`}
                </span>
              </div>
            </div>
          </div>

          {/* Units View */}
          <div className="flex-1 min-h-0 overflow-hidden">
              {isLoadingUnits ? (
                <div className="space-y-2 p-5" aria-label={`${unitScopeLabel || '호수'} 불러오는 중`}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full rounded-md" />
                  ))}
                </div>
              ) : isUnitsError ? (
                <div className="flex h-full items-center justify-center p-4">
                  <EmptyState
                    icon={Building2}
                    title={`${unitScopeLabel || '선택한 범위'} 호수를 불러오지 못했습니다`}
                    description="네트워크 상태를 확인한 뒤 다시 시도해주세요"
                    action={
                      <Button variant="outline" size="sm" onClick={() => refetchUnits()}>
                        <RotateCcw className="size-3.5" />
                        다시 시도
                      </Button>
                    }
                  />
                </div>
              ) : unitViewMode === 'table' ? (
                <DataTable
                  columns={unitColumns}
                  data={filteredUnits}
                  enableRowSelection
                  sorting={unitSort}
                  onSortingChange={setUnitSort}
                  onRowClick={handleSelectUnit}
                  layout="full-height"
                  variant="notion"
                  rowHeight={33}
                  pinnedColumns={unitPinnedColumns}
                  columnGroupControls={[
                    {
                      collapsed: areUnitRelationshipColumnsCollapsed,
                      onToggle: () => {
                        if (!areUnitRelationshipColumnsCollapsed) {
                          setUnitSort((previous) =>
                            previous.some(({ id }) =>
                              UNIT_RELATIONSHIP_COLUMN_ID_SET.has(id),
                            )
                              ? []
                              : previous,
                          );
                        }
                        setAreUnitRelationshipColumnsCollapsed(
                          (collapsed) => !collapsed,
                        );
                      },
                      anchorColumnId: 'ownerPhone',
                      columnIds: UNIT_RELATIONSHIP_COLUMN_IDS,
                      label: '세입자·등록 매물',
                    },
                  ]}
                  emptyMessage={hasActiveUnitFilters ? '검색 결과가 없습니다' : '등록된 호수가 없습니다'}
                  renderStatusBar={({ focusedRow, totalCount }) => {
                    if (!focusedRow) {
                      return (
                        <span className="tabular-nums">
                          호수 {totalCount.toLocaleString()}건 표시
                        </span>
                      );
                    }
                    const dongName = getDongName(focusedRow.dongId);
                  const focusedOwners = getUnitOwnerContacts(focusedRow);
                  const owner = focusedOwners[0]?.contact;
                    return (
                      <>
                        <span className="tabular-nums text-foreground/80">
                          호수 {totalCount.toLocaleString()}건
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
                            <span className="tabular-nums text-foreground/70">
                              {formatPhone(owner.phone)}
                            </span>
                          )}
                          {focusedOwners.length > 1 && (
                            <span className="text-foreground/70">
                              외 {focusedOwners.length - 1}명
                            </span>
                          )}
                        </>
                      )}
                      </>
                    );
                  }}
                />
              ) : unitViewMode === 'layout' ? (
                <UnitLayoutBoard
                  sections={layoutSections}
                  selectedUnitId={selectedUnitId}
                  onUnitOpen={handleSelectUnit}
                  colorMode="activity"
                />
              ) : unitViewMode === 'occupancy' ? (
                <UnitLayoutBoard
                  sections={layoutSections}
                  selectedUnitId={selectedUnitId}
                  onUnitOpen={handleSelectUnit}
                  colorMode="occupancy"
                  occupancyFilter={occupancyFilter}
                  onOccupancyFilterChange={setOccupancyFilter}
                />
              ) : (
                <ExpiryBoard
                  units={filteredUnits}
                  getDongName={getDongName}
                  onUnitOpen={handleSelectUnit}
                />
              )}
          </div>
        </div>
      ) : null}

      {/* ─── Unit Detail Dialog ──────────────────────────────── */}
      <UnitDetailDialog
        unit={selectedUnit}
        site={siteDetail ?? null}
        dongs={dongs}
        onClose={() => setSelectedUnitId(null)}
      />

      {/* ─── Remove OfficeSite Confirm ───────────────────────── */}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="관리단지에서 제거"
        description={`'${removeTarget?.site?.name ?? ''}' 단지를 관리 목록에서 제거합니다. 원본 단지 정보와 등록된 매물 데이터는 삭제되지 않습니다.`}
        confirmLabel="제거"
        destructive
        loading={removeSiteMutation.isPending}
        onConfirm={() => {
          if (removeTarget) removeSiteMutation.mutate(removeTarget.id);
        }}
      />

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
            {isSearchError && (
              <p className="py-2 text-center text-sm text-muted-foreground">
                검색에 실패했습니다. 잠시 후 다시 시도해주세요.
              </p>
            )}
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
            <div className="space-y-1.5">
              <Label className="text-sm">
                동 이름 <span className="text-destructive">*</span>
              </Label>
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
            {dongs.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-sm">동</Label>
                <Select value={newUnit.dongId} onValueChange={(v) => setNewUnit({ ...newUnit, dongId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="동 선택 (선택)" />
                  </SelectTrigger>
                  <SelectContent>
                    {dongs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.isPlaceholder ? '본동(단일동)' : d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                등록된 동이 없습니다. 호수를 추가하면 '본동'이 자동으로 생성됩니다.
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">
                호수 <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="예: 301호"
                value={newUnit.name}
                onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
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
