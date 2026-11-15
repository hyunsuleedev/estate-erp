/**
 * 자동 업데이트의 상태 흐름. Electron에도 electron-updater에도 의존하지 않는다
 * (updaterService.ts가 실제 업데이터와 IPC를 붙인다).
 *
 * 하는 일은 두 가지다: 이 실행에서 자동 업데이트를 켤지 정하고, 업데이터가 내는 이벤트를
 * 화면이 보는 상태(UpdateStatus)로 옮긴다. 내려받기는 업데이터가 알아서 시작하므로
 * (autoDownload) 여기서는 확인을 시작하고 결과를 받아 적기만 한다.
 */

/** 화면(src/renderer/electron.d.ts의 DesktopUpdateStatus)이 받는 모양 그대로다. 상태를 늘리면 화면도 고쳐야 한다. */
export type UpdateStatus =
  | { state: 'disabled'; currentVersion: string; reason: string; startedAt: number }
  | { state: 'idle'; currentVersion: string; startedAt: number }
  | { state: 'checking'; currentVersion: string; manual?: boolean; startedAt: number }
  | { state: 'available'; currentVersion: string; version?: string; releaseName?: string; manual?: boolean; startedAt: number }
  | { state: 'not-available'; currentVersion: string; manual?: boolean; startedAt: number }
  | { state: 'downloaded'; currentVersion: string; version?: string; releaseName?: string; releaseNotes?: string; startedAt: number }
  | { state: 'error'; currentVersion: string; message: string; manual?: boolean; startedAt: number };

export type UpdateDisabledReason =
  | 'development'
  | 'unsupported-platform'
  | 'missing-update-url';

export interface UpdateEnvironment {
  /** 설치 파일로 만든 앱인가(app.isPackaged). */
  isPackaged: boolean;
  /** process.platform */
  platform: string;
  /** 빌드가 업데이트 주소를 적어 넣은 파일(resources/app-update.yml)이 있는가. */
  hasUpdateConfig: boolean;
}

/**
 * 자동 업데이트를 켜지 않는 이유. 켜도 되면 null.
 *
 * Linux는 켜지 않는다. electron-updater에 deb·rpm용 업데이터가 있기는 하지만, 내려받은
 * 패키지를 pkexec/sudo로 dpkg·rpm에 넘겨 설치한다. 앱을 끝낼 때마다 관리자 암호를 묻는
 * 창이 뜨고, 그 창을 띄울 도구가 없는 PC에서는 설치가 실패한다. 추가 준비 없이 되는
 * 것은 AppImage뿐인데 우리는 AppImage를 만들지 않는다.
 */
export function updateDisabledReason(env: UpdateEnvironment): UpdateDisabledReason | null {
  if (!env.isPackaged) return 'development';
  if (env.platform !== 'darwin' && env.platform !== 'win32') return 'unsupported-platform';
  // 업데이트 주소는 빌드할 때 정해져 app-update.yml에 들어간다. 주소 없이 만든 빌드에는
  // 이 파일이 없고, 그런 빌드에서 확인을 걸면 매번 "파일 없음" 오류만 난다.
  if (!env.hasUpdateConfig) return 'missing-update-url';
  return null;
}

/** 업데이터가 알려 주는 새 버전 정보에서 우리가 읽는 부분(electron-updater의 UpdateInfo). */
interface UpdateInfoLike {
  version?: unknown;
  releaseName?: unknown;
  releaseNotes?: unknown;
}

/** checkForUpdates가 돌려주는 것에서 우리가 읽는 부분(electron-updater의 UpdateCheckResult). */
interface UpdateCheckResultLike {
  downloadPromise?: PromiseLike<unknown> | null;
}

/** 이 모듈이 업데이터에게 바라는 것. 실제 구현은 electron-updater의 autoUpdater다. */
export interface UpdaterLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  checkForUpdates(): PromiseLike<UpdateCheckResultLike | null | undefined>;
  /** 앱을 끝내고 내려받은 버전을 설치한 뒤 다시 연다. */
  quitAndInstall(): void;
}

