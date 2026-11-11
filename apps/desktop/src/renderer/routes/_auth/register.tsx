import { FormEvent, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthRegisterError, useAuth } from '@/providers/auth-provider';
import {
  SIGNUP_NAME_MAX_LENGTH,
  SIGNUP_PASSWORD_RULE,
  SIGNUP_USERNAME_RULE,
  isValidSignupUsername,
  meetsSignupPasswordPolicy,
  normalizeSignupUsername,
} from '../../../common/signupRules';

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
});

/**
 * 가입을 보내면 main이 계정을 만들고 바로 로그인한다. 그동안 인증 레이아웃이 이
 * 화면을 로딩 화면으로 바꾸므로, 서버가 아이디를 받아 주지 않아 다시 돌아왔을 때
 * 입력값과 안내를 되살릴 수 있게 마지막 시도를 여기 적어 둔다(비밀번호는 적지 않는다).
 * 화면이 다시 뜨는 것과 가입 결과가 도착하는 순서는 정해져 있지 않아, 결과 문구도
 * 같이 적어 둔다. 잠깐 뒤에는 지난 시도로 보고 쓰지 않는다.
 */
interface SignupAttempt {
  loginId: string;
  name: string;
  startedAt: number;
  error?: string;
  continueAtLogin?: boolean;
}
let lastAttempt: SignupAttempt | null = null;
const RETURN_WINDOW_MS = 60_000;

function recentAttempt(): SignupAttempt | null {
  return lastAttempt && Date.now() - lastAttempt.startedAt < RETURN_WINDOW_MS
    ? lastAttempt
    : null;
}

type FieldErrors = Partial<Record<'loginId' | 'password' | 'passwordConfirm' | 'name', string>>;

function validate(input: {
  loginId: string;
  password: string;
  passwordConfirm: string;
  name: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidSignupUsername(input.loginId)) errors.loginId = SIGNUP_USERNAME_RULE;
  if (!meetsSignupPasswordPolicy(input.password)) errors.password = SIGNUP_PASSWORD_RULE;
  if (input.passwordConfirm !== input.password) {
    errors.passwordConfirm = '비밀번호가 서로 다릅니다.';
  }
  if (!input.name) errors.name = '이름을 입력해 주세요.';
  else if (input.name.length > SIGNUP_NAME_MAX_LENGTH) {
    errors.name = `이름은 ${SIGNUP_NAME_MAX_LENGTH}자까지 입력할 수 있습니다.`;
  }
  return errors;
}

/**
 * 사장님 가입. 계정(아이디·비밀번호·이름)만 만들고, 사무소는 가입 직후 이어지는
 * 사무소 만들기 화면에서 만든다. 직원 계정은 사장님이 직원관리에서 만든다.
 */
function RegisterPage() {
  const { register, authError } = useAuth();
  // 가입 직후 서버가 아이디를 거절하면 로그아웃 상태로 이 화면에 돌아온다.
  const [returned] = useState(recentAttempt);
  const [loginId, setLoginId] = useState(returned?.loginId ?? '');
  const [name, setName] = useState(returned?.name ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState(
    returned ? (returned.error ?? authError ?? '') : '',
  );
  const [continueAtLogin, setContinueAtLogin] = useState(
    returned?.continueAtLogin ?? false,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      loginId: normalizeSignupUsername(loginId),
      password,
      passwordConfirm,
      name: name.trim(),
    };
    const nextFieldErrors = validate(input);
    setFieldErrors(nextFieldErrors);
    setError('');
    setContinueAtLogin(false);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setLoginId(input.loginId);
    setIsSubmitting(true);
    const attempt: SignupAttempt = {
      loginId: input.loginId,
      name: input.name,
      startedAt: Date.now(),
    };
    lastAttempt = attempt;
    try {
      await register(input.loginId, '', input.password, input.name, '');
      // 성공하면 로그인 상태가 되고 인증 레이아웃이 사무소 만들기로 넘긴다.
      if (lastAttempt === attempt) lastAttempt = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : '가입하지 못했습니다.';
      const atLogin = err instanceof AuthRegisterError && err.continueAtLogin;
      attempt.error = message;
      attempt.continueAtLogin = atLogin;
      setError(message);
      setContinueAtLogin(atLogin);
      setPassword('');
      setPasswordConfirm('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-[var(--auth-content-height,100svh)] w-full bg-[#f6f5f0] text-foreground">
      <section className="flex min-h-[var(--auth-content-height,100svh)] flex-col px-6 py-6 sm:px-10 lg:px-12">
        <header className="flex items-center justify-end gap-4">
          <p className="text-right text-xs text-muted-foreground sm:text-sm">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              로그인
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
              <h1 className="text-xl font-semibold tracking-tight">회원가입</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                사무소 대표 계정을 만듭니다. 사무소 정보는 다음 단계에서 입력합니다.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit} aria-busy={isSubmitting} noValidate>
              <Field
                id="register-login-id"
                label="아이디"
                hint={SIGNUP_USERNAME_RULE}
                error={fieldErrors.loginId}
              >
                {(describedBy) => (
                  <Input
                    id="register-login-id"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    maxLength={30}
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value.toLowerCase())}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(fieldErrors.loginId)}
                    aria-describedby={describedBy}
                    placeholder="아이디"
                  />
                )}
              </Field>
              <Field
                id="register-password"
                label="비밀번호"
                hint={SIGNUP_PASSWORD_RULE}
                error={fieldErrors.password}
              >
                {(describedBy) => (
                  <Input
                    id="register-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={describedBy}
                    placeholder="비밀번호"
                  />
                )}
              </Field>
              <Field
                id="register-password-confirm"
                label="비밀번호 확인"
                error={fieldErrors.passwordConfirm}
              >
                {(describedBy) => (
                  <Input
                    id="register-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(fieldErrors.passwordConfirm)}
                    aria-describedby={describedBy}
                    placeholder="비밀번호를 한 번 더 입력"
                  />
                )}
              </Field>
              <Field id="register-name" label="이름" error={fieldErrors.name}>
                {(describedBy) => (
                  <Input
                    id="register-name"
                    autoComplete="name"
                    maxLength={SIGNUP_NAME_MAX_LENGTH}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={describedBy}
                    placeholder="이름"
                  />
                )}
              </Field>

              {error && (
                <div id="register-error" role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    {error}
                    {continueAtLogin && (
                      <>
                        {' '}
                        <Link to="/login" className="font-medium underline">
                          로그인하러 가기
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                가입하기
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

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (describedBy: string | undefined) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children(describedBy)}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
