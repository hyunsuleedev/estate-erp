import { FormEvent, useState } from 'react';
import { isClerkAPIResponseError } from '@clerk/react/errors';
import { useSignIn } from '@clerk/react/legacy';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, Globe2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

function getErrorMessage(error: unknown, fallback: string) {
  if (isClerkAPIResponseError(error)) {
    return error.errors[0]?.longMessage ?? error.errors[0]?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function LoginPage() {
  const navigate = useNavigate();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError('');
    setIsSubmitting(true);
    try {
      const result = await signIn.create({ identifier, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        await navigate({ to: '/', replace: true });
        return;
      }
      if (result.status === 'needs_second_factor') {
        setStep('mfa');
        return;
      }
      setError('추가 인증 단계가 필요합니다. 지원되지 않는 인증 방식이면 관리자에게 문의하세요.');
    } catch (err) {
      setError(getErrorMessage(err, '로그인에 실패했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError('');
    setIsSubmitting(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: 'totp',
        code: mfaCode,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        await navigate({ to: '/', replace: true });
        return;
      }
      setError('인증을 완료하지 못했습니다. 코드를 확인해 주세요.');
    } catch (err) {
      setError(getErrorMessage(err, '2단계 인증에 실패했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const formDisabled = !isLoaded || isSubmitting;

  return (
    <main className="min-h-screen w-full overflow-hidden bg-white text-foreground lg:grid lg:grid-cols-[minmax(420px,640px)_1fr]">
      <aside className="relative hidden min-h-screen bg-[#111827] px-14 py-14 text-white lg:flex lg:flex-col">
        <div>
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-white text-lg font-bold text-[#111827]">
              E
            </div>
            <div>
              <p className="text-lg font-semibold">Estate ERP</p>
              <p className="text-xs text-white/60">Brokerage operations</p>
            </div>
          </div>
          <h1 className="max-w-md text-4xl font-bold leading-tight">
            매물, 고객, 계약 흐름을 한 화면에서 관리하세요.
          </h1>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-3 text-sm text-white/70">
          <span>거래 파이프라인</span>
          <span>수수료 정산</span>
          <span>MCP 연결</span>
          <span>공동중개망</span>
        </div>
      </aside>

      <section className="flex min-h-screen flex-col px-6 py-6 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Globe2 className="size-4" />
            <span>한국어</span>
          </div>
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
              <h2 className="text-xl font-semibold tracking-tight">로그인</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                사무소 계정으로 업무를 계속합니다.
              </p>
            </div>

            {step === 'mfa' ? (
              <form className="space-y-4" onSubmit={handleMfaSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="mfa-code">2단계 인증 코드</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    disabled={formDisabled}
                    placeholder="6자리 코드"
                  />
                </div>
                <AuthError message={error} />
                <Button type="submit" className="w-full" disabled={formDisabled || !mfaCode}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  인증
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={formDisabled}
                  onClick={() => setStep('credentials')}
                >
                  이전으로
                </Button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleCredentialsSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="identifier">아이디 또는 이메일</Label>
                  <Input
                    id="identifier"
                    autoComplete="username"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    disabled={formDisabled}
                    placeholder="아이디 또는 이메일"
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
                    disabled={formDisabled}
                    placeholder="비밀번호"
                  />
                </div>
                <AuthError message={error} />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={formDisabled || !identifier || !password}
                >
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  로그인
                </Button>
              </form>
            )}
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
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
