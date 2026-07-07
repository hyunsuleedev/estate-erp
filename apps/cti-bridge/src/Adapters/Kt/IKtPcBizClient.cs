namespace EstateErp.CtiBridge.Adapters.Kt;

/// <summary>
/// KT PCBiz COM 바인딩 심(seam) — 어댑터 로직과 tlbimp 산출물을 분리한다.
///
/// 구현체는 반드시 STA 펌프 스레드 위에서 생성/호출되어야 하며 (StaMessagePump.Post/InvokeAsync),
/// 이벤트도 그 스레드에서 발화된다. 시그니처 근거: docs/reference/hanbang/app/KTPCBiz.idl
/// </summary>
internal interface IKtPcBizClient : IDisposable
{
    /// <summary>EventConnect(nResult) — CTI 서버 연결 상태</summary>
    event Action<int>? ConnectChanged;

    /// <summary>EventLogin(nResult) — 로그인 결과</summary>
    event Action<int>? LoginCompleted;

    /// <summary>EventCID(sCaller, sCallee, sResult, sClSeqno, sMiSeqno) — 전화 수신 ★</summary>
    event Action<string, string, string, string, string>? CidReceived;

    /// <summary>EventCallTerminate(sDBID, nMode, nTime) — 통화 종료 ★</summary>
    event Action<string, short, int>? CallTerminated;

    /// <summary>EventCTC(sCaller, sCallee, sResult, sMiSeqno) — 클릭투콜 결과</summary>
    event Action<string, string, string, string>? CtcCompleted;

    /// <summary>Login(nServer, sAuthKey, sLoginID, sLoginPwd) → 결과는 LoginCompleted 콜백</summary>
    int Login(int server, string authKey, string loginId, string loginPwd);

    void Logout();

    /// <summary>SetRecvPhone(sRecvPhone) — 수신 감지 회선 등록</summary>
    int SetRecvPhone(string line);

    /// <summary>SendCTC(sCaller, sCallee) — 클릭투콜 발신</summary>
    int SendCtc(string caller, string callee);

    /// <summary>GetApiVer() — 연결 전 smoke check용</summary>
    string GetApiVer();
}
