import { createFileRoute, Outlet, Navigate } from '@tanstack/react-router';
import { SplashScreen } from '@/components/layout/splash-screen';
import { AuthWindowFrame } from '@/components/layout/auth-window-frame';
import { useAuth } from '@/providers/auth-provider';

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <SplashScreen />;
  }

  if (isAuthenticated) {
    if (!user?.office) {
      return <Navigate to="/onboarding/office" />;
    }
    return <Navigate to="/dashboard" />;
  }

  return (
    <AuthWindowFrame>
      <div className="flex min-h-[var(--auth-content-height,100svh)] items-center justify-center bg-muted/40">
        <Outlet />
      </div>
    </AuthWindowFrame>
  );
}
