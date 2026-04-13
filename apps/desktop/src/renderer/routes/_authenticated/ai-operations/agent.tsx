import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Play, Plus, Square, Terminal } from 'lucide-react';
import { getToken } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

type Entry =
  | { kind: 'user'; at: number; text: string }
  | { kind: 'status'; at: number; text: string }
  | { kind: 'agent'; at: number; text: string }
  | { kind: 'reasoning'; at: number; text: string }
  | { kind: 'tool'; at: number; text: string }
  | { kind: 'stderr'; at: number; text: string }
  | { kind: 'usage'; at: number; text: string };

function formatUsage(usage: Record<string, unknown> | undefined): string {
  if (!usage) return '턴 완료';
  const inp = usage.input_tokens as number | undefined;
  const cached = usage.cached_input_tokens as number | undefined;
  const out = usage.output_tokens as number | undefined;
  const parts: string[] = [];
  if (inp !== undefined) parts.push(`입력 ${inp.toLocaleString()}`);
  if (cached !== undefined && cached > 0) parts.push(`캐시 ${cached.toLocaleString()}`);
  if (out !== undefined) parts.push(`출력 ${out.toLocaleString()}`);
  return parts.length ? `턴 완료 · ${parts.join(' / ')}토큰` : '턴 완료';
}

function eventToEntry(event: { type: string; [key: string]: unknown }): Entry | null {
  const at = Date.now();
  switch (event.type) {
    case 'thread.started':
      return null; // surface via session id header instead
    case 'turn.started':
      return { kind: 'status', at, text: '턴 시작' };
    case 'turn.completed':
      return {
        kind: 'usage',
        at,
        text: formatUsage(event.usage as Record<string, unknown> | undefined),
      };
    case 'turn.failed': {
      const err = event.error as { message?: string } | undefined;
      return { kind: 'stderr', at, text: `턴 실패: ${err?.message ?? '알 수 없는 오류'}` };
    }
    case 'error': {
      const msg = (event.message as string | undefined) ?? JSON.stringify(event);
      return { kind: 'stderr', at, text: `codex 오류: ${msg}` };
    }
    case 'item.completed': {
      const item = event.item as
        | { type: string; text?: string; command?: string; output?: string }
        | undefined;
      if (!item) return null;
      if (item.type === 'agent_message') {
        return { kind: 'agent', at, text: item.text ?? '' };
      }
      if (item.type === 'reasoning') {
        return { kind: 'reasoning', at, text: item.text ?? '' };
      }
      if (item.type === 'command_execution' || item.type === 'shell_command') {
        const body = [item.command, item.output].filter(Boolean).join('\n');
        return { kind: 'tool', at, text: body || JSON.stringify(item) };
      }
      return { kind: 'tool', at, text: `${item.type}: ${JSON.stringify(item).slice(0, 500)}` };
    }
    default:
      return null;
  }
}

export const Route = createFileRoute('/_authenticated/ai-operations/agent')({
  component: AgentPage,
});

