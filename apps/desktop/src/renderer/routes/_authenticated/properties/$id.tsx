import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileArchive,
  FileText,
  Handshake,
  Home,
  ImageIcon,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Ruler,
  Trash2,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import type {
  Consultation,
  Deal,
  Listing,
  ListingPriceHistory,
  Match,
  Property,
  PropertyContact,
  PropertyPhoto,
  PublicDocument,
  Tenant,
} from '@estate-erp/api-client';
import { toast } from 'sonner';
import { MAINTENANCE_FEE_INCLUDE_LABELS, TRANSACTION_TYPE_LABELS } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  formatArea,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPhone,
  formatRent,
} from '@/lib/format';
import { ConfirmDialog, EmptyState, StatusBadge } from '@/components/domain';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ConsultationAddDialog,
  DealAddDialog,
  ListingFormDialog,
  MatchCreateDialog,
  PropertyContactAddDialog,
  TenantAddDialog,
} from './-property-detail-dialogs';
import { ExpiryCard } from './-detail/cards/ExpiryCard';
import { ActivityTimelineSection } from './-detail/sections/ActivityTimelineSection';

const siteTypeLabels: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독/다가구',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

const roleLabels: Record<string, string> = {
  owner: '소유자',
  co_owner: '공동소유',
  representative: '대리인',
  lawyer: '법무사',
  tax_agent: '세무사',
};

export const Route = createFileRoute('/_authenticated/properties/$id')({
  component: PropertyDetailPage,
});

interface ContactRef {
  id: string;
  name: string;
  phone: string | null;
}

function PropertyDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('overview');

  // ── 다이얼로그 상태 ──────────────────────────────────────────
  const [listingDialog, setListingDialog] = useState<{ open: boolean; listing: Listing | null }>({
    open: false,
    listing: null,
  });
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [consultDialog, setConsultDialog] = useState<{ open: boolean; defaultContact: ContactRef | null }>({
    open: false,
    defaultContact: null,
  });
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);

  // ── 데이터 조회 ─────────────────────────────────────────────
  const {
    data: property,
    isLoading,
    isError: isPropertyError,
    refetch: refetchProperty,
  } = useQuery({
    queryKey: ['properties', id],
    queryFn: () => api.properties.findOne(id),
  });

  const listingsQuery = useQuery({
    queryKey: ['listings', { propertyId: id }],
    queryFn: () => api.listings.findAll({ propertyId: id, limit: 50 }),
  });

  const { data: propertyContacts } = useQuery({
    queryKey: ['property-contacts', id],
    queryFn: () => api.propertyContacts.findByProperty(id),
  });

  const { data: tenants } = useQuery({
    queryKey: ['tenants', id],
    queryFn: () => api.tenants.findByProperty(id),
  });

  const { data: consultationsData } = useQuery({
    queryKey: ['consultations', 'property', id],
    queryFn: () => api.consultations.findAll({ propertyId: id, limit: 20, sortOrder: 'desc' }),
  });

  const matchesQuery = useQuery({
    queryKey: ['matches', { propertyId: id }],
    queryFn: () => api.matches.findAll({ propertyId: id }),
  });

  const dealsQuery = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const listings = useMemo(() => listingsQuery.data?.items ?? [], [listingsQuery.data]);

  const deals = useMemo(() => {
    const all = dealsQuery.data ?? [];
    const listingIds = new Set(listings.map((l) => l.id));
    return all.filter(
      (deal) => deal.propertyId === id || (deal.listingId != null && listingIds.has(deal.listingId)),
    );
  }, [dealsQuery.data, listings, id]);

  const priceHistories = useMemo(() => {
    const rows: Array<{ history: ListingPriceHistory; listing: Listing }> = [];
    for (const listing of listings) {
      for (const history of listing.priceHistories ?? []) {
        rows.push({ history, listing });
      }
    }
    return rows.sort(
      (a, b) => new Date(b.history.createdAt).getTime() - new Date(a.history.createdAt).getTime(),
    );
  }, [listings]);

  const toggleHiddenMutation = useMutation({
    mutationFn: ({ listingId, isHidden }: { listingId: string; isHidden: boolean }) =>
      api.listings.setHidden(listingId, isHidden),
    onSuccess: (_data, vars) => {
      toast.success(vars.isHidden ? '매물을 목록에서 숨겼습니다.' : '매물 숨김을 해제했습니다.');
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['properties', id] });
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : '숨김 설정에 실패했습니다.'),
  });

  const deleteListingMutation = useMutation({
    mutationFn: (listingId: string) => api.listings.remove(listingId),
    onSuccess: () => {
      toast.success('매물이 삭제되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['properties', id] });
      setDeleteTarget(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : '매물 삭제에 실패했습니다.'),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isPropertyError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">매물 정보를 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => refetchProperty()}>
          <RefreshCw className="size-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  if (!property) {
    return <div className="py-12 text-center text-sm text-muted-foreground">매물을 찾을 수 없습니다.</div>;
  }

  const primaryListing = listings[0] ?? null;
  const relatedContacts = propertyContacts ?? property.propertyContacts ?? [];
  const activeTenants = tenants ?? property.tenants ?? [];
  const consultations = consultationsData?.items ?? property.consultations ?? [];
  const matches = matchesQuery.data ?? [];
  const title = getPropertyTitle(property);
  const unitLabel = getPropertyUnitLabel(property);
  const address = property.site?.roadAddress || property.site?.jibunAddress || '—';
  const exclusiveArea = property.unit?.exclusiveAreaM2 ?? property.unit?.siteUnitType?.exclusiveAreaM2;
  const supplyArea = property.unit?.supplyAreaM2 ?? property.unit?.siteUnitType?.supplyAreaM2;
  const floorLabel = property.unit?.floor ? `${property.unit.floor}층` : '—';
  const siteType = property.site?.type ? siteTypeLabels[property.site.type] ?? property.site.type : '매물';
  const isCommercial = property.site?.type === 'commercial';

  // 빠른 액션·상담 추천용 연락처
  const suggestedContacts = relatedContacts
    .filter((pc) => pc.contact)
    .map((pc) => ({
      id: pc.contact!.id,
      name: pc.contact!.name,
      phone: pc.contact!.phone ?? null,
      label: roleLabels[pc.role] ?? pc.role,
    }));
  const ownerContact =
    relatedContacts.find((pc) => (pc.role === 'owner' || pc.role === 'co_owner') && pc.contact?.phone)
      ?.contact ?? null;

  const openConsultDialog = (defaultContact: ContactRef | null = null) =>
    setConsultDialog({ open: true, defaultContact });
  const openListingDialog = (listing: Listing | null) => setListingDialog({ open: true, listing });

  const handleOwnerCall = () => {
    if (ownerContact?.phone) {
      window.location.href = `tel:${ownerContact.phone}`;
    } else {
      toast.error('소유주 연락처가 등록되어 있지 않습니다.');
    }
  };

  const handleDealOpen = () => {
    if (listings.length === 0) {
      toast.error('거래를 만들려면 매물(거래 조건)을 먼저 등록하세요.');
      return;
    }
    setDealDialogOpen(true);
  };

  const handleMatchOpen = () => {
    if (listings.length === 0) {
      toast.error('매칭을 만들려면 매물(거래 조건)을 먼저 등록하세요.');
      return;
    }
    setMatchDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <Button variant="ghost" size="icon" className="size-7 shrink-0" asChild>
            <Link to="/properties">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <Link to="/properties" className="hover:text-foreground">
            매물관리
          </Link>
          <span>/</span>
          <span className="truncate">{property.site?.name ?? '단지 미지정'}</span>
          {unitLabel && (
            <>
              <span>/</span>
              <span className="font-medium text-foreground">{unitLabel}</span>
            </>
          )}
        </div>
      </div>

      <section className="rounded-xl border bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex aspect-square size-28 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground sm:size-32">
            <Building2 className="size-9" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {primaryListing && (
                <StatusBadge kind="transactionType" status={primaryListing.transactionType} />
              )}
              {primaryListing && <StatusBadge kind="checkStatus" status={primaryListing.checkStatus} />}
              <Badge variant="secondary" className="border-0">
                {property.unit?.siteUnitType?.name ?? siteType}
              </Badge>
            </div>

            <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <MetaItem icon={MapPin}>{address}</MetaItem>
                  <MetaItem icon={Ruler}>{formatArea(exclusiveArea ?? supplyArea)}</MetaItem>
                  <MetaItem icon={Building2}>{floorLabel}</MetaItem>
                  <MetaItem icon={CalendarClock}>수정 {formatDate(property.updatedAt)}</MetaItem>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openListingDialog(primaryListing)}
                >
                  <Edit3 className="size-4" />
                  {primaryListing ? '매물 수정' : '매물 추가'}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-slate-950 text-white hover:bg-slate-800"
                  onClick={handleMatchOpen}
                >
                  <Users className="size-4" />
                  매칭 생성
                </Button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div className="text-3xl font-semibold tracking-tight text-slate-950">
                {listingPriceLabel(primaryListing)}
              </div>
              <span className="mb-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {primaryListing ? `등록 ${formatDate(primaryListing.createdAt)}` : '거래 정보 없음'}
              </span>
            </div>
            {listingsQuery.isError && (
              <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
                매물(거래 조건) 정보를 불러오지 못했습니다.
                <Button variant="outline" size="xs" onClick={() => listingsQuery.refetch()}>
                  재시도
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab} className="gap-0">
        <div className="border-b">
          <TabsList variant="line" className="h-11 w-full justify-start overflow-x-auto rounded-none p-0">
            <TabsTrigger value="overview" className="h-11 flex-none px-4">개요</TabsTrigger>
            <TabsTrigger value="matches" className="h-11 flex-none px-4">매칭 {matches.length}</TabsTrigger>
            <TabsTrigger value="consultations" className="h-11 flex-none px-4">상담 {consultations.length}</TabsTrigger>
            <TabsTrigger value="listings" className="h-11 flex-none px-4">매물·가격 {listings.length}</TabsTrigger>
            <TabsTrigger value="deals" className="h-11 flex-none px-4">거래 {deals.length}</TabsTrigger>
            <TabsTrigger value="contacts" className="h-11 flex-none px-4">관련인 {relatedContacts.length + activeTenants.length}</TabsTrigger>
            <TabsTrigger value="photos" className="h-11 flex-none px-4">사진</TabsTrigger>
            <TabsTrigger value="documents" className="h-11 flex-none px-4">공적장부</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <SectionPanel
                title="기본 정보"
                action={{ label: '편집', onClick: () => openListingDialog(primaryListing) }}
              >
                <InfoGrid
                  items={[
                    ['매물 유형', siteType],
                    ['단지/건물', property.site?.name ?? '—'],
                    ['동/호수', unitLabel || '—'],
                    ['층', floorLabel],
                    ['전용면적', formatArea(exclusiveArea)],
                    ['공급면적', formatArea(supplyArea)],
                    [
                      '거래 유형',
                      primaryListing
                        ? (TRANSACTION_TYPE_LABELS as Record<string, string>)[primaryListing.transactionType] ??
                          primaryListing.transactionType
                        : '—',
                    ],
                    ['입주 가능', getMoveInLabel(activeTenants[0])],
                  ]}
                />
              </SectionPanel>

              {primaryListing && (
                <SectionPanel
                  title="거래 조건"
                  action={{ label: '편집', onClick: () => openListingDialog(primaryListing) }}
                >
                  <div className="space-y-2.5 p-5">
                    <ListingConditionFields listing={primaryListing} isCommercial={isCommercial} />
                  </div>
                </SectionPanel>
              )}

              <SectionPanel
                title={`소유주 · 관련인 ${relatedContacts.length}`}
                action={{ label: '+ 관련인 추가', onClick: () => setContactDialogOpen(true) }}
              >
                {relatedContacts.length === 0 ? (
                  <EmptyState icon={User} title="등록된 관련인이 없습니다" className="py-8" />
                ) : (
                  <div className="divide-y">
                    {relatedContacts.slice(0, 4).map((contact) => (
                      <ContactRow
                        key={contact.id}
                        propertyContact={contact}
                        onConsult={(c) => openConsultDialog(c)}
                      />
                    ))}
                  </div>
                )}
              </SectionPanel>

              <SectionPanel
                title={`매칭 중인 매수 고객 ${matches.length}`}
                action={{ label: '전체 매칭 보기', onClick: () => setTab('matches') }}
              >
                {matchesQuery.isError ? (
                  <SectionError onRetry={() => matchesQuery.refetch()} />
                ) : matches.length === 0 ? (
                  <EmptyState icon={Users} title="이 매물에 연결된 매칭이 없습니다" className="py-8" />
                ) : (
                  <div className="divide-y">
                    {matches.slice(0, 4).map((match) => (
                      <MatchRow key={match.id} match={match} />
                    ))}
                  </div>
                )}
              </SectionPanel>

              {/* (desktop) 활동 이력 타임라인 — 가격 변경 + 매칭 생성 */}
              <ActivityTimelineSection listings={listings} matches={matches} />
            </div>

            <aside className="space-y-4">
              <SectionPanel title="빠른 액션">
                <div className="space-y-2 p-4">
                  <QuickAction icon={Phone} label="소유주 전화 걸기" onClick={handleOwnerCall} />
                  <QuickAction icon={MessageSquare} label="상담 기록 추가" onClick={() => openConsultDialog()} />
                  <QuickAction
                    icon={CircleDollarSign}
                    label="가격·상태 수정"
                    onClick={() => openListingDialog(primaryListing)}
                  />
                  <QuickAction icon={Handshake} label="거래 생성" onClick={handleDealOpen} />
                </div>
              </SectionPanel>

              {/* (desktop) 확인/만기 카드 — 임대 만기·최근 확인 요약 */}
              <ExpiryCard listings={listings} tenants={activeTenants} />

              <SectionPanel title="가격 정보" action={{ label: '전체', onClick: () => setTab('listings') }}>
                <div className="space-y-3 p-5">
                  {listings.length === 0 ? (
                    <EmptyState
                      icon={CircleDollarSign}
                      title="등록된 거래 가격이 없습니다"
                      className="py-4"
                    />
                  ) : (
                    listings.slice(0, 3).map((listing) => (
                      <div key={listing.id} className="flex items-start gap-3">
                        <span className="mt-1.5 size-2 rounded-full bg-success" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-950">{listingPriceLabel(listing)}</span>
                            <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatDate(listing.updatedAt)}
                          </p>
                        </div>
                        <StatusBadge kind="checkStatus" status={listing.checkStatus} size="sm" />
                      </div>
                    ))
                  )}
                </div>
              </SectionPanel>

              <SectionPanel title="최근 상담" action={{ label: '+ 기록', onClick: () => openConsultDialog() }}>
                {consultations.length === 0 ? (
                  <EmptyState icon={MessageSquare} title="상담 기록이 없습니다" className="py-8" />
                ) : (
                  <div className="divide-y">
                    {consultations.slice(0, 3).map((consultation) => (
                      <ConsultationRow key={consultation.id} consultation={consultation} compact />
                    ))}
                  </div>
                )}
              </SectionPanel>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="matches" className="mt-5">
          <SectionPanel
            title={`매칭 ${matches.length}`}
            action={{ label: '+ 매칭 생성', onClick: handleMatchOpen }}
          >
            {matchesQuery.isError ? (
              <SectionError onRetry={() => matchesQuery.refetch()} />
            ) : matches.length === 0 ? (
              <EmptyState
                icon={Users}
                title="이 매물에 연결된 매칭이 없습니다"
                description="구매 고객 조건과 연결하면 매칭 파이프라인이 시작됩니다."
                className="py-10"
              />
            ) : (
              <div className="divide-y">
                {matches.map((match) => (
                  <MatchRow key={match.id} match={match} />
                ))}
              </div>
            )}
          </SectionPanel>
        </TabsContent>

        <TabsContent value="consultations" className="mt-5">
          <SectionPanel
            title={`상담 이력 ${consultations.length}`}
            action={{ label: '+ 상담 추가', onClick: () => openConsultDialog() }}
          >
            {consultations.length === 0 ? (
              <EmptyState icon={MessageSquare} title="상담 기록이 없습니다" className="py-10" />
            ) : (
              <div className="divide-y">
                {consultations.map((consultation) => (
                  <ConsultationRow key={consultation.id} consultation={consultation} />
                ))}
              </div>
            )}
          </SectionPanel>
        </TabsContent>

        <TabsContent value="listings" className="mt-5">
          <SectionPanel
            title={`매물·가격 ${listings.length}`}
            action={{ label: '+ 매물 추가', onClick: () => openListingDialog(null) }}
          >
            {listingsQuery.isError ? (
              <SectionError onRetry={() => listingsQuery.refetch()} />
            ) : listings.length === 0 ? (
              <EmptyState
                icon={Home}
                title="등록된 거래 정보가 없습니다"
                description="매매/전세/월세 거래 조건을 등록하세요."
                className="py-10"
              />
            ) : (
              <div className="divide-y">
                {listings.map((listing) => (
                  <ListingRow
                    key={listing.id}
                    listing={listing}
                    isCommercial={isCommercial}
                    onEdit={() => openListingDialog(listing)}
                    onDelete={() => setDeleteTarget(listing)}
                    onToggleHidden={() =>
                      toggleHiddenMutation.mutate({
                        listingId: listing.id,
                        isHidden: !listing.isHidden,
                      })
                    }
                    toggleHiddenPending={toggleHiddenMutation.isPending}
                  />
                ))}
              </div>
            )}
          </SectionPanel>
        </TabsContent>

        <TabsContent value="deals" className="mt-5">
          <div className="space-y-4">
            <SectionPanel
              title={`거래 ${deals.length}`}
              action={{ label: '+ 거래 추가', onClick: handleDealOpen }}
            >
              {dealsQuery.isError ? (
                <SectionError onRetry={() => dealsQuery.refetch()} />
              ) : deals.length === 0 ? (
                <EmptyState
                  icon={Handshake}
                  title="이 매물의 거래가 없습니다"
                  description="매수 고객과 가격 합의가 이뤄지면 거래를 생성하세요."
                  className="py-10"
                />
              ) : (
                <div className="divide-y">
                  {deals.map((deal) => (
                    <DealRow key={deal.id} deal={deal} />
                  ))}
                </div>
              )}
            </SectionPanel>

            <SectionPanel title={`가격 변동 이력 ${priceHistories.length}`}>
              {priceHistories.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="가격 변동 이력이 없습니다"
                  description="매물 가격을 수정하면 변경 전/후가 자동으로 기록됩니다."
                  className="py-8"
                />
              ) : (
                <div className="divide-y">
                  {priceHistories.map(({ history, listing }) => (
                    <PriceHistoryRow key={history.id} history={history} listing={listing} />
                  ))}
                </div>
              )}
            </SectionPanel>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="mt-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionPanel
              title={`소유주 · 관련인 ${relatedContacts.length}`}
              action={{ label: '+ 관련인 추가', onClick: () => setContactDialogOpen(true) }}
            >
              {relatedContacts.length === 0 ? (
                <EmptyState icon={User} title="등록된 관련인이 없습니다" className="py-10" />
              ) : (
                <div className="divide-y">
                  {relatedContacts.map((contact) => (
                    <ContactRow
                      key={contact.id}
                      propertyContact={contact}
                      onConsult={(c) => openConsultDialog(c)}
                    />
                  ))}
                </div>
              )}
            </SectionPanel>
            <SectionPanel
              title={`임차인 ${activeTenants.length}`}
              action={{ label: '+ 임차인 추가', onClick: () => setTenantDialogOpen(true) }}
            >
              {activeTenants.length === 0 ? (
                <EmptyState icon={Users} title="등록된 임차인이 없습니다" className="py-10" />
              ) : (
                <div className="divide-y">
                  {activeTenants.map((tenant) => (
                    <TenantRow key={tenant.id} tenant={tenant} />
                  ))}
                </div>
              )}
            </SectionPanel>
          </div>
        </TabsContent>

        <TabsContent value="photos" className="mt-5">
          <PhotosTab propertyId={id} />
        </TabsContent>

        <TabsContent value="documents" className="mt-5">
          <PublicDocumentsTab propertyId={id} siteId={property.site?.id ?? ''} />
        </TabsContent>
      </Tabs>

      {/* ── 다이얼로그 ─────────────────────────────────────── */}
      <ListingFormDialog
        open={listingDialog.open}
        onOpenChange={(open) => setListingDialog((prev) => ({ ...prev, open }))}
        propertyId={id}
        siteType={property.site?.type}
        listing={listingDialog.listing}
      />
      <PropertyContactAddDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        propertyId={id}
      />
      <ConsultationAddDialog
        open={consultDialog.open}
        onOpenChange={(open) => setConsultDialog((prev) => ({ ...prev, open }))}
        propertyId={id}
        suggestedContacts={suggestedContacts}
        defaultContact={consultDialog.defaultContact}
      />
      <TenantAddDialog open={tenantDialogOpen} onOpenChange={setTenantDialogOpen} propertyId={id} />
      <DealAddDialog
        open={dealDialogOpen}
        onOpenChange={setDealDialogOpen}
        propertyId={id}
        listings={listings}
        onCreated={() => setTab('deals')}
      />
      <MatchCreateDialog
        open={matchDialogOpen}
        onOpenChange={setMatchDialogOpen}
        listings={listings}
        onCreated={() => setTab('matches')}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="매물을 삭제하시겠습니까?"
        description={
          deleteTarget
            ? `${(TRANSACTION_TYPE_LABELS as Record<string, string>)[deleteTarget.transactionType] ?? deleteTarget.transactionType} · ${listingPriceLabel(deleteTarget)} 매물이 삭제됩니다. 연결된 매칭·거래 이력에 영향을 줄 수 있습니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteListingMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteListingMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 공통 소형 컴포넌트
// ─────────────────────────────────────────────────────────────

function MetaItem({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-4 shrink-0 text-muted-foreground/70" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function SectionPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="flex min-h-12 items-center justify-between border-b px-5">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-xs font-medium text-info hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <p className="text-sm text-muted-foreground">데이터를 불러오지 못했습니다.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-3.5" />
        다시 시도
      </Button>
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="border-b px-5 py-4 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"
        >
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-950">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-full items-center justify-between rounded-lg border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted/50"
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="size-4 text-info" />
        {label}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// 매물(Listing) 조건 표시
// ─────────────────────────────────────────────────────────────

function ConditionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="w-24 shrink-0 pt-0.5 text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function MaintenanceFeeChips({ includes }: { includes: string[] }) {
  if (includes.length === 0) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {includes.map((slug) => (
        <span
          key={slug}
          className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info"
        >
          {(MAINTENANCE_FEE_INCLUDE_LABELS as Record<string, string>)[slug] ?? slug}
        </span>
      ))}
    </span>
  );
}

function ListingConditionFields({
  listing,
  isCommercial,
}: {
  listing: Listing;
  isCommercial: boolean;
}) {
  return (
    <>
      <ConditionRow label="가격">
        <span className="font-medium tabular-nums">{listingPriceLabel(listing)}</span>
      </ConditionRow>
      <ConditionRow label="관리비">
        <span className="tabular-nums">{formatMoney(listing.maintenanceFee)}</span>
        <MaintenanceFeeChips includes={listing.maintenanceFeeIncludes ?? []} />
      </ConditionRow>
      <ConditionRow label="융자금/근저당">
        <span className="tabular-nums">{formatMoney(listing.loanAmount)}</span>
      </ConditionRow>
      {(isCommercial || listing.premium != null) && (
        <ConditionRow label="권리금">
          <span className="tabular-nums">{formatMoney(listing.premium)}</span>
        </ConditionRow>
      )}
      {listing.privateMemo && (
        <ConditionRow label="내부 메모">
          <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <Badge variant="secondary" className="mb-1 border-0 text-[10px]">
                내부 전용 — 외부 비공개
              </Badge>
              <p className="whitespace-pre-wrap text-sm leading-5">{listing.privateMemo}</p>
            </div>
          </div>
        </ConditionRow>
      )}
      {listing.memo && (
        <ConditionRow label="메모">
          <p className="whitespace-pre-wrap text-sm leading-5">{listing.memo}</p>
        </ConditionRow>
      )}
    </>
  );
}

function ListingRow({
  listing,
  isCommercial,
  onEdit,
  onDelete,
  onToggleHidden,
  toggleHiddenPending,
}: {
  listing: Listing;
  isCommercial: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  toggleHiddenPending: boolean;
}) {
  return (
    <div className={cn('px-5 py-4', listing.isHidden && 'bg-muted/30')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StatusBadge kind="transactionType" status={listing.transactionType} />
          <p className="font-medium tabular-nums text-slate-950">{listingPriceLabel(listing)}</p>
          <StatusBadge kind="checkStatus" status={listing.checkStatus} size="sm" />
          {listing.isHidden && (
            <Badge variant="outline" className="text-[10px]">
              숨김
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={toggleHiddenPending}
            onClick={onToggleHidden}
            title={listing.isHidden ? '목록에 다시 표시' : '목록에서 숨김'}
          >
            {listing.isHidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {listing.isHidden ? '표시' : '숨김'}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onEdit}>
            <Edit3 className="size-3.5" />
            수정
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            삭제
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <ListingConditionFields listing={listing} isCommercial={isCommercial} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        등록 {formatDate(listing.createdAt)} · 수정 {formatDate(listing.updatedAt)}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 관련인 / 임차인 / 매칭 / 상담 / 거래 행
// ─────────────────────────────────────────────────────────────

function ContactRow({
  propertyContact,
  onConsult,
}: {
  propertyContact: PropertyContact;
  onConsult: (contact: ContactRef) => void;
}) {
  const contact = propertyContact.contact;
  const name = contact?.name ?? '이름 없음';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <AvatarLabel name={name} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-950">{name}</p>
            <Badge variant="secondary" className="border-0 text-[10px]">
              {roleLabels[propertyContact.role] ?? propertyContact.role}
            </Badge>
            {propertyContact.shareRatio !== null && (
              <Badge variant="outline" className="text-[10px]">
                지분 {propertyContact.shareRatio}%
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {contact?.phone ? formatPhone(contact.phone) : '연락처 없음'}
            {propertyContact.memo ? ` · ${propertyContact.memo}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {contact?.phone && (
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <a href={`tel:${contact.phone}`} title={`${name}에게 전화`}>
              <Phone className="size-4" />
            </a>
          </Button>
        )}
        {contact && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="상담 기록 추가"
            onClick={() => onConsult({ id: contact.id, name: contact.name, phone: contact.phone ?? null })}
          >
            <MessageSquare className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function TenantRow({ tenant }: { tenant: Tenant }) {
  const name = tenant.contact?.name ?? '이름 없음';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <AvatarLabel name={name} muted />
        <div className="min-w-0">
          <p className="font-medium text-slate-950">{name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tenant.contact?.phone ? formatPhone(tenant.contact.phone) : '연락처 없음'} ·{' '}
            {getTenantPeriod(tenant)}
          </p>
        </div>
      </div>
      <Badge variant="outline" className="text-[10px]">
        {tenantStatusLabel(tenant.status)}
      </Badge>
    </div>
  );
}

function MatchRow({ match }: { match: Match }) {
  const buyer = match.buyerRequirement?.contact;
  const budget = formatBuyerBudget(match);

  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className="mt-1 h-10 w-0.5 rounded-full bg-success" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-950">{buyer?.name ?? '매수 고객'}</p>
          <StatusBadge kind="matchStage" status={match.stage} size="sm" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {budget}
          {match.memo ? ` · ${match.memo}` : ''}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{formatDate(match.updatedAt)}</span>
    </div>
  );
}

function ConsultationRow({
  consultation,
  compact,
}: {
  consultation: Consultation;
  compact?: boolean;
}) {
  const typeLabels: Record<string, string> = { phone: '전화', visit: '방문', online: '온라인' };
  return (
    <div className={cn('px-5 py-4', compact && 'py-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          {typeLabels[consultation.type] ?? consultation.type}
        </Badge>
        <span className="text-xs text-muted-foreground">{formatDateTime(consultation.createdAt)}</span>
        {consultation.contact?.name && (
          <span className="text-xs text-muted-foreground">· {consultation.contact.name}</span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">{consultation.content}</p>
    </div>
  );
}

function DealRow({ deal }: { deal: Deal }) {
  const price =
    deal.transactionType === 'monthly'
      ? formatRent(deal.agreedDeposit, deal.agreedMonthlyRent)
      : formatMoney(deal.agreedPrice ?? deal.agreedDeposit);

  return (
    <Link
      to="/deals"
      className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
          <StatusBadge kind="transactionType" status={deal.transactionType} size="sm" />
          {deal.isCancelled && (
            <Badge variant="outline" className="text-[10px] text-destructive">
              취소됨
            </Badge>
          )}
          <span className="font-medium tabular-nums text-slate-950">{price}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {deal.buyerContact?.name ? `매수 ${deal.buyerContact.name}` : '매수인 미지정'}
          {deal.sellerContact?.name ? ` · 매도 ${deal.sellerContact.name}` : ''}
          {deal.isJointBrokerage ? ' · 공동중개' : ''}
          {deal.memo ? ` · ${deal.memo}` : ''}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatDate(deal.stageChangedAt ?? deal.updatedAt)}
      </span>
    </Link>
  );
}

function PriceHistoryRow({ history, listing }: { history: ListingPriceHistory; listing: Listing }) {
  const changes: string[] = [];
  if (history.priceBefore !== history.priceAfter) {
    changes.push(`가격 ${formatMoney(history.priceBefore)} → ${formatMoney(history.priceAfter)}`);
  }
  if (history.depositBefore !== history.depositAfter) {
    changes.push(`보증금 ${formatMoney(history.depositBefore)} → ${formatMoney(history.depositAfter)}`);
  }
  if (history.monthlyRentBefore !== history.monthlyRentAfter) {
    changes.push(
      `월세 ${formatMoney(history.monthlyRentBefore)} → ${formatMoney(history.monthlyRentAfter)}`,
    );
  }

  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <TrendingUp className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
          <span className="text-sm tabular-nums text-slate-950">
            {changes.length > 0 ? changes.join(' · ') : '변경 내용 없음'}
          </span>
        </div>
        {history.reason && <p className="mt-0.5 text-xs text-muted-foreground">{history.reason}</p>}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(history.createdAt)}</span>
    </div>
  );
}

function AvatarLabel({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
        muted ? 'bg-slate-100 text-slate-500' : 'bg-info-soft text-info',
      )}
    >
      {name.trim().slice(0, 1) || '?'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 사진 탭 (조회 전용 — 업로드는 Phase 2)
// ─────────────────────────────────────────────────────────────

const categoryLabels: Record<string, string> = {
  exterior: '외관',
  living: '거실',
  kitchen: '주방',
  bathroom: '욕실',
  bedroom: '침실',
  balcony: '베란다',
  entrance: '현관',
  parking: '주차장',
  view: '전망',
  floorplan: '평면도',
  other: '기타',
};

function PhotosTab({ propertyId }: { propertyId: string }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAll, setShowAll] = useState(false);

  const {
    data: photos,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['property-photos', propertyId],
    queryFn: () => api.propertyPhotos.listByProperty(propertyId),
  });

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const photo of photos ?? []) {
      counts.set(photo.category, (counts.get(photo.category) ?? 0) + 1);
    }

    return [
      { value: 'all', label: '전체', count: photos?.length ?? 0 },
      ...Object.entries(categoryLabels)
        .map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }))
        .filter((category) => category.count > 0),
    ];
  }, [photos]);

  const filteredPhotos = useMemo(
    () => (photos ?? []).filter((photo) => selectedCategory === 'all' || photo.category === selectedCategory),
    [photos, selectedCategory],
  );
  const heroPhoto = filteredPhotos[0] ?? null;
  const thumbnails = showAll ? filteredPhotos.slice(1) : filteredPhotos.slice(1, 8);
  const hiddenCount = showAll ? 0 : Math.max(0, filteredPhotos.length - 8);

  if (isError) {
    return <SectionError onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      <Alert>
        <ImageIcon className="size-4" />
        <AlertDescription>
          사진 업로드는 준비 중입니다. 현재는 등록된 사진 조회만 가능합니다.
        </AlertDescription>
      </Alert>

      {(photos?.length ?? 0) > 0 && (
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-background p-1">
          {categoryOptions.map((category) => (
            <button
              key={category.value}
              type="button"
              onClick={() => setSelectedCategory(category.value)}
              className={cn(
                'h-8 shrink-0 rounded-md px-3 text-xs font-medium transition-colors',
                selectedCategory === category.value
                  ? 'bg-slate-950 text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {category.label} {category.count}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">
          <Skeleton className="aspect-[16/10] rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
        </div>
      ) : !photos || photos.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="등록된 사진이 없습니다"
          description="사진 업로드(S3)는 다음 단계에서 제공됩니다."
          className="rounded-xl border bg-background py-16"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">
          {heroPhoto && <HeroPhoto photo={heroPhoto} total={filteredPhotos.length} />}
          <div className="grid grid-cols-2 gap-3 self-start">
            {thumbnails.map((photo, index) => (
              <PhotoTile key={photo.id} photo={photo} index={index + 2} />
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/50"
              >
                <span className="text-xl font-semibold text-slate-700">+{hiddenCount}</span>
                <span className="text-xs">전체 보기</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroPhoto({ photo, total }: { photo: PropertyPhoto; total: number }) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-xl border bg-slate-100">
      <img src={photo.fileUrl} alt={photo.fileName} className="size-full object-cover" />
      <div className="absolute left-4 top-4 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white">
        01 / {total} · {categoryLabels[photo.category] ?? photo.category}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 to-transparent p-5 text-white">
        <p className="text-xs text-white/75">{formatDate(photo.createdAt)} 등록</p>
        <p className="mt-1 text-lg font-semibold">{photo.memo || photo.fileName}</p>
      </div>
    </div>
  );
}

function PhotoTile({ photo, index }: { photo: PropertyPhoto; index: number }) {
  return (
    <a
      href={photo.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-slate-100 text-left"
    >
      <img
        src={photo.fileUrl}
        alt={photo.fileName}
        className="size-full object-cover transition-transform group-hover:scale-105"
      />
      <span className="absolute bottom-2 left-2 rounded bg-slate-950/65 px-2 py-0.5 text-[11px] font-medium text-white">
        {categoryLabels[photo.category] ?? photo.category} · {String(index).padStart(2, '0')}
      </span>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────
// 공적장부 탭
// ─────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { type: 'registry', title: '등기부등본', source: '대법원 인터넷등기소', cost: 700 },
  { type: 'building_ledger', title: '건축물대장', source: '세움터', cost: 0 },
  { type: 'land_ledger', title: '토지/임야대장', source: '정부24', cost: 0 },
  { type: 'cadastral_map', title: '지적도', source: '정부24', cost: 0 },
  { type: 'land_use_plan', title: '토지이용계획확인서', source: '토지이음', cost: 0 },
  { type: 'land_register', title: '대지권등록부', source: '정부24', cost: 0 },
] as const;

function PublicDocumentsTab({ propertyId, siteId }: { propertyId: string; siteId: string }) {
  const queryClient = useQueryClient();

  const {
    data: documents,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['public-documents', propertyId],
    queryFn: () => api.publicDocuments.list({ propertyId }),
  });

  const issueMutation = useMutation({
    mutationFn: (data: { type: string; title: string; cost: number; subtitle?: string }) =>
      api.publicDocuments.create({
        propertyId,
        siteId,
        type: data.type,
        title: data.title,
        cost: data.cost,
        subtitle: data.subtitle,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-documents', propertyId] });
      toast.success('발급 요청이 등록되었습니다.');
    },
    onError: () => {
      toast.error('발급 요청에 실패했습니다.');
    },
  });

  if (isError) {
    return <SectionError onRetry={() => refetch()} />;
  }

  const cards = DOCUMENT_TYPES.map((docType) => ({
    ...docType,
    latest: getLatestDocument(documents ?? [], docType.type),
  }));
  const completedCount = cards.filter((card) => card.latest?.status === 'completed').length;
  const missingCards = cards.filter((card) => !card.latest);
  const lastIssued = getLastIssuedDocument(documents ?? []);
  const totalCost = (documents ?? []).reduce((sum, document) => sum + document.cost, 0);

  const issueDocument = (docType: (typeof DOCUMENT_TYPES)[number]) => {
    if (!siteId) {
      toast.error('단지 정보가 없어 발급할 수 없습니다.');
      return;
    }

    issueMutation.mutate({
      type: docType.type,
      title: docType.title,
      cost: docType.cost,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border bg-slate-50 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <FileArchive className="size-4 text-info" />
            공적장부 발급
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            총 {DOCUMENT_TYPES.length}종 중 {completedCount}종 발급 완료 · {missingCards.length}종 미발급
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            마지막 발급 {lastIssued ? formatDate(lastIssued.issuedAt) : '—'} · 발급 비용 누적{' '}
            {totalCost.toLocaleString()}원
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="gap-1.5 bg-slate-950 text-white hover:bg-slate-800"
            disabled={missingCards.length === 0 || issueMutation.isPending || !siteId}
            onClick={() => missingCards.forEach(issueDocument)}
          >
            {issueMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            일괄 발급 ({missingCards.length}종)
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <DocumentCard
              key={card.type}
              title={card.title}
              source={card.source}
              cost={card.cost}
              latest={card.latest}
              isPending={issueMutation.isPending}
              onIssue={() => issueDocument(card)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentCard({
  title,
  source,
  cost,
  latest,
  isPending,
  onIssue,
}: {
  title: string;
  source: string;
  cost: number;
  latest?: PublicDocument;
  isPending: boolean;
  onIssue: () => void;
}) {
  const isMissing = !latest;
  const isCompleted = latest?.status === 'completed';
  const isFailed = latest?.status === 'failed';

  return (
    <article
      className={cn('rounded-xl border bg-background p-5 shadow-sm', isMissing && 'border-dashed bg-muted/20')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex size-9 items-center justify-center rounded-lg',
              isMissing ? 'bg-slate-100 text-slate-400' : 'bg-info-soft text-info',
            )}
          >
            <FileText className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-950">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {source} · {cost > 0 ? `${cost.toLocaleString()}원` : '무료'}
            </p>
          </div>
        </div>
        <Badge
          className={cn(
            'border-0',
            isCompleted && 'bg-success-soft text-success',
            isFailed && 'bg-destructive-soft text-destructive',
            latest?.status === 'pending' && 'bg-warning-soft text-warning',
            isMissing && 'bg-warning-soft text-warning',
          )}
        >
          {isMissing ? '미발급' : isCompleted ? '발급완료' : isFailed ? '실패' : '진행중'}
        </Badge>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        {latest ? (
          <>
            <p className="text-xs text-muted-foreground">마지막 발급</p>
            <p className="mt-1 font-semibold text-slate-950">{formatDateTime(latest.issuedAt)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {latest.requestedBy?.name ?? '요청자 미상'}
              {latest.subtitle ? ` · ${latest.subtitle}` : ''}
            </p>
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            아직 발급된 기록이 없습니다. 계약 전 권리 확인을 위해 발급을 권장합니다.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!latest?.fileUrl}
          onClick={() => {
            if (latest?.fileUrl) window.open(latest.fileUrl, '_blank', 'noopener');
          }}
        >
          <Download className="size-3.5" />
          PDF
        </Button>
        <Button
          size="sm"
          variant={isMissing ? 'default' : 'outline'}
          className={cn(isMissing && 'bg-slate-950 text-white hover:bg-slate-800')}
          disabled={isPending}
          onClick={onIssue}
        >
          {isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          {isMissing ? '지금 발급' : '재발급'}
        </Button>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

function getPropertyTitle(property: Property) {
  const siteName = property.site?.name ?? '매물 상세';
  const unitLabel = getPropertyUnitLabel(property);
  return unitLabel ? `${siteName} ${unitLabel}` : siteName;
}

function getPropertyUnitLabel(property: Property) {
  const dongName =
    property.unit?.dong && !property.unit.dong.isPlaceholder ? property.unit.dong.name : '';
  return [dongName, property.unit?.name].filter(Boolean).join(' ');
}

function listingPriceLabel(listing: Listing | null) {
  if (!listing) return '—';
  if (listing.transactionType === 'monthly') {
    return formatRent(listing.deposit, listing.monthlyRent);
  }
  return formatMoney(listing.price ?? listing.deposit);
}

function getMoveInLabel(tenant?: Tenant) {
  if (!tenant) return '즉시 또는 협의';
  if (tenant.moveOutDate) return `${formatDate(tenant.moveOutDate)} 이후`;
  if (tenant.contractEnd) return `${formatDate(tenant.contractEnd)} 만료`;
  return '임차 조건 확인 필요';
}

function getTenantPeriod(tenant: Tenant) {
  if (!tenant.contractStart && !tenant.contractEnd) return '계약 기간 미등록';
  return `${formatDate(tenant.contractStart)} - ${formatDate(tenant.contractEnd)}`;
}

function tenantStatusLabel(status: string) {
  const labels: Record<string, string> = {
    residing: '거주중',
    moving_out: '퇴거 예정',
    moved: '퇴거 완료',
  };
  return labels[status] ?? status;
}

function formatBuyerBudget(match: Match) {
  const requirement = match.buyerRequirement;
  if (!requirement) return '조건 정보 없음';

  const min = requirement.priceMin ? formatMoney(requirement.priceMin) : null;
  const max = requirement.priceMax ? formatMoney(requirement.priceMax) : null;
  if (min && max) return `예산 ${min}~${max}`;
  if (max) return `예산 ${max} 이하`;
  if (min) return `예산 ${min} 이상`;
  return '예산 미등록';
}

function getLatestDocument(documents: PublicDocument[], type: string) {
  return documents
    .filter((document) => document.type === type)
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0];
}

function getLastIssuedDocument(documents: PublicDocument[]) {
  return [...documents].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0];
}
