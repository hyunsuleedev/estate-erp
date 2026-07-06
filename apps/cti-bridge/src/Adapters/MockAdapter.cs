using EstateErp.CtiBridge.Models;

namespace EstateErp.CtiBridge.Adapters;

/// <summary>
/// SDK/실계정 없이 전 구간(Bridge → Electron → 서버 CallLog)을 개발·테스트하기 위한
/// 가짜 어댑터. stdin 명령(ring/end) 또는 autoRingIntervalSec 타이머로 이벤트를 발생시킨다.
/// </summary>
public sealed class MockAdapter : IVendorAdapter
{
    private readonly BridgeConfig _config;
    private readonly Random _random = new();
    /// <summary>
    /// 프로세스 재시작 시 seqno가 "mock-1"부터 재사용되어 서버 dedupe 키와 충돌하지 않도록
    /// 세션 고유 접두어를 붙인다 (실제 통신사 seqno 재사용 시나리오는 서버가 별도 방어).
    /// </summary>
    private readonly string _session = Guid.NewGuid().ToString("N")[..6];
    /// <summary>_activeCall이 Timer 스레드와 stdin REPL 스레드 양쪽에서 접근되므로 직렬화</summary>
    private readonly object _sync = new();

    private Timer? _autoTimer;
    private int _seq;
    private ActiveCall? _activeCall;

    private sealed record ActiveCall(string Seqno, string Caller, DateTimeOffset StartedAt);

    public MockAdapter(BridgeConfig config)
    {
        _config = config;
    }

    public string Vendor => "mock";
    public bool Connected { get; private set; }
    public bool LoggedIn { get; private set; }

    public event Action<CtiCallEvent>? CallEventReceived;
    public event Action? StatusChanged;

    public Task StartAsync(CancellationToken ct)
    {
        Connected = true;
        LoggedIn = true;
        StatusChanged?.Invoke();

        var intervalSec = _config.Mock.AutoRingIntervalSec;
        if (intervalSec > 0)
        {
            _autoTimer = new Timer(
                _ => AutoCycle(),
                null,
                TimeSpan.FromSeconds(intervalSec),
                TimeSpan.FromSeconds(intervalSec));
        }

        return Task.CompletedTask;
    }

    /// <summary>가짜 수신 이벤트 (KT EventCID 대응)</summary>
    public void Ring(string caller)
    {
        CtiCallEvent evt;
        lock (_sync)
        {
            var seqno = $"mock-{_session}-{++_seq}";
            var call = new ActiveCall(seqno, Normalize.Phone(caller), DateTimeOffset.UtcNow);
            _activeCall = call;

            evt = new CtiCallEvent
            {
                Type = "ring",
                Vendor = Vendor,
                Caller = call.Caller,
                Callee = _config.Lines.FirstOrDefault() ?? "07000000000",
                Seqno = call.Seqno,
                OccurredAt = call.StartedAt.ToString("O"),
            };
        }
        CallEventReceived?.Invoke(evt);
    }

    /// <summary>가짜 통화 종료 (KT EventCallTerminate 대응). durationSec 0 = 부재중.</summary>
    public void End(int? durationSec = null)
    {
        CtiCallEvent evt;
        lock (_sync)
        {
            var call = _activeCall;
            if (call is null)
            {
                Console.WriteLine("[mock] 진행 중인 통화가 없습니다. 먼저 `ring <번호>`.");
                return;
            }
            _activeCall = null;

            var now = DateTimeOffset.UtcNow;
            var duration = durationSec ?? (int)Math.Max(0, (now - call.StartedAt).TotalSeconds);

            evt = new CtiCallEvent
            {
                Type = "terminate",
                Vendor = Vendor,
                Caller = call.Caller,
                Callee = _config.Lines.FirstOrDefault() ?? "07000000000",
                Seqno = call.Seqno,
                DurationSec = duration,
                OccurredAt = now.ToString("O"),
            };
        }
        CallEventReceived?.Invoke(evt);
    }

    public Task DialAsync(string? caller, string callee, CancellationToken ct)
    {
        CallEventReceived?.Invoke(new CtiCallEvent
        {
            Type = "ctc_result",
            Vendor = Vendor,
            Caller = caller ?? _config.Lines.FirstOrDefault() ?? "07000000000",
            Callee = Normalize.Phone(callee),
            OccurredAt = DateTimeOffset.UtcNow.ToString("O"),
        });
        return Task.CompletedTask;
    }

    private void AutoCycle()
    {
        bool hasActive;
        lock (_sync)
        {
            hasActive = _activeCall is not null;
        }

        if (hasActive)
        {
            End();
            return;
        }
        Ring($"010{_random.Next(10000000, 99999999)}");
    }

    public ValueTask DisposeAsync()
    {
        _autoTimer?.Dispose();
        Connected = false;
        LoggedIn = false;
        return ValueTask.CompletedTask;
    }
}
