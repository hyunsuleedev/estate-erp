import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import started from 'electron-squirrel-startup';
import { WindowManager, registerTabIpcHandlers } from './main/windowManager';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Enable Chrome DevTools Protocol in development so agent-browser / Playwright
// can attach to the renderer. Must run before app.on('ready').
if (!app.isPackaged) {
  const port = process.env.ELECTRON_REMOTE_DEBUGGING_PORT ?? '9333';
  app.commandLine.appendSwitch('remote-debugging-port', port);
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}

const windowManager = new WindowManager();

const createWindow = () => {
  windowManager.createMainWindow();
};

// IPC: send message to renderer
ipcMain.on('toggle-sidebar', () => {
  windowManager.getMainWindow()?.webContents.send('toggle-sidebar');
});

ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('is-fullscreen', () => windowManager.getMainWindow()?.isFullScreen() ?? false);

registerTabIpcHandlers(windowManager);

// Known-harmless codex-internal stderr lines to suppress in the UI. Follows
// Paperclip's `stripCodexRolloutNoise` pattern but extends it: Paperclip only
// filters the rollout state-db warning; we also filter the rmcp transport
// worker noise that leaks when a user's registered MCP server has a broken
// auth token. Raw stderr is still
// preserved for unknown-session detection.
const CODEX_STDERR_NOISE_PATTERNS: RegExp[] = [
  // codex_core::rollout::list state db missing rollout path (Paperclip upstream)
  /^\d{4}-\d{2}-\d{2}T[^\s]+\s+ERROR\s+codex_core::rollout::list:\s+state db missing rollout path for thread\s+[a-z0-9-]+$/i,
  // rmcp transport worker errors from a registered MCP server's broken auth
  /^\d{4}-\d{2}-\d{2}T[^\s]+\s+ERROR\s+rmcp::transport::worker:\s+worker quit with fatal:.*Auth\(TokenRefreshFailed/i,
  // Generic rmcp transport channel closed (occurs together with the above)
  /^\d{4}-\d{2}-\d{2}T[^\s]+\s+ERROR\s+rmcp::transport::\w+:\s+.*Transport channel closed/i,
];

function isCodexStderrNoise(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return CODEX_STDERR_NOISE_PATTERNS.some((re) => re.test(trimmed));
}

const CODEX_UNKNOWN_SESSION_RE =
  /unknown (session|thread)|session .* not found|thread .* not found|conversation .* not found|missing rollout path for thread|state db missing rollout path|no rollout found for thread id/i;

// Paperclip strips these so spawned CLIs don't refuse to start with
// "cannot be launched inside another session" when the parent Electron
// was itself started from a Claude Code terminal.
const CLAUDE_CODE_NESTING_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION',
  'CLAUDE_CODE_PARENT_SESSION',
] as const;

const ESTATE_ERP_MCP_ENV_VAR = 'ESTATE_ERP_TOKEN';

function buildCodexEnv(authToken?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of CLAUDE_CODE_NESTING_VARS) {
    delete env[key];
  }
  if (!env.PATH || env.PATH.length === 0) {
    env.PATH = '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin';
  }
  if (authToken) {
    env[ESTATE_ERP_MCP_ENV_VAR] = authToken;
  }
  return env;
}

function stripCodexStderrNoise(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !isCodexStderrNoise(line))
    .join('\n');
}

function isCodexUnknownSessionError(stdout: string, stderr: string): boolean {
  const haystack = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return CODEX_UNKNOWN_SESSION_RE.test(haystack);
}

type CodexRun = {
  id: string;
  proc: ChildProcessWithoutNullStreams;
  stdoutBuf: string;
  stderrBuf: string;
  rawStdout: string;
  rawStderr: string;
  sessionIdFromThread: string | null;
  resumeSessionId: string | null;
};

const codexRuns = new Map<string, CodexRun>();

function sendCodex(runId: string, payload: unknown) {
  windowManager.getMainWindow()?.webContents.send('codex:event', { runId, ...(payload as object) });
}

function flushLines(buf: string, emit: (line: string) => void): string {
  const parts = buf.split('\n');
  const rest = parts.pop() ?? '';
  for (const line of parts) {
    if (line.length > 0) emit(line);
  }
  return rest;
}

type CodexStartArgs = {
  runId: string;
  prompt: string;
  cwd?: string;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  model?: string;
  resumeSessionId?: string | null;
  dangerouslyBypass?: boolean;
  authToken?: string;
  apiBaseUrl?: string;
};

