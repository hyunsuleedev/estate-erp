import { createFileRoute } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/layout/feature-placeholder-page';

export const Route = createFileRoute('/_authenticated/employees/')({
  component: EmployeesPage,
});

function EmployeesPage() {
  return (
    <FeaturePlaceholderPage
      title="직원관리"
      description="사무소 직원 계정과 역할을 관리하기 위한 공간입니다."
      icon={Users}
      checklist={[
        '직원 목록과 재직 상태를 조회할 수 있습니다.',
        '역할, 권한, 로그인 ID 발급 흐름을 붙일 수 있습니다.',
        '담당 거래와 배분 규칙을 직원 단위로 연결할 수 있습니다.',
      ]}
    />
  );
}
