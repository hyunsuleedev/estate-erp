import { useCallback, useEffect, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import type { Tab } from '@estate-erp/shared';
import { useTabStore } from '../store/useTabStore';
import { isNativeTabRoute } from '../../../../common/nativeTabs';

/**
 * 작은 임계값(수직 8px). 이 거리를 넘기면 즉시 detach 새 창 생성.
 * 그 이후엔 새 창이 마우스를 따라다니며 사용자가 떼면 그 자리에 정착.
 */
const DETACH_THRESHOLD = 8;

interface DragSession {
  tabId: string;
  transferId: string;
  pointerId: number;
  /** 마우스가 탭 좌측 상단으로부터 떨어진 offset */
  mouseOffset: { x: number; y: number };
  /** 새 창 생성 완료(beginDrag IPC가 resolve)되었는지 */
  detached: boolean;
}

interface PendingDetach {
  tabId: string;
  transferId: string;
  targetReady: boolean;
  pointerReleased: boolean;
  committing: boolean;
}

const COMMIT_RETRY_DELAYS_MS = [0, 100, 250, 500, 1_000] as const;

function waitForRetry(delayMs: number): Promise<void> {
  if (delayMs === 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function tabSnapshotFingerprint(tab: Tab): string {
  return JSON.stringify(tab);
}

function createTransferId(): string {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `transfer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function clientToScreen(
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  return {
    x: window.screenX + clientX,
    y: window.screenY + clientY,
  };
}

export function useDetachDrag(
  tabBarRef: React.RefObject<HTMLDivElement | null>,
) {
  const removeTabById = useTabStore((s) => s.removeTabById);
  const lockTabForTransfer = useTabStore((s) => s.lockTabForTransfer);
  const unlockTabForTransfer = useTabStore((s) => s.unlockTabForTransfer);
  const mutationCount = useIsMutating();
  const mutationCountRef = useRef(mutationCount);
  mutationCountRef.current = mutationCount;
  const pendingDetachesRef = useRef(new Map<string, PendingDetach>());

  const finalizeTransfer = useCallback(
    async (transferId: string) => {
      const pending = pendingDetachesRef.current.get(transferId);
      const tabsBridge = window.electronBridge?.tabs;
      if (
        !pending ||
        !tabsBridge ||
        !pending.targetReady ||
        !pending.pointerReleased ||
        pending.committing
      ) {
        return;
      }

      pending.committing = true;
      try {
        // target ACK와 실제 pointer release가 모두 확인된 뒤 ownership을 commit한다.
        // IPC 응답만 유실된 경우 main의 committed record가 idempotent하게 true를
        // 돌려주므로 짧게 재시도한다. source는 성공 응답 전에는 절대 삭제하지 않는다.
        let lastError: unknown;
        for (
          let stabilizationAttempt = 0;
          stabilizationAttempt < 3;
          stabilizationAttempt += 1
        ) {
          const latestTab = useTabStore
            .getState()
            .tabs.find((tab) => tab.id === pending.tabId);
          if (!latestTab) {
            console.error('[tabs] 이동할 source 탭을 찾지 못했습니다.');
            return;
          }
          const sentFingerprint = tabSnapshotFingerprint(latestTab);
          let preparedSuccessfully = false;

          for (const delayMs of COMMIT_RETRY_DELAYS_MS) {
            await waitForRetry(delayMs);
            try {
              const prepared = await tabsBridge.prepareTransferSnapshot({
                transferId,
                tab: latestTab,
              });
              if (!prepared.ok) {
                console.error(
                  '[tabs] 탭 최종 snapshot 준비에 실패했습니다:',
                  prepared.error,
                );
                pendingDetachesRef.current.delete(transferId);
                return;
              }
              preparedSuccessfully = true;
              break;
            } catch (error) {
              lastError = error;
            }
          }

          if (!preparedSuccessfully) break;
          const currentTab = useTabStore
            .getState()
            .tabs.find((tab) => tab.id === pending.tabId);
          if (
            currentTab &&
            tabSnapshotFingerprint(currentTab) !== sentFingerprint &&
            !isNativeTabRoute(currentTab.route)
          ) {
            // final ACK 대기 중 background mutation/prefill이 바뀌었다면 최신값으로
            // 한 번 더 target에 적용한 뒤 안정화된 snapshot만 이동 완료 처리한다.
            // native 탭은 main이 같은 live WebContents에서 commit 직전 최신 route를
            // 원자적으로 다시 읽으므로 renderer snapshot 재시도가 필요 없다.
            continue;
          }

          // prepare ACK 뒤 source가 그대로일 때만 ownership을 확정한다. target은
          // 이 commit 신호 전까지 Splash 상태라 T0 component effect가 실행되지 않는다.
          for (const delayMs of COMMIT_RETRY_DELAYS_MS) {
            await waitForRetry(delayMs);
            try {
              const committed = await tabsBridge.commitTransfer({
                transferId,
                tab: latestTab,
              });
              if (!committed.ok) {
                console.error(
                  '[tabs] 탭 이동 commit에 실패했습니다:',
                  committed.error,
                );
                pendingDetachesRef.current.delete(transferId);
                return;
              }
              removeTabById(pending.tabId);
              pendingDetachesRef.current.delete(transferId);
              return;
            } catch (error) {
              lastError = error;
            }
          }
          break;
        }
        console.error(
          '[tabs] 안정된 최종 탭 상태로 이동을 확정하지 못했습니다:',
          lastError,
        );
      } finally {
        // 성공 시 removeTabById가 lock도 함께 지운다. 실패 시에는 source가 다시
        // 정상적으로 편집 가능해야 하므로 여기서 잠금을 되돌린다.
        unlockTabForTransfer(pending.tabId);
        // 응답을 끝내 확인하지 못했다면 reservation을 유지해 같은 source 탭을
        // 또 분리하지 못하게 한다. source 탭도 유지되므로 데이터 유실은 없다.
        const current = pendingDetachesRef.current.get(transferId);
        if (current) current.committing = false;
      }
    },
    [removeTabById, unlockTabForTransfer],
  );

  const beginDrag = useCallback(
    async (
      tab: Tab,
      transferId: string,
      pointerScreen: { x: number; y: number },
      mouseOffset: { x: number; y: number },
    ) => {
      if (!window.electronBridge?.tabs) {
        pendingDetachesRef.current.delete(transferId);
        unlockTabForTransfer(tab.id);
        return;
      }
      try {
        const result = await window.electronBridge.tabs.beginDrag({
          transferId,
          tab,
          pointerScreen,
          mouseOffset,
        });
        if (!result.ok) {
          console.error('[tabs] 탭 분리 창을 만들지 못했습니다:', result.error);
          pendingDetachesRef.current.delete(transferId);
          unlockTabForTransfer(tab.id);
          return;
        }
        const pending = pendingDetachesRef.current.get(transferId);
        if (!pending) {
          unlockTabForTransfer(tab.id);
          return;
        }
        pending.targetReady = true;
        await finalizeTransfer(transferId);
      } catch (error) {
        pendingDetachesRef.current.delete(transferId);
        unlockTabForTransfer(tab.id);
        console.error('[tabs] 탭 분리 중 오류가 발생했습니다:', error);
      }
    },
    [finalizeTransfer, unlockTabForTransfer],
  );

  useEffect(() => {
    const tabBar = tabBarRef.current;
    if (!tabBar) return;

    let session: DragSession | null = null;

    /**
     * dnd-kit sortable이 자식 Tab에 listener를 걸기 때문에 element-level pointermove는
     * dnd-kit한테 빼앗길 수 있다. document level + capture phase로 등록해 dnd-kit보다
     * 먼저 받는다. 임계값 넘기 전엔 그대로 두고(가로 reorder는 dnd-kit이 처리),
     * 임계값 넘는 순간 detach 발동 + 그 이후 이벤트는 dnd-kit으로 가지 않게 차단.
     */

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const tabEl = target?.closest('[data-tab-id]') as HTMLElement | null;
      if (!tabEl) return;
      if (
        target?.closest('button, a, input, textarea, select, [data-tab-action]')
      ) {
        return;
      }
      // tabBar 영역 안의 탭에서만 발동
      if (!tabBar.contains(tabEl)) return;

      const tabId = tabEl.dataset.tabId;
      if (!tabId) return;

      const tabRect = tabEl.getBoundingClientRect();
      session = {
        tabId,
        transferId: createTransferId(),
        pointerId: e.pointerId,
        mouseOffset: {
          x: e.clientX - tabRect.left,
          y: e.clientY - tabRect.top,
        },
        detached: false,
      };
      // A WebContentsView starts immediately below the tab strip. Without an
      // early capture, the first pointermove outside the strip is delivered to
      // that native surface and the shell never observes the detach threshold.
      // Document-level dnd-kit sensors still receive captured pointer events,
      // so horizontal sorting remains available while the pointer stays in the
      // strip.
      const tab = useTabStore.getState().tabs.find((item) => item.id === tabId);
      if (tab && isNativeTabRoute(tab.route)) {
        try {
          tabBar.setPointerCapture(e.pointerId);
        } catch {
          // A closing/reloading shell can invalidate capture between hit-test
          // and pointerdown. The normal legacy path remains as a fallback.
        }
      }
      // Legacy tabs still avoid early capture/preventDefault so dnd-kit can
      // freely reorder them.
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!session) return;
      const currentSession = session;
      if (e.pointerId !== currentSession.pointerId) return;

      const screen = clientToScreen(e.clientX, e.clientY);

      if (!currentSession.detached) {
        const tabBarRect = tabBar.getBoundingClientRect();
        const leftTabStripVertically =
          e.clientY < tabBarRect.top - DETACH_THRESHOLD ||
          e.clientY > tabBarRect.bottom + DETACH_THRESHOLD;
        // 탭 스트립의 위/아래 경계를 벗어날 때 detach. 내부 수평 이동은 reorder다.
        if (!leftTabStripVertically) return;
        const tab = useTabStore
          .getState()
          .tabs.find((t) => t.id === currentSession.tabId);
        if (!tab) {
          session = null;
          return;
        }
        // legacy 탭의 mutation JavaScript 상태는 직렬화할 수 없다. native 탭은
        // 동일 WebContents를 옮기므로 in-flight mutation과 callback도 그대로 산다.
        if (mutationCountRef.current > 0 && !isNativeTabRoute(tab.route)) {
          session = null;
          return;
        }
        const tabAlreadyTransferring = [
          ...pendingDetachesRef.current.values(),
        ].some((pending) => pending.tabId === tab.id);
        if (tabAlreadyTransferring) {
          session = null;
          return;
        }
        // 새 target ACK를 기다리는 동안 close/Cmd+W/route write가 source metadata를
        // 없애지 못하게 detach 임계값을 넘는 즉시 reservation을 잡는다. begin 실패,
        // timeout, rollback 경로에서는 beginDrag/finalize가 반드시 잠금을 해제한다.
        const lockedTab = lockTabForTransfer(tab.id);
        if (!lockedTab) {
          session = null;
          return;
        }
        session.detached = true;
        pendingDetachesRef.current.set(currentSession.transferId, {
          tabId: tab.id,
          transferId: currentSession.transferId,
          targetReady: false,
          pointerReleased: false,
          committing: false,
        });
        // detach 발동 시점부터는 이 이벤트와 후속 이벤트가 dnd-kit으로 가지 않게 한다.
        // capture phase에서 stopImmediatePropagation()을 부르면 이후 listener 모두 차단.
        e.stopImmediatePropagation();
        e.preventDefault();
        // detach 시작 시점에 capture를 가져온다. 이렇게 해야 source 창 밖
        // (다른 모니터/데스크톱)으로 끌어도 pointermove가 계속 들어옴.
        try {
          tabBar.setPointerCapture(e.pointerId);
        } catch {
          // ignore — capture 실패해도 document listener가 이벤트는 받음
        }
        void beginDrag(
          lockedTab,
          currentSession.transferId,
          screen,
          currentSession.mouseOffset,
        );
        return;
      }

      // 이미 detached — 새 창 위치 갱신, 이벤트는 dnd-kit으로 가지 않게 차단
      e.stopImmediatePropagation();
      window.electronBridge?.tabs.updateDragPosition({
        transferId: currentSession.transferId,
        pointerScreen: screen,
      });
    };

    const endSession = () => {
      if (!session) return;
      const endedSession = session;
      session = null;
      const wasDetached = endedSession.detached;
      const pointerId = endedSession.pointerId;
      const transferId = endedSession.transferId;
      try {
        if (tabBar.hasPointerCapture(pointerId)) {
          tabBar.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }
      if (wasDetached) {
        const pending = pendingDetachesRef.current.get(transferId);
        if (pending) {
          pending.pointerReleased = true;
          void finalizeTransfer(transferId);
        }
        window.electronBridge?.tabs.endDrag(transferId);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!session || e.pointerId !== session.pointerId) return;
      const wasDetached = session.detached;
      endSession();
      // pointerup은 dnd-kit에도 전달해 sortable 상태를 정상 종료시킨다.
      if (wasDetached) e.preventDefault();
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (!session || e.pointerId !== session.pointerId) return;
      endSession();
    };

    const onPageHide = () => endSession();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') endSession();
    };
    const cleanupTransferAborted =
      window.electronBridge?.tabs.onTransferAborted?.(
        ({ transferId, tabId, tab }) => {
          const pending = pendingDetachesRef.current.get(transferId);
          if (!pending || pending.tabId !== tabId) return;
          if (tab) useTabStore.getState().replaceTransferredTabSnapshot(tab);
          pendingDetachesRef.current.delete(transferId);
          unlockTabForTransfer(tabId);
          if (session?.transferId === transferId) {
            try {
              if (tabBar.hasPointerCapture(session.pointerId)) {
                tabBar.releasePointerCapture(session.pointerId);
              }
            } catch {
              // ignore
            }
            session = null;
          }
        },
      );
    const cleanupNativeLifecycle =
      window.electronBridge?.tabs.onNativeTabLifecycle?.(({ tabId, status }) => {
        if (status !== 'renderer-failed') return;
        for (const [transferId, pending] of pendingDetachesRef.current) {
          if (pending.tabId !== tabId) continue;
          pendingDetachesRef.current.delete(transferId);
        }
        unlockTabForTransfer(tabId);
        if (
          session &&
          useTabStore.getState().tabs.some((tab) => tab.id === tabId)
        ) {
          session = null;
        }
      });

    // document level + capture phase. dnd-kit보다 먼저 받음.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    // capture 중에도 lostpointercapture가 발생할 수 있음
    tabBar.addEventListener(
      'lostpointercapture',
      onPointerCancel as EventListener,
    );

    return () => {
      endSession();
      cleanupTransferAborted?.();
      cleanupNativeLifecycle?.();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      tabBar.removeEventListener(
        'lostpointercapture',
        onPointerCancel as EventListener,
      );
    };
  }, [tabBarRef, beginDrag, lockTabForTransfer]);
}
