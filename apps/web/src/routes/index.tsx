import { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SplashScreen } from '@/components/layout/splash-screen';
import { useAuth } from '@/providers/auth-provider';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const redirectTo = !isLoading
    ? isAuthenticated
      ? user?.office
        ? '/dashboard'
        : '/onboarding/office'
      : '/login'
    : null;

  useEffect(() => {
    if (!redirectTo) return;
    void navigate({ to: redirectTo });
  }, [navigate, redirectTo]);

  return <SplashScreen />;
}
