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
