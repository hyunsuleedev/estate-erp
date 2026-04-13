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

interface ElectronBridge {
  platform: string;
  onToggleSidebar: (callback: () => void) => () => void;
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => () => void;
  getPlatform: () => Promise<string>;
  isFullscreen: () => Promise<boolean>;
  codex: CodexBridge;
}

declare global {
  interface Window {
    electronBridge?: ElectronBridge;
  }
}

export {};
