import { FormEvent, useState } from 'react';
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { ApiError } from '@estate-erp/api-client';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { SplashScreen } from '@/components/layout/splash-screen';
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
    return <SplashScreen />;
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
    } catch (error) {
      setError(error instanceof ApiError ? error.message : '사무소를 생성하지 못했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-5 py-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-10">
        <section className="flex flex-col justify-between rounded-lg border bg-background p-6 shadow-xs lg:p-8">
          <div className="space-y-8">
            <header className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">에스테잇플로우</p>
                  <h1 className="text-2xl font-semibold tracking-tight">사무소 생성</h1>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={logout} title="로그아웃">
                <LogOut className="size-4" />
              </Button>
            </header>

            <div className="space-y-3">
              <p className="max-w-md text-3xl font-semibold tracking-tight text-balance">
                사무소 정보를 등록하면 업무 공간이 열립니다.
              </p>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                직원, 매물, 상담, 계약 데이터가 이 사무소 기준으로 분리됩니다.
              </p>
            </div>

            <div className="grid gap-3">
              <OnboardingStep icon={CheckCircle2} title="계정 확인 완료" description={user?.name ?? user?.loginId ?? '로그인됨'} />
              <OnboardingStep icon={Building2} title="사무소 생성" description="필수 정보 1개만 입력해도 시작할 수 있습니다" active />
              <OnboardingStep icon={ShieldCheck} title="업무 데이터 분리" description="생성 후 사무소 단위 권한이 적용됩니다" />
            </div>
          </div>

          <div className="mt-8 rounded-md border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-0.5 size-4 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">필수 입력</p>
                <p className="text-sm leading-5 text-muted-foreground">
                  사무소명만 필수입니다. 대표자, 등록번호, 연락처, 주소는 설정에서 나중에 수정할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <form onSubmit={handleSubmit} className="w-full rounded-lg border bg-background p-5 shadow-xs sm:p-7 lg:p-8">
            <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">기본 정보</h2>
                <p className="text-sm text-muted-foreground">사업자 정보와 연락처를 입력합니다.</p>
              </div>
              <div className="rounded-md border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Owner
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="office-name">사무소명</Label>
                <Input
                  id="office-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="예: 강남공인중개사"
                  autoFocus
                  required
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ceo-name">대표자명</Label>
                  <Input
                    id="ceo-name"
                    value={ceoName}
                    onChange={(event) => setCeoName(event.target.value)}
                    placeholder="홍길동"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license-no">중개업 등록번호</Label>
                  <Input
                    id="license-no"
                    value={licenseNo}
                    onChange={(event) => setLicenseNo(event.target.value)}
                    placeholder="제00000-0000-00000호"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="office-phone">대표 전화</Label>
                  <Input
                    id="office-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="02-0000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="office-address">주소</Label>
                  <Input
                    id="office-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="서울시 강남구 ..."
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted-foreground">
                  생성 후 대시보드로 이동합니다.
                </p>
                <Button type="submit" className="sm:min-w-40" disabled={isSubmitting}>
                  {isSubmitting ? '생성 중...' : '사무소 생성'}
                  {!isSubmitting && <ArrowRight className="size-4" />}
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function OnboardingStep({
  icon: Icon,
  title,
  description,
  active = false,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-background p-3">
      <div
        className={
          active
            ? 'flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground'
            : 'flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground'
        }
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
