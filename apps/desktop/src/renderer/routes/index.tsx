import { createFileRoute, Navigate } from '@tanstack/react-router';
import { SplashScreen } from '@/components/layout/splash-screen';
import { useAuth } from '@/providers/auth-provider';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
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

  return <Navigate to="/login" />;
}
