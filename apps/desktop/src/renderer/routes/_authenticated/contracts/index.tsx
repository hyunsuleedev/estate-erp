import { createFileRoute } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/layout/feature-placeholder-page';

export const Route = createFileRoute('/_authenticated/contracts/')({
  component: ContractsPage,
});

function ContractsPage() {
  return (
    <FeaturePlaceholderPage
      title="계약서 관리"
      description="거래 계약서와 대금 일정을 한 화면에서 다루기 위한 공간입니다."
      icon={FileText}
      checklist={[
        '계약 상태와 진행 단계를 확인할 수 있습니다.',
        '계약금, 중도금, 잔금 일정을 거래와 연결할 수 있습니다.',
        '계약 당사자, 첨부 문서, 공동중개 정보를 확장할 수 있습니다.',
      ]}
    />
  );
}
