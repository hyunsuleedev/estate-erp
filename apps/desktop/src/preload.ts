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
  DesktopAuthTokenScope,
} from './common/desktopAuth';
import type {
  RealtimeAuthorityClaim,
  RealtimeAuthorityRelease,
  RealtimeAuthoritySnapshot,
} from './common/desktopRealtime';
import type {
  NativeTabAction,
  NativeTabActionEnvelope,
} from './common/nativeTabActions';
import type {
  CallOverlayAction,
  CallOverlayInset,
  CallOverlaySize,
  WindowToast,
} from './common/callOverlay';
import type {
  NativeSidebarState,
  NativeTabAssignment,
  NativeTabLifecycleUpdate,
  NativeTabNavigateCommand,
  NativeTabRetentionUpdate,
  NativeTabStateUpdate,
  NativeTabViewportPayload,
  NativeTabViewportReleasePayload,
} from './common/nativeTabs';
import { parseRendererSurfaceArguments } from './common/rendererSurface';
import {
  parseAuthProviderArgument,
  type DesktopProviderAuthState,
  type DesktopProviderCredentials,
  type DesktopProviderLoginResult,
  type DesktopProviderSessionChange,
} from './common/desktopAuthProvider';
import type { TabCommand, TabMenuItem } from './common/tabCommands';
import type {
  WindowWorkspaceOwner,
  WindowWorkspaceSyncPayload,
} from './common/windowWorkspace';

const surface = parseRendererSurfaceArguments(process.argv);
/** 셸 창만 실행 인자로 받는다. 탭 화면·팝업 층은 main에서 토큰만 빌려 쓴다. */
const authProvider = parseAuthProviderArgument(process.argv);

const authBridge = {
  publishSession: (snapshot: Omit<DesktopAuthSessionSnapshot, 'revision'>) =>
    ipcRenderer.invoke('auth:publishSession', snapshot),
  getSession: () => ipcRenderer.invoke('auth:getSession'),
  /** Auth0 모드의 셸은 화면에 보여 주는 계정의 세션 번호를 함께 보낸다. */
  getToken: (scope?: DesktopAuthTokenScope) =>
    ipcRenderer.invoke('auth:getToken', scope),
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
  /** 셸: 로그인 서비스. auth0이면 로그인·토큰을 main이 맡는다. */
  provider: authProvider,
  getProviderState: (): Promise<DesktopProviderAuthState> =>
    ipcRenderer.invoke('auth:providerState'),
  providerLogin: (
    credentials: DesktopProviderCredentials,
  ): Promise<DesktopProviderLoginResult> =>
    ipcRenderer.invoke('auth:providerLogin', credentials),
  /** 화면이 보여 주는 계정의 세션만 로그아웃한다. */
  providerLogout: (
    scope: DesktopAuthTokenScope,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('auth:providerLogout', scope),
  onProviderSessionEnded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('auth:providerSessionEnded', handler);
    return () => ipcRenderer.removeListener('auth:providerSessionEnded', handler);
  },
  onProviderSessionChanged: (
    callback: (change: DesktopProviderSessionChange) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      change: DesktopProviderSessionChange,
    ) => callback(change);
    ipcRenderer.on('auth:providerSessionChanged', handler);
    return () => ipcRenderer.removeListener('auth:providerSessionChanged', handler);
  },
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

/** 창 단위 사이드바 상태 읽기·구독. 셸과 탭 화면이 같이 쓴다. */
const sidebarStateBridge = {
  getSidebarState: (): Promise<NativeSidebarState> =>
    ipcRenderer.invoke('tabs:getSidebarState'),
};

/** 전화 팝업 층이 창 아래쪽을 차지한 높이. 알림을 그 위로 올릴 때 쓴다. */
const overlayInsetBridge = {
  getOverlayInset: (): Promise<CallOverlayInset> =>
    ipcRenderer.invoke('tabs:getOverlayInset'),
  onOverlayInset: (callback: (inset: CallOverlayInset) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, inset: CallOverlayInset) =>
      callback(inset);
    ipcRenderer.on('tabs:overlayInset', handler);
    return () => ipcRenderer.removeListener('tabs:overlayInset', handler);
  },
};

/** 셸·팝업 층의 알림은 보이는 탭 화면에서 띄운다. 받는 쪽은 셸과 탭 화면이다. */
const toastBridge = {
  showToast: (toast: WindowToast) => ipcRenderer.send('tabs:showToast', toast),
  onToast: (callback: (toast: WindowToast) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, toast: WindowToast) =>
      callback(toast);
    ipcRenderer.on('tabs:toast', handler);
    return () => ipcRenderer.removeListener('tabs:toast', handler);
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
    hasUnsavedNativeTabWork: (tabId: string): Promise<boolean> =>
      ipcRenderer.invoke('tabs:hasUnsavedNativeTabWork', tabId),
    ...sidebarStateBridge,
    ...toastBridge,
    ...overlayInsetBridge,
    setSidebarOpen: (open: boolean) =>
      ipcRenderer.send('tabs:setSidebarOpen', open),
    onSidebarOpenRequested: (callback: (state: NativeSidebarState) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        state: NativeSidebarState,
      ) => callback(state);
      ipcRenderer.on('tabs:sidebarOpenRequested', handler);
      return () =>
        ipcRenderer.removeListener('tabs:sidebarOpenRequested', handler);
    },
    /** 탭 화면(native 탭)이 보낸 탭 작업. 이 창의 탭 목록에 반영한다. */
    onNativeTabAction: (
      callback: (envelope: NativeTabActionEnvelope) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        envelope: NativeTabActionEnvelope,
      ) => callback(envelope);
      ipcRenderer.on('tabs:nativeTabAction', handler);
      return () => ipcRenderer.removeListener('tabs:nativeTabAction', handler);
    },
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
    onTabCommand: (callback: (command: TabCommand) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, command: TabCommand) =>
        callback(command);
      ipcRenderer.on('tabs:command', handler);
      return () => ipcRenderer.removeListener('tabs:command', handler);
    },
    showMenu: (items: TabMenuItem[]): Promise<string | null> =>
      ipcRenderer.invoke('tabs:showMenu', items),
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
    /** 통화 상태를 탭 화면 위의 팝업 층에 보낸다. null이면 팝업을 숨긴다. */
    setOverlayState: (state: unknown) =>
      ipcRenderer.send('cti:setOverlayState', state),
    onOverlayAction: (callback: (action: CallOverlayAction) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        action: CallOverlayAction,
      ) => callback(action);
      ipcRenderer.on('cti:overlayAction', handler);
      return () => ipcRenderer.removeListener('cti:overlayAction', handler);
    },
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

