import type { CallLog, CtiLookupResult } from '@estate-erp/api-client';

/**
 * 전화(CTI) 계약. 통화 상태의 주인은 main 프로세스다.
 *
 * main이 CTI Bridge의 통화 이벤트를 받아 통화 상태를 만들고, 고객 카드를 조회하고,
 * 통화 기록을 서버에 남긴다. 팝업 층은 그 상태를 그리고 버튼을 main에 보낸다.
 * 셸과 탭 화면은 통화 상태와 Bridge 상태를 읽고 발신만 요청한다.
 */

/** Bridge가 보내는 통화 이벤트. 와이어 계약은 packages/shared/src/cti.ts CtiCallEvent. */
export interface CtiCallEvent {
  type: 'ring' | 'terminate' | 'ctc_result';
  vendor: string;
  /** 발신번호 (정규화: 01012345678) */
  caller: string;
  /** 착신번호 (수신 회선) */
  callee: string;
  lineId?: string;
  seqno?: string;
  durationSec?: number;
  direction?: 'inbound' | 'outbound';
  /** ISO 8601 */
  occurredAt: string;
}

/** Bridge가 보고하는 통신사 연결 상태. */
export interface CtiBridgeStatus {
  type: 'status';
  vendor: string;
  connected: boolean;
  loggedIn: boolean;
  lines: string[];
  bridgeVersion: string;
}

export interface CtiStatus {
  /** 이 PC의 앱 ↔ Bridge 로컬 연결 여부 */
  bridgeConnected: boolean;
  /** Bridge가 마지막으로 보고한 통신사 상태. 연결 전이면 null. */
  bridge: CtiBridgeStatus | null;
}

export const CTI_DISCONNECTED_STATUS: CtiStatus = {
  bridgeConnected: false,
  bridge: null,
};

export type CallPhase = 'ringing' | 'ended' | 'missed';

/** 화면에 뜬 통화 하나. API 응답으로 만든 JSON 값이다. */
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

export interface CtiDialRequest {
  /** 상대방 번호 */
  callee: string;
  /** 발신 회선. 생략하면 Bridge 기본 회선. */
  caller?: string;
  /** 요청한 화면이 보고 있는 로그인 세션. 지금 세션일 때만 받는다. */
  sessionId: number;
}

export type CtiDialError =
  | 'bridge-disconnected'
  | 'not-signed-in'
  | 'invalid-request';

export type CtiDialResult = { ok: true } | { ok: false; error: CtiDialError };

const MAX_FIELD_LENGTH = 64;
const MAX_LINES = 64;
const EVENT_TYPES = new Set<CtiCallEvent['type']>(['ring', 'terminate', 'ctc_result']);
/** 전화번호: 숫자와 +, *, #, 구분용 하이픈. */
const DIAL_NUMBER = /^[0-9+*#-]{1,32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShortString(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_FIELD_LENGTH;
}

/**
 * Bridge가 보낸 통화 이벤트. 계약에 있는 필드만 남긴다(이 값이 그대로 서버로 간다).
 * 발신번호 표시 제한 통화는 발신번호가 빈 문자열로 온다.
 */
export function parseCtiCallEvent(value: unknown): CtiCallEvent | null {
  if (!isRecord(value) || !EVENT_TYPES.has(value.type as CtiCallEvent['type'])) {
    return null;
  }
  const { vendor, caller, callee, lineId, seqno, durationSec, direction, occurredAt } =
    value;
  if (
    !isShortString(vendor) ||
    !isShortString(caller) ||
    !isShortString(callee) ||
    !isShortString(occurredAt) ||
    (lineId !== undefined && !isShortString(lineId)) ||
    (seqno !== undefined && !isShortString(seqno)) ||
    (durationSec !== undefined &&
      (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 0)) ||
    (direction !== undefined && direction !== 'inbound' && direction !== 'outbound')
  ) {
    return null;
  }
  return {
    type: value.type as CtiCallEvent['type'],
    vendor,
    caller,
    callee,
    ...(lineId !== undefined ? { lineId } : {}),
    ...(seqno !== undefined ? { seqno } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(direction !== undefined ? { direction } : {}),
    occurredAt,
  };
}

export function parseCtiBridgeStatus(value: unknown): CtiBridgeStatus | null {
  if (!isRecord(value) || value.type !== 'status') return null;
  const { vendor, connected, loggedIn, lines, bridgeVersion } = value;
  if (
    !isShortString(vendor) ||
    typeof connected !== 'boolean' ||
    typeof loggedIn !== 'boolean' ||
    !Array.isArray(lines) ||
    lines.length > MAX_LINES ||
    !lines.every(isShortString) ||
    !isShortString(bridgeVersion)
  ) {
    return null;
  }
  return { type: 'status', vendor, connected, loggedIn, lines: [...lines], bridgeVersion };
}

export function parseCtiDialRequest(value: unknown): CtiDialRequest | null {
  if (!isRecord(value)) return null;
  const { callee, caller, sessionId } = value;
  if (
    typeof callee !== 'string' ||
    !DIAL_NUMBER.test(callee) ||
    (caller !== undefined && (typeof caller !== 'string' || !DIAL_NUMBER.test(caller))) ||
    typeof sessionId !== 'number' ||
    !Number.isSafeInteger(sessionId)
  ) {
    return null;
  }
  return { callee, ...(caller !== undefined ? { caller } : {}), sessionId };
}
