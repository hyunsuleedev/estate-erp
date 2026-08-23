import { useEffect, useMemo, useState } from 'react';
import type { WindowWorkspaceOwner } from '../../../../common/windowWorkspace';
import { useTabStore } from '../store/useTabStore';

/**
 * Keeps the main-window tab projection in the main process so a shell
 * renderer reload can reconnect to the existing native WebContentsViews by
 * the same tab IDs. Tenant identity is part of the transport contract.
 */
export function useWindowWorkspace(
  enabled: boolean,
  owner: WindowWorkspaceOwner | null,
): boolean {
  const userId = owner?.userId ?? null;
  const officeId = owner?.officeId ?? null;
  const ownerKey = userId && officeId ? `${userId}\u0000${officeId}` : null;
  const stableOwner = useMemo(
    () => (userId && officeId ? { userId, officeId } : null),
    [officeId, userId],
  );
  const [readyOwnerKey, setReadyOwnerKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !stableOwner || !ownerKey) return;
    const bridge = window.electronBridge?.tabs;
    if (!bridge) {
      setReadyOwnerKey(ownerKey);
      return;
    }
    let cancelled = false;
    void bridge
      .getWindowWorkspace(stableOwner)
      .then((workspace) => {
        if (cancelled) return;
        if (workspace && useTabStore.getState().tabs.length === 0) {
          const result =
            useTabStore.getState().restoreTransferredWorkspace(workspace);
          if (result.status === 'conflict') {
            console.error('[tabs] main workspace restore failed:', result.error);
          }
        }
        setReadyOwnerKey(ownerKey);
      })
      .catch((error) => {
        console.error('[tabs] main workspace bootstrap failed:', error);
        if (!cancelled) setReadyOwnerKey(ownerKey);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, ownerKey, stableOwner]);

  const ready = !enabled || (ownerKey !== null && readyOwnerKey === ownerKey);

  useEffect(() => {
    if (!enabled || !ready || !stableOwner) return;
    const bridge = window.electronBridge?.tabs;
    if (!bridge) return;
    const sync = () => {
      const state = useTabStore.getState();
      void bridge.syncWindowWorkspace({
        owner: stableOwner,
        workspace: {
          schemaVersion: 1,
          tabs: state.tabs,
          activeTabId: state.activeTabId,
        },
      });
    };
    const unsubscribe = useTabStore.subscribe(sync);
    sync();
    return unsubscribe;
  }, [enabled, ready, stableOwner]);

  return ready;
}
