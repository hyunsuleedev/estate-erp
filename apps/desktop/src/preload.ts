import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronBridge', {
  platform: process.platform,
  onToggleSidebar: (callback: () => void) => {
    ipcRenderer.on('toggle-sidebar', callback);
    return () => {
      ipcRenderer.removeListener('toggle-sidebar', callback);
    };
  },
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isFullscreen: boolean) => callback(isFullscreen);
    ipcRenderer.on('fullscreen-changed', handler);
    return () => {
      ipcRenderer.removeListener('fullscreen-changed', handler);
    };
  },
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  codex: {
    start: (args: {
      runId: string;
      prompt: string;
      cwd?: string;
      sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
      model?: string;
      resumeSessionId?: string | null;
      dangerouslyBypass?: boolean;
      authToken?: string;
      apiBaseUrl?: string;
    }) => ipcRenderer.invoke('codex:start', args),
    stop: (runId: string) => ipcRenderer.invoke('codex:stop', runId),
    onEvent: (callback: (payload: Record<string, unknown>) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: Record<string, unknown>) =>
        callback(payload);
      ipcRenderer.on('codex:event', handler);
      return () => {
        ipcRenderer.removeListener('codex:event', handler);
      };
    },
  },
});
