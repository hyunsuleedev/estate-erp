/**
 * 호실 상세 패널 — 개요/소유자·세입자/상담 기록/등기 문서 탭 + 다음 업무, 아래 막대의 바로 하는 일.
 * 매물관리의 상세 패널과 같은 방식으로 페이지 오른쪽에 열린다 (화면을 덮는 창이 아니다).
 */
import { formatPlaceLabel, formatUnitName } from '@estate-erp/shared';
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  useRef,
} from 'react';
import { useInspectorFocus } from '@/hooks/use-inspector-focus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { toast } from 'sonner';
import {
  ChevronRight,
  ExternalLink,
  FileText,
  Home,
  Layers,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Ruler,
  ScrollText,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import type { Dong, SiteDetail, Unit } from '@estate-erp/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ConfirmDialog,
  EntityChip,
  StatusBadge,
  InspectorTabs,
  inspectorTabIds,
  type InspectorTabItem,
} from '@/components/domain';
import { cn } from '@/lib/utils';
import { formatArea, formatDate, formatDday, formatPhone, formatRelativeDayTime } from '@/lib/format';
import {
  canEditSiteStructure,
  consultationTypeLabels,
  formatListingPrice,
  getUnitOccupancy,
  OCCUPANCY_META,
  siteTypeLabels,
  tenantStatusLabels,
} from './-site-helpers';
import {
  EmptyText,
  PropertyInspectorToolbar,
  RetryNote,
  SectionTitle,
  TextAction,
} from '../properties/-components/property-inspector-view';
import { UnitConsultDialog, UnitEditDialog } from './-unit-dialogs';
import {
  PropertyContactAddDialog,
  TenantAddDialog,
} from '../properties/-property-detail-dialogs';
import { UnitTasksSection } from './-unit-tasks-section';
import { consultationDisplayText } from '../consultations/-consultation-list-model';
import { getListingAvailability } from "@/lib/listing-status";
import { useInspectorOutsideClose } from "@/hooks/use-inspector-outside-close";

const DOC_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '발급중', className: 'bg-warning-soft text-warning' },
  completed: { label: '발급완료', className: 'bg-success-soft text-success' },
  failed: { label: '실패', className: 'bg-destructive-soft text-destructive' },
};

const REGISTRY_COST = 700;

export const UNIT_INSPECTOR_WIDTH = 584;

/** Esc가 패널이 아니라 떠 있는 대화상자·메뉴를 닫아야 하는 경우 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

/**
 * 호실 상세 패널. 미끄러져 들어오고 나가는 움직임은 app.css의
 * [data-property-inspector] 규칙을 그대로 쓴다 (매물관리·거래관리·문서관리 패널과 같다).
 */
