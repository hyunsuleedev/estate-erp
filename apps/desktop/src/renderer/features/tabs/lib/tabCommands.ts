import { notify } from '@/lib/notify';
import type {
  TabHistoryDirection,
  TabShortcutInput,
} from '../../../../common/tabCommands';
import { createTabCommandActions } from '../../../../common/tabs/tabStoreBindings';
import { useTabStore } from '../store/useTabStore';
import {
  goToTabHistoryIndex,
  navigateTabHistory,
  reopenLastClosedTabs,
  type TabHistoryNavigationResult,
} from '../store/useTabHistoryStore';

export { NEW_TAB_ROUTE } from '../../../../common/tabs/tabWorkspace';
export type { TabCommandContext } from '../../../../common/tabs/tabStoreBindings';

export function reportHistoryResult(result: TabHistoryNavigationResult): void {
  if (result === 'blocked-by-unsaved-work') {
    // 셸이 그린 알림은 탭 화면에 가려지므로 보이는 탭 화면에서 띄운다.
    notify('warning', '저장하지 않은 입력이 있어 이동하지 않았습니다.', {
      description: '저장하거나 입력을 취소한 뒤 다시 시도하세요.',
    });
  } else if (result === 'opened-in-new-tab') {
    notify('info', '저장하지 않은 입력이 있어 이전 화면을 새 탭으로 열었습니다.');
  }
}

/**
 * 단축키·버튼이 부르는 탭 명령. 규칙은 `src/common/tabs`에 있다.
 * - openNewTab: 새 탭은 대시보드 launcher로 연다. 같은 대시보드가 있어도 항상 새 탭이다.
 * - openLocationInNewTab: 기록 메뉴의 Cmd/Ctrl+클릭. 같은 업무가 이미 열려 있으면
 *   그 탭을 그대로 보여주기만 한다.
 */
export const {
  openNewTab,
  openLocationInNewTab,
  runHistoryNavigation,
  runHistoryJump,
  runTabCommand,
} = createTabCommandActions(
  useTabStore,
  { goToTabHistoryIndex, navigateTabHistory, reopenLastClosedTabs },
  { reportHistoryResult },
);

export function rendererPlatform(): string {
  const exposed = window.electronBridge?.platform;
  if (typeof exposed === 'string') return exposed;
  return /Mac|iPhone|iPad/.test(navigator.platform) ? 'darwin' : 'win32';
}

export function shortcutInputFromKeyboardEvent(event: KeyboardEvent): TabShortcutInput {
  return {
    type: event.type === 'keydown' ? 'keyDown' : 'keyUp',
    key: event.key,
    code: event.code,
    meta: event.metaKey,
    control: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    isAutoRepeat: event.repeat,
  };
}

/** 마우스 사이드 버튼(3=뒤로, 4=앞으로). */
export function historyDirectionForMouseButton(button: number): TabHistoryDirection | null {
  if (button === 3) return 'back';
  if (button === 4) return 'forward';
  return null;
}
