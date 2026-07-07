namespace EstateErp.CtiBridge.Adapters.Kt;

#if KT_INTEROP
// ============================================================
// tlbimp 산출물(Interop.KTPCBizLib.dll) 기반 실제 바인딩.
//
// 활성화 방법 (docs/CTI_BRIDGE_PLAN.md Step 0):
//   1. Windows에서 KT DLL 레지스트리 등록 (OpenAPI 레지스트리 등록.bat 방식)
//   2. tlbimp KTOpenAPI.dll /out:Interop.KTPCBizLib.dll
//   3. 산출물을 apps/cti-bridge/lib/ 에 커밋 → csproj가 자동으로 KT_INTEROP 정의 + 참조
//
// 주의: 아래 타입/이벤트 이름(KTPCBizLib.KTPCBizXClass, EventCID 등)은 tlbimp 표준
// 네이밍 관례 기준의 초안이다. 실제 산출물 생성 후 이름이 다르면 이 파일만 맞춘다.
// ============================================================
using KTPCBizLib;

internal sealed class TlbImpKtPcBizClient : IKtPcBizClient
{
    private readonly KTPCBizXClass _com;

    public event Action<int>? ConnectChanged;
    public event Action<int>? LoginCompleted;
    public event Action<string, string, string, string, string>? CidReceived;
    public event Action<string, short, int>? CallTerminated;
    public event Action<string, string, string, string>? CtcCompleted;

    /// <summary>반드시 STA 펌프 스레드에서 생성할 것</summary>
    public TlbImpKtPcBizClient()
    {
        _com = new KTPCBizXClass();
        _com.EventConnect += (nResult) => ConnectChanged?.Invoke(nResult);
        _com.EventLogin += (nResult) => LoginCompleted?.Invoke(nResult);
        _com.EventCID += (sCaller, sCallee, sResult, sClSeqno, sMiSeqno) =>
            CidReceived?.Invoke(sCaller, sCallee, sResult, sClSeqno, sMiSeqno);
        _com.EventCallTerminate += (sDBID, nMode, nTime) =>
            CallTerminated?.Invoke(sDBID, nMode, nTime);
        _com.EventCTC += (sCaller, sCallee, sResult, sMiSeqno) =>
            CtcCompleted?.Invoke(sCaller, sCallee, sResult, sMiSeqno);
    }

    public int Login(int server, string authKey, string loginId, string loginPwd) =>
        _com.Login(server, authKey, loginId, loginPwd);

    public void Logout() => _com.Logout();

    public int SetRecvPhone(string line) => _com.SetRecvPhone(line);

    public int SendCtc(string caller, string callee) => _com.SendCTC(caller, callee);

    public string GetApiVer() => _com.GetApiVer();

    public void Dispose()
    {
        try
        {
            System.Runtime.InteropServices.Marshal.FinalReleaseComObject(_com);
        }
        catch
        {
            // COM 정리 실패는 프로세스 종료를 막지 않는다
        }
    }
}
#else
/// <summary>
/// Interop.KTPCBizLib.dll이 아직 없을 때의 컴파일 placeholder.
/// tlbimp 산출물을 apps/cti-bridge/lib/에 넣으면 csproj가 KT_INTEROP을 정의해
/// 위의 실제 구현으로 교체된다.
/// </summary>
internal sealed class TlbImpKtPcBizClient : IKtPcBizClient
{
    public event Action<int>? ConnectChanged { add { } remove { } }
    public event Action<int>? LoginCompleted { add { } remove { } }
    public event Action<string, string, string, string, string>? CidReceived { add { } remove { } }
    public event Action<string, short, int>? CallTerminated { add { } remove { } }
    public event Action<string, string, string, string>? CtcCompleted { add { } remove { } }

    public TlbImpKtPcBizClient() => throw new InvalidOperationException(
        "Interop.KTPCBizLib.dll이 없습니다. Windows에서 tlbimp로 생성해 apps/cti-bridge/lib/에 " +
        "커밋하세요 — docs/CTI_BRIDGE_PLAN.md Step 0 참고.");

    public int Login(int server, string authKey, string loginId, string loginPwd) => throw new InvalidOperationException();
    public void Logout() { }
    public int SetRecvPhone(string line) => throw new InvalidOperationException();
    public int SendCtc(string caller, string callee) => throw new InvalidOperationException();
    public string GetApiVer() => throw new InvalidOperationException();
    public void Dispose() { }
}
#endif
