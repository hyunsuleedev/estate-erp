import { existsSync } from 'node:fs';
import path from 'node:path';
import type { EventEmitter } from 'node:events';
import {
  app,
  autoUpdater as nativeAutoUpdater,
  BrowserWindow,
  ipcMain,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdaterRequest } from './updaterAccess';
import { UpdateFlow, type UpdaterLike, type UpdateStatus } from './updaterFlow';

export type { UpdateStatus } from './updaterFlow';

/** 상태를 모든 화면에 보내는 함수. 창의 화면뿐 아니라 탭 화면도 받아야 한다. */
type UpdateBroadcast = (channel: string, payload: unknown) => void;

/**
 * 그 요청을 보낸 화면이 해도 되는지. 화면이 어떤 화면인지는 창을 아는 쪽(src/main/index.ts)이 가린다.
 * 정해 주지 않으면 아무 요청도 받지 않는다.
 */
type UpdaterAccess = (
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  request: UpdaterRequest,
) => boolean;

function broadcastToWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/**
 * 업데이트 주소는 실행할 때 환경 변수로 읽지 않는다. electron-builder가 빌드할 때
 * publish 설정을 app-update.yml로 써서 앱의 resources 폴더에 넣고, electron-updater가
 * 그 파일을 읽는다. 주소 없이 만든 빌드에는 이 파일이 없다.
 */
function hasUpdateConfig(): boolean {
  return existsSync(path.join(process.resourcesPath, 'app-update.yml'));
}

/**
 * macOS에서 서명이 없는 앱은 자동 업데이트를 할 수 없다. 설치는 Electron에 내장된
 * 업데이터(Squirrel.Mac)가 하는데, 서명이 없으면 주소를 정하는 순간 던진다.
 * electron-updater는 내려받은 뒤 소켓 콜백 안에서 그 호출을 하므로, 거기서 던져지면
 * 잡을 곳이 없어 main 프로세스의 오류 창이 뜬다. 그래서 먼저 한 번 불러 본다. 여기서 정한
 * 주소로는 아무 요청도 가지 않는다(electron-updater가 설치 직전에 실제 주소로 다시 정한다).
 *
 * 임시 서명(ad-hoc)만 된 앱은 여기를 통과하고, 내려받은 뒤 검증에서 error 이벤트로 끝난다.
 */
