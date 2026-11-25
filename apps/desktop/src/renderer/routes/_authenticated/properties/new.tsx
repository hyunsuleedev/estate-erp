import { createFileRoute } from '@tanstack/react-router';
import { PropertyRegistrationForm, type PropertyRegistrationSearch } from './-property-registration-form';

export const Route = createFileRoute('/_authenticated/properties/new')({
  validateSearch: (search: Record<string, unknown>): PropertyRegistrationSearch => ({
    siteId: typeof search.siteId === 'string' && search.siteId ? search.siteId : undefined,
    dongId: typeof search.dongId === 'string' && search.dongId ? search.dongId : undefined,
    unitId: typeof search.unitId === 'string' && search.unitId ? search.unitId : undefined,
    // 프로젝트의 "새 매물 의뢰 등록"이 대표 고객을 소유자로 채워 연다
    ownerContactId:
      typeof search.ownerContactId === 'string' && search.ownerContactId ? search.ownerContactId : undefined,
    // 프로젝트에서 열면 저장·취소 뒤 그 프로젝트로 돌아간다(uuid가 아니면 무시)
    projectId:
      search.from === 'project' &&
      typeof search.projectId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.projectId)
        ? search.projectId
        : undefined,
  }),
  component: NewPropertyPage,
});

function NewPropertyPage() {
  return <PropertyRegistrationForm searchParams={Route.useSearch()} />;
}
