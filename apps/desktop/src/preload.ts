import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApplyTabTransferSnapshot,
  BeginDragPayload,
  CommitTabTransfer,
  DetachPayload,
  DragPositionPayload,
  FinalTabTransferSnapshotAck,
  InitialTabTransferAck,
  OpenPropertyWindowPayload,
  TabTransferAborted,
  TabTransferCommitted,
  Tab,
} from '@estate-erp/shared';
import type {
  DesktopAuthSignOutRequest,
  DesktopAuthSignOutResponse,
  DesktopAuthSessionSnapshot,
  DesktopAuthTokenRequest,
  DesktopAuthTokenResponse,
} from './common/desktopAuth';
import type {
  RealtimeAuthorityClaim,
  RealtimeAuthorityRelease,
  RealtimeAuthoritySnapshot,
} from './common/desktopRealtime';
import type {
  NativeTabLifecycleUpdate,
  NativeTabRetentionUpdate,
  NativeTabStateUpdate,
  NativeTabViewportPayload,
  NativeTabViewportReleasePayload,
} from './common/nativeTabs';
import { parseRendererSurfaceArguments } from './common/rendererSurface';
import type {
  WindowWorkspaceOwner,
  WindowWorkspaceSyncPayload,
} from './common/windowWorkspace';

const surface = parseRendererSurfaceArguments(process.argv);

const authBridge = {
  publishSession: (snapshot: Omit<DesktopAuthSessionSnapshot, 'revision'>) =>
    ipcRenderer.invoke('auth:publishSession', snapshot),
  getSession: () => ipcRenderer.invoke('auth:getSession'),
  getToken: () => ipcRenderer.invoke('auth:getToken'),
  resolveToken: (response: DesktopAuthTokenResponse) =>
    ipcRenderer.invoke('auth:resolveToken', response),
  onTokenRequest: (callback: (request: DesktopAuthTokenRequest) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: DesktopAuthTokenRequest,
    ) => callback(request);
    ipcRenderer.on('auth:tokenRequest', handler);
    return () => ipcRenderer.removeListener('auth:tokenRequest', handler);
  },
  onSession: (callback: (snapshot: DesktopAuthSessionSnapshot) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      snapshot: DesktopAuthSessionSnapshot,
    ) => callback(snapshot);
    ipcRenderer.on('auth:session', handler);
    return () => ipcRenderer.removeListener('auth:session', handler);
  },
  onSignOutRequest: (
    callback: (request: DesktopAuthSignOutRequest) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: DesktopAuthSignOutRequest,
    ) => callback(request);
    ipcRenderer.on('auth:signOutRequest', handler);
    return () => ipcRenderer.removeListener('auth:signOutRequest', handler);
  },
  resolveSignOut: (response: DesktopAuthSignOutResponse) =>
    ipcRenderer.invoke('auth:resolveSignOut', response),
  requestSignOut: () => ipcRenderer.invoke('auth:requestSignOut'),
};

const nativeTabAuthBridge = {
  getSession: authBridge.getSession,
  getToken: authBridge.getToken,
  onSession: authBridge.onSession,
  requestSignOut: authBridge.requestSignOut,
};

