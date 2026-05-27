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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
      <RouterProvider router={router} />
    </ClerkProvider>
  </StrictMode>,
);
