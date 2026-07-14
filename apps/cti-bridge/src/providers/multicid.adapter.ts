import { HelperBackedProvider } from './helper.provider.js';

/**
 * 멀티CID 장치 — 선포/골드 (코드 20/30, 레거시 multicid.ocx 32bit ActiveX).
 *
 * OCX 전용이라 Node 직접 통합 불가 — native-helper(.NET 32bit)가 처리한다.
 *
 * 레거시 대응:
 * - 착신: ucSunPo.axMulticid1_CidMsgRx → Regex \D 제거(len>4) → SunPoCallEvent
 *         → helper {type:"incoming"}
 * - 발신: axMulticid1.phoneCall(num), DialReady 대기 → helper {type:"dial"} 처리
 * - 물리 장치가 꽂힌 PC에서 로컬 감지 (크리덴셜 불필요)
 *
 * 20(선포)과 30(골드)은 같은 OCX를 쓰므로 어댑터 하나가 두 코드를 커버한다.
 */
export class MulticidAdapter extends HelperBackedProvider {
  readonly code = '20';
  readonly displayName = '멀티CID (선포/골드)';

  /** provider-manager가 20·30 두 코드 모두 이 어댑터로 라우팅 */
  static readonly codes = ['20', '30'];

  constructor(helperPath: string | null) {
    super(helperPath, 'multicid');
  }
}
