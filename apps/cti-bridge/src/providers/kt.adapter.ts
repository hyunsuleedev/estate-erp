import { HelperBackedProvider } from './helper.provider.js';

/**
 * KT OpenAPI (코드 41, 레거시 KTPCBizX COM ActiveX).
 *
 * 로그인·CID·발신(SendCTC) 전부 32bit COM 전용이라 Node 직접 통합 불가 —
 * native-helper(.NET 32bit)가 처리한다 (스펙 §13).
 *
 * 레거시 대응:
 * - 로그인: frmMain.KTPLogin (마스터 PC 전용, sKTPAuthKey → credential.authKey)
 * - 착신:  KTOpenApi_EventCID sResult=="201" → helper {type:"incoming"}
 * - 종료:  EventCID sResult=="407" → helper {type:"callEnded"}
 * - 발신:  KTOpenApi.SendCTC(sendNum, num) → helper {type:"dial"} 처리
 * - dedup 키: caller|seqno (레거시 sKTPreChannel) → channelKey "41:{caller}|{seqno}"
 */
export class KtAdapter extends HelperBackedProvider {
  readonly code = '41';
  readonly displayName = 'KT OpenAPI';

  constructor(helperPath: string | null) {
    super(helperPath, 'kt');
  }
}
