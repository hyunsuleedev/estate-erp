import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

function getWindowOptions(): Electron.BrowserWindowConstructorOptions {
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
            height: 36,
          },
        }
      : {};

  return {
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#f8f9fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    ...platformOptions,
  };
}

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow(getWindowOptions());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// IPC: send message to renderer
ipcMain.on('toggle-sidebar', () => {
  mainWindow?.webContents.send('toggle-sidebar');
});

ipcMain.handle('get-platform', () => process.platform);

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
