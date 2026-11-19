import { useIsMutating } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { NativeTabRetentionUpdate } from '../../../../common/nativeTabs';
import {
  ACTIVE_TRANSFER_SELECTOR,
  EXPLICIT_DIRTY_SELECTOR,
  TRANSIENT_EDITOR_SELECTOR,
} from '../lib/unsavedWork';

interface RetentionSignals {
  transientEditor: boolean;
  explicitDirty: boolean;
  /** 파일을 올리는 중 (탭 닫기를 막는다) */
  transferring?: boolean;
}

export function createNativeTabRetentionUpdate(
  pendingMutations: number,
  signals: RetentionSignals,
  viewState?: NativeTabRetentionUpdate['viewState'],
): NativeTabRetentionUpdate {
  const mutating = pendingMutations > 0;
  const { transientEditor, explicitDirty } = signals;
  const transferring = signals.transferring === true;
  return {
    schemaVersion: 1,
    protected: mutating || transientEditor || explicitDirty || transferring,
    ...(viewState ? { viewState } : {}),
    // 올리는 중이 아닐 때는 칸을 넣지 않는다 (보고 내용이 예전과 똑같이 유지된다)
    reasons: { mutating, transientEditor, explicitDirty, ...(transferring ? { transferring } : {}) },
  };
}

function readRetentionSignals(): RetentionSignals {
  return {
    transientEditor: Boolean(
      document.querySelector(TRANSIENT_EDITOR_SELECTOR),
    ),
    explicitDirty: Boolean(document.querySelector(EXPLICIT_DIRTY_SELECTOR)),
    transferring: Boolean(document.querySelector(ACTIVE_TRANSFER_SELECTOR)),
  };
}

function getScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-window-shell="native-tab"]',
  );
}

function readScrollTop(): number {
  const container = getScrollContainer();
  return Math.max(
    0,
    Math.round(container ? container.scrollTop : window.scrollY),
  );
}

/**
 * Reports whether a live native tab can be safely discarded under memory
 * pressure. The main process treats a newly-created renderer as protected
 * until this component publishes its first clean snapshot.
 */
export function NativeTabRetentionReporter() {
  const pendingMutations = useIsMutating();
  const lastPublishedRef = useRef<string | null>(null);
  const [viewStateReady, setViewStateReady] = useState(false);
  const [signals, setSignals] = useState<RetentionSignals>(() =>
    readRetentionSignals(),
  );

  useEffect(() => {
    const getSnapshot = window.electronBridge?.tabs.getNativeTabSnapshot;
    if (!getSnapshot) {
      setViewStateReady(true);
      return;
    }

    let cancelled = false;
    let timedOut = false;
    let restoreTimer: number | null = null;
    const fallbackTimer = window.setTimeout(() => {
      timedOut = true;
      if (!cancelled) setViewStateReady(true);
    }, 5_000);
    let attempt = 0;
    const retryDelays = [50, 150, 400, 1_000, 2_000];

    void getSnapshot().then(
      (snapshot) => {
        if (cancelled || timedOut) return;
        const scrollY = snapshot?.uiState?.scrollY;

        const tryRestore = () => {
          if (cancelled || timedOut) return;
          const container = getScrollContainer();
          if (container && typeof scrollY === 'number' && scrollY > 0) {
            container.scrollTop = scrollY;
          }
          const restored =
            typeof scrollY !== 'number' ||
            scrollY <= 0 ||
            Boolean(container && Math.abs(container.scrollTop - scrollY) <= 1);
          if (restored || attempt >= retryDelays.length) {
            window.clearTimeout(fallbackTimer);
            setViewStateReady(true);
            return;
          }
          restoreTimer = window.setTimeout(
            tryRestore,
            retryDelays[attempt++],
          );
        };

        // Wait until the route has rendered before trying the real scroll
        // container; the initial query skeleton can be shorter than scrollY.
        restoreTimer = window.setTimeout(tryRestore, retryDelays[attempt++]);
      },
      () => {
        window.clearTimeout(fallbackTimer);
        if (!cancelled) setViewStateReady(true);
      },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      if (restoreTimer !== null) window.clearTimeout(restoreTimer);
    };
  }, []);

  useEffect(() => {
    let scheduledFrame: number | null = null;
    let scheduledTimer: number | null = null;
    const read = () => {
      if (scheduledFrame !== null) window.cancelAnimationFrame(scheduledFrame);
      if (scheduledTimer !== null) window.clearTimeout(scheduledTimer);
      scheduledFrame = null;
      scheduledTimer = null;
      const next = readRetentionSignals();
      setSignals((current) =>
        current.transientEditor === next.transientEditor &&
        current.explicitDirty === next.explicitDirty &&
        current.transferring === next.transferring
          ? current
          : next,
      );
    };
    const refresh = () => {
      if (scheduledFrame !== null || scheduledTimer !== null) return;
      scheduledFrame = window.requestAnimationFrame(read);
      // 화면에 보이지 않는 탭에서는 애니메이션 프레임이 돌지 않는다. 뒤에 있는 탭에서 올리기가
      // 끝났는데 "올리는 중"이 풀리지 않으면 그 탭을 닫을 수 없게 된다 — 타이머로도 읽는다
      // (보이지 않는 탭의 타이머는 느려질 뿐 멈추지 않는다). 먼저 도는 쪽이 읽고 다른 쪽은 취소한다.
      scheduledTimer = window.setTimeout(read, 250);
    };
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'data-state',
        'data-native-tab-discard-blocker',
        'data-native-tab-dirty',
        'data-native-tab-transfer',
      ],
    });
    refresh();
    return () => {
      observer.disconnect();
      if (scheduledFrame !== null) window.cancelAnimationFrame(scheduledFrame);
      if (scheduledTimer !== null) window.clearTimeout(scheduledTimer);
    };
  }, []);

  useEffect(() => {
    // Keep the main process's fail-safe `unreported` pin until restoration is
    // complete; otherwise a fast tab switch could discard this renderer while
    // its state is still being applied.
    if (!viewStateReady) return;
    const publish = (force = false) => {
      const update = createNativeTabRetentionUpdate(
        pendingMutations,
        signals,
        {
          scrollY: readScrollTop(),
        },
      );
      const fingerprint = JSON.stringify(update);
      if (!force && fingerprint === lastPublishedRef.current) return;
      lastPublishedRef.current = fingerprint;
      window.electronBridge?.tabs.setRetention?.(update);
    };
    publish();
    let scheduledTimer: number | null = null;
    const onScroll = () => {
      if (scheduledTimer !== null) window.clearTimeout(scheduledTimer);
      scheduledTimer = window.setTimeout(() => {
        scheduledTimer = null;
        publish();
      }, 250);
    };
    const scrollTarget = getScrollContainer() ?? window;
    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    const flush = () => publish(true);
    window.addEventListener('pagehide', flush);
    return () => {
      scrollTarget.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', flush);
      if (scheduledTimer !== null) window.clearTimeout(scheduledTimer);
    };
  }, [pendingMutations, signals, viewStateReady]);

  return null;
}
