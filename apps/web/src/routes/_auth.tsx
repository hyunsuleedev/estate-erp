import { createFileRoute, Outlet, Navigate } from '@tanstack/react-router';
import { SplashScreen } from '@/components/layout/splash-screen';
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
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Outlet />
    </div>
  );
}
