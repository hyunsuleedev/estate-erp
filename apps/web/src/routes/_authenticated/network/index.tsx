import { createFileRoute } from '@tanstack/react-router';
import { Globe } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/layout/feature-placeholder-page';

export const Route = createFileRoute('/_authenticated/network/')({
  component: NetworkPage,
});

function NetworkPage() {
  return (
    <FeaturePlaceholderPage
      title="네트워크"
      description="외부 중개 네트워크와 공유 매물을 관리하기 위한 공간입니다."
      icon={Globe}
      checklist={[
        '네트워크 룸과 참여 중인 중개사 구성을 볼 수 있습니다.',
        '공유 매물, 문의, 응답 흐름을 한곳에서 관리할 수 있습니다.',
        '메시지 기록과 최근 활동 내역을 연결할 수 있습니다.',
      ]}
    />
  );
}