function buildCodexArgs(args: CodexStartArgs): string[] {
  const cliArgs: string[] = ['exec', '--json'];

  // When auth token is present, codex needs full bypass to call MCP tools
  // without interactive approval. This mirrors Paperclip's approach.
  // Without auth token, respect the user-chosen sandbox mode.
  if (args.dangerouslyBypass || args.authToken) {
    cliArgs.push('--dangerously-bypass-approvals-and-sandbox');
  } else if (args.sandbox) {
    cliArgs.push('--sandbox', args.sandbox);
  }

  cliArgs.push('--skip-git-repo-check');
  cliArgs.push('--color', 'never');

  if (args.cwd) {
    cliArgs.push('--cd', args.cwd);
  }

  if (args.model) {
    cliArgs.push('--model', args.model);
  }

  // Auto-inject Estate ERP MCP server when auth token is available.
  // This means the user never has to run `codex mcp add` manually —
  // the Electron app handles registration per-run via -c overrides.
  if (args.authToken) {
    const mcpUrl = `${args.apiBaseUrl ?? 'http://localhost:3000'}/mcp`;
    cliArgs.push(
      '-c', `mcp_servers.estate_erp.url="${mcpUrl}"`,
      '-c', `mcp_servers.estate_erp.bearer_token_env_var="${ESTATE_ERP_MCP_ENV_VAR}"`,
    );
  }

  if (args.resumeSessionId) {
    cliArgs.push('resume', args.resumeSessionId, '-');
  } else {
    cliArgs.push('-');
  }

  return cliArgs;
}

ipcMain.handle('codex:start', (_e, args: CodexStartArgs) => {
  const { runId, prompt } = args;
  if (codexRuns.has(runId)) {
    return { ok: false, error: 'run already exists' };
  }

  const cwd = args.cwd ?? process.cwd();
  const cliArgs = buildCodexArgs({ ...args, cwd });

  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawn('codex', cliArgs, {
      cwd,
      env: buildCodexEnv(args.authToken),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Paperclip pattern: write the prompt to stdin and close. The trailing "-"
  // in argv tells codex to read the prompt from stdin.
  try {
    proc.stdin.write(prompt);
    proc.stdin.end();
  } catch (err) {
    sendCodex(runId, { kind: 'error', message: `stdin write failed: ${(err as Error).message}` });
  }

  const run: CodexRun = {
    id: runId,
    proc,
    stdoutBuf: '',
    stderrBuf: '',
    rawStdout: '',
    rawStderr: '',
    sessionIdFromThread: null,
    resumeSessionId: args.resumeSessionId ?? null,
  };
  codexRuns.set(runId, run);

  sendCodex(runId, {
    kind: 'started',
    pid: proc.pid,
    resumedFrom: args.resumeSessionId ?? null,
  });

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => {
    run.rawStdout += chunk;
    run.stdoutBuf = flushLines(run.stdoutBuf + chunk, (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const event = JSON.parse(trimmed);
        if (event && typeof event === 'object' && event.type === 'thread.started') {
          const threadId = (event as { thread_id?: unknown }).thread_id;
          if (typeof threadId === 'string' && threadId.length > 0) {
            run.sessionIdFromThread = threadId;
            sendCodex(runId, { kind: 'session', sessionId: threadId });
          }
        }
        sendCodex(runId, { kind: 'event', event });
      } catch {
        sendCodex(runId, { kind: 'stdout', line });
      }
    });
  });

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk: string) => {
    run.rawStderr += chunk;
    run.stderrBuf = flushLines(run.stderrBuf + chunk, (line) => {
      // Suppress rollout state-db warnings in the UI (Paperclip does the same).
      if (isCodexStderrNoise(line)) return;
      sendCodex(runId, { kind: 'stderr', line });
    });
  });

  proc.on('error', (err) => {
    sendCodex(runId, { kind: 'error', message: err.message });
  });

  proc.on('close', (code, signal) => {
    // Flush any trailing partial line.
    if (run.stdoutBuf.trim().length > 0) {
      try {
        const event = JSON.parse(run.stdoutBuf.trim());
        sendCodex(runId, { kind: 'event', event });
      } catch {
        sendCodex(runId, { kind: 'stdout', line: run.stdoutBuf });
      }
    }
    if (run.stderrBuf.trim().length > 0 && !isCodexStderrNoise(run.stderrBuf)) {
      sendCodex(runId, { kind: 'stderr', line: run.stderrBuf });
    }

    const nonZero = (code ?? 0) !== 0;
    const unknownSession =
      nonZero &&
      !!run.resumeSessionId &&
      isCodexUnknownSessionError(run.rawStdout, run.rawStderr);

    sendCodex(runId, {
      kind: 'closed',
      code,
      signal,
      sessionId: run.sessionIdFromThread,
      unknownSession,
      cleanedStderr: stripCodexStderrNoise(run.rawStderr).trim() || undefined,
    });
    codexRuns.delete(runId);
  });

  return { ok: true, pid: proc.pid };
});

ipcMain.handle('codex:stop', (_e, runId: string) => {
  const run = codexRuns.get(runId);
  if (!run) return { ok: false, error: 'not found' };
  run.proc.kill('SIGTERM');
  return { ok: true };
});

app.on('before-quit', () => {
  for (const run of codexRuns.values()) {
    try {
      run.proc.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  codexRuns.clear();
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
