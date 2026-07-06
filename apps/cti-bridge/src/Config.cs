using System.Text.Json;

namespace EstateErp.CtiBridge;

/// <summary>
/// 로컬 설정 (한방 Config/cid.ini 대응). exe 옆의 appsettings.json에서 로드.
/// CTI 계정은 PC 로컬 자산이므로 서버에 저장하지 않는다 (docs/CTI_BRIDGE_PLAN.md §1.2).
/// </summary>
public sealed record BridgeConfig
{
    public int Port { get; init; } = 45332;

    /// <summary>mock | kt | lgu | samsung</summary>
    public string Vendor { get; init; } = "mock";

    /// <summary>감시할 수신 회선 번호 (KT SetRecvPhone 대상)</summary>
    public string[] Lines { get; init; } = [];

    public MockConfig Mock { get; init; } = new();
    public KtConfig Kt { get; init; } = new();

    public static BridgeConfig Load(string? baseDir = null)
    {
        var dir = baseDir ?? AppContext.BaseDirectory;
        var path = Path.Combine(dir, "appsettings.json");
        if (!File.Exists(path))
        {
            return new BridgeConfig();
        }

        using var stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<BridgeConfig>(stream, Models.Wire.Json)
               ?? new BridgeConfig();
    }
}

public sealed record MockConfig
{
    /// <summary>0 = 수동(stdin 명령)만. N초마다 가짜 수신 이벤트 자동 발생.</summary>
    public int AutoRingIntervalSec { get; init; }
}

public sealed record KtConfig
{
    /// <summary>KT Login nServer 파라미터</summary>
    public int Server { get; init; }
    public string AuthKey { get; init; } = "";
    public string LoginId { get; init; } = "";
    public string LoginPwd { get; init; } = "";
}