export interface UpdateFlowOptions {
  environment: UpdateEnvironment;
  getVersion(): string;
  /**
   * 업데이터를 만든다(설정까지 마친 것). 자동 업데이트가 켜진 실행에서만, 한 번만 부른다.
   * 꺼진 실행에서는 업데이터에 손대지 않는다.
   */
  createUpdater(): UpdaterLike;
  /** 상태가 바뀔 때마다 부른다. 부르는 시점에 getStatus()는 이미 새 상태다. */
  onStatus(status: UpdateStatus): void;
  now?: () => number;
}

export type InstallResult = { ok: true } | { ok: false; error: string };

/** 화면에 보일 수 있는 오류 문구의 최대 길이. */
const MAX_ERROR_MESSAGE_LENGTH = 300;

/**
 * 오류에서 화면에 보일 한 줄을 뽑는다. electron-updater의 오류 문구는 응답 헤더와 스택이
 * 여러 줄로 붙어 오기도 한다. 전체 내용은 업데이터가 로그에 남긴다.
 */
export function updateErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split(/\r?\n/, 1)[0].trim();
  return firstLine.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${firstLine.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : firstLine;
}

/**
 * 릴리스 노트는 문자열 하나로 오기도, 버전별 목록으로 오기도, 없기도 하다. 화면은 문자열만
 * 받으므로 목록은 이어 붙인다.
 */
