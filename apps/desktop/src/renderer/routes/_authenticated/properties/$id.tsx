import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { PropertyListing } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyDetailHeader } from './-detail/PropertyDetailHeader';
import { ExpiryCard } from './-detail/cards/ExpiryCard';
import { ListingsSection } from './-detail/sections/ListingsSection';
import { TenancySection } from './-detail/sections/TenancySection';
import { PeopleConsultationsSection } from './-detail/sections/PeopleConsultationsSection';
import { ActivityTimelineSection } from './-detail/sections/ActivityTimelineSection';
import { ActiveMatchesSection } from './-detail/sections/ActiveMatchesSection';
import { QuickActionsPanel } from './-detail/actions/QuickActionsPanel';
import { AddConsultationDialog } from './-detail/dialogs/AddConsultationDialog';
import { EditListingPriceDialog } from './-detail/dialogs/EditListingPriceDialog';
import { CreateMatchDialog } from './-detail/dialogs/CreateMatchDialog';
import { comparePropertyListing } from './-detail/utils';

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
    queryFn: () =>
      api.consultations.findAll({
        propertyId: id,
        limit: 50,
        sortOrder: 'desc',
      }),
  });

  const { data: allMatches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.matches.findAll(),
  });

  // Dialog state
  const [matchOpen, setMatchOpen] = useState(false);
  const [priceDialogListing, setPriceDialogListing] =
    useState<PropertyListing | null>(null);
  const [consultationDialog, setConsultationDialog] = useState<
    { open: boolean; preselectedContactId: string }
  >({ open: false, preselectedContactId: '' });

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-7 w-72" />
          <Skeleton className="mt-2 h-3 w-96" />
        </div>
        <div className="grid flex-1 grid-cols-[260px_minmax(0,1fr)] gap-3 p-3">
          <Skeleton className="h-full rounded" />
          <Skeleton className="h-full rounded" />
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">
        매물을 찾을 수 없습니다.
      </div>
    );
  }

  const listings = property.listings ?? [];
  const sortedListings = listings.slice().sort(comparePropertyListing);
  const primaryListing = sortedListings[0] ?? null;
  const relatedContacts = propertyContacts ?? property.propertyContacts ?? [];
  const activeTenants = tenants ?? property.tenants ?? [];
  const consultations = consultationsData?.items ?? property.consultations ?? [];
  const matches = allMatches.filter(
    (m) => m.propertyId === id || m.property?.id === id,
  );
  const ownerContact =
    relatedContacts.find((c) => c.role === 'owner') ?? relatedContacts[0];
  const ownerPhone = ownerContact?.contact?.phone ?? null;

  const handleEditPriceForFirstListing = () => {
    if (sortedListings.length === 0) return;
    setPriceDialogListing(sortedListings[0]);
  };

  const openConsultationDialog = (preselectedContactId = '') =>
    setConsultationDialog({ open: true, preselectedContactId });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/20">
      <PropertyDetailHeader
        property={property}
        primaryListing={primaryListing}
        onCreateMatch={() => setMatchOpen(true)}
        onEdit={() => {
          /* 후속: 매물 편집 모달/페이지 */
        }}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Left rail — 빠른 액션 + 운영 메타 */}
        <aside className="space-y-2">
          <QuickActionsPanel
            ownerPhone={ownerPhone}
            onCallOwner={() => {
              /* CTI Phase */
            }}
            onAddConsultation={() => openConsultationDialog()}
            onCreateMatch={() => setMatchOpen(true)}
            onEditPrice={handleEditPriceForFirstListing}
            onShareNetwork={() => {
              /* Network Phase */
            }}
          />
          <ExpiryCard listings={listings} tenants={activeTenants} />
        </aside>

        {/* Main — 인물·상담 중심 */}
        <main className="space-y-4">
          <ListingsSection
            listings={listings}
            propertyId={id}
            onEditPrice={(listing) => setPriceDialogListing(listing)}
          />
          <PeopleConsultationsSection
            propertyContacts={relatedContacts}
            tenants={activeTenants}
            matches={matches}
            consultations={consultations}
            onAddConsultationFor={(contactId) => openConsultationDialog(contactId)}
          />
          {activeTenants.length > 0 && (
            <TenancySection tenants={activeTenants} />
          )}
          <ActiveMatchesSection matches={matches} />
          <ActivityTimelineSection listings={listings} matches={matches} />
        </main>
      </div>

      {/* Dialogs */}
      <AddConsultationDialog
        open={consultationDialog.open}
        onOpenChange={(open) =>
          setConsultationDialog((s) => ({ ...s, open }))
        }
        property={property}
        propertyContacts={relatedContacts}
        tenants={activeTenants}
        matches={matches}
        preselectedContactId={consultationDialog.preselectedContactId}
      />
      <EditListingPriceDialog
        open={priceDialogListing !== null}
        onOpenChange={(open) => !open && setPriceDialogListing(null)}
        listing={priceDialogListing}
        propertyId={id}
      />
      <CreateMatchDialog
        open={matchOpen}
        onOpenChange={setMatchOpen}
        listings={listings}
        propertyId={id}
      />
    </div>
  );
}
