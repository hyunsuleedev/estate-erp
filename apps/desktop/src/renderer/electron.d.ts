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
  kind: 'started' | 'event' | 'stdout' | 'stderr' | 'error' | 'closed' | 'session';
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
  | { state: 'disabled'; currentVersion: string; reason: string; startedAt: number }
  | { state: 'idle'; currentVersion: string; startedAt: number }
  | { state: 'checking'; currentVersion: string; manual?: boolean; startedAt: number }
  | { state: 'available'; currentVersion: string; version?: string; releaseName?: string; manual?: boolean; startedAt: number }
  | { state: 'not-available'; currentVersion: string; manual?: boolean; startedAt: number }
  | { state: 'downloaded'; currentVersion: string; version?: string; releaseName?: string; releaseNotes?: string; startedAt: number }
  | { state: 'error'; currentVersion: string; message: string; manual?: boolean; startedAt: number };

interface UpdaterBridge {
  getStatus: () => Promise<DesktopUpdateStatus>;
  check: () => Promise<DesktopUpdateStatus>;
  install: () => Promise<{ ok: boolean; error?: string }>;
  onStatus: (callback: (payload: DesktopUpdateStatus) => void) => () => void;
}

interface TabBridgePayloadTab {
  id: string;
  kind: string;
  title: string;
  route: string;
  routeParams?: Record<string, unknown>;
  uiState?: {
    scrollY?: number;
    formDraft?: Record<string, unknown>;
  };
  createdAt: number;
}

interface TabBridgeDetachPayload {
  tab: TabBridgePayloadTab;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}

interface TabBridgeBeginDragPayload {
  tab: TabBridgePayloadTab;
  pointerScreen: { x: number; y: number };
  mouseOffset: { x: number; y: number };
  size?: { width: number; height: number };
}

interface TabsBridge {
  detach: (
    payload: TabBridgeDetachPayload,
  ) => Promise<{ ok: boolean; windowId?: number; error?: string }>;
  beginDrag: (
    payload: TabBridgeBeginDragPayload,
  ) => Promise<{ ok: boolean; windowId?: number; error?: string }>;
  updateDragPosition: (pointerScreen: { x: number; y: number }) => void;
  endDrag: () => void;
  broadcastInvalidate: (queryKey: readonly unknown[]) => void;
  onInvalidate: (
    callback: (payload: { queryKey: readonly unknown[]; sourceWindowId: number }) => void,
  ) => () => void;
  getWindowKind: () => Promise<'main' | 'detached'>;
  getInitialTab: () => Promise<TabBridgePayloadTab | null>;
  closeWindow: () => void;
  openInMainWindow: (route: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenRoute: (callback: (route: string) => void) => () => void;
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
  dial: (payload: { callee: string; caller?: string }) => Promise<{ ok: boolean; error?: string }>;
  onEvent: (callback: (payload: CtiEventPayload) => void) => () => void;
  onStatus: (callback: (payload: CtiStatusPayload) => void) => () => void;
}

type CpCredentialProvider = 'esiljang' | 'budongsanbank';

interface CpCredentialStatus {
  provider: CpCredentialProvider;
  hasCredentials: boolean;
  maskedUsername: string | null;
  updatedAt: string | null;
  lastVerifiedAt: string | null;
}

interface CpCredentialVaultStatus {
  available: boolean;
  deviceId: string;
  encryptionBackend: string;
  providers: CpCredentialStatus[];
}

interface CpAuthPrepareResult {
  provider: CpCredentialProvider;
  deviceId: string;
  status: 'authenticated' | 'credentials_missing' | 'needs_input' | 'error';
  targetUrl: string | null;
  windowId: number | null;
  message: string;
}

interface CpAuthBridge {
  getStatus: (input: { officeId: string }) => Promise<CpCredentialVaultStatus>;
  save: (input: {
    officeId: string;
    provider: CpCredentialProvider;
    username: string;
    password: string;
  }) => Promise<CpCredentialVaultStatus>;
  remove: (input: {
    officeId: string;
    provider: CpCredentialProvider;
  }) => Promise<CpCredentialVaultStatus>;
  prepareSession: (input: {
    officeId: string;
    provider: CpCredentialProvider;
  }) => Promise<CpAuthPrepareResult>;
}

interface ElectronBridge {
  platform: string;
  onToggleSidebar: (callback: () => void) => () => void;
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => () => void;
  getPlatform: () => Promise<string>;
  isFullscreen: () => Promise<boolean>;
  updater: UpdaterBridge;
  tabs: TabsBridge;
  codex: CodexBridge;
  cti: CtiBridge;
  cpAuth: CpAuthBridge;
}

declare global {
  interface Window {
    electronBridge?: ElectronBridge;
  }
}

export {};