const invalidateTabsBridge = {
  broadcastInvalidate: (queryKey: readonly unknown[]) =>
    ipcRenderer.send('tabs:invalidate', queryKey),
  onInvalidate: (
    callback: (payload: {
      queryKey: readonly unknown[];
      sourceWindowId: number;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { queryKey: readonly unknown[]; sourceWindowId: number },
    ) => callback(payload);
    ipcRenderer.on('tabs:invalidate', handler);
    return () => ipcRenderer.removeListener('tabs:invalidate', handler);
  },
};

const windowShellBridge = {
  platform: process.platform,
  surface,
  auth: authBridge,
  realtime: {
    claimAuthority: (claim: RealtimeAuthorityClaim) =>
      ipcRenderer.invoke('realtime:claimAuthority', claim),
    releaseAuthority: (release: RealtimeAuthorityRelease) =>
      ipcRenderer.send('realtime:releaseAuthority', release),
    onAuthority: (callback: (snapshot: RealtimeAuthoritySnapshot) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        snapshot: RealtimeAuthoritySnapshot,
      ) => callback(snapshot);
      ipcRenderer.on('realtime:authority', handler);
      return () => ipcRenderer.removeListener('realtime:authority', handler);
    },
  },
  onToggleSidebar: (callback: () => void) => {
    ipcRenderer.on('toggle-sidebar', callback);
    return () => {
      ipcRenderer.removeListener('toggle-sidebar', callback);
    };
  },
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      isFullscreen: boolean,
    ) => callback(isFullscreen);
    ipcRenderer.on('fullscreen-changed', handler);
    return () => {
      ipcRenderer.removeListener('fullscreen-changed', handler);
    };
  },
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (payload: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
        callback(payload);
      ipcRenderer.on('updater:status', handler);
      return () => {
        ipcRenderer.removeListener('updater:status', handler);
      };
    },
  },
  tabs: {
    ...invalidateTabsBridge,
    openPropertyWindow: (payload: OpenPropertyWindowPayload) =>
      ipcRenderer.invoke('tabs:openPropertyWindow', payload),
    detach: (payload: DetachPayload) =>
      ipcRenderer.invoke('tabs:detach', payload),
    beginDrag: (payload: BeginDragPayload) =>
      ipcRenderer.invoke('tabs:beginDrag', payload),
    updateDragPosition: (payload: DragPositionPayload) =>
      ipcRenderer.send('tabs:updateDragPosition', payload),
    endDrag: (transferId: string) =>
      ipcRenderer.send('tabs:endDrag', transferId),
    setGlobalOverlayVisible: (
      source: 'cti' | 'updater',
      visible: boolean,
    ) =>
      ipcRenderer.send('tabs:setGlobalOverlayVisible', {
        schemaVersion: 1,
        source,
        visible,
      }),
    syncNativeViewport: (payload: NativeTabViewportPayload) =>
      ipcRenderer.invoke('tabs:syncNativeViewport', payload),
    releaseNativeViewport: (payload: NativeTabViewportReleasePayload) =>
      ipcRenderer.send('tabs:releaseNativeViewport', payload),
    onNativeTabState: (callback: (update: NativeTabStateUpdate) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        update: NativeTabStateUpdate,
      ) => callback(update);
      ipcRenderer.on('tabs:nativeTabState', handler);
      return () => ipcRenderer.removeListener('tabs:nativeTabState', handler);
    },
    onNativeTabSnapshot: (callback: (tab: Tab) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tab: Tab) =>
        callback(tab);
      ipcRenderer.on('tabs:nativeTabSnapshot', handler);
      return () =>
        ipcRenderer.removeListener('tabs:nativeTabSnapshot', handler);
    },
    onNativeTabLifecycle: (
      callback: (update: NativeTabLifecycleUpdate) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        update: NativeTabLifecycleUpdate,
      ) => callback(update);
      ipcRenderer.on('tabs:nativeTabLifecycle', handler);
      return () =>
        ipcRenderer.removeListener('tabs:nativeTabLifecycle', handler);
    },
    getWindowKind: () => ipcRenderer.invoke('tabs:getWindowKind'),
    getWindowWorkspace: (owner: WindowWorkspaceOwner) =>
      ipcRenderer.invoke('tabs:getWindowWorkspace', owner),
    syncWindowWorkspace: (payload: WindowWorkspaceSyncPayload) =>
      ipcRenderer.invoke('tabs:syncWindowWorkspace', payload),
    getInitialTab: (owner: WindowWorkspaceOwner) =>
      ipcRenderer.invoke('tabs:getInitialTab', owner),
    acceptInitialTab: (ack: InitialTabTransferAck) =>
      ipcRenderer.invoke('tabs:acceptInitialTab', ack),
    commitTransfer: (commit: CommitTabTransfer) =>
      ipcRenderer.invoke('tabs:commitTransfer', commit),
    prepareTransferSnapshot: (commit: CommitTabTransfer) =>
      ipcRenderer.invoke('tabs:prepareTransferSnapshot', commit),
    onApplyTransferSnapshot: (
      callback: (snapshot: ApplyTabTransferSnapshot) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        snapshot: ApplyTabTransferSnapshot,
      ) => callback(snapshot);
      ipcRenderer.on('tabs:applyTransferSnapshot', handler);
      return () => {
        ipcRenderer.removeListener('tabs:applyTransferSnapshot', handler);
      };
    },
    acceptTransferSnapshot: (ack: FinalTabTransferSnapshotAck) =>
      ipcRenderer.invoke('tabs:acceptTransferSnapshot', ack),
    onTransferCommitted: (callback: (commit: TabTransferCommitted) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        commit: TabTransferCommitted,
      ) => callback(commit);
      ipcRenderer.on('tabs:transferCommitted', handler);
      return () => {
        ipcRenderer.removeListener('tabs:transferCommitted', handler);
      };
    },
    onTransferAborted: (callback: (abort: TabTransferAborted) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        abort: TabTransferAborted,
      ) => callback(abort);
      ipcRenderer.on('tabs:transferAborted', handler);
      return () => ipcRenderer.removeListener('tabs:transferAborted', handler);
    },
    syncWindowTabs: (payload: WindowWorkspaceSyncPayload) =>
      ipcRenderer.send('tabs:syncWindowTabs', payload),
    closeWindow: () => ipcRenderer.send('tabs:closeWindow'),
    openInMainWindow: (route: string) =>
      ipcRenderer.invoke('tabs:openInMainWindow', route),
    onOpenRoute: (callback: (route: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, route: string) =>
        callback(route);
      ipcRenderer.on('tabs:openRoute', handler);
      return () => {
        ipcRenderer.removeListener('tabs:openRoute', handler);
      };
    },
  },
  codex: {
    start: (args: {
      runId: string;
      prompt: string;
      cwd?: string;
      sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
      model?: string;
      resumeSessionId?: string | null;
      dangerouslyBypass?: boolean;
      authToken?: string;
      apiBaseUrl?: string;
    }) => ipcRenderer.invoke('codex:start', args),
    stop: (runId: string) => ipcRenderer.invoke('codex:stop', runId),
    onEvent: (callback: (payload: Record<string, unknown>) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: Record<string, unknown>,
      ) => callback(payload);
      ipcRenderer.on('codex:event', handler);
      return () => {
        ipcRenderer.removeListener('codex:event', handler);
      };
    },
  },
  cti: {
    getStatus: () => ipcRenderer.invoke('cti:getStatus'),
    dial: (payload: { callee: string; caller?: string }) =>
      ipcRenderer.invoke('cti:dial', payload),
    onEvent: (callback: (payload: Record<string, unknown>) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: Record<string, unknown>,
      ) => callback(payload);
      ipcRenderer.on('cti:event', handler);
      return () => {
        ipcRenderer.removeListener('cti:event', handler);
      };
    },
    onStatus: (callback: (payload: Record<string, unknown>) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: Record<string, unknown>,
      ) => callback(payload);
      ipcRenderer.on('cti:status', handler);
      return () => {
        ipcRenderer.removeListener('cti:status', handler);
      };
    },
  },
};

const nativeTabBridge = {
  platform: process.platform,
  surface,
  auth: nativeTabAuthBridge,
  // Native content receives only the data-plane invalidation channel. Window,
  // updater, CTI and Codex authority stays in the shell renderer.
  tabs: {
    ...invalidateTabsBridge,
    getNativeTabSnapshot: (): Promise<Tab | null> =>
      ipcRenderer.invoke('tabs:getNativeTabSnapshot'),
    setRetention: (update: NativeTabRetentionUpdate) =>
      ipcRenderer.send('tabs:setNativeTabRetention', update),
    openInMainWindow: (route: string) =>
      ipcRenderer.invoke('tabs:openInMainWindow', route),
  },
};

contextBridge.exposeInMainWorld(
  'electronBridge',
  surface.kind === 'native-tab' ? nativeTabBridge : windowShellBridge,
);
