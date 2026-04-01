import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { GalleryVerticalEnd } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
});

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    loginId: '',
    email: '',
    password: '',
    name: '',
    officeName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.loginId, form.email, form.password, form.name, form.officeName);
      navigate({ to: '/dashboard' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message || '회원가입에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GalleryVerticalEnd className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">회원가입</h1>
        <p className="text-sm text-muted-foreground">사무소 정보와 계정을 생성합니다</p>
      </div>

      {/* Form */}
      <div className="rounded-xl bg-card shadow-sm border border-border/40">
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="officeName" className="text-xs font-medium text-muted-foreground">사무소명</Label>
              <Input
                id="officeName"
                type="text"
                value={form.officeName}
                onChange={update('officeName')}
                required
                placeholder="OO 공인중개사사무소"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">이름</Label>
              <Input id="name" type="text" value={form.name} onChange={update('name')} required className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="loginId" className="text-xs font-medium text-muted-foreground">아이디</Label>
              <Input
                id="loginId"
                type="text"
                value={form.loginId}
                onChange={update('loginId')}
                required
                placeholder="사용할 아이디 (영문, 숫자)"
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">직원 계정은 이 아이디 기반으로 자동 생성됩니다 (예: {form.loginId || 'myid'}-001)</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">이메일</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={update('email')}
                required
                placeholder="example@email.com"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={update('password')}
                required
                minLength={6}
                className="h-9"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '가입 중...' : '가입하기'}
            </Button>
          </form>
        </div>

        <div className="border-t border-border/40 px-6 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
