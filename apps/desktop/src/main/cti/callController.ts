import type {
  CallLog,
  CtiLookupResult,
  IngestCallEventResult,
} from '@estate-erp/api-client';
import type {
  ActiveCall,
  CallPhase,
  CtiCallEvent,
  CtiDialResult,
  CtiStatus,
} from '../../common/desktopCti';
import { CTI_DISCONNECTED_STATUS } from '../../common/desktopCti';

/**
 * 통화 흐름의 주인. main 프로세스에 하나 있다.
 *
 * CTI Bridge가 알려 준 통화(ring → terminate)로 화면에 띄울 통화 상태를 만들고,
 * 발신번호로 고객 카드를 조회하고, 통화 사실을 서버 통화 기록으로 남긴다. 팝업 층에서
 * 누른 버튼(닫기, 다시 조회, 통화 기록 갱신)과 화면의 발신 요청도 여기서 처리한다.
 *
 * - 사무소가 있는 로그인 세션이 있을 때만 통화를 받는다. 세션이 바뀌면(로그아웃,
 *   다른 사람·사무소) 통화 상태를 버리고, 그 전에 보낸 요청의 답도 버린다.
 * - 서버 요청이 실패해도 팝업은 그대로 둔다. 조회와 기록은 서로 다른 경로다.
 *
 * Electron에 의존하지 않는다. Bridge 연결, 서버 요청, 타이머, 알릴 곳을 받아 쓴다.
 */

/** 통화를 받을 로그인 세션. principal은 사람·사무소가 같은지 가르는 열쇠다. */
export interface CallControllerSession {
  sessionId: number;
  principal: string;
}

export interface CallControllerApi {
  /** Bridge 통화 이벤트를 서버 통화 기록으로 남긴다 (POST /cti/call-events). */
  ingestCallEvent(
    sessionId: number,
    event: CtiCallEvent,
  ): Promise<IngestCallEventResult>;
  /** 발신번호 → 팝업의 고객 카드 (GET /cti/lookup). */
  lookup(sessionId: number, phone: string): Promise<CtiLookupResult>;
}

export interface CallControllerBridge {
  getStatus(): CtiStatus;
  dial(command: { callee: string; caller?: string }): boolean;
}

export interface CallControllerOptions {
  api: CallControllerApi;
  bridge: CallControllerBridge;
  /** 통화 상태가 바뀔 때마다 부른다. null이면 띄울 통화가 없다. */
  onCallChange: (call: ActiveCall | null) => void;
  /** 통화 기록이 생기거나 바뀌었다. 화면의 통화 기록 목록이 다시 읽게 한다. */
  onCallLogsChanged: () => void;
  /** 종료·부재중 팝업을 저절로 닫는 시간. */
  autoDismissAfterEndMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  onError?: (what: string, error: unknown) => void;
}

/** 종료/부재중 팝업 자동 닫힘 지연 */
const AUTO_DISMISS_AFTER_END_MS = 60_000;

export class CallController {
  private session: CallControllerSession | null = null;
  /** 세션이 바뀔 때마다 올린다. 이전 세션에서 보낸 요청의 답은 버린다. */
  private epoch = 0;
  private call: ActiveCall | null = null;
  private keySeq = 0;
  private dismissTimer: unknown = null;
  /** 고객 카드 조회 순번. 늦게 온 옛 답이 새 답을 덮지 못하게 한다. */
  private lookupSeq = 0;
  private lookupAppliedSeq = 0;

