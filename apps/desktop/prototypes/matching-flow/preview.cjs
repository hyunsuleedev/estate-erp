// Isolated Electron preview. This process does not load the ERP preload or session.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
app.setName('EstaitFlow Matching Demo');
const previewProfile = path.join(os.tmpdir(), 'estaitflow-matching-flow-preview');
fs.mkdirSync(previewProfile, { recursive: true });
app.setPath('userData', previewProfile);
app.commandLine.appendSwitch('remote-debugging-port', '9345');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1580, height: 1040, minWidth: 700, minHeight: 650, title: '매칭 흐름 · 세 가지 디자인', backgroundColor: '#ffffff', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.loadURL('http://localhost:5174/prototypes/matching-flow/index.html');
});
app.on('window-all-closed', () => app.quit());
