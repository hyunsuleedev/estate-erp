import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useAuth } from '@/providers/auth-provider';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" />;
  }

  return <Navigate to="/login" />;
}
