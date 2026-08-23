import {
  WebContentsView,
  type BrowserWindow,
  type LoadFileOptions,
  type WebPreferences,
} from 'electron';
import type { Tab } from '@estate-erp/shared';
import type {
  NativeTabBounds,
  NativeTabHostPort,
  NativeTabViewFactory,
  NativeTabViewPort,
} from './nativeTabHost';

export type ElectronNativeTabDestination =
  | { url: string }
  | { filePath: string; options?: LoadFileOptions };

export interface ElectronNativeTabViewFactoryOptions {
  webPreferences: WebPreferences | ((tab: Readonly<Tab>) => WebPreferences);
  resolveDestination: (route: string) => ElectronNativeTabDestination;
  backgroundColor?: string;
  onCreated?: (view: WebContentsView, tab: Readonly<Tab>) => void;
}

class ElectronNativeTabView implements NativeTabViewPort {
  constructor(
    readonly rawView: WebContentsView,
    private readonly resolveDestination: (
      route: string,
    ) => ElectronNativeTabDestination,
  ) {}

  get senderId(): number {
    return this.rawView.webContents.id;
  }

  isDestroyed(): boolean {
    return this.rawView.webContents.isDestroyed();
  }

  async navigate(route: string): Promise<void> {
    const destination = this.resolveDestination(route);
    if ('url' in destination) {
      await this.rawView.webContents.loadURL(destination.url);
      return;
    }
    await this.rawView.webContents.loadFile(
      destination.filePath,
      destination.options,
    );
  }

  setBounds(bounds: NativeTabBounds): void {
    this.rawView.setBounds(bounds);
  }

  setVisible(visible: boolean): void {
    this.rawView.setVisible(visible);
  }

  send(channel: string, payload: unknown): void {
    this.rawView.webContents.send(channel, payload);
  }

  focus(): void {
    this.rawView.webContents.focus();
  }

  destroy(): void {
    if (!this.rawView.webContents.isDestroyed()) {
      this.rawView.webContents.close();
    }
  }
}

function electronView(view: NativeTabViewPort): WebContentsView {
  if (!(view instanceof ElectronNativeTabView)) {
    throw new TypeError('view was not created by ElectronNativeTabViewFactory');
  }
  return view.rawView;
}

export class ElectronNativeTabViewFactory implements NativeTabViewFactory {
  constructor(private readonly options: ElectronNativeTabViewFactoryOptions) {}

  create(tab: Readonly<Tab>): NativeTabViewPort {
    const webPreferences =
      typeof this.options.webPreferences === 'function'
        ? this.options.webPreferences(tab)
        : this.options.webPreferences;
    const view = new WebContentsView({ webPreferences });
    if (this.options.backgroundColor) {
      view.setBackgroundColor(this.options.backgroundColor);
    }
    this.options.onCreated?.(view, tab);
    return new ElectronNativeTabView(view, this.options.resolveDestination);
  }
}

export class ElectronNativeTabWindowHost implements NativeTabHostPort {
  constructor(readonly window: BrowserWindow) {}

  get id(): number {
    return this.window.id;
  }

  isDestroyed(): boolean {
    return this.window.isDestroyed();
  }

  attach(view: NativeTabViewPort): void {
    this.window.contentView.addChildView(electronView(view));
  }

  detach(view: NativeTabViewPort): void {
    if (!this.window.isDestroyed()) {
      this.window.contentView.removeChildView(electronView(view));
    }
  }

  bringToFront(view: NativeTabViewPort): void {
    // Electron documents that adding an existing child again only reorders it.
    this.window.contentView.addChildView(electronView(view));
  }
}
