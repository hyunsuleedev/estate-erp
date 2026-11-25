import { useEffect, useRef } from 'react';

/**
 * 옆 상세 패널 밖을 누르면 패널을 닫는다 (사용자 의견 2026-11-22: "drawer 밖을 눌러도 안 닫힌다").
 *
 * 패널은 화면을 덮는 창이 아니라 목록 옆에 서는 판이라, 바깥을 덮는 막이 없다. 그래서 "밖"을 직접 가린다:
 * - 패널 안([data-property-inspector])과 패널 너비를 끄는 손잡이는 밖이 아니다.
 * - 줄의 "열기" 단추([data-row-open], 매물관리 표는 [data-property-row-open])는 밖이 아니다. 그 단추는 스스로 패널을 열고 닫는다 — 여기서 먼저 닫으면
 *   같은 줄을 눌렀을 때 닫혔다가 곧바로 다시 열린다.
 * - 화면 위에 떠 있는 것(메뉴 · 고르는 목록 · 대화창 · 알림)은 밖이 아니다. 이들은 #root 밖(body)에 그려진다.
 * - 떠 있는 것이 열려 있을 때 그 바깥을 누른 것은 그 창을 닫는 누름이다. 패널까지 함께 닫지 않는다
 *   (Esc가 안쪽부터 닫는 것과 같다).
 *
 * 누른 곳과 뗀 곳이 모두 밖일 때만 닫는다. 패널 안에서 글을 끌어 고르다가 밖에서 떼면 click은
 * 밖에서 일어난 것으로 오는데, 그때 닫히면 고르던 글과 함께 패널이 사라진다.
 *
 * 적던 글을 잃지 않게 두 가지를 더 본다 (바깥 누름은 Esc보다 실수로 일어나기 쉽다):
 * - 패널 안의 글 칸에 커서가 있을 때의 바깥 누름은 그 칸에서 나오는 누름이다. 패널은 닫지 않는다
 *   (칸은 나가면서 저장하거나, 적던 글을 붙들고 있는다). 한 번 더 누르면 닫힌다. Esc가 안쪽부터 닫는 것과 같다.
 * - 패널 안에 저장하지 않은 편집기가 있으면 닫지 않는다. 표시는 탭을 닫을 때 쓰는 것과 같은
 *   data-native-tab-dirty="true"다(features/tabs/lib/unsavedWork.ts). 저장 단추를 눌러야 저장되는
 *   편집기(코멘트 고치기 등)는 글이 바뀐 동안 이 표시를 달아 둔다.
 *
 * 표의 다른 줄을 눌러 그 줄을 열면 패널은 닫혔다가 새 줄로 다시 열린다(여는 쪽이 닫히는 중인 것을 되돌린다).
 *
 * @param onClose 패널을 닫는다. Esc와 달리 미끄러져 나가는 움직임과 함께 닫는다(인자 없이 부른다).
 * @param enabled false면 듣지 않는다. 패널 안에 저장하지 않은 글이 있어 닫으면 잃는 동안에 끈다.
 */
const INSIDE_SELECTOR =
  '[data-property-inspector], [data-property-inspector-resize-handle], [data-row-open], [data-property-row-open]';
/** 패널마다 Esc 처리에서 쓰는 것과 같은 목록: 화면 위에 떠 있는 것 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

/** 패널 안에서 글을 적는 칸에 커서가 있는지 */
function isEditingInsidePanel() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.closest('[data-property-inspector]')) return false;
  if (active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return true;
  if (active instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color'].includes(active.type);
  }
  return active.isContentEditable;
}

/** 패널 안에 저장하지 않은 편집기가 있는지 (탭 닫기 보호와 같은 표시) */
function panelHasUnsavedEditor() {
  return Boolean(
    document.querySelector('[data-property-inspector] [data-native-tab-dirty="true"]'),
  );
}

function isOutsidePanel(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest(INSIDE_SELECTOR)) return false;
  const root = document.getElementById('root');
  // #root 밖은 body에 그려진 떠 있는 것이다
  return root ? root.contains(target) : true;
}

export function useInspectorOutsideClose(onClose: () => void, enabled = true) {
  // 닫는 함수가 그릴 때마다 새로 만들어져도 듣는 것을 다시 달지 않는다
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    let pressedOutside = false;
    const handlePointerDown = (event: PointerEvent) => {
      pressedOutside =
        event.button === 0 &&
        isOutsidePanel(event.target) &&
        // 떠 있는 것이 열려 있었다면 이 누름은 그것을 닫는 누름이다
        !document.querySelector(OVERLAY_SELECTOR) &&
        // 글 칸에 커서가 있었다면 이 누름은 그 칸에서 나오는 누름이다 (누르는 순간에 본다: 뗄 때는 이미 칸을 나온 뒤다)
        !isEditingInsidePanel();
    };
    const handleClick = (event: MouseEvent) => {
      const wasOutside = pressedOutside;
      pressedOutside = false;
      if (!wasOutside || event.button !== 0 || !isOutsidePanel(event.target)) return;
      if (panelHasUnsavedEditor()) return;
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', handleClick, true);
    };
  }, [enabled]);
}
