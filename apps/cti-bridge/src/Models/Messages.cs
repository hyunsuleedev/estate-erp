using System.Text.Json;
using System.Text.Json.Serialization;

namespace EstateErp.CtiBridge.Models;

/// <summary>
/// 와이어 계약 SSOT: packages/shared/src/cti.ts (docs/CTI_BRIDGE_PLAN.md §4.1)
/// TS 쪽을 바꾸면 이 파일도 함께 바꿔야 한다. JSON은 camelCase.
/// </summary>
public static class Wire
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

/// <summary>
/// Bridge → 클라이언트(Electron): 통화 이벤트.
/// KT COM `_IKTPCBizXEvents` 기준: ring = EventCID, terminate = EventCallTerminate.
/// </summary>
public sealed record CtiCallEvent
{
    /// <summary>ring | terminate | ctc_result</summary>
    public required string Type { get; init; }

    /// <summary>mock | kt | lgu | samsung</summary>
    public required string Vendor { get; init; }

    /// <summary>발신번호 (정규화: 01012345678)</summary>
    public required string Caller { get; init; }

    /// <summary>착신번호 (수신 회선)</summary>
    public required string Callee { get; init; }

    /// <summary>내선/회선 식별</summary>
    public string? LineId { get; init; }

    /// <summary>통신사 통화 시퀀스 (KT EventCID sClSeqno) — 서버 CallLog dedupe 키</summary>
    public string? Seqno { get; init; }

    /// <summary>terminate 시 통화 시간(초) (KT EventCallTerminate nTime)</summary>
    public int? DurationSec { get; init; }

    /// <summary>ISO 8601</summary>
    public required string OccurredAt { get; init; }
}

/// <summary>Bridge → 클라이언트: 브리지/통신사 연결 상태</summary>
public sealed record CtiBridgeStatus
{
    public string Type { get; init; } = "status";
    public required string Vendor { get; init; }
    public required bool Connected { get; init; }
    public required bool LoggedIn { get; init; }
    public required string[] Lines { get; init; }
    public required string BridgeVersion { get; init; }
}

/// <summary>클라이언트 → Bridge: 클릭투콜 발신 (KT SendCTC)</summary>
public sealed record CtiDialCommand
{
    public required string Type { get; init; }

    /// <summary>발신 회선 (생략 시 Bridge 기본 회선)</summary>
    public string? Caller { get; init; }

    /// <summary>상대방 번호</summary>
    public required string Callee { get; init; }
}
