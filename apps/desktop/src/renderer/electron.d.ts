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
} from '../common/desktopAuth';
import type {
  RealtimeAuthorityClaim,
  RealtimeAuthorityRelease,
  RealtimeAuthoritySnapshot,
} from '../common/desktopRealtime';
import type {
  NativeTabLifecycleUpdate,
  NativeTabRetentionUpdate,
  NativeTabStateUpdate,
  NativeTabViewportPayload,
  NativeTabViewportReleasePayload,
  NativeTabViewportResult,
} from '../common/nativeTabs';
import type { RendererSurfaceInfo } from '../common/rendererSurface';
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
  getToken: () => Promise<string | null>;
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

interface CtiBridge {
  getStatus: () => Promise<CtiStatusPayload>;
  dial: (payload: {
    callee: string;
    caller?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onEvent: (callback: (payload: CtiEventPayload) => void) => () => void;
  onStatus: (callback: (payload: CtiStatusPayload) => void) => () => void;
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