function AgentPage() {
  const [draft, setDraft] = useState('');
  const [cwd, setCwd] = useState('');
  const [sandbox, setSandbox] = useState<SandboxMode>('read-only');
  const [model, setModel] = useState('');
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [bridgeAvailable, setBridgeAvailable] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  // Keep refs for values needed inside the event callback without
  // re-subscribing on every change.
  const runIdRef = useRef<string | null>(null);
  const lastPromptRef = useRef<string>('');
  const retriedRef = useRef<boolean>(false);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  const appendEntries = useCallback((items: Entry[]) => {
    setEntries((prev) => [...prev, ...items]);
  }, []);

  const spawnCodex = useCallback(
    async (prompt: string, resumeFrom: string | null) => {
      const bridge = window.electronBridge?.codex;
      if (!bridge) return;
      const newRunId = crypto.randomUUID();
      runIdRef.current = newRunId;
      setRunId(newRunId);
      setRunning(true);
      const result = await bridge.start({
        runId: newRunId,
        prompt,
        cwd: cwd.trim() || undefined,
        sandbox,
        model: model.trim() || undefined,
        resumeSessionId: resumeFrom,
        authToken: getToken() ?? undefined,
        apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
      });
      if (!result.ok) {
        appendEntries([
          { kind: 'stderr', at: Date.now(), text: `시작 실패: ${result.error}` },
        ]);
        setRunning(false);
      }
    },
    [cwd, sandbox, model, appendEntries],
  );

  useEffect(() => {
    const bridge = window.electronBridge?.codex;
    if (!bridge) {
      setBridgeAvailable(false);
      return;
    }
    const off = bridge.onEvent((payload) => {
      if (!runIdRef.current || payload.runId !== runIdRef.current) return;
      if (payload.kind === 'started') {
        appendEntries([
          {
            kind: 'status',
            at: Date.now(),
            text: payload.resumedFrom
              ? `codex 실행 (pid ${payload.pid}, 세션 이어감 ${payload.resumedFrom.slice(0, 8)}…)`
              : `codex 실행 (pid ${payload.pid}, 새 세션)`,
          },
        ]);
      } else if (payload.kind === 'session' && payload.sessionId) {
        setSessionId(payload.sessionId);
      } else if (payload.kind === 'event' && payload.event) {
        const entry = eventToEntry(payload.event);
        if (entry) appendEntries([entry]);
      } else if (payload.kind === 'stdout' && payload.line) {
        appendEntries([
          { kind: 'status', at: Date.now(), text: payload.line ?? '' },
        ]);
      } else if (payload.kind === 'stderr' && payload.line) {
        appendEntries([
          { kind: 'stderr', at: Date.now(), text: payload.line ?? '' },
        ]);
      } else if (payload.kind === 'error' && payload.message) {
        appendEntries([
          { kind: 'stderr', at: Date.now(), text: `오류: ${payload.message}` },
        ]);
      } else if (payload.kind === 'closed') {
        // Paperclip's unknown-session recovery: if resume failed, auto-retry
        // once with a fresh session using the same prompt.
        if (
          payload.unknownSession &&
          !retriedRef.current &&
          lastPromptRef.current
        ) {
          retriedRef.current = true;
          appendEntries([
            {
              kind: 'status',
              at: Date.now(),
              text: '이전 세션을 찾을 수 없어 새 세션으로 재시도합니다.',
            },
          ]);
          setSessionId(null);
          // fire-and-forget; new run id will supersede
          void spawnCodex(lastPromptRef.current, null);
          return;
        }

        const sig = payload.signal ? ` (${payload.signal})` : '';
        appendEntries([
          {
            kind: 'status',
            at: Date.now(),
            text: `프로세스 종료 · exit ${payload.code ?? '?'}${sig}`,
          },
        ]);
        setRunning(false);
        runIdRef.current = null;
      }
    });
    return off;
  }, [appendEntries, spawnCodex]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  const send = useCallback(async () => {
    const bridge = window.electronBridge?.codex;
    const prompt = draft.trim();
    if (!bridge || !prompt || running) return;
    lastPromptRef.current = prompt;
    retriedRef.current = false;
    appendEntries([{ kind: 'user', at: Date.now(), text: prompt }]);
    setDraft('');
    await spawnCodex(prompt, sessionId);
  }, [draft, running, sessionId, spawnCodex, appendEntries]);

  const stop = useCallback(async () => {
    const bridge = window.electronBridge?.codex;
    if (!bridge || !runId) return;
    await bridge.stop(runId);
  }, [runId]);

  const startNewConversation = useCallback(() => {
    if (running) return;
    setSessionId(null);
    setEntries([]);
    retriedRef.current = false;
    lastPromptRef.current = '';
  }, [running]);

  const sandboxHint = useMemo(() => {
    switch (sandbox) {
      case 'read-only':
        return '파일 읽기만 허용. 가장 안전.';
      case 'workspace-write':
        return '작업 디렉터리 안에서만 쓰기 허용.';
      case 'danger-full-access':
        return '경고: 샌드박스 없이 모든 명령 실행. 신중히 사용.';
    }
  }, [sandbox]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Badge variant="outline" className="w-fit">
          Codex CLI Adapter
        </Badge>
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Bot className="size-5" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">AI 에이전트 (Codex)</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              로컬 <code className="rounded bg-muted px-1">codex</code> CLI를 Electron 프로세스로
              띄워 AI 작업을 ERP 화면 안에서 확인합니다. 같은 스레드에서 대화를 이어가며
              JSONL 이벤트를 실시간 스트리밍합니다.
            </p>
          </div>
        </div>
      </div>

      {!bridgeAvailable && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">
            이 페이지는 Electron 데스크톱 앱에서만 동작합니다. 브라우저에서는 codex CLI에 접근할
            수 없습니다.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>실행 설정</CardTitle>
            <CardDescription>
              이 값들은 다음 턴부터 적용됩니다. 실행 중에는 수정할 수 없습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cwd">작업 디렉터리</Label>
              <Input
                id="cwd"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="비워두면 Electron 프로세스 cwd"
                disabled={running}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">모델 (선택)</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="예: gpt-5-codex"
                disabled={running}
              />
            </div>
            <div className="space-y-2">
              <Label>샌드박스</Label>
              <Select
                value={sandbox}
                onValueChange={(v) => setSandbox(v as SandboxMode)}
                disabled={running}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read-only">read-only</SelectItem>
                  <SelectItem value="workspace-write">workspace-write</SelectItem>
                  <SelectItem value="danger-full-access">danger-full-access</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{sandboxHint}</p>
            </div>
            <div className="space-y-1 rounded border border-border bg-muted/30 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">세션</span>
                <code className="font-mono">
                  {sessionId ? `${sessionId.slice(0, 8)}…` : '없음'}
                </code>
              </div>
              <p className="text-muted-foreground">
                같은 세션이 유지되는 동안 codex가 이전 턴을 기억합니다.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full gap-2"
                onClick={startNewConversation}
                disabled={running || (!sessionId && entries.length === 0)}
              >
                <Plus className="size-4" /> 새 대화
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="size-4" />
              대화
            </CardTitle>
            <CardDescription>
              JSONL 이벤트를 파싱해 사용자/에이전트/툴 호출을 시간 순으로 보여줍니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              ref={logRef}
              className="h-[480px] overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-5"
            >
              {entries.length === 0 ? (
                <p className="text-muted-foreground">
                  아직 대화가 없습니다. 아래 입력창에 프롬프트를 입력하세요.
                </p>
              ) : (
                <div className="space-y-3">
                  {entries.map((entry, idx) => (
                    <EntryRow key={idx} entry={entry} />
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="프롬프트 입력 (Cmd/Ctrl+Enter로 전송)"
                rows={3}
                disabled={running}
              />
              <div className="flex items-center gap-2">
                {running ? (
                  <Button variant="destructive" onClick={stop} className="gap-2">
                    <Square className="size-4" /> 중단
                  </Button>
                ) : (
                  <Button
                    onClick={send}
                    disabled={!bridgeAvailable || !draft.trim()}
                    className="gap-2"
                  >
                    <Play className="size-4" /> 전송
                  </Button>
                )}
                {running && (
                  <span className="text-xs text-muted-foreground">codex 실행 중...</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const time = new Date(entry.at).toLocaleTimeString();
  const prefix = (label: string, tone: string) => (
    <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase ${tone}`}>
      {label}
    </span>
  );
  switch (entry.kind) {
    case 'user':
      return (
        <div className="rounded border border-border bg-background p-3 font-sans text-sm">
          <div className="mb-1 flex items-center gap-2 text-xs">
            {prefix('user', 'bg-foreground/10 text-foreground')}
            <span className="opacity-60">{time}</span>
          </div>
          <div className="whitespace-pre-wrap">{entry.text}</div>
        </div>
      );
    case 'status':
      return (
        <div className="text-muted-foreground">
          <span className="mr-2 text-[10px] opacity-60">{time}</span>
          {prefix('status', 'bg-muted text-muted-foreground')}
          <span>{entry.text}</span>
        </div>
      );
    case 'agent':
      return (
        <div className="rounded border border-primary/20 bg-primary/5 p-3 font-sans text-sm">
          <div className="mb-1 flex items-center gap-2 text-xs text-primary/80">
            {prefix('agent', 'bg-primary/10 text-primary')}
            <span className="opacity-60">{time}</span>
          </div>
          <div className="whitespace-pre-wrap">{entry.text}</div>
        </div>
      );
    case 'reasoning':
      return (
        <div className="text-muted-foreground/80">
          {prefix('reasoning', 'bg-muted text-muted-foreground')}
          <span className="whitespace-pre-wrap italic">{entry.text}</span>
        </div>
      );
    case 'tool':
      return (
        <div className="rounded border border-border bg-background/60 p-2">
          <div className="mb-1 flex items-center gap-2">
            {prefix('tool', 'bg-amber-500/10 text-amber-700 dark:text-amber-400')}
            <span className="text-[10px] opacity-60">{time}</span>
          </div>
          <pre className="whitespace-pre-wrap break-all">{entry.text}</pre>
        </div>
      );
    case 'stderr':
      return (
        <div className="text-destructive">
          {prefix('stderr', 'bg-destructive/10 text-destructive')}
          <span className="whitespace-pre-wrap">{entry.text}</span>
        </div>
      );
    case 'usage':
      return (
        <div className="text-muted-foreground">
          {prefix('usage', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400')}
          <span>{entry.text}</span>
        </div>
      );
  }
}
