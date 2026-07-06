using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using EstateErp.CtiBridge.Models;

namespace EstateErp.CtiBridge.Ws;

/// <summary>
/// 같은 PC의 Electron 앱에 이벤트를 push하는 로컬 WebSocket 서버.
/// 127.0.0.1 바인딩 — 외부 노출 없음 (docs/CTI_BRIDGE_PLAN.md §3.1).
/// 별도 NuGet 의존성 없이 HttpListener + AcceptWebSocketAsync 사용.
/// </summary>
public sealed class LocalWsServer : IAsyncDisposable
{
    /// <summary>클라이언트가 보낼 수 있는 최대 메시지 크기 (dial 커맨드는 수십 바이트)</summary>
    private const int MaxClientMessageBytes = 64 * 1024;

    private readonly int _port;
    private readonly Func<CtiBridgeStatus> _statusProvider;
    private readonly HttpListener _listener = new();
    private readonly ConcurrentDictionary<Guid, Client> _clients = new();
    private Task? _acceptLoop;

    /// <summary>
    /// WebSocket은 소켓당 동시 SendAsync를 1개만 허용한다 —
    /// ring/status broadcast가 겹치면 InvalidOperationException이 나므로 클라이언트별로 직렬화.
    /// </summary>
    private sealed record Client(WebSocket Socket, SemaphoreSlim SendLock);

    /// <summary>클라이언트가 보낸 클릭투콜 요청</summary>
    public event Func<CtiDialCommand, Task>? DialRequested;

    public LocalWsServer(int port, Func<CtiBridgeStatus> statusProvider)
    {
        _port = port;
        _statusProvider = statusProvider;
    }

    public void Start(CancellationToken ct)
    {
        _listener.Prefixes.Add($"http://127.0.0.1:{_port}/");
        _listener.Start();
        _acceptLoop = AcceptLoopAsync(ct);
        Console.WriteLine($"[ws] listening on ws://127.0.0.1:{_port}/");
    }

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _listener.IsListening)
        {
            HttpListenerContext context;
            try
            {
                context = await _listener.GetContextAsync().WaitAsync(ct);
            }
            catch (Exception) when (ct.IsCancellationRequested || !_listener.IsListening)
            {
                break;
            }

            if (!context.Request.IsWebSocketRequest)
            {
                context.Response.StatusCode = 400;
                context.Response.Close();
                continue;
            }

            _ = HandleClientAsync(context, ct);
        }
    }

    private async Task HandleClientAsync(HttpListenerContext context, CancellationToken ct)
    {
        WebSocket socket;
        try
        {
            var wsContext = await context.AcceptWebSocketAsync(subProtocol: null);
            socket = wsContext.WebSocket;
        }
        catch (Exception e)
        {
            Console.WriteLine($"[ws] handshake failed: {e.Message}");
            context.Response.StatusCode = 500;
            context.Response.Close();
            return;
        }

        var id = Guid.NewGuid();
        var client = new Client(socket, new SemaphoreSlim(1, 1));
        _clients[id] = client;
        Console.WriteLine($"[ws] client connected ({_clients.Count} total)");

        // 연결 직후 현재 상태를 내려준다 (Electron이 UI 배지에 사용)
        await SendAsync(id, client, _statusProvider(), ct);

        var frame = new byte[16 * 1024];
        using var message = new MemoryStream();
        try
        {
            while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var result = await socket.ReceiveAsync(frame, ct);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }
                if (result.MessageType != WebSocketMessageType.Text)
                {
                    continue;
                }

                // 프레임 단편화 대응: EndOfMessage까지 조립
                message.Write(frame, 0, result.Count);
                if (message.Length > MaxClientMessageBytes)
                {
                    await socket.CloseAsync(
                        WebSocketCloseStatus.MessageTooBig, "message too big", ct);
                    break;
                }
                if (!result.EndOfMessage)
                {
                    continue;
                }

                var json = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                message.SetLength(0);
                await HandleClientMessageAsync(json);
            }
        }
        catch (Exception) when (ct.IsCancellationRequested)
        {
            // shutting down
        }
        catch (WebSocketException)
        {
            // client vanished
        }
        finally
        {
            RemoveClient(id);
            Console.WriteLine($"[ws] client disconnected ({_clients.Count} total)");
        }
    }

    private async Task HandleClientMessageAsync(string json)
    {
        CtiDialCommand? command = null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            var type = doc.RootElement.TryGetProperty("type", out var t) ? t.GetString() : null;
            if (type == "dial")
            {
                command = JsonSerializer.Deserialize<CtiDialCommand>(json, Wire.Json);
            }
        }
        catch (JsonException e)
        {
            Console.WriteLine($"[ws] invalid client message: {e.Message}");
            return;
        }

        if (command is null || DialRequested is null)
        {
            return;
        }

        // 핸들러(어댑터 DialAsync 등) 예외가 이 클라이언트의 receive 루프를 죽이지 않게 격리
        try
        {
            await DialRequested(command);
        }
        catch (Exception e)
        {
            Console.WriteLine($"[ws] dial failed: {e.Message}");
        }
    }

    /// <summary>모든 클라이언트에 push. 어떤 클라이언트 오류도 밖으로 던지지 않는다.</summary>
    public async Task BroadcastAsync<T>(T message, CancellationToken ct)
    {
        byte[] payload;
        try
        {
            payload = JsonSerializer.SerializeToUtf8Bytes(message, Wire.Json);
        }
        catch (Exception e)
        {
            Console.WriteLine($"[ws] serialize failed: {e.Message}");
            return;
        }

        foreach (var (id, client) in _clients)
        {
            await SendRawAsync(id, client, payload, ct);
        }
    }

    private Task SendAsync<T>(Guid id, Client client, T message, CancellationToken ct)
        => SendRawAsync(id, client, JsonSerializer.SerializeToUtf8Bytes(message, Wire.Json), ct);

    private async Task SendRawAsync(Guid id, Client client, byte[] payload, CancellationToken ct)
    {
        if (client.Socket.State != WebSocketState.Open)
        {
            RemoveClient(id);
            return;
        }

        try
        {
            await client.SendLock.WaitAsync(ct);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        try
        {
            await client.Socket.SendAsync(payload, WebSocketMessageType.Text, true, ct);
        }
        catch (OperationCanceledException)
        {
            // shutting down
        }
        catch (Exception e)
        {
            // 한 클라이언트의 실패가 나머지 broadcast를 막지 않도록 제거만 하고 삼킨다
            Console.WriteLine($"[ws] send failed, dropping client: {e.Message}");
            RemoveClient(id);
        }
        finally
        {
            client.SendLock.Release();
        }
    }

    private void RemoveClient(Guid id)
    {
        if (_clients.TryRemove(id, out var client))
        {
            client.Socket.Dispose();
            client.SendLock.Dispose();
        }
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var (id, client) in _clients)
        {
            try
            {
                await client.Socket.CloseAsync(
                    WebSocketCloseStatus.NormalClosure, "bridge shutdown", CancellationToken.None);
            }
            catch (Exception)
            {
                // already gone
            }
            RemoveClient(id);
        }
        if (_listener.IsListening)
        {
            _listener.Stop();
        }
        _listener.Close();
        if (_acceptLoop is not null)
        {
            try
            {
                await _acceptLoop;
            }
            catch (OperationCanceledException)
            {
                // expected on shutdown
            }
        }
    }
}
