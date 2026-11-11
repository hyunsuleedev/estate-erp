import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CallLog, CtiLookupResult } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { queryClient } from '@/providers/query-provider';

/** Electron preload가 중계하는 Bridge 이벤트 (packages/shared/src/cti.ts CtiCallEvent) */
export interface CtiEvent {
  type: 'ring' | 'terminate' | 'ctc_result';
  vendor: string;
  caller: string;
  callee: string;
  lineId?: string;
  seqno?: string;
  durationSec?: number;
  occurredAt: string;
}

export type CallPhase = 'ringing' | 'ended' | 'missed';

export interface ActiveCall {
  /** 팝업 인스턴스 구분 (같은 번호 연속 수신 대응) */
  key: number;
  phase: CallPhase;
  phoneNumber: string;
  lineNumber: string | null;
  durationSec: number;
  startedAt: string;
  callLog: CallLog | null;
  lookup: CtiLookupResult | null;
  lookupLoading: boolean;
}

interface CtiContextValue {
  activeCall: ActiveCall | null;
  dismiss: () => void;
  /** 연락처 등록/상담 기록 후 고객 카드 갱신 */
  refreshLookup: () => Promise<void>;
  /** CallLog에 상담 연결 등 로컬 상태 갱신 */
  patchCallLog: (patch: Partial<CallLog>) => void;
  /**
   * 전화 팝업 층(탭 화면 위의 별도 view)에서는 라우터가 없으므로 팝업 안 링크를
   * 셸 창에서 연다. 셸 안에서 그릴 때는 비워 두고 라우터 링크를 쓴다.
   */
  openRoute?: (route: string) => void;
}

const CtiContext = createContext<CtiContextValue | null>(null);

/** 전화 팝업 층: 셸에서 받은 통화 상태로 팝업을 그릴 때 쓴다. */
export const CtiContextProvider = CtiContext.Provider;

/**
 * Electron에서는 팝업을 탭 화면 위의 별도 층에서 그린다. 셸이 그리면 탭 화면에
 * 가려지고, 통화 중에 탭 화면을 숨기면 보던 화면의 입력이 사라지기 때문이다.
 */
export function callPopupUsesOverlayLayer(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.electronBridge?.cti?.setOverlayState)
  );
}

export function useCti(): CtiContextValue {
  const context = useContext(CtiContext);
  if (!context) throw new Error('useCti must be used within CtiProvider');
  return context;
}

/** 종료/부재중 팝업 자동 닫힘 지연 */
const AUTO_DISMISS_AFTER_END_MS = 60_000;

declare global {
  interface Window {
    /** DEV 전용: 브라우저에서 Bridge 없이 수신 팝업 테스트 (__ctiSimulate({type:'ring',...})) */
    __ctiSimulate?: (event: Partial<CtiEvent>) => void;
  }
}

