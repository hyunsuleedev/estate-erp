import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import type { BeginDragPayload, DetachPayload, Tab, WindowKind } from '@estate-erp/shared';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let packagedRendererBaseUrl: string | null = null;

export function setPackagedRendererBaseUrl(baseUrl: string | null) {
  packagedRendererBaseUrl = baseUrl;
}

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
        // 헤더 h-10 (40px) 기준 traffic light 가운데 정렬
        trafficLightPosition: { x: 16, y: 12 },
      }
    : isWin
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#1f1f1f',
            // 헤더 h-10 (40px)와 동기화
            height: 40,
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

  if (packagedRendererBaseUrl) {
    const url = `${packagedRendererBaseUrl}/${hashSegments}`;
    return { isDev: false, url };
  }

  return {
    isDev: false,
    filePath: path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    hash: hashSegments || undefined,
  };
}

interface DragState {
  windowId: number;
  /** 마우스가 새 창의 좌측 상단으로부터 떨어진 offset (= 탭 mouseOffset) */
  mouseOffset: { x: number; y: number };
  /** updateDragPosition이 일정 시간 동안 안 오면 강제 종료 — pointer capture 분실 대비 */
  staleTimer: NodeJS.Timeout | null;
}

/**
 * updateDragPosition이 이 시간 동안 안 오면 endDrag 자동 호출.
 *
 * 동작 원리: ghost drag 중에는 사용자가 마우스를 끌고 있으므로 매 프레임 pointermove가 발생.
 * 마우스를 떼는 순간 정상 경로는 source의 pointerup → endSession → endDrag IPC로 정리됨.
 * 그러나 이 경로가 누락되는 케이스(pointer capture 분실, OS alt-tab, source 창 blur 등)가
 * 종종 발생해 새 창이 ignoreMouseEvents(true) 상태로 영원히 남아 클릭이 안 먹는 버그가 됨.
 *
 * 이 상수는 release 후 fallback 정리 시간이다. 너무 짧으면 정상 ghost drag 중 잠시 멈췄을 때
 * 오인 발동, 너무 길면 클릭 안 되는 시간이 길어짐. 500ms = 사람이 마우스를 떼고 0.5초 안에
 * 새 창을 클릭할 일은 거의 없는 + 잠시 멈춰도 충분히 견디는 균형점.
 */
const DRAG_STALE_TIMEOUT_MS = 500;

export class WindowManager {
  private windows = new Map<number, WindowEntry>();
  private mainWindowId: number | null = null;
  private dragState: DragState | null = null;

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
    } else if (target.url) {
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
    } else if (target.url) {
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

  /**
   * 드래그 detach 시작 — 새 detached 창을 즉시 생성하고 마우스 따라다닐 수 있도록 dragState 설정.
   * 기존 createDetachedWindow와 다른 점: 위치 계산이 mouseOffset 기반이라 마우스가 탭 잡은 그 위치에
   * 정확히 대응하도록 새 창이 등장.
   */
  beginDragDetach(payload: BeginDragPayload): { windowId: number } {
    const { tab, pointerScreen, mouseOffset, size } = payload;
    const width = size?.width ?? 1100;
    const height = size?.height ?? 760;

    // 새 창의 좌측 상단 = pointerScreen - mouseOffset
    const x = Math.round(pointerScreen.x - mouseOffset.x);
    const y = Math.round(pointerScreen.y - mouseOffset.y);

    const win = new BrowserWindow({
      ...getBaseWindowOptions(),
      width,
      height,
      minWidth: 800,
      minHeight: 600,
      x,
      y,
      title: `${tab.title} — Estate ERP`,
      // 드래그 중에 다른 창 위에 떠있도록
      alwaysOnTop: true,
    });

    // 드래그 중엔 마우스 이벤트를 통과시켜 source 창이 계속 pointermove를 받게 한다.
    // endDrag 시 ignoreMouseEvents(false)로 복구.
    win.setIgnoreMouseEvents(true);

    const target = rendererUrlFor({ window: 'detached', tabId: tab.id });
    if (target.isDev && target.url) {
      win.loadURL(target.url);
    } else if (target.url) {
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
      if (this.dragState?.windowId === win.id) {
        if (this.dragState.staleTimer) clearTimeout(this.dragState.staleTimer);
        this.dragState = null;
      }
    });

    this.windows.set(win.id, { kind: 'detached', initialTab: tab });
    this.dragState = {
      windowId: win.id,
      mouseOffset,
      staleTimer: this.scheduleStaleTimer(),
    };
    return { windowId: win.id };
  }

  /**
   * 드래그 중 마우스 좌표(screen 기준)를 받아 dragging 중인 창을 그 좌표로 옮긴다.
   * 새 창의 좌측 상단 = pointerScreen - mouseOffset.
   */
  updateDragPosition(pointerScreen: { x: number; y: number }) {
    if (!this.dragState) return;
    const win = BrowserWindow.fromId(this.dragState.windowId);
    if (!win || win.isDestroyed()) {
      this.dragState = null;
      return;
    }
    // payload 방어: undefined/NaN/Infinity가 들어오면 setPosition이 throw하므로 무시.
    if (
      !pointerScreen ||
      typeof pointerScreen.x !== 'number' ||
      typeof pointerScreen.y !== 'number' ||
      !Number.isFinite(pointerScreen.x) ||
      !Number.isFinite(pointerScreen.y)
    ) {
      return;
    }
    const offset = this.dragState.mouseOffset;
    if (
      !offset ||
      !Number.isFinite(offset.x) ||
      !Number.isFinite(offset.y)
    ) {
      return;
    }
    const x = Math.round(pointerScreen.x - offset.x);
    const y = Math.round(pointerScreen.y - offset.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    try {
      win.setPosition(x, y, false);
    } catch {
      // setPosition이 OS 단계에서 거부할 수 있음 (음수/너무 큰 좌표 등). 무시.
    }
    // 이동이 들어왔으니 stale timer 리셋
    if (this.dragState.staleTimer) clearTimeout(this.dragState.staleTimer);
    this.dragState.staleTimer = this.scheduleStaleTimer();
  }

  /**
   * 드래그 종료 — alwaysOnTop 해제, ignoreMouseEvents 복구, dragState clear.
   */
  endDrag() {
    if (!this.dragState) return;
    if (this.dragState.staleTimer) clearTimeout(this.dragState.staleTimer);
    const win = BrowserWindow.fromId(this.dragState.windowId);
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(false);
      win.setAlwaysOnTop(false);
      win.focus();
    }
    this.dragState = null;
  }

  private scheduleStaleTimer(): NodeJS.Timeout {
    return setTimeout(() => {
      // updateDragPosition / endDrag 가 일정 시간 동안 오지 않으면 안전하게 정리.
      // pointer capture 분실, source 창 blur, OS의 alt-tab 등으로 인한 이벤트 누락 대비.
      this.endDrag();
    }, DRAG_STALE_TIMEOUT_MS);
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

  ipcMain.handle('tabs:beginDrag', (_event, payload: BeginDragPayload) => {
    const result = manager.beginDragDetach(payload);
    return { ok: true, windowId: result.windowId };
  });

  ipcMain.on(
    'tabs:updateDragPosition',
    (_event, pointerScreen: { x: number; y: number }) => {
      manager.updateDragPosition(pointerScreen);
    },
  );

  ipcMain.on('tabs:endDrag', () => {
    manager.endDrag();
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
