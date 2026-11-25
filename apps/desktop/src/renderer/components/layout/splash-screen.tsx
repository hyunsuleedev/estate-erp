import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getRendererSurface } from "@/features/tabs/native/rendererSurface";
import type { SplashScene } from "./splash/complex-scene";
import "./splash/splash.css";

const LoadingContext = createContext<(() => () => void) | null>(null);
// 단지가 올라가는 장면은 앱을 켠 뒤 처음 한 번만 보여 준다. 그 뒤의 로그인 전환이나
// 사무소 준비처럼 다시 뜨는 스플래시는 로고만 띄워 기다림을 늘리지 않는다.
// 로그아웃하면 main이 이 문서를 다시 불러오므로, 재생 여부는 문서보다 오래가는
// sessionStorage(같은 창 안에서 유지)에도 남긴다. 나중에 여는 다른 창은 main이
// 붙여 주는 표시(isLaunchWindow)가 없어 재생하지 않는다.
const INTRO_KEY = "estate:splash-intro-played";
let introPlayed = false;
function introAvailable() {
  if (introPlayed) return false;
  // 브라우저 미리보기에는 bridge가 없다. 그때는 창 구분 없이 한 번 보여 준다.
  const bridge = window.electronBridge;
  if (bridge && bridge.isLaunchWindow !== true) return false;
  try {
    return window.sessionStorage.getItem(INTRO_KEY) === null;
  } catch {
    return true;
  }
}
function markIntroPlayed() {
  introPlayed = true;
  try {
    window.sessionStorage.setItem(INTRO_KEY, "1");
  } catch {
    // 저장소를 쓸 수 없으면 이 문서 안에서만 기억한다.
  }
}
/** 검토용 화면에서 처음 상태로 되돌린다. */
export function resetSplashIntro() {
  introPlayed = false;
  try {
    window.sessionStorage.removeItem(INTRO_KEY);
  } catch {
    // 위와 같다.
  }
}
const logoPath =
  "M19.142 32.872 25.370 77.037 65.571 81 63.306 65.995 41.224 63.164 36.977 35.420Z M35.845 19 38.110 34.005 60.758 37.402 64.721 64.580 80.858 66.562 74.347 24.096Z";

/** Keeps one splash mounted while auth and route/workspace loading hand off. */
export function SplashBoundary({ children }: { children: ReactNode }) {
  const blockers = useRef(new Set<symbol>());
  const [count, setCount] = useState(0);
  const [visible, setVisible] = useState(true);
  const register = useCallback(() => {
    const id = Symbol("loading");
    blockers.current.add(id);
    setCount(blockers.current.size);
    setVisible(true);
    return () => {
      blockers.current.delete(id);
      setCount(blockers.current.size);
    };
  }, []);
  const finished = useCallback(() => {
    if (blockers.current.size === 0) setVisible(false);
  }, []);
  const show = visible || count > 0;
  const isNativeTab = getRendererSurface().kind === "native-tab";
  // 창의 시작 화면만 장면을 그린다. 탭 화면은 아래에서 따로 처리한다.
  const animated = !isNativeTab;

  if (isNativeTab) {
    // 탭 화면은 이미 켜진 앱 안에서 열린다. "시작하고 있습니다" 화면을 다시 보여 줄 이유가 없다.
    // 준비되는 동안에는 앱의 틀(사이드바 자리와 빈 본문)을 그려 두고, 준비되면 기다림 없이 바로 내용을 보인다.
    // 전에는 여기서도 시작 화면을 띄우고 사라지는 순서(약 0.5초)를 다 밟아서, 내용이 0.3초에 준비돼도
    // 0.8초가 지나야 쓸 수 있었다(2026-11-22 실제 창에서 잼). 데이터는 각 화면이 불러오는 대로 채운다.
    return (
      <LoadingContext.Provider value={register}>
        {children}
        {count > 0 && <TabShellSkeleton />}
      </LoadingContext.Provider>
    );
  }

  return (
    <LoadingContext.Provider value={register}>
      <div inert={show || undefined} aria-hidden={show || undefined}>
        {children}
      </div>
      {show && (
        <SplashVisual
          loading={count > 0}
          animated={animated}
          onFinished={finished}
        />
      )}
    </LoadingContext.Provider>
  );
}

/**
 * 탭 화면이 준비되는 동안 보이는 앱의 틀. 실제 화면과 같은 자리에 사이드바와 본문을 비워 그린다.
 * 사이드바를 접어 둔 사람에게는 잠깐 펼친 모양으로 보이지만, 준비되면 곧바로 실제 상태로 바뀐다.
 */
