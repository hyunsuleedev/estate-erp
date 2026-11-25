import { createFileRoute } from '@tanstack/react-router';
import { UnitPropertyDetailScreen } from './-detail/UnitPropertyDetailScreen';

// 관리호수가 아직 없는 호실도 상세를 열 수 있게 호실 id로 여는 경로 (관리단지의 호실 패널에서 확장)
export const Route = createFileRoute('/_authenticated/properties/unit/$unitId')({
  component: UnitPropertyDetailPage,
});

function UnitPropertyDetailPage() {
  const { unitId } = Route.useParams();
  return <UnitPropertyDetailScreen key={unitId} unitId={unitId} />;
}
