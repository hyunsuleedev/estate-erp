import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Edit3,
  FileArchive,
  FileText,
  Home,
  ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Ruler,
  Share2,
  Star,
  Upload,
  User,
  Users,
} from 'lucide-react';
import type {
  Consultation,
  Match,
  Property,
  PropertyContact,
  PropertyListing,
  PropertyPhoto,
  PublicDocument,
  Tenant,
} from '@estate-erp/api-client';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const transactionTypeLabels: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

const transactionTypeColors: Record<string, string> = {
  sale: 'bg-rose-50 text-rose-700',
  jeonse: 'bg-blue-50 text-blue-700',
  monthly: 'bg-cyan-50 text-cyan-700',
};

const checkStatusLabels: Record<string, string> = {
  unverified: '미확인',
  verified: '확인완료',
  in_contract: '거래중',
  hold: '보류',
  done: '종료',
};

const checkStatusColors: Record<string, string> = {
  unverified: 'bg-gray-100 text-gray-600',
  verified: 'bg-emerald-50 text-emerald-700',
  in_contract: 'bg-blue-50 text-blue-700',
  hold: 'bg-amber-50 text-amber-700',
  done: 'bg-gray-50 text-gray-400',
};

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

const matchStageLabels: Record<string, string> = {
  suggested: '제안됨',
  buyerContacted: '매수자 연락',
  viewing: '방문 예정',
  ownerContacted: '소유주 확인',
  negotiating: '협상중',
  dealCreated: '거래 생성',
  closed: '종료',
};

