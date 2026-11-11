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
} from '../common/desktopAuth';
import type {
  RealtimeEventMessage,
  RealtimeRoomRequest,
  RealtimeStatus,
} from '../common/desktopRealtime';
import type {
  ActiveCall,
  CtiDialRequest,
  CtiDialResult,
  CtiStatus,
} from '../common/desktopCti';
import type { NativeTabAction } from '../common/nativeTabActions';
import type {
  CallOverlayAction,
  CallOverlayInset,
  CallOverlaySize,
  WindowToast,
} from '../common/callOverlay';
import type {
  NativeSidebarState,
  NativeTabAssignment,
  NativeTabNavigateCommand,
  NativeTabRetentionUpdate,
} from '../common/nativeTabs';
import type { RendererSurfaceInfo } from '../common/rendererSurface';
import type { TabCommand } from '../common/tabCommands';
import type {
  TabBarActionEnvelope,
  TabBarState,
} from '../common/tabs/tabBarContract';

type DesktopUpdateStatus =
  | {
      state: 'disabled';
      currentVersion: string;
      reason: string;
      startedAt: number;
    }
  | { state: 'idle'; currentVersion: string; startedAt: number }
  | {
      state: 'checking';
      currentVersion: string;
      manual?: boolean;
      startedAt: number;
    }
  | {
      state: 'available';
      currentVersion: string;
      version?: string;
      releaseName?: string;
      manual?: boolean;
      startedAt: number;
    }
  | {
      state: 'not-available';
      currentVersion: string;
      manual?: boolean;
      startedAt: number;
    }
  | {
      state: 'downloaded';
      currentVersion: string;
      version?: string;
      releaseName?: string;
      releaseNotes?: string;
      startedAt: number;
    }
  | {
      state: 'error';
      currentVersion: string;
      message: string;
      manual?: boolean;
      startedAt: number;
    };

interface UpdaterBridge {
  getStatus: () => Promise<DesktopUpdateStatus>;
  check: () => Promise<DesktopUpdateStatus>;
  install: () => Promise<{ ok: boolean; error?: string }>;
  onStatus: (callback: (payload: DesktopUpdateStatus) => void) => () => void;
  /** "나중에"로 닫은 안내(상태의 startedAt). main이 기억해 모든 화면이 같이 닫는다. */
  getDismissed?: () => Promise<number | null>;
  dismiss?: (startedAt: number) => void;
  onDismissed?: (callback: (startedAt: number | null) => void) => () => void;
}

/**
 * 창 자체의 화면이 그리는 탭바. 탭 목록의 주인은 main이다: 화면은 상태를 받아 그리고
 * 사용자가 한 동작을 순번을 달아 보낸다.
 */
interface TabBarBridge {
  /** 지금까지 받은 마지막 상태. 문서가 뜨는 순간 읽어 둔 값부터 시작한다. */
  getState: () => TabBarState | null;
  onState: (callback: (state: TabBarState) => void) => () => void;
  dispatch: (envelope: TabBarActionEnvelope) => void;
}

interface TabsBridge {
  /** 탭바 문서(로그인 뒤의 창 화면)에만 있다. 그 문서에는 이것만 있다. */
  tabBar?: TabBarBridge;
  getNativeTabSnapshot?: () => Promise<Tab | null>;
  setRetention?: (update: NativeTabRetentionUpdate) => void;
  // 아래는 앱 문서(로그인 화면·탭 화면)의 통로다. 탭바 문서에는 위의 tabBar만 있다.
  /** 탭 화면: 다른 탭을 건드리지 않고 매물 상세를 새 창으로 연다. */
  openPropertyWindow: (
    payload: OpenPropertyWindowPayload,
  ) => Promise<{ ok: boolean; windowId?: number; error?: string }>;
  broadcastInvalidate: (queryKey: readonly unknown[]) => void;
  onInvalidate: (
    callback: (payload: {
      queryKey: readonly unknown[];
      sourceWindowId: number;
    }) => void,
  ) => () => void;
  /** 탭 화면: 그 화면을 메인 창의 탭으로 연다. */
  openInMainWindow: (route: string) => Promise<{ ok: boolean; error?: string }>;
  /** 탭 화면: 받은 탭 명령(마우스 사이드 버튼 등)을 자기 창의 탭 목록에 보낸다. */
  requestTabCommand?: (command: TabCommand) => void;
  /** 탭 화면: 자기 창의 사이드바 펼침 상태. */
  getSidebarState?: () => Promise<NativeSidebarState>;
  /** 탭 화면: 사이드바와 화면 틀을 처음 그렸다는 신호. */
  notifyReady?: () => void;
  /** 탭 화면: 탭 목록을 바꾸는 작업을 main의 탭 목록에 요청한다. */
  sendTabAction?: (action: NativeTabAction) => void;
  /** 탭 화면: 탭 목록이 바꾼 이 탭의 주소. 다시 로드하지 않고 화면 안에서 옮긴다. */
  onNavigate?: (
    callback: (command: NativeTabNavigateCommand) => void,
  ) => () => void;
  /** 미리 띄워 둔 탭 화면: 맡게 된 실제 탭. */
  onAssign?: (
    callback: (assignment: NativeTabAssignment) => void,
  ) => () => void;
  /** 탭 화면: 창의 사이드바 상태 변경. */
  onSidebarState?: (
    callback: (state: NativeSidebarState) => void,
  ) => () => void;
  /** 셸·탭 화면: 전화 팝업 층이 창 아래쪽을 차지한 높이(알림을 그 위로 올린다). */
  getOverlayInset?: () => Promise<CallOverlayInset>;
  onOverlayInset?: (callback: (inset: CallOverlayInset) => void) => () => void;
  /** 셸·팝업 층: 알림을 보이는 탭 화면에서 띄운다. */
  showToast?: (toast: WindowToast) => void;
  /** 셸·탭 화면: 다른 곳에서 보낸 알림. */
  onToast?: (callback: (toast: WindowToast) => void) => () => void;
  /** 탭 화면: 사이드바 접기/펴기 요청. 그 창의 모든 탭 화면이 따른다. */
  requestSidebarOpen?: (open: boolean) => void;
}

