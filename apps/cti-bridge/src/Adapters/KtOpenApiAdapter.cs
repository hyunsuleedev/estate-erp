using System.Collections.Concurrent;
using System.Runtime.Versioning;
using System.Threading.Channels;
using EstateErp.CtiBridge.Adapters.Kt;
using EstateErp.CtiBridge.Models;

namespace EstateErp.CtiBridge.Adapters;

/// <summary>
/// KT OLLEH OpenAPI COM 어댑터.
///
/// 구조 (docs/CTI_BRIDGE_PLAN.md Step 0):
///   StaMessagePump(전용 STA 스레드 + Win32 펌프) 위에서 IKtPcBizClient(tlbimp 심)를
///   생성·호출하고, COM 이벤트를 Channel로 메인 루프에 마샬링해 CallEventReceived로 발화.
///
/// 상태: 컴파일 가능한 풀 골격 — 런타임 검증은 Windows + KT 인증키 + Interop DLL(PoC) 대기.
/// PoC에서 해소할 미지수는 KtPcBizClient/아래 주석의 ⚠ 표시 참고.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class KtOpenApiAdapter : IVendorAdapter
{
    /// <summary>KT 이벤트 콜백의 결과 코드 성공값 (⚠ PoC에서 실제 값 확인 — 0 가정)</summary>
    private const int ResultOk = 0;

    private static readonly TimeSpan InitialRetryDelay = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan MaxRetryDelay = TimeSpan.FromSeconds(60);

    private readonly BridgeConfig _config;
    private readonly StaMessagePump _pump = new();
    private readonly Channel<CtiCallEvent> _events = Channel.CreateUnbounded<CtiCallEvent>();
    private readonly CancellationTokenSource _cts = new();

    /// <summary>
    /// ⚠ PoC 미지수 대응: EventCID는 sClSeqno를, EventCallTerminate는 sDBID를 준다.
    /// 같은 값인지 불명이므로 진행 중 통화를 seqno→caller로 기억해두고,
    /// terminate 시 sDBID로 못 찾으면 단일 진행 통화로 폴백한다.
    /// (서버는 caller 번호+시간창 fallback이 있어 최악에도 기록은 남는다)
    /// </summary>
    private readonly ConcurrentDictionary<string, string> _activeCalls = new();

    private IKtPcBizClient? _client;
    private Task? _readerTask;
    private int _retryAttempt;

    public KtOpenApiAdapter(BridgeConfig config)
    {
        _config = config;
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException(
                "KT OpenAPI 어댑터는 Windows(32비트 COM) 전용입니다. 개발은 vendor=mock 사용.");
        }
    }

    public string Vendor => "kt";
    public bool Connected { get; private set; }
    public bool LoggedIn { get; private set; }

    public event Action<CtiCallEvent>? CallEventReceived;
    public event Action? StatusChanged;

    public async Task StartAsync(CancellationToken ct)
    {
        await _pump.StartAsync();

        // 이벤트를 STA 스레드 밖(메인 루프)에서 소비자에게 전달
        _readerTask = Task.Run(async () =>
        {
            await foreach (var evt in _events.Reader.ReadAllAsync(_cts.Token))
            {
                CallEventReceived?.Invoke(evt);
            }
        }, _cts.Token);

        // COM 객체 생성 + 이벤트 결선 + 로그인은 전부 STA 스레드에서
        await _pump.InvokeAsync(() =>
        {
            _client = new TlbImpKtPcBizClient();
            WireClientEvents(_client);
            Console.WriteLine($"[kt] api version: {SafeApiVer(_client)}");
            BeginLogin(_client);
            return true;
        });
    }

    private static string SafeApiVer(IKtPcBizClient client)
    {
        try
        {
            return client.GetApiVer();
        }
        catch (Exception e)
        {
            return $"(GetApiVer 실패: {e.Message})";
        }
    }

    private void WireClientEvents(IKtPcBizClient client)
    {
        client.ConnectChanged += (result) =>
        {
            Connected = result == ResultOk;
            StatusChanged?.Invoke();
            if (!Connected)
            {
                LoggedIn = false;
                ScheduleRelogin();
            }
        };

        client.LoginCompleted += (result) =>
        {
            LoggedIn = result == ResultOk;
            Connected = Connected || LoggedIn;
            StatusChanged?.Invoke();

            if (LoggedIn)
            {
                _retryAttempt = 0;
                RegisterLines(client);
            }
            else
            {
                Console.WriteLine($"[kt] login failed: {result}");
                ScheduleRelogin();
            }
        };

        client.CidReceived += (caller, callee, _result, clSeqno, _miSeqno) =>
        {
            var normalized = Normalize.Phone(caller);
            if (!string.IsNullOrEmpty(clSeqno))
            {
                _activeCalls[clSeqno] = normalized;
            }
            _events.Writer.TryWrite(new CtiCallEvent
            {
                Type = "ring",
                Vendor = Vendor,
                Caller = normalized,
                Callee = Normalize.Phone(callee),
                Seqno = string.IsNullOrEmpty(clSeqno) ? null : clSeqno,
                OccurredAt = DateTimeOffset.UtcNow.ToString("O"),
            });
        };

        client.CallTerminated += (dbId, _mode, durationSec) =>
        {
            // ⚠ sDBID ↔ sClSeqno 대응은 PoC 확인 항목 — 우선 같다고 가정하고 조회,
            // 실패 시 "진행 중 통화가 1건뿐"이면 그것으로 폴백
            string? caller = null;
            if (!string.IsNullOrEmpty(dbId) && _activeCalls.TryRemove(dbId, out var byId))
            {
                caller = byId;
            }
            else if (_activeCalls.Count == 1)
            {
                var only = _activeCalls.Keys.First();
                if (_activeCalls.TryRemove(only, out var single))
                {
                    caller = single;
                }
            }

            _events.Writer.TryWrite(new CtiCallEvent
            {
                Type = "terminate",
                Vendor = Vendor,
                Caller = caller ?? "",
                Callee = _config.Lines.FirstOrDefault() ?? "",
                Seqno = string.IsNullOrEmpty(dbId) ? null : dbId,
                DurationSec = Math.Max(0, durationSec),
                OccurredAt = DateTimeOffset.UtcNow.ToString("O"),
            });
        };

        client.CtcCompleted += (caller, callee, _result, _miSeqno) =>
        {
            _events.Writer.TryWrite(new CtiCallEvent
            {
                Type = "ctc_result",
                Vendor = Vendor,
                Caller = Normalize.Phone(caller),
                Callee = Normalize.Phone(callee),
                OccurredAt = DateTimeOffset.UtcNow.ToString("O"),
            });
        };
    }

    private void BeginLogin(IKtPcBizClient client)
    {
        var kt = _config.Kt;
        var result = client.Login(kt.Server, kt.AuthKey, kt.LoginId, kt.LoginPwd);
        Console.WriteLine($"[kt] Login() returned {result} — 최종 결과는 EventLogin 콜백");
        // ⚠ InitApi(cCmType) 선행 필요 여부는 PoC에서 KTOpenAPIDelphiSample 호출 순서로 확인
    }

    private void RegisterLines(IKtPcBizClient client)
    {
        foreach (var line in _config.Lines)
        {
            var result = client.SetRecvPhone(line);
            Console.WriteLine($"[kt] SetRecvPhone({line}) -> {result}");
        }
    }

    /// <summary>연결/로그인 실패 시 지수 백오프 재시도 (LoginKickOut 포함 ⚠ 정책 PoC 확인)</summary>
    private void ScheduleRelogin()
    {
        if (_cts.IsCancellationRequested) return;

        var attempt = Math.Min(++_retryAttempt, 10);
        var delay = TimeSpan.FromTicks(Math.Min(
            InitialRetryDelay.Ticks * (1L << Math.Min(attempt - 1, 4)),
            MaxRetryDelay.Ticks));
        Console.WriteLine($"[kt] {delay.TotalSeconds:0}s 후 재로그인 시도 ({attempt}회차)");

        _ = Task.Delay(delay, _cts.Token).ContinueWith(t =>
        {
            if (t.IsCanceled || _client is null) return;
            _pump.Post(() => BeginLogin(_client));
        }, TaskScheduler.Default);
    }

    public Task DialAsync(string? caller, string callee, CancellationToken ct)
    {
        if (_client is null || !LoggedIn)
        {
            throw new InvalidOperationException("KT CTI가 로그인되지 않았습니다.");
        }
        var from = caller ?? _config.Lines.FirstOrDefault()
            ?? throw new InvalidOperationException("발신 회선(config.lines)이 없습니다.");

        return _pump.InvokeAsync(() => _client.SendCtc(from, Normalize.Phone(callee)));
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        _events.Writer.TryComplete();

        if (_client is not null)
        {
            await _pump.InvokeAsync(() =>
            {
                try
                {
                    _client.Logout();
                }
                finally
                {
                    _client.Dispose();
                }
                return true;
            }).WaitAsync(TimeSpan.FromSeconds(5)).ContinueWith(_ => { });
        }

        _pump.Stop();
        Connected = false;
        LoggedIn = false;

        if (_readerTask is not null)
        {
            try
            {
                await _readerTask;
            }
            catch (OperationCanceledException)
            {
                // expected
            }
        }
    }
}
