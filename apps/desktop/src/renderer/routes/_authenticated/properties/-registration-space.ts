import { formatUnitLabel, parseFloorInput, type UnitSpace } from '@estate-erp/shared';

export type SpaceScope = 'whole' | 'floors' | 'unit';

export interface SpaceDraft {
  scope?: SpaceScope;
  startFloor?: string;
  endFloor?: string;
  partName?: string;
  partArea?: string;
}

export function registrationSpace(draft: SpaceDraft, wholeDong: boolean) {
  if (draft.scope === 'whole') {
    return wholeDong ? { name: '건물 전체', floor: null, floorEnd: null } : null;
  }
  const floor = parseFloorInput(draft.startFloor);
  const floorEnd = draft.scope === 'floors' ? parseFloorInput(draft.endFloor) : null;
  if (draft.startFloor?.trim() && floor === null) throw new Error('시작층을 확인하세요. 예: B1, 2층');
  if (draft.scope === 'floors') {
    if (!floor) throw new Error('시작층을 입력하세요.');
    if (draft.endFloor?.trim() && (floorEnd === null || floorEnd < floor)) {
      throw new Error('끝층은 시작층과 같거나 높아야 합니다.');
    }
    return { name: null, floor, floorEnd: floorEnd === floor ? null : floorEnd };
  }
  const name = draft.partName?.trim();
  if (!name || name === '건물 전체') throw new Error('호실 또는 구획 이름을 입력하세요.');
  const areaText = draft.partArea?.trim();
  const area = areaText ? Number(areaText) : undefined;
  if (area !== undefined && (!Number.isFinite(area) || area <= 0)) {
    throw new Error('면적은 0보다 큰 수로 입력하세요.');
  }
  return { name, floor, floorEnd: null, exclusiveAreaM2: area };
}

export function formatPropertySpaceLabel(unit: UnitSpace | null | undefined, siteType?: string) {
  return formatUnitLabel(unit) || (!unit && (siteType === 'commercial' || siteType === 'house') ? '건물 전체' : '');
}

/**
 * 아파트·오피스텔처럼 호가 정해진 건물에서 목록에 없는 호를 적을 때.
 * "1203호"는 다른 호들처럼 이름 "1203"으로 두고, 층을 비웠으면 호 번호에서 읽는다(1203 → 12층).
 */
export function normalizeHoDraft(draft: SpaceDraft): SpaceDraft {
  const raw = draft.partName?.trim() ?? '';
  const name = /^\d{3,4}호$/.test(raw) ? raw.slice(0, -1) : raw;
  const inferredFloor = /^\d{3,4}$/.test(name) ? String(Math.floor(Number(name) / 100)) : '';
  return { ...draft, partName: name, startFloor: draft.startFloor?.trim() || inferredFloor };
}
