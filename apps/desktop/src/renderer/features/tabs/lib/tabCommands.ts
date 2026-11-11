import { notify } from '@/lib/notify';
import type { TabId } from '@estate-erp/shared';
import type {
  TabCommand,
  TabHistoryDirection,
  TabShortcutInput,
} from '../../../../common/tabCommands';
import { useTabStore, type TabLocation } from '../store/useTabStore';
import {
  goToTabHistoryIndex,
  navigateTabHistory,
  reopenLastClosedTabs,
  type TabHistoryNavigationResult,
} from '../store/useTabHistoryStore';
import { getRouteMeta } from './routeMeta';

export const NEW_TAB_ROUTE = '/dashboard';

/** 새 탭은 대시보드 launcher로 연다. 같은 대시보드가 있어도 항상 새 탭이다. */
export function openNewTab(): TabId {
  const meta = getRouteMeta(NEW_TAB_ROUTE);
  return useTabStore.getState().createTab({
    route: NEW_TAB_ROUTE,
    kind: meta.kind,
    title: meta.title,
    resourceKey: null,
  });
}

/**
 * 기록 메뉴의 Cmd/Ctrl+클릭: 그 화면을 새 탭으로 연다.
 * 같은 업무가 이미 열려 있으면 그 탭을 그대로 보여주기만 한다. 그 탭의 주소를
 * 바꾸면 수정 중이던 화면을 벗어나 입력이 사라질 수 있다.
 */
export function openLocationInNewTab(location: TabLocation): TabId {
  const store = useTabStore.getState();
  const input = {
    route: location.route,
    title: location.title,
    kind: location.kind,
    routeParams: location.routeParams,
  };
  if (location.resourceKey.startsWith('launcher:')) {
    return store.createTab({ ...input, resourceKey: null });
  }
  if (location.resourceKey.startsWith('draft:')) {
    return store.createTab(input);
  }
  const existing = store.tabs.find((tab) => tab.resourceKey === location.resourceKey);
  if (existing) {
    store.activateTab(existing.id);
    return existing.id;
  }
  return store.createTab({ ...input, resourceKey: location.resourceKey });
}

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

export async function runHistoryNavigation(
  direction: TabHistoryDirection,
): Promise<void> {
  reportHistoryResult(await navigateTabHistory(direction));
}

export async function runHistoryJump(index: number, tabId?: TabId): Promise<void> {
  reportHistoryResult(await goToTabHistoryIndex(index, tabId));
}

export interface TabCommandContext {
  /** 분리된 창은 새 탭을 만들지 않는다. 옮겨 온 탭만 다룬다. */
  canCreateTabs: boolean;
}

export function runTabCommand(command: TabCommand, context: TabCommandContext): void {
  const store = useTabStore.getState();
  switch (command.type) {
    case 'history':
      void runHistoryNavigation(command.direction);
      return;
    case 'new-tab':
      if (context.canCreateTabs) openNewTab();
      return;
    case 'close-tab':
      if (store.activeTabId) store.closeTab(store.activeTabId);
      return;
    case 'reopen-closed-tab':
      reopenLastClosedTabs();
      return;
    case 'select-relative-tab': {
      const { tabs, activeTabId } = store;
      if (tabs.length < 2) return;
      const current = tabs.findIndex((tab) => tab.id === activeTabId);
      const next = (Math.max(current, 0) + command.offset + tabs.length) % tabs.length;
      store.activateTab(tabs[next].id);
      return;
    }
    case 'select-tab-index': {
      const { tabs } = store;
      const target = command.index === 'last' ? tabs.at(-1) : tabs[command.index];
      if (target) store.activateTab(target.id);
      return;
    }
  }
}

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
