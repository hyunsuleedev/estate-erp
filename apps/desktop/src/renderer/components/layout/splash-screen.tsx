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
import type { ApartmentScene } from "./splash/apartment-scene";
import "./splash/splash.css";

const LoadingContext = createContext<(() => () => void) | null>(null);
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
  // same identity, without constructing another WebGL scene for each tab.
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
  const scene = useRef<ApartmentScene | null>(null);
  const finishing = useRef(false);
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
    if (!animated || reduced) return;
    let active = true;
    setAnimationComplete(false);
    setFailed(false);
    // Three.js stays out of the login/dashboard entry chunk.
    void import("./splash/apartment-scene")
      .then(({ createApartmentScene }) => {
        if (!active || finishing.current || !host.current || !wordmark.current)
          return;
        try {
          scene.current = createApartmentScene(
            host.current,
            wordmark.current,
            () => {
              if (active) setFailed(true);
            },
            () => {
              if (active) setAnimationComplete(true);
            },
          );
          setRendered(true);
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
  }, [animated, reduced]);

  // App readiness and visual playback are independent. A fast login response
  // must not skip the apartment → plan → logo sequence. Static fallbacks have
  // no timeline to wait for.
  const playbackComplete = !animated || reduced || failed || animationComplete;

  useEffect(() => {
    let handoff: ReturnType<typeof setTimeout> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let exit: ReturnType<typeof setTimeout> | undefined;
    finishing.current = false;
    setPhase("loading");
    if (loading) scene.current?.resume();
    if (!loading && playbackComplete) {
      // Let redirects register their guards, including in hidden Electron
      // windows where requestAnimationFrame is suspended.
      handoff = setTimeout(() => {
        finishing.current = true;
        scene.current?.pause();
        setPhase("completing");
        settle = setTimeout(
          () => {
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

  const staticLogo =
    !animated || reduced || failed || !rendered || phase !== "loading";
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