function TabShellSkeleton() {
  const line = "h-3 rounded bg-black/[0.06]";
  return (
    <div
      className="fixed inset-0 z-40 flex bg-background"
      data-testid="tab-shell-skeleton"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">화면을 불러오는 중입니다.</span>
      <div
        aria-hidden="true"
        className="flex w-64 shrink-0 flex-col gap-3 border-r border-sidebar-border bg-sidebar px-4 pt-5"
      >
        <div className={`${line} w-24`} />
        <div className="mt-4 flex flex-col gap-3">
          {["w-28", "w-24", "w-32", "w-20", "w-28", "w-24", "w-32", "w-20"].map((width, index) => (
            <div key={index} className={`${line} ${width}`} />
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[50px] items-center gap-3 border-b border-[#f0efed] px-4">
          <div className={`${line} w-40`} />
          <div className={`${line} w-16`} />
        </div>
        <div className="flex flex-col gap-4 px-6 pt-6">
          {["w-1/2", "w-2/3", "w-1/3", "w-3/5"].map((width, index) => (
            <div key={index} className={`${line} ${width}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Existing route guards report loading to the persistent boundary. */
export function SplashScreen() {
  const register = useContext(LoadingContext);
  useLayoutEffect(() => register?.(), [register]);
  return register ? null : <SplashVisual loading animated />;
}

function SplashVisual({
  loading,
  animated,
  onFinished,
}: {
  loading: boolean;
  animated: boolean;
  onFinished?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const wordmark = useRef<HTMLDivElement>(null);
  const scene = useRef<SplashScene | null>(null);
  const finishing = useRef(false);
  const loadingNow = useRef(loading);
  loadingNow.current = loading;
  // 이 스플래시가 뜬 시점에 아직 장면을 보여 준 적이 없을 때만 재생한다.
  const [intro] = useState(() => animated && introAvailable());
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [phase, setPhase] = useState<"loading" | "completing" | "leaving">(
    "loading",
  );
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);

  useEffect(() => {
    if (!intro || reduced) return;
    let active = true;
    setAnimationComplete(false);
    setFailed(false);
    // Three.js stays out of the login/dashboard entry chunk.
    void import("./splash/complex-scene")
      .then(({ createComplexScene }) => {
        if (!active || finishing.current || !host.current || !wordmark.current)
          return;
        try {
          scene.current = createComplexScene(host.current, wordmark.current, {
            onError: () => {
              if (active) setFailed(true);
            },
            // 셰이더 준비가 끝날 때까지는 정적인 로고를 보여 준다.
            onReady: () => {
              if (!active) return;
              // 화면에 나오기 시작하면 본 것으로 친다. 도중에 문서가 바뀌어도 다시 틀지 않는다.
              markIntroPlayed();
              setRendered(true);
            },
            onComplete: () => {
              if (active) setAnimationComplete(true);
            },
          });
          // 장면이 준비되기 전에 앱이 먼저 준비됐으면 처음부터 빠르게 넘긴다.
          if (!loadingNow.current) scene.current.hurry();
        } catch {
          if (active) setFailed(true);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      scene.current?.dispose();
      scene.current = null;
      setRendered(false);
    };
  }, [intro, reduced]);

  // App readiness and visual playback are independent. A fast login response
  // does not cut the first-launch scene short; it only speeds up what is left.
  // Static fallbacks have no timeline to wait for.
  const playbackComplete = !intro || reduced || failed || animationComplete;

  useEffect(() => {
    let handoff: ReturnType<typeof setTimeout> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let exit: ReturnType<typeof setTimeout> | undefined;
    finishing.current = false;
    setPhase("loading");
    if (loading) scene.current?.resume();
    else scene.current?.hurry();
    if (!loading && playbackComplete) {
      // Let redirects register their guards, including in hidden Electron
      // windows where requestAnimationFrame is suspended.
      handoff = setTimeout(() => {
        finishing.current = true;
        scene.current?.pause();
        setPhase("completing");
        settle = setTimeout(
          () => {
            markIntroPlayed();
            setPhase("leaving");
            exit = setTimeout(() => onFinished?.(), reduced ? 0 : 180);
          },
          reduced ? 0 : 280,
        );
      }, 32);
    }
    return () => {
      clearTimeout(handoff);
      clearTimeout(settle);
      clearTimeout(exit);
    };
  }, [loading, onFinished, reduced, playbackComplete]);

  // 완공된 뒤에도 앱이 아직 준비 중이면 로고로 돌아가 기다린다.
  const staticLogo =
    !intro ||
    reduced ||
    failed ||
    !rendered ||
    animationComplete ||
    phase !== "loading";
  return (
    <main
      className={`estate-splash${staticLogo ? " estate-splash--static" : ""}`}
      data-state={phase}
      data-testid="app-splash"
      aria-label="에스테잇플로우"
      aria-busy={loading}
    >
      <div className="estate-splash__scene" ref={host}>
        <div className="estate-splash__logo" aria-hidden="true">
          <svg viewBox="15 15 70 70">
            <path d={logoPath} />
          </svg>
        </div>
        <div className="estate-splash__wordmark" ref={wordmark}>
          <strong>에스테잇플로우</strong>
        </div>
      </div>
      <div className="estate-splash__loading" aria-hidden="true">
        <span />
      </div>
      <span className="estate-splash__status" role="status">
        {loading ? "에스테잇플로우를 시작하고 있습니다." : "준비되었습니다."}
      </span>
    </main>
  );
}
