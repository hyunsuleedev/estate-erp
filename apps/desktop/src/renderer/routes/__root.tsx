import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import '@/app.css';

export const Route = createRootRoute({
  component: () => (
    <QueryProvider>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryProvider>
  ),
});
