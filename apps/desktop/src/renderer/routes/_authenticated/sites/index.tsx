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
  Plus,
  Building2,
  CalendarClock,
  CalendarDays,
  Hash,
  House,
  LayoutGrid,
  List,
  MessageSquareText,
  Phone,
  RotateCcw,
  Ruler,
  Tag,
  Type,
  User,
  Users,
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
import { Skeleton } from '@/components/ui/skeleton';
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
import { ConfirmDialog, EmptyState } from '@/components/domain';
import { cn } from '@/lib/utils';
import { formatDate, formatPhone, formatPyeong } from '@/lib/format';
import {
  filterUnitsByRecordPresence,
  formatListingPrice,
  getInitialDongScope,
  isDefaultDongScope,
  clampPanelWidth,
  isManagedUnit,
  isPilotiUnit,
  parseUnitPlacement,
  prioritizeFavoriteOfficeSites,
  selectUnitTableRows,
  type LayoutSection,
  type MultiSelectOption,
  type OccupancyStatus,
  type PositionedUnit,
  type RecordPresenceFilter,
  type UnitTableScope,
  canEditSiteStructure,
} from './-site-helpers';
import {
  AddFilterMenu,
  ChecklistFilterPanel,
  ToolbarFilterChip,
  ToolbarPillTabs,
  ToolbarPillToggle,
  summarizeSelection,
  toolbarGhostButtonClassName,
  type AddFilterItem,
} from '../properties/-components/property-toolbar';
import {
  RecordFilterChip,
  RecordFilterOptions,
  UnitSearchBar,
  summarizeRecordFilter,
} from './-unit-toolbar';
import {
  SitesPanel,
  SitesPanelToggle,
  readStoredPanelOpen,
  readStoredPanelWidth,
  storePanelOpen,
  storePanelWidth,
} from './-sites-panel';
import { AddSiteDialog } from './-add-site-dialog';
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

const UNIT_TABLE_SCOPE_STORAGE_KEY = 'sites.unitTableScope';

/** 마지막으로 고른 호수 목록 범위. 저장소를 못 읽으면 기본값(관리호수)으로 연다. */
function readStoredUnitTableScope(): UnitTableScope {
  try {
    return localStorage.getItem(UNIT_TABLE_SCOPE_STORAGE_KEY) === 'all' ? 'all' : 'managed';
  } catch {
    return 'managed';
  }
}



const EMPTY_NEW_UNIT = {
  name: '',
  area: '',
  roomCount: '',
  bathRoomCount: '',
  dongId: '',
};

