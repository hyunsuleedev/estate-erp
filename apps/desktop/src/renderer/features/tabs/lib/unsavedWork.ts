import type { Tab } from '@estate-erp/shared';
import { resolveNativeTabRoute } from '../../../../common/nativeTabs';

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
 * 활성 탭 화면을 다른 화면으로 교체해도 되는지 판단한다.
 * - 셸 renderer에 그려진 화면: DOM의 편집기/dirty 표식을 본다.
 * - native WebContents 탭(매물 상세): main이 가진 retention 상태를 묻는다.
 *   물어볼 수 없거나 실패하면 보존 쪽으로 판단한다.
 */
export async function activeTabHasUnsavedWork(tab: Tab): Promise<boolean> {
  if (shellContentHasUnsavedEditor()) return true;
  if (!resolveNativeTabRoute(tab.route)) return false;

  const query =
    typeof window === 'undefined'
      ? undefined
      : window.electronBridge?.tabs?.hasUnsavedNativeTabWork;
  if (!query) return false;
  try {
    return await query(tab.id);
  } catch {
    return true;
  }
}
