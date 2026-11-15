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
  // Native content tabs also use SplashScreen for brief loads. They need the
  // same identity, without constructing a WebGL scene for each tab.
  const animated = getRendererSurface().kind !== "native-tab";

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
