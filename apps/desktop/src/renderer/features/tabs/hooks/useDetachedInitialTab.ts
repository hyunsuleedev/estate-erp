import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApplyTabTransferSnapshot,
  InitialTabTransfer,
  InitialTabTransferAck,
  TabTransferCommitted,
} from '@estate-erp/shared';
import { useTabStore } from '../store/useTabStore';

async function acknowledgeWithRetry<TAck extends InitialTabTransferAck>(
  send: (
    ack: TAck,
  ) => Promise<{ ok: boolean; error?: string }>,
  ack: TAck,
): Promise<{ ok: boolean; error?: string }> {
  let lastError = 'transfer acknowledgement failed';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await send(ack);
      if (result.ok) return result;
      lastError = result.error ?? lastError;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 100 * (attempt + 1));
    });
  }
  return { ok: false, error: lastError };
}

/**
 * Detached 윈도우에서 전달 스냅샷을 원래 identity 그대로 삽입한다.
 * 대상 store 삽입 후 main에 ACK해야 source 탭이 제거된다.
 */
export function useDetachedInitialTab(
  enabled: boolean,
  owner: { userId: string; officeId: string } | null,
): boolean {
  const restoreTransferredWorkspace = useTabStore(
    (state) => state.restoreTransferredWorkspace,
  );
  const replaceTransferredTabSnapshot = useTabStore(
    (state) => state.replaceTransferredTabSnapshot,
  );
  const handledRef = useRef(false);
  const transferIdentityRef = useRef<{
    transferId: string;
    tabId: string;
  } | null>(null);
  const pendingSnapshotRef = useRef<ApplyTabTransferSnapshot | null>(null);
  const pendingCommittedRef = useRef<TabTransferCommitted | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [isFinalSnapshotReady, setIsFinalSnapshotReady] = useState(false);

  const applyFinalSnapshot = useCallback(
    (snapshot: ApplyTabTransferSnapshot) => {
      const tabsBridge = window.electronBridge?.tabs;
      if (!tabsBridge) return;
      const identity = transferIdentityRef.current;
      if (!identity) {
        pendingSnapshotRef.current = snapshot;
        return;
      }
      const matches =
        identity.transferId === snapshot.transferId &&
        identity.tabId === snapshot.tab.id;
      const result = matches
        ? replaceTransferredTabSnapshot(snapshot.tab)
        : {
            status: 'conflict' as const,
            tabId: snapshot.tab.id,
            error: 'final transfer snapshot identity did not match',
          };
      const accepted = result.status !== 'conflict';
      const error = result.status === 'conflict' ? result.error : undefined;

      void acknowledgeWithRetry(tabsBridge.acceptTransferSnapshot, {
        transferId: snapshot.transferId,
        snapshotId: snapshot.snapshotId,
        tabId: snapshot.tab.id,
        accepted,
        error,
      }).then((acknowledgement) => {
        if (!accepted || !acknowledgement.ok) {
          console.error(
            '[tabs] detached 최종 snapshot ACK에 실패했습니다:',
            acknowledgement.error ?? error,
          );
          return;
        }
        document.title = `${snapshot.tab.title} — 에스테잇플로우`;
      });
    },
    [replaceTransferredTabSnapshot],
  );

  const applyCommittedTransfer = useCallback(
    (commit: TabTransferCommitted) => {
      const identity = transferIdentityRef.current;
      if (!identity) {
        pendingCommittedRef.current = commit;
        return;
      }
      if (
        identity.transferId !== commit.transferId ||
        identity.tabId !== commit.tab.id
      ) {
        return;
      }
      const result = replaceTransferredTabSnapshot(commit.tab);
      if (result.status === 'conflict') {
        console.error(
          '[tabs] committed transfer snapshot 적용에 실패했습니다:',
          result.error,
        );
        return;
      }
      document.title = `${commit.tab.title} — 에스테잇플로우`;
      setIsFinalSnapshotReady(true);
    },
    [replaceTransferredTabSnapshot],
  );

  // initial ACK 전에 listener부터 붙인다. source는 initial ACK를 받은 뒤에만
  // final snapshot을 보낼 수 있으므로 이벤트 유실 없이 2차 ACK가 가능하다.
  useEffect(() => {
    if (!enabled || !owner) return;
    const tabsBridge = window.electronBridge?.tabs;
    if (!tabsBridge) return;

    const stopApplyingSnapshots = tabsBridge.onApplyTransferSnapshot(
      applyFinalSnapshot,
    );
    const stopCommittedListener = tabsBridge.onTransferCommitted(
      applyCommittedTransfer,
    );
    return () => {
      stopApplyingSnapshots();
      stopCommittedListener();
    };
  }, [applyCommittedTransfer, applyFinalSnapshot, enabled, owner]);

  useEffect(() => {
    if (!enabled || !owner) return;
    if (handledRef.current) {
      setIsReady(true);
      return;
    }

    const tabsBridge = window.electronBridge?.tabs;
    if (!tabsBridge) {
      setIsReady(true);
      return;
    }

    let cancelled = false;
    let transfer: InitialTabTransfer | null = null;
    let acknowledgementSent = false;

    void (async () => {
      try {
        const receivedTransfer = await tabsBridge.getInitialTab(owner);
        if (cancelled || !receivedTransfer || handledRef.current) return;
        transfer = receivedTransfer;
        const { transferId, transferTabId, workspace, committed } = receivedTransfer;
        transferIdentityRef.current = {
          transferId,
          tabId: transferTabId,
        };

        const result = restoreTransferredWorkspace(workspace);
        if (result.status === 'conflict') {
          await acknowledgeWithRetry(tabsBridge.acceptInitialTab, {
            transferId,
            tabId: transferTabId,
            accepted: false,
            error: result.error,
          });
          acknowledgementSent = true;
          throw new Error(result.error);
        }

        const pendingSnapshot = pendingSnapshotRef.current;
        if (pendingSnapshot) {
          pendingSnapshotRef.current = null;
          applyFinalSnapshot(pendingSnapshot);
        }
        const pendingCommit = pendingCommittedRef.current;
        if (pendingCommit) {
          pendingCommittedRef.current = null;
          applyCommittedTransfer(pendingCommit);
        }

        handledRef.current = true;
        const acknowledgement = await acknowledgeWithRetry(
          tabsBridge.acceptInitialTab,
          {
          transferId,
          tabId: transferTabId,
          accepted: true,
          },
        );
        acknowledgementSent = true;
        if (!acknowledgement.ok) {
          throw new Error(
            acknowledgement.error ?? 'main process rejected the tab acknowledgement',
          );
        }
        setIsAccepted(true);
        setIsFinalSnapshotReady((ready) => ready || committed);
        const activeTab = workspace.tabs.find(
          (tab) => tab.id === workspace.activeTabId,
        );
        if (activeTab) {
          document.title = `${activeTab.title} — 에스테잇플로우`;
        }
      } catch (error) {
        if (transfer && !acknowledgementSent) {
          void tabsBridge.acceptInitialTab({
            transferId: transfer.transferId,
            tabId: transfer.transferTabId,
            accepted: false,
            error: error instanceof Error ? error.message : 'tab restore failed',
          });
        }
        console.error('[tabs] detached 초기 탭을 복원하지 못했습니다:', error);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyCommittedTransfer,
    applyFinalSnapshot,
    enabled,
    owner,
    restoreTransferredWorkspace,
  ]);

  // detached 원본 탭의 최신 route/title/uiState를 main snapshot에도 반영해
  // renderer reload 시 최초 분리 시점으로 되돌아가지 않게 한다.
  useEffect(() => {
    if (!enabled || !isReady || !isAccepted || !owner) return;
    const syncWorkspace = () => {
      const state = useTabStore.getState();
      window.electronBridge?.tabs.syncWindowTabs({
        owner,
        workspace: {
          schemaVersion: 1,
          tabs: state.tabs,
          activeTabId: state.activeTabId,
        },
      });
    };
    const unsubscribe = useTabStore.subscribe(syncWorkspace);
    syncWorkspace();
    return unsubscribe;
  }, [enabled, isAccepted, isReady, owner]);

  return !enabled || (isReady && isFinalSnapshotReady);
}
