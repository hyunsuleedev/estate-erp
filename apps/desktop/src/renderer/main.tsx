import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  RouterProvider,
  createHashHistory,
  createRouter,
} from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import './i18n';
import { getRendererSurface } from './features/tabs/native/rendererSurface';
import { CallOverlayRoot } from './features/cti/call-overlay';
import { setBrowserPreviewAuthBridge } from './lib/auth-bridge';

const router = createRouter({
  routeTree,
  history:
    window.location.protocol === 'file:' ? createHashHistory() : undefined,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const routerRoot = <RouterProvider router={router} />;
const surface = getRendererSurface();
// 탭 화면(native 탭)은 탭바 아래에 붙으므로 CSS가 셸과 다른 기준으로 배치한다.
document.documentElement.dataset.rendererSurface = surface.kind;

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {surface.kind === 'call-overlay' ? (
        // 탭 화면 위의 전화 수신 팝업 층: 라우터 없이 팝업만 그린다.
        <CallOverlayRoot />
      ) : (
        routerRoot
      )}
    </StrictMode>,
  );
}

if (import.meta.env.DEV && !window.electronBridge) {
  // 브라우저 미리보기: 개발 서버를 일반 브라우저(Playwright)로 열면 main이 없다.
  // 같은 로그인 화면이 동작하도록 개발 전용 세션을 이 페이지에 둔다. Electron에서는
  // 이 분기를 타지 않고, 패키지 빌드에는 아래 파일이 들어가지 않는다.
  void import('./dev/browser-preview-auth')
    .then(({ createBrowserPreviewAuthBridge }) =>
      setBrowserPreviewAuthBridge(createBrowserPreviewAuthBridge()),
    )
    .catch((error: unknown) => {
      console.error('[auth] 브라우저 미리보기 로그인을 준비하지 못했습니다:', error);
    })
    .finally(render);
} else {
  render();
}
