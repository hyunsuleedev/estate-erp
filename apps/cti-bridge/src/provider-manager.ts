import type { BridgeConfig } from './config.js';
import { ChannelDedup } from './dedup.js';
import { normalizePhone } from './normalize.js';
import type {
  CallEnded,
  CtiProvider,
  DialRequest,
  DialResult,
  ProviderStatus,
  RawIncoming,
} from './providers/provider.interface.js';
import type { CtiLineConfigWithCredential } from './providers/helper.provider.js';
import { KtAdapter } from './providers/kt.adapter.js';
import { MulticidAdapter } from './providers/multicid.adapter.js';
import { LguAdapter } from './providers/lgu.adapter.js';

export interface ProviderManagerEvents {
  onIncoming: (providerCode: string, e: RawIncoming) => void;
  onCallEnded: (providerCode: string, e: CallEnded) => void;
  onStatus: (providerCode: string, s: ProviderStatus) => void;
}

/**
 * 어댑터 로드/생명주기/이벤트 배선 (스펙 §7).
 *
 * 서버가 내려준 회선 목록(cti.bridge.ready)에 등장하는 프로바이더 코드만
 * 어댑터를 기동한다. CTI_ENABLED_PROVIDERS로 추가 필터 가능.
 * 착신은 어댑터 → dedup → 업링크 순서로 흐른다 (브리지 1차, 서버 2차 dedup).
 */
export class ProviderManager {
  /** providerCode → adapter (멀티CID는 20/30 두 키가 같은 인스턴스) */
  private readonly adapters = new Map<string, CtiProvider>();
  private readonly dedup = new ChannelDedup();

  constructor(
    private readonly config: BridgeConfig,
    private readonly events: ProviderManagerEvents,
  ) {}

  async start(lines: CtiLineConfigWithCredential[]) {
    await this.stop();

    const activeLines = this.config.enabledProviders
      ? lines.filter((line) =>
          this.config.enabledProviders!.includes(line.providerCode),
        )
      : lines;

    const codes = new Set(activeLines.map((line) => line.providerCode));

    for (const code of codes) {
      if (this.adapters.has(code)) continue;

      const adapter = this.createAdapter(code);
      if (!adapter) {
        this.events.onStatus(code, {
          connected: false,
          message: `지원하지 않는 프로바이더 코드: ${code}`,
        });
        continue;
      }

      this.wireAdapter(code, adapter);
      this.adapters.set(code, adapter);
      if (adapter instanceof MulticidAdapter) {
        for (const alias of MulticidAdapter.codes) {
          this.adapters.set(alias, adapter);
        }
      }

      const adapterLines = activeLines.filter((line) =>
        adapter instanceof MulticidAdapter
          ? MulticidAdapter.codes.includes(line.providerCode)
          : line.providerCode === code,
      );
      await adapter.start(adapterLines);
    }
  }

  async stop() {
    const stopped = new Set<CtiProvider>();
    for (const adapter of this.adapters.values()) {
      if (stopped.has(adapter)) continue;
      stopped.add(adapter);
      await adapter.stop();
    }
    this.adapters.clear();
  }

  async dial(request: DialRequest): Promise<DialResult> {
    const adapter = this.adapters.get(request.line.providerCode);
    if (!adapter) {
      return {
        success: false,
        message: `프로바이더 ${request.line.providerCode} 어댑터가 활성화되어 있지 않습니다.`,
      };
    }
    return adapter.dial(request);
  }

  private createAdapter(code: string): CtiProvider | null {
    switch (code) {
      case '41':
        return new KtAdapter(this.config.ktHelperPath);
      case '20':
      case '30':
        return new MulticidAdapter(this.config.multicidHelperPath);
      case '70':
        return new LguAdapter(this.config.lguBaseUrl);
      default:
        // 10(직렬)·50(삼성)은 Phase 1 범위 밖 — 어댑터 인터페이스만 준비됨
        return null;
    }
  }

  private wireAdapter(code: string, adapter: CtiProvider) {
    adapter.onIncoming((e) => {
      // dedup 키: 어댑터가 준 channelKey 우선, 없으면 정규화 번호 기반 합성
      const normalized = normalizePhone(e.rawCid);
      const channelKey =
        e.channelKey ?? `${code}:${normalized.phoneNumber || 'private'}`;

      if (!this.dedup.shouldProcess(channelKey)) return;

      this.events.onIncoming(code, {
        ...e,
        channelKey,
        occurredAt: e.occurredAt ?? new Date().toISOString(),
      });
    });

    adapter.onCallEnded((e) => this.events.onCallEnded(code, e));
    adapter.onStatus((s) => this.events.onStatus(code, s));
  }
}
