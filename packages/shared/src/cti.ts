// ============================================================
// CTI Bridge 와이어 프로토콜 (SSOT)
//
// C# Bridge(apps/cti-bridge)와 이 파일은 JSON 계약을 수기 미러링한다.
// 여기를 바꾸면 apps/cti-bridge/src/Models/*.cs 도 함께 바꿔야 한다.
// 설계 문서: docs/CTI_BRIDGE_PLAN.md §4.1
// ============================================================

export const CTI_VENDORS = ['mock', 'kt', 'lgu', 'samsung', 'mobile'] as const;
export type CtiVendor = (typeof CTI_VENDORS)[number];

/** Bridge가 로컬 WebSocket을 여는 기본 포트 (127.0.0.1 전용) */
export const CTI_BRIDGE_DEFAULT_PORT = 45332;

export type CtiCallEventType = 'ring' | 'terminate' | 'ctc_result';

/**
 * Bridge → 클라이언트(Electron): 통화 이벤트.
 * KT COM `_IKTPCBizXEvents` 기준: ring = EventCID, terminate = EventCallTerminate.
 */
export interface CtiCallEvent {
  type: CtiCallEventType;
  vendor: CtiVendor;
  /** 발신번호 (정규화: 01012345678) */
  caller: string;
  /** 착신번호 (수신 회선) */
  callee: string;
  /** 내선/회선 식별 */
  lineId?: string;
  /** 통신사 통화 시퀀스 (KT EventCID sClSeqno) — 서버 CallLog dedupe 키 */
  seqno?: string;
  /** terminate 시 통화 시간(초) (KT EventCallTerminate nTime) */
  durationSec?: number;
  /**
   * 통화 방향. CTI Bridge는 수신만 잡으므로 생략(서버가 inbound로 처리).
   * 모바일(vendor=mobile)은 발신 통화도 기록하므로 명시한다.
   */
  direction?: 'inbound' | 'outbound';
  /** ISO 8601 */
  occurredAt: string;
}

/** Bridge → 클라이언트: 브리지/통신사 연결 상태 (연결 직후 + 상태 변화 시 push) */
export interface CtiBridgeStatus {
  type: 'status';
  vendor: CtiVendor;
  /** 통신사 CTI 서버 연결 여부 */
  connected: boolean;
  loggedIn: boolean;
  /** 감시 중인 회선 번호 목록 */
  lines: string[];
  bridgeVersion: string;
}

/** 클라이언트 → Bridge: 클릭투콜 발신 (KT SendCTC) */
export interface CtiDialCommand {
  type: 'dial';
  /** 발신 회선 (생략 시 Bridge 기본 회선) */
  caller?: string;
  /** 상대방 번호 */
  callee: string;
}

export type CtiBridgeMessage = CtiCallEvent | CtiBridgeStatus;
export type CtiClientMessage = CtiDialCommand;

export function isCtiCallEvent(msg: CtiBridgeMessage): msg is CtiCallEvent {
  return msg.type === 'ring' || msg.type === 'terminate' || msg.type === 'ctc_result';
}

// ------------------------------------------------------------
// 서버 CallLog 관련 상수 (apps/server modules/cti 와 클라이언트가 공유)
// ------------------------------------------------------------

export const CALL_LOG_DIRECTIONS = ['inbound', 'outbound'] as const;
export type CallLogDirection = (typeof CALL_LOG_DIRECTIONS)[number];

export const CALL_LOG_STATUSES = ['ringing', 'answered', 'missed', 'ended'] as const;
export type CallLogStatus = (typeof CALL_LOG_STATUSES)[number];
