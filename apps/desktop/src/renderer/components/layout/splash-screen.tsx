import { Building2, Check, Loader2 } from 'lucide-react';

export function SplashScreen() {
  return (
    <main
      className="relative flex min-h-svh w-full overflow-hidden bg-[#fbfaf7] px-6 text-foreground"
      aria-busy="true"
      aria-live="polite"
    >
      <style>
        {`
          @keyframes splash-progress {
            0% {
              transform: translateX(-120%);
            }
            50% {
              transform: translateX(80%);
            }
            100% {
              transform: translateX(260%);
            }
          }
        `}
      </style>
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(#e9e9e7 1px, transparent 1px), linear-gradient(90deg, #e9e9e7 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(circle at center, black 0%, transparent 72%)',
        }}
        aria-hidden="true"
      />

      <section className="relative mx-auto flex min-h-svh w-full max-w-5xl items-center justify-center py-10">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
          <div className="space-y-8 text-center lg:text-left">
            <div className="mx-auto flex size-20 items-center justify-center rounded-lg border border-border bg-white shadow-sm lg:mx-0">
              <div className="flex size-14 items-center justify-center rounded-md bg-[#37352f] text-white">
                <Building2 className="size-7" aria-hidden="true" />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">에스테잇플로우</p>
              <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground lg:mx-0">
                사무소 데이터와 업무 화면을 정리하고 있습니다.
              </p>
            </div>

            <div className="mx-auto h-1.5 w-full max-w-md overflow-hidden rounded-full bg-[#e9e9e7] lg:mx-0">
              <div
                className="h-full w-2/5 rounded-full bg-[#2383e2]"
                style={{ animation: 'splash-progress 1.35s ease-in-out infinite' }}
              />
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm rounded-lg border border-border bg-white/90 p-5 shadow-sm backdrop-blur lg:mx-0">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">시작 준비</p>
                <p className="mt-1 text-xs text-muted-foreground">잠시만 기다려 주세요.</p>
              </div>
              <Loader2 className="size-5 animate-spin text-[#2383e2]" aria-hidden="true" />
            </div>

            <div className="space-y-3">
              <LoadingStep label="계정 확인" complete />
              <LoadingStep label="사무소 정보 동기화" complete />
              <LoadingStep label="업무 화면 구성" />
            </div>

            <div className="mt-6 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              로딩 중...
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoadingStep({ label, complete = false }: { label: string; complete?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={
          complete
            ? 'flex size-6 items-center justify-center rounded-full bg-[#2383e2] text-white'
            : 'flex size-6 items-center justify-center rounded-full border border-[#2383e2]/30 bg-[#2383e2]/10'
        }
      >
        {complete ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <span className="size-2 rounded-full bg-[#2383e2]" aria-hidden="true" />
        )}
      </div>
      <div className="h-9 flex-1 rounded-md border border-border bg-background px-3 py-2">
        <p className="text-xs font-medium text-foreground">{label}</p>
      </div>
    </div>
  );
}
