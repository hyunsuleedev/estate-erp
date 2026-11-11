import type {
  ApplyTabTransferSnapshot,
  BeginDragPayload,
  CommitTabTransfer,
  DetachPayload,
  DragPositionPayload,
  FinalTabTransferSnapshotAck,
  InitialTabTransfer,
  InitialTabTransferAck,
  OpenPropertyWindowPayload,
  Tab,
  TabTransferCommitted,
  TabTransferAborted,
  TabWorkspaceSnapshot,
} from '@estate-erp/shared';
import type {
  DesktopAuthSignOutRequest,
  DesktopAuthSignOutResponse,
  DesktopAuthSessionSnapshot,
  DesktopAuthTokenRequest,
  DesktopAuthTokenResponse,
  DesktopAuthTokenScope,
} from '../common/desktopAuth';
import type {
  DesktopAuthProviderKind,
  DesktopProviderAuthState,
  DesktopProviderCredentials,
  DesktopProviderLoginResult,
  DesktopProviderSessionChange,
} from '../common/desktopAuthProvider';
import type {
  RealtimeAuthorityClaim,
  RealtimeAuthorityRelease,
  RealtimeAuthoritySnapshot,
} from '../common/desktopRealtime';
import type {
  NativeTabAction,
  NativeTabActionEnvelope,
} from '../common/nativeTabActions';
import type {
  CallOverlayAction,
  CallOverlayInset,
  CallOverlaySize,
  WindowToast,
} from '../common/callOverlay';
import type {
  NativeSidebarState,
  NativeTabAssignment,
  NativeTabLifecycleUpdate,
  NativeTabNavigateCommand,
  NativeTabRetentionUpdate,
  NativeTabStateUpdate,
  NativeTabViewportPayload,
  NativeTabViewportReleasePayload,
  NativeTabViewportResult,
} from '../common/nativeTabs';
import type { RendererSurfaceInfo } from '../common/rendererSurface';
import type { TabCommand, TabMenuItem } from '../common/tabCommands';
import type {
  WindowWorkspaceOwner,
  WindowWorkspaceSyncPayload,
} from '../common/windowWorkspace';

interface CodexStartArgs {
  runId: string;
  prompt: string;
  cwd?: string;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  model?: string;
  resumeSessionId?: string | null;
  dangerouslyBypass?: boolean;
  authToken?: string;
  apiBaseUrl?: string;
}

interface CodexStartResult {
  ok: boolean;
  pid?: number;
  error?: string;
}

interface CodexStopResult {
  ok: boolean;
  error?: string;
}

interface CodexEventPayload {
  runId: string;
  kind:
    | 'started'
    | 'event'
    | 'stdout'
    | 'stderr'
    | 'error'
    | 'closed'
    | 'session';
  pid?: number;
  resumedFrom?: string | null;
  sessionId?: string | null;
  unknownSession?: boolean;
  cleanedStderr?: string;
  event?: {
    type: string;
    [key: string]: unknown;
  };
  line?: string;
  message?: string;
  code?: number | null;
  signal?: string | null;
}

interface CodexBridge {
  start: (args: CodexStartArgs) => Promise<CodexStartResult>;
  stop: (runId: string) => Promise<CodexStopResult>;
  onEvent: (callback: (payload: CodexEventPayload) => void) => () => void;
}

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
}

