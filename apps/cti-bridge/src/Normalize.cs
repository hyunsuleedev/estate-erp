namespace EstateErp.CtiBridge;

/// <summary>
/// 전화번호 정규화 — 서버의 contact-phone.utils.ts normalizePhone과 동일 규칙.
/// (공백/하이픈/괄호 제거, +82/82 국가번호 → 0 프리픽스)
/// </summary>
public static class Normalize
{
    public static string Phone(string raw)
    {
        var cleaned = new string(raw.Where(c => c is not (' ' or '-' or '(' or ')')).ToArray());
        if (cleaned.StartsWith("+82", StringComparison.Ordinal))
        {
            cleaned = "0" + cleaned[3..];
        }
        else if (cleaned.StartsWith("82", StringComparison.Ordinal) && cleaned.Length > 10)
        {
            cleaned = "0" + cleaned[2..];
        }
        return cleaned;
    }
}