function SitesPage() {
  const queryClient = useQueryClient();

  // ── 관리단지 사이드바 (단지 버튼으로 열고 닫음) ───────────────
  const [isSitesPanelOpen, setIsSitesPanelOpen] = useState(readStoredPanelOpen);
  const [sitesPanelWidth, setSitesPanelWidth] = useState(readStoredPanelWidth);
  const [pageWidth, setPageWidth] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<OfficeSite | null>(null);

  // ── Selection state ───────────────────────────────────────────
  const [selectedOfficeSite, setSelectedOfficeSite] = useState<OfficeSite | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [dongScope, setDongScope] = useState<DongScope | null>(null);
  const [selectedUnitTypeIds, setSelectedUnitTypeIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [unitSort, setUnitSort] = useState<SortingState>([]);
  const [unitViewMode, setUnitViewMode] = useState<UnitViewMode>('table');
  const [unitTableScope, setUnitTableScope] =
    useState<UnitTableScope>(readStoredUnitTableScope);
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
  const [newDongName, setNewDongName] = useState('');
  const [newUnit, setNewUnit] = useState(EMPTY_NEW_UNIT);

  // ── Refs (키보드 단축키) ──────────────────────────────────────
  const unitSearchRef = useRef<HTMLInputElement>(null);
  const buildingSearchRef = useRef<HTMLInputElement>(null);
  const sitesPanelToggleRef = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const didAutoSelectOfficeSite = useRef(false);

  const setSitesPanelOpen = useCallback((open: boolean) => {
    setIsSitesPanelOpen(open);
    storePanelOpen(open);
  }, []);

  const closeSitesPanel = useCallback(() => {
    setSitesPanelOpen(false);
    sitesPanelToggleRef.current?.focus();
  }, [setSitesPanelOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' && event.key !== '[') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[role="dialog"]'))
      ) {
        return;
      }
      event.preventDefault();
      if (event.key === '[') {
        setIsSitesPanelOpen((open) => {
          storePanelOpen(!open);
          return !open;
        });
        return;
      }
      (unitSearchRef.current ?? buildingSearchRef.current)?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 사이드바 너비 한도는 앱 메뉴 접힘 여부와 창 크기에 따라 달라지므로 페이지 폭을 직접 잰다
  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setPageWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const effectiveSitesPanelWidth = clampPanelWidth(sitesPanelWidth, pageWidth);

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

  // 관리 단지가 하나도 없으면 사이드바의 안내와 추가 버튼이 가장 먼저 필요하므로 열어 둔다.
  // 사용자가 다시 닫을 수 있게 한 번만 열고, 저장된 열림 상태(사용자의 선택)는 덮어쓰지 않는다
  const didAutoOpenSitesPanel = useRef(false);
  useEffect(() => {
    if (didAutoOpenSitesPanel.current || isLoadingList || isListError || officeSites.length > 0) {
      return;
    }
    didAutoOpenSitesPanel.current = true;
    setIsSitesPanelOpen(true);
  }, [isListError, isLoadingList, officeSites.length]);

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

  // ── Mutations ─────────────────────────────────────────────────

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
    mutationFn: async (dto: {
      name: string;
      area: string;
      roomCount: string;
      bathRoomCount: string;
      dongId: string;
    }) => {
      if (!selectedSiteId) throw new Error('단지가 선택되지 않았습니다');
      // 동 목록을 받기 전에는 아래에서 '동이 없다'고 판단할 수 없다
      if (!siteDetail) throw new Error('단지 정보를 불러오지 못했습니다');
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
        roomCount: dto.roomCount ? Number(dto.roomCount) : null,
        bathRoomCount: dto.bathRoomCount ? Number(dto.bathRoomCount) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', selectedSiteId] });
      toast.success('호수를 추가했습니다');
      setNewUnit(EMPTY_NEW_UNIT);
      setShowAddUnitDialog(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '호수 추가에 실패했습니다');
    },
  });

  // ── Derived data ──────────────────────────────────────────────

  // 고정(즐겨찾기)한 단지를 먼저 — 서버가 내려준 순서는 그 안에서 유지
  const orderedOfficeSites = useMemo(
    () => prioritizeFavoriteOfficeSites(officeSites),
    [officeSites],
  );

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

  useEffect(() => {
    try {
      localStorage.setItem(UNIT_TABLE_SCOPE_STORAGE_KEY, unitTableScope);
    } catch {
      /* 저장 못 해도 이번 세션 동작에는 영향 없음 */
    }
  }, [unitTableScope]);

  // 관리호수만 보는 범위는 호수 목록(표)에만 적용한다. 배치표·만기는 단지 구조를 그대로 보여준다.
  const isSearchingUnits = query.trim().length > 0;
  const allTableUnits = useMemo(
    () => selectUnitTableRows(filteredUnits, 'all', false),
    [filteredUnits],
  );
  const totalRoomCount = allUnits.filter((unit) => !isPilotiUnit(unit)).length;
  const managedUnitCount = useMemo(
    () => allTableUnits.filter(isManagedUnit).length,
    [allTableUnits],
  );
  const tableUnits = useMemo(
    () => selectUnitTableRows(filteredUnits, unitTableScope, isSearchingUnits),
    [filteredUnits, isSearchingUnits, unitTableScope],
  );
  const showsManagedUnitsOnly = unitTableScope === 'managed' && !isSearchingUnits;
  const unitTableEmptyMessage = showsManagedUnitsOnly
    ? hasActiveUnitContentFilters
      ? '조건에 맞는 관리호수가 없습니다'
      : siteDetail?._count?.units === 0
        ? // 호수가 아직 없으면 고를 ‘전체’도 비어 있다. 직접 등록한 단지만 호수를 추가할 수 있다
          canEditSiteStructure(siteDetail)
          ? '아직 등록된 호수가 없습니다. 단지 목록에서 이 단지의 ⋯ 메뉴로 호수를 추가하세요.'
          : '아직 등록된 호수가 없습니다.'
        : '이 범위에 관리호수가 없습니다. ‘전체’에서 호수를 골라 관리호수로 등록하세요.'
    : hasActiveUnitFilters
      ? '검색 결과가 없습니다'
      : '등록된 호수가 없습니다';

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

  // 동·호수 추가는 직접 등록한 단지의 사이드바 메뉴에서 연다. 대화상자는 선택된 단지에 추가하므로
  // 그 단지를 먼저 열고, 이전 단지에서 입력하던 값(특히 그 단지의 동)이 남지 않게 비운다
  const prepareStructureDialog = (os: OfficeSite) => {
    if (selectedOfficeSite?.id !== os.id) handleSelectSite(os);
    setNewDongName('');
    setNewUnit(EMPTY_NEW_UNIT);
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

  const handleAddDong = () => {
    if (!newDongName.trim() || !selectedSiteId) return;
    addDongMutation.mutate({ siteId: selectedSiteId, name: newDongName.trim() });
  };

  const handleAddUnit = () => {
    if (!newUnit.name.trim() || !selectedSiteId || !siteDetail) return;
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

  // 선택 범위와 전체 호수 메타
  const realDongCount = dongs.filter((dong) => !dong.isPlaceholder).length;
  const totalUnitCount = siteDetail?._count?.units ?? siteDetail?.totalUnits ?? allUnits.length;
  const selectedDongName =
    selectedDongIds.length === 1 ? getDongName(selectedDongIds[0]) : '';
  const unitScopeLabel =
    selectedDongIds.length > 1
      ? `${selectedDongIds.length}개 동`
      : selectedDongName || (realDongCount > 0 ? '전체 동' : '');

  // 자주 쓰지 않는 호수 필터. 값이 있으면 2행에 칩으로, 없으면 "+ 필터" 메뉴 안에만 있다.
  const moreUnitFilterItems: (AddFilterItem & { onClear: () => void })[] = [
    {
      key: 'tenant',
      label: '세입자',
      icon: <Users />,
      summary: summarizeRecordFilter(tenantFilter, existencePresenceOptions),
      onClear: () => setTenantFilter('all'),
      contentClassName: 'w-[180px] p-1',
      render: (close) => (
        <RecordFilterOptions
          label="세입자"
          value={tenantFilter}
          onChange={setTenantFilter}
          options={existencePresenceOptions}
          onDone={close}
        />
      ),
    },
    {
      key: 'consultation',
      label: '상담',
      icon: <MessageSquareText />,
      summary: summarizeRecordFilter(consultationFilter, existencePresenceOptions),
      onClear: () => setConsultationFilter('all'),
      contentClassName: 'w-[180px] p-1',
      render: (close) => (
        <RecordFilterOptions
          label="상담"
          value={consultationFilter}
          onChange={setConsultationFilter}
          options={existencePresenceOptions}
          onDone={close}
        />
      ),
    },
  ];

  // 본문 첫 줄 맨 앞의 단지 버튼 — 사이드바를 여닫는 유일한 마우스 경로라 단지를 고르기 전에도 늘 보인다
  const sitesPanelToggle = (
    <SitesPanelToggle
      open={isSitesPanelOpen}
      siteName={siteDetail?.name ?? selectedOfficeSite?.site?.name ?? '관리단지'}
      siteCount={officeSites.length}
      onToggle={() => setSitesPanelOpen(!isSitesPanelOpen)}
      buttonRef={sitesPanelToggleRef}
    />
  );

  // ── JSX ───────────────────────────────────────────────────────

  return (
    <div ref={pageRef} className="relative -m-4 flex min-h-0 flex-1">
      {/* ─── 관리단지 사이드바 (단지 버튼으로 연다) ─────────────── */}
      <SitesPanel
        open={isSitesPanelOpen}
        width={effectiveSitesPanelWidth}
        containerWidth={pageWidth}
        onWidthChange={setSitesPanelWidth}
        onWidthCommit={storePanelWidth}
        onClose={closeSitesPanel}
        officeSites={orderedOfficeSites}
        isLoading={isLoadingList}
        isError={isListError}
        onRetry={() => refetchList()}
        selectedOfficeSiteId={selectedOfficeSite?.id ?? null}
        onSelect={handleSelectSite}
        onTogglePin={(officeSite) => toggleFavoriteMutation.mutate(officeSite)}
        pinPendingId={
          toggleFavoriteMutation.isPending ? (toggleFavoriteMutation.variables?.id ?? null) : null
        }
        onRemove={setRemoveTarget}
        onAddDong={(os) => {
          prepareStructureDialog(os);
          setShowAddDongDialog(true);
        }}
        onAddUnit={(os) => {
          prepareStructureDialog(os);
          setShowAddUnitDialog(true);
        }}
        onAdd={() => setShowAddSiteDialog(true)}
        searchRef={buildingSearchRef}
      />

      {/* ─── Main area ───────────────────────────────────────── */}
      {!selectedOfficeSite ? (
        /* ── No site selected ──────────────────────────────────── */
        // 사이드바가 닫혀 있을 수 있으므로 목록 로딩·오류·다시 시도를 본문에서도 보여준다
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-[51px] shrink-0 items-center border-b border-border pl-3 pr-5">
            {sitesPanelToggle}
          </div>
          {isLoadingList ? (
            <div className="flex flex-1 flex-col gap-2 p-5" aria-label="관리단지 불러오는 중">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-md" />
              ))}
            </div>
          ) : isListError ? (
            <div className="flex flex-1 items-center justify-center min-w-0 p-4">
              <EmptyState
                icon={Building2}
                title="관리단지 목록을 불러오지 못했습니다"
                description="네트워크 상태를 확인한 뒤 다시 시도해주세요"
                action={
                  <Button variant="outline" size="sm" onClick={() => refetchList()}>
                    <RotateCcw className="size-3.5" />
                    다시 시도
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center min-w-0 p-4">
              <EmptyState
                icon={Building2}
                title={officeSites.length > 0 ? '단지를 선택하세요' : '관리 단지를 추가하세요'}
                description={
                  officeSites.length > 0
                    ? '단지 목록에서 관리 단지를 선택하면 호수 목록이 표시됩니다'
                    : '자주 다루는 단지를 추가하면 호수와 연락처를 한곳에서 관리할 수 있습니다'
                }
                action={
                  officeSites.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => setSitesPanelOpen(true)}>
                      단지 목록 열기
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
          )}
        </div>
      ) : isLoadingDetail ? (
        /* ── Detail loading ────────────────────────────────────── */
        <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="flex h-[51px] shrink-0 items-center gap-2.5 border-b border-border/60 pl-3 pr-5">
            {sitesPanelToggle}
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
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[51px] shrink-0 items-center border-b border-border/60 pl-3 pr-5">
            {sitesPanelToggle}
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
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
        </div>
      ) : siteDetail ? (
        <div className="@container flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
          {/* 1차 필터: 선택 범위 · 검색 · 보기 방식 — 매물관리 툴바 1행과 같은 모양 */}
          <section className="flex h-[51px] shrink-0 items-center gap-2 border-b border-border bg-white px-3">
            {sitesPanelToggle}
            <UnitSearchBar
              dongOptions={dongOptions}
              selectedDongIds={selectedDongIds}
              onDongChange={handleDongScopeChange}
              totalUnitCount={totalUnitCount}
              query={query}
              onQueryChange={setQuery}
              searchRef={unitSearchRef}
              disabled={isLoadingUnits}
              searchHint={
                isSearchingUnits && unitViewMode === 'table' && unitTableScope === 'managed'
                  ? '전체 호실에서 검색'
                  : null
              }
            />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ToolbarPillToggle
                ariaLabel="단지 보기 방식"
                value={unitViewMode}
                onChange={setUnitViewMode}
                options={[
                  { value: 'table', label: '호수 목록', icon: <List /> },
                  { value: 'layout', label: '배치표', icon: <LayoutGrid /> },
                  { value: 'occupancy', label: '점유상태', icon: <House /> },
                  { value: 'expiry', label: '만기/변동', icon: <CalendarClock /> },
                ]}
              />
            </div>
          </section>

          {/* 2차 필터: 호수별 CRM 등록 상태 — 매물관리 툴바 2행과 같은 칩 */}
          <section className="flex min-h-[47px] shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-2">
            {/* 칩이 많아 한 줄을 넘치면 옆으로 숨기지 않고 다음 줄로 내린다 — 설정한 필터가 가려지지 않게 */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {unitViewMode === 'table' && (
                <>
                  <ToolbarPillTabs
                    ariaLabel="호수 목록 범위"
                    value={unitTableScope}
                    onChange={setUnitTableScope}
                    options={[
                      { value: 'managed', label: '관리호수', count: managedUnitCount },
                      { value: 'all', label: '전체', count: allTableUnits.length },
                    ]}
                  />
                  <div className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
                </>
              )}
              {unitTypeOptions.length > 0 && (
                <ToolbarFilterChip
                  label="타입"
                  summary={summarizeSelection(unitTypeOptions, selectedUnitTypeIds)}
                  onClear={() => setSelectedUnitTypeIds([])}
                  contentClassName="w-[240px] p-0"
                >
                  <ChecklistFilterPanel
                    options={unitTypeOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                      meta: option.helper,
                    }))}
                    selected={selectedUnitTypeIds}
                    onChange={setSelectedUnitTypeIds}
                    // 목록 항목은 입력칸에서 ↑↓·Enter로 고르므로 항목 수와 상관없이 입력칸을 둔다
                    searchable
                    searchPlaceholder="타입 찾기 · ↑↓ 이동 · Enter 선택"
                    listClassName="max-h-[280px]"
                  />
                </ToolbarFilterChip>
              )}
              <RecordFilterChip
                label="소유자"
                value={ownerFilter}
                onChange={setOwnerFilter}
                options={registeredPresenceOptions}
              />
              <RecordFilterChip
                label="등록 매물"
                value={listingFilter}
                onChange={setListingFilter}
                options={registeredPresenceOptions}
              />
              {/* "+ 필터"에서 고른 필터는 값이 생긴 뒤에만 칩으로 나타난다 (매물관리와 같은 흐름) */}
              {moreUnitFilterItems
                .filter((item) => item.summary !== null)
                .map((item) => (
                  <ToolbarFilterChip
                    key={item.key}
                    label={item.label}
                    summary={item.summary}
                    onClear={item.onClear}
                    contentClassName={item.contentClassName}
                  >
                    {(close) => item.render(close)}
                  </ToolbarFilterChip>
                ))}
              <AddFilterMenu
                items={moreUnitFilterItems}
                hint="타입 · 소유자 · 등록 매물은 이 줄에 늘 보입니다."
              />
            </div>

            {/* 개수 · 초기화 — 칩 줄이 넘쳐도 가려지지 않게 오른쪽에 고정 */}
            <div className="flex shrink-0 items-center gap-0.5">
              {/* 호수 목록에서는 범위 탭이 개수를 보여주므로 같은 숫자를 반복하지 않는다. */}
              {(unitViewMode !== 'table' || isLoadingUnits) && (
                <span
                  className="whitespace-nowrap px-1 text-[11.5px] tabular-nums text-muted-foreground"
                  aria-live="polite"
                >
                  {isLoadingUnits
                    ? `${unitScopeLabel || '호수'} 불러오는 중`
                    : hasActiveUnitContentFilters
                    ? `${allTableUnits.length.toLocaleString()} / ${totalRoomCount.toLocaleString()}호`
                    : `${unitScopeLabel ? `${unitScopeLabel} · ` : ''}${totalRoomCount.toLocaleString()}호`}
                </span>
              )}
              {hasActiveUnitFilters && (
                <button
                  type="button"
                  className={toolbarGhostButtonClassName}
                  onClick={resetUnitFilters}
                >
                  <RotateCcw className="size-3.5" />
                  초기화
                </button>
              )}
            </div>
          </section>

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
                  data={tableUnits}
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
                  emptyMessage={unitTableEmptyMessage}
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
      <AddSiteDialog
        open={showAddSiteDialog}
        onOpenChange={setShowAddSiteDialog}
        officeSites={officeSites}
        onOpenSite={handleSelectSite}
      />

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
            {/* 동 목록을 받기 전(로딩·조회 실패)에는 '동 없음'으로 보지 않는다 — 있는 단지에 본동을 또 만들게 된다 */}
            {!siteDetail ? (
              isDetailError ? (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-xs"
                >
                  <span className="min-w-0">단지 정보를 불러오지 못했습니다</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => refetchDetail()}
                  >
                    다시 시도
                  </Button>
                </div>
              ) : (
                <Skeleton className="h-9 w-full rounded-md" />
              )
            ) : dongs.length > 0 ? (
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">방 수</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="예: 2"
                  value={newUnit.roomCount}
                  onChange={(e) =>
                    setNewUnit({ ...newUnit, roomCount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">욕실 수</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="예: 1"
                  value={newUnit.bathRoomCount}
                  onChange={(e) =>
                    setNewUnit({ ...newUnit, bathRoomCount: e.target.value })
                  }
                  onKeyDown={(e) => e.key === 'Enter' && handleAddUnit()}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddUnitDialog(false)}>
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleAddUnit}
              disabled={!newUnit.name.trim() || addUnitMutation.isPending || !siteDetail}
            >
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
