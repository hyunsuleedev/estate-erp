using EstateErp.CtiBridge.Models;

namespace EstateErp.CtiBridge.Adapters;

/// <summary>
/// KT OLLEH OpenAPI COM 어댑터 — Step 5에서 실계정 확보 후 구현 (docs/CTI_BRIDGE_PLAN.md).
///
/// 구현 가이드 (docs/reference/hanbang/app/KTPCBiz.idl 기준):
///
/// 0. 바인딩 (2026-07-07 확정): Windows에서 1회 `tlbimp KTOpenAPI.dll` →
///    Interop.KTPCBizLib.dll 생성 후 리포 커밋, 이 프로젝트가 참조 (IL이라 macOS 컴파일 유지).
///    마이스파이더와 동일 방식이나 그쪽 Interop 바이너리 재사용 금지 — KT DLL에서 직접 생성.
///    tlbimp 산출물이 .NET 8에서 문제일 때만 수기 [ComImport] + ComEventsHelper 폴백.
///
/// 1. COM 인터페이스: IKTPCBizX (dual, IDispatch)
///    - InitApi(cCmType)? → Login(nServer, sAuthKey, sLoginID, sLoginPwd) → EventLogin 콜백 대기
///      (InitApi 필요 여부는 PoC에서 KTOpenAPIDelphiSample 호출 순서로 확인)
///    - SetRecvPhone(sRecvPhone): config.Lines의 각 회선 등록
///    - SendCTC(sCaller, sCallee): 클릭투콜 발신 → DialAsync에서 호출
///
/// 2. 이벤트 sink: _IKTPCBizXEvents (dispinterface) — tlbimp 생성 C# 이벤트로 구독
///    - EventCID(sCaller, sCallee, sResult, sClSeqno, sMiSeqno)
///        → CtiCallEvent { Type="ring", Seqno=sClSeqno } 로 정규화
///    - EventCallTerminate(sDBID, nMode, nTime)
///        → CtiCallEvent { Type="terminate", DurationSec=nTime }
///      ⚠ sDBID ↔ sClSeqno 대응은 PoC 확인 필요. 다르면 GetCall(sDBID)로 역조회해
///        caller를 채운다 (서버는 seqno 없어도 번호+시간창 fallback으로 매칭 가능).
///    - EventCTC(sCaller, sCallee, sResult, sMiSeqno)
///        → CtiCallEvent { Type="ctc_result" }
///    - EventConnect(nResult) / EventLogin(nResult) → Connected/LoggedIn 갱신 + StatusChanged
///    - LoginKickOut: 중복 로그인 킥 정책 확인 → 재연결 백오프 + status broadcast
///
/// 3. 스레딩: COM 이벤트 수신을 위해 전용 STA 스레드 + 메시지 펌프 필수
///    (콘솔은 기본 펌프가 없어 펌프 없이는 이벤트가 오지 않는다).
///    STA 스레드: COM 생성/구독 + GetMessage/DispatchMessage P/Invoke 펌프 루프
///    → System.Threading.Channels로 메인 async 루프에 전달 → CallEventReceived.
///    메서드 호출(Login/SendCTC)은 COM 프록시가 STA로 자동 마샬링하므로 타 스레드 호출 허용.
///
/// 4. 배포: 반드시 win-x86 (32비트 COM). KT DLL은 오픈 — 설치본에 동봉하고
///    레지스트리 등록 자동화 (마이스파이더 "OpenAPI 레지스트리 등록.bat" 방식).
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
