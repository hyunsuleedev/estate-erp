using System.Reflection;
using EstateErp.CtiBridge;
using EstateErp.CtiBridge.Adapters;
using EstateErp.CtiBridge.Models;
using EstateErp.CtiBridge.Ws;

var config = BridgeConfig.Load();
var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";

Console.WriteLine($"Estate ERP CTI Bridge v{version} (vendor={config.Vendor}, port={config.Port})");

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

await using IVendorAdapter adapter = config.Vendor switch
{
    "mock" => new MockAdapter(config),
    "kt" => new KtOpenApiAdapter(config),
    _ => throw new NotSupportedException(
        $"지원하지 않는 vendor: {config.Vendor} (mock | kt — lgu/samsung은 2순위, docs/CTI_BRIDGE_PLAN.md)"),
};

CtiBridgeStatus CurrentStatus() => new()
{
    Vendor = adapter.Vendor,
    Connected = adapter.Connected,
    LoggedIn = adapter.LoggedIn,
    Lines = config.Lines,
    BridgeVersion = version,
};

await using var ws = new LocalWsServer(config.Port, CurrentStatus);

adapter.CallEventReceived += evt =>
{
    Console.WriteLine($"[cti] {evt.Type} caller={evt.Caller} seqno={evt.Seqno} duration={evt.DurationSec}");
    _ = ws.BroadcastAsync(evt, cts.Token);
};
adapter.StatusChanged += () => _ = ws.BroadcastAsync(CurrentStatus(), cts.Token);
ws.DialRequested += command => adapter.DialAsync(command.Caller, command.Callee, cts.Token);

ws.Start(cts.Token);
await adapter.StartAsync(cts.Token);

if (adapter is MockAdapter mock)
{
    Console.WriteLine("mock 명령: ring <번호> | end [통화초] | status | quit");
    _ = Task.Run(() => MockRepl(mock), cts.Token);
}

try
{
    await Task.Delay(Timeout.Infinite, cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("shutting down...");
}

void MockRepl(MockAdapter mock)
{
    while (!cts.IsCancellationRequested)
    {
        var line = Console.ReadLine();
        if (line is null)
        {
            return; // stdin closed (백그라운드 실행)
        }

        var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            continue;
        }

        switch (parts[0].ToLowerInvariant())
        {
            case "ring":
                mock.Ring(parts.Length > 1 ? parts[1] : "01012345678");
                break;
            case "end":
                mock.End(parts.Length > 1 && int.TryParse(parts[1], out var sec) ? sec : null);
                break;
            case "status":
                Console.WriteLine(
                    System.Text.Json.JsonSerializer.Serialize(CurrentStatus(), Wire.Json));
                break;
            case "quit" or "exit":
                cts.Cancel();
                return;
            default:
                Console.WriteLine("명령: ring <번호> | end [통화초] | status | quit");
                break;
        }
    }
}
