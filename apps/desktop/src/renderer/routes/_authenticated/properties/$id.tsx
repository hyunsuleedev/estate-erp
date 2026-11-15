import { createFileRoute } from '@tanstack/react-router';
import { useRealtimeRoom } from '@/providers/realtime-provider';
import { PropertyDetailScreen } from './-detail/PropertyDetailScreen';

export const Route = createFileRoute('/_authenticated/properties/$id')({
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { id } = Route.useParams();
  // 이 매물의 변경을 main의 실시간 연결로 받는다. 탭을 닫으면 구독도 놓인다.
  useRealtimeRoom('property', id);
  return <PropertyDetailScreen propertyId={id} />;
}
