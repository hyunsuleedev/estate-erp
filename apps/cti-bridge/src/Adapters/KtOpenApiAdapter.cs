using EstateErp.CtiBridge.Models;

namespace EstateErp.CtiBridge.Adapters;

/// <summary>
/// KT OLLEH OpenAPI COM 어댑터 — Step 5에서 실계정 확보 후 구현 (docs/CTI_BRIDGE_PLAN.md).
///
/// 구현 가이드 (docs/reference/hanbang/app/KTPCBiz.idl 기준):
///
/// 1. COM 인터페이스: IKTPCBizX (dual, IDispatch)
///    - InitApi(cCmType) → Login(nServer, sAuthKey, sLoginID, sLoginPwd) → EventLogin 콜백 대기
///    - SetRecvPhone(sRecvPhone): config.Lines의 각 회선 등록
///    - SendCTC(sCaller, sCallee): 클릭투콜 발신 → DialAsync에서 호출
///
/// 2. 이벤트 sink: _IKTPCBizXEvents (dispinterface) — COM 커넥션 포인트로 연결
///    - EventCID(sCaller, sCallee, sResult, sClSeqno, sMiSeqno)
///        → CtiCallEvent { Type="ring", Seqno=sClSeqno } 로 정규화
///    - EventCallTerminate(sDBID, nMode, nTime)
///        → CtiCallEvent { Type="terminate", DurationSec=nTime }
///    - EventCTC(sCaller, sCallee, sResult, sMiSeqno)
///        → CtiCallEvent { Type="ctc_result" }
///    - EventConnect(nResult) / EventLogin(nResult) → Connected/LoggedIn 갱신 + StatusChanged
///
/// 3. 스레딩: COM 이벤트 수신을 위해 STA 스레드 + 메시지 펌프 필요.
///    전용 STA 스레드에서 COM 객체 생성/이벤트 수신 → Channel로 메인 루프에 전달.
///
/// 4. 배포: 반드시 win-x86 (32비트 COM). KTOpenAPI DLL은 벤더 배포본으로 레지스트리 등록
///    (마이스파이더 "OpenAPI 레지스트리 등록.bat" 참고).
/// </summary>
public sealed class KtOpenApiAdapter : IVendorAdapter
{
    public KtOpenApiAdapter(BridgeConfig config)
    {
        _ = config;
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException(
                "KT OpenAPI 어댑터는 Windows(32비트 COM) 전용입니다. 개발은 vendor=mock 사용.");
        }
    }

    public string Vendor => "kt";
    public bool Connected => false;
    public bool LoggedIn => false;

    public event Action<CtiCallEvent>? CallEventReceived
    {
        add { _ = value; }
        remove { _ = value; }
    }

    public event Action? StatusChanged
    {
        add { _ = value; }
        remove { _ = value; }
    }

    public Task StartAsync(CancellationToken ct)
        => throw new NotImplementedException(
            "KT 실계정 확보 후 Step 5에서 구현 — docs/CTI_BRIDGE_PLAN.md §5 참고.");

    public Task DialAsync(string? caller, string callee, CancellationToken ct)
        => throw new NotImplementedException(
            "KT 실계정 확보 후 Step 5에서 구현 (SendCTC).");

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
