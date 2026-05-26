import { FormEvent, useState } from 'react';
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { Building2, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/onboarding/office')({
  component: OfficeOnboardingPage,
});

function OfficeOnboardingPage() {
  const { user, isAuthenticated, isLoading, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [ceoName, setCeoName] = useState(user?.name ?? '');
  const [licenseNo, setLicenseNo] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (user?.office) {
    return <Navigate to="/dashboard" />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('사무소명을 입력하세요.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await api.offices.createForCurrentUser({
        name: trimmedName,
        ceoName: ceoName.trim() || null,
        licenseNo: licenseNo.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
      });
      await refresh();
      await navigate({ to: '/dashboard' });
    } catch {
      setError('사무소를 생성하지 못했습니다. 입력값을 확인해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Building2 className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">사무소 생성</h1>
              <p className="text-sm text-muted-foreground">업무 데이터가 연결될 사무소를 등록합니다</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={logout} title="로그아웃">
            <LogOut className="size-4" />
          </Button>
        </header>

        <form onSubmit={handleSubmit} className="mt-10 space-y-5 rounded-md border p-6 shadow-xs">
          <div className="space-y-2">
            <Label htmlFor="office-name">사무소명</Label>
            <Input
              id="office-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ceo-name">대표자명</Label>
              <Input id="ceo-name" value={ceoName} onChange={(event) => setCeoName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="license-no">중개업 등록번호</Label>
              <Input id="license-no" value={licenseNo} onChange={(event) => setLicenseNo(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="office-phone">대표 전화</Label>
            <Input id="office-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="office-address">주소</Label>
            <Input id="office-address" value={address} onChange={(event) => setAddress(event.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? '생성 중...' : '사무소 생성'}
          </Button>
        </form>
      </div>
    </main>
  );
}
