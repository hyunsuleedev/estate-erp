import { contextBridge, ipcRenderer } from 'electron';
import type { OpenPropertyWindowPayload, Tab } from '@estate-erp/shared';
import type {
  DesktopAuthActionResult,
  DesktopAuthCredentials,
  DesktopAuthLoginResult,
  DesktopAuthRefreshResult,
  DesktopAuthSessionScope,
  DesktopAuthSessionSnapshot,
  DesktopAuthSignupInput,
  DesktopAuthSignupResult,
} from './common/desktopAuth';
import type {
  RealtimeEventMessage,
  RealtimeRoomRequest,
  RealtimeStatus,
} from './common/desktopRealtime';
import type {
  ActiveCall,
  CtiDialRequest,
  CtiDialResult,
  CtiStatus,
} from './common/desktopCti';
import type { NativeTabAction } from './common/nativeTabActions';
import type {
  CallOverlayAction,
  CallOverlayInset,
  CallOverlaySize,
  WindowToast,
} from './common/callOverlay';
import type {
  NativeSidebarState,
  NativeTabAssignment,
  NativeTabNavigateCommand,
  NativeTabRetentionUpdate,
} from './common/nativeTabs';
import {
  parseRendererSurfaceArguments,
  type RendererSurfaceInfo,
} from './common/rendererSurface';
import type { TabCommand } from './common/tabCommands';
import {
  TAB_BAR_CHANNELS,
  isTabBarState,
  type TabBarActionEnvelope,
  type TabBarState,
} from './common/tabs/tabBarContract';
import { acceptAppTabDrops } from './common/tabs/tabDrag';

/**
 * 이 문서의 역할. main이 화면을 만들 때 정해 준 것만 따른다. 정해 주지 않은 문서에는
 * 아무 통로도 내주지 않는다(맨 아래).
 */
const grantedSurface = parseRendererSurfaceArguments(process.argv);
const surface: RendererSurfaceInfo | { kind: 'none'; tabId: null } =
  grantedSurface ?? { kind: 'none', tabId: null };
/**
 * 창 자체의 화면은 두 문서 중 하나다: 로그인 전의 화면(앱 문서)과 로그인 뒤의 탭바 문서.
 * preload는 문서가 뜰 때마다 다시 실행되므로 문서 주소로 구별해, 탭바 문서에는 탭바
 * 통로만 내준다(로그인·토큰 통로는 주지 않는다). main도 보낸 문서의 주소로 다시 확인한다.
 */
const isTabBarDocument =
  surface.kind === 'window-shell' &&
  /\/tabbar\.html$/i.test(window.location.pathname);
/**
 * 로그인 세션의 주인은 main이다. 모든 화면(셸·탭 화면·팝업 층)은 main의 세션을
 * 읽고, 자기가 보여 주는 계정의 세션 번호로 토큰·로그아웃·401 확인을 요청한다.
 */
const sessionAuthBridge = {
  getSession: (): Promise<DesktopAuthSessionSnapshot> =>
    ipcRenderer.invoke('auth:getSession'),
  onSession: (callback: (snapshot: DesktopAuthSessionSnapshot) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      snapshot: DesktopAuthSessionSnapshot,
    ) => callback(snapshot);
    ipcRenderer.on('auth:session', handler);
    return () => ipcRenderer.removeListener('auth:session', handler);
  },
  /** 화면이 보여 주는 세션이 지금 세션일 때만 토큰을 받는다. */
  getToken: (scope: DesktopAuthSessionScope): Promise<string | null> =>
    ipcRenderer.invoke('auth:getToken', scope),
  /** 화면이 보여 주는 세션만 로그아웃한다. */
  logout: (scope: DesktopAuthSessionScope): Promise<DesktopAuthActionResult> =>
    ipcRenderer.invoke('auth:logout', scope),
  /** 서버에서 사용자 정보를 새로 받는다(사무소 생성, 내 정보 수정 뒤). */
  refreshUser: (): Promise<DesktopAuthRefreshResult> =>
    ipcRenderer.invoke('auth:refreshUser'),
  /** bearer를 실어 보낸 요청이 401이었다. main이 직접 확인한다. */
  reportUnauthorized: (
    scope: DesktopAuthSessionScope,
  ): Promise<DesktopAuthActionResult> =>
    ipcRenderer.invoke('auth:reportUnauthorized', scope),
};

/** 로그인·가입 화면은 셸에만 있다. */
const shellAuthBridge = {
  ...sessionAuthBridge,
  login: (credentials: DesktopAuthCredentials): Promise<DesktopAuthLoginResult> =>
    ipcRenderer.invoke('auth:login', credentials),
  /** 계정을 만들고 바로 로그인한다. */
  signup: (input: DesktopAuthSignupInput): Promise<DesktopAuthSignupResult> =>
    ipcRenderer.invoke('auth:signup', input),
  /** 서버에 닿지 못한 상태에서 사용자 확인을 다시 시도한다. */
  retry: (): Promise<DesktopAuthActionResult> => ipcRenderer.invoke('auth:retry'),
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

/**
 * 서버 실시간 연결은 main에 하나뿐이다. 화면은 main이 보내는 이벤트를 받고, 방
 * (매물 상세 등)의 이벤트가 필요하면 구독을 요청한다. 셸과 탭 화면이 같이 쓴다.
 */
/**
 * 전화(CTI). 통화 상태의 주인은 main이다. 셸과 탭 화면은 통화 상태와 Bridge 상태를
 * 읽고 발신만 요청한다. 팝업의 버튼은 팝업 층만 보낼 수 있다.
 */
const ctiBridge = {
  getStatus: (): Promise<CtiStatus> => ipcRenderer.invoke('cti:getStatus'),
  onStatus: (callback: (status: CtiStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: CtiStatus) =>
      callback(status);
    ipcRenderer.on('cti:status', handler);
    return () => {
      ipcRenderer.removeListener('cti:status', handler);
    };
  },
  getCall: (): Promise<ActiveCall | null> => ipcRenderer.invoke('cti:getCall'),
  onCall: (callback: (call: ActiveCall | null) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      call: ActiveCall | null,
    ) => callback(call);
    ipcRenderer.on('cti:call', handler);
    return () => {
      ipcRenderer.removeListener('cti:call', handler);
    };
  },
  dial: (request: CtiDialRequest): Promise<CtiDialResult> =>
    ipcRenderer.invoke('cti:dial', request),
};

