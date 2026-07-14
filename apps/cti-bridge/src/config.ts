/**
 * CTI Bridge 설정 — 전부 환경변수 기반 (마스터 PC의 .env 또는 서비스 환경).
 *
 * 필수:
 * - CTI_BRIDGE_TOKEN  서버 POST /cti/bridge/token 으로 발급받은 ctib_ 토큰
 *
 * 선택:
 * - CTI_SERVER_URL            기본 http://localhost:3000 (프로덕션은 wss 종단 https URL)
 * - CTI_ENABLED_PROVIDERS     쉼표 구분 프로바이더 코드 필터 (기본: 서버가 내려준 회선 전부)
 * - CTI_KT_HELPER_PATH        KT(41) 32bit native-helper 실행 파일 경로
 * - CTI_MULTICID_HELPER_PATH  멀티CID(20/30) 32bit native-helper 실행 파일 경로
 * - CTI_LGU_BASE_URL          LGU Centrex REST 베이스 (기본 https://centrex.uplus.co.kr/RestApi)
 * - CTI_HEARTBEAT_MS          하트비트 주기 (기본 30000)
 */
export interface BridgeConfig {
  serverUrl: string;
  bridgeToken: string;
  enabledProviders: string[] | null;
  ktHelperPath: string | null;
  multicidHelperPath: string | null;
  lguBaseUrl: string;
  heartbeatMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const bridgeToken = env.CTI_BRIDGE_TOKEN;
  if (!bridgeToken || !bridgeToken.startsWith('ctib_')) {
    throw new Error(
      'CTI_BRIDGE_TOKEN 환경변수가 필요합니다 (서버 POST /cti/bridge/token 으로 발급, ctib_ 접두사).',
    );
  }

  return {
    serverUrl: env.CTI_SERVER_URL ?? 'http://localhost:3000',
    bridgeToken,
    enabledProviders: env.CTI_ENABLED_PROVIDERS
      ? env.CTI_ENABLED_PROVIDERS.split(',').map((code) => code.trim())
      : null,
    ktHelperPath: env.CTI_KT_HELPER_PATH ?? null,
    multicidHelperPath: env.CTI_MULTICID_HELPER_PATH ?? null,
    lguBaseUrl: env.CTI_LGU_BASE_URL ?? 'https://centrex.uplus.co.kr/RestApi',
    heartbeatMs: env.CTI_HEARTBEAT_MS ? Number(env.CTI_HEARTBEAT_MS) : 30_000,
  };
}
