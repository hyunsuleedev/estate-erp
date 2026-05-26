import { SignUp } from '@clerk/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { GalleryVerticalEnd } from 'lucide-react';

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
});

function RegisterPage() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GalleryVerticalEnd className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">회원가입</h1>
        <p className="text-sm text-muted-foreground">Clerk 계정을 생성합니다</p>
      </div>

      <SignUp signInUrl="/login" forceRedirectUrl="/" fallbackRedirectUrl="/" />

      <p className="mt-4 text-xs text-muted-foreground">
        이미 계정이 있으신가요?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
