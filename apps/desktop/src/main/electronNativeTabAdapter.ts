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

/** 이미 앱이 떠 있는 탭 화면에 보내는 화면 안 이동 명령. preload가 받는다. */
export const NATIVE_TAB_NAVIGATE_CHANNEL = 'tabs:nativeNavigate';
/** 탭 화면이 사이드바와 화면 틀을 처음 그렸다는 신호. */
export const NATIVE_TAB_READY_CHANNEL = 'tabs:nativeTabReady';
/** 미리 띄워 둔 탭 화면에 실제 탭을 맡기는 명령. preload가 받는다. */
export const NATIVE_TAB_ASSIGN_CHANNEL = 'tabs:nativeAssign';
/** 신호가 오지 않아도 이 시간이 지나면 보여준다(로그인 대기 등). */
const NATIVE_TAB_READY_TIMEOUT_MS = 8_000;

class ElectronNativeTabView implements NativeTabViewPort {
  /** 앱 문서를 한 번 다 불러왔으면 이후 이동은 다시 로드하지 않는다. */
  private appDocumentLoaded = false;
  /** 탭 화면이 사이드바와 화면 틀을 그렸다. */
  private rendererReady = false;
  private readonly readyWaiters = new Set<() => void>();

  constructor(
    readonly rawView: WebContentsView,
    private readonly resolveDestination: (
      route: string,
    ) => ElectronNativeTabDestination,
  ) {
    const contents = rawView.webContents;
    const release = () => {
      for (const waiter of [...this.readyWaiters]) waiter();
    };
    contents.ipc.on(NATIVE_TAB_READY_CHANNEL, () => {
      this.rendererReady = true;
      release();
    });
    contents.once('destroyed', release);
  }

  /**
   * 첫 로드가 끝나도 앱은 아직 로딩 화면일 수 있다. 그때 보여주면 셸이 그려 둔
   * 사이드바가 로딩 화면에 가려져 깜빡이므로, 탭 화면이 틀을 그릴 때까지 기다린다.
   */
  whenReady(): Promise<void> {
    if (this.rendererReady || this.rawView.webContents.isDestroyed()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.readyWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, NATIVE_TAB_READY_TIMEOUT_MS);
      timer.unref?.();
      this.readyWaiters.add(done);
    });
  }

  assign(tab: Readonly<Tab>): void {
    this.rawView.webContents.send(NATIVE_TAB_ASSIGN_CHANNEL, { tab });
  }

  get senderId(): number {
    return this.rawView.webContents.id;
  }

  isDestroyed(): boolean {
    return this.rawView.webContents.isDestroyed();
  }

  isCrashed(): boolean {
    const contents = this.rawView.webContents;
    return !contents.isDestroyed() && contents.isCrashed();
  }

  async navigate(route: string): Promise<void> {
    const contents = this.rawView.webContents;
    if (
      this.appDocumentLoaded &&
      !contents.isDestroyed() &&
      !contents.isCrashed() &&
      !contents.isLoadingMainFrame()
    ) {
      // 뒤로/앞으로·사이드바처럼 셸이 바꾼 주소도 화면 안 라우터로 옮긴다.
      // 다시 로드하면 스크롤·입력·열린 창이 사라지기 때문이다.
      contents.send(NATIVE_TAB_NAVIGATE_CHANNEL, { route });
      return;
    }
    const destination = this.resolveDestination(route);
    if ('url' in destination) {
      await contents.loadURL(destination.url);
    } else {
      await contents.loadFile(destination.filePath, destination.options);
    }
    this.appDocumentLoaded = true;
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
  /**
   * @param afterReorder 탭 화면을 붙이거나 앞으로 가져온 뒤 부른다. 전화 팝업 층처럼
   *   항상 탭 화면 위에 있어야 하는 view를 다시 맨 위로 올릴 때 쓴다.
   * @param isFrontWindow 이 창이 앱의 창들 가운데 지금 쓰고 있는(가장 최근에 앞에 온)
   *   창인지. 탭 화면에 focus를 주면(webContents.focus) macOS·Linux에서는 그 창도 앞으로
   *   나오므로, 뒤에 있는 창의 탭 화면에는 focus를 주지 않는다.
   */
  constructor(
    readonly window: BrowserWindow,
    private readonly afterReorder?: () => void,
    private readonly isFrontWindow?: () => boolean,
  ) {}

  get id(): number {
    return this.window.id;
  }

  isDestroyed(): boolean {
    return this.window.isDestroyed();
  }

  attach(view: NativeTabViewPort): void {
    this.window.contentView.addChildView(electronView(view));
    this.afterReorder?.();
  }

  detach(view: NativeTabViewPort): void {
    if (!this.window.isDestroyed()) {
      this.window.contentView.removeChildView(electronView(view));
    }
  }

  bringToFront(view: NativeTabViewPort): void {
    // Electron documents that adding an existing child again only reorders it.
    this.window.contentView.addChildView(electronView(view));
    this.afterReorder?.();
  }

  canTakeFocus(): boolean {
    return this.isFrontWindow?.() ?? true;
  }
}
