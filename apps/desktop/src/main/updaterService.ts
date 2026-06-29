import { app, autoUpdater, BrowserWindow, ipcMain } from 'electron';
import { EventEmitter } from 'node:events';

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

export class UpdaterService {
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
    ipcMain.handle('updater:getStatus', () => this.getStatus());
    ipcMain.handle('updater:check', () => this.checkForUpdates(true));
    ipcMain.handle('updater:install', () => this.installUpdate());
  }

  private setStatus(status: UpdateStatus) {
    this.status = status;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('updater:status', status);
      }
    }
  }
}
