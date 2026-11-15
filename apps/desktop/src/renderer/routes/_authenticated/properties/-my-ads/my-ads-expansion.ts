/** 한 번에 한 행만 펼친다. 펼친 행을 다시 누르면 닫는다. */
export function nextMyAdsExpandedIds(
  current: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  if (current.has(id)) {
    const next = new Set(current);
    next.delete(id);
    return next;
  }
  return new Set([id]);
}

/**
 * 펼침을 바꾼 뒤 누른 행이 누르기 전과 같은 화면 위치에 남도록 scrollTop에 더할 값(px).
 *
 * 위쪽에 펼쳐 둔 다른 패널이 닫히면 누른 행이 그 패널 높이만큼 위로 올라가 화면 밖으로 밀려난다.
 * 바뀐 뒤 누른 행의 위치를 잴 수 있으면 그 차이만큼, 가상 스크롤로 행이 빠져 잴 수 없으면
 * 닫힌 위쪽 패널 높이만큼 되돌린다.
 */
export function myAdsExpandScrollAdjustment({
  anchorTopBefore,
  anchorTopAfter,
  collapsedHeightAbove,
}: {
  anchorTopBefore: number;
  anchorTopAfter: number | null;
  collapsedHeightAbove: number;
}): number {
  if (anchorTopAfter != null) return anchorTopAfter - anchorTopBefore;
  return -collapsedHeightAbove;
}
