import { useEffect } from 'react';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { SplashScreen } from '@/components/layout/splash-screen';
import { useAuth } from '@/providers/auth-provider';

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const redirectTo = !isLoading && isAuthenticated
    ? user?.office
      ? '/dashboard'
      : '/onboarding/office'
    : null;

  useEffect(() => {
    if (!redirectTo) return;
    void navigate({ to: redirectTo });
  }, [navigate, redirectTo]);

  if (isLoading || redirectTo) {
    return <SplashScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Outlet />
    </div>
  );
}