const realtimeBridge = {
  onEvent: (callback: (event: RealtimeEventMessage) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      message: RealtimeEventMessage,
    ) => callback(message);
    ipcRenderer.on('realtime:event', handler);
    return () => ipcRenderer.removeListener('realtime:event', handler);
  },
  subscribe: (request: RealtimeRoomRequest): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('realtime:subscribe', request),
  unsubscribe: (request: RealtimeRoomRequest) =>
    ipcRenderer.send('realtime:unsubscribe', request),
  getStatus: (): Promise<RealtimeStatus> =>
    ipcRenderer.invoke('realtime:getStatus'),
};

/**
 * 탭바 문서가 그리는 탭바. 문서가 뜨는 순간 main에서 이 창의 탭 상태를 읽어 두므로
 * 첫 화면부터 탭이 그려진다. 그 뒤의 변경도 화면이 구독하기 전부터 받아 둔다.
 */
function createTabBarBridge() {
  let latest: TabBarState | null = null;
  const subscribers = new Set<(state: TabBarState) => void>();
  if (isTabBarDocument) {
    try {
      const bootstrap: unknown = ipcRenderer.sendSync(TAB_BAR_CHANNELS.bootstrap);
      if (isTabBarState(bootstrap)) latest = bootstrap;
    } catch {
      latest = null;
    }
    ipcRenderer.on(
      TAB_BAR_CHANNELS.state,
      (_event: Electron.IpcRendererEvent, state: unknown) => {
        if (!isTabBarState(state)) return;
        latest = state;
        for (const subscriber of [...subscribers]) subscriber(state);
      },
    );
  }
  return {
    getState: (): TabBarState | null => latest,
    onState: (callback: (state: TabBarState) => void) => {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    dispatch: (envelope: TabBarActionEnvelope) =>
      ipcRenderer.send(TAB_BAR_CHANNELS.action, envelope),
  };
}

const tabBarBridge = createTabBarBridge();

/**
 * 업데이트 안내. 보이는 화면(로그인 전에는 로그인 화면, 로그인 뒤에는 탭 화면)이 그린다.
 * "나중에"를 누른 것은 main이 기억해 다른 탭 화면에도 같이 닫힌다.
 */
const updaterBridge = {
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
  getDismissed: (): Promise<number | null> =>
    ipcRenderer.invoke('updater:getDismissed'),
  dismiss: (startedAt: number) => ipcRenderer.send('updater:dismiss', startedAt),
  onDismissed: (callback: (startedAt: number | null) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      startedAt: number | null,
    ) => callback(startedAt);
    ipcRenderer.on('updater:dismissed', handler);
    return () => {
      ipcRenderer.removeListener('updater:dismissed', handler);
    };
  },
};

/** 로그인 전의 창 화면(로그인·가입·온보딩·서버에 닿지 못함). 탭은 다루지 않는다. */
const windowShellBridge = {
  platform: process.platform,
  surface,
  auth: shellAuthBridge,
  realtime: realtimeBridge,
  updater: updaterBridge,
  tabs: {
    ...invalidateTabsBridge,
    ...toastBridge,
    ...overlayInsetBridge,
  },
  cti: ctiBridge,
};

/** 로그인 뒤의 창 화면(탭바 문서). 탭바 상태를 받고 동작을 보내는 것만 할 수 있다. */
const tabBarWindowBridge = {
  platform: process.platform,
  surface: { kind: 'tab-bar', tabId: null } as const,
  tabs: { tabBar: tabBarBridge },
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
  realtime: realtimeBridge,
  cti: ctiBridge,
  platform: process.platform,
  surface,
  auth: sessionAuthBridge,
  // 업데이트 안내는 보이는 탭 화면이 그린다.
  updater: updaterBridge,
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
  auth: sessionAuthBridge,
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

// 탭 화면과 전화 팝업 층은 그 위로 끌려 온 앱의 탭을 "받는 자리"로 답한다. 받기만 한다:
// 탭을 새 창으로 옮기는 요청은 끌기를 시작한 탭 줄이 보낸다. 받는 자리로 답해야 끌기를
// 시작한 쪽이 "앱 화면 위에 놓았다"와 "취소했다"를 구별하고, macOS가 놓기를 거절된 것으로
// 보고 그림을 되돌리며 기다리지 않는다. 화면의 다른 코드는 탭 끌기를 보지 못한다.
if (surface.kind === 'native-tab' || surface.kind === 'call-overlay') {
  acceptAppTabDrops<DragEvent>(window, { claim: true });
}

if (surface.kind !== 'none') {
  contextBridge.exposeInMainWorld(
    'electronBridge',
    surface.kind === 'native-tab'
      ? nativeTabBridge
      : surface.kind === 'call-overlay'
        ? callOverlayBridge
        : isTabBarDocument
          ? tabBarWindowBridge
          : windowShellBridge,
  );
}
