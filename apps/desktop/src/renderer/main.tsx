import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { koKR } from '@clerk/localizations';
import {
  RouterProvider,
  createHashHistory,
  createRouter,
} from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import './i18n';
import { getRendererSurface } from './features/tabs/native/rendererSurface';
import { CallOverlayRoot } from './features/cti/call-overlay';
import { getDesktopAuthProvider } from './lib/desktop-auth-provider';

const router = createRouter({
  routeTree,
  history:
    window.location.protocol === 'file:' ? createHashHistory() : undefined,
});
const isFileProtocol = window.location.protocol === 'file:';

function normalizeClerkNavigationTarget(to: string): string {
  if (!isFileProtocol) return to;

  if (!to || to === '/') return '/';
  if (to.startsWith('#')) return to.slice(1) || '/';

  try {
    const url = new URL(to);
    if (url.protocol === 'file:') {
      return url.hash.replace(/^#/, '') || '/';
    }
  } catch {
    // Clerk may pass relative paths. TanStack Router can handle those directly.
  }

  return to;
}
const localization = {
  ...koKR,
  unstable__errors: {
    ...koKR.unstable__errors,
    form_identifier_exists__username: '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.',
  },
  formFieldInputPlaceholder__username: '아이디를 입력하세요',
  formFieldInputPlaceholder__password: '비밀번호를 입력하세요',
  formFieldInputPlaceholder__signUpPassword: '비밀번호를 만드세요',
};

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const routerRoot = <RouterProvider router={router} />;
const surface = getRendererSurface();
// 탭 화면(native 탭)은 탭바 아래에 붙으므로 CSS가 셸과 다른 기준으로 배치한다.
document.documentElement.dataset.rendererSurface = surface.kind;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {surface.kind === 'call-overlay' ? (
      // 탭 화면 위의 전화 수신 팝업 층: 라우터 없이 팝업만 그린다.
      <CallOverlayRoot />
    ) : surface.kind === 'native-tab' || getDesktopAuthProvider() === 'auth0' ? (
      // 탭 화면은 셸의 세션을 빌려 쓰고, Auth0 모드는 main이 로그인을 맡아 Clerk가 필요 없다.
      routerRoot
    ) : (
      <ClerkProvider
        publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
        localization={localization}
        routerPush={(to) =>
          router.navigate({ to: normalizeClerkNavigationTarget(to) })
        }
        routerReplace={(to) =>
          router.navigate({
            to: normalizeClerkNavigationTarget(to),
            replace: true,
          })
        }
      >
        {routerRoot}
      </ClerkProvider>
    )}
  </StrictMode>,
);
