import { createFileRoute } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/layout/feature-placeholder-page';

export const Route = createFileRoute('/_authenticated/settings/')({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <FeaturePlaceholderPage
      title="설정"
      description="사무소 기본 정보와 운영 정책을 설정하기 위한 공간입니다."
      icon={Settings}
      checklist={[
        '사무소 정보와 기본 운영 값을 정리할 수 있습니다.',
        '수수료 배분 규칙과 알림 설정을 연결할 수 있습니다.',
        '향후 외부 연동과 시스템 옵션을 여기로 모을 수 있습니다.',
      ]}
    />
  );
}
