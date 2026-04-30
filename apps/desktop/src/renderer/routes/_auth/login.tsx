import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

const featurePills = [
  'MCP 연결',
  '수수료 정산',
];

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(loginId, password, rememberDevice);
      navigate({ to: '/dashboard' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message || '아이디 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full overflow-hidden bg-white text-foreground lg:grid lg:grid-cols-[minmax(420px,640px)_1fr]">
      <BrandPanel />

      <section className="relative flex min-h-screen flex-col bg-white px-6 py-6 sm:px-10 lg:px-12">
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
          <div className="w-full max-w-[420px]">
            <div className="mb-9 lg:hidden">
              <BrandMark tone="dark" />
            </div>

            <div className="mb-10">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
                Sign in
              </p>
              <h1 className="mb-2.5 text-3xl font-bold tracking-tight text-[#111827]">
                워크스페이스로 로그인
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                사무소 계정으로 접속해 매물·거래·수수료를 이어서 관리하세요.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-[18px]">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="loginId" className="text-xs font-medium text-[#374151]">
                  로그인 ID
                </Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="loginId"
                    type="text"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    required
                    placeholder="hyunsu"
                    autoComplete="username"
                    className="h-11 rounded-lg border-[#e5e7eb] bg-white pl-10 text-sm shadow-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium text-[#374151]">
                    비밀번호
                  </Label>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-primary hover:underline"
                    onClick={() => setError('비밀번호 찾기는 아직 준비 중입니다.')}
                  >
                    비밀번호 찾기
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-primary" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 rounded-lg border-primary bg-white pl-10 pr-20 text-sm shadow-none ring-[3px] ring-primary/10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {showPassword ? '숨기기' : '보기'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#374151]">
                  <Checkbox
                    checked={rememberDevice}
                    onCheckedChange={(checked) => setRememberDevice(checked === true)}
                    className="border-primary data-[state=checked]:bg-primary"
                  />
                  <span>이 기기 기억하기</span>
                </label>
                <div className="flex items-center gap-1.5 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  2FA 보호됨
                </div>
              </div>

              <Button
                type="submit"
                className="h-12 w-full rounded-lg bg-[#111827] text-sm font-semibold text-white hover:bg-[#030712]"
                disabled={loading}
              >
                {loading ? '로그인 중...' : '로그인'}
                <ArrowRight className="size-4" />
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#f0f0f0]" />
              <span className="text-[11px] font-medium text-muted-foreground">또는</span>
              <div className="h-px flex-1 bg-[#f0f0f0]" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-lg border-[#e5e7eb] bg-white text-sm font-medium text-[#374151] shadow-none hover:bg-muted"
              onClick={() => setError('카카오 로그인은 아직 준비 중입니다.')}
            >
              <span className="flex size-4 items-center justify-center rounded bg-[#fee500] text-[10px] font-extrabold text-[#111827]">
                K
              </span>
              카카오 계정으로 로그인
            </Button>
          </div>
        </div>

        <footer className="flex flex-col gap-3 text-center text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <span>© 2026 Estait Inc.</span>
          <div className="flex items-center justify-center gap-4">
            <button type="button" className="hover:text-foreground">
              이용약관
            </button>
            <button type="button" className="hover:text-foreground">
              개인정보 처리방침
            </button>
            <button type="button" className="hover:text-foreground">
              도움말
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

function BrandPanel() {
  return (
    <aside
      className="relative hidden min-h-screen overflow-hidden px-14 py-14 text-white lg:flex lg:flex-col"
      style={{
        backgroundImage:
          'radial-gradient(circle at 86% 8%, rgba(99,102,241,0.42) 0%, transparent 36%), radial-gradient(circle at 0% 100%, rgba(20,184,166,0.24) 0%, transparent 34%), linear-gradient(165deg, #1e1b4b 0%, #312e81 45%, #4338ca 100%)',
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_70%)] opacity-60" />

      <div className="relative z-10">
        <BrandMark />
      </div>

      <div className="relative z-10 flex flex-1 items-center">
        <div className="max-w-[500px]">
          <p className="mb-[18px] text-[15px] font-semibold leading-none tracking-normal text-white/70">
            중개사무소 운영의 기준
          </p>
          <h2 className="mb-5 text-[44px] font-bold leading-[1.15] tracking-tight">
            매물부터 수수료까지,
            <br />
            한 화면에서.
          </h2>
          <p className="max-w-[480px] text-[15px] leading-6 text-white/75">
            매물·고객·상담·거래·수수료를 단일 워크스페이스로 관리합니다.
          </p>
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex flex-wrap gap-2.5">
          {featurePills.map((pill) => (
            <span
              key={pill}
              className="rounded-full border border-white/20 bg-white/[0.12] px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
            >
              {pill}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

function BrandMark({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';

  return (
    <p className={`text-xl font-bold tracking-tight ${dark ? 'text-[#111827]' : 'text-white'}`}>
      Estait
    </p>
  );
}
