import type { DesktopAuthBridge } from '../electron';

/**
 * 로그인 세션을 가진 쪽으로 가는 통로.
 *
 * - Electron 앱: main 프로세스(`window.electronBridge.auth`).
 * - 브라우저 미리보기(개발 서버를 일반 브라우저로 연 경우): `main.tsx`가 끼워 넣는
 *   개발 전용 통로. 패키지 빌드와 Electron에서는 늘 비어 있다.
 */
let browserPreviewBridge: DesktopAuthBridge | null = null;

export function setBrowserPreviewAuthBridge(bridge: DesktopAuthBridge): void {
  // Electron에서는 main만 세션의 주인이다. 화면이 대신할 수 없다.
  if (!import.meta.env.DEV || window.electronBridge) return;
  browserPreviewBridge = bridge;
}

export function getAuthBridge(): DesktopAuthBridge | undefined {
  return window.electronBridge?.auth ?? browserPreviewBridge ?? undefined;
}
