import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronBridge', {
  platform: process.platform,
  onToggleSidebar: (callback: () => void) => {
    ipcRenderer.on('toggle-sidebar', callback);
    return () => {
      ipcRenderer.removeListener('toggle-sidebar', callback);
    };
  },
  getPlatform: () => ipcRenderer.invoke('get-platform'),
});
