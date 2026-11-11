import { useEffect, useMemo, useState } from 'react';
import type { CallLog } from '@estate-erp/api-client';
import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { CallPopup } from './call-popup';
import { CtiContextProvider, type ActiveCall } from './cti-provider';
import '@/app.css';

/** 팝업 카드는 오른쪽·아래 16px 안쪽에 붙는다. 왼쪽·위로는 그림자가 보일 만큼 둔다. */
const POPUP_INSET = 16;
const SHADOW_ROOM = 24;

function useMirroredCall(): ActiveCall | null {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);

  useEffect(() => {
    const bridge = window.electronBridge?.cti;
    let received = false;
    let cancelled = false;
    const unsubscribe = bridge?.onOverlayState?.((state) => {
      received = true;
      setActiveCall(state as ActiveCall | null);
    });
    void bridge?.getOverlayState?.().then((state) => {
      if (!cancelled && !received) setActiveCall(state as ActiveCall | null);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return activeCall;
}

/** 팝업 카드 크기가 바뀔 때마다(입력란 펼침 등) main에 층 크기를 알린다. */
function useReportPopupSize(callKey: number | null): void {
  useEffect(() => {
    if (callKey === null) return;
    const report = window.electronBridge?.cti?.reportOverlaySize;
    const popup = document.querySelector<HTMLElement>('[data-testid="cti-call-popup"]');
    if (!report || !popup) return;
    const publish = () => {
      const rect = popup.getBoundingClientRect();
      report({
        width: rect.width + POPUP_INSET + SHADOW_ROOM,
        height: rect.height + POPUP_INSET + SHADOW_ROOM,
      });
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(popup);
    return () => observer.disconnect();
  }, [callKey]);
}

function CallOverlay() {
  const activeCall = useMirroredCall();
  useReportPopupSize(activeCall?.key ?? null);

  const value = useMemo(() => {
    const send = window.electronBridge?.cti?.sendOverlayAction;
    return {
      activeCall,
      dismiss: () => send?.({ type: 'dismiss' }),
      // 고객 카드를 다시 불러오는 일은 통화 상태의 주인인 셸이 한다.
      refreshLookup: async () => send?.({ type: 'refresh-lookup' }),
      patchCallLog: (patch: Partial<CallLog>) =>
        send?.({ type: 'patch-call-log', patch: patch as Record<string, unknown> }),
      openRoute: (route: string) => send?.({ type: 'open-route', route }),
    };
  }, [activeCall]);

  return (
    <CtiContextProvider value={value}>
      <CallPopup />
    </CtiContextProvider>
  );
}

/**
 * 탭 화면 위에 얹히는 전화 수신 팝업 층의 최상위 화면.
 * 라우터와 사이드바 없이 팝업만 그리고, 로그인은 셸 세션을 빌려 쓴다.
 */
export function CallOverlayRoot() {
  return (
    <QueryProvider>
      <AuthProvider>
        <CallOverlay />
      </AuthProvider>
    </QueryProvider>
  );
}
