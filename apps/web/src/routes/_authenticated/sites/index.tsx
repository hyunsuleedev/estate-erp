import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  MapPin,
  LayoutList,
  FolderTree,
  PanelLeftIcon,
  LayoutGrid,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Users,
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
import { formatArea, formatDate, formatPhone } from '@/lib/format';
import {
  extractRegionFromSite,
  formatListingPrice,
  parseUnitPlacement,
  siteTypeLabels,
  siteTypeShort,
  type LayoutSection,
  type MultiSelectOption,
  type OccupancyStatus,
  type PositionedUnit,
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

function SitesPage() {
  const queryClient = useQueryClient();

  // ── Sidebar state ─────────────────────────────────────────────
  const [buildingSearch, setBuildingSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'region' | 'type'>('none');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isSiteNavOpen, setIsSiteNavOpen] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<OfficeSite | null>(null);

  // ── Selection state ───────────────────────────────────────────
  const [selectedOfficeSite, setSelectedOfficeSite] = useState<OfficeSite | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedDongIds, setSelectedDongIds] = useState<string[]>([]);
  const [selectedUnitTypeIds, setSelectedUnitTypeIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [unitSort, setUnitSort] = useState<SortingState>([]);
  const [unitViewMode, setUnitViewMode] = useState<UnitViewMode>('table');
  const [occupancyFilter, setOccupancyFilter] = useState<OccupancyStatus[]>([]);

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

  const selectedSiteId = selectedOfficeSite?.siteId;

  const {
    data: siteDetail,
    isLoading: isLoadingDetail,
    isError: isDetailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['sites', selectedSiteId],
    queryFn: () => api.sites.findOne(selectedSiteId!),
    enabled: !!selectedSiteId,
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
        setSelectedOfficeSite(null);
        setSelectedUnitId(null);
      }
      setRemoveTarget(null);
      toast.success('관리단지에서 제거했습니다');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '관리단지 제거에 실패했습니다');
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

  const dongs: Dong[] = siteDetail?.dongs ?? [];
  const allUnits: Unit[] = siteDetail?.units ?? [];

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
          ? extractRegionFromSite(site)
          : (siteTypeLabels[site.type] ?? site.type);
      if (!groups[key]) groups[key] = [];
      groups[key].push(os);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [filteredSites, groupBy]);

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
  }, [allUnits, query, selectedDongIds, selectedUnitTypeIds, unitSort, getDongName]);

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
  }, [dongs, filteredUnits, getDongName]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleSelectSite = (os: OfficeSite) => {
    setSelectedOfficeSite(os);
    setSelectedUnitId(null);
    setSelectedDongIds([]);
    setSelectedUnitTypeIds([]);
    setQuery('');
    setUnitSort([]);
    setOccupancyFilter([]);
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
    setSelectedDongIds([]);
    setSelectedUnitTypeIds([]);
    setQuery('');
    setOccupancyFilter([]);
  };

  // ── Render helpers ────────────────────────────────────────────

  const unitColumns: ColumnDef<Unit>[] = useMemo(() => [
    ...(dongs.some((dong) => !dong.isPlaceholder)
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
      size: 120,
      enableSorting: true,
      cell: ({ row }) => {
        const unit = row.original;
        const m2 = unit.supplyAreaM2 ?? unit.siteUnitType?.supplyAreaM2;
        if (!m2) return <span className="text-[13px] text-muted-foreground">-</span>;
        return <span className="text-[13px] tabular-nums">{formatArea(m2)}</span>;
      },
    },
    {
      id: 'exclusiveArea',
      header: '전용',
      size: 120,
      enableSorting: true,
      cell: ({ row }) => {
        const unit = row.original;
        const m2 = unit.exclusiveAreaM2 ?? unit.siteUnitType?.exclusiveAreaM2;
        if (!m2) return <span className="text-[13px] text-muted-foreground">-</span>;
        return <span className="text-[13px] tabular-nums">{formatArea(m2)}</span>;
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
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                {formatPhone(contact.phone)}
              </span>
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
              <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                {formatPhone(primary.contact.phone)}
              </span>
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
              {primary.transactionType === 'sale'
                ? '매매'
                : primary.transactionType === 'jeonse'
                  ? '전세'
                  : primary.transactionType === 'monthly'
                    ? '월세'
                    : primary.transactionType === 'yearly_rent'
                      ? '연세'
                      : primary.transactionType}
            </Badge>
            <span className="truncate text-[13px] tabular-nums">
              {formatListingPrice(primary)}
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
      size: 240,
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
      size: 100,
      enableSorting: true,
      cell: ({ row }) => {
        const latest = (row.original.properties ?? [])
          .flatMap((property) => property.consultations ?? [])
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (!latest) return <span className="text-[13px] text-muted-foreground">-</span>;
        return (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {formatDate(latest.createdAt)}
          </span>
        );
      },
    },
  ], [dongs, getDongName]);

  const unitPinnedColumns = useMemo(
    () => (dongs.some((dong) => !dong.isPlaceholder) ? ['dong', 'name'] : ['name']),
    [dongs],
  );

  const renderSiteItem = (os: OfficeSite) => {
    const site = os.site;
    if (!site) return null;
    const isActive = selectedOfficeSite?.id === os.id;
    return (
      <div
        key={os.id}
        className={cn(
          'group flex items-center gap-1.5 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors',
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label="단지 메뉴"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
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

  const siteNavToggleLabel = isSiteNavOpen ? '건물명 리스트 접기' : '건물명 리스트 펼치기';
  const canManageUnits = !!siteDetail && siteDetail.type !== 'land';

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
                ref={buildingSearchRef}
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
            ) : isListError ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <p className="text-xs text-muted-foreground">관리단지 목록을 불러오지 못했습니다</p>
                <Button variant="outline" size="sm" onClick={() => refetchList()}>
                  <RotateCcw className="size-3.5" />
                  다시 시도
                </Button>
              </div>
            ) : groupBy === 'none' ? (
              <div className="p-1.5 space-y-0.5">
                {filteredSites.length === 0 ? (
                  buildingSearch ? (
                    <div className="py-8 text-xs text-muted-foreground text-center">
                      검색 결과가 없습니다
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
                  )
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

      {/* ─── Main area ───────────────────────────────────────── */}
      {!selectedOfficeSite ? (
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
            <EmptyState
              icon={Building2}
              title="단지를 선택하세요"
              description="왼쪽에서 관리 단지를 선택하면 호수 목록이 표시됩니다"
            />
          </div>
        </div>
      ) : isLoadingDetail ? (
        /* ── Detail loading ────────────────────────────────────── */
        <div className="flex-1 flex flex-col min-w-0 min-h-0 p-4 overflow-hidden">
          <div className="rounded-xl border border-border/60 bg-background flex-1 flex flex-col min-h-0">
            <div className="border-b border-border/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="h-7 w-24 rounded-md" />
                <Skeleton className="h-7 w-24 rounded-md" />
                <Skeleton className="ml-auto h-7 w-48 rounded-md" />
              </div>
            </div>
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-md" />
              ))}
            </div>
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
                    ref={unitSearchRef}
                    placeholder="호수 · 이름 · 전화 · 상담내용 검색 (/)"
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

                {/* 동/호수 추가 (토지는 호실 구조 없음) */}
                {canManageUnits && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
                        <Plus className="size-3.5" />
                        추가
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

                <div className="ml-0 flex items-center rounded-md border border-border/60 bg-background p-0.5">
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
                  <Button
                    variant={unitViewMode === 'occupancy' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => setUnitViewMode('occupancy')}
                  >
                    <Users className="size-3.5" />
                    점유상태
                  </Button>
                  <Button
                    variant={unitViewMode === 'expiry' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => setUnitViewMode('expiry')}
                  >
                    <CalendarClock className="size-3.5" />
                    만기/변동
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
                              <span className="tabular-nums text-foreground/70">
                                {formatPhone(owner.phone)}
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
