/**
 * 탭 단축키와 뒤로/앞으로 명령. main(before-input-event)과 브라우저 단독
 * 미리보기(keydown)가 같은 규칙을 쓰도록 순수 함수로 둔다.
 */
export type TabHistoryDirection = 'back' | 'forward';

export type TabCommand =
  | { type: 'history'; direction: TabHistoryDirection }
  | { type: 'new-tab' }
  | { type: 'close-tab' }
  | { type: 'reopen-closed-tab' }
  | { type: 'select-relative-tab'; offset: 1 | -1 }
  /** 0부터 7은 해당 위치, 'last'는 마지막 탭. */
  | { type: 'select-tab-index'; index: number | 'last' };

/** Electron.Input과 KeyboardEvent 양쪽에서 만들 수 있는 최소 입력. */
export interface TabShortcutInput {
  type: 'keyDown' | 'keyUp' | string;
  key: string;
  code: string;
  meta: boolean;
  control: boolean;
  alt: boolean;
  shift: boolean;
  isAutoRepeat?: boolean;
}

export const TAB_SHORTCUT_LABELS = {
  back: { darwin: '⌘[', other: 'Alt+←' },
  forward: { darwin: '⌘]', other: 'Alt+→' },
} as const;

export function shortcutLabel(
  command: keyof typeof TAB_SHORTCUT_LABELS,
  platform: string,
): string {
  const labels = TAB_SHORTCUT_LABELS[command];
  return platform === 'darwin' ? labels.darwin : labels.other;
}

/**
 * 규칙(Notion·Chrome 기준)
 * - 뒤로/앞으로: Cmd/Ctrl+[ ], Windows·Linux는 Alt+←/→도 받는다.
 * - 새 탭 Cmd/Ctrl+T, 탭 닫기 Cmd/Ctrl+W, 닫은 탭 다시 열기 Cmd/Ctrl+Shift+T
 * - 다음/이전 탭: Ctrl+Tab, Ctrl+Shift+Tab. macOS는 Cmd+Shift+] [, Cmd+Option+→ ←
 * - Cmd/Ctrl+1~8은 그 위치, 9는 마지막 탭
 * 길게 누르는 키 반복은 탭 전환과 뒤로/앞으로에만 허용한다. 닫기 반복은 위험하다.
 */
export function tabCommandForInput(
  input: TabShortcutInput,
  platform: string,
): TabCommand | null {
  if (input.type !== 'keyDown') return null;
  const isMac = platform === 'darwin';
  const mod = isMac ? input.meta : input.control;
  // macOS에서 Ctrl은 Ctrl+Tab에만 쓴다. 다른 조합의 Ctrl은 앱 단축키가 아니다.
  const extraMod = isMac ? input.control : input.meta;
  const repeat = input.isAutoRepeat === true;

  if (input.control && !input.meta && !input.alt && input.code === 'Tab') {
    return { type: 'select-relative-tab', offset: input.shift ? -1 : 1 };
  }

  if (!isMac && input.alt && !input.control && !input.meta && !input.shift) {
    if (input.code === 'ArrowLeft') return { type: 'history', direction: 'back' };
    if (input.code === 'ArrowRight') return { type: 'history', direction: 'forward' };
  }

  if (!mod || extraMod) return null;

  if (input.code === 'BracketLeft' || input.code === 'BracketRight') {
    if (input.alt) return null;
    const isLeft = input.code === 'BracketLeft';
    if (input.shift) {
      return isMac ? { type: 'select-relative-tab', offset: isLeft ? -1 : 1 } : null;
    }
    return { type: 'history', direction: isLeft ? 'back' : 'forward' };
  }

  if (isMac && input.alt && !input.shift) {
    if (input.code === 'ArrowLeft') return { type: 'select-relative-tab', offset: -1 };
    if (input.code === 'ArrowRight') return { type: 'select-relative-tab', offset: 1 };
  }

  if (input.alt || repeat) return null;

  if (input.code === 'KeyT') {
    return input.shift ? { type: 'reopen-closed-tab' } : { type: 'new-tab' };
  }
  if (input.code === 'KeyW' && !input.shift) return { type: 'close-tab' };

  const digit = /^Digit([1-9])$/.exec(input.code);
  if (digit && !input.shift) {
    const n = Number(digit[1]);
    return { type: 'select-tab-index', index: n === 9 ? 'last' : n - 1 };
  }
  return null;
}

export function isTabCommand(value: unknown): value is TabCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  switch (command.type) {
    case 'history':
      return command.direction === 'back' || command.direction === 'forward';
    case 'new-tab':
    case 'close-tab':
    case 'reopen-closed-tab':
      return true;
    case 'select-relative-tab':
      return command.offset === 1 || command.offset === -1;
    case 'select-tab-index':
      return (
        command.index === 'last' ||
        (Number.isInteger(command.index) &&
          (command.index as number) >= 0 &&
          (command.index as number) <= 7)
      );
    default:
      return false;
  }
}

/**
 * 탭 화면이 직접 요청할 수 있는 명령. 탭 화면이 보내야 하는 것은 마우스 사이드 버튼의
 * 뒤로/앞으로뿐이다. 단축키는 main이 입력을 직접 받아 처리하므로 탭 화면이 "탭 닫기"나
 * "새 탭"을 보낼 이유가 없다.
 */
export function isTabScreenCommand(
  command: TabCommand,
): command is Extract<TabCommand, { type: 'history' }> {
  return command.type === 'history';
}

/** native 메뉴 한 줄. id는 선택 결과로 그대로 돌아온다. */
export type TabMenuItem =
  | { type: 'item'; id: string; label: string; enabled?: boolean; accelerator?: string }
  | { type: 'separator' };

export const MAX_TAB_MENU_ITEMS = 40;
export const MAX_TAB_MENU_LABEL_LENGTH = 120;

export function isTabMenuItems(value: unknown): value is TabMenuItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TAB_MENU_ITEMS) {
    return false;
  }
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const entry = item as Record<string, unknown>;
    if (entry.type === 'separator') return true;
    return (
      entry.type === 'item' &&
      typeof entry.id === 'string' &&
      entry.id.length > 0 &&
      entry.id.length <= 64 &&
      typeof entry.label === 'string' &&
      entry.label.length <= MAX_TAB_MENU_LABEL_LENGTH &&
      (entry.enabled === undefined || typeof entry.enabled === 'boolean') &&
      (entry.accelerator === undefined ||
        (typeof entry.accelerator === 'string' && entry.accelerator.length <= 32))
    );
  });
}
