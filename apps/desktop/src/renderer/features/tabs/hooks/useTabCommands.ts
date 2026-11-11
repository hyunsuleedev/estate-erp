import { useEffect } from 'react';
import { tabCommandForInput } from '../../../../common/tabCommands';
import {
  historyDirectionForMouseButton,
  rendererPlatform,
  runTabCommand,
  shortcutInputFromKeyboardEvent,
  type TabCommandContext,
} from '../lib/tabCommands';

/**
 * 셸 창에서 탭 단축키와 뒤로/앞으로 입력을 받는다.
 * - Electron: main의 before-input-event가 키를 받아 `tabs:command`로 보낸다.
 *   매물 상세 native view에 focus가 있어도 같은 경로로 온다.
 * - 브라우저 단독 미리보기: main이 없으므로 keydown을 직접 해석한다.
 * - 마우스 사이드 버튼: Windows는 main의 app-command, macOS는 여기서 mouseup으로 받는다.
 */
export function useTabCommands({ canCreateTabs }: TabCommandContext) {
  useEffect(() => {
    const context = { canCreateTabs };
    const bridge = window.electronBridge?.tabs;
    const platform = rendererPlatform();
    const cleanups: Array<() => void> = [];

    if (bridge?.onTabCommand) {
      cleanups.push(bridge.onTabCommand((command) => runTabCommand(command, context)));
    } else {
      const onKeyDown = (event: KeyboardEvent) => {
        const command = tabCommandForInput(shortcutInputFromKeyboardEvent(event), platform);
        if (!command) return;
        event.preventDefault();
        runTabCommand(command, context);
      };
      window.addEventListener('keydown', onKeyDown, true);
      cleanups.push(() => window.removeEventListener('keydown', onKeyDown, true));
    }

    if (!bridge || platform === 'darwin') {
      const onMouseUp = (event: MouseEvent) => {
        const direction = historyDirectionForMouseButton(event.button);
        if (!direction) return;
        event.preventDefault();
        runTabCommand({ type: 'history', direction }, context);
      };
      window.addEventListener('mouseup', onMouseUp, true);
      cleanups.push(() => window.removeEventListener('mouseup', onMouseUp, true));
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [canCreateTabs]);
}

/** 매물 상세 native view: macOS 마우스 사이드 버튼을 셸 창으로 보낸다. */
export function useNativeTabMouseNavigation() {
  useEffect(() => {
    if (rendererPlatform() !== 'darwin') return;
    const request = window.electronBridge?.tabs?.requestTabCommand;
    if (!request) return;
    const onMouseUp = (event: MouseEvent) => {
      const direction = historyDirectionForMouseButton(event.button);
      if (!direction) return;
      event.preventDefault();
      request({ type: 'history', direction });
    };
    window.addEventListener('mouseup', onMouseUp, true);
    return () => window.removeEventListener('mouseup', onMouseUp, true);
  }, []);
}
