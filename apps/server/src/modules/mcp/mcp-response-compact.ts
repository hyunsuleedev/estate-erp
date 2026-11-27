/**
 * MCP 응답 줄이기 — 읽는 쪽은 AI라 응답 크기가 곧 비용이고, 한 번에 볼 수 있는 양도 정해져 있다.
 *
 * 서비스는 화면이 쓰는 모양 그대로 돌려준다. 화면에는 필요하지만 AI에게는 군더더기인 것이 많다:
 * 딸린 기록마다 통째로 붙는 단지(주소·좌표·코드 40여 칸), 비어 있는 칸, 같은 객체의 되풀이.
 * 직원 한 명 조회가 68KB, 매칭 한 건이 12KB였다(2026-11-26 커넥터 점검).
 *
 * 규칙 — 조회한 대상 자체(맨 위 객체, 목록이면 각 줄)의 칸은 건드리지 않고, 그 안에 딸린 객체만 줄인다:
 * - 딸린 단지(site)·동(dong)은 가리키는 데 필요한 칸만 남긴다. 전체는 get_site로 본다.
 * - 딸린 객체의 빈 칸(null)과 officeId는 뺀다. 시각(createdAt·updatedAt)은 남긴다 — 활동 기록·상담·코멘트에서는
 *   그것이 일이 일어난 때다.
 * - 한 줄 안에서 같은 객체가 또 나오면 두 번째부터는 `{ id, sameAs: '처음 나온 자리' }`로 바꾼다.
 * - 변경 기록(changes)의 긴 글은 앞부분만 남긴다(적은 글이 기록에 한 번 더 통째로 들어가므로).
 *
 * 값을 바꾸거나 새로 만들지 않는다. 권한에 따른 가리기는 이 앞 단계(서비스)가 이미 끝낸다.
 */

const NESTED_SITE_KEYS = ['id', 'name', 'type', 'roadAddress', 'jibunAddress'] as const;
const NESTED_DONG_KEYS = ['id', 'name', 'isPlaceholder'] as const;
const NESTED_DROP_KEYS: ReadonlySet<string> = new Set(['officeId']);
/** 이보다 작은 객체는 되풀이돼도 그대로 둔다 — 가리키는 글이 더 길어진다 */
const DEDUPE_MIN_CHARS = 300;
const CHANGE_TEXT_MAX_CHARS = 200;
/** 목록을 감싸는 흔한 봉투 — 그 안의 각 줄을 "조회한 대상"으로 본다 */
const LIST_ENVELOPE_KEYS = ['data', 'items', 'rows', 'results'] as const;

type Json = unknown;

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

function pick(source: Record<string, Json>, keys: readonly string[]) {
  const out: Record<string, Json> = {};
  for (const key of keys) {
    if (source[key] !== null && source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function shortenChanges(value: Json): Json {
  if (typeof value === 'string') {
    return value.length > CHANGE_TEXT_MAX_CHARS
      ? `${value.slice(0, CHANGE_TEXT_MAX_CHARS)}…(전체 ${value.length}자)`
      : value;
  }
  if (Array.isArray(value)) return value.map(shortenChanges);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shortenChanges(v)]));
  }
  return value;
}

/** 조회한 대상 하나(맨 위 객체나 목록의 한 줄)를 줄인다 */
function compactRecord(record: Record<string, Json>): Record<string, Json> {
  /** 이미 내보낸 큰 객체: "id + 내용" → 처음 나온 자리 */
  const seen = new Map<string, string>();

  const walk = (value: Json, key: string, path: string, nested: boolean): Json => {
    if (Array.isArray(value)) {
      return value.map((item, index) => walk(item, key, `${path}[${index}]`, nested));
    }
    if (!isPlainObject(value)) return value;
    if (key === 'changes') return shortenChanges(value);
    if (nested && key === 'site' && typeof value.id === 'string') {
      return pick(value, NESTED_SITE_KEYS);
    }
    if (nested && key === 'dong' && typeof value.id === 'string') {
      return pick(value, NESTED_DONG_KEYS);
    }

    // 줄이기 전의 내용으로 견준다 — 속부터 줄이면 겉이 처음 것과 달라져 통째로 같은 객체를 놓친다
    if (nested && typeof value.id === 'string') {
      const text = JSON.stringify(value);
      if (text.length >= DEDUPE_MIN_CHARS) {
        const first = seen.get(text);
        if (first) return { id: value.id, sameAs: first };
        seen.set(text, path);
      }
    }

    const out: Record<string, Json> = {};
    for (const [childKey, child] of Object.entries(value)) {
      if (nested && (child === null || NESTED_DROP_KEYS.has(childKey))) continue;
      out[childKey] = walk(child, childKey, path ? `${path}.${childKey}` : childKey, true);
    }
    return out;
  };

  return walk(record, '', '', false) as Record<string, Json>;
}

export function compactMcpResult(data: Json): Json {
  if (Array.isArray(data)) {
    return data.map((row) => (isPlainObject(row) ? compactRecord(row) : row));
  }
  if (!isPlainObject(data)) return data;
  const envelopeKey = LIST_ENVELOPE_KEYS.find((key) => Array.isArray(data[key]));
  if (envelopeKey && typeof data.id !== 'string') {
    return {
      ...data,
      [envelopeKey]: (data[envelopeKey] as Json[]).map((row) =>
        isPlainObject(row) ? compactRecord(row) : row,
      ),
    };
  }
  return compactRecord(data);
}
