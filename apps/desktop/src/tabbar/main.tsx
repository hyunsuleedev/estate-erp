import { createRoot } from 'react-dom/client';
import { emptyTabBarState } from '../common/tabs/tabBarContract';
import { createBridgeTabBarPort, type TabBarPort } from '../common/tabs/tabBarPort';
import { TabBarWindow } from './TabBarWindow';
import './tabbar.css';

/**
 * 탭바 문서: 로그인 뒤의 창 자체의 화면. 탭 목록의 주인은 main이고, 이 문서는 main이
 * 보내 준 상태로 탭바만 그린다. 앱의 라우터·서버 호출·로그인 코드를 싣지 않는다:
 * 새 창을 열었을 때 탭바가 바로 떠야 하기 때문이다(test/tab-bar-entry.test.ts가 지킨다).
 */
function mount(port: TabBarPort): void {
  const root = document.getElementById('root');
  if (root) createRoot(root).render(<TabBarWindow port={port} />);
}

const bridge = window.electronBridge?.tabs?.tabBar;
if (bridge) {
  // 문서가 뜨는 순간 preload가 읽어 둔 상태로 첫 화면부터 탭을 그린다.
  mount(
    createBridgeTabBarPort(
      bridge,
      emptyTabBarState('main', window.electronBridge?.platform ?? 'darwin'),
    ),
  );
} else if (import.meta.env.DEV) {
  // 개발 서버를 일반 브라우저로 연 경우(화면 확인용): 본보기 탭 몇 개로 그린다.
  void import('./previewBridge').then(({ createPreviewTabBarBridge }) => {
    mount(
      createBridgeTabBarPort(
        createPreviewTabBarBridge(),
        emptyTabBarState('main', 'darwin'),
      ),
    );
  });
}