/**
 * main은 앱 문서가 로드되자마자 화면 안 이동 명령을 보낼 수 있다. React가 아직
 * 구독하기 전이면 마지막 명령을 들고 있다가 구독할 때 넘긴다.
 */
function createLatestValueChannel<T>(channel: string) {
  let latest: T | null = null;
  let subscriber: ((value: T) => void) | null = null;
  if (surface.kind === 'native-tab') {
    ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent, value: T) => {
      if (subscriber) subscriber(value);
      else latest = value;
    });
  }
  return (callback: (value: T) => void) => {
    subscriber = callback;
    if (latest !== null) {
      const pending = latest;
      latest = null;
      callback(pending);
    }
    return () => {
      if (subscriber === callback) subscriber = null;
    };
  };
}

const onNativeNavigate =
  createLatestValueChannel<NativeTabNavigateCommand>('tabs:nativeNavigate');
const onNativeSidebarState =
  createLatestValueChannel<NativeSidebarState>('tabs:sidebarState');
const onNativeAssign =
  createLatestValueChannel<NativeTabAssignment>('tabs:nativeAssign');

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
    /** macOS 마우스 사이드 버튼처럼 native 탭이 받은 입력을 셸 탭바로 보낸다. */
    requestTabCommand: (command: TabCommand) =>
      ipcRenderer.send('tabs:requestCommand', command),
    /** 사이드바와 화면 틀을 처음 그렸다. main은 이때 탭 화면을 보여준다. */
    notifyReady: () => ipcRenderer.send('tabs:nativeTabReady'),
    /** 새 탭 열기·저장 후 탭 바꾸기·탭 닫기처럼 탭 목록을 바꾸는 요청을 셸에 보낸다. */
    sendTabAction: (action: NativeTabAction) =>
      ipcRenderer.send('tabs:nativeTabAction', action),
    /** 뒤로/앞으로·사이드바처럼 셸이 바꾼 이 탭의 주소. 다시 로드하지 않고 옮긴다. */
    onNavigate: onNativeNavigate,
    /** 미리 띄워 둔 탭 화면: 맡게 된 실제 탭. */
    onAssign: onNativeAssign,
    onToast: toastBridge.onToast,
    ...overlayInsetBridge,
    ...sidebarStateBridge,
    onSidebarState: onNativeSidebarState,
    requestSidebarOpen: (open: boolean) =>
      ipcRenderer.send('tabs:requestSidebarOpen', open),
    openPropertyWindow: (payload: OpenPropertyWindowPayload) =>
      ipcRenderer.invoke('tabs:openPropertyWindow', payload),
  },
};

/**
 * 팝업 층이 구독하기 전에 온 통화 상태를 들고 있다가 넘긴다. null(팝업 숨김)도
 * 상태이므로 "받은 값이 있는지"를 따로 기억한다.
 */
function createCallOverlayStateChannel() {
  let pending: { state: unknown } | null = null;
  let subscriber: ((state: unknown) => void) | null = null;
  if (surface.kind === 'call-overlay') {
    ipcRenderer.on('cti:overlayState', (_event, state: unknown) => {
      if (subscriber) subscriber(state);
      else pending = { state };
    });
  }
  return (callback: (state: unknown) => void) => {
    subscriber = callback;
    if (pending) {
      const { state } = pending;
      pending = null;
      callback(state);
    }
    return () => {
      if (subscriber === callback) subscriber = null;
    };
  };
}

const onCallOverlayState = createCallOverlayStateChannel();

/** 탭 화면 위에 뜨는 전화 수신 팝업 층. 로그인·데이터 갱신·통화 상태만 쓴다. */
const callOverlayBridge = {
  platform: process.platform,
  surface,
  auth: nativeTabAuthBridge,
  tabs: {
    ...invalidateTabsBridge,
    showToast: toastBridge.showToast,
  },
  cti: {
    getOverlayState: (): Promise<unknown> =>
      ipcRenderer.invoke('cti:getOverlayState'),
    onOverlayState: onCallOverlayState,
    sendOverlayAction: (action: CallOverlayAction) =>
      ipcRenderer.send('cti:overlayAction', action),
    reportOverlaySize: (size: CallOverlaySize) =>
      ipcRenderer.send('cti:overlaySize', size),
  },
};

contextBridge.exposeInMainWorld(
  'electronBridge',
  surface.kind === 'native-tab'
    ? nativeTabBridge
    : surface.kind === 'call-overlay'
      ? callOverlayBridge
      : windowShellBridge,
);