export function releaseNotesText(releaseNotes: unknown): string | undefined {
  if (typeof releaseNotes === 'string') return releaseNotes || undefined;
  if (!Array.isArray(releaseNotes)) return undefined;
  const notes = releaseNotes
    .map((entry: unknown) =>
      entry && typeof entry === 'object' ? (entry as { note?: unknown }).note : null,
    )
    .filter((note): note is string => typeof note === 'string' && note.length > 0);
  return notes.length > 0 ? notes.join('\n\n') : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** 아직 이벤트로 받은 오류가 없다는 표시. 어떤 오류와도 같지 않다. */
const NO_ERROR = Symbol('no-error');

export class UpdateFlow {
  private status: UpdateStatus;
  private updater: UpdaterLike | null = null;
  private started = false;
  /** 확인을 시작해 결과(없음·내려받음·오류)가 나올 때까지. 그동안의 확인 요청은 받지 않는다. */
  private checkInFlight = false;
  /**
   * 이벤트로 이미 받아 적은 오류. 업데이터는 같은 실패를 이벤트로도 내고 약속(promise)의
   * 거절로도 돌려준다. 같은 오류를 두 번 적지 않으려고 기억한다.
   */
  private lastEventError: unknown = NO_ERROR;

  private readonly now: () => number;

  constructor(private readonly options: UpdateFlowOptions) {
    this.now = options.now ?? Date.now;
    // 만드는 동안에는 onStatus를 부르지 않는다. 첫 알림은 start()에서 나간다.
    this.status = {
      state: 'idle',
      currentVersion: options.getVersion(),
      startedAt: this.now(),
    };
  }

  /** 켤지 정하고, 켠다면 업데이터를 만들어 이벤트를 받기 시작한다. 확인은 아직 하지 않는다. */
  start(): void {
    if (this.started) return;
    this.started = true;

    const reason = updateDisabledReason(this.options.environment);
    if (reason) {
      this.setStatus({
        state: 'disabled',
        currentVersion: this.options.getVersion(),
        reason,
        startedAt: this.now(),
      });
      return;
    }

    let updater: UpdaterLike;
    try {
      updater = this.options.createUpdater();
    } catch (error) {
      // 업데이터를 만들지 못해도 앱은 뜬다. 이후의 확인 요청은 이 상태를 그대로 돌려준다.
      this.fail(error);
      return;
    }
    this.updater = updater;

    updater.on('checking-for-update', () => {
      this.setStatus({
        state: 'checking',
        currentVersion: this.options.getVersion(),
        manual: this.manualFromChecking(),
        startedAt: this.now(),
      });
    });

    // 새 버전이 있다. 내려받기는 업데이터가 바로 시작하므로 확인은 아직 끝나지 않았다.
    updater.on('update-available', (info) => {
      const update = (info ?? {}) as UpdateInfoLike;
      this.setStatus({
        state: 'available',
        currentVersion: this.options.getVersion(),
        version: text(update.version),
        releaseName: text(update.releaseName),
        manual: this.manualFromChecking(),
        startedAt: this.now(),
      });
    });

    updater.on('update-not-available', () => {
      this.checkInFlight = false;
      this.setStatus({
        state: 'not-available',
        currentVersion: this.options.getVersion(),
        manual: this.manualFromChecking(),
        startedAt: this.now(),
      });
    });

    updater.on('update-downloaded', (info) => {
      const update = (info ?? {}) as UpdateInfoLike;
      this.checkInFlight = false;
      this.setStatus({
        state: 'downloaded',
        currentVersion: this.options.getVersion(),
        version: text(update.version),
        releaseName: text(update.releaseName),
        releaseNotes: releaseNotesText(update.releaseNotes),
        startedAt: this.now(),
      });
    });

    updater.on('error', (error) => {
      this.lastEventError = error;
      this.fail(error);
    });
  }

  /**
   * 새 버전을 확인한다. 꺼져 있거나 이미 확인 중이면 아무것도 하지 않고 지금 상태를 돌려준다.
   * manual은 사용자가 직접 누른 확인이다. 결과가 없음·오류여도 화면이 알려 준다.
   */
  check(manual = false): UpdateStatus {
    const updater = this.updater;
    if (!updater || this.checkInFlight) return this.status;

    this.checkInFlight = true;
    this.setStatus({
      state: 'checking',
      currentVersion: this.options.getVersion(),
      manual,
      startedAt: this.now(),
    });

    // 실패는 보통 error 이벤트로 먼저 오고 같은 오류로 약속도 거절된다. 이벤트 없이
    // 거절만 되는 경우와 부르자마자 던지는 경우도 여기서 받아, 처리되지 않은 거절이
    // 남지 않게 한다.
    const onRejected = (error: unknown) => this.failUnlessReported(error);
    try {
      updater.checkForUpdates().then((result) => {
        // 내려받기가 실패하면 이 약속이 거절된다. 아무도 받지 않으면 처리되지 않은 거절이 된다.
        result?.downloadPromise?.then(undefined, onRejected);
      }, onRejected);
    } catch (error) {
      onRejected(error);
    }
    return this.status;
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  /** 내려받은 버전이 있을 때만 앱을 끝내고 설치한다. */
  install(): InstallResult {
    if (this.status.state !== 'downloaded' || !this.updater) {
      return { ok: false, error: 'update-not-downloaded' };
    }
    try {
      this.updater.quitAndInstall();
    } catch (error) {
      this.fail(error);
      return { ok: false, error: 'install-failed' };
    }
    return { ok: true };
  }

  /** 사용자가 직접 누른 확인이었는지는 확인 중 상태에서 그 결과로만 넘어간다. */
  private manualFromChecking(): boolean | undefined {
    return this.status.state === 'checking' ? this.status.manual : undefined;
  }

  private failUnlessReported(error: unknown): void {
    if (Object.is(error, this.lastEventError)) return;
    this.fail(error);
  }

  private fail(error: unknown): void {
    this.checkInFlight = false;
    this.setStatus({
      state: 'error',
      currentVersion: this.options.getVersion(),
      message: updateErrorMessage(error),
      manual: this.manualFromChecking(),
      startedAt: this.now(),
    });
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status;
    this.options.onStatus(status);
  }
}
