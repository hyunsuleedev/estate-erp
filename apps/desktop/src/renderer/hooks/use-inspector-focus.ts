import { useEffect, useRef, type RefObject } from 'react';

/**
 * 옆 상세 패널의 포커스 처리. 패널은 화면을 덮는 창이 아니라서 포커스를 가두지는 않지만,
 * 키보드로 열었을 때는 포커스를 패널로 옮기고 닫히면 열기 전에 있던 곳으로 돌려준다.
 * (예전의 시트·창이 해 주던 일이다. 이것이 없으면 키보드 사용자는 패널이 열려도 표에 남는다.)
 *
 * 마우스로 열었을 때는 포커스를 옮기지 않는다. 표에서 방향키로 계속 움직일 수 있어야 한다.
 *
 * 패널을 연 채로 다른 대상을 열 수도 있다(패널은 그대로 있고 내용만 바뀐다). 그때도 키보드로
 * 열었다면 포커스를 패널로 옮긴다. 닫힐 때 돌아갈 곳은 그 시점에 포커스가 있던 곳으로 다시 잡는다.
 *
 * @param moveFocus 지금 연 동작이 키보드였는지. 열거나 대상을 바꾼 순간의 값을 본다.
 * @param subjectId 패널이 보여 주는 대상의 id. 바뀌면 새로 연 것으로 본다.
 */
export function useInspectorFocus(
  panelRef: RefObject<HTMLElement | null>,
  moveFocus: boolean,
  subjectId: string,
) {
  const moveFocusRef = useRef(moveFocus);
  moveFocusRef.current = moveFocus;
  const openerRef = useRef<HTMLElement | null>(null);

  // 열릴 때와 대상이 바뀔 때
  useEffect(() => {
    const panel = panelRef.current;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // 패널 밖에서 열었으면 그곳이 돌아갈 자리다. 패널 안에서 다른 대상으로 넘어간 경우는 그대로 둔다.
    if (active && !(panel?.contains(active) ?? false)) openerRef.current = active;
    if (moveFocusRef.current) panel?.focus({ preventScroll: true });
  }, [panelRef, subjectId]);

  // 닫힐 때
  useEffect(() => {
    const panel = panelRef.current;
    return () => {
      // 패널 안에 있던 포커스는 패널이 사라지면 갈 곳을 잃는다. 다른 곳으로 이미 옮겨 갔다면 건드리지 않는다.
      const active = document.activeElement;
      const lostFocus = !active || active === document.body || (panel?.contains(active) ?? false);
      const opener = openerRef.current;
      if (lostFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [panelRef]);
}
