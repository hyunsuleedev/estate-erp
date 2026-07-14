import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

/**
 * 32bit native-helper 자식 프로세스 관리자.
 *
 * KT(KTPCBizX)와 멀티CID(multicid.ocx)는 32bit COM/ActiveX 전용이라 Node에서
 * 직접 로드할 수 없다. 별도 32bit .NET 콘솔(native-helper/dotnet)을 자식
 * 프로세스로 띄우고 stdin/stdout JSON-lines로 통신한다.
 * 프로세스 분리 → COM 크래시 격리 + 32/64bit 경계 해결 (스펙 §13).
 *
 * 프로토콜 (한 줄 = JSON 1건):
 *   helper → bridge: {"type":"incoming","rawCid":"01012345678","recvNo":"021234567","channelKey":"..."}
 *                    {"type":"callEnded","channelKey":"...","disposition":"missed"}
 *                    {"type":"dialResult","requestId":"...","success":true,"message":""}
 *                    {"type":"status","connected":true,"message":"logged in"}
 *   bridge → helper: {"type":"dial","requestId":"...","phoneNumber":"01012345678","loginId":"...","password":"...","authKey":"..."}
 *                    {"type":"stop"}
 */

export interface HelperMessage {
  type: string;
  [key: string]: unknown;
}

const RESTART_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000];

export class HelperProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private restartCount = 0;
  private stopped = false;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly label: string,
    private readonly exePath: string,
    private readonly args: string[],
    private readonly onMessage: (msg: HelperMessage) => void,
    private readonly onExit: (info: { code: number | null; willRestart: boolean }) => void,
  ) {}

  start() {
    this.stopped = false;
    this.spawnChild();
  }

  stop() {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.child) {
      this.send({ type: 'stop' });
      const child = this.child;
      this.child = null;
      // graceful 종료 대기 후 강제 kill
      const killTimer = setTimeout(() => child.kill(), 3_000);
      child.once('exit', () => clearTimeout(killTimer));
    }
  }

  send(msg: HelperMessage): boolean {
    if (!this.child?.stdin.writable) return false;
    this.child.stdin.write(`${JSON.stringify(msg)}\n`);
    return true;
  }

  get running(): boolean {
    return this.child !== null;
  }

  private spawnChild() {
    const child = spawn(this.exePath, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.handleStdout(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      console.error(`[helper:${this.label}] stderr: ${chunk.trimEnd()}`);
    });

    child.on('error', (error) => {
      console.error(`[helper:${this.label}] spawn error:`, error.message);
    });

    child.on('exit', (code) => {
      if (this.child === child) this.child = null;
      const willRestart = !this.stopped;
      this.onExit({ code, willRestart });
      if (willRestart) this.scheduleRestart();
    });

    // 정상 기동 후 일정 시간 살아있으면 백오프 리셋
    setTimeout(() => {
      if (this.child === child) this.restartCount = 0;
    }, 60_000).unref();
  }

  private scheduleRestart() {
    const delay =
      RESTART_BACKOFF_MS[Math.min(this.restartCount, RESTART_BACKOFF_MS.length - 1)];
    this.restartCount += 1;
    console.warn(`[helper:${this.label}] restarting in ${delay}ms`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopped) this.spawnChild();
    }, delay);
  }

  private handleStdout(chunk: string) {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        try {
          this.onMessage(JSON.parse(line) as HelperMessage);
        } catch {
          console.warn(`[helper:${this.label}] non-JSON line: ${line}`);
        }
      }
      newlineIndex = this.stdoutBuffer.indexOf('\n');
    }
  }
}
