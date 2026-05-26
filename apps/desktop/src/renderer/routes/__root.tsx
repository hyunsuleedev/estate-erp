import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { RealtimeProvider } from '@/providers/realtime-provider';
import '@/app.css';

export const Route = createRootRoute({
  component: () => (
    <QueryProvider>
      <AuthProvider>
        <RealtimeProvider>
          <Outlet />
        </RealtimeProvider>
      </AuthProvider>
    </QueryProvider>
  ),
});
