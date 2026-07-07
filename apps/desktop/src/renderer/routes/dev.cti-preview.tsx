import { createFileRoute, redirect } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { CtiProvider } from '@/features/cti/cti-provider';
import { CallPopup } from '@/features/cti/call-popup';

/**
 * DEV 전용 CTI 팝업 프리뷰 하네스.
 *
 * Electron/Bridge/로그인 없이 브라우저에서 수신 팝업 UI를 확인한다.
 * 서버 응답이 필요한 조회(lookup)는 브라우저 콘솔에서 fetch를 스텁하거나
 * 로그인 상태로 사용. 프로덕션 빌드에서는 홈으로 리다이렉트.
 */
export const Route = createFileRoute('/dev/cti-preview')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' });
    }
  },
  component: CtiPreviewPage,
});

function simulate(type: 'ring' | 'terminate', extra?: Record<string, unknown>) {
  window.__ctiSimulate?.({ type, ...extra } as never);
}

function CtiPreviewPage() {
  return (
    <CtiProvider>
      <div className="mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-xl font-semibold">CTI 수신 팝업 프리뷰</h1>
        <p className="text-sm text-muted-foreground">
          Bridge 없이 팝업 파이프라인을 테스트한다. 조회 API는 로그인 토큰이 있으면 실 데이터,
          없으면 조회 실패 상태(번호만 표시)로 렌더링된다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => simulate('ring', { caller: '01012345678' })}>
            수신 (ring)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => simulate('terminate', { caller: '01012345678', durationSec: 42 })}
          >
            통화 종료 (42초)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => simulate('terminate', { caller: '01012345678', durationSec: 0 })}
          >
            부재중 (0초)
          </Button>
        </div>
      </div>
      <CallPopup />
    </CtiProvider>
  );
}
