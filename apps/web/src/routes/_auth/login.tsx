import { SignIn } from '@clerk/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Globe2 } from 'lucide-react';

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

/* 파도 밴드 — 주기 260px 사인 곡선을 4주기(1040px) 그려 -520px 이동 시 이음새 없이 순환 */
function wavePath(base: number, amp: number, close: boolean) {
  let d = `M0,${base}`;
  for (let k = 0; k < 4; k++) {
    const x = k * 260;
    d += ` Q${x + 65},${base - amp} ${x + 130},${base}`;
    d += ` Q${x + 195},${base + amp} ${x + 260},${base}`;
  }
  return close ? `${d} L1040,300 L0,300 Z` : d;
}

/* 파도 물마루(x=65 + 520k)의 붓 소용돌이(파도문) 장식 위치 */
const CURL_XS = [65, 585];

function LoginPage() {
  return (
    <main className="min-h-screen w-full overflow-hidden bg-white text-foreground lg:grid lg:grid-cols-[minmax(420px,640px)_1fr]">
      <style>{loginAsideCss}</style>

      <aside className="jf-aside relative hidden min-h-screen overflow-hidden border-r border-[#dbe7f2] px-14 py-14 text-[#1e3a56] lg:flex lg:flex-col">
        <div aria-hidden className="jf-grain absolute inset-0" />

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

        {/* 수묵 담채 풍경: 붓으로 그려지는 한옥과 이를 감싸는 일필휘지 원, 그 아래로 흐르는 파도 */}
        <div className="relative flex flex-1 items-center">
          <div
            className="jf-rise relative w-full max-w-lg"
            style={{ animationDelay: '0.2s' }}
            role="img"
            aria-label="파도가 한옥을 감싸며 흐르는 붓그림"
          >
            <svg viewBox="0 0 520 300" fill="none" className="w-full">
              <defs>
                {/* 파도 채움을 아래로 갈수록 투명하게 — 판 하단의 딱딱한 절단면 제거 */}
                <linearGradient id="jf-wf-a" x1="0" y1="190" x2="0" y2="300" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="rgba(123,164,199,0.22)" />
                  <stop offset="1" stopColor="rgba(123,164,199,0)" />
                </linearGradient>
                <linearGradient id="jf-wf-b" x1="0" y1="208" x2="0" y2="300" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="rgba(84,136,180,0.3)" />
                  <stop offset="1" stopColor="rgba(84,136,180,0)" />
                </linearGradient>
                <linearGradient id="jf-wf-c" x1="0" y1="228" x2="0" y2="300" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="rgba(44,95,143,0.4)" />
                  <stop offset="1" stopColor="rgba(44,95,143,0.04)" />
                </linearGradient>
              </defs>

              {/* 집을 감싸는 붓 원 (열린 원 — 일필휘지). 살짝 기울여 손맛을 준다 */}
              <path
                className="jf-draw"
                style={{ animationDelay: '0.15s' }}
                d="M148,224 A146 146 0 1 1 372,232"
                stroke="#2f6ba1"
                strokeOpacity="0.35"
                strokeWidth="5"
                strokeLinecap="round"
                pathLength={1}
                transform="rotate(-8 260 146)"
              />

              {/* 한옥: 지붕은 수묵화처럼 한 덩어리 먹면 — 외곽선이 먼저 그려지고 먹이 스며든다 */}
              <path
                className="jf-draw jf-roof-fill"
                style={{ animationDelay: '0.4s' }}
                pathLength={1}
                strokeWidth="2.5"
                stroke="#1e3a56"
                strokeLinecap="round"
                fill="#1e3a56"
                d="M148,110 C200,136 320,136 372,110 C355,102 330,94 310,86 C285,79 235,79 210,86 C190,94 165,102 148,110 Z"
              />
              <g stroke="#1e3a56" strokeLinecap="round">
                <path className="jf-draw" style={{ animationDelay: '0.9s' }} pathLength={1} strokeWidth="4"
                  d="M200,140 L196,196" />
                <path className="jf-draw" style={{ animationDelay: '0.9s' }} pathLength={1} strokeWidth="4"
                  d="M320,140 L324,196" />
                <path className="jf-draw" style={{ animationDelay: '1.05s' }} pathLength={1} strokeWidth="6"
                  d="M170,200 L350,200" />
                <path className="jf-draw" style={{ animationDelay: '1.2s' }} pathLength={1} strokeWidth="3"
                  d="M244,196 L244,162 L276,162 L276,196" />
              </g>

              {/* 파도 3겹 — 속도가 다른 패럴랙스, 앞 파도가 기단을 덮어 집을 감싼다 */}
              <g className="jf-wavefade">
                <g className="jf-wave jf-wave-a">
                  <path d={wavePath(206, 16, true)} fill="url(#jf-wf-a)" />
                  <path d={wavePath(206, 16, false)} stroke="rgba(60,110,155,0.35)" strokeWidth="2" strokeLinecap="round" />
                </g>
                <g className="jf-wave jf-wave-b">
                  <path d={wavePath(228, 20, true)} fill="url(#jf-wf-b)" />
                  <path d={wavePath(228, 20, false)} stroke="rgba(44,95,143,0.45)" strokeWidth="2.5" strokeLinecap="round" />
                </g>
                <g className="jf-wave jf-wave-c">
                  <path d={wavePath(252, 24, true)} fill="url(#jf-wf-c)" />
                  <path d={wavePath(252, 24, false)} stroke="rgba(30,70,110,0.6)" strokeWidth="3" strokeLinecap="round" />
                  {/* 물마루 위 소용돌이 파도문 */}
                  {CURL_XS.map((x) => (
                    <path
                      key={x}
                      d={`M${x + 10},242 c-8,-10 -22,-7 -19,4 c2,8 13,8 15,1`}
                      stroke="rgba(30,70,110,0.5)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  ))}
                </g>
              </g>
            </svg>
          </div>
        </div>

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
          <SignIn signUpUrl="/register" forceRedirectUrl="/" fallbackRedirectUrl="/" />
        </div>

        <footer className="text-center text-[11px] text-muted-foreground sm:text-left">
          <span>© 2026 Estait Inc.</span>
        </footer>
      </section>
    </main>
  );
}

/* 로그인 aside 전용 스타일 — 청화백자 팔레트(흰 바탕 + 코발트 청), 붓그림 모션.
   애니메이션은 전부 CSS라 prefers-reduced-motion 미디어 쿼리만으로 정지된다. */
const loginAsideCss = `
.jf-aside {
  background: linear-gradient(180deg, #fbfdff 0%, #eef5fb 62%, #e3eef8 100%);
}
.jf-grain {
  background-image: radial-gradient(rgba(47, 107, 161, 0.5) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.045;
  mask-image: linear-gradient(to bottom, transparent, black 15%, black 85%, transparent);
  pointer-events: none;
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

/* 붓으로 그려지는 획 — pathLength=1 트릭으로 균일한 드로잉 */
.jf-draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: jf-draw 1.1s ease forwards;
}
@keyframes jf-draw { to { stroke-dashoffset: 0; } }

/* 지붕 먹면: 외곽선이 그려진 뒤 먹이 스며들 듯 채워진다 */
.jf-roof-fill {
  fill-opacity: 0;
  animation: jf-draw 1.1s ease forwards, jf-ink 0.9s ease 1.15s forwards;
}
@keyframes jf-ink { to { fill-opacity: 0.92; } }

/* 파도: 4주기 중 2주기(520px)만큼 밀면 처음과 동일 → 무한 순환 */
.jf-wavefade {
  opacity: 0;
  animation: jf-fade 1.2s ease 0.9s forwards;
}
@keyframes jf-fade { to { opacity: 1; } }
.jf-wave-a { animation: jf-flow-x 16s linear infinite; }
.jf-wave-b { animation: jf-flow-x 10s linear infinite; }
.jf-wave-c { animation: jf-flow-x 7s linear infinite; }
@keyframes jf-flow-x { to { transform: translateX(-520px); } }

.jf-chip {
  border: 1px solid rgba(44, 95, 143, 0.22);
  background: rgba(91, 141, 184, 0.08);
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}
.jf-chip:hover {
  border-color: rgba(44, 95, 143, 0.45);
  background: rgba(91, 141, 184, 0.15);
  transform: translateY(-1px);
}

@media (prefers-reduced-motion: reduce) {
  .jf-rise, .jf-wavefade { opacity: 1; animation: none; }
  .jf-draw { animation: none; stroke-dashoffset: 0; }
  .jf-roof-fill { animation: none; stroke-dashoffset: 0; fill-opacity: 0.92; }
  .jf-wave, .jf-flow-underline path { animation: none; }
}
`;
