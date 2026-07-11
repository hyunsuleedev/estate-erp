/**
 * 호실 상세 다이얼로그 — 개요/소유자·세입자/상담 타임라인/등기 문서 탭 + 후속 작업 CTA.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  Building2,
  Calendar,
  FileText,
  Home,
  Layers,
  MapPin,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Ruler,
  ScrollText,
  Trash2,
  User,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Dong, SiteDetail, Unit } from '@estate-erp/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog, EmptyState, EntityChip, StatusBadge } from '@/components/domain';
import { cn } from '@/lib/utils';
import { formatArea, formatDate, formatDateTime, formatDday, formatPhone } from '@/lib/format';
import {
  consultationTypeLabels,
  formatListingPrice,
  getUnitOccupancy,
  OCCUPANCY_META,
  siteTypeLabels,
  tenantStatusLabels,
} from './-site-helpers';
import { UnitConsultDialog, UnitEditDialog } from './-unit-dialogs';
import { UnitTasksSection } from './-unit-tasks-section';

const DOC_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '발급중', className: 'bg-warning-soft text-warning' },
  completed: { label: '발급완료', className: 'bg-success-soft text-success' },
  failed: { label: '실패', className: 'bg-destructive-soft text-destructive' },
};

const REGISTRY_COST = 700;

export function UnitDetailDialog({
  unit,
  site,
  dongs,
  onClose,
}: {
  unit: Unit | null;
  site: SiteDetail | null;
  dongs: Dong[];
  onClose: () => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showConsult, setShowConsult] = useState(false);

  return (
    <>
      <Dialog
        open={!!unit && !!site}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-5xl">
          {unit && site && (
            <UnitDetailBody
              unit={unit}
              site={site}
              dongs={dongs}
              onEdit={() => setShowEdit(true)}
              onDelete={() => setShowDelete(true)}
              onAddConsult={() => setShowConsult(true)}
            />
          )}
        </DialogContent>
      </Dialog>

      {unit && site && (
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
            dongName={dongs.find((dong) => dong.id === unit.dongId)?.name ?? ''}
          />
          <UnitDeleteConfirm
            open={showDelete}
            onOpenChange={setShowDelete}
            unit={unit}
            site={site}
            onDeleted={onClose}
          />
        </>
      )}
    </>
  );
}

// ── 삭제 확인 ────────────────────────────────────────────────────

function UnitDeleteConfirm({
  open,
  onOpenChange,
  unit,
  site,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
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
      toast.error(error instanceof Error ? error.message : '호실 삭제에 실패했습니다');
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
          ? `'${unit.name}' 호실에 연결된 관리 매물이 ${propertyCount}건 있습니다. 연결 데이터가 있으면 삭제가 거부될 수 있습니다.`
          : `'${unit.name}' 호실을 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
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
  onEdit,
  onDelete,
  onAddConsult,
}: {
  unit: Unit;
  site: SiteDetail;
  dongs: Dong[];
  onEdit: () => void;
  onDelete: () => void;
  onAddConsult: () => void;
}) {
  const queryClient = useQueryClient();
  const dong = dongs.find((item) => item.id === unit.dongId);
  const dongName = dong && !dong.isPlaceholder ? dong.name : '';
  const unitLabel = `${dongName ? `${dongName} ` : ''}${unit.name}`;

  const properties = unit.properties ?? [];
  const primaryProperty = properties[0];
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
          (!doc.propertyId && doc.subtitle === unitLabel),
      ),
    [documentsQuery.data, propertyIds, unitLabel],
  );
  const latestDocument = unitDocuments[0];

  const issueMutation = useMutation({
    mutationFn: () =>
      api.publicDocuments.create({
        propertyId: primaryProperty?.id,
        siteId: site.id,
        type: 'registry',
        title: '등기부등본',
        subtitle: unitLabel,
        cost: REGISTRY_COST,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-documents'] });
      toast.success('등기부등본 발급을 요청했습니다');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '발급 요청에 실패했습니다');
    },
  });

  const exclusiveArea = unit.exclusiveAreaM2 ?? unit.siteUnitType?.exclusiveAreaM2;
  const supplyArea = unit.supplyAreaM2 ?? unit.siteUnitType?.supplyAreaM2;

  return (
    <>
      <DialogHeader className="border-b px-6 py-5 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <Home className="size-4 text-muted-foreground" />
          <DialogTitle className="text-base">{unitLabel}</DialogTitle>
          <Badge variant="outline" className="text-[10px] font-normal">
            {siteTypeLabels[site.type] ?? site.type}
          </Badge>
          <Badge className={cn('text-[10px] font-medium', occupancyMeta.badgeClass)}>
            {occupancyMeta.label}
          </Badge>
          {unit.siteUnitType?.name && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {unit.siteUnitType.name}
            </Badge>
          )}
        </div>
        <DialogDescription className="flex items-center gap-1 text-xs">
          <MapPin className="size-3" />
          {site.name} · {site.roadAddress || site.jibunAddress || '-'}
        </DialogDescription>
      </DialogHeader>

      {/* 액션 바 */}
      <div className="border-b px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link
              to="/properties/new"
              search={{ siteId: site.id, dongId: unit.dongId, unitId: unit.id }}
            >
              <FileText className="mr-1.5 size-3.5" />
              매물 등록
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAddConsult}>
            <MessageSquarePlus className="mr-1.5 size-3.5" />
            상담 추가
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => issueMutation.mutate()}
            disabled={issueMutation.isPending}
          >
            <ScrollText className="mr-1.5 size-3.5" />
            {issueMutation.isPending ? '요청 중...' : `등기부등본 발급 (${REGISTRY_COST}원)`}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <MoreHorizontal className="size-4" />
              </Button>
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
          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>매물 {listingsWithProperty.length}건</span>
            <span>·</span>
            <span>상담 {consultationsQuery.data?.pagination.total ?? consultations.length}건</span>
            <span>·</span>
            <span>최근 발급 {latestDocument ? formatDate(latestDocument.issuedAt) : '—'}</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-6 py-2">
          <TabsList variant="line" className="h-8">
            <TabsTrigger value="overview" className="px-3 text-xs">
              개요
            </TabsTrigger>
            <TabsTrigger value="people" className="px-3 text-xs">
              소유자/세입자
            </TabsTrigger>
            <TabsTrigger value="consultations" className="px-3 text-xs">
              상담
            </TabsTrigger>
            <TabsTrigger value="documents" className="px-3 text-xs">
              등기/문서
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          {/* ── 개요 ── */}
          <TabsContent value="overview" className="p-6">
            <div className="space-y-6">
              <section>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  기본 정보
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <OverviewField icon={Building2} label="단지" value={site.name} />
                  <OverviewField
                    icon={Ruler}
                    label="전용면적"
                    value={exclusiveArea ? formatArea(exclusiveArea) : '—'}
                  />
                  <OverviewField
                    icon={Ruler}
                    label="공급면적"
                    value={supplyArea ? formatArea(supplyArea) : '—'}
                  />
                  <OverviewField
                    icon={Layers}
                    label="층 / 라인"
                    value={`${unit.floor != null ? `${unit.floor}층` : '—'} / ${
                      unit.lineNo != null ? `${unit.lineNo}라인` : '—'
                    }${unit.isPiloti ? ' · 필로티' : ''}`}
                  />
                </div>
              </section>

              <Separator />

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    등록 매물
                  </h3>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {listingsWithProperty.length}건
                  </Badge>
                </div>
                {listingsWithProperty.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {listingsWithProperty.map(({ listing, propertyId }) => (
                      <div key={listing.id} className="rounded-lg border p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
                          <span className="text-sm font-medium tabular-nums">
                            {formatListingPrice(listing)}
                          </span>
                          <StatusBadge kind="checkStatus" status={listing.checkStatus} size="sm" />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            최근 수정 {formatDate(listing.updatedAt)}
                          </span>
                          <Button variant="ghost" size="xs" asChild>
                            <Link to="/properties/$id" params={{ id: propertyId }}>
                              매물 상세 열기
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={FileText}
                    title="등록된 매물이 없습니다"
                    description="이 호실 맥락으로 바로 매물 등록을 시작할 수 있습니다"
                    action={
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          to="/properties/new"
                          search={{ siteId: site.id, dongId: unit.dongId, unitId: unit.id }}
                        >
                          새 매물 등록
                        </Link>
                      </Button>
                    }
                    className="rounded-lg border border-dashed py-8"
                  />
                )}
              </section>

              <Separator />

              <UnitTasksSection propertyIds={propertyIds} />
            </div>
          </TabsContent>

          {/* ── 소유자/세입자 ── */}
          <TabsContent value="people" className="p-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <User className="size-3" />
                    소유자
                  </h3>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {ownerContacts.length}
                  </Badge>
                </div>
                {ownerContacts.length > 0 ? (
                  <div className="space-y-2">
                    {ownerContacts.map((pc) => (
                      <div key={pc.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <EntityChip
                            kind="contact"
                            id={pc.contact.id}
                            label={pc.contact.name}
                            sublabel={pc.contact.phone ? formatPhone(pc.contact.phone) : undefined}
                          />
                          {pc.shareRatio != null && (
                            <Badge variant="outline" className="text-[10px] font-normal tabular-nums">
                              지분 {Number(pc.shareRatio)}%
                            </Badge>
                          )}
                          {pc.isResident && (
                            <Badge className="bg-success-soft text-[10px] font-medium text-success">
                              실거주
                            </Badge>
                          )}
                          {pc.isPrimary && (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              주연락처
                            </Badge>
                          )}
                          {ownerContacts.length > 1 && (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              공동소유
                            </Badge>
                          )}
                        </div>
                        {pc.memo && (
                          <p className="mt-2 text-xs text-muted-foreground">{pc.memo}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={User}
                    title="연결된 소유자가 없습니다"
                    className="rounded-lg border border-dashed py-8"
                  />
                )}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Home className="size-3" />
                    세입자
                  </h3>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {tenants.length}
                  </Badge>
                </div>
                {tenants.length > 0 ? (
                  <div className="space-y-2">
                    {tenants.map((tenant) => (
                      <div key={tenant.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <EntityChip
                            kind="contact"
                            id={tenant.contact.id}
                            label={tenant.contact.name}
                            sublabel={
                              tenant.contact.phone ? formatPhone(tenant.contact.phone) : undefined
                            }
                          />
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {tenantStatusLabels[tenant.status] ?? tenant.status}
                          </Badge>
                          {tenant.contractEnd && (
                            <Badge variant="outline" className="text-[10px] font-normal tabular-nums">
                              만기 {formatDday(tenant.contractEnd)}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                          <div className="tabular-nums">
                            보증금/월세: {formatListingPrice({
                              transactionType: 'monthly',
                              price: null,
                              deposit: tenant.deposit,
                              monthlyRent: tenant.monthlyRent,
                            })}
                          </div>
                          <div className="tabular-nums">
                            계약기간: {formatDate(tenant.contractStart)} ~ {formatDate(tenant.contractEnd)}
                          </div>
                          {tenant.moveOutDate && (
                            <div className="tabular-nums">퇴거 예정: {formatDate(tenant.moveOutDate)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Home}
                    title="연결된 세입자가 없습니다"
                    className="rounded-lg border border-dashed py-8"
                  />
                )}
              </section>
            </div>
          </TabsContent>

          {/* ── 상담 ── */}
          <TabsContent value="consultations" className="p-6">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Calendar className="size-3" />
                  상담 타임라인
                </h3>
                <Button variant="outline" size="xs" onClick={onAddConsult}>
                  <MessageSquarePlus className="size-3" />
                  상담 추가
                </Button>
              </div>
              {consultationsQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : consultationsQuery.isError ? (
                <QueryErrorBox
                  message="상담 기록을 불러오지 못했습니다"
                  onRetry={() => consultationsQuery.refetch()}
                />
              ) : consultations.length > 0 ? (
                <div className="space-y-2">
                  {consultations.map((consultation) => (
                    <div key={consultation.id} className="rounded-lg border p-4">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {consultationTypeLabels[consultation.type] ?? consultation.type}
                        </Badge>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {formatDateTime(consultation.createdAt)}
                        </span>
                        {consultation.contact && (
                          <span className="text-[11px] text-muted-foreground">
                            {consultation.contact.name}
                          </span>
                        )}
                        {consultation.createdBy && (
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            기록 {consultation.createdBy.name}
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{consultation.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Calendar}
                  title="상담 기록이 없습니다"
                  description="이 호실 맥락으로 첫 상담을 기록해보세요"
                  action={
                    <Button size="sm" variant="outline" onClick={onAddConsult}>
                      상담 추가
                    </Button>
                  }
                  className="rounded-lg border border-dashed py-8"
                />
              )}
            </section>
          </TabsContent>

          {/* ── 등기/문서 ── */}
          <TabsContent value="documents" className="p-6">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <ScrollText className="size-3" />
                  발급 이력
                </h3>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => issueMutation.mutate()}
                  disabled={issueMutation.isPending}
                >
                  <ScrollText className="size-3" />
                  등기부등본 발급
                </Button>
              </div>
              {documentsQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : documentsQuery.isError ? (
                <QueryErrorBox
                  message="발급 이력을 불러오지 못했습니다"
                  onRetry={() => documentsQuery.refetch()}
                />
              ) : unitDocuments.length > 0 ? (
                <div className="space-y-2">
                  {unitDocuments.map((doc, index) => {
                    const statusMeta = DOC_STATUS_META[doc.status] ?? {
                      label: doc.status,
                      className: 'bg-neutral-soft text-muted-foreground',
                    };
                    return (
                      <div
                        key={doc.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{doc.title}</span>
                            {index === 0 && (
                              <Badge variant="secondary" className="text-[10px] font-normal">
                                최신
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] tabular-nums text-muted-foreground">
                            발급일 {formatDate(doc.issuedAt)}
                            {doc.requestedBy ? ` · ${doc.requestedBy.name}` : ''}
                            {doc.cost > 0 ? ` · ${doc.cost.toLocaleString()}원` : ' · 무료'}
                          </div>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <Badge className={cn('text-[10px] font-medium', statusMeta.className)}>
                            {statusMeta.label}
                          </Badge>
                          {doc.fileUrl && (
                            <Button variant="ghost" size="xs" asChild>
                              <a href={doc.fileUrl} target="_blank" rel="noreferrer">
                                열기
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={ScrollText}
                  title="발급한 등기 문서가 없습니다"
                  description={`등기부등본 발급(${REGISTRY_COST}원)으로 이 호실의 권리관계를 확인하세요`}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => issueMutation.mutate()}
                      disabled={issueMutation.isPending}
                    >
                      등기부등본 발급
                    </Button>
                  }
                  className="rounded-lg border border-dashed py-8"
                />
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                외부 발급 API 연동 전까지는 발급 요청이 '발급중' 상태로 기록됩니다. 전체 이력은
                자료실에서 확인할 수 있습니다.
              </p>
            </section>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </>
  );
}

// ── 소형 보조 컴포넌트 ──────────────────────────────────────────

function OverviewField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function QueryErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw className="size-3.5" />
        다시 시도
      </Button>
    </div>
  );
}
