import { createFileRoute } from '@tanstack/react-router';
import { PropertyRegistrationForm, type PropertyRegistrationSearch } from './-property-registration-form';

export const Route = createFileRoute('/_authenticated/properties/new')({
  validateSearch: (search: Record<string, unknown>): PropertyRegistrationSearch => ({
    siteId: typeof search.siteId === 'string' && search.siteId ? search.siteId : undefined,
    dongId: typeof search.dongId === 'string' && search.dongId ? search.dongId : undefined,
    unitId: typeof search.unitId === 'string' && search.unitId ? search.unitId : undefined,
  }),
  component: NewPropertyPage,
});

function NewPropertyPage() {
  return <PropertyRegistrationForm searchParams={Route.useSearch()} />;
}
