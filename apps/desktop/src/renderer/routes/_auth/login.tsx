import { FormEvent, useEffect, useRef, useState } from 'react';
import { isClerkAPIResponseError } from '@clerk/react/errors';
import { useSignIn } from '@clerk/react/legacy';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getCodeDeliveryParams,
  getCodeVerificationParams,
  getSignInCodeFactor,
  type SignInCodeFactor,
} from '@/lib/sign-in-verification';
import { getDesktopAuthProvider } from '@/lib/desktop-auth-provider';
import { useAuth } from '@/providers/auth-provider';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

function LoginPage() {
  return getDesktopAuthProvider() === 'auth0' ? <Auth0LoginPage /> : <ClerkLoginPage />;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (isClerkAPIResponseError(error)) {
    return error.errors[0]?.longMessage ?? error.errors[0]?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function ClerkLoginPage() {
  const navigate = useNavigate();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [factor, setFactor] = useState<SignInCodeFactor | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [step, setStep] = useState<'credentials' | 'verification'>('credentials');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resumedPendingSignIn = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const sendCodeButton = useRef<HTMLButtonElement>(null);

  // Resume an unfinished challenge after a reload without sending another email.
  useEffect(() => {
    if (!isLoaded || !signIn || resumedPendingSignIn.current) return;
    resumedPendingSignIn.current = true;
    const pendingFactor = getSignInCodeFactor(signIn);
    if (!pendingFactor) return;
    setIdentifier(signIn.identifier ?? '');
    setFactor(pendingFactor);
    setCodeSent(
      signIn.secondFactorVerification.strategy === pendingFactor.strategy
      && signIn.secondFactorVerification.status !== null,
    );
    setStep('verification');
  }, [isLoaded, signIn]);

  const needsCodeDelivery = factor ? getCodeDeliveryParams(factor) !== null : false;
  const canEnterCode = !needsCodeDelivery || codeSent;

  useEffect(() => {
    if (step !== 'verification' || isSubmitting) return;
    if (canEnterCode) codeInput.current?.focus();
    else sendCodeButton.current?.focus();
  }, [step, canEnterCode, isSubmitting]);

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
      const nextFactor = getSignInCodeFactor(result);
      if (nextFactor) {
        setFactor(nextFactor);
        setCodeSent(false);
        setVerificationCode('');
        setStep('verification');
        return;
      }
      setError('추가 인증 단계가 필요합니다. 지원되지 않는 인증 방식이면 관리자에게 문의하세요.');
    } catch (err) {
      setError(getErrorMessage(err, '로그인에 실패했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendCode() {
    if (!isLoaded || !signIn || !factor) return;
    const params = getCodeDeliveryParams(factor);
    if (!params) return;
    setError('');
    setIsSubmitting(true);
    try {
      await signIn.prepareSecondFactor(params);
      setCodeSent(true);
      setVerificationCode('');
    } catch (err) {
      setError(getErrorMessage(err, '인증 코드를 보내지 못했습니다. 다시 시도해 주세요.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerificationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signIn || !factor || !canEnterCode) return;

    setError('');
    setIsSubmitting(true);
    try {
      const result = await signIn.attemptSecondFactor(
        getCodeVerificationParams(factor, verificationCode),
      );
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        await navigate({ to: '/', replace: true });
        return;
      }
      setError('인증을 완료하지 못했습니다. 코드를 확인해 주세요.');
    } catch (err) {
      setError(getErrorMessage(err, '인증에 실패했습니다. 코드를 확인해 주세요.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const formDisabled = !isLoaded || isSubmitting;
  const verificationLabel = factor?.strategy === 'email_code'
    ? '이메일 인증 코드'
    : factor?.strategy === 'phone_code'
      ? '문자 인증 코드'
      : factor?.strategy === 'backup_code'
        ? '백업 코드'
        : '인증 앱 코드';

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

            {step === 'verification' && factor ? (
              <form className="space-y-4" onSubmit={handleVerificationSubmit} aria-busy={isSubmitting}>
                <p id="verification-instructions" className="text-sm text-muted-foreground" role="status">
                  {factor.strategy === 'email_code'
                    ? codeSent
                      ? `${factor.safeIdentifier}로 보낸 인증 코드를 입력해 주세요.`
                      : `계정 확인을 위해 ${factor.safeIdentifier}로 인증 코드를 보내 주세요.`
                    : factor.strategy === 'phone_code'
                      ? codeSent
                        ? `${factor.safeIdentifier}로 보낸 문자 인증 코드를 입력해 주세요.`
                        : `${factor.safeIdentifier}로 문자 인증 코드를 보내 주세요.`
                      : factor.strategy === 'backup_code'
                        ? '2단계 인증 설정 시 저장한 백업 코드를 입력해 주세요.'
                        : '인증 앱에 표시된 6자리 코드를 입력해 주세요.'}
                </p>
                {canEnterCode && (
                  <div className="space-y-2">
                    <Label htmlFor="verification-code">{verificationLabel}</Label>
                    <Input
                      ref={codeInput}
                      id="verification-code"
                      inputMode={factor.strategy === 'backup_code' ? 'text' : 'numeric'}
                      autoComplete="one-time-code"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      disabled={formDisabled}
                      required
                      aria-invalid={Boolean(error)}
                      aria-describedby={`verification-instructions${error ? ' auth-error' : ''}`}
                      placeholder={factor.strategy === 'backup_code' ? '백업 코드' : '6자리 코드'}
                    />
                  </div>
                )}
                <AuthError message={error} />
                {canEnterCode && (
                  <Button type="submit" className="w-full" disabled={formDisabled || !verificationCode.trim()}>
                    {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                    인증
                  </Button>
                )}
                {needsCodeDelivery && (
                  <Button
                    ref={sendCodeButton}
                    type="button"
                    variant={codeSent ? 'outline' : 'default'}
                    className="w-full"
                    disabled={formDisabled}
                    onClick={handleSendCode}
                  >
                    {isSubmitting && !codeSent && <Loader2 className="size-4 animate-spin" />}
                    {codeSent ? '인증 코드 다시 받기' : '인증 코드 받기'}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={formDisabled}
                  onClick={() => {
                    setStep('credentials');
                    setFactor(null);
                    setVerificationCode('');
                    setCodeSent(false);
                    setError('');
                  }}
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

/**
 * Auth0 모드 로그인. 아이디·비밀번호를 이 화면에서 받아 main에 넘기고, main이
 * Auth0에서 토큰을 받는다. 로그인되면 인증 레이아웃이 업무 화면으로 넘긴다.
 */
function Auth0LoginPage() {
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
