interface ElectronBridge {
  platform: string;
  onToggleSidebar: (callback: () => void) => () => void;
  getPlatform: () => Promise<string>;
}

declare global {
  interface Window {
    electronBridge?: ElectronBridge;
  }
}

export {};
