import { FormEvent, useState } from 'react';
import { isClerkAPIResponseError } from '@clerk/react/errors';
import { useSignIn } from '@clerk/react/legacy';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, Globe2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

function getErrorMessage(error: unknown, fallback: string) {
  if (isClerkAPIResponseError(error)) {
    return error.errors[0]?.longMessage ?? error.errors[0]?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

/* 수묵 풍경 배경 — public/login-scene.mp4(또는 .webm)가 존재하면 영상을 재생하고,
   없으면 login-scene.jpg 정지 그림 + CSS 모션(호흡·안개·글린트)으로 대체한다.
   영상 파일을 public에 떨어뜨리는 것만으로 업그레이드되는 구조 (desktop 전용 개편) */
function SceneMedia() {
  const [videoFailed, setVideoFailed] = useState(false);

  if (videoFailed) {
    return (
      <div className="jf-breathe absolute inset-0">
        {/* SMIL로 변위 강도가 숨쉬는 물결 필터 — 두 띠의 위상을 어긋나게 해 파도가 번갈아 부푼다 */}
        <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
          <defs>
            {/* 변위 노이즈를 feOffset으로 옆으로 흘려보내 물결 패턴이 이동하게 한다.
                dx 리셋은 scale이 0이 되는 주기 끝과 동기화되어 점프가 보이지 않는다 */}
            <filter id="jf-wobble-a" x="-8%" y="-8%" width="116%" height="116%">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="3" result="t" />
              <feOffset in="t" dx="0" dy="0" result="tm">
                <animate attributeName="dx" values="0;40" dur="11s" repeatCount="indefinite" />
              </feOffset>
              <feDisplacementMap in="SourceGraphic" in2="tm" xChannelSelector="R" yChannelSelector="G" scale="0">
                <animate
                  attributeName="scale"
                  values="0;10;2;9;0"
                  dur="11s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
                />
              </feDisplacementMap>
            </filter>
            <filter id="jf-wobble-b" x="-8%" y="-8%" width="116%" height="116%">
              <feTurbulence type="fractalNoise" baseFrequency="0.009 0.016" numOctaves="2" seed="11" result="t" />
              <feOffset in="t" dx="0" dy="0" result="tm">
                <animate attributeName="dx" values="0;60" dur="14s" begin="-6s" repeatCount="indefinite" />
              </feOffset>
              <feDisplacementMap in="SourceGraphic" in2="tm" xChannelSelector="R" yChannelSelector="G" scale="0">
                <animate
                  attributeName="scale"
                  values="0;18;5;14;0"
                  dur="14s"
                  begin="-6s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
                />
              </feDisplacementMap>
            </filter>
          </defs>
        </svg>
        <img src="/login-scene.jpg" alt="" className="jf-scene-media" draggable={false} />
        {/* 같은 그림을 물 영역만 마스킹해 겹치고 변위 필터로 일렁이게 — 집·바위는 원본이 그대로 받친다 */}
        <img src="/login-scene.jpg" alt="" aria-hidden className="jf-scene-media jf-wobble-mid" draggable={false} />
        <img src="/login-scene.jpg" alt="" aria-hidden className="jf-scene-media jf-wobble-front" draggable={false} />
        <div aria-hidden className="jf-mist jf-mist-a" />
        <div aria-hidden className="jf-mist jf-mist-b" />
        <div aria-hidden className="jf-glint" style={{ left: '22%', bottom: '18%', animationDelay: '0s' }} />
        <div aria-hidden className="jf-glint" style={{ left: '58%', bottom: '26%', animationDelay: '2.6s' }} />
        <div aria-hidden className="jf-glint" style={{ left: '76%', bottom: '12%', animationDelay: '4.8s' }} />
      </div>
    );
  }

  return (
    <video
      className="jf-scene-media"
      autoPlay
      muted
      loop
      playsInline
      poster="/login-scene.jpg"
      onError={() => setVideoFailed(true)}
    >
      <source src="/login-scene.webm" type="video/webm" />
      <source src="/login-scene.mp4" type="video/mp4" onError={() => setVideoFailed(true)} />
    </video>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError('');
    setIsSubmitting(true);
    try {
      const result = await signIn.create({ identifier, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        await navigate({ to: '/', replace: true });
        return;
      }
      if (result.status === 'needs_second_factor') {
        setStep('mfa');
        return;
      }
      setError('추가 인증 단계가 필요합니다. 지원되지 않는 인증 방식이면 관리자에게 문의하세요.');
    } catch (err) {
      setError(getErrorMessage(err, '로그인에 실패했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError('');
    setIsSubmitting(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: 'totp',
        code: mfaCode,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        await navigate({ to: '/', replace: true });
        return;
      }
      setError('인증을 완료하지 못했습니다. 코드를 확인해 주세요.');
    } catch (err) {
      setError(getErrorMessage(err, '2단계 인증에 실패했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const formDisabled = !isLoaded || isSubmitting;

  return (
    <main className="min-h-screen w-full overflow-hidden bg-white text-foreground lg:grid lg:grid-cols-[minmax(420px,640px)_1fr]">
      <style>{loginAsideCss}</style>

      <aside className="jf-aside relative hidden min-h-screen overflow-hidden border-r border-[#dbe7f2] px-14 py-14 text-[#1e3a56] lg:flex lg:flex-col">
        <div aria-hidden className="jf-scene absolute inset-0">
          <SceneMedia />
          <div className="jf-veil absolute inset-0" />
        </div>

        <div className="relative">
          <div className="jf-rise mb-10 flex items-center gap-3" style={{ animationDelay: '0s' }}>
            <div className="jf-logo flex size-11 items-center justify-center rounded-lg">
              <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden>
                <path d="M3,13 Q7,7 12,11 T21,9" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <path d="M3,18 Q7,12 12,16 T21,14" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">에스테잇플로우</p>
              <p className="text-xs text-[#1e3a56]/55">Estait Flow · 중개 업무 OS</p>
            </div>
          </div>

          <h1
            className="jf-rise max-w-md text-4xl font-bold leading-[1.25] tracking-tight"
            style={{ animationDelay: '0.12s' }}
          >
            매물, 고객, 계약의{' '}
            <span className="jf-flow-word">
              흐름
              <svg
                aria-hidden
                className="jf-flow-underline"
                viewBox="0 0 80 10"
                preserveAspectRatio="none"
              >
                <path d="M2,6 Q12,2 22,6 T42,6 T62,6 T82,6" fill="none" strokeWidth="2.5" />
              </svg>
            </span>
            을<br />한 화면에서 관리하세요.
          </h1>
        </div>

        {/* 그림/영상이 배경 전체를 채우므로 가운데는 비워 풍경이 드러나게 한다 */}
        <div className="relative flex-1" />

        <div className="relative flex flex-wrap gap-2 text-[13px] text-[#1e3a56]/80">
          {['거래 파이프라인', '수수료 정산', 'MCP 연결', '공동중개망'].map((f, i) => (
            <span
              key={f}
              className="jf-rise jf-chip rounded-full px-3.5 py-1.5"
              style={{ animationDelay: `${0.36 + i * 0.08}s` }}
            >
              {f}
            </span>
          ))}
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
          <div className="w-full max-w-sm">
            <div className="mb-8 text-center">
              <h2 className="text-xl font-semibold tracking-tight">로그인</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                사무소 계정으로 업무를 계속합니다.
              </p>
            </div>

            {step === 'mfa' ? (
              <form className="space-y-4" onSubmit={handleMfaSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="mfa-code">2단계 인증 코드</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    disabled={formDisabled}
                    placeholder="6자리 코드"
                  />
                </div>
                <AuthError message={error} />
                <Button type="submit" className="w-full" disabled={formDisabled || !mfaCode}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  인증
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={formDisabled}
                  onClick={() => setStep('credentials')}
                >
                  이전으로
                </Button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleCredentialsSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="identifier">아이디 또는 이메일</Label>
                  <Input
                    id="identifier"
                    autoComplete="username"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    disabled={formDisabled}
                    placeholder="아이디 또는 이메일"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">비밀번호</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={formDisabled}
                    placeholder="비밀번호"
                  />
                </div>
                <AuthError message={error} />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={formDisabled || !identifier || !password}
                >
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  로그인
                </Button>
              </form>
            )}
          </div>
        </div>

        <footer className="text-center text-[11px] text-muted-foreground sm:text-left">
          <span>© 2026 Estait Inc.</span>
        </footer>
      </section>
    </main>
  );
}

function AuthError({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

/* 로그인 aside 전용 스타일 — 수묵 담채 풍경(그림/영상) 배경 + 청화백자 텍스트 팔레트.
   애니메이션은 전부 CSS라 prefers-reduced-motion 미디어 쿼리만으로 정지된다.
   (desktop 전용 개편 — apps/web 로그인과는 현재 다른 디자인) */
const loginAsideCss = `
.jf-aside {
  background: #f6f3ea;
}

.jf-scene {
  animation: jf-scene-in 1.9s cubic-bezier(0.16, 1, 0.3, 1) both;
  pointer-events: none;
}
@keyframes jf-scene-in {
  from { opacity: 0; filter: blur(14px); }
  to   { opacity: 1; filter: blur(0); }
}
.jf-scene-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 36% 62%;
}

/* 정지 그림 모드: 26초 주기의 미세한 호흡 (영상 모드에서는 영상 자체가 움직인다) */
.jf-breathe {
  animation: jf-breathe 26s ease-in-out infinite alternate;
  will-change: transform;
}
@keyframes jf-breathe {
  from { transform: scale(1.02); }
  to   { transform: scale(1.05); }
}

/* 물결 띠 2겹 — 필터는 SMIL(svg <animate>)이 구동하므로 CSS에는 마스크만 둔다.
   중간 띠는 섬 바위 부근이라 약하게, 전면 파도 띠는 강하게 일렁인다 */
.jf-wobble-mid {
  filter: url(#jf-wobble-a);
  -webkit-mask-image: linear-gradient(180deg, transparent 58%, #000 70%, #000 82%, transparent 92%);
  mask-image: linear-gradient(180deg, transparent 58%, #000 70%, #000 82%, transparent 92%);
}
.jf-wobble-front {
  filter: url(#jf-wobble-b);
  -webkit-mask-image: linear-gradient(180deg, transparent 74%, #000 86%);
  mask-image: linear-gradient(180deg, transparent 74%, #000 86%);
}

.jf-mist {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  filter: blur(34px);
}
.jf-mist-a {
  top: 24%; right: -14%; width: 70%; height: 9%;
  animation: jf-mist-x 34s ease-in-out infinite;
}
.jf-mist-b {
  top: 44%; left: -18%; width: 60%; height: 8%;
  animation: jf-mist-x 42s ease-in-out infinite reverse;
}
@keyframes jf-mist-x {
  0%, 100% { transform: translateX(0); }
  50%      { transform: translateX(46px); }
}

.jf-glint {
  position: absolute;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #fff;
  filter: blur(2px);
  opacity: 0;
  animation: jf-glint 7s ease-in-out infinite;
}
@keyframes jf-glint {
  0%, 100% { opacity: 0; }
  12%      { opacity: 0.85; }
  26%      { opacity: 0; }
}

/* 텍스트 가독성 베일: 상단(로고·헤드라인)과 하단(칩)만 종이색으로 살짝 받친다 */
.jf-veil {
  background:
    linear-gradient(180deg, rgba(251, 253, 255, 0.92) 0%, rgba(251, 253, 255, 0.6) 26%, rgba(251, 253, 255, 0) 52%),
    linear-gradient(0deg, rgba(251, 253, 255, 0.7) 0%, rgba(251, 253, 255, 0) 26%);
}

.jf-logo {
  background: linear-gradient(135deg, #4a86b8 0%, #2c5f8f 100%);
  box-shadow: 0 0 0 1px rgba(44, 95, 143, 0.25), 0 8px 20px rgba(44, 95, 143, 0.22);
}

.jf-rise {
  opacity: 0;
  animation: jf-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes jf-rise {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

.jf-flow-word { position: relative; color: #2f6ba1; }
.jf-flow-underline {
  position: absolute;
  left: 0;
  bottom: -2px;
  width: 100%;
  height: 8px;
  overflow: visible;
}
.jf-flow-underline path {
  stroke: rgba(47, 107, 161, 0.55);
  stroke-dasharray: 6 8;
  animation: jf-march 1.6s linear infinite;
}
@keyframes jf-march { to { stroke-dashoffset: -14; } }

.jf-chip {
  border: 1px solid rgba(44, 95, 143, 0.28);
  background: rgba(255, 255, 255, 0.55);
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}
.jf-chip:hover {
  border-color: rgba(44, 95, 143, 0.45);
  background: rgba(91, 141, 184, 0.15);
  transform: translateY(-1px);
}

@media (prefers-reduced-motion: reduce) {
  .jf-rise { opacity: 1; animation: none; }
  .jf-scene { animation: none; }
  .jf-breathe, .jf-mist, .jf-flow-underline path { animation: none; }
  .jf-glint { animation: none; opacity: 0.4; }
  .jf-wobble-mid, .jf-wobble-front { display: none; }
}
`;
