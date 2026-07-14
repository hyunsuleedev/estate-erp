/**
 * 프로바이더 어댑터 인터페이스 — 스펙 §13.
 * 브리지 코어(정규화/dedup/업링크)는 이 인터페이스만 알고,
 * 어댑터가 프로바이더 세부(REST/COM/직렬)를 캡슐화한다.
 */

/** 레거시 Phne_Clsf 코드 */
export type ProviderCode = '10' | '20' | '30' | '41' | '50' | '70';

/** 서버가 cti.bridge.ready로 내려주는 회선 설정 (자격증명 제외) */
export interface CtiLineConfig {
  id: string;
  providerCode: string;
  displayName: string;
  externalId: string | null;
  internalNo: string | null;
  isMasterOnly: boolean;
  isDelegate: boolean;
}

/** 발신 위임 시에만 서버가 일회성으로 전달하는 회선 자격증명 */
export interface CtiCredential {
  loginId?: string;
  password?: string;
  authKey?: string;
}

export interface RawIncoming {
  /** 프로바이더가 준 원본 CID (정규화 전) */
  rawCid: string;
  /** 착신 수신 번호 (어느 회선으로 걸려왔는지) */
  recvNo?: string;
  /** dedup 키 — "프로바이더:채널|시퀀스" 형태 권장 */
  channelKey?: string;
  occurredAt?: string;
}

export interface CallEnded {
  channelKey: string;
  disposition?: 'answered' | 'missed';
}

export interface DialRequest {
  requestId: string;
  phoneNumber: string;
  line: CtiLineConfig;
  credential: CtiCredential | null;
}

export interface DialResult {
  success: boolean;
  message?: string;
}

export interface ProviderStatus {
  connected: boolean;
  message?: string;
}

export interface CtiProvider {
  readonly code: string;
  readonly displayName: string;

  /** 로그인/포트 오픈. 실패해도 throw 대신 onStatus(connected:false)로 보고 */
  start(lines: CtiLineConfig[]): Promise<void>;
  stop(): Promise<void>;

  dial(req: DialRequest): Promise<DialResult>;

  onIncoming(cb: (e: RawIncoming) => void): void;
  onCallEnded(cb: (e: CallEnded) => void): void;
  onStatus(cb: (s: ProviderStatus) => void): void;
}

/** 콜백 배선 공통 구현 */
export abstract class BaseProvider implements CtiProvider {
  abstract readonly code: string;
  abstract readonly displayName: string;

  private incomingCb: ((e: RawIncoming) => void) | null = null;
  private endedCb: ((e: CallEnded) => void) | null = null;
  private statusCb: ((s: ProviderStatus) => void) | null = null;

  abstract start(lines: CtiLineConfig[]): Promise<void>;
  abstract stop(): Promise<void>;
  abstract dial(req: DialRequest): Promise<DialResult>;

  onIncoming(cb: (e: RawIncoming) => void) {
    this.incomingCb = cb;
  }

  onCallEnded(cb: (e: CallEnded) => void) {
    this.endedCb = cb;
  }

  onStatus(cb: (s: ProviderStatus) => void) {
    this.statusCb = cb;
  }

  protected emitIncoming(e: RawIncoming) {
    this.incomingCb?.(e);
  }

  protected emitCallEnded(e: CallEnded) {
    this.endedCb?.(e);
  }

  protected emitStatus(s: ProviderStatus) {
    this.statusCb?.(s);
  }
}
