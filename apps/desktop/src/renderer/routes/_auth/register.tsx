import { FormEvent, useState } from 'react';
import { isClerkAPIResponseError } from '@clerk/react/errors';
import { useSignUp } from '@clerk/react/legacy';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, GalleryVerticalEnd, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
});

function getErrorMessage(error: unknown, fallback: string) {
  if (isClerkAPIResponseError(error)) {
    return error.errors[0]?.longMessage ?? error.errors[0]?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function RegisterPage() {
  const navigate = useNavigate();
  const { isLoaded, signUp, setActive } = useSignUp();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'register' | 'verify'>('register');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError('');
    setIsSubmitting(true);
    try {
      await signUp.create({
        username: username.trim(),
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareVerification({ strategy: 'email_code' });
      setStep('verify');
    } catch (err) {
      setError(getErrorMessage(err, '회원가입에 실패했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError('');
    setIsSubmitting(true);
    try {
      const result = await signUp.attemptVerification({
        strategy: 'email_code',
        code,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        await navigate({ to: '/', replace: true });
        return;
      }
      setError('인증을 완료하지 못했습니다. 코드를 확인해 주세요.');
    } catch (err) {
      setError(getErrorMessage(err, '이메일 인증에 실패했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const formDisabled = !isLoaded || isSubmitting;

  return (
    <div className="flex w-full max-w-sm flex-col items-center">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GalleryVerticalEnd className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">회원가입</h1>
        <p className="text-sm text-muted-foreground">
          {step === 'verify' ? '이메일 인증 코드를 입력하세요' : '업무 계정을 생성합니다'}
        </p>
      </div>

      {step === 'verify' ? (
        <form className="w-full space-y-4" onSubmit={handleVerify}>
          <div className="space-y-2">
            <Label htmlFor="verification-code">인증 코드</Label>
            <Input
              id="verification-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={formDisabled}
              placeholder="이메일로 받은 코드"
            />
          </div>
          <AuthError message={error} />
          <Button type="submit" className="w-full" disabled={formDisabled || !code}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            인증 완료
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={formDisabled}
            onClick={() => setStep('register')}
          >
            정보 수정
          </Button>
        </form>
      ) : (
        <form className="w-full space-y-4" onSubmit={handleRegister}>
          <div className="space-y-2">
            <Label htmlFor="username">아이디</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={formDisabled}
              placeholder="office-owner"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={formDisabled}
              placeholder="owner@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={formDisabled}
              placeholder="비밀번호"
            />
          </div>
          <div id="clerk-captcha" data-cl-theme="light" data-cl-size="flexible" />
          <AuthError message={error} />
          <Button
            type="submit"
            className="w-full"
            disabled={formDisabled || !username || !email || !password}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            회원가입
          </Button>
        </form>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        이미 계정이 있으신가요?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}

function AuthError({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="flex w-full items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
