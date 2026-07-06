using EstateErp.CtiBridge.Models;

namespace EstateErp.CtiBridge.Adapters;

/// <summary>
/// 통신사 CTI SDK 추상화. Bridge의 존재 이유는 이 인터페이스가 만들어내는
/// ring/terminate 두 이벤트다 (docs/CTI_BRIDGE_PLAN.md §1.1).
/// </summary>
public interface IVendorAdapter : IAsyncDisposable
{
    /// <summary>mock | kt | lgu | samsung</summary>
    string Vendor { get; }

    /// <summary>통신사 CTI 서버 연결 여부</summary>
    bool Connected { get; }

    bool LoggedIn { get; }

    /// <summary>수신(ring)/종료(terminate)/발신결과(ctc_result) 이벤트</summary>
    event Action<CtiCallEvent>? CallEventReceived;

    /// <summary>Connected/LoggedIn 변화 — 구독자는 상태를 다시 broadcast</summary>
    event Action? StatusChanged;

    /// <summary>SDK 초기화 + 로그인 + 수신 회선 등록</summary>
    Task StartAsync(CancellationToken ct);

    /// <summary>클릭투콜 발신 (KT SendCTC)</summary>
    Task DialAsync(string? caller, string callee, CancellationToken ct);
}
