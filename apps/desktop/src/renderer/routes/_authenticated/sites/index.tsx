import {
  compareUnitSpaces,
  formatDongLabel,
  formatPlaceLabel,
  formatUnitName,
} from '@estate-erp/shared';
import { Link, createFileRoute } from '@tanstack/react-router';
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
import { apiErrorMessage } from '@/lib/api-error';
import { consultationChannelIcons } from '../consultations/-consultation-inspector';
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
  ConfirmDialog,
  ContactNameChip,
  EmptyState,
  RowOpenButton,
} from '@/components/domain';
import { cn } from '@/lib/utils';
import { formatPhone, formatPyeong, formatRelativeDay } from '@/lib/format';
import {
  filterUnitsByRecordPresence,
  formatListingPrice,
  getInitialDongScope,
  isDefaultDongScope,
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
  consultationTypeLabels,
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
import { AddUnitDialog } from './-add-unit-dialog';
import { LandSiteProperties, WholeBuildingPropertiesStrip } from './-site-whole-properties';
import { UnitLayoutBoard } from './-unit-layout-board';
import { UnitDetailPanel } from './-unit-detail-dialog';
import { ExpiryBoard } from './-expiry-board';
import { consultationDisplayText } from '../consultations/-consultation-list-model';

// ── Route ───────────────────────────────────────────────────────

type SitesSearch = { siteId?: string; dong?: string; ho?: string };

const optionalSearchText = (value: unknown) =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : undefined;

export const Route = createFileRoute('/_authenticated/sites/')({
  // 전체 검색 등에서 /sites?siteId=<Site.id>로 오면 그 관리단지를 연다(없으면 첫 단지).
  // &dong=102&ho=3302를 같이 주면 그 동을 고르고 호수 칸에 3302를 넣는다("102동 3302호" 검색).
  validateSearch: (search: Record<string, unknown>): SitesSearch => ({
    siteId: optionalSearchText(search.siteId),
    dong: optionalSearchText(search.dong),
    ho: optionalSearchText(search.ho)?.replace(/\D/g, '') || undefined,
  }),
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

const UNIT_RELATIONSHIP_COLUMN_IDS = ['tenantName', 'tenantPhone', 'listing'] as const;
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
    // 매물관리 표 머리(TableHeaderLabel)와 같은 모양: 13px 보통 굵기, 16px 아이콘
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px] text-inherit">
      <span className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

/*
 * 호수 표 칸 글자. 매물관리 표와 같은 규격이다 (본문 14px, 줄 높이 21px).
 * 굵기와 색은 표가 칸에 준 값(450 · 본문색)을 그대로 받고, 달라야 할 때만 적는다.
 */
/** 행을 알아보는 값 (동 · 호 · 이름) */
const unitCellStrong = 'truncate text-[14px] font-medium leading-[21px] text-foreground';
/** 숫자 · 날짜 */
const unitCellNumber = 'whitespace-nowrap text-[14px] leading-[21px] tabular-nums text-foreground';
/** 이름 옆에 붙는 보조 값 (전화번호 · 날짜) */
const unitCellSub = 'whitespace-nowrap text-[14px] leading-[21px] tabular-nums text-muted-foreground';
/** "외 2명" · "+1" 같은 개수 꼬리표 */
const unitCountChip =
  'inline-flex h-5 shrink-0 items-center rounded-[4px] bg-neutral-soft px-1.5 text-[12px] leading-5 text-muted-foreground';

/** 호 이름 순서. 호 없이 층이 단위인 공간은 층 표기로 견준다 */
function compareUnitNames(a: Unit, b: Unit) {
  return formatUnitName(a).localeCompare(formatUnitName(b), 'ko', { numeric: true });
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



function SitesPage() {
  const queryClient = useQueryClient();
  const {
    siteId: requestedSiteId,
    dong: requestedDong,
    ho: requestedHo,
  } = Route.useSearch();
  // 주소로 받은 동·호는 그 단지의 동 목록을 받은 뒤에 적용한다
  const pendingPlaceRef = useRef<{ siteId: string; dong?: string; ho?: string } | null>(
    requestedSiteId && (requestedDong || requestedHo)
      ? { siteId: requestedSiteId, dong: requestedDong, ho: requestedHo }
      : null,
  );

  // ── 관리단지 사이드바 (단지 버튼으로 열고 닫음) ───────────────
  const [isSitesPanelOpen, setIsSitesPanelOpen] = useState(readStoredPanelOpen);
  const [sitesPanelWidth, setSitesPanelWidth] = useState(readStoredPanelWidth);
  const [removeTarget, setRemoveTarget] = useState<OfficeSite | null>(null);

  // ── Selection state ───────────────────────────────────────────
  const [selectedOfficeSite, setSelectedOfficeSite] = useState<OfficeSite | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [dongScope, setDongScope] = useState<DongScope | null>(null);
  const [selectedUnitTypeIds, setSelectedUnitTypeIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  // 호수만 찾는 칸. 숫자만 받고, 호 이름의 숫자와 앞부분이 같은 호실을 남긴다.
  const [unitNo, setUnitNo] = useState('');
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

  // ── Refs (키보드 단축키) ──────────────────────────────────────
  const unitSearchRef = useRef<HTMLInputElement>(null);
  const buildingSearchRef = useRef<HTMLInputElement>(null);
  const sitesPanelToggleRef = useRef<HTMLButtonElement>(null);
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
    const requested = requestedSiteId
      ? officeSites.find((officeSite) => officeSite.siteId === requestedSiteId)
      : undefined;
    setSelectedOfficeSite((current) => requested ?? current ?? firstOfficeSite);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 첫 선택에만 주소의 단지를 쓴다(아래 효과가 이후 변경을 맡는다)
  }, [isListError, isLoadingList, officeSites]);

  // 이 화면에 있는 동안 주소의 단지·동·호가 바뀌면(전체 검색에서 다시 고름) 그리로 옮긴다
  const requestedPlaceKey = [requestedSiteId, requestedDong, requestedHo].join('|');
  const lastRequestedPlaceKey = useRef(requestedPlaceKey);
  useEffect(() => {
    if (lastRequestedPlaceKey.current === requestedPlaceKey) return;
    lastRequestedPlaceKey.current = requestedPlaceKey;
    if (!requestedSiteId) return;
    const requested = officeSites.find((officeSite) => officeSite.siteId === requestedSiteId);
    if (!requested) return;
    pendingPlaceRef.current =
      requestedDong || requestedHo
        ? { siteId: requestedSiteId, dong: requestedDong, ho: requestedHo }
        : null;
    if (requested.id !== selectedOfficeSite?.id) {
      handleSelectSite(requested);
    } else if (siteDetail?.id === requestedSiteId) {
      applyRequestedPlace(siteDetail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 주소가 바뀔 때만 반응한다
  }, [requestedPlaceKey, officeSites]);

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

  /** 주소로 받은 동·호를 적용한다. 동은 "102"·"102동" 어느 쪽으로 와도 이름으로 찾는다 */
  function applyRequestedPlace(detail: { id: string; dongs: Dong[] }) {
    const pending = pendingPlaceRef.current;
    if (!pending || pending.siteId !== detail.id) return;
    pendingPlaceRef.current = null;
    if (pending.dong) {
      const wanted = pending.dong.replace(/동$/, '').toLowerCase();
      const dong = detail.dongs.find(
        (item) => !item.isPlaceholder && item.name.replace(/동$/, '').toLowerCase() === wanted,
      );
      if (dong) setDongScope({ siteId: detail.id, dongIds: [dong.id] });
    }
    if (pending.ho) setUnitNo(pending.ho);
  }
  useEffect(() => {
    // 기본 동 범위를 정하는 위 효과 뒤에 돌아 그 값을 덮는다
    if (siteDetail) applyRequestedPlace(siteDetail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 단지 정보를 받았을 때만
  }, [siteDetail]);

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
        setUnitNo('');
        setUnitSort([]);
        setOccupancyFilter([]);
      }
      setRemoveTarget(null);
      toast.success('관리단지에서 제거했습니다');
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '관리단지에서 제거하지 못했습니다. 다시 시도해 주세요.'));
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
        apiErrorMessage(error, '고정을 바꾸지 못했습니다. 다시 시도해 주세요.'),
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
      toast.error(apiErrorMessage(error, '동을 추가하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const dongs: DongWithUnitCount[] = siteDetail?.dongs ?? [];
  const allUnits: Unit[] = usesOverviewUnits ? (siteDetail?.units ?? []) : (scopedUnits ?? []);

  // ── Derived data ──────────────────────────────────────────────

  // 고정(즐겨찾기)한 단지를 먼저 — 서버가 내려준 순서는 그 안에서 유지
  const orderedOfficeSites = useMemo(
    () => prioritizeFavoriteOfficeSites(officeSites),
    [officeSites],
  );

  // 동 구분 없는 건물의 가짜 동(이름 '-')은 이름을 붙이지 않는다 — "- 201호"가 되지 않게
  const getDongName = useCallback(
    (dongId: string | null) => {
      const dong = dongs.find((d) => d.id === dongId);
      return dong && !dong.isPlaceholder ? dong.name : '';
    },
    [dongs],
  );
  /** 화면 글에 쓰는 집 이름: "101동 3401호", withSite면 "고덕그라시움 101동 3401호" (STANDARDS: formatPlaceLabel) */
  const currentSiteName = siteDetail?.name ?? selectedOfficeSite?.site?.name ?? '';
  const getPlaceLabel = useCallback(
    (unit: Unit, withSite = false) => {
      const dong = dongs.find((d) => d.id === unit.dongId);
      return formatPlaceLabel({
        siteName: withSite ? currentSiteName : undefined,
        dongName: dong?.name,
        dongIsPlaceholder: dong?.isPlaceholder,
        unit,
      });
    },
    [currentSiteName, dongs],
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
    unitNo.length > 0 ||
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

    if (unitNo) {
      // "34" → 3401·3402…, "3401" → 3401호. 호 이름에서 숫자만 뽑아 앞부분을 비교한다.
      units = units.filter((unit) =>
        (unit.name ?? '').replace(/\D/g, '').startsWith(unitNo),
      );
    }

    const q = query.trim().toLowerCase();
    if (q) {
      // 호수는 옆의 호수 칸이 따로 찾으므로 여기서는 사람·전화·상담만 본다.
      units = units.filter((unit) => {
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
      return compareUnitSpaces(a, b);
    };

    const activeSort = unitSort[0];
    if (!activeSort) {
      return units.sort(defaultSort);
    }

    const getOwnerName = (unit: Unit) =>
      getUnitOwnerContacts(unit)[0]?.contact.name ?? '';

    const getOwnerPhone = (unit: Unit) =>
      getUnitOwnerContacts(unit)[0]?.contact.phone ?? '';

    const getPrimaryTenant = (unit: Unit) =>
      (unit.properties ?? []).flatMap((property) => property.tenants ?? [])[0];
    const getTenantName = (unit: Unit) => getPrimaryTenant(unit)?.contact.name ?? '';
    const getTenantPhone = (unit: Unit) => getPrimaryTenant(unit)?.contact.phone ?? '';

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
      name: (a, b) => compareUnitNames(a, b),
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
      tenantName: (a, b) => getTenantName(a).localeCompare(getTenantName(b), 'ko', { numeric: true }),
      tenantPhone: (a, b) => getTenantPhone(a).localeCompare(getTenantPhone(b), 'ko', { numeric: true }),
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
    unitNo,
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
  // 호수 칸도 검색으로 친다: 관리호수 범위에서도 전체 호실에서 찾는다.
  const isSearchingUnits = query.trim().length > 0 || unitNo.length > 0;
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
  const canEditStructure = !!siteDetail && canEditSiteStructure(siteDetail);
  // 호실이 하나도 없는 건물: 표 대신 다음에 할 일을 보여 준다(토지는 호실 없이 매물로 다룬다)
  const siteHasNoUnits =
    !!siteDetail && (siteDetail.type === 'land' || siteDetail._count?.units === 0);
  const usesWholeBuilding = siteDetail?.type === 'house' || siteDetail?.type === 'commercial';
  const newListingForSite = selectedSiteId ? { siteId: selectedSiteId } : {};
  const structureEmptyState =
    siteDetail?.type === 'land' && selectedSiteId ? (
      <LandSiteProperties siteId={selectedSiteId} />
    ) : (
      <EmptyState
        icon={Building2}
        title="아직 등록된 호수가 없습니다"
        description={
          !canEditStructure
            ? undefined
            : usesWholeBuilding
              ? '호실을 나눠 관리하려면 호수를 추가하세요. 건물 전체를 내놓는 의뢰는 호수 없이 바로 매물 등록을 하면 됩니다.'
              : '호수를 추가하면 소유자·세입자·상담을 호실마다 관리할 수 있습니다. 여러 호를 한 번에 넣을 수 있습니다. 내놓은 집이 있으면 매물 등록에서 호를 바로 적어도 됩니다.'
        }
        action={
          canEditStructure ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => setShowAddUnitDialog(true)}>
                <Plus className="size-3.5" />
                호수 추가
              </Button>
              {/* 전화로 집이 들어온 참이면 호수를 먼저 만들지 않고 바로 등록한다(등록 화면에서 호를 적는다) */}
              <Button size="sm" variant="outline" asChild>
                <Link to="/properties/new" search={newListingForSite}>
                  매물 등록
                </Link>
              </Button>
              {!usesWholeBuilding && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNewDongName('');
                    setShowAddDongDialog(true);
                  }}
                >
                  동 추가
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
    );

  const unitTableEmptyMessage = showsManagedUnitsOnly
    ? hasActiveUnitContentFilters
      ? '조건에 맞는 관리호수가 없습니다'
      : siteDetail?._count?.units === 0
        ? // 호수가 아직 없으면 고를 ‘전체’도 비어 있다. 직접 등록한 단지만 호수를 추가할 수 있다
          '아직 등록된 호수가 없습니다.'
        : (
          <span className="flex flex-col items-center gap-2 py-2 text-center">
            <span>이 범위에 관리호수가 없습니다. 전체 호수에서 골라 관리호수로 등록하세요.</span>
            <Button
              size="sm"
              variant="outline"
              className="h-[30px] rounded-[8px] px-3"
              onClick={() => setUnitTableScope('all')}
            >
              전체 호수 보기
            </Button>
          </span>
        )
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
      const sectionLabel = hasRealDongs
        ? formatDongLabel(getDongName(unit.dongId)) || '미지정 동'
        : '전체';

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
          unpositionedUnits: section.unpositionedUnits.sort(compareUnitNames),
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
    setUnitNo('');
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
  };

  const handleDongScopeChange = (dongIds: string[]) => {
    if (!selectedSiteId) return;
    setDongScope({ siteId: selectedSiteId, dongIds });
    setSelectedUnitId(null);
    setSelectedUnitTypeIds([]);
    setQuery('');
    setUnitNo('');
    setOccupancyFilter([]);
    setOwnerFilter('all');
    setTenantFilter('all');
    setListingFilter('all');
    setConsultationFilter('all');
  };

  // 호실 상세 패널은 매물관리와 같은 방식으로 열고 닫는다: 닫을 때는 미끄러져 나간 뒤에 선택을 지운다.
  const [isUnitInspectorClosing, setIsUnitInspectorClosing] = useState(false);
  const [unitInspectorMotion, setUnitInspectorMotion] = useState(true);
  const handleSelectUnit = useCallback((unit: Unit) => {
    setUnitInspectorMotion(!document.activeElement?.matches(':focus-visible'));
    setIsUnitInspectorClosing(false);
    setSelectedUnitId(unit.id);
  }, []);
  const closeUnitInspector = useCallback((animate = true) => {
    setUnitInspectorMotion(animate);
    setIsUnitInspectorClosing(true);
  }, []);
  const finishClosingUnitInspector = useCallback(() => {
    setSelectedUnitId(null);
    setIsUnitInspectorClosing(false);
  }, []);
  // 닫히는 중인 호실은 표·배치도에서 선택 표시를 바로 뺀다
  const openUnitId = isUnitInspectorClosing ? null : selectedUnitId;

  const handleAddDong = () => {
    if (!newDongName.trim() || !selectedSiteId) return;
    addDongMutation.mutate({ siteId: selectedSiteId, name: newDongName.trim() });
  };

  // 방금 넣은 호수는 아직 관리호수가 아니라 '관리호수' 범위에서는 안 보인다 — 전체로 바꿔 바로 보이게 한다
  const handleUnitsAdded = (units: Unit[]) => {
    if (unitTableScope === 'managed') setUnitTableScope('all');
    const first = units[0];
    if (!first || !selectedSiteId) return;
    if (selectedDongIds.length > 0 && !selectedDongIds.includes(first.dongId)) {
      setDongScope({ siteId: selectedSiteId, dongIds: [first.dongId] });
    }
    // 한 호만 넣었으면 그 호를 열어 관리호수 등록·소유자 연결로 바로 이어 간다
    if (units.length === 1) handleSelectUnit(first);
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
    setUnitNo('');
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
            <span className={cn(unitCellStrong, 'block tabular-nums')}>
              {getDongName(row.original.dongId) || ''}
            </span>
          ),
        } satisfies ColumnDef<Unit>]
      : []),
    {
      id: 'name',
      header: () => <UnitTableHeaderLabel icon={<Hash />} label="호" />,
      // 행에 올리면 뜨는 열기 버튼이 호수를 가리지 않을 만큼
      size: 116,
      enableSorting: true,
      cell: ({ row }) => {
        const unit = row.original;
        return (
          <>
            <span className={cn(unitCellStrong, 'block tabular-nums')}>{formatUnitName(unit)}</span>
            {/* 매물관리 표와 같은 열기 버튼: 옆 상세 패널을 열고, 열려 있으면 닫는다 */}
            <RowOpenButton
              label={getPlaceLabel(unit)}
              current={openUnitId === unit.id}
              controls="unit-inspector"
              onToggle={() =>
                openUnitId === unit.id ? closeUnitInspector() : handleSelectUnit(unit)
              }
            />
          </>
        );
      },
    },
    {
      id: 'supplyArea',
      header: () => <UnitTableHeaderLabel icon={<Ruler />} label="공급" />,
      size: 74,
      enableSorting: true,
      cell: ({ row }) => {
        const unit = row.original;
        const m2 = unit.supplyAreaM2 ?? unit.siteUnitType?.supplyAreaM2;
        if (!m2) return <UnitTableEmptyCell />;
        return <span className={unitCellNumber}>{formatPyeong(m2)}</span>;
      },
    },
    {
      id: 'exclusiveArea',
      header: () => <UnitTableHeaderLabel icon={<Ruler />} label="전용" />,
      size: 74,
      enableSorting: true,
      cell: ({ row }) => {
        const unit = row.original;
        const m2 = unit.exclusiveAreaM2 ?? unit.siteUnitType?.exclusiveAreaM2;
        if (!m2) return <UnitTableEmptyCell />;
        return <span className={unitCellNumber}>{formatPyeong(m2)}</span>;
      },
    },
    {
      id: 'unitType',
      header: () => <UnitTableHeaderLabel icon={<Type />} label="타입" />,
      size: 74,
      enableSorting: true,
      cell: ({ row }) => {
        const typeName = row.original.siteUnitType?.name;
        return typeName ? (
          <span className="block truncate text-[14px] leading-[21px] text-foreground">
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
      size: 128,
      minSize: 112,
      enableSorting: true,
      cell: ({ row }) => {
        const owners = getUnitOwnerContacts(row.original);
        const primaryOwner = owners[0];
        if (!primaryOwner) return <UnitTableEmptyCell />;
        const ownerNames = owners.map(({ contact }) => contact.name).join('\n');
        return (
          <div className="flex min-w-0 items-center gap-1.5" title={owners.length > 1 ? ownerNames : undefined}>
            <span className="flex min-w-0 text-[14px] leading-[21px] text-foreground">
              <ContactNameChip
                contactId={primaryOwner.contact.id}
                name={primaryOwner.contact.name}
              />
            </span>
            {owners.length > 1 && (
              <span className={unitCountChip}>
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
      size: 144,
      minSize: 124,
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
            className={cn(unitCellNumber, 'block min-w-0 truncate')}
            title={phoneSummary}
          >
            {formatPhone(phone)}
          </span>
        );
      },
    },
    // 소유자와 같은 방식으로 이름과 전화번호를 따로 둔다 — 한 칸에 섞으면 전화번호로 정렬할 수 없다
    {
      id: 'tenantName',
      header: () => <UnitTableHeaderLabel icon={<Users />} label="세입자명" />,
      size: 128,
      minSize: 112,
      enableSorting: true,
      cell: ({ row }) => {
        const tenants = (row.original.properties ?? []).flatMap(
          (property) => property.tenants ?? [],
        );
        const primary = tenants[0];
        if (!primary) return <UnitTableEmptyCell />;
        const tenantNames = tenants.map(({ contact }) => contact.name).join('\n');
        return (
          <div className="flex min-w-0 items-center gap-1.5" title={tenants.length > 1 ? tenantNames : undefined}>
            <span className="flex min-w-0 text-[14px] leading-[21px] text-foreground">
              <ContactNameChip contactId={primary.contact.id} name={primary.contact.name} />
            </span>
            {tenants.length > 1 && (
              <span className={unitCountChip}>
                외 {tenants.length - 1}명
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'tenantPhone',
      header: () => (
        <UnitTableHeaderLabel icon={<Phone />} label="세입자 전화번호" />
      ),
      size: 144,
      minSize: 124,
      enableSorting: true,
      cell: ({ row }) => {
        const tenants = (row.original.properties ?? []).flatMap(
          (property) => property.tenants ?? [],
        );
        const phone = tenants[0]?.contact.phone;
        if (!phone) return <UnitTableEmptyCell />;
        const phoneSummary = tenants
          .flatMap(({ contact }) =>
            contact.phone ? [`${contact.name} ${formatPhone(contact.phone)}`] : [],
          )
          .join('\n');
        return (
          <span
            className={cn(unitCellNumber, 'block min-w-0 truncate')}
            title={phoneSummary}
          >
            {formatPhone(phone)}
          </span>
        );
      },
    },
    {
      id: 'listing',
      header: () => <UnitTableHeaderLabel icon={<Tag />} label="등록 매물" />,
      size: 184,
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
          className: 'bg-neutral-soft text-muted-foreground',
        };
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {/* 매물관리 표의 거래 꼬리표와 같은 크기 */}
            <span
              className={cn(
                'inline-flex h-5 shrink-0 items-center rounded-[4px] px-1.5 text-[14px] font-[450] leading-5',
                transactionMeta.className,
              )}
            >
              {transactionMeta.label}
            </span>
            <span
              className={cn(unitCellNumber, 'min-w-0 truncate')}
              title={formatListingPrice(primary)}
            >
              {formatListingPrice(primary)}
            </span>
            {listings.length > 1 && (
              <span className={unitCountChip}>
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
      size: 300,
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
        // 누구와의 상담인지는 소유자·세입자 칸에 이미 있다. 여기서는 어떤 상담이었는지만 아이콘으로 알린다.
        const TypeIcon = consultationChannelIcons[latest.type as keyof typeof consultationChannelIcons]
          ?? consultationChannelIcons.other;
        const typeLabel = consultationTypeLabels[latest.type] ?? latest.type;
        return (
          <div
            className="flex min-w-0 items-center gap-1.5"
            title={`${typeLabel} · ${latest.contact.name}\n${consultationDisplayText(latest.content)}`}
          >
            <TypeIcon
              className="size-4 shrink-0 text-sidebar-icon"
              role="img"
              aria-label={`${typeLabel} 상담`}
            />
            <span className="truncate text-[14px] leading-[21px] text-foreground">
              {/* "[매물확인] 살아있음" 같은 꼬리표는 화면 낱말로("매물 확인 · 유효함") */}
              {consultationDisplayText(latest.content)}
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
      size: 108,
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
        // 상담 날짜는 앱 공용 표기(오늘·어제·11.19 (목))를 쓴다 — 상담분석·연락처 목록과 같게
        return <span className={unitCellSub}>{formatRelativeDay(latest.createdAt)}</span>;
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
  }, [
    areUnitRelationshipColumnsCollapsed,
    closeUnitInspector,
    dongs,
    getDongName,
    getPlaceLabel,
    handleSelectUnit,
    openUnitId,
  ]);

  const unitTableResetKey = [
    selectedSiteId,
    selectedDongIds.join(','),
    unitTableScope,
    selectedUnitTypeIds.join(','),
    ownerFilter,
    tenantFilter,
    listingFilter,
    consultationFilter,
    query.trim(),
    unitNo,
  ].join('|');

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
    <div className="@container/sites-page relative -m-4 flex min-h-0 flex-1">
      {/* ─── 관리단지 사이드바 (단지 버튼으로 연다) ─────────────── */}
      <SitesPanel
        open={isSitesPanelOpen}
        width={sitesPanelWidth}
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
                    : '우리 사무소가 다루는 아파트·빌라·상가·주택을 찾아 추가하세요. 검색에 없는 건물은 주소로 직접 등록합니다.'
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
              unitNo={unitNo}
              // 숫자만 받는다 (붙여넣은 "3401호"도 3401로)
              onUnitNoChange={(value) => setUnitNo(value.replace(/\D/g, ''))}
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
                shape="muted"
                ariaLabel="단지 보기 방식"
                value={unitViewMode}
                onChange={setUnitViewMode}
                options={[
                  { value: 'table', label: '호수 목록', icon: <List /> },
                  { value: 'layout', label: '배치표', icon: <LayoutGrid /> },
                  { value: 'occupancy', label: '점유상태', icon: <House /> },
                  { value: 'expiry', label: '만기', icon: <CalendarClock /> },
                ]}
              />
            </div>
          </section>

          {/* 2차 필터: 호수별 CRM 등록 상태 — 매물관리 툴바 2행과 같은 칩.
              표와의 사이에는 선을 두지 않는다(표 머리 윗선이 나눈다). */}
          <section
            className={cn(
              'flex shrink-0 items-center gap-2 bg-white px-3 pt-2',
              // 표 보기에서는 표가 위에 8px(접기 버튼이 걸치는 자리)을 따로 비우므로
              // 여기 아래 여백을 빼서 필터 줄과 표 사이가 벌어지지 않게 한다(매물관리와 같다).
              unitViewMode === 'table' ? 'min-h-[38px] pb-0' : 'min-h-[44px] pb-1.5',
            )}
          >
            {/* 칩이 많아 한 줄을 넘치면 옆으로 숨기지 않고 다음 줄로 내린다 — 설정한 필터가 가려지지 않게 */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {unitViewMode === 'table' && (
                <>
                  <ToolbarPillTabs
                    shape="muted"
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
                  shape="soft"
                  icon={<Type />}
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
                icon={<User />}
                label="소유자"
                value={ownerFilter}
                onChange={setOwnerFilter}
                options={registeredPresenceOptions}
              />
              <RecordFilterChip
                icon={<Tag />}
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
                    shape="soft"
                    icon={item.icon}
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
                shape="soft"
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
                  className={cn(toolbarGhostButtonClassName, 'rounded-full')}
                  onClick={resetUnitFilters}
                >
                  <RotateCcw className="size-3.5" />
                  초기화
                </button>
              )}
              {/* 직접 등록한 건물만 동·호수를 넣을 수 있다. 사이드바 ⋯ 메뉴에도 있지만 여기서 바로 보이게 둔다 */}
              {canEditStructure && (
                <>
                  <button
                    type="button"
                    className={cn(toolbarGhostButtonClassName, 'rounded-full')}
                    onClick={() => {
                      setNewDongName('');
                      setShowAddDongDialog(true);
                    }}
                  >
                    <Plus className="size-3.5" />
                    동 추가
                  </button>
                  <button
                    type="button"
                    className={cn(toolbarGhostButtonClassName, 'rounded-full')}
                    onClick={() => setShowAddUnitDialog(true)}
                  >
                    <Plus className="size-3.5" />
                    호수 추가
                  </button>
                </>
              )}
            </div>
          </section>

          {/* 호실 없이 건물 전체로 관리하는 매물 (단독·상가건물) */}
          {selectedSiteId && siteDetail.type !== 'land' && (
            <WholeBuildingPropertiesStrip siteId={selectedSiteId} siteType={siteDetail.type} />
          )}

          {/* Units View */}
          <div className="flex-1 min-h-0 overflow-hidden">
              {siteHasNoUnits ? (
                <div className="flex h-full items-center justify-center p-4">
                  {structureEmptyState}
                </div>
              ) : isLoadingUnits ? (
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
                  // 매물관리 표와 같은 조작: 한 번 누르면 칸을 고르고(아래 줄에 소유자가 보인다),
                  // 두 번 누르기 · Enter · 열기 버튼으로 호실 상세를 연다.
                  activateOnDoubleClick
                  getRowSelectionLabel={(unit) =>
                    `${getPlaceLabel(unit)} 선택`
                  }
                  layout="full-height"
                  variant="notion"
                  propertyListTone
                  rowHeight={37}
                  // 범위 · 필터 · 검색이 바뀌면 표를 맨 위로 올린다
                  scrollResetKey={unitTableResetKey}
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
                  const focusedOwners = getUnitOwnerContacts(focusedRow);
                  const owner = focusedOwners[0]?.contact;
                    return (
                      <>
                        <span className="tabular-nums text-foreground/80">
                          호수 {totalCount.toLocaleString()}건
                        </span>
                        <span className="text-border">|</span>
                        <span className="font-medium text-foreground">
                          {getPlaceLabel(focusedRow, true)}
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
                  selectedUnitId={openUnitId}
                  onUnitOpen={handleSelectUnit}
                  colorMode="activity"
                />
              ) : unitViewMode === 'occupancy' ? (
                <UnitLayoutBoard
                  sections={layoutSections}
                  selectedUnitId={openUnitId}
                  onUnitOpen={handleSelectUnit}
                  colorMode="occupancy"
                  occupancyFilter={occupancyFilter}
                  onOccupancyFilterChange={setOccupancyFilter}
                />
              ) : (
                <ExpiryBoard
                  units={filteredUnits}
                  getPlaceLabel={getPlaceLabel}
                  onUnitOpen={handleSelectUnit}
                />
              )}
          </div>
        </div>
      ) : null}

      {/* ─── 호실 상세 패널 ─────────────────────────────────── */}
      {selectedUnit && siteDetail ? (
        <UnitDetailPanel
          unit={selectedUnit}
          site={siteDetail}
          dongs={dongs}
          closing={isUnitInspectorClosing}
          animate={unitInspectorMotion}
          onClose={closeUnitInspector}
          onExited={finishClosingUnitInspector}
        />
      ) : null}

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
      <AddUnitDialog
        open={showAddUnitDialog}
        onOpenChange={setShowAddUnitDialog}
        siteId={selectedSiteId}
        siteName={siteDetail?.name ?? selectedOfficeSite?.site?.name ?? ''}
        isSiteReady={!!siteDetail}
        isSiteError={isDetailError}
        onRetrySite={() => refetchDetail()}
        dongs={dongs}
        defaultDongId={selectedDongIds.length === 1 ? selectedDongIds[0] : undefined}
        onAdded={handleUnitsAdded}
      />
    </div>
  );
}