export const Route = createFileRoute('/_authenticated/properties/$id')({
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { id } = Route.useParams();

  const { data: property, isLoading } = useQuery({
    queryKey: ['properties', id],
    queryFn: () => api.properties.findOne(id),
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

  const { data: allMatches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.matches.findAll(),
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

  if (!property) {
    return <div className="py-12 text-center text-sm text-muted-foreground">매물을 찾을 수 없습니다.</div>;
  }

  const listings = property.listings ?? [];
  const primaryListing = listings[0] ?? null;
  const relatedContacts = propertyContacts ?? property.propertyContacts ?? [];
  const activeTenants = tenants ?? property.tenants ?? [];
  const consultations = consultationsData?.items ?? property.consultations ?? [];
  const matches = allMatches.filter((match) => match.propertyId === id || match.property?.id === id);
  const title = getPropertyTitle(property);
  const unitLabel = getPropertyUnitLabel(property);
  const address = property.site?.roadAddress || property.site?.jibunAddress || '-';
  const areaLabel = formatPropertyArea(property.unit?.exclusiveAreaM2, property.unit?.supplyAreaM2);
  const floorLabel = property.unit?.floor ? `${property.unit.floor}층` : '-';
  const siteType = property.site?.type ? siteTypeLabels[property.site.type] ?? property.site.type : '매물';

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <ChevronLeft className="size-3.5" />
            이전
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            다음
            <ChevronRight className="size-3.5" />
          </Button>
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
                <Badge className={cn('border-0', transactionTypeColors[primaryListing.transactionType])}>
                  {transactionTypeLabels[primaryListing.transactionType] ?? primaryListing.transactionType}
                </Badge>
              )}
              {primaryListing && (
                <Badge className={cn('border-0', checkStatusColors[primaryListing.checkStatus])}>
                  {checkStatusLabels[primaryListing.checkStatus] ?? primaryListing.checkStatus}
                </Badge>
              )}
              <Badge variant="secondary" className="border-0">
                {property.unit?.siteUnitType?.name ?? siteType}
              </Badge>
            </div>

            <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">
                  {title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <MetaItem icon={MapPin}>{address}</MetaItem>
                  <MetaItem icon={Ruler}>{areaLabel}</MetaItem>
                  <MetaItem icon={Building2}>{floorLabel}</MetaItem>
                  <MetaItem icon={CalendarClock}>수정 {formatDateShort(property.updatedAt)}</MetaItem>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Edit3 className="size-4" />
                  수정
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Share2 className="size-4" />
                  공유
                </Button>
                <Button size="sm" className="gap-1.5 bg-slate-950 text-white hover:bg-slate-800">
                  <Users className="size-4" />
                  매칭 생성
                </Button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div className="text-3xl font-semibold tracking-tight text-slate-950">
                {formatListingPrice(primaryListing)}
              </div>
              <span className="mb-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {primaryListing ? `등록 ${formatDateShort(primaryListing.createdAt)}` : '거래 정보 없음'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <Tabs defaultValue="overview" className="gap-0">
        <div className="border-b">
          <TabsList variant="line" className="h-11 w-full justify-start overflow-x-auto rounded-none p-0">
            <TabsTrigger value="overview" className="h-11 flex-none px-4">개요</TabsTrigger>
            <TabsTrigger value="matches" className="h-11 flex-none px-4">매칭 {matches.length}</TabsTrigger>
            <TabsTrigger value="consultations" className="h-11 flex-none px-4">상담 {consultations.length}</TabsTrigger>
            <TabsTrigger value="listings" className="h-11 flex-none px-4">거래 정보 {listings.length}</TabsTrigger>
            <TabsTrigger value="contacts" className="h-11 flex-none px-4">관련인 {relatedContacts.length + activeTenants.length}</TabsTrigger>
            <TabsTrigger value="photos" className="h-11 flex-none px-4">사진</TabsTrigger>
            <TabsTrigger value="documents" className="h-11 flex-none px-4">공적장부</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <SectionPanel title="기본 정보" action="편집">
                <InfoGrid
                  items={[
                    ['거래 유형', primaryListing ? transactionTypeLabels[primaryListing.transactionType] ?? primaryListing.transactionType : '-'],
                    ['확인 상태', primaryListing ? checkStatusLabels[primaryListing.checkStatus] ?? primaryListing.checkStatus : '-'],
                    ['매물 유형', siteType],
                    ['단지/건물', property.site?.name ?? '-'],
                    ['전용면적', formatArea(property.unit?.exclusiveAreaM2)],
                    ['공급면적', formatArea(property.unit?.supplyAreaM2)],
                    ['동/호수', unitLabel || '-'],
                    ['층', floorLabel],
                    ['거주자', activeTenants[0]?.contact?.name ?? '미등록'],
                    ['입주 가능', getMoveInLabel(activeTenants[0])],
                  ]}
                />
                {property.memo && (
                  <div className="border-t px-5 py-4">
                    <div className="text-xs font-medium text-muted-foreground">메모</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{property.memo}</p>
                  </div>
                )}
              </SectionPanel>

              <SectionPanel title={`소유주 · 관련인 ${relatedContacts.length}`} action="+ 관련인 추가">
                {relatedContacts.length === 0 ? (
                  <EmptyState icon={User} text="등록된 관련인이 없습니다." />
                ) : (
                  <div className="divide-y">
                    {relatedContacts.slice(0, 4).map((contact) => (
                      <ContactRow key={contact.id} propertyContact={contact} />
                    ))}
                  </div>
                )}
              </SectionPanel>

              <SectionPanel title={`매칭 중인 매수 고객 ${matches.length}`} action="전체 매칭 보기">
                {matches.length === 0 ? (
                  <EmptyState icon={Users} text="이 매물에 연결된 매칭이 없습니다." />
                ) : (
                  <div className="divide-y">
                    {matches.slice(0, 4).map((match) => (
                      <MatchRow key={match.id} match={match} />
                    ))}
                  </div>
                )}
              </SectionPanel>
            </div>

            <aside className="space-y-4">
              <SectionPanel title="빠른 액션">
                <div className="space-y-2 p-4">
                  <QuickAction icon={Phone} label="소유주 전화 걸기" shortcut="P" />
                  <QuickAction icon={MessageSquare} label="상담 기록 추가" shortcut="N" />
                  <QuickAction icon={CircleDollarSign} label="가격 수정" />
                  <QuickAction icon={Share2} label="공동중개망 공유" />
                </div>
              </SectionPanel>

              <SectionPanel title="가격 정보" action="전체">
                <div className="space-y-3 p-5">
                  {listings.length === 0 ? (
                    <EmptyState icon={CircleDollarSign} text="등록된 거래 가격이 없습니다." compact />
                  ) : (
                    listings.slice(0, 3).map((listing) => (
                      <div key={listing.id} className="flex items-start gap-3">
                        <span className="mt-1.5 size-2 rounded-full bg-emerald-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-950">{formatListingPrice(listing)}</span>
                            <Badge className={cn('border-0 text-[10px]', transactionTypeColors[listing.transactionType])}>
                              {transactionTypeLabels[listing.transactionType] ?? listing.transactionType}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatDateShort(listing.updatedAt)} · {checkStatusLabels[listing.checkStatus] ?? listing.checkStatus}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SectionPanel>

              <SectionPanel title="최근 상담" action="+ 기록">
                {consultations.length === 0 ? (
                  <EmptyState icon={MessageSquare} text="상담 기록이 없습니다." />
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
          <SectionPanel title={`매칭 ${matches.length}`}>
            {matches.length === 0 ? (
              <EmptyState icon={Users} text="이 매물에 연결된 매칭이 없습니다." />
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
          <SectionPanel title={`상담 이력 ${consultations.length}`} action="+ 상담 추가">
            {consultations.length === 0 ? (
              <EmptyState icon={MessageSquare} text="상담 기록이 없습니다." />
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
          <SectionPanel title={`거래 정보 ${listings.length}`} action="+ 거래 추가">
            {listings.length === 0 ? (
              <EmptyState icon={Home} text="등록된 거래 정보가 없습니다." />
            ) : (
              <div className="divide-y">
                {listings.map((listing) => (
                  <ListingRow key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </SectionPanel>
        </TabsContent>

        <TabsContent value="contacts" className="mt-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionPanel title={`소유주 · 관련인 ${relatedContacts.length}`} action="+ 관련인 추가">
              {relatedContacts.length === 0 ? (
                <EmptyState icon={User} text="등록된 관련인이 없습니다." />
              ) : (
                <div className="divide-y">
                  {relatedContacts.map((contact) => (
                    <ContactRow key={contact.id} propertyContact={contact} />
                  ))}
                </div>
              )}
            </SectionPanel>
            <SectionPanel title={`임차인 ${activeTenants.length}`} action="+ 임차인 추가">
              {activeTenants.length === 0 ? (
                <EmptyState icon={Users} text="등록된 임차인이 없습니다." />
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
    </div>
  );
}

function MetaItem({
  icon: Icon,
  children,
}: {
  icon: typeof MapPin;
  children: ReactNode;
}) {
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
  action?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="flex min-h-12 items-center justify-between border-b px-5">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {action && (
          <button className="text-xs font-medium text-blue-600 hover:text-blue-700">
            {action}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="border-b px-5 py-4 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
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
  shortcut,
}: {
  icon: typeof Phone;
  label: string;
  shortcut?: string;
}) {
  return (
    <button className="flex h-10 w-full items-center justify-between rounded-lg border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted/50">
      <span className="inline-flex items-center gap-2">
        <Icon className="size-4 text-blue-600" />
        {label}
      </span>
      {shortcut && <span className="text-[11px] text-muted-foreground">⌘ {shortcut}</span>}
    </button>
  );
}

function ContactRow({ propertyContact }: { propertyContact: PropertyContact }) {
  const name = propertyContact.contact?.name ?? '이름 없음';

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
            {propertyContact.contact?.phone ?? '연락처 없음'}
            {propertyContact.memo ? ` · ${propertyContact.memo}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8">
          <Phone className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8">
          <MessageSquare className="size-4" />
        </Button>
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
            {tenant.contact?.phone ?? '연락처 없음'} · {getTenantPeriod(tenant)}
          </p>
        </div>
      </div>
      <Badge variant="outline" className="text-[10px]">
        {tenant.status}
      </Badge>
    </div>
  );
}

function MatchRow({ match }: { match: Match }) {
  const buyer = match.buyerRequirement?.contact;
  const budget = formatBuyerBudget(match);

  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className="mt-1 h-10 w-0.5 rounded-full bg-emerald-500" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-950">{buyer?.name ?? '매수 고객'}</p>
          <Badge className="border-0 bg-emerald-50 text-[10px] text-emerald-700">
            {matchStageLabels[match.stage] ?? match.stage}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {budget}
          {match.memo ? ` · ${match.memo}` : ''}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{formatDateShort(match.updatedAt)}</span>
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
  return (
    <div className={cn('px-5 py-4', compact && 'py-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          {consultation.type}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(consultation.createdAt)}
        </span>
        {consultation.contact?.name && (
          <span className="text-xs text-muted-foreground">· {consultation.contact.name}</span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">{consultation.content}</p>
    </div>
  );
}

function ListingRow({ listing }: { listing: PropertyListing }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <Badge className={cn('border-0', transactionTypeColors[listing.transactionType])}>
          {transactionTypeLabels[listing.transactionType] ?? listing.transactionType}
        </Badge>
        <div>
          <p className="font-medium text-slate-950">{formatListingPrice(listing)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            수정 {formatDateShort(listing.updatedAt)}
            {listing.memo ? ` · ${listing.memo}` : ''}
          </p>
        </div>
      </div>
      <Badge className={cn('border-0', checkStatusColors[listing.checkStatus])}>
        {checkStatusLabels[listing.checkStatus] ?? listing.checkStatus}
      </Badge>
    </div>
  );
}

function AvatarLabel({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <div className={cn(
      'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
      muted ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700',
    )}>
      {name.trim().slice(0, 1) || '?'}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
  compact,
}: {
  icon: typeof User;
  text: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 text-center text-muted-foreground', compact ? 'py-4' : 'py-10')}>
      <Icon className="size-7 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 사진 탭
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

  const { data: photos, isLoading } = useQuery({
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
  const thumbnails = filteredPhotos.slice(1, 8);
  const hiddenCount = Math.max(0, filteredPhotos.length - 8);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Download className="size-3.5" />
            일괄 다운로드
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <MoreHorizontal className="size-3.5" />
            순서 편집
          </Button>
          <Button size="sm" className="gap-1.5 bg-slate-950 text-xs text-white hover:bg-slate-800">
            <Upload className="size-3.5" />
            사진 추가
          </Button>
        </div>
      </div>

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
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-background py-16 text-center">
          <ImageIcon className="size-9 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">등록된 사진이 없습니다.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">
          {heroPhoto && <HeroPhoto photo={heroPhoto} total={filteredPhotos.length} />}
          <div className="grid grid-cols-2 gap-3">
            {thumbnails.map((photo, index) => (
              <PhotoTile key={photo.id} photo={photo} index={index + 2} />
            ))}
            {hiddenCount > 0 && (
              <button className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 text-muted-foreground">
                <span className="text-xl font-semibold text-slate-700">+{hiddenCount}</span>
                <span className="text-xs">더 보기</span>
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
    <div className="group relative aspect-[16/10] overflow-hidden rounded-xl border bg-slate-100">
      <img src={photo.fileUrl} alt={photo.fileName} className="size-full object-cover" />
      <div className="absolute left-4 top-4 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white">
        01 / {total} · {categoryLabels[photo.category] ?? photo.category}
      </div>
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <Button size="sm" variant="secondary" className="h-8 gap-1.5 bg-white/90 text-xs">
          <Star className="size-3.5" />
          대표
        </Button>
        <Button size="icon" variant="secondary" className="size-8 rounded-full bg-slate-950/60 text-white hover:bg-slate-950/80">
          <MoreHorizontal className="size-4" />
        </Button>
      </div>
      <button className="absolute left-4 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/50 text-white opacity-90">
        <ChevronLeft className="size-5" />
      </button>
      <button className="absolute right-4 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/50 text-white opacity-90">
        <ChevronRight className="size-5" />
      </button>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 to-transparent p-5 text-white">
        <p className="text-xs text-white/75">{formatDateShort(photo.createdAt)} 등록</p>
        <p className="mt-1 text-lg font-semibold">{photo.memo || photo.fileName}</p>
      </div>
    </div>
  );
}

function PhotoTile({ photo, index }: { photo: PropertyPhoto; index: number }) {
  return (
    <button className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-slate-100 text-left">
      <img src={photo.fileUrl} alt={photo.fileName} className="size-full object-cover transition-transform group-hover:scale-105" />
      <span className="absolute bottom-2 left-2 rounded bg-slate-950/65 px-2 py-0.5 text-[11px] font-medium text-white">
        {categoryLabels[photo.category] ?? photo.category} · {String(index).padStart(2, '0')}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// 공적장부 탭
// ─────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  {
    type: 'registry',
    title: '등기부등본',
    source: '대법원 인터넷등기소',
    cost: 700,
  },
  {
    type: 'building_ledger',
    title: '건축물대장',
    source: '세움터',
    cost: 0,
  },
  {
    type: 'land_ledger',
    title: '토지/임야대장',
    source: '정부24',
    cost: 0,
  },
  {
    type: 'cadastral_map',
    title: '지적도',
    source: '정부24',
    cost: 0,
  },
  {
    type: 'land_use_plan',
    title: '토지이용계획확인서',
    source: '토지이음',
    cost: 0,
  },
  {
    type: 'land_register',
    title: '대지권등록부',
    source: '정부24',
    cost: 0,
  },
] as const;

function PublicDocumentsTab({
  propertyId,
  siteId,
}: {
  propertyId: string;
  siteId: string;
}) {
  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery({
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
            <FileArchive className="size-4 text-blue-600" />
            공적장부 발급
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            총 {DOCUMENT_TYPES.length}종 중 {completedCount}종 발급 완료 · {missingCards.length}종 미발급
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            마지막 발급 {lastIssued ? formatDateShort(lastIssued.issuedAt) : '-'} · 발급 비용 누적 {totalCost.toLocaleString()}원
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-1.5 bg-background">
            <Download className="size-4" />
            ZIP 일괄 다운로드
          </Button>
          <Button
            className="gap-1.5 bg-slate-950 text-white hover:bg-slate-800"
            disabled={missingCards.length === 0 || issueMutation.isPending || !siteId}
            onClick={() => missingCards.forEach(issueDocument)}
          >
            {issueMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
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
    <article className={cn('rounded-xl border bg-background p-5 shadow-sm', isMissing && 'border-dashed bg-muted/20')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex size-9 items-center justify-center rounded-lg',
            isMissing ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-700',
          )}>
            <FileText className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-950">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {source} · {cost > 0 ? `${cost.toLocaleString()}원` : '무료'}
            </p>
          </div>
        </div>
        <Badge className={cn(
          'border-0',
          isCompleted && 'bg-emerald-50 text-emerald-700',
          isFailed && 'bg-rose-50 text-rose-700',
          latest?.status === 'pending' && 'bg-amber-50 text-amber-700',
          isMissing && 'bg-amber-50 text-amber-700',
        )}>
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
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!latest?.fileUrl}>
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

function getPropertyTitle(property: Property) {
  const siteName = property.site?.name ?? '매물 상세';
  const unitLabel = getPropertyUnitLabel(property);
  return unitLabel ? `${siteName} ${unitLabel}` : siteName;
}

function getPropertyUnitLabel(property: Property) {
  const dongName = property.unit?.dong && !property.unit.dong.isPlaceholder
    ? property.unit.dong.name
    : '';
  return [dongName, property.unit?.name].filter(Boolean).join(' ');
}

function formatPropertyArea(exclusive?: number | null, supply?: number | null) {
  if (exclusive && supply) {
    return `${formatArea(exclusive)} / 공급 ${formatArea(supply)}`;
  }
  return formatArea(exclusive ?? supply);
}

function formatArea(area?: number | null) {
  if (!area) return '-';
  const value = Number(area);
  return `${value.toFixed(1)}㎡ · ${sqmToPyeong(value)}평`;
}

function formatListingPrice(listing?: PropertyListing | null) {
  if (!listing) return '-';
  if (listing.transactionType === 'monthly') {
    const deposit = listing.deposit ? formatPrice(listing.deposit) : '-';
    const rent = listing.monthlyRent ? `${listing.monthlyRent.toLocaleString()}만` : '-';
    return `${deposit} / ${rent}`;
  }
  return listing.price ? `${formatPrice(listing.price)}원` : '-';
}

function formatDateShort(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMoveInLabel(tenant?: Tenant) {
  if (!tenant) return '즉시 또는 협의';
  if (tenant.moveOutDate) return `${formatDateShort(tenant.moveOutDate)} 이후`;
  if (tenant.contractEnd) return `${formatDateShort(tenant.contractEnd)} 만료`;
  return '임차 조건 확인 필요';
}

function getTenantPeriod(tenant: Tenant) {
  if (!tenant.contractStart && !tenant.contractEnd) return '계약 기간 미등록';
  return `${formatDateShort(tenant.contractStart)} - ${formatDateShort(tenant.contractEnd)}`;
}

function formatBuyerBudget(match: Match) {
  const requirement = match.buyerRequirement;
  if (!requirement) return '조건 정보 없음';

  const min = requirement.priceMin ? formatPrice(requirement.priceMin) : null;
  const max = requirement.priceMax ? formatPrice(requirement.priceMax) : null;
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
