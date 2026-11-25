/**
 * 거래 단위 공간(Unit)의 층과 이름 표기.
 *
 * 공간은 호일 수도, 호 없이 층일 수도(상가건물 2층), 층의 일부일 수도(2층 좌측),
 * 여러 층일 수도(1~2층 통임대) 있다. 화면 · 문서 · MCP가 모두 이 함수들로 같은 표기를 쓴다.
 *
 * 층은 숫자로 저장한다: 지하는 음수(-2 = B2), 0은 없다(지하 1층 = -1 다음이 지상 1층 = 1).
 * 숫자로 안 떨어지는 층(반지하, M층, 옥탑)은 표시 이름(floorLabel)을 따로 둔다.
 */

export interface UnitSpace {
  /** 호 이름(3501) 또는 층의 일부에 붙인 이름(좌측). 없으면 층이 이 공간의 이름이다 */
  name?: string | null;
  floor?: number | null;
  /** 여러 층을 한 공간으로 둘 때의 끝 층 */
  floorEnd?: number | null;
  /** 숫자로 안 떨어지는 층의 표시 이름 */
  floorLabel?: string | null;
}

/** 층 하나의 표기. -2 → "B2", 3 → "3층". 0 · 빈 값은 빈 글 */
export function formatFloor(floor: number | null | undefined): string {
  if (floor == null || floor === 0 || !Number.isFinite(floor)) return '';
  return floor < 0 ? `B${Math.abs(floor)}` : `${floor}층`;
}

/**
 * 공간의 층 표기. 표시 이름이 있으면 그것을, 없으면 숫자에서 만든다.
 * 범위는 "1~2층", 지하를 걸치면 "B1~2층", 지하끼리는 "B2~B1".
 */
export function formatFloorRange(space: UnitSpace): string {
  const label = space.floorLabel?.trim();
  if (label) return label;
  const start = formatFloor(space.floor);
  if (!start) return '';
  if (space.floorEnd == null || space.floor == null || space.floorEnd <= space.floor) return start;
  const end = formatFloor(space.floorEnd);
  // 둘 다 지상이면 "층"을 한 번만 적는다 (1~2층)
  return space.floor > 0 ? `${space.floor}~${end}` : `${start}~${end}`;
}

/**
 * 사람이 적은 층을 숫자로 읽는다. "B2" · "지하2" · "지하 2층" · "-2" → -2, "3" · "3층" · "3F" → 3.
 * 읽을 수 없거나 0이면 null (추측하지 않는다 — "반지하" · "옥탑"은 표시 이름으로 받아야 한다).
 */
export function parseFloorInput(text: string | null | undefined): number | null {
  const raw = text?.trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return null;
  const underground = /^(?:B|지하|-)(\d{1,2})(?:층|F)?$/.exec(raw);
  if (underground) {
    const value = Number(underground[1]);
    return value > 0 ? -value : null;
  }
  const ground = /^(?:지상)?(\d{1,3})(?:층|F)?$/.exec(raw);
  if (ground) {
    const value = Number(ground[1]);
    return value > 0 ? value : null;
  }
  return null;
}

/** 공간이 차지하는 층 수. 0층이 없으므로 B1~2층은 3개 층이다. 층을 모르면 null */
export function countFloors(space: UnitSpace): number | null {
  if (space.floor == null || space.floor === 0) return null;
  if (space.floorEnd == null || space.floorEnd <= space.floor) return 1;
  const span = space.floorEnd - space.floor + 1;
  return space.floor < 0 && space.floorEnd > 0 ? span - 1 : span;
}

/** 이름이 호 번호 모양인지 (3501, B103, 101-1). "좌측" 같은 구획 이름과 가른다 */
function looksLikeHoNumber(name: string): boolean {
  return /^[A-Za-z]{0,2}\d+(?:-\d+)?$/.test(name);
}

/**
 * 공간의 이름. 호가 있으면 "3501호", 없으면 층이 이름이다("2층" · "B1~2층").
 * 층의 일부는 층 뒤에 이름을 붙인다("2층 좌측"). 아무것도 없으면 빈 글.
 */
export function formatUnitLabel(space: UnitSpace | null | undefined): string {
  if (!space) return '';
  const name = space.name?.trim();
  const floor = formatFloorRange(space);
  if (!name) return floor;
  if (looksLikeHoNumber(name)) return `${name}호`;
  // 이미 "호"로 끝나게 적은 이름은 그대로 둔다
  if (name.endsWith('호')) return name;
  return floor ? `${floor} ${name}` : name;
}

/**
 * 호 이름만 쓰던 자리("고덕그라시움 101동 3401")에 넣는 글. 이름이 있으면 그대로, 없으면 층("2층").
 * "호"를 붙이지 않는다는 점만 formatUnitLabel과 다르다.
 */
export function formatUnitName(space: UnitSpace | null | undefined): string {
  if (!space) return '';
  return space.name?.trim() || formatFloorRange(space);
}

/** 정렬용 열쇠: 층 → 이름. 이름 없는 공간도 층 순서대로 놓인다 */
export function compareUnitSpaces(a: UnitSpace, b: UnitSpace): number {
  const floorDiff = (a.floor ?? 0) - (b.floor ?? 0);
  if (floorDiff !== 0) return floorDiff;
  return (a.name ?? '').localeCompare(b.name ?? '', 'ko', { numeric: true });
}

/**
 * 동의 표기. "101" → "101동", "101동" · "A동" · "상가동" → 그대로.
 * 동 구분이 없는 건물(placeholder 동, 이름이 "-"이거나 빈 것)은 빈 글이다 — 화면에 "-"를 찍지 않는다.
 */
export function formatDongLabel(
  name: string | null | undefined,
  isPlaceholder?: boolean | null,
): string {
  const trimmed = name?.trim();
  if (isPlaceholder || !trimmed || trimmed === '-') return '';
  if (trimmed.endsWith('동')) return trimmed;
  // 숫자·영문 한두 글자로 된 이름에만 "동"을 붙인다 (101, 101-1, A, B2)
  return /^[A-Za-z]{0,2}\d*(?:-\d+)?$/.test(trimmed) ? `${trimmed}동` : trimmed;
}

export interface PlaceParts {
  /** 단지·건물 이름. 문맥에 이미 있으면 넘기지 않는다 */
  siteName?: string | null;
  dongName?: string | null;
  /** 동 구분이 없는 건물에 둔 동인지 (Dong.isPlaceholder) */
  dongIsPlaceholder?: boolean | null;
  unit?: UnitSpace | null;
}

/**
 * 한 집을 가리키는 글. 화면 · 문서 · 알림이 모두 이 모양을 쓴다.
 *   "고덕그라시움 102동 2203호" (단지 + 동 + 호)
 *   "102동 2203호"            (siteName을 넘기지 않았을 때)
 *   "고덕빌라 201호"           (동 구분 없는 건물)
 *   "○○상가 2층"              (호 없이 층인 공간)
 * 손으로 "102 2203"처럼 이어 붙이지 않는다 — 동이 100개가 넘는 단지에서는 어느 집인지 알 수 없다.
 */
export function formatPlaceLabel(parts: PlaceParts | null | undefined): string {
  if (!parts) return '';
  return [
    parts.siteName?.trim() ?? '',
    formatDongLabel(parts.dongName, parts.dongIsPlaceholder),
    formatUnitLabel(parts.unit),
  ]
    .filter(Boolean)
    .join(' ');
}
