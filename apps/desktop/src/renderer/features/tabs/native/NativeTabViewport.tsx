import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Tab } from '@estate-erp/shared';
import {
  normalizeNativeTabViewportBounds,
  resolveNativeTabRoute,
  type NativeTabLifecycleUpdate,
  type NativeTabViewportBounds,
  type NativeTabViewportPayload,
  type NativeTabViewportReleasePayload,
  type NativeTabViewportResult,
} from '../../../../common/nativeTabs';
import { useTabStore } from '../store/useTabStore';
import { getRendererSurface } from './rendererSurface';
import { getRouteMeta } from '../lib/routeMeta';
import { resolveTabResourceKey } from '../lib/tabResource';

export interface NativeTabViewportAdapter {
  sync(payload: NativeTabViewportPayload): Promise<NativeTabViewportResult>;
}

type NativeViewportBridge = {
  tabs?: {
    syncNativeViewport?: (
      payload: NativeTabViewportPayload,
    ) => Promise<NativeTabViewportResult>;
    releaseNativeViewport?: (payload: NativeTabViewportReleasePayload) => void;
    onNativeTabLifecycle?: (
      callback: (update: NativeTabLifecycleUpdate) => void,
    ) => () => void;
    onNativeTabSnapshot?: (callback: (tab: Tab) => void) => () => void;
  };
};

export type NativeTabViewportState = 'legacy' | 'mounting' | 'native';

interface NativeTabViewportFrameProps {
  children: ReactNode;
  className?: string;
  state: NativeTabViewportState;
  renderFallback?: boolean;
}

export const NativeTabViewportFrame = forwardRef<
  HTMLDivElement,
  NativeTabViewportFrameProps
>(function NativeTabViewportFrame(
  { children, className, state, renderFallback = state !== 'native' },
  ref,
) {
  const classes = ['relative flex min-h-0 min-w-0 flex-1 flex-col', className]
    .filter(Boolean)
    .join(' ');
  const nativeMounted = state === 'native';

  return (
    <div ref={ref} className={classes} data-native-tab-state={state}>
      <div
        className={
          nativeMounted
            ? 'flex min-h-0 min-w-0 flex-1 flex-col invisible pointer-events-none'
            : 'flex min-h-0 min-w-0 flex-1 flex-col'
        }
        aria-hidden={nativeMounted || undefined}
        data-native-tab-legacy-fallback=""
      >
        {renderFallback ? children : null}
      </div>
    </div>
  );
});

function resolveElectronAdapter(): NativeTabViewportAdapter | null {
  if (typeof window === 'undefined') return null;
  if (getRendererSurface().kind !== 'window-shell') return null;

  const bridge = window.electronBridge as unknown as NativeViewportBridge;
  const syncNativeViewport = bridge?.tabs?.syncNativeViewport;
  if (!syncNativeViewport) return null;

  return {
    sync: (payload) => syncNativeViewport(payload),
  };
}

function activeNativeTab(tab: Tab | null): Tab | null {
  return tab && resolveNativeTabRoute(tab.route) ? tab : null;
}

interface NativeTabViewportProps {
  /** 기존 TabContent. native attach 실패 시 그대로 사용자에게 남는다. */
  children: ReactNode;
  className?: string;
  /** 테스트와 web fallback용 adapter seam. undefined면 Electron bridge를 탐색한다. */
  adapter?: NativeTabViewportAdapter | null;
  /** 이미 live WCV가 이동해 오는 detached shell은 첫 attach 동안 중복 Outlet을 띄우지 않는다. */
  deferNativeFallback?: boolean;
  suspended?: boolean;
}