interface TabsBridge {
  syncNativeViewport?: (
    payload: NativeTabViewportPayload,
  ) => Promise<NativeTabViewportResult>;
  releaseNativeViewport?: (payload: NativeTabViewportReleasePayload) => void;
  hasUnsavedNativeTabWork?: (tabId: string) => Promise<boolean>;
  onNativeTabState?: (
    callback: (update: NativeTabStateUpdate) => void,
  ) => () => void;
  onNativeTabSnapshot?: (callback: (tab: Tab) => void) => () => void;
  onNativeTabLifecycle?: (
    callback: (update: NativeTabLifecycleUpdate) => void,
  ) => () => void;
  getNativeTabSnapshot?: () => Promise<Tab | null>;
  setRetention?: (update: NativeTabRetentionUpdate) => void;
  openPropertyWindow: (
    payload: OpenPropertyWindowPayload,
  ) => Promise<{ ok: boolean; windowId?: number; error?: string }>;
  detach: (
    payload: DetachPayload,
  ) => Promise<{ ok: boolean; windowId?: number; error?: string }>;
  beginDrag: (
    payload: BeginDragPayload,
  ) => Promise<{ ok: boolean; windowId?: number; error?: string }>;
  updateDragPosition: (payload: DragPositionPayload) => void;
  endDrag: (transferId: string) => void;
  setGlobalOverlayVisible?: (
    source: 'cti' | 'updater',
    visible: boolean,
  ) => void;
  broadcastInvalidate: (queryKey: readonly unknown[]) => void;
  onInvalidate: (
    callback: (payload: {
      queryKey: readonly unknown[];
      sourceWindowId: number;
    }) => void,
  ) => () => void;
  getWindowKind: () => Promise<'main' | 'detached' | null>;
  getWindowWorkspace: (
    owner: WindowWorkspaceOwner,
  ) => Promise<TabWorkspaceSnapshot | null>;
  syncWindowWorkspace: (
    payload: WindowWorkspaceSyncPayload,
  ) => Promise<{ ok: boolean; error?: string }>;
  getInitialTab: (
    owner: WindowWorkspaceOwner,
  ) => Promise<InitialTabTransfer | null>;
  acceptInitialTab: (
    ack: InitialTabTransferAck,
  ) => Promise<{ ok: boolean; error?: string }>;
  commitTransfer: (
    commit: CommitTabTransfer,
  ) => Promise<{ ok: boolean; error?: string }>;
  prepareTransferSnapshot: (
    commit: CommitTabTransfer,
  ) => Promise<{ ok: boolean; error?: string }>;
  onApplyTransferSnapshot: (
    callback: (snapshot: ApplyTabTransferSnapshot) => void,
  ) => () => void;
  acceptTransferSnapshot: (
    ack: FinalTabTransferSnapshotAck,
  ) => Promise<{ ok: boolean; error?: string }>;
  onTransferCommitted: (
    callback: (commit: TabTransferCommitted) => void,
  ) => () => void;
  onTransferAborted: (
    callback: (abort: TabTransferAborted) => void,
  ) => () => void;
  syncWindowTabs: (payload: WindowWorkspaceSyncPayload) => void;
  closeWindow: () => void;
  openInMainWindow: (route: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenRoute: (callback: (route: string) => void) => () => void;
  /** 셸 창: main이 받은 탭 단축키·마우스 버튼 명령 */
  onTabCommand?: (callback: (command: TabCommand) => void) => () => void;
  /** 셸 창: native 메뉴를 띄우고 고른 항목 id를 돌려준다. 취소하면 null */
  showMenu?: (items: TabMenuItem[]) => Promise<string | null>;
  /** native 탭: 받은 명령을 셸 창으로 보낸다 */
  requestTabCommand?: (command: TabCommand) => void;
  /** 창 단위 사이드바 펼침 상태(셸·탭 화면 공통). */
  getSidebarState?: () => Promise<NativeSidebarState>;
  /** 셸: 이 창의 사이드바 상태를 정하고 탭 화면들에 알린다. */
  setSidebarOpen?: (open: boolean) => void;
  /** 셸: 탭 화면 안에서 사이드바를 접거나 편 요청. */
  onSidebarOpenRequested?: (
    callback: (state: NativeSidebarState) => void,
  ) => () => void;
  /** 셸: 탭 화면이 보낸 탭 작업(새 탭, 탭 바꾸기, 닫기, 입력 초안). */
  onNativeTabAction?: (
    callback: (envelope: NativeTabActionEnvelope) => void,
  ) => () => void;
  /** 탭 화면: 사이드바와 화면 틀을 처음 그렸다는 신호. */
  notifyReady?: () => void;
  /** 탭 화면: 탭 목록을 바꾸는 작업을 자기 창의 셸에 요청한다. */
  sendTabAction?: (action: NativeTabAction) => void;
  /** 탭 화면: 셸이 바꾼 이 탭의 주소. 다시 로드하지 않고 화면 안에서 옮긴다. */
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
  /** 탭 화면: 사이드바 접기/펴기 요청(창 상태의 주인은 셸). */
  requestSidebarOpen?: (open: boolean) => void;
}

interface DesktopAuthBridge {
  publishSession: (
    snapshot: Omit<DesktopAuthSessionSnapshot, 'revision'>,
  ) => Promise<{
    ok: boolean;
    snapshot?: DesktopAuthSessionSnapshot;
    error?: string;
  }>;
  getSession: () => Promise<DesktopAuthSessionSnapshot>;
  /** Auth0 모드의 셸은 화면 계정의 세션 번호를 보낸다. 번호가 다르면 null. */
  getToken: (scope?: DesktopAuthTokenScope) => Promise<string | null>;
  resolveToken: (
    response: DesktopAuthTokenResponse,
  ) => Promise<{ ok: boolean; error?: string }>;
  onTokenRequest: (
    callback: (request: DesktopAuthTokenRequest) => void,
  ) => () => void;
  onSession: (
    callback: (snapshot: DesktopAuthSessionSnapshot) => void,
  ) => () => void;
  onSignOutRequest: (
    callback: (request: DesktopAuthSignOutRequest) => void,
  ) => () => void;
  resolveSignOut: (
    response: DesktopAuthSignOutResponse,
  ) => Promise<{ ok: boolean; error?: string }>;
  requestSignOut: () => Promise<{ ok: boolean; error?: string }>;
  /** 셸 창에만 있다. auth0이면 로그인·토큰을 main이 맡는다. */
  provider?: DesktopAuthProviderKind;
  getProviderState?: () => Promise<DesktopProviderAuthState>;
  /** 로그인 화면이 받은 아이디·비밀번호로 main이 Auth0 로그인한다. */
  providerLogin?: (
    credentials: DesktopProviderCredentials,
  ) => Promise<DesktopProviderLoginResult>;
  /**
   * 화면이 보여 주는 계정의 세션이 지금 세션일 때만 main의 refresh token을
   * 지우고 Auth0에서도 폐기한다.
   */
  providerLogout?: (
    scope: DesktopAuthTokenScope,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** refresh token이 거절되어 main의 세션이 끝났다. */
  onProviderSessionEnded?: (callback: () => void) => () => void;
  /** main 세션 번호가 바뀌었다(어느 창에서든 로그인·로그아웃). */
  onProviderSessionChanged?: (
    callback: (change: DesktopProviderSessionChange) => void,
  ) => () => void;
}

interface DesktopRealtimeBridge {
  claimAuthority: (
    claim: RealtimeAuthorityClaim,
  ) => Promise<{
    ok: boolean;
    snapshot?: RealtimeAuthoritySnapshot;
    error?: string;
  }>;
  releaseAuthority: (release: RealtimeAuthorityRelease) => void;
  onAuthority: (
    callback: (snapshot: RealtimeAuthoritySnapshot) => void,
  ) => () => void;
}

/** CTI Bridge → 서버 계약과 동일 (packages/shared/src/cti.ts CtiCallEvent) */
interface CtiEventPayload {
  type: 'ring' | 'terminate' | 'ctc_result';
  vendor: string;
  caller: string;
  callee: string;
  lineId?: string;
  seqno?: string;
  durationSec?: number;
  occurredAt: string;
}

interface CtiStatusPayload {
  bridgeConnected: boolean;
  bridge: {
    type: 'status';
    vendor: string;
    connected: boolean;
    loggedIn: boolean;
    lines: string[];
    bridgeVersion: string;
  } | null;
}

/**
 * 셸 창은 Bridge 이벤트와 팝업 층 제어를, 팝업 층은 통화 상태 구독과 버튼 전달을 쓴다.
 * 탭 화면에는 없다.
 */
interface CtiBridge {
  getStatus?: () => Promise<CtiStatusPayload>;
  dial?: (payload: {
    callee: string;
    caller?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onEvent?: (callback: (payload: CtiEventPayload) => void) => () => void;
  onStatus?: (callback: (payload: CtiStatusPayload) => void) => () => void;
  /** 셸: 통화 상태를 탭 화면 위의 팝업 층에 보낸다. null이면 숨긴다. */
  setOverlayState?: (state: unknown) => void;
  /** 셸: 팝업 층에서 누른 닫기·다시 조회·통화 기록 갱신. */
  onOverlayAction?: (callback: (action: CallOverlayAction) => void) => () => void;
  /** 팝업 층: 지금 통화 상태. */
  getOverlayState?: () => Promise<unknown>;
  onOverlayState?: (callback: (state: unknown) => void) => () => void;
  sendOverlayAction?: (action: CallOverlayAction) => void;
  reportOverlaySize?: (size: CallOverlaySize) => void;
}

interface ElectronBridge {
  platform: string;
  surface: RendererSurfaceInfo;
  auth: DesktopAuthBridge;
  realtime?: DesktopRealtimeBridge;
  onToggleSidebar?: (callback: () => void) => () => void;
  onFullscreenChanged?: (
    callback: (isFullscreen: boolean) => void,
  ) => () => void;
  getPlatform?: () => Promise<string>;
  isFullscreen?: () => Promise<boolean>;
  updater?: UpdaterBridge;
  tabs: TabsBridge;
  codex?: CodexBridge;
  cti?: CtiBridge;
}

declare global {
  interface Window {
    electronBridge?: ElectronBridge;
  }
}

export {};
