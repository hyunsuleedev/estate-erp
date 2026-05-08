import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import type { DetachPayload, Tab, WindowKind } from '@estate-erp/shared';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

interface WindowEntry {
  kind: WindowKind;
  initialTab?: Tab;
}

function getBaseWindowOptions(): Electron.BrowserWindowConstructorOptions {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  const platformOptions: Partial<Electron.BrowserWindowConstructorOptions> = isMac
    ? {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
      }
    : isWin
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#1f1f1f',
            height: 48,
          },
        }
      : {};

  return {
    backgroundColor: '#f8f9fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    ...platformOptions,
  };
}

function rendererUrlFor(searchParams?: Record<string, string>): {
  isDev: boolean;
  url?: string;
  filePath?: string;
  hash?: string;
} {
  const hashSegments = searchParams
    ? `?${new URLSearchParams(searchParams).toString()}`
    : '';

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/${hashSegments ? `#${hashSegments}` : ''}`;
    return { isDev: true, url };
  }

  return {
    isDev: false,
    filePath: path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    hash: hashSegments || undefined,
  };
}

export class WindowManager {
  private windows = new Map<number, WindowEntry>();
  private mainWindowId: number | null = null;

  createMainWindow(): BrowserWindow {
    const win = new BrowserWindow({
      ...getBaseWindowOptions(),
      width: 1440,
      height: 900,
      minWidth: 1200,
      minHeight: 760,
    });

    const target = rendererUrlFor();
    if (target.isDev && target.url) {
      win.loadURL(target.url);
    } else if (target.filePath) {
      win.loadFile(target.filePath);
    }

    if (!app.isPackaged) {
      win.webContents.openDevTools({ mode: 'detach' });
    }

    win.on('enter-full-screen', () => {
      win.webContents.send('fullscreen-changed', true);
    });
    win.on('leave-full-screen', () => {
      win.webContents.send('fullscreen-changed', false);
    });

    win.on('closed', () => {
      this.windows.delete(win.id);
      if (this.mainWindowId === win.id) this.mainWindowId = null;
    });

    this.windows.set(win.id, { kind: 'main' });
    this.mainWindowId = win.id;
    return win;
  }

  createDetachedWindow(payload: DetachPayload): BrowserWindow {
    const { tab, position, size } = payload;

    const width = size?.width ?? 1100;
    const height = size?.height ?? 760;

    const win = new BrowserWindow({
      ...getBaseWindowOptions(),
      width,
      height,
      minWidth: 800,
      minHeight: 600,
      x: Math.max(0, Math.round(position.x - 200)),
      y: Math.max(0, Math.round(position.y - 18)),
      title: `${tab.title} — Estate ERP`,
    });

    const target = rendererUrlFor({ window: 'detached', tabId: tab.id });
    if (target.isDev && target.url) {
      win.loadURL(target.url);
    } else if (target.filePath) {
      win.loadFile(target.filePath, { hash: target.hash });
    }

    if (!app.isPackaged) {
      win.webContents.openDevTools({ mode: 'detach' });
    }

    win.on('enter-full-screen', () => {
      win.webContents.send('fullscreen-changed', true);
    });
    win.on('leave-full-screen', () => {
      win.webContents.send('fullscreen-changed', false);
    });

    win.on('closed', () => {
      this.windows.delete(win.id);
    });

    this.windows.set(win.id, { kind: 'detached', initialTab: tab });
    return win;
  }

  getKind(windowId: number): WindowKind {
    return this.windows.get(windowId)?.kind ?? 'main';
  }

  getInitialTab(windowId: number): Tab | null {
    return this.windows.get(windowId)?.initialTab ?? null;
  }

  getMainWindow(): BrowserWindow | null {
    if (this.mainWindowId == null) return null;
    return BrowserWindow.fromId(this.mainWindowId) ?? null;
  }

  broadcastInvalidate(queryKey: readonly unknown[], sourceWindowId: number) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id === sourceWindowId) continue;
      if (win.isDestroyed()) continue;
      win.webContents.send('tabs:invalidate', { queryKey, sourceWindowId });
    }
  }
}

export function registerTabIpcHandlers(manager: WindowManager) {
  ipcMain.handle('tabs:detach', (_event, payload: DetachPayload) => {
    const win = manager.createDetachedWindow(payload);
    return { ok: true, windowId: win.id };
  });

  ipcMain.on('tabs:invalidate', (event, queryKey: readonly unknown[]) => {
    manager.broadcastInvalidate(queryKey, event.sender.id);
  });

  ipcMain.handle('tabs:getWindowKind', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return 'main' as WindowKind;
    return manager.getKind(win.id);
  });

  ipcMain.handle('tabs:getInitialTab', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    return manager.getInitialTab(win.id);
  });

  ipcMain.on('tabs:closeWindow', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  ipcMain.handle('tabs:openInMainWindow', (_event, route: string) => {
    const main = manager.getMainWindow();
    if (!main) return { ok: false, error: 'no main window' };
    main.focus();
    main.webContents.send('tabs:openRoute', route);
    return { ok: true };
  });
}
