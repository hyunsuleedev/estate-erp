using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace EstateErp.CtiBridge.Adapters.Kt;

/// <summary>
/// KT COM(Apartment 모델)의 이벤트 콜백을 받기 위한 전용 STA 스레드 + Win32 메시지 펌프.
///
/// 콘솔 앱에는 기본 펌프가 없어서 펌프 없이는 COM 커넥션 포인트 이벤트가 절대 오지 않는다.
/// COM 객체 생성/메서드 호출/이벤트 수신이 모두 이 스레드 위에서 일어나도록
/// Post/InvokeAsync로 작업을 마샬링한다. (docs/CTI_BRIDGE_PLAN.md Step 0 §3)
///
/// Windows 전용 — 컴파일은 어디서나 되지만 Start()는 Windows에서만 호출해야 한다.
/// </summary>
[SupportedOSPlatform("windows")]
internal sealed class StaMessagePump : IDisposable
{
    private const uint WM_QUIT = 0x0012;
    private const uint WM_APP_WORK = 0x8000 + 1; // WM_APP + 1
    private const uint PM_NOREMOVE = 0x0000;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeMessage
    {
        public IntPtr Hwnd;
        public uint Message;
        public IntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public int PtX;
        public int PtY;
    }

    [DllImport("user32.dll")]
    private static extern int GetMessage(out NativeMessage lpMsg, IntPtr hWnd, uint filterMin, uint filterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref NativeMessage lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref NativeMessage lpMsg);

    [DllImport("user32.dll")]
    private static extern bool PeekMessage(out NativeMessage lpMsg, IntPtr hWnd, uint filterMin, uint filterMax, uint removeMsg);

    [DllImport("user32.dll")]
    private static extern bool PostThreadMessage(uint idThread, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    private readonly ConcurrentQueue<Action> _work = new();
    private readonly TaskCompletionSource _ready =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    private Thread? _thread;
    private uint _nativeThreadId;
    private volatile bool _stopped;

    /// <summary>STA 스레드를 시작하고 메시지 큐가 준비될 때까지 대기한다.</summary>
    public Task StartAsync()
    {
        if (_thread is not null)
        {
            return _ready.Task;
        }

        _thread = new Thread(PumpLoop) { IsBackground = true, Name = "kt-cti-sta" };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
        return _ready.Task;
    }

    private void PumpLoop()
    {
        _nativeThreadId = GetCurrentThreadId();
        // 스레드 메시지 큐를 강제로 생성 (없으면 최초 PostThreadMessage가 실패할 수 있음)
        PeekMessage(out _, IntPtr.Zero, 0, 0, PM_NOREMOVE);
        _ready.TrySetResult();

        while (GetMessage(out var msg, IntPtr.Zero, 0, 0) > 0)
        {
            if (msg.Hwnd == IntPtr.Zero && msg.Message == WM_APP_WORK)
            {
                DrainWork();
                continue;
            }
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }

        _stopped = true;
        DrainWork(); // 종료 중 남은 작업 정리 (Logout/Dispose 등)
    }

    private void DrainWork()
    {
        while (_work.TryDequeue(out var action))
        {
            try
            {
                action();
            }
            catch (Exception e)
            {
                Console.WriteLine($"[kt-sta] work failed: {e.Message}");
            }
        }
    }

    /// <summary>STA 스레드에서 실행할 작업을 큐잉 (fire-and-forget)</summary>
    public void Post(Action action)
    {
        _work.Enqueue(action);
        if (!_stopped)
        {
            PostThreadMessage(_nativeThreadId, WM_APP_WORK, IntPtr.Zero, IntPtr.Zero);
        }
    }

    /// <summary>STA 스레드에서 실행하고 결과를 기다린다</summary>
    public Task<T> InvokeAsync<T>(Func<T> func)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        Post(() =>
        {
            try
            {
                tcs.SetResult(func());
            }
            catch (Exception e)
            {
                tcs.SetException(e);
            }
        });
        return tcs.Task;
    }

    public void Stop()
    {
        if (_thread is null || _stopped) return;
        PostThreadMessage(_nativeThreadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
        _thread.Join(TimeSpan.FromSeconds(5));
    }

    public void Dispose() => Stop();
}
