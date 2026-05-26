import { SignIn } from '@clerk/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Globe2 } from 'lucide-react';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

function LoginPage() {
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
          <SignIn signUpUrl="/register" forceRedirectUrl="/" fallbackRedirectUrl="/" />
        </div>

        <footer className="text-center text-[11px] text-muted-foreground sm:text-left">
          <span>© 2026 Estait Inc.</span>
        </footer>
      </section>
    </main>
  );
}