  private readonly autoDismissAfterEndMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: CallControllerOptions) {
    this.autoDismissAfterEndMs =
      options.autoDismissAfterEndMs ?? AUTO_DISMISS_AFTER_END_MS;
    this.setTimer =
      options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer =
      options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /**
   * 통화를 받을 세션을 정한다. 로그인 세션이 바뀔 때마다 부른다.
   * 같은 세션·같은 사람이면 아무것도 하지 않는다. 그 밖에는 통화 상태를 버린다.
   */
  setSession(session: CallControllerSession | null): void {
    const current = this.session;
    if (
      current === session ||
      (current &&
        session &&
        current.sessionId === session.sessionId &&
        current.principal === session.principal)
    ) {
      return;
    }
    this.epoch += 1;
    this.session = session;
    this.clearDismissTimer();
    this.setCall(null);
  }

  getCall(): ActiveCall | null {
    return this.call;
  }

  /** Bridge 연결 상태. 로그인 전에는 알려 주지 않는다. */
  getStatus(): CtiStatus {
    return this.session ? this.options.bridge.getStatus() : CTI_DISCONNECTED_STATUS;
  }

  /** Bridge가 보낸 통화 이벤트. */
  handleBridgeEvent(event: CtiCallEvent): void {
    if (!this.session) return;
    switch (event.type) {
      case 'ring':
        this.handleRing(event, this.session);
        return;
      case 'terminate':
        this.handleTerminate(event, this.session);
        return;
      case 'ctc_result':
        // 클릭투콜 결과 — Phase 후속 (발신 UI)
        return;
    }
  }

  /**
   * 서버가 실시간 연결로 전화 이벤트(`cti.incoming`, `cti.call.updated`)를 알려 줬다.
   * 다른 PC나 모바일이 남긴 통화도 여기로 온다. 이 PC의 팝업은 Bridge 이벤트로만
   * 뜬다(지금까지와 같다). 여기서는 통화 기록 목록만 새로 읽게 한다.
   */
  handleServerCallEvent(): void {
    if (!this.session) return;
    this.options.onCallLogsChanged();
  }

  /**
   * 팝업에서 온 요청이 가리키는 통화가 지금 화면의 통화인가. 저장이 끝나기 전에 다음
   * 전화가 와서 팝업이 바뀌었으면 옛 통화의 요청은 버린다. 통화를 밝히지 않은 요청은
   * 지금 통화에 대한 것으로 본다.
   */
  private targets(callKey: number | undefined): ActiveCall | null {
    const call = this.call;
    return call && (callKey === undefined || call.key === callKey) ? call : null;
  }

  /** 팝업을 닫는다. */
  dismiss(callKey?: number): void {
    if (!this.targets(callKey)) return;
    this.clearDismissTimer();
    this.setCall(null);
  }

  /** 연락처 등록·상담 기록 뒤 고객 카드를 다시 불러온다. */
  async refreshLookup(callKey?: number): Promise<void> {
    const call = this.targets(callKey);
    const session = this.session;
    if (!call || !session) return;
    await this.runLookup(session, call.key, call.phoneNumber);
  }

  /**
   * 팝업에서 통화 기록에 연락처·상담을 연결했다(서버에는 팝업이 이미 저장했다).
   * 통화 기록을 아직 받지 못했으면 붙일 곳이 없으므로 버린다.
   */
  patchCallLog(patch: Record<string, unknown>, callKey?: number): void {
    const call = this.targets(callKey);
    if (!call?.callLog) return;
    this.setCall({
      ...call,
      callLog: { ...call.callLog, ...(patch as Partial<CallLog>) },
    });
  }

  /** 클릭투콜 발신. */
  dial(command: { callee: string; caller?: string }): CtiDialResult {
    if (!this.session) return { ok: false, error: 'not-signed-in' };
    return this.options.bridge.dial(command)
      ? { ok: true }
      : { ok: false, error: 'bridge-disconnected' };
  }

  dispose(): void {
    this.epoch += 1;
    this.session = null;
    this.clearDismissTimer();
    this.call = null;
  }

  private handleRing(event: CtiCallEvent, session: CallControllerSession): void {
    this.clearDismissTimer();
    const key = ++this.keySeq;
    this.setCall({
      key,
      phase: 'ringing',
      phoneNumber: event.caller,
      lineNumber: event.lineId ?? event.callee ?? null,
      durationSec: 0,
      startedAt: event.occurredAt,
      callLog: null,
      lookup: null,
      lookupLoading: true,
    });

    // 통화 사실 기록 (실패해도 팝업은 유지 — 조회는 별도 경로)
    void this.ingest(session, key, event, 'call-event 기록 실패');
    // 고객 카드 조회
    void this.runLookup(session, key, event.caller).catch((error: unknown) => {
      this.options.onError?.('lookup 실패', error);
    });
  }

  private handleTerminate(event: CtiCallEvent, session: CallControllerSession): void {
    const durationSec = event.durationSec ?? 0;
    const phase: CallPhase = durationSec > 0 ? 'ended' : 'missed';

    // 화면의 팝업이 이 terminate와 같은 통화일 때만 상태를 바꾼다.
    // (다른 회선/이전 통화의 늦은 종료 이벤트가 지금 울리는 팝업을 덮으면 안 됨)
    const current = this.call;
    const patchedKey =
      current !== null && current.phoneNumber === event.caller ? current.key : null;

    if (current && patchedKey !== null) {
      this.setCall({ ...current, phase, durationSec });
      this.clearDismissTimer();
      const epoch = this.epoch;
      this.dismissTimer = this.setTimer(() => {
        this.dismissTimer = null;
        if (epoch === this.epoch && this.call?.key === patchedKey) this.setCall(null);
      }, this.autoDismissAfterEndMs);
    }

    void this.ingest(session, patchedKey, event, 'terminate 기록 실패');
  }

  /**
   * 통화 이벤트를 서버에 남긴다. 답으로 온 통화 기록은 그 통화의 팝업이 아직 기록을
   * 갖지 않았을 때만 받아들인다. 이 PC에서 ring이 유실됐으면 terminate의 답이 첫
   * 기록이고, 이미 받은 기록(팝업에서 연결한 연락처·상담 포함)을 늦게 온 답이 덮지 않는다.
   */
  private async ingest(
    session: CallControllerSession,
    key: number | null,
    event: CtiCallEvent,
    failure: string,
  ): Promise<void> {
    const epoch = this.epoch;
    let result: IngestCallEventResult;
    try {
      result = await this.options.api.ingestCallEvent(session.sessionId, event);
    } catch (error) {
      this.options.onError?.(failure, error);
      return;
    }
    if (epoch !== this.epoch) return;
    this.options.onCallLogsChanged();
    const call = this.call;
    if (!result?.callLog || key === null || !call || call.key !== key || call.callLog) {
      return;
    }
    this.setCall({ ...call, callLog: result.callLog });
  }

  private async runLookup(
    session: CallControllerSession,
    key: number,
    phone: string,
  ): Promise<void> {
    const epoch = this.epoch;
    const seq = ++this.lookupSeq;
    const current = () =>
      epoch === this.epoch && this.call?.key === key ? this.call : null;
    let lookup: CtiLookupResult;
    try {
      lookup = await this.options.api.lookup(session.sessionId, phone);
    } catch (error) {
      const call = current();
      if (call?.lookupLoading) this.setCall({ ...call, lookupLoading: false });
      throw error;
    }
    const call = current();
    if (!call) return;
    if (seq < this.lookupAppliedSeq) {
      // 더 나중에 요청한 조회의 답이 이미 반영됐다.
      if (call.lookupLoading) this.setCall({ ...call, lookupLoading: false });
      return;
    }
    this.lookupAppliedSeq = seq;
    this.setCall({ ...call, lookup, lookupLoading: false });
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer === null) return;
    this.clearTimer(this.dismissTimer);
    this.dismissTimer = null;
  }

  private setCall(next: ActiveCall | null): void {
    if (this.call === next) return;
    this.call = next;
    try {
      this.options.onCallChange(next);
    } catch (error) {
      this.options.onError?.('통화 상태 전달 실패', error);
    }
  }
}

/**
 * 전화 팝업을 띄울 창. 메인 창이 있으면 메인 창이고, 다른 앱 창만 있으면 가장 최근에
 * 쓰던 창이다. 창이 하나도 없으면 띄울 곳이 없다.
 */
export function selectCallPopupWindow(input: {
  mainWindowId: number | null;
  /** 앱 창과, 창이 앞으로 온 순서(클수록 최근). */
  windows: ReadonlyArray<{ id: number; focusOrder: number }>;
}): number | null {
  const { mainWindowId, windows } = input;
  if (mainWindowId !== null && windows.some((window) => window.id === mainWindowId)) {
    return mainWindowId;
  }
  let best: { id: number; focusOrder: number } | null = null;
  for (const window of windows) {
    if (!best || window.focusOrder > best.focusOrder) best = window;
  }
  return best?.id ?? null;
}
