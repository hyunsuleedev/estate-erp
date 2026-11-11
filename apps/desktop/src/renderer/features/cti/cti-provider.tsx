import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from '@tanstack/react-router';
import type { CallLog } from '@estate-erp/api-client';
import type {
  ActiveCall,
  CallPhase,
  CtiDialResult,
  CtiStatus,
} from '../../../common/desktopCti';
import { useAuth } from '@/providers/auth-provider';

export type { ActiveCall, CallPhase };

/**
 * 전화(CTI). 통화 상태의 주인은 main 프로세스다.
 *
 * main이 Bridge 이벤트를 받아 통화 상태를 만들고, 고객 카드를 조회하고, 통화 기록을
 * 남기고, 탭 화면 위의 팝업 층에 팝업을 띄운다. 화면은 여기서 통화 상태와 Bridge
 * 상태를 읽고 발신만 요청한다. 브라우저 미리보기(main 없음)에서는 동작하지 않는다.
 */
interface CtiContextValue {
  /** 지금 화면에 뜬 통화. 없으면 null. */
  activeCall: ActiveCall | null;
  /** 이 PC의 Bridge 연결 상태. 아직 모르면 null. */
  bridgeStatus: CtiStatus | null;
  /** 클릭투콜 발신. caller를 생략하면 Bridge 기본 회선으로 건다. */
  dial: (callee: string, caller?: string) => Promise<CtiDialResult>;
  /** 그 화면을 메인 창의 탭으로 연다. */
  openRoute: (route: string) => void;
}

const CtiContext = createContext<CtiContextValue | null>(null);

export function useCti(): CtiContextValue {
  const context = useContext(CtiContext);
  if (!context) throw new Error('useCti must be used within CtiProvider');
  return context;
}

export function CtiProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useAuth();
  const router = useRouter();
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<CtiStatus | null>(null);

  // 로그인 세션이 바뀌면 main의 지금 값을 다시 읽는다. 읽는 사이에 온 알림이 더 새롭다.
  useEffect(() => {
    const bridge = window.electronBridge?.cti;
    if (!bridge?.onCall || !bridge.onStatus) return;
    let cancelled = false;
    let callReceived = false;
    let statusReceived = false;
    const offCall = bridge.onCall((call) => {
      callReceived = true;
      setActiveCall(call);
    });
    const offStatus = bridge.onStatus((status) => {
      statusReceived = true;
      setBridgeStatus(status);
    });
    void bridge.getCall?.().then((call) => {
      if (!cancelled && !callReceived) setActiveCall(call);
    });
    void bridge.getStatus?.().then((status) => {
      if (!cancelled && !statusReceived) setBridgeStatus(status);
    });
    return () => {
      cancelled = true;
      offCall();
      offStatus();
      setActiveCall(null);
      setBridgeStatus(null);
    };
  }, [sessionId]);

  const dial = useCallback(
    async (callee: string, caller?: string): Promise<CtiDialResult> => {
      const request = window.electronBridge?.cti?.dial;
      if (!request) return { ok: false, error: 'bridge-disconnected' };
      if (typeof sessionId !== 'number') return { ok: false, error: 'not-signed-in' };
      return request({ callee, ...(caller ? { caller } : {}), sessionId });
    },
    [sessionId],
  );

  const openRoute = useCallback(
    (route: string) => {
      const openInMainWindow = window.electronBridge?.tabs.openInMainWindow;
      if (openInMainWindow) void openInMainWindow(route);
      else void router.navigate({ href: route });
    },
    [router],
  );

  const value = useMemo(
    () => ({ activeCall, bridgeStatus, dial, openRoute }),
    [activeCall, bridgeStatus, dial, openRoute],
  );

  return <CtiContext.Provider value={value}>{children}</CtiContext.Provider>;
}

/**
 * 전화 팝업이 쓰는 값. 팝업은 탭 화면 위의 팝업 층에서만 그린다. 버튼은 main으로
 * 가고, main이 통화 상태를 바꿔 다시 보내 준다.
 */
export interface CallPopupContextValue {
  activeCall: ActiveCall | null;
  dismiss: () => void;
  /** 연락처 등록/상담 기록 후 고객 카드 갱신 */
  refreshLookup: () => Promise<void>;
  /** CallLog에 상담 연결 등, 팝업이 서버에 저장한 내용을 통화 상태에 반영 */
  patchCallLog: (patch: Partial<CallLog>) => void;
  /** 팝업 안 링크: 메인 창에서 그 화면을 연다. */
  openRoute: (route: string) => void;
}

const CallPopupContext = createContext<CallPopupContextValue | null>(null);

export const CallPopupContextProvider = CallPopupContext.Provider;

export function useCallPopup(): CallPopupContextValue {
  const context = useContext(CallPopupContext);
  if (!context) {
    throw new Error('useCallPopup must be used within CallPopupContextProvider');
  }
  return context;
}
