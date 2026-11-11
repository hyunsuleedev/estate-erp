import { app, autoUpdater, BrowserWindow, ipcMain } from 'electron';
import { EventEmitter } from 'node:events';
import type { UpdaterRequest } from './updaterAccess';

export type UpdateStatus =
  | { state: 'disabled'; currentVersion: string; reason: string; startedAt: number }
  | { state: 'idle'; currentVersion: string; startedAt: number }
  | { state: 'checking'; currentVersion: string; manual?: boolean; startedAt: number }
  | { state: 'available'; currentVersion: string; version?: string; releaseName?: string; manual?: boolean; startedAt: number }
  | { state: 'not-available'; currentVersion: string; manual?: boolean; startedAt: number }
  | { state: 'downloaded'; currentVersion: string; version?: string; releaseName?: string; releaseNotes?: string; startedAt: number }
  | { state: 'error'; currentVersion: string; message: string; manual?: boolean; startedAt: number };

const UPDATE_BASE_URL = process.env.ESTATE_ERP_UPDATE_BASE_URL?.replace(/\/+$/, '');
const isAutoUpdateSupported = process.platform === 'darwin' || process.platform === 'win32';

/** 상태를 모든 화면에 보내는 함수. 창의 화면뿐 아니라 탭 화면도 받아야 한다. */
type UpdateBroadcast = (channel: string, payload: unknown) => void;

/**
 * 그 요청을 보낸 화면이 해도 되는지. 화면이 어떤 화면인지는 창을 아는 쪽(main.ts)이 가린다.
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

export class UpdaterService {
  /**
   * 업데이트 안내는 보이는 탭 화면(로그인 전에는 로그인 화면)이 그린다. 탭마다 문서가
   * 따로이므로 "나중에"를 누른 것은 main이 기억해 모든 화면이 같이 닫는다.
   */
  private dismissedStartedAt: number | null = null;

  constructor(
    private readonly broadcast: UpdateBroadcast = broadcastToWindows,
    private readonly isAllowed: UpdaterAccess = () => false,
  ) {}

  private status: UpdateStatus = {
    state: 'idle',
    currentVersion: app.getVersion(),
    startedAt: Date.now(),
  };
  private initialized = false;
  private checkInFlight = false;

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    this.registerIpcHandlers();

    if (!app.isPackaged) {
      this.setStatus({
        state: 'disabled',
        currentVersion: app.getVersion(),
        reason: 'development',
        startedAt: Date.now(),
      });
      return;
    }

    if (!isAutoUpdateSupported) {
      this.setStatus({
        state: 'disabled',
        currentVersion: app.getVersion(),
        reason: 'unsupported-platform',
        startedAt: Date.now(),
      });
      return;
    }

    if (!UPDATE_BASE_URL) {
      this.setStatus({
        state: 'disabled',
        currentVersion: app.getVersion(),
        reason: 'missing-update-url',
        startedAt: Date.now(),
      });
      return;
    }

    autoUpdater.setFeedURL({
      url: `${UPDATE_BASE_URL}/${process.platform}/${process.arch}`,
    });
    const updaterEvents = autoUpdater as unknown as EventEmitter;

    updaterEvents.on('checking-for-update', () => {
      this.setStatus({
        state: 'checking',
        currentVersion: app.getVersion(),
        manual: this.status.state === 'checking' ? this.status.manual : undefined,
        startedAt: Date.now(),
      });
    });

    updaterEvents.on('update-available', (_event: unknown, releaseNotes: unknown, releaseName: unknown) => {
      this.setStatus({
        state: 'available',
        currentVersion: app.getVersion(),
        releaseName: typeof releaseName === 'string' ? releaseName : undefined,
        version: typeof releaseName === 'string' ? releaseName : undefined,
        manual: this.status.state === 'checking' ? this.status.manual : undefined,
        startedAt: Date.now(),
      });
      void releaseNotes;
    });

    updaterEvents.on('update-not-available', () => {
      this.checkInFlight = false;
      this.setStatus({
        state: 'not-available',
        currentVersion: app.getVersion(),
        manual: this.status.state === 'checking' ? this.status.manual : undefined,
        startedAt: Date.now(),
      });
    });

    updaterEvents.on('update-downloaded', (_event: unknown, releaseNotes: unknown, releaseName: unknown) => {
      this.checkInFlight = false;
      this.setStatus({
        state: 'downloaded',
        currentVersion: app.getVersion(),
        releaseName: typeof releaseName === 'string' ? releaseName : undefined,
        version: typeof releaseName === 'string' ? releaseName : undefined,
        releaseNotes: typeof releaseNotes === 'string' ? releaseNotes : undefined,
        startedAt: Date.now(),
      });
    });

    updaterEvents.on('error', (error: unknown) => {
      this.checkInFlight = false;
      this.setStatus({
        state: 'error',
        currentVersion: app.getVersion(),
        message: error instanceof Error ? error.message : String(error),
        manual: this.status.state === 'checking' ? this.status.manual : undefined,
        startedAt: Date.now(),
      });
    });
  }

  checkForUpdates(manual = false) {
    if (!app.isPackaged || !isAutoUpdateSupported || !UPDATE_BASE_URL) {
      return this.status;
    }

    if (this.checkInFlight) {
      return this.status;
    }

    this.checkInFlight = true;
    this.setStatus({
      state: 'checking',
      currentVersion: app.getVersion(),
      manual,
      startedAt: Date.now(),
    });
    autoUpdater.checkForUpdates();
    return this.status;
  }

  getStatus() {
    return this.status;
  }

  installUpdate() {
    if (this.status.state !== 'downloaded') {
      return { ok: false, error: 'update-not-downloaded' };
    }

    autoUpdater.quitAndInstall();
    return { ok: true };
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
      if (startedAt !== this.status.startedAt) return;
      this.dismissedStartedAt = this.status.startedAt;
      this.broadcast('updater:dismissed', this.dismissedStartedAt);
    });
  }

  private setStatus(status: UpdateStatus) {
    this.status = status;
    // 상태가 바뀌면 이전 안내를 닫았던 것은 더 이상 해당하지 않는다.
    this.dismissedStartedAt = null;
    this.broadcast('updater:status', status);
  }
}
