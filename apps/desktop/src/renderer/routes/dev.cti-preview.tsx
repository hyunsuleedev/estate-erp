import { useMemo, useState } from 'react';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import type { CallLog } from '@estate-erp/api-client';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  CallPopupContextProvider,
  type ActiveCall,
  type CallPopupContextValue,
} from '@/features/cti/cti-provider';
import { CallPopup } from '@/features/cti/call-popup';

/**
 * DEV 전용 전화 팝업 미리보기.
 *
 * 실제 통화 흐름(Bridge 이벤트 → 조회 → 통화 기록)의 주인은 Electron main이고 브라우저
 * 미리보기에서는 전화가 동작하지 않는다. 여기서는 팝업의 모양만 본다: 이 화면이 통화
 * 상태를 직접 만들어 팝업에 넘긴다. 통화 기록은 남기지 않고, 고객 카드는 로그인했을
 * 때만 서버에서 조회한다. 프로덕션 빌드에서는 홈으로 리다이렉트.
 */
export const Route = createFileRoute('/dev/cti-preview')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' });
    }
  },
  component: CtiPreviewPage,
});

const SAMPLE_PHONE = '01012345678';

function CtiPreviewPage() {
  const router = useRouter();
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);

  const ring = () => {
    const key = Date.now();
    setActiveCall({
      key,
      phase: 'ringing',
      phoneNumber: SAMPLE_PHONE,
      lineNumber: '07000000000',
      durationSec: 0,
      startedAt: new Date().toISOString(),
      callLog: null,
      lookup: null,
      lookupLoading: true,
    });
    const settle = (patch: Partial<ActiveCall>) =>
      setActiveCall((prev) => (prev?.key === key ? { ...prev, ...patch } : prev));
    api.cti
      .lookup(SAMPLE_PHONE)
      .then((lookup) => settle({ lookup, lookupLoading: false }))
      .catch(() => settle({ lookupLoading: false }));
  };

  const terminate = (durationSec: number) =>
    setActiveCall((prev) =>
      prev ? { ...prev, phase: durationSec > 0 ? 'ended' : 'missed', durationSec } : prev,
    );

  const popup = useMemo(
    (): CallPopupContextValue => ({
      activeCall,
      dismiss: () => setActiveCall(null),
      refreshLookup: async () => {
        const lookup = await api.cti.lookup(SAMPLE_PHONE);
        setActiveCall((prev) => (prev ? { ...prev, lookup } : prev));
      },
      patchCallLog: (patch: Partial<CallLog>) =>
        setActiveCall((prev) =>
          prev?.callLog ? { ...prev, callLog: { ...prev.callLog, ...patch } } : prev,
        ),
      openRoute: (route) => void router.navigate({ href: route }),
    }),
    [activeCall, router],
  );

  return (
    <CallPopupContextProvider value={popup}>
      <div className="mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-xl font-semibold">전화 수신 팝업 미리보기</h1>
        <p className="text-sm text-muted-foreground">
          팝업의 모양만 확인한다. 고객 카드는 로그인 토큰이 있으면 실제 데이터로, 없으면
          조회 실패 상태(번호만 표시)로 그린다. 통화 기록은 남기지 않는다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={ring}>
            수신 (ring)
          </Button>
          <Button size="sm" variant="outline" onClick={() => terminate(42)}>
            통화 종료 (42초)
          </Button>
          <Button size="sm" variant="outline" onClick={() => terminate(0)}>
            부재중 (0초)
          </Button>
        </div>
      </div>
      <CallPopup />
    </CallPopupContextProvider>
  );
}