export function NativeTabViewport({
  adapter: adapterProp,
  children,
  className,
  deferNativeFallback = false,
  suspended = false,
}: NativeTabViewportProps) {
  const latestLeaseIdRef = useRef<string | null>(null);
  const tabs = useTabStore((state) => state.tabs);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const desiredNativeTab = activeNativeTab(activeTab);
  const nativeTab = desiredNativeTab;
  const nativeTabIdsSignature = JSON.stringify(
    tabs
      .filter((tab) => resolveNativeTabRoute(tab.route))
      .map((tab) => tab.id),
  );
  // uiState-only reports replace the Zustand tabs array. Rehydrate the ids
  // from their primitive signature so those reports cannot retrigger the
  // native viewport/open IPC when membership itself did not change.
  const nativeTabIds = useMemo<string[]>(
    () => JSON.parse(nativeTabIdsSignature) as string[],
    [nativeTabIdsSignature],
  );
  const adapter = useMemo(
    () => (adapterProp === undefined ? resolveElectronAdapter() : adapterProp),
    [adapterProp],
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const requestSequenceRef = useRef(0);
  const lastBoundsRef = useRef<NativeTabViewportBounds | null>(null);
  const [bounds, setBounds] = useState<NativeTabViewportBounds | null>(null);
  const [mountedTabId, setMountedTabId] = useState<string | null>(null);
  const [failedTabId, setFailedTabId] = useState<string | null>(null);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const recoveryAttemptsRef = useRef(new Map<string, number>());

  useEffect(() => {
    const subscribe = window.electronBridge?.tabs.onNativeTabState;
    if (!subscribe) return;
    return subscribe(({ tabId, route, title }) => {
      const store = useTabStore.getState();
      const tab = store.tabs.find((candidate) => candidate.id === tabId);
      if (!tab || tab.route === route) return;
      const meta = getRouteMeta(route);
      const nextResourceKey = resolveTabResourceKey(route, tabId);
      const keepsCustomTitle =
        tab.resourceKey === nextResourceKey &&
        tab.title !== '...' &&
        tab.title !== getRouteMeta(tab.route).title;
      store.updateNativeTabLocation(
        tabId,
        route,
        meta.kind,
        title ?? (keepsCustomTitle ? tab.title : meta.title),
      );
    });
  }, []);

  useEffect(() => {
    const subscribe = (window.electronBridge as unknown as NativeViewportBridge)
      ?.tabs?.onNativeTabSnapshot;
    if (!subscribe) return;
    return subscribe((tab) => {
      useTabStore.getState().updateNativeTabSnapshot(tab);
    });
  }, []);

  useEffect(() => {
    const subscribe = (window.electronBridge as unknown as NativeViewportBridge)
      ?.tabs?.onNativeTabLifecycle;
    if (!subscribe) return;
    return subscribe(({ tabId, status }) => {
      if (status !== 'renderer-failed') return;
      const attempts = recoveryAttemptsRef.current.get(tabId) ?? 0;
      setMountedTabId((current) => (current === tabId ? null : current));
      setFailedTabId(tabId);
      // Crash loop에서는 legacy fallback을 유지한다. 한 번의 renderer 재생성만
      // 자동 시도하고 이후에는 사용자의 route/tab 전환이 복구 경계가 된다.
      if (attempts >= 1) return;
      recoveryAttemptsRef.current.set(tabId, attempts + 1);
      setRecoveryRevision((revision) => revision + 1);
    });
  }, []);

  const measure = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;

    const nextBounds = normalizeNativeTabViewportBounds(
      element.getBoundingClientRect(),
    );
    lastBoundsRef.current = nextBounds;
    setBounds((current) =>
      current &&
      current.x === nextBounds.x &&
      current.y === nextBounds.y &&
      current.width === nextBounds.width &&
      current.height === nextBounds.height
        ? current
        : nextBounds,
    );
  }, []);

  useEffect(() => {
    measure();
    const element = viewportRef.current;
    if (!element) return;

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    resizeObserver?.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  useEffect(() => {
    // Main keeps the live view hidden while an OS-level overlay is above it.
    // Preserve the mounted identity and avoid issuing a stale active/null sync;
    // the next non-suspended render performs the authoritative resync.
    if (suspended) return;
    if (!adapter || !bounds || bounds.width === 0 || bounds.height === 0) {
      setMountedTabId(null);
      return;
    }

    const sequence = ++requestSequenceRef.current;
    const leaseId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `native_viewport_${Date.now()}_${sequence}_${Math.random().toString(36).slice(2)}`;
    latestLeaseIdRef.current = leaseId;
    if (!nativeTab) setMountedTabId(null);
    void adapter
      .sync({
        schemaVersion: 1,
        leaseId,
        nativeTabIds,
        activeTab: nativeTab,
        bounds,
      })
      .then((result) => {
        if (sequence !== requestSequenceRef.current) return;
        if (result.ok) {
          setMountedTabId(result.mountedTabId);
          setFailedTabId(null);
        } else {
          setMountedTabId(null);
          if (nativeTab) setFailedTabId(nativeTab.id);
        }
      })
      .catch(() => {
        if (sequence !== requestSequenceRef.current) return;
        setMountedTabId(null);
        if (nativeTab) setFailedTabId(nativeTab.id);
      });
  }, [
    adapter,
    bounds,
    nativeTab?.id,
    nativeTab?.route,
    nativeTabIds,
    recoveryRevision,
    suspended,
  ]);

  const mountedNativeTabIdsRef = useRef<string[]>([]);
  mountedNativeTabIdsRef.current = nativeTabIds;

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
      const release = (window.electronBridge as unknown as NativeViewportBridge)
        ?.tabs?.releaseNativeViewport;
      const leaseId = latestLeaseIdRef.current;
      if (!release || !leaseId) return;
      release({
        schemaVersion: 1,
        leaseId,
        nativeTabIds: mountedNativeTabIdsRef.current,
      });
    },
    [],
  );

  const nativeMountFailed = Boolean(nativeTab && failedTabId === nativeTab.id);
  const nativeOverlaySuspended = suspended && desiredNativeTab !== null;
  const state: NativeTabViewportState =
    nativeOverlaySuspended
      ? 'mounting'
      : !nativeTab || !adapter || nativeMountFailed
      ? 'legacy'
      : mountedTabId === nativeTab.id
        ? 'native'
        : 'mounting';

  return (
    <NativeTabViewportFrame
      ref={viewportRef}
      className={className}
      state={state}
      renderFallback={
        !nativeOverlaySuspended &&
        (state === 'legacy' || (state === 'mounting' && !deferNativeFallback))
      }
    >
      {children}
    </NativeTabViewportFrame>
  );
}
