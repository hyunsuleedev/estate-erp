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

interface TabsBridge {
  detach: (
    payload: TabBridgeDetachPayload,
  ) => Promise<{ ok: boolean; windowId?: number; error?: string }>;
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

interface ElectronBridge {
  platform: string;
  onToggleSidebar: (callback: () => void) => () => void;
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => () => void;
  getPlatform: () => Promise<string>;
  isFullscreen: () => Promise<boolean>;
  tabs: TabsBridge;
  codex: CodexBridge;
}

declare global {
  interface Window {
    electronBridge?: ElectronBridge;
  }
}

export {};
