
/** 열린 다이얼로그/시트/인라인 편집기: 화면을 버리면 입력 중인 내용이 사라진다. */
export const TRANSIENT_EDITOR_SELECTOR = [
  '[data-slot="dialog-content"][data-state="open"]',
  '[data-slot="alert-dialog-content"][data-state="open"]',
  '[data-slot="sheet-content"][data-state="open"]',
  '[data-native-tab-discard-blocker="true"]',
].join(',');

/** 페이지가 명시적으로 표시한 저장 전 변경. */
export const EXPLICIT_DIRTY_SELECTOR = '[data-native-tab-dirty="true"]';

/** 셸 renderer 안에서 직접 그려진(legacy) 탭 화면의 영역. */
const SHELL_TAB_CONTENT_SELECTOR = '[data-native-tab-legacy-fallback]';

function shellContentHasUnsavedEditor(): boolean {
  if (typeof document === 'undefined') return false;
  const content = document.querySelector(SHELL_TAB_CONTENT_SELECTOR);
  return Boolean(
    content?.querySelector(
      `${TRANSIENT_EDITOR_SELECTOR},${EXPLICIT_DIRTY_SELECTOR}`,
    ),
  );
}

/**
 * 브라우저 단독 미리보기에서, 활성 탭의 화면을 다른 화면으로 바꿔도 되는지 판단한다.
 * 이 문서가 직접 그린 화면의 편집기/dirty 표식을 본다. Electron에서는 탭 화면이
 * main에 알린 상태로 main이 판단한다.
 */
export async function activeTabHasUnsavedWork(): Promise<boolean> {
  return shellContentHasUnsavedEditor();
}
