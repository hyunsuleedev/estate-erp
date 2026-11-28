/**
 * MCP에서 쓰는 낱말 — AI에게 "매물"은 하나뿐이어야 한다.
 *
 * DB와 서비스에는 이름이 비슷한 것이 둘 있다: 집주인이 한 번 맡긴 의뢰(ListingIntake)와 그 안의 거래 조건 하나
 * (Listing: 매매 · 전세 · 월세). 매물관리 화면의 한 줄은 의뢰다. 그런데 도구 이름이 DB를 따라
 * find_listings(조건) · find_listing_intakes(의뢰)로 나뉘어 있어, "매물 알려 줘"에 AI가 무엇을 부를지 정해지지 않았다
 * (사용자 지적 2026-11-28).
 *
 * 그래서 MCP에서는 낱말을 이렇게 쓴다:
 * - listing = 매물 = 화면의 한 줄 (DB의 ListingIntake)
 * - term    = 거래 조건 하나 (DB의 Listing)
 *
 * 바꾸는 것은 MCP 층뿐이다. DB · 서비스 · REST · 화면의 이름은 그대로다. 도구의 인자는 도구 정의에서 손으로 옮기고
 * (`termId` → 서비스의 `listingId`), 응답의 칸 이름은 여기서 한 번에 옮긴다 — 응답에 `listingId`가 조건을 뜻하는 채로
 * 남으면 AI가 그 값을 매물 id 자리에 넣는다.
 */

type Json = unknown;

/** 응답의 칸 이름: 서비스가 쓰는 이름 → MCP에서 쓰는 이름 */
const RESPONSE_KEYS: Readonly<Record<string, string>> = {
  listing: 'term',
  listings: 'terms',
  listingId: 'termId',
  otherListings: 'otherTerms',
  intake: 'listing',
  intakes: 'listings',
  intakeId: 'listingId',
  listingIntake: 'listing',
  listingIntakes: 'listings',
  listingIntakeId: 'listingId',
};

/** 속을 옮기지 않는 칸: 변경 기록과 외부에서 받은 원문은 적힌 그대로가 기록이다 */
const VERBATIM_KEYS: ReadonlySet<string> = new Set(['changes', 'raw', 'rawPayload', 'payload']);

function isPlainObject(value: Json): value is Record<string, Json> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    // Prisma Decimal 같은 값 객체는 toJSON으로 글이 된다 — 속을 들여다보지 않는다
    typeof (value as { toJSON?: unknown }).toJSON !== 'function'
  );
}

/** 응답의 칸 이름을 MCP의 낱말로 옮긴다. 값은 바꾸지 않는다. */
export function toMcpVocabulary(data: Json): Json {
  if (Array.isArray(data)) return data.map(toMcpVocabulary);
  if (!isPlainObject(data)) return data;
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(data)) {
    const name = RESPONSE_KEYS[key] ?? key;
    // 한 객체에 의뢰를 가리키는 칸이 두 이름으로 함께 있을 때(intakeId와 listingIntakeId) 값이 있는 쪽을 남긴다
    if (name in out && (value === null || value === undefined)) continue;
    out[name] = VERBATIM_KEYS.has(key) ? value : toMcpVocabulary(value);
  }
  return out;
}

/** 매물 · 거래 조건을 가리키는 인자 이름. 도구가 받지 않는 것이 오면 조용히 버리지 않고 거절한다. */
const LISTING_ID_ARGS: Readonly<Record<string, string>> = {
  listingId: '이 도구는 listingId(매물 id)를 받지 않습니다. 거래 조건 하나를 가리키려면 termId를 쓰세요',
  termId: '이 도구는 termId(거래 조건 id)를 받지 않습니다. 매물을 가리키려면 listingId를 쓰세요',
  intakeId: 'intakeId는 쓰지 않습니다. 매물 id는 listingId로 보내세요',
  listingIntakeId: 'listingIntakeId는 쓰지 않습니다. 매물 id는 listingId로 보내세요',
};

/**
 * 스키마에 없는 인자는 보통 손잡이가 알아서 다루지만(무시), 매물 · 조건의 id는 그러면 안 된다:
 * 걸러 달라고 준 id가 버려지면 걸러지지 않은 목록이 정답처럼 돌아온다. 문제가 없으면 null.
 */
export function rejectMisnamedListingArgs(
  inputSchema: Record<string, unknown>,
  args: Record<string, unknown>,
): string | null {
  const properties = (inputSchema.properties ?? {}) as Record<string, unknown>;
  for (const [name, message] of Object.entries(LISTING_ID_ARGS)) {
    if (args?.[name] !== undefined && !(name in properties)) return message;
  }
  return null;
}
