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
  tabs: {
    detach: (payload: unknown) => ipcRenderer.invoke('tabs:detach', payload),
    broadcastInvalidate: (queryKey: readonly unknown[]) =>
      ipcRenderer.send('tabs:invalidate', queryKey),
    onInvalidate: (
      callback: (payload: { queryKey: readonly unknown[]; sourceWindowId: number }) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { queryKey: readonly unknown[]; sourceWindowId: number },
      ) => callback(payload);
      ipcRenderer.on('tabs:invalidate', handler);
      return () => {
        ipcRenderer.removeListener('tabs:invalidate', handler);
      };
    },
    getWindowKind: () => ipcRenderer.invoke('tabs:getWindowKind'),
    getInitialTab: () => ipcRenderer.invoke('tabs:getInitialTab'),
    closeWindow: () => ipcRenderer.send('tabs:closeWindow'),
    openInMainWindow: (route: string) => ipcRenderer.invoke('tabs:openInMainWindow', route),
    onOpenRoute: (callback: (route: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, route: string) => callback(route);
      ipcRenderer.on('tabs:openRoute', handler);
      return () => {
        ipcRenderer.removeListener('tabs:openRoute', handler);
      };
    },
  },
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
