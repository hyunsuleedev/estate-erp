import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Handshake,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type {
  Deal,
  Listing,
  Match,
  Property,
  Tenant,
} from '@estate-erp/api-client';
import { TRANSACTION_TYPE_LABELS } from '@estate-erp/shared';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  formatArea,
  formatDate,
  formatMoney,
  formatRent,
} from '@/lib/format';
import { ConfirmDialog, StatusBadge } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ConsultationAddDialog,
  DealAddDialog,
  ListingFormDialog,
  MatchCreateDialog,
  PropertyContactAddDialog,
  TenantAddDialog,
} from './-property-detail-dialogs';
import { PropertyDetailHeader } from './-detail/PropertyDetailHeader';
import { QuickActionsPanel } from './-detail/actions/QuickActionsPanel';
import { ExpiryCard } from './-detail/cards/ExpiryCard';
import { SideCard, SideCardRow } from './-detail/cards/SideCard';
import { ActiveMatchesSection } from './-detail/sections/ActiveMatchesSection';
import { ActivityTimelineSection } from './-detail/sections/ActivityTimelineSection';
import { ListingsSection } from './-detail/sections/ListingsSection';
import {
  MainSection,
  MainSectionEmpty,
} from './-detail/sections/MainSection';
import { PeopleConsultationsSection } from './-detail/sections/PeopleConsultationsSection';
import {
  formatDateShort,
  getPropertyUnitLabel,
  siteTypeLabels,
} from './-detail/utils';

export const Route = createFileRoute('/_authenticated/properties/$id')({
  component: PropertyDetailPage,
});

interface ContactRef {
  id: string;
  name: string;
  phone: string | null;
  label?: string;
}

function PropertyDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [listingDialog, setListingDialog] = useState<{
    open: boolean;
    listing: Listing | null;
  }>({ open: false, listing: null });
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [consultDialog, setConsultDialog] = useState<{
    open: boolean;
    defaultContact: ContactRef | null;
  }>({ open: false, defaultContact: null });
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);

  const propertyQuery = useQuery({
    queryKey: ['properties', id],
    queryFn: () => api.properties.findOne(id),
  });
  const listingsQuery = useQuery({
    queryKey: ['listings', { propertyId: id }],
    queryFn: () => api.listings.findAll({ propertyId: id, limit: 50 }),
  });
  const propertyContactsQuery = useQuery({
    queryKey: ['property-contacts', id],
    queryFn: () => api.propertyContacts.findByProperty(id),
  });
  const tenantsQuery = useQuery({
    queryKey: ['tenants', id],
    queryFn: () => api.tenants.findByProperty(id),
  });
  const consultationsQuery = useQuery({
    queryKey: ['consultations', 'property', id],
    queryFn: () =>
      api.consultations.findAll({
        propertyId: id,
        limit: 50,
        sortOrder: 'desc',
      }),
  });
  const matchesQuery = useQuery({
    queryKey: ['matches', { propertyId: id }],
    queryFn: () => api.matches.findAll({ propertyId: id }),
  });
  const dealsQuery = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const listings = useMemo(
    () => listingsQuery.data?.items ?? [],
    [listingsQuery.data],
  );
  const deals = useMemo(() => {
    const listingIds = new Set(listings.map((listing) => listing.id));
    return (dealsQuery.data ?? []).filter(
      (deal) =>
        deal.propertyId === id ||
        (deal.listingId != null && listingIds.has(deal.listingId)),
    );
  }, [dealsQuery.data, id, listings]);

  const deleteListingMutation = useMutation({
    mutationFn: (listingId: string) => api.listings.remove(listingId),
    onSuccess: () => {
      toast.success('거래 조건이 삭제되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['listings'] });
      void queryClient.invalidateQueries({ queryKey: ['properties', id] });
      setDeleteTarget(null);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : '거래 조건을 삭제하지 못했습니다.',
      ),
  });

  if (propertyQuery.isLoading) {
    return <PropertyDetailSkeleton />;
  }

  if (propertyQuery.isError) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          매물 정보를 불러오지 못했습니다.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => propertyQuery.refetch()}
        >
          <RefreshCw className="size-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  const property = propertyQuery.data;
  if (!property) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        매물을 찾을 수 없습니다.
      </div>
    );
  }

  const primaryListing = listings[0] ?? null;
  const propertyContacts =
    propertyContactsQuery.data ?? property.propertyContacts ?? [];
  const tenants = tenantsQuery.data ?? property.tenants ?? [];
  const consultations =
    consultationsQuery.data?.items ?? property.consultations ?? [];
  const matches = matchesQuery.data ?? [];
  const knownContacts = collectKnownContacts(
    propertyContacts,
    tenants,
    matches,
    consultations,
  );
  const ownerContact = propertyContacts.find(
    (propertyContact) =>
      (propertyContact.role === 'owner' ||
        propertyContact.role === 'co_owner') &&
      propertyContact.contact?.phone,
  )?.contact;

  const openListingDialog = (listing: Listing | null) =>
    setListingDialog({ open: true, listing });
  const openConsultDialog = (contactId?: string) => {
    const contact = contactId
      ? knownContacts.find((candidate) => candidate.id === contactId) ?? null
      : null;
    setConsultDialog({ open: true, defaultContact: contact });
  };
  const handleOwnerCall = () => {
    if (!ownerContact?.phone) {
      toast.error('소유주 연락처가 등록되어 있지 않습니다.');
      return;
    }
    window.location.href = `tel:${ownerContact.phone}`;
  };
  const handleMatchOpen = () => {
    if (listings.length === 0) {
      toast.error('매칭을 만들려면 거래 조건을 먼저 등록하세요.');
      return;
    }
    setMatchDialogOpen(true);
  };
  const handleDealOpen = () => {
    if (listings.length === 0) {
      toast.error('거래를 만들려면 거래 조건을 먼저 등록하세요.');
      return;
    }
    setDealDialogOpen(true);
  };

  return (
    <div
      data-property-detail-page
      className="-m-4 min-h-[calc(100%+2rem)] bg-[#f7f7f5]"
    >
      <PropertyDetailHeader
        property={property}
        primaryListing={primaryListing}
        listingCount={listings.length}
        onEdit={() => openListingDialog(primaryListing)}
        onCreateMatch={handleMatchOpen}
      />

      <div className="mx-auto grid w-full max-w-[1440px] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-6">
        <main className="min-w-0 space-y-6">
          {listingsQuery.isError ? (
            <QueryError
              label="거래 조건을 불러오지 못했습니다."
              onRetry={() => listingsQuery.refetch()}
            />
          ) : (
            <ListingsSection
              listings={listings}
              propertyId={id}
              onAddListing={() => openListingDialog(null)}
              onEditListing={openListingDialog}
              onDeleteListing={setDeleteTarget}
            />
          )}

          <PeopleConsultationsSection
            propertyContacts={propertyContacts}
            tenants={tenants}
            matches={matches}
            consultations={consultations}
            onAddConsultationFor={openConsultDialog}
            onAddPropertyContact={() => setContactDialogOpen(true)}
            onAddTenant={() => setTenantDialogOpen(true)}
          />

          {matchesQuery.isError ? (
            <QueryError
              label="매칭 정보를 불러오지 못했습니다."
              onRetry={() => matchesQuery.refetch()}
            />
          ) : (
            <ActiveMatchesSection matches={matches} />
          )}

          {dealsQuery.isError ? (
            <QueryError
              label="거래 정보를 불러오지 못했습니다."
              onRetry={() => dealsQuery.refetch()}
            />
          ) : (
            <DealProgressSection deals={deals} onCreate={handleDealOpen} />
          )}

          <ActivityTimelineSection listings={listings} matches={matches} />
        </main>

        <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
          <QuickActionsPanel
            ownerPhone={ownerContact?.phone ?? null}
            onCallOwner={handleOwnerCall}
            onAddConsultation={() => openConsultDialog()}
            onCreateMatch={handleMatchOpen}
            onCreateDeal={handleDealOpen}
            onEditListing={() => openListingDialog(primaryListing)}
          />
          <PropertyFactsCard property={property} />
          <ExpiryCard listings={listings} tenants={tenants} />
        </aside>
      </div>

      <ListingFormDialog
        open={listingDialog.open}
        onOpenChange={(open) =>
          setListingDialog((previous) => ({ ...previous, open }))
        }
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
        onOpenChange={(open) =>
          setConsultDialog((previous) => ({ ...previous, open }))
        }
        propertyId={id}
        suggestedContacts={knownContacts}
        defaultContact={consultDialog.defaultContact}
      />
      <TenantAddDialog
        open={tenantDialogOpen}
        onOpenChange={setTenantDialogOpen}
        propertyId={id}
      />
      <DealAddDialog
        open={dealDialogOpen}
        onOpenChange={setDealDialogOpen}
        propertyId={id}
        listings={listings}
      />
      <MatchCreateDialog
        open={matchDialogOpen}
        onOpenChange={setMatchDialogOpen}
        listings={listings}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="거래 조건을 삭제하시겠습니까?"
        description={
          deleteTarget
            ? `${TRANSACTION_TYPE_LABELS[deleteTarget.transactionType as keyof typeof TRANSACTION_TYPE_LABELS] ?? deleteTarget.transactionType} · ${formatListingPrice(deleteTarget)} 조건이 삭제됩니다. 연결된 매칭과 거래를 먼저 확인하세요.`
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

function PropertyDetailSkeleton() {
  return (
    <div className="-m-4 min-h-[calc(100%+2rem)] bg-[#f7f7f5]">
      <div className="border-b bg-white px-6 py-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-4 h-8 w-80" />
        <Skeleton className="mt-3 h-4 w-[480px] max-w-full" />
      </div>
      <div className="mx-auto grid max-w-[1440px] gap-5 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-44 rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-52 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function QueryError({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
      <span className="inline-flex items-center gap-2 text-[12px] text-destructive">
        <AlertCircle className="size-3.5" />
        {label}
      </span>
      <Button variant="outline" size="sm" className="h-7" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}

function PropertyFactsCard({ property }: { property: Property }) {
  const unitLabel = getPropertyUnitLabel(property) || '-';
  const siteType = property.site?.type
    ? (siteTypeLabels[property.site.type] ?? property.site.type)
    : '매물';
  const exclusiveArea =
    property.unit?.exclusiveAreaM2 ??
    property.unit?.siteUnitType?.exclusiveAreaM2;
  const supplyArea =
    property.unit?.supplyAreaM2 ?? property.unit?.siteUnitType?.supplyAreaM2;

  return (
    <SideCard title="기본 정보">
      <dl>
        <SideCardRow
          label="유형"
          value={property.unit?.siteUnitType?.name ?? siteType}
        />
        <SideCardRow label="동 · 호" value={unitLabel} />
        <SideCardRow
          label="층"
          value={property.unit?.floor != null ? `${property.unit.floor}층` : '-'}
        />
        <SideCardRow label="전용" value={formatArea(exclusiveArea)} />
        <SideCardRow label="공급" value={formatArea(supplyArea)} />
        <SideCardRow label="최근 수정" value={formatDate(property.updatedAt)} />
      </dl>
    </SideCard>
  );
}

function DealProgressSection({
  deals,
  onCreate,
}: {
  deals: Deal[];
  onCreate: () => void;
}) {
  const sortedDeals = deals
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  return (
    <MainSection
      title="거래 진행"
      count={deals.length}
      action={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
          onClick={onCreate}
        >
          <Plus className="size-3" />
          거래 생성
        </Button>
      }
    >
      {sortedDeals.length === 0 ? (
        <MainSectionEmpty text="이 매물에서 진행된 거래가 없습니다." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-white">
          {sortedDeals.map((deal) => (
            <DealRow key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </MainSection>
  );
}

function DealRow({ deal }: { deal: Deal }) {
  return (
    <article className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
        <Handshake className="size-3.5" />
      </div>
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge
            kind="transactionType"
            status={deal.transactionType}
            size="sm"
          />
          {deal.isCancelled ? (
            <Badge variant="secondary" className="border-0 text-[10px]">
              취소
            </Badge>
          ) : (
            <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
          )}
          <span className="text-[13px] font-semibold text-foreground tabular-nums">
            {formatDealPrice(deal)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {deal.buyerContact?.name ?? '매수인 미지정'}
          {deal.sellerContact?.name
            ? ` · 매도인 ${deal.sellerContact.name}`
            : ''}
          {deal.memo ? ` · ${deal.memo}` : ''}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
        <CalendarClock className="size-3" />
        {formatDateShort(deal.stageChangedAt || deal.updatedAt)}
      </span>
    </article>
  );
}

function formatDealPrice(deal: Deal) {
  if (deal.transactionType === 'monthly') {
    return formatRent(deal.agreedDeposit, deal.agreedMonthlyRent);
  }
  return formatMoney(deal.agreedPrice ?? deal.agreedDeposit);
}

function formatListingPrice(listing: Listing) {
  if (listing.transactionType === 'monthly') {
    return formatRent(listing.deposit, listing.monthlyRent);
  }
  return formatMoney(listing.price ?? listing.deposit);
}

function collectKnownContacts(
  propertyContacts: NonNullable<Property['propertyContacts']>,
  tenants: Tenant[],
  matches: Match[],
  consultations: NonNullable<Property['consultations']>,
) {
  const contacts = new Map<string, ContactRef>();
  const add = (
    contact: { id: string; name: string; phone: string | null } | null | undefined,
    label?: string,
  ) => {
    if (!contact || contacts.has(contact.id)) return;
    contacts.set(contact.id, { ...contact, label });
  };

  for (const propertyContact of propertyContacts) {
    add(
      propertyContact.contact,
      propertyContact.role === 'owner' || propertyContact.role === 'co_owner'
        ? '소유주'
        : '관련인',
    );
  }
  for (const tenant of tenants) add(tenant.contact, '임차인');
  for (const match of matches) add(match.buyerRequirement?.contact, '매수 고객');
  for (const consultation of consultations) add(consultation.contact, '상담 고객');

  return [...contacts.values()];
}
