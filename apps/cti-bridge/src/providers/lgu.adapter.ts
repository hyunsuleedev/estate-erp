import { createHash } from 'node:crypto';
import { BaseProvider } from './provider.interface.js';
import type {
  CtiLineConfig,
  DialRequest,
  DialResult,
} from './provider.interface.js';

/**
 * LG U+ Centrex (코드 70) — Phase 1은 발신(clickdial)만.
 *
 * 레거시 대응 (CommModule/MyCall.cs m_LGU070RestAPI):
 * - 발신: centrex.uplus.co.kr/RestApi "clickdial", 비밀번호 SHA-512, 응답 SVC_MSG=="OK"
 * - 착신전환: "setforward"/"stopforward" (후속)
 * - 실시간 CID는 레거시가 AxLGUBaseOpenApi ActiveX(SendRingEvent)를 사용 →
 *   REST/웹훅 대안을 LGU에 확인 후 결정 (스펙 §14-3). 그 전까지 CID는 미지원으로 보고.
 *
 * ⚠️ TODO(검증 필요): 요청 파라미터명(id/pass/phone)과 정확한 엔드포인트 경로는
 * LGU Centrex OpenAPI 문서 또는 레거시 m_LGU070RestAPI 원본과 대조해 확정할 것.
 * 여기 구현은 스펙 문서의 요약(SHA-512 비번, clickdial, SVC_MSG=="OK")을 따른다.
 */
export class LguAdapter extends BaseProvider {
  readonly code = '70';
  readonly displayName = 'LG U+ Centrex';

  constructor(private readonly baseUrl: string) {
    super();
  }

  async start(_lines: CtiLineConfig[]): Promise<void> {
    // 발신은 요청 시점에 HTTPS 호출이라 상시 연결이 없다.
    // CID(착신) 채널은 미구현 — 회선 상태로 명시해 착신 팝업 기대를 막는다.
    this.emitStatus({
      connected: true,
      message: 'LGU Centrex 발신 전용 (실시간 CID 채널 미지원 — ActiveX 대안 확인 중)',
    });
  }

  async stop(): Promise<void> {
    // 상시 연결 없음
  }

  async dial(req: DialRequest): Promise<DialResult> {
    const loginId = req.credential?.loginId ?? req.line.externalId;
    const password = req.credential?.password;
    if (!loginId || !password) {
      return {
        success: false,
        message: 'LGU 회선 자격증명이 없습니다. CTI 회선 설정에서 계정을 등록하세요.',
      };
    }

    try {
      const url = new URL(`${this.baseUrl}/clickdial`);
      url.searchParams.set('id', loginId);
      url.searchParams.set('pass', sha512Hex(password));
      url.searchParams.set('phone', req.phoneNumber);

      const response = await fetch(url, { method: 'GET' });
      const text = await response.text();

      if (!response.ok) {
        return { success: false, message: `LGU HTTP ${response.status}` };
      }

      const svcMsg = extractSvcMsg(text);
      if (svcMsg === 'OK') {
        return { success: true };
      }
      return { success: false, message: `LGU 응답: ${svcMsg ?? text.slice(0, 200)}` };
    } catch (error) {
      return {
        success: false,
        message: `LGU 발신 요청 실패: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

function sha512Hex(value: string): string {
  return createHash('sha512').update(value).digest('hex');
}

/** 응답에서 SVC_MSG 추출 — JSON이면 필드, 아니면 텍스트 내 "OK" 탐지 */
function extractSvcMsg(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const value = parsed.SVC_MSG ?? parsed.SVCMSG ?? parsed.svc_msg;
    return value !== undefined && value !== null ? String(value) : null;
  } catch {
    return /\bOK\b/.test(body) ? 'OK' : null;
  }
}
