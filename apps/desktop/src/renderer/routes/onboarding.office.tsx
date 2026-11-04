import { FormEvent, useState } from 'react';
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { ApiError, type OfficePostalAddress } from '@estate-erp/api-client';
import {
  ArrowRight,
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  LogOut,
} from 'lucide-react';
import { SplashScreen } from '@/components/layout/splash-screen';
import { AuthWindowFrame } from '@/components/layout/auth-window-frame';
import { OfficeAddressField } from '@/components/office-address-field';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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
  const [postalAddress, setPostalAddress] = useState<OfficePostalAddress | null>(null);
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
      const nameInput = event.currentTarget.elements.namedItem('organization');
      if (nameInput instanceof HTMLInputElement) nameInput.focus();
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
        postalAddress,
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
    <AuthWindowFrame>
      <main className="min-h-[var(--auth-content-height,100svh)] bg-[#f6f5f0] px-5 text-foreground sm:px-8">
        <div className="mx-auto w-full max-w-lg py-10 sm:py-12">
          <nav aria-label="시작 단계" className="mb-6 px-1">
            <ol className="flex items-center gap-3 text-xs font-medium">
              <li className="flex shrink-0 items-center gap-2 text-muted-foreground-strong">
                <span className="flex size-5 items-center justify-center rounded-full border border-border bg-background">
                  <Check className="size-3" aria-hidden="true" />
                </span>
                계정 확인 완료
              </li>
              <li aria-hidden="true" className="h-px flex-1 bg-border" />
              <li aria-current="step" className="flex shrink-0 items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground" aria-hidden="true">2</span>
                사무소 설정
              </li>
            </ol>
          </nav>

          <form onSubmit={handleSubmit} aria-busy={isSubmitting} className="rounded-lg border bg-background p-6 shadow-xs sm:p-8">
            <header className="mb-6 flex items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                <svg viewBox="15 15 70 70" fill="currentColor" className="size-6" aria-hidden="true">
                  <path d="M19.142 32.872 25.370 77.037 65.571 81 63.306 65.995 41.224 63.164 36.977 35.420Z" />
                  <path d="M35.845 19 38.110 34.005 60.758 37.402 64.721 64.580 80.858 66.562 74.347 24.096Z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">사무소 만들기</h1>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground-strong">
                  함께 일할 사무소의 이름을 알려주세요.
                </p>
              </div>
            </header>

            <fieldset disabled={isSubmitting} className="min-w-0">
              <legend className="sr-only">사무소 정보</legend>
              <div className="mb-6 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="office-name">사무소명</Label>
                  <span className="text-xs text-muted-foreground-strong">필수</span>
                </div>
                <Input
                  id="office-name"
                  name="organization"
                  autoComplete="organization"
                  className="h-12 bg-muted/30 px-3.5 text-base shadow-none md:text-base"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="예: 에스테잇 공인중개사사무소"
                  required
                  aria-invalid={Boolean(error && !name.trim())}
                  aria-describedby={error ? 'office-error' : undefined}
                />
              </div>

              <Collapsible className="border-y">
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="group h-auto w-full justify-between rounded-none px-0 py-4 text-left hover:bg-muted/50 active:scale-100 has-[>svg]:px-0">
                    <span className="flex flex-col gap-1.5">
                      <span className="flex items-center gap-2">
                        추가 정보
                        <span className="rounded border bg-muted/50 px-1.5 py-0.5 text-xs font-normal text-muted-foreground-strong">선택</span>
                      </span>
                      <span className="text-xs font-normal text-muted-foreground-strong">대표자 · 등록번호 · 연락처 · 주소</span>
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid gap-4 pb-5 pt-1 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ceo-name">대표자명</Label>
                      <Input
                        id="ceo-name"
                        name="name"
                        autoComplete="name"
                        className="h-10 shadow-none"
                        value={ceoName}
                        onChange={(event) => setCeoName(event.target.value)}
                        placeholder="대표자 이름"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="office-phone">대표 전화</Label>
                      <Input
                        id="office-phone"
                        type="tel"
                        name="tel"
                        autoComplete="tel"
                        className="h-10 shadow-none tabular-nums"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="02-0000-0000"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="license-no">중개업 등록번호</Label>
                      <Input
                        id="license-no"
                        className="h-10 shadow-none"
                        value={licenseNo}
                        onChange={(event) => setLicenseNo(event.target.value)}
                        placeholder="제00000-0000-00000호"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <OfficeAddressField value={postalAddress} onChange={setPostalAddress} disabled={isSubmitting} />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {error && (
                <div id="office-error" role="alert" className="mt-5 flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2.5 text-sm text-destructive-strong">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {error}
                </div>
              )}

              <Button type="submit" size="lg" className="mt-6 h-11 w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {isSubmitting ? '사무소를 만드는 중...' : '사무소 만들고 시작하기'}
                {!isSubmitting && <ArrowRight className="size-4" aria-hidden="true" />}
              </Button>
              <p className="mt-3 text-center text-xs leading-5 text-muted-foreground-strong">
                사무소명만으로 시작하고, 나머지는 나중에 채워도 돼요.
              </p>
            </fieldset>
          </form>

          <div className="mt-5 flex items-center justify-between gap-3 px-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium" aria-hidden="true">
                {(user?.name ?? user?.loginId ?? '').trim().slice(0, 1).toUpperCase()}
              </span>
              <p className="min-w-0 text-xs text-muted-foreground-strong">
                <span className="font-medium text-foreground">{user?.name ?? user?.loginId}</span>
                <span className="ml-1.5">계정으로 연결됩니다</span>
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs text-muted-foreground-strong" onClick={logout} disabled={isSubmitting}>
              로그아웃
              <LogOut className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </main>
    </AuthWindowFrame>
  );
}
