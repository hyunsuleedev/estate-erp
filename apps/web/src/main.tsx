import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { koKR } from '@clerk/localizations';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import './i18n';

const router = createRouter({ routeTree });
const localization = {
  ...koKR,
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
    >
      <RouterProvider router={router} />
    </ClerkProvider>
  </StrictMode>,
);