/**
 * 로그인 세션의 주인은 main이다. 화면은 세션을 읽고, 자기가 보여 주는 계정의
 * 세션 번호로 토큰·로그아웃·401 확인을 요청한다.
 */
interface DesktopAuthBridge {
  getSession: () => Promise<DesktopAuthSessionSnapshot>;
  onSession: (
    callback: (snapshot: DesktopAuthSessionSnapshot) => void,
  ) => () => void;
  /** 화면이 보여 주는 세션이 지금 세션이 아니면 null. */
  getToken: (scope: DesktopAuthSessionScope) => Promise<string | null>;
  logout: (scope: DesktopAuthSessionScope) => Promise<DesktopAuthActionResult>;
  refreshUser: () => Promise<DesktopAuthRefreshResult>;
  reportUnauthorized: (
    scope: DesktopAuthSessionScope,
  ) => Promise<DesktopAuthActionResult>;
  /** 셸 창에만 있다. 로그인 화면이 받은 아이디·비밀번호로 main이 로그인한다. */
  login?: (credentials: DesktopAuthCredentials) => Promise<DesktopAuthLoginResult>;
  /** 셸 창에만 있다. 가입 화면이 받은 값으로 계정을 만들고 바로 로그인한다. */
  signup?: (input: DesktopAuthSignupInput) => Promise<DesktopAuthSignupResult>;
  /** 셸 창에만 있다. 서버에 닿지 못한 상태에서 다시 확인한다. */
  retry?: () => Promise<DesktopAuthActionResult>;
}

/**
 * 서버 실시간 연결은 main에 하나뿐이다. 화면은 이벤트를 받고 방 구독만 요청한다.
 * 셸과 탭 화면에 있다(전화 팝업 층에는 없다).
 */
interface DesktopRealtimeBridge {
  onEvent: (callback: (event: RealtimeEventMessage) => void) => () => void;
  /** 화면이 보여 주는 세션이 지금 세션일 때만 받는다. */
  subscribe: (request: RealtimeRoomRequest) => Promise<{ ok: boolean }>;
  unsubscribe: (request: RealtimeRoomRequest) => void;
  getStatus: () => Promise<RealtimeStatus>;
}

/**
 * 전화(CTI). 통화 상태의 주인은 main이다.
 * 셸·탭 화면은 통화 상태와 Bridge 상태를 읽고 발신만 요청한다(위쪽 다섯 개).
 * 팝업 층은 자기에게 온 통화 상태를 그리고 팝업의 버튼을 보낸다(아래쪽 네 개).
 */
interface CtiBridge {
  getStatus?: () => Promise<CtiStatus>;
  onStatus?: (callback: (status: CtiStatus) => void) => () => void;
  getCall?: () => Promise<ActiveCall | null>;
  onCall?: (callback: (call: ActiveCall | null) => void) => () => void;
  dial?: (request: CtiDialRequest) => Promise<CtiDialResult>;
  /** 팝업 층: 지금 통화 상태. */
  getOverlayState?: () => Promise<unknown>;
  onOverlayState?: (callback: (state: unknown) => void) => () => void;
  sendOverlayAction?: (action: CallOverlayAction) => void;
  reportOverlaySize?: (size: CallOverlaySize) => void;
}

export type { DesktopAuthBridge };

interface ElectronBridge {
  platform: string;
  surface: RendererSurfaceInfo;
  auth: DesktopAuthBridge;
  realtime?: DesktopRealtimeBridge;
  updater?: UpdaterBridge;
  tabs: TabsBridge;
  cti?: CtiBridge;
}

declare global {
  interface Window {
    electronBridge?: ElectronBridge;
  }
}

export {};