function macSigningProblem(): Error | null {
  if (process.platform !== 'darwin') return null;
  try {
    nativeAutoUpdater.setFeedURL({ url: 'http://127.0.0.1/' });
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** electron-updater의 autoUpdater를 설정해 UpdateFlow가 쓰는 모양으로 내준다. */
function createUpdater(): UpdaterLike {
  const signingProblem = macSigningProblem();
  if (signingProblem) {
    // 업데이터를 건드리지 않고, 확인할 때마다 오류 상태로 끝나게 한다.
    return {
      on: () => undefined,
      checkForUpdates: () => Promise.reject(signingProblem),
      quitAndInstall: () => undefined,
    };
  }

  // 새 버전을 찾으면 묻지 않고 내려받는다. 화면은 다 받은 뒤에 "지금 재시작"을 묻는다.
  autoUpdater.autoDownload = true;
  // "나중에"를 고른 사용자는 앱을 끝낼 때 설치된다(다음에 열면 새 버전). macOS에서는 이
  // 값이 켜져 있어야 내려받자마자 Squirrel.Mac에 넘겨 서명 검증까지 마친다.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  // 올리는 방향으로만 움직인다. 서버의 버전이 지금보다 낮으면 "새 버전 없음"이다.
  // 잘못 나간 버전을 되돌리려면 더 높은 번호로 다시 낸다.
  autoUpdater.allowDowngrade = false;
  // GitHub 릴리스에서만 뜻이 있는 값이지만, 앱 버전에 -beta 같은 꼬리가 붙으면
  // electron-updater가 스스로 켜므로 분명히 꺼 둔다.
  autoUpdater.allowPrerelease = false;
  // 웹 설치 파일(nsis-web)은 만들지 않는다. 꺼 두지 않으면 내려받을 때마다 경고가 남는다.
  autoUpdater.disableWebInstaller = true;
  // 로그는 기본값(console)을 그대로 쓴다. main의 다른 로그와 같은 곳에 남는다.

  const events = autoUpdater as unknown as EventEmitter;
  return {
    on: (event, listener) => events.on(event, listener),
    checkForUpdates: () => autoUpdater.checkForUpdates(),
    // Windows(NSIS): 설치 창 없이 설치하고(isSilent) 끝나면 앱을 다시 연다(isForceRunAfter).
    // isSilent만 주면 설치만 하고 앱이 다시 뜨지 않는다. macOS는 이 인자를 보지 않고
    // autoRunAppAfterInstall에 따라 다시 연다.
    quitAndInstall: () => autoUpdater.quitAndInstall(true, true),
  };
}

export class UpdaterService {
  /**
   * 업데이트 안내는 보이는 탭 화면(로그인 전에는 로그인 화면)이 그린다. 탭마다 문서가
   * 따로이므로 "나중에"를 누른 것은 main이 기억해 모든 화면이 같이 닫는다.
   */
  private dismissedStartedAt: number | null = null;
  private initialized = false;
  /** 켤지 정하는 것과 이벤트를 상태로 옮기는 것은 src/main/updaterFlow.ts가 한다. */
  private readonly flow: UpdateFlow;

  constructor(
    private readonly broadcast: UpdateBroadcast = broadcastToWindows,
    private readonly isAllowed: UpdaterAccess = () => false,
  ) {
    this.flow = new UpdateFlow({
      environment: {
        isPackaged: app.isPackaged,
        platform: process.platform,
        // 개발 실행의 resources 폴더는 Electron 자신의 것이다. 거기는 보지 않는다.
        hasUpdateConfig: app.isPackaged && hasUpdateConfig(),
      },
      getVersion: () => app.getVersion(),
      createUpdater,
      onStatus: (status) => {
        // 상태가 바뀌면 이전 안내를 닫았던 것은 더 이상 해당하지 않는다.
        this.dismissedStartedAt = null;
        this.broadcast('updater:status', status);
      },
    });
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    this.registerIpcHandlers();
    this.flow.start();
  }

  checkForUpdates(manual = false) {
    return this.flow.check(manual);
  }

  getStatus() {
    return this.flow.getStatus();
  }

  installUpdate() {
    return this.flow.install();
  }

  private registerIpcHandlers() {
    // 읽기는 앱 화면이면 되고, 확인·설치·닫기는 사용자가 보고 있는 화면만 할 수 있다
    // (src/main/updaterAccess.ts). 거절한 화면에는 안내가 뜨지 않는 상태를 돌려준다.
    const hidden = (): UpdateStatus => ({
      state: 'disabled',
      currentVersion: app.getVersion(),
      reason: 'not-available-here',
      startedAt: 0,
    });
    ipcMain.handle('updater:getStatus', (event) =>
      this.isAllowed(event, 'getStatus') ? this.getStatus() : hidden(),
    );
    ipcMain.handle('updater:check', (event) =>
      this.isAllowed(event, 'check') ? this.checkForUpdates(true) : hidden(),
    );
    ipcMain.handle('updater:install', (event) =>
      this.isAllowed(event, 'install')
        ? this.installUpdate()
        : { ok: false, error: 'not-allowed' },
    );
    ipcMain.handle('updater:getDismissed', (event) =>
      this.isAllowed(event, 'getDismissed') ? this.dismissedStartedAt : null,
    );
    ipcMain.on('updater:dismiss', (event, startedAt: unknown) => {
      if (!this.isAllowed(event, 'dismiss')) return;
      // 지금 보여 주는 안내만 닫을 수 있다. 그사이 상태가 바뀌었으면 새 안내는 남는다.
      const current = this.getStatus().startedAt;
      if (startedAt !== current) return;
      this.dismissedStartedAt = current;
      this.broadcast('updater:dismissed', this.dismissedStartedAt);
    });
  }
}
