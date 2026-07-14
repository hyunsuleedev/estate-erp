import { BaseProvider } from './provider.interface.js';
import type {
  CtiLineConfig,
  CtiCredential,
  DialRequest,
  DialResult,
} from './provider.interface.js';
import { HelperProcess, type HelperMessage } from '../native-helper/helper-process.js';

const DIAL_TIMEOUT_MS = 15_000;

/** 서버가 내려주는 회선 설정 + (로그인 필요 프로바이더 한정) 자격증명 */
export interface CtiLineConfigWithCredential extends CtiLineConfig {
  credential?: CtiCredential | null;
}

/**
 * 32bit native-helper 기반 프로바이더 공통 구현 (KT 41, 멀티CID 20/30).
 *
 * COM/ActiveX 세부는 native-helper(.NET 32bit)가 처리하고,
 * 이 클래스는 프로세스 생명주기 + JSON-lines 메시지 ↔ 어댑터 이벤트 변환만 담당.
 */
export abstract class HelperBackedProvider extends BaseProvider {
  private helper: HelperProcess | null = null;
  private pendingDials = new Map<
    string,
    { resolve: (result: DialResult) => void; timer: NodeJS.Timeout }
  >();

  constructor(
    private readonly helperPath: string | null,
    private readonly helperKind: string,
  ) {
    super();
  }

  async start(lines: CtiLineConfigWithCredential[]): Promise<void> {
    if (!this.helperPath) {
      this.emitStatus({
        connected: false,
        message: `${this.displayName} native-helper 경로가 설정되지 않았습니다 (CTI_${this.helperKind.toUpperCase()}_HELPER_PATH).`,
      });
      return;
    }

    this.helper = new HelperProcess(
      this.helperKind,
      this.helperPath,
      ['--provider', this.helperKind],
      (msg) => this.handleHelperMessage(msg),
      ({ code, willRestart }) => {
        this.emitStatus({
          connected: false,
          message: `native-helper 종료 (code=${code})${willRestart ? ', 재시작 예정' : ''}`,
        });
      },
    );
    this.helper.start();

    // 로그인이 필요한 회선 설정 전달 (헬퍼는 메모리에만 보관)
    this.helper.send({
      type: 'start',
      lines: lines.map((line) => ({
        id: line.id,
        providerCode: line.providerCode,
        externalId: line.externalId,
        internalNo: line.internalNo,
        loginId: line.credential?.loginId ?? null,
        password: line.credential?.password ?? null,
        authKey: line.credential?.authKey ?? null,
      })),
    });
  }

  async stop(): Promise<void> {
    for (const [requestId, pending] of this.pendingDials) {
      clearTimeout(pending.timer);
      pending.resolve({ success: false, message: '브리지 종료' });
      this.pendingDials.delete(requestId);
    }
    this.helper?.stop();
    this.helper = null;
  }

  async dial(req: DialRequest): Promise<DialResult> {
    if (!this.helper?.running) {
      return { success: false, message: 'native-helper가 실행 중이 아닙니다.' };
    }

    const sent = this.helper.send({
      type: 'dial',
      requestId: req.requestId,
      phoneNumber: req.phoneNumber,
      lineId: req.line.id,
      sendNo: req.line.externalId ?? req.line.internalNo ?? null,
      loginId: req.credential?.loginId ?? null,
      password: req.credential?.password ?? null,
      authKey: req.credential?.authKey ?? null,
    });
    if (!sent) {
      return { success: false, message: 'native-helper 전송 실패' };
    }

    return new Promise<DialResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingDials.delete(req.requestId);
        resolve({ success: false, message: '발신 응답 시간 초과' });
      }, DIAL_TIMEOUT_MS);
      this.pendingDials.set(req.requestId, { resolve, timer });
    });
  }

  private handleHelperMessage(msg: HelperMessage) {
    switch (msg.type) {
      case 'incoming':
        this.emitIncoming({
          rawCid: String(msg.rawCid ?? ''),
          recvNo: msg.recvNo ? String(msg.recvNo) : undefined,
          channelKey: msg.channelKey ? String(msg.channelKey) : undefined,
          occurredAt: msg.occurredAt ? String(msg.occurredAt) : undefined,
        });
        break;
      case 'callEnded':
        if (msg.channelKey) {
          this.emitCallEnded({
            channelKey: String(msg.channelKey),
            disposition:
              msg.disposition === 'answered' || msg.disposition === 'missed'
                ? msg.disposition
                : undefined,
          });
        }
        break;
      case 'dialResult': {
        const pending = msg.requestId
          ? this.pendingDials.get(String(msg.requestId))
          : undefined;
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingDials.delete(String(msg.requestId));
          pending.resolve({
            success: msg.success === true,
            message: msg.message ? String(msg.message) : undefined,
          });
        }
        break;
      }
      case 'status':
        this.emitStatus({
          connected: msg.connected === true,
          message: msg.message ? String(msg.message) : undefined,
        });
        break;
      default:
        console.warn(`[${this.code}] unknown helper message: ${msg.type}`);
    }
  }
}