export function UnitDetailPanel({
  unit,
  site,
  dongs,
  closing,
  animate,
  onClose,
  onExited,
}: {
  unit: Unit;
  site: SiteDetail;
  dongs: Dong[];
  /** 닫히는 중: 미끄러져 나간 뒤 onExited가 불린다 */
  closing: boolean;
  /** 미끄러지는 움직임을 쓸지 (키보드로 열고 닫을 때는 쓰지 않는다) */
  animate: boolean;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showConsult, setShowConsult] = useState(false);
  const unitDong = dongs.find((dong) => dong.id === unit.dongId);
  // 화면 글에 쓰는 집 이름 (STANDARDS: formatPlaceLabel). "101동 3401호" / 동 구분 없는 건물은 "201호"
  const placeLabel = formatPlaceLabel({
    dongName: unitDong?.name,
    dongIsPlaceholder: unitDong?.isPlaceholder,
    unit,
  });
  // 소유자·세입자는 관리 공간(Property)에 단다. 관리호수가 아니면 먼저 관리호수로 만든다
  const [peopleDialog, setPeopleDialog] = useState<{
    kind: 'owner' | 'tenant';
    propertyId: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const ensurePropertyMutation = useMutation({
    mutationFn: async (kind: 'owner' | 'tenant') => {
      const existing = unit.properties?.[0]?.id;
      if (existing) return { kind, propertyId: existing, created: false };
      const ensured = await api.properties.ensure({ siteId: site.id, unitId: unit.id });
      return { kind, propertyId: ensured.id, created: ensured.created };
    },
    onSuccess: ({ kind, propertyId, created }) => {
      if (created) {
        void queryClient.invalidateQueries({ queryKey: ['sites', site.id] });
        void queryClient.invalidateQueries({ queryKey: ['office-sites'] });
        void queryClient.invalidateQueries({ queryKey: ['properties'] });
        // 이 호실의 빈 상세를 열어 둔 탭이 매물 상세로 바뀌게 한다
        void queryClient.invalidateQueries({ queryKey: ['units'] });
      }
      setPeopleDialog({ kind, propertyId });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '관리호수로 등록하지 못했습니다. 다시 시도해 주세요.'));
    },
  });
  const openPeopleDialog = (kind: 'owner' | 'tenant') => {
    if (!ensurePropertyMutation.isPending) ensurePropertyMutation.mutate(kind);
  };
  const closePeopleDialog = () => {
    setPeopleDialog(null);
    // 연결한 사람이 호수 표·배치표·만기 보기에 바로 나오게 단지 호수를 다시 받는다
    void queryClient.invalidateQueries({ queryKey: ['sites', site.id] });
  };

  const panelRef = useRef<HTMLElement>(null);
  // 키보드로 열었을 때(미끄러짐 없이 열림)만 포커스를 패널로 옮긴다
  useInspectorFocus(panelRef, !animate, unit.id);

  useEffect(() => {
    if (!closing) return;
    // 숨은 탭이나 모션 줄이기 설정에서는 transitionend가 오지 않을 수 있다.
    const timer = window.setTimeout(
      onExited,
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240,
    );
    return () => window.clearTimeout(timer);
  }, [closing, animate, onExited]);

  // 패널 밖을 누르면 닫는다 (떠 있는 창 · 줄의 열기 단추는 밖이 아니다)
  useInspectorOutsideClose(() => onClose());

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      event.preventDefault();
      onClose(false);
    };
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [onClose]);

  return (
    <>
      <aside
        ref={panelRef}
        tabIndex={-1}
        id="unit-inspector"
        data-unit-inspector
        data-property-inspector
        data-state={closing ? 'closed' : 'open'}
        data-motion={animate ? 'slide' : 'none'}
        inert={closing}
        aria-hidden={closing || undefined}
        aria-label="호실 상세 패널"
        className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)] outline-none"
        style={{ width: UNIT_INSPECTOR_WIDTH, maxWidth: '100%' }}
        onTransitionEnd={(event) => {
          if (closing && event.target === event.currentTarget && event.propertyName === 'transform') {
            onExited();
          }
        }}
      >
        <UnitDetailBody
          key={unit.id}
          unit={unit}
          site={site}
          dongs={dongs}
          onClose={onClose}
          onEdit={() => setShowEdit(true)}
          onDelete={() => setShowDelete(true)}
          onAddConsult={() => setShowConsult(true)}
          onAddPerson={openPeopleDialog}
          isAddingPerson={ensurePropertyMutation.isPending}
        />
      </aside>

      <>
          <UnitEditDialog
            open={showEdit}
            onOpenChange={setShowEdit}
            unit={unit}
            site={site}
            dongs={dongs}
          />
          <UnitConsultDialog
            open={showConsult}
            onOpenChange={setShowConsult}
            unit={unit}
            site={site}
            placeLabel={formatPlaceLabel({
              siteName: site.name,
              dongName: unitDong?.name,
              dongIsPlaceholder: unitDong?.isPlaceholder,
              unit,
            })}
            onAddOwner={() => {
              setShowConsult(false);
              openPeopleDialog('owner');
            }}
          />
          {peopleDialog && (
            <>
              <PropertyContactAddDialog
                open={peopleDialog.kind === 'owner'}
                onOpenChange={(open) => {
                  if (!open) closePeopleDialog();
                }}
                propertyId={peopleDialog.propertyId}
              />
              <TenantAddDialog
                open={peopleDialog.kind === 'tenant'}
                onOpenChange={(open) => {
                  if (!open) closePeopleDialog();
                }}
                propertyId={peopleDialog.propertyId}
              />
            </>
          )}
          <UnitDeleteConfirm
            open={showDelete}
            onOpenChange={setShowDelete}
            unit={unit}
            placeLabel={placeLabel}
            site={site}
            onDeleted={() => onClose(false)}
          />
      </>
    </>
  );
}

