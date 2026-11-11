import { FormEvent, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/providers/auth-provider';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

/**
 * 아이디·비밀번호를 이 화면에서 받아 main에 넘긴다. main이 로그인하고 사용자를
 * 확인하면 세션이 바뀌고, 인증 레이아웃이 업무 화면으로 넘긴다.
 */
function LoginPage() {
  const { login, authError } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const message = error || authError || '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(loginId.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
      setPassword('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-[var(--auth-content-height,100svh)] w-full bg-[#f6f5f0] text-foreground">
      <section className="flex min-h-[var(--auth-content-height,100svh)] flex-col px-6 py-6 sm:px-10 lg:px-12">
        <header className="flex items-center justify-end gap-4">
          <p className="text-right text-xs text-muted-foreground sm:text-sm">
            계정이 없으신가요?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              회원가입
            </Link>
          </p>
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 text-center">
              <svg viewBox="15 15 70 70" fill="currentColor" className="mx-auto mb-4 size-12 text-[#333b2f]" aria-hidden="true">
                <path d="M19.142 32.872 25.370 77.037 65.571 81 63.306 65.995 41.224 63.164 36.977 35.420Z" />
                <path d="M35.845 19 38.110 34.005 60.758 37.402 64.721 64.580 80.858 66.562 74.347 24.096Z" />
              </svg>
              <p className="mb-8 text-sm font-medium tracking-tight text-[#333b2f]">에스테잇플로우</p>
              <h1 className="text-xl font-semibold tracking-tight">로그인</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                사무소 계정으로 업무를 계속합니다.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit} aria-busy={isSubmitting}>
              <div className="space-y-2">
                <Label htmlFor="login-id">아이디</Label>
                <Input
                  id="login-id"
                  autoComplete="username"
                  autoFocus
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(message)}
                  aria-describedby={message ? 'auth-error' : undefined}
                  placeholder="아이디"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(message)}
                  aria-describedby={message ? 'auth-error' : undefined}
                  placeholder="비밀번호"
                />
              </div>
              <AuthError message={message} />
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || !loginId.trim() || !password}
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                로그인
              </Button>
            </form>
          </div>
        </div>

        <footer className="text-center text-[11px] text-muted-foreground sm:text-left">
          <span>© 2026 Estait Inc.</span>
        </footer>
      </section>
    </main>
  );
}

function AuthError({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div id="auth-error" role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
