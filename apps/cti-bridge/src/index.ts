import { loadConfig } from './config.js';
import { ProviderManager } from './provider-manager.js';
import { ServerLink } from './server-link.js';

/**
 * CTI Bridge 부트스트랩 — 마스터 PC 상주 프로세스.
 *
 * 흐름 (스펙 §7):
 *   프로바이더 착신 → 어댑터 → 정규화/dedup → WSS 업링크 → 서버 /cti-bridge
 *   → CallEvent 저장 → /realtime 'call.incoming' → 전 직원 앱 팝업
 *
 * 발신: 서버 'cti.dial.request' → 어댑터 dial → 'cti.dial.result' 회신
 */
async function main() {
  const config = loadConfig();
  const serverLink = new ServerLink(config);

  const providerManager = new ProviderManager(config, {
    onIncoming: (providerCode, e) => {
      console.log(
        `[incoming] provider=${providerCode} cid=${e.rawCid} channel=${e.channelKey}`,
      );
      serverLink.sendIncoming(providerCode, e);
    },
    onCallEnded: (providerCode, e) => {
      serverLink.sendCallEnded(providerCode, e);
    },
    onStatus: (providerCode, status) => {
      console.log(
        `[status] provider=${providerCode} connected=${status.connected} ${status.message ?? ''}`,
      );
      serverLink.sendLineStatus(providerCode, status);
    },
  });

  serverLink.onReady = (lines) => {
    providerManager.start(lines).catch((error) => {
      console.error('[bridge] provider start failed:', error);
    });
  };

  serverLink.onDialRequest = async (request) => {
    console.log(
      `[dial] request=${request.requestId} to=${request.phoneNumber} provider=${request.line.providerCode}`,
    );
    const result = await providerManager.dial(request);
    serverLink.sendDialResult(request.requestId, result.success, result.message);
  };

  serverLink.connect();

  const shutdown = async () => {
    console.log('[bridge] shutting down...');
    await providerManager.stop();
    serverLink.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[bridge] started — server: ${config.serverUrl}`);
}

main().catch((error) => {
  console.error('[bridge] fatal:', error);
  process.exit(1);
});