// ── 삭제 확인 ────────────────────────────────────────────────────

function UnitDeleteConfirm({
  open,
  onOpenChange,
  unit,
  placeLabel,
  site,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
  placeLabel: string;
  site: SiteDetail;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => api.units.remove(unit.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', site.id] });
      toast.success('호실을 삭제했습니다');
      onOpenChange(false);
      onDeleted();
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '호실을 삭제하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const propertyCount = unit.properties?.length ?? 0;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="호실 삭제"
      description={
        propertyCount > 0
          ? `이 호실(${placeLabel})에 연결된 관리호수가 ${propertyCount}건 있습니다. 연결 데이터가 있으면 삭제가 거부될 수 있습니다.`
          : `이 호실(${placeLabel})을 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
      }
      confirmLabel="삭제"
      destructive
      loading={deleteMutation.isPending}
      onConfirm={() => deleteMutation.mutate()}
    />
  );
}

// ── 본문 ────────────────────────────────────────────────────────

function UnitDetailBody({
  unit,
  site,
  dongs,
  onClose,
  onEdit,
  onDelete,
  onAddConsult,
  onAddPerson,
  isAddingPerson,
}: {
  unit: Unit;
  site: SiteDetail;
  dongs: Dong[];
  onClose: (animate?: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddConsult: () => void;
  onAddPerson: (kind: 'owner' | 'tenant') => void;
  isAddingPerson: boolean;
}) {
  const queryClient = useQueryClient();
  const dong = dongs.find((item) => item.id === unit.dongId);
  // "101동 3401호" (STANDARDS: formatPlaceLabel). 등기 요청의 부제와 제목에 쓴다
  const unitLabel = formatPlaceLabel({
    dongName: dong?.name,
    dongIsPlaceholder: dong?.isPlaceholder,
    unit,
  });
  // 2026-11-22 전에 만든 등기 요청은 부제가 "101 3401" 모양이라 그것도 이 호실 것으로 찾는다
  const dongName = dong && !dong.isPlaceholder ? dong.name : '';
  const legacyUnitLabel = `${dongName ? `${dongName} ` : ''}${formatUnitName(unit)}`;

  const properties = unit.properties ?? [];
  const primaryProperty = properties[0];
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  // 호실의 전체 화면은 매물 상세다. 관리호수가 없어도 열리고, 거기서 적기 시작하면 관리호수가 생긴다.
  // 다른 패널과 같다: 새 탭으로 열고(이미 열려 있으면 그 탭으로 가고) 패널은 닫는다.
  const openInNewTab = () => {
    const route = primaryProperty ? `/properties/${primaryProperty.id}` : `/properties/unit/${unit.id}`;
    const meta = getRouteMeta(route);
    openOrRevealResource({
      route,
      kind: meta.kind,
      title: [site.name, unitLabel].filter(Boolean).join(' ') || meta.title,
      resourceKey: primaryProperty
        ? tabResourceKeys.entity('property', primaryProperty.id)
        : tabResourceKeys.module(route),
    });
    onClose(false);
  };
  const propertyIds = useMemo(() => new Set(properties.map((property) => property.id)), [properties]);

  const listingsWithProperty = properties.flatMap((property) =>
    (property.listings ?? []).map((listing) => ({ listing, propertyId: property.id })),
  );
  const ownerContacts = properties.flatMap((property) =>
    (property.propertyContacts ?? []).filter((pc) => pc.role === 'owner'),
  );
  const tenants = properties.flatMap((property) => property.tenants ?? []);
  const occupancy = getUnitOccupancy(unit);
  const occupancyMeta = OCCUPANCY_META[occupancy];

  // 상담 전체 타임라인 (사이트 프로젝션은 property당 1건뿐 → 전용 쿼리)
  const consultationsQuery = useQuery({
    queryKey: ['consultations', { unitId: unit.id }],
    queryFn: () => api.consultations.findAll({ unitId: unit.id, limit: 50, sortOrder: 'desc' }),
  });
  const consultations = consultationsQuery.data?.items ?? [];

  // 공적장부(등기 문서) — 단지 기준 조회 후 이 호실 분 필터
  const documentsQuery = useQuery({
    queryKey: ['public-documents', 'site', site.id],
    queryFn: () => api.publicDocuments.list({ siteId: site.id }),
  });
  const unitDocuments = useMemo(
    () =>
      (documentsQuery.data ?? []).filter(
        (doc) =>
          (doc.propertyId && propertyIds.has(doc.propertyId)) ||
          (!doc.propertyId && (doc.subtitle === unitLabel || doc.subtitle === legacyUnitLabel)),
      ),
    [documentsQuery.data, legacyUnitLabel, propertyIds, unitLabel],
  );
  const latestDocument = unitDocuments[0];

  const issueMutation = useMutation({
    mutationFn: (propertyId: string) =>
      api.publicDocuments.create({
        propertyId,
        unitId: unit.id,
        siteId: site.id,
        type: 'registry',
        title: '등기사항증명서',
        subtitle: unitLabel,
        requestMode: 'view',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-documents'] });
      toast.success('등기 열람 요청을 만들었습니다. 발급 PDF는 자료실에서 연결할 수 있습니다.');
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '등기 열람 요청을 만들지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const registerManagedUnitMutation = useMutation({
    mutationFn: () => api.properties.create({ siteId: site.id, unitId: unit.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', site.id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      // 관리단지 사이드바의 단지별 관리호수 수(office-sites 집계)도 함께 갱신
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      // 이 호실의 빈 상세를 열어 둔 탭이 매물 상세로 바뀌게 한다
      queryClient.invalidateQueries({ queryKey: ['units'] });
      toast.success('관리호수로 등록했습니다');
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '관리호수로 등록하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const exclusiveArea = unit.exclusiveAreaM2 ?? unit.siteUnitType?.exclusiveAreaM2;
  const supplyArea = unit.supplyAreaM2 ?? unit.siteUnitType?.supplyAreaM2;
  const roomCount = unit.roomCount ?? unit.siteUnitType?.roomCount;
  const bathRoomCount = unit.bathRoomCount ?? unit.siteUnitType?.bathRoomCount;

  const consultationCount = consultationsQuery.data?.pagination.total ?? consultations.length;
  const [tab, setTab] = useState<UnitInspectorTab>('summary');
  const tabs: Array<InspectorTabItem<UnitInspectorTab>> = [
    { value: 'summary', label: '요약' },
    { value: 'people', label: '소유자·세입자', count: ownerContacts.length + tenants.length },
    { value: 'consultations', label: '상담', count: consultationCount },
    { value: 'documents', label: '등기·문서', count: unitDocuments.length },
  ];
  const stats = [
    exclusiveArea ? { icon: Ruler, text: `전용 ${formatArea(exclusiveArea)}` } : null,
    unit.floor != null ? { icon: Layers, text: `${unit.floor}층${unit.isPiloti ? ' · 필로티' : ''}` } : null,
    roomCount != null || bathRoomCount != null
      ? { icon: Home, text: `방 ${roomCount ?? '—'} · 욕실 ${bathRoomCount ?? '—'}` }
      : null,
  ].filter((stat): stat is { icon: typeof Ruler; text: string } => stat !== null);
  const newListingSearch = { siteId: site.id, dongId: unit.dongId, unitId: unit.id };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <PropertyInspectorToolbar
        onClose={onClose}
        onOpenNewTab={openInNewTab}
        headerActions={
          /* 공공 단지의 호실은 바꿀 수 없다 — 직접 등록한 단지에만 보인다 */
          canEditSiteStructure(site) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="호실 메뉴"
                  className="inline-grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-3.5" />
                  호실 수정
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="size-3.5" />
                  호실 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      {/* 머리 영역: 호실 이름 → 단지·주소 → 핵심 수치 → 상태 */}
      <div className="shrink-0 px-6 pb-4">
        <h2 className="text-[23px] font-bold leading-[1.25] tracking-[-0.025em] text-[#2f2e2a]">
          {unitLabel}
        </h2>
        <div className="mt-1 flex min-w-0 items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
          <span className="shrink-0">{site.name}</span>
          <span className="text-[#c9c7c1]">·</span>
          <span className="truncate">{site.roadAddress || site.jibunAddress || '-'}</span>
        </div>

        {stats.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-foreground">
            {stats.map((stat) => (
              <span key={stat.text} className="inline-flex items-center gap-1.5">
                <stat.icon className="size-3.5 text-[#a9a7a1]" />
                {stat.text}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <HeaderChip className={occupancyMeta.badgeClass}>{occupancyMeta.label}</HeaderChip>
          {primaryProperty && (
            <HeaderChip className="bg-[#eef3ed] text-[#44745a]">관리호수</HeaderChip>
          )}
          <HeaderChip className="bg-[#f1f1ef] text-[#5f5e5b]">
            {siteTypeLabels[site.type] ?? site.type}
          </HeaderChip>
          {unit.siteUnitType?.name && (
            <HeaderChip className="bg-[#f1f1ef] text-[#5f5e5b]">{unit.siteUnitType.name}</HeaderChip>
          )}
        </div>
      </div>

      <InspectorTabs
        idPrefix="unit-inspector"
        ariaLabel="호실 상세 구역"
        tabs={tabs}
        value={tab}
        onChange={setTab}
      />

      <div
        role="tabpanel"
        id={inspectorTabIds('unit-inspector', tab).panel}
        aria-labelledby={inspectorTabIds('unit-inspector', tab).tab}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {/* ── 요약 ── */}
        {tab === 'summary' && (
          <div className="space-y-7">
            <section>
              <SectionTitle>기본 정보</SectionTitle>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                <FactRow label="단지" value={site.name} />
                <FactRow
                  label="층 / 라인"
                  value={
                    unit.floor != null || unit.lineNo != null
                      ? `${unit.floor != null ? `${unit.floor}층` : '—'} / ${
                          unit.lineNo != null ? `${unit.lineNo}라인` : '—'
                        }${unit.isPiloti ? ' · 필로티' : ''}`
                      : null
                  }
                />
                <FactRow label="전용면적" value={exclusiveArea ? formatArea(exclusiveArea) : null} />
                <FactRow label="공급면적" value={supplyArea ? formatArea(supplyArea) : null} />
                <FactRow
                  label="방 / 욕실"
                  value={
                    roomCount != null || bathRoomCount != null
                      ? `방 ${roomCount ?? '—'} / 욕실 ${bathRoomCount ?? '—'}`
                      : null
                  }
                />
                <FactRow
                  label="최근 발급"
                  value={latestDocument ? formatDate(latestDocument.issuedAt) : null}
                />
              </dl>
            </section>

            <section>
              <SectionTitle
                count={listingsWithProperty.length || undefined}
                action={
                  <Link
                    to="/properties/new"
                    search={newListingSearch}
                    className={textActionClassName}
                  >
                    <Plus />
                    매물 등록
                  </Link>
                }
              >
                등록 매물
              </SectionTitle>
              {listingsWithProperty.length > 0 ? (
                <div className="divide-y divide-[#f1f0ec]">
                  {listingsWithProperty.map(({ listing, propertyId }) => (
                    <div key={listing.id} className="flex min-h-11 items-center gap-2.5 py-2">
                      <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
                      <span className="min-w-0 truncate text-[13px] font-semibold tabular-nums text-[#2f2e2a]">
                        {formatListingPrice(listing)}
                      </span>
                      <StatusBadge
                        kind="listingAvailability"
                        status={getListingAvailability(listing)}
                        size="sm"
                      />
                      <span className="ml-auto shrink-0 text-[12px] tabular-nums text-[#a9a7a1]">
                        수정 {formatDate(listing.updatedAt)}
                      </span>
                      <Link
                        to="/properties/$id"
                        params={{ id: propertyId }}
                        aria-label="매물 상세 열기"
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
                      >
                        매물 상세
                        <ChevronRight className="size-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyText>등록된 매물 의뢰가 없습니다. 이 호실의 매도·임대 의뢰를 접수할 수 있습니다.</EmptyText>
              )}
            </section>

            <UnitTasksSection propertyIds={propertyIds} />
          </div>
        )}

        {/* ── 소유자·세입자 ── */}
        {tab === 'people' && (
          <div className="space-y-7">
            <section>
              <SectionTitle
                count={ownerContacts.length || undefined}
                action={
                  <TextAction
                    icon={<Plus />}
                    label="소유자 연결"
                    onClick={() => {
                      if (!isAddingPerson) onAddPerson('owner');
                    }}
                  />
                }
              >
                소유자
              </SectionTitle>
              {ownerContacts.length > 0 ? (
                <div className="divide-y divide-[#f1f0ec]">
                  {ownerContacts.map((pc) => (
                    <div key={pc.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <EntityChip
                          kind="contact"
                          id={pc.contact.id}
                          label={pc.contact.name}
                          sublabel={pc.contact.phone ? formatPhone(pc.contact.phone) : undefined}
                        />
                        {pc.isPrimary && (
                          <HeaderChip className="bg-[#f1f1ef] text-[#5f5e5b]">주연락처</HeaderChip>
                        )}
                        {pc.isResident && (
                          <HeaderChip className="bg-[#eef3ed] text-[#44745a]">실거주</HeaderChip>
                        )}
                        {ownerContacts.length > 1 && (
                          <HeaderChip className="bg-[#f1f1ef] text-[#5f5e5b]">공동소유</HeaderChip>
                        )}
                        {pc.shareRatio != null && (
                          <span className="text-[12px] tabular-nums text-muted-foreground">
                            지분 {Number(pc.shareRatio)}%
                          </span>
                        )}
                      </div>
                      {pc.memo && (
                        <p className="mt-1.5 text-[12.5px] leading-[1.6] text-muted-foreground">{pc.memo}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyText>
                  연결된 소유자가 없습니다. ‘소유자 연결’에서 연락처를 고르거나 새로 만들 수 있습니다.
                </EmptyText>
              )}
            </section>

            <section>
              <SectionTitle
                count={tenants.length || undefined}
                action={
                  <TextAction
                    icon={<Plus />}
                    label="세입자 추가"
                    onClick={() => {
                      if (!isAddingPerson) onAddPerson('tenant');
                    }}
                  />
                }
              >
                세입자
              </SectionTitle>
              {tenants.length > 0 ? (
                <div className="divide-y divide-[#f1f0ec]">
                  {tenants.map((tenant) => (
                    <div key={tenant.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <EntityChip
                          kind="contact"
                          id={tenant.contact.id}
                          label={tenant.contact.name}
                          sublabel={tenant.contact.phone ? formatPhone(tenant.contact.phone) : undefined}
                        />
                        <HeaderChip className="bg-[#f1f1ef] text-[#5f5e5b]">
                          {tenantStatusLabels[tenant.status] ?? tenant.status}
                        </HeaderChip>
                        {tenant.contractEnd && (
                          <HeaderChip className="bg-[#fbf3db] text-[#9f6b00]">
                            만기 {formatDday(tenant.contractEnd)}
                          </HeaderChip>
                        )}
                      </div>
                      <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2">
                        <FactRow
                          label="보증금/월세"
                          value={formatListingPrice({
                            transactionType: 'monthly',
                            price: null,
                            deposit: tenant.deposit,
                            monthlyRent: tenant.monthlyRent,
                          })}
                        />
                        <FactRow
                          label="계약기간"
                          value={`${formatDate(tenant.contractStart)} ~ ${formatDate(tenant.contractEnd)}`}
                        />
                        {tenant.moveOutDate && (
                          <FactRow label="퇴거 예정" value={formatDate(tenant.moveOutDate)} />
                        )}
                      </dl>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyText>
                  연결된 세입자가 없습니다. 계약 만료일을 적어 두면 ‘만기’ 보기에 나옵니다.
                </EmptyText>
              )}
            </section>
          </div>
        )}

        {/* ── 상담 ── */}
        {tab === 'consultations' && (
          <section>
            <SectionTitle
              count={consultationCount || undefined}
              action={<TextAction icon={<Plus />} label="상담 적기" onClick={onAddConsult} />}
            >
              상담
            </SectionTitle>
            {consultationsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : consultationsQuery.isError ? (
              <RetryNote onRetry={() => void consultationsQuery.refetch()}>
                상담 기록을 불러오지 못했습니다.
              </RetryNote>
            ) : consultations.length > 0 ? (
              <ol className="divide-y divide-[#f1f0ec]">
                {consultations.map((consultation) => (
                  <li key={consultation.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                      <span className="font-medium text-[#2f2e2a]">
                        {consultationTypeLabels[consultation.type] ?? consultation.type}
                      </span>
                      {consultation.contact && <span>{consultation.contact.name}</span>}
                      <span className="tabular-nums text-[#a9a7a1]">
                        {formatRelativeDayTime(consultation.createdAt)}
                      </span>
                      {consultation.createdBy && (
                        <span className="ml-auto text-[#a9a7a1]">기록 {consultation.createdBy.name}</span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.6] text-[#2f2e2a]">
                      {consultationDisplayText(consultation.content)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyText>상담 기록이 없습니다. ‘상담 적기’로 이 호실의 첫 상담을 적어 보세요.</EmptyText>
            )}
          </section>
        )}

        {/* ── 등기·문서 ── */}
        {tab === 'documents' && (
          <section>
            <SectionTitle
              count={unitDocuments.length || undefined}
              action={primaryProperty && (
                <TextAction
                  icon={<ScrollText />}
                  label={issueMutation.isPending ? '요청 중...' : `등기 열람 요청 (${REGISTRY_COST}원)`}
                  onClick={() => {
                    if (!issueMutation.isPending) issueMutation.mutate(primaryProperty.id);
                  }}
                />
              )}
            >
              발급 이력
            </SectionTitle>
            {documentsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 w-full" />
                ))}
              </div>
            ) : documentsQuery.isError ? (
              <RetryNote onRetry={() => void documentsQuery.refetch()}>
                발급 이력을 불러오지 못했습니다.
              </RetryNote>
            ) : unitDocuments.length > 0 ? (
              <div className="divide-y divide-[#f1f0ec]">
                {unitDocuments.map((doc, index) => {
                  const statusMeta = DOC_STATUS_META[doc.status] ?? {
                    label: doc.status,
                    className: 'bg-neutral-soft text-muted-foreground',
                  };
                  return (
                    <div key={doc.id} className="flex items-center gap-2.5 py-2.5">
                      <FileText className="size-3.5 shrink-0 text-[#a9a7a1]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-[#2f2e2a]">{doc.title}</span>
                          {index === 0 && (
                            <HeaderChip className="bg-[#f1f1ef] text-[#5f5e5b]">최신</HeaderChip>
                          )}
                        </div>
                        <div className="mt-0.5 text-[12px] tabular-nums text-[#a9a7a1]">
                          발급일 {formatDate(doc.issuedAt)}
                          {doc.requestedBy ? ` · ${doc.requestedBy.name}` : ''}
                          {doc.cost > 0 ? ` · ${doc.cost.toLocaleString()}원` : ' · 무료'}
                        </div>
                      </div>
                      <HeaderChip className={statusMeta.className}>{statusMeta.label}</HeaderChip>
                      {doc.fileUrl && (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${doc.title} 열기`}
                          className="inline-grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyText>
                {primaryProperty ? '발급한 등기 문서가 없습니다.' : '매물을 등록하면 등기 열람을 요청할 수 있습니다.'}
              </EmptyText>
            )}
            <p className="mt-3 text-[12px] leading-[1.6] text-[#a9a7a1]">
              외부 발급 API 연동 전까지는 발급 요청이 '발급중' 상태로 기록됩니다. 전체 이력은 자료실에서
              확인할 수 있습니다.
            </p>
          </section>
        )}
      </div>

      {/* 아래 막대: 이 호실에서 바로 시작하는 일 (매물 상세 패널의 아래 막대와 같은 자리) */}
      <div className="flex shrink-0 items-center gap-1 border-t border-[#ecebe8] px-6 py-3">
        <button type="button" className={barButtonClassName} onClick={onAddConsult}>
          <MessageSquarePlus className="size-3.5" />
          상담 적기
        </button>
        <button
          type="button"
          className={barButtonClassName}
          disabled={!primaryProperty || issueMutation.isPending}
          onClick={() => primaryProperty && issueMutation.mutate(primaryProperty.id)}
        >
          <ScrollText className="size-3.5" />
          {issueMutation.isPending ? '요청 중...' : '등기 열람 요청'}
        </button>
        {primaryProperty ? (
          <Link
            to="/properties/new"
            search={newListingSearch}
            className={cn(barButtonClassName, 'ml-auto bg-[#2f2e2a] px-4 font-medium text-white hover:bg-[#1f1e1b] hover:text-white')}
          >
            <FileText className="size-3.5" />
            매물 등록
          </Link>
        ) : (
          <>
            <Link to="/properties/new" search={newListingSearch} className={cn(barButtonClassName, 'ml-auto')}>
              <FileText className="size-3.5" />
              매물 등록
            </Link>
            <button
              type="button"
              disabled={registerManagedUnitMutation.isPending}
              className={cn(barButtonClassName, 'bg-[#2f2e2a] px-4 font-medium text-white hover:bg-[#1f1e1b] hover:text-white')}
              onClick={() => registerManagedUnitMutation.mutate()}
            >
              <Home className="size-3.5" />
              {registerManagedUnitMutation.isPending ? '등록 중...' : '관리호수로 등록'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── 소형 보조 컴포넌트 ──────────────────────────────────────────

type UnitInspectorTab = 'summary' | 'people' | 'consultations' | 'documents';

const barButtonClassName =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground disabled:opacity-50';

/** 구역 제목 오른쪽의 글자 버튼 (매물 상세 패널의 TextAction과 같은 모양, 링크용) */
const textActionClassName =
  'inline-flex items-center gap-1 text-[12px] font-normal text-muted-foreground hover:text-foreground [&_svg]:size-3';

/** 작은 상태 칩 (매물 상세 패널의 StatusChip과 같은 모양) */
function HeaderChip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 이름 + 값 한 줄. 매물 상세 패널의 "매물 정보" 줄과 같은 모양이다. */
function FactRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <dt className="w-[68px] shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-[13px]',
          value ? 'font-medium tabular-nums text-[#2f2e2a]' : 'text-[#c9c7c1]',
        )}
      >
        {value || '-'}
      </dd>
    </div>
  );
}
