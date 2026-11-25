import { FormEvent, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/providers/auth-provider';
import { translateServerMessage } from '@/i18n/auto';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

/**
 * 아이디·비밀번호를 이 화면에서 받아 main에 넘긴다. main이 로그인하고 사용자를
 * 확인하면 세션이 바뀌고, 인증 레이아웃이 업무 화면으로 넘긴다.
 */
function LoginPage() {
  const { login, authError, requestPasswordReset } = useAuth();
  const [isResetOpen, setIsResetOpen] = useState(false);
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
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => setIsResetOpen((open) => !open)}
                aria-expanded={isResetOpen}
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>
            {isResetOpen && <PasswordResetForm onSubmit={requestPasswordReset} />}
          </div>
        </div>

        <footer className="text-center text-[11px] text-muted-foreground sm:text-left">
          <span>© 2026 Estait Inc.</span>
        </footer>
      </section>
    </main>
  );
}

/**
 * 사장님만 쓴다. 가입 때 넣은 이메일로 재설정 링크를 보낸다. 그 이메일의 계정이
 * 있는지는 알려 주지 않는다.
 */
function PasswordResetForm({ onSubmit }: { onSubmit: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSentTo('');
    setIsSending(true);
    try {
      await onSubmit(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : '재설정 메일을 보내지 못했습니다.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form className="mt-4 space-y-3 border-t pt-4" onSubmit={handleSubmit} aria-busy={isSending} noValidate>
      <div className="space-y-2">
        <Label htmlFor="reset-email">가입할 때 입력한 이메일</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSending}
          placeholder="name@example.com"
        />
        <p className="text-xs text-muted-foreground">
          직원 계정은 사무소 대표나 매니저가 설정 › 직원 및 권한에서 비밀번호를 다시 정해 줍니다.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {sentTo && (
        <p role="status" className="text-sm text-muted-foreground">
          {sentTo} 주소로 가입한 계정이 있으면 재설정 링크를 보냈습니다. 메일함을 확인해 주세요.
        </p>
      )}
      <Button type="submit" variant="outline" className="w-full" disabled={isSending || !email.trim()}>
        {isSending && <Loader2 className="size-4 animate-spin" />}
        재설정 메일 받기
      </Button>
    </form>
  );
}

function AuthError({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div id="auth-error" role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {/* 로그인 오류는 화면 밖(Electron 쪽·서버)에서 한글로 온다. 영어 화면에서는 사전으로 바꿔 보여 준다. */}
      <p>{translateServerMessage(message)}</p>
    </div>
  );
}
