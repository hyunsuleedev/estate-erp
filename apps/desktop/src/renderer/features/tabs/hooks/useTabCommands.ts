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
 * 브라우저 단독 미리보기에서 탭 단축키와 마우스 사이드 버튼을 받는다. main이 없으므로
 * keydown을 직접 해석한다. Electron에서는 main이 키를 받아 탭 목록에 바로 적용한다.
 */
export function useTabCommands({ canCreateTabs }: TabCommandContext) {
  useEffect(() => {
    const context = { canCreateTabs };
    const platform = rendererPlatform();

    const onKeyDown = (event: KeyboardEvent) => {
      const command = tabCommandForInput(shortcutInputFromKeyboardEvent(event), platform);
      if (!command) return;
      event.preventDefault();
      runTabCommand(command, context);
    };
    const onMouseUp = (event: MouseEvent) => {
      const direction = historyDirectionForMouseButton(event.button);
      if (!direction) return;
      event.preventDefault();
      runTabCommand({ type: 'history', direction }, context);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
  }, [canCreateTabs]);
}

/** Electron의 창 화면·탭 화면: macOS 마우스 사이드 버튼을 main의 탭 목록에 보낸다. */
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