export function CtiProvider({
  children,
  /**
   * detached 창에서도 context 경계는 유지하지만, Bridge 이벤트 구독(+ingest)은
   * 메인 창 하나만 해야 한다 — 아니면 통화 1건이 창 수만큼 중복 POST된다.
   */
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  /**
   * setState 함수형 업데이터는 호출 시점이 아니라 렌더 처리 시점에 실행되므로,
   * 이벤트 핸들러가 "지금 화면의 통화"를 동기적으로 판단할 수 있도록 ref를 병행 유지한다.
   * 모든 쓰기는 mutateActiveCall을 통해서만 한다.
   */
  const activeCallRef = useRef<ActiveCall | null>(null);
  const keyRef = useRef(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutateActiveCall = useCallback(
    (fn: (prev: ActiveCall | null) => ActiveCall | null) => {
      const next = fn(activeCallRef.current);
      activeCallRef.current = next;
      setActiveCall(next);
      return next;
    },
    [],
  );

  const clearDismissTimer = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  const dismiss = useCallback(() => {
    clearDismissTimer();
    mutateActiveCall(() => null);
  }, [mutateActiveCall]);

  const handleRing = useCallback(
    (event: CtiEvent) => {
      clearDismissTimer();
      const key = ++keyRef.current;

      mutateActiveCall(() => ({
        key,
        phase: 'ringing',
        phoneNumber: event.caller,
        lineNumber: event.lineId ?? event.callee ?? null,
        durationSec: 0,
        startedAt: event.occurredAt,
        callLog: null,
        lookup: null,
        lookupLoading: true,
      }));

      // 통화 사실 기록 (실패해도 팝업은 유지 — 조회는 별도 경로)
      api.cti
        .ingestCallEvent(event)
        .then((result) => {
          queryClient.invalidateQueries({ queryKey: ['cti', 'call-logs'] });
          if (!result.callLog) return;
          mutateActiveCall((prev) =>
            prev && prev.key === key
              ? { ...prev, callLog: result.callLog ?? null }
              : prev,
          );
        })
        .catch((error) => {
          console.error('[cti] call-event 기록 실패:', error);
        });

      // 고객 카드 조회
      api.cti
        .lookup(event.caller)
        .then((lookup) => {
          mutateActiveCall((prev) =>
            prev && prev.key === key
              ? { ...prev, lookup, lookupLoading: false }
              : prev,
          );
        })
        .catch((error) => {
          console.error('[cti] lookup 실패:', error);
          mutateActiveCall((prev) =>
            prev && prev.key === key ? { ...prev, lookupLoading: false } : prev,
          );
        });
    },
    [mutateActiveCall],
  );

  const handleTerminate = useCallback(
    (event: CtiEvent) => {
      const durationSec = event.durationSec ?? 0;
      const phase: CallPhase = durationSec > 0 ? 'ended' : 'missed';

      // 화면의 팝업이 이 terminate와 같은 통화일 때만 상태를 바꾼다.
      // (다른 회선/이전 통화의 늦은 종료 이벤트가 지금 울리는 팝업을 덮으면 안 됨)
      const current = activeCallRef.current;
      const matchesPopup =
        current !== null && current.phoneNumber === event.caller;
      const patchedKey = matchesPopup ? current.key : null;

      if (matchesPopup) {
        mutateActiveCall((prev) =>
          prev && prev.key === patchedKey
            ? { ...prev, phase, durationSec }
            : prev,
        );
        clearDismissTimer();
        dismissTimerRef.current = setTimeout(() => {
          mutateActiveCall((prev) =>
            prev && prev.key === patchedKey ? null : prev,
          );
          dismissTimerRef.current = null;
        }, AUTO_DISMISS_AFTER_END_MS);
      }

      api.cti
        .ingestCallEvent(event)
        .then((result) => {
          queryClient.invalidateQueries({ queryKey: ['cti', 'call-logs'] });
          // 이 PC에서 ring이 유실됐으면 popup.callLog가 없다 — terminate 응답의
          // callLog를 채택해야 이후 상담/연락처 연결이 CallLog에 붙는다.
          if (!result.callLog || patchedKey === null) return;
          mutateActiveCall((prev) =>
            prev && prev.key === patchedKey && !prev.callLog
              ? { ...prev, callLog: result.callLog ?? null }
              : prev,
          );
        })
        .catch((error) => {
          console.error('[cti] terminate 기록 실패:', error);
        });
    },
    [mutateActiveCall],
  );

  const handleEvent = useCallback(
    (event: CtiEvent) => {
      switch (event.type) {
        case 'ring':
          handleRing(event);
          break;
        case 'terminate':
          handleTerminate(event);
          break;
        case 'ctc_result':
          // 클릭투콜 결과 — Phase 후속 (발신 UI)
          break;
      }
    },
    [handleRing, handleTerminate],
  );

  useEffect(() => {
    if (!enabled) return;
    const cleanup = window.electronBridge?.cti?.onEvent?.((payload) => {
      handleEvent(payload as unknown as CtiEvent);
    });
    return cleanup;
  }, [enabled, handleEvent]);

  // DEV: 브라우저(Playwright)에서 Bridge 없이 팝업 파이프라인 테스트
  useEffect(() => {
    if (!import.meta.env.DEV || !enabled) return;
    window.__ctiSimulate = (partial) => {
      handleEvent({
        type: 'ring',
        vendor: 'mock',
        caller: '01012345678',
        callee: '07000000000',
        seqno: `sim-${Date.now()}`,
        occurredAt: new Date().toISOString(),
        ...partial,
      } as CtiEvent);
    };
    return () => {
      delete window.__ctiSimulate;
    };
  }, [enabled, handleEvent]);

  const refreshLookup = useCallback(async () => {
    const call = activeCallRef.current;
    if (!call) return;
    const lookup = await api.cti.lookup(call.phoneNumber);
    mutateActiveCall((prev) =>
      prev && prev.key === call.key ? { ...prev, lookup } : prev,
    );
  }, [mutateActiveCall]);

  const patchCallLog = useCallback(
    (patch: Partial<CallLog>) => {
      mutateActiveCall((prev) =>
        prev && prev.callLog
          ? { ...prev, callLog: { ...prev.callLog, ...patch } }
          : prev,
      );
    },
    [mutateActiveCall],
  );

  const usesOverlayLayer = enabled && callPopupUsesOverlayLayer();

  // 통화 상태의 주인은 이 셸이다. 팝업 층에는 상태만 보내고, 층에서 누른
  // 버튼은 여기로 돌아와 처리한다.
  useEffect(() => {
    if (!usesOverlayLayer) return;
    window.electronBridge?.cti?.setOverlayState?.(activeCall);
  }, [activeCall, usesOverlayLayer]);

  useEffect(() => {
    if (!usesOverlayLayer) return;
    return () => window.electronBridge?.cti?.setOverlayState?.(null);
  }, [usesOverlayLayer]);

  useEffect(() => {
    if (!usesOverlayLayer) return;
    return window.electronBridge?.cti?.onOverlayAction?.((action) => {
      switch (action.type) {
        case 'dismiss':
          dismiss();
          return;
        case 'refresh-lookup':
          void refreshLookup().catch((error: unknown) => {
            console.error('[cti] lookup 갱신 실패:', error);
          });
          return;
        case 'patch-call-log':
          patchCallLog(action.patch as Partial<CallLog>);
          return;
        case 'open-route':
          // main이 셸 창의 탭으로 직접 연다.
          return;
      }
    });
  }, [dismiss, patchCallLog, refreshLookup, usesOverlayLayer]);

  // 팝업 층이 없는 환경(브라우저 미리보기)에서만 셸 안에 팝업을 그린다.
  const isOverlayVisible = enabled && !usesOverlayLayer && activeCall !== null;
  useEffect(() => {
    const setOverlayVisible =
      window.electronBridge?.tabs.setGlobalOverlayVisible;
    if (!enabled || usesOverlayLayer || !setOverlayVisible) return;
    setOverlayVisible('cti', isOverlayVisible);
    return () => setOverlayVisible('cti', false);
  }, [enabled, isOverlayVisible, usesOverlayLayer]);

  return (
    <CtiContext.Provider
      value={{ activeCall, dismiss, refreshLookup, patchCallLog }}
    >
      {children}
    </CtiContext.Provider>
  );
}
