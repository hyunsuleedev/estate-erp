import type { BrowserWindow, WebContentsView } from 'electron';
import {
  placeCallOverlay,
  type CallOverlayInset,
  type CallOverlaySize,
} from '../common/callOverlay';

/** 팝업이 처음 그려져 크기를 알려 주기 전까지 쓰는 크기(카드 360px + 그림자 여백). */
const DEFAULT_OVERLAY_SIZE: CallOverlaySize = { width: 400, height: 440 };

export const CALL_OVERLAY_STATE_CHANNEL = 'cti:overlayState';

interface OverlayRecord {
  win: BrowserWindow;
  view: WebContentsView;
  state: unknown;
  size: CallOverlaySize;
  visible: boolean;
  /** 마지막으로 알린 차지 높이. 같은 값이면 다시 알리지 않는다. */
  inset: number;
  dispose: () => void;
}

export interface CallOverlayHostOptions {
  /** preload·sandbox가 설정된 WebContentsView를 만들고 팝업 문서를 불러온다. */
  createView: () => WebContentsView;
  /** 탭바 높이. 팝업 층은 탭바를 가리지 않는다. */
  titlebarHeight: number;
  /** 팝업 층이 창 아래쪽을 차지한 높이가 바뀌었다(알림을 그 위로 올릴 때 쓴다). */
  onInsetChange?: (windowId: number, inset: CallOverlayInset) => void;
}

/**
 * 창마다 하나씩 두는 전화 수신 팝업 층.
 *
 * 탭 화면(WebContentsView)들 위에 작은 투명 WebContentsView를 하나 더 얹어
 * 팝업만 그린다. 통화 중에도 탭 화면을 숨기지 않으므로 보던 화면과 입력이 그대로다.
 * 한 번 만든 층은 통화가 끝나도 숨겨 두고 다음 통화에 다시 쓴다.
 */
export class CallOverlayHost {
  private readonly overlays = new Map<number, OverlayRecord>();

  constructor(private readonly options: CallOverlayHostOptions) {}

  setState(win: BrowserWindow, state: unknown): void {
    if (win.isDestroyed()) return;
    let record = this.overlays.get(win.id);
    if (state === null) {
      if (!record) return;
      record.state = null;
      this.send(record, null);
      record.visible = false;
      record.view.setVisible(false);
      this.publishInset(record);
      return;
    }
    record ??= this.create(win);
    record.state = state;
    this.send(record, state);
    record.visible = true;
    this.layout(win.id);
    record.view.setVisible(true);
    this.raise(win.id);
  }

  getStateForSender(senderId: number): unknown {
    return this.recordForSender(senderId)?.state ?? null;
  }

  isOverlaySender(senderId: number): boolean {
    return this.recordForSender(senderId) !== null;
  }

  windowIdForSender(senderId: number): number | null {
    return this.recordForSender(senderId)?.win.id ?? null;
  }

  setSizeFromSender(senderId: number, size: CallOverlaySize): void {
    const record = this.recordForSender(senderId);
    if (!record) return;
    record.size = size;
    this.layout(record.win.id);
  }

  /** 탭 화면을 앞으로 가져온 뒤에도 팝업 층이 맨 위에 남게 한다. */
  raise(windowId: number): void {
    const record = this.overlays.get(windowId);
    if (!record || !record.visible || record.win.isDestroyed()) return;
    // 이미 붙은 child view를 다시 추가하면 순서만 맨 위로 바뀐다.
    record.win.contentView.addChildView(record.view);
  }

  layout(windowId: number): void {
    const record = this.overlays.get(windowId);
    if (!record || record.win.isDestroyed()) return;
    const content = record.win.getContentBounds();
    record.view.setBounds(
      placeCallOverlay(
        { width: content.width, height: content.height },
        record.size,
        this.options.titlebarHeight,
      ),
    );
    this.publishInset(record);
  }

  /** 그 창 아래쪽을 팝업 층이 차지한 높이. 팝업이 없으면 0이다. */
  getInset(windowId: number): CallOverlayInset {
    const record = this.overlays.get(windowId);
    if (!record || !record.visible || record.win.isDestroyed()) return { bottom: 0 };
    return { bottom: record.view.getBounds().height };
  }

  private publishInset(record: OverlayRecord): void {
    if (record.win.isDestroyed()) return;
    const inset = this.getInset(record.win.id);
    if (inset.bottom === record.inset) return;
    record.inset = inset.bottom;
    this.options.onInsetChange?.(record.win.id, inset);
  }

  destroy(windowId: number): void {
    const record = this.overlays.get(windowId);
    if (!record) return;
    this.overlays.delete(windowId);
    record.dispose();
    if (record.inset !== 0 && !record.win.isDestroyed()) {
      this.options.onInsetChange?.(windowId, { bottom: 0 });
    }
    if (!record.win.isDestroyed()) {
      try {
        record.win.contentView.removeChildView(record.view);
      } catch {
        // 창이 같은 turn에 닫히는 중이면 이미 떨어졌다.
      }
    }
    if (!record.view.webContents.isDestroyed()) record.view.webContents.close();
  }

  /** 모든 창의 팝업 층에 보낸다(로그인 세션처럼 앱 전체가 같이 아는 상태). */
  broadcast(channel: string, payload: unknown): void {
    for (const record of this.overlays.values()) {
      if (record.view.webContents.isDestroyed()) continue;
      try {
        record.view.webContents.send(channel, payload);
      } catch {
        // 닫히는 중인 팝업 층은 다음에 다시 만들 때 현재 값을 읽는다.
      }
    }
  }

  /** 로그인한 사람이 바뀌면 이전 세션으로 뜬 팝업 층을 모두 버린다. */
  destroyAll(): void {
    for (const windowId of [...this.overlays.keys()]) this.destroy(windowId);
  }

  private create(win: BrowserWindow): OverlayRecord {
    const view = this.options.createView();
    view.setVisible(false);
    win.contentView.addChildView(view);
    const onResize = () => this.layout(win.id);
    const onClosed = () => this.destroy(win.id);
    const onGone = () => this.destroy(win.id);
    win.on('resize', onResize);
    win.once('closed', onClosed);
    view.webContents.once('render-process-gone', onGone);
    const record: OverlayRecord = {
      win,
      view,
      state: null,
      size: DEFAULT_OVERLAY_SIZE,
      visible: false,
      inset: 0,
      dispose: () => {
        if (!win.isDestroyed()) {
          win.removeListener('resize', onResize);
          win.removeListener('closed', onClosed);
        }
        if (!view.webContents.isDestroyed()) {
          view.webContents.removeListener('render-process-gone', onGone);
        }
      },
    };
    this.overlays.set(win.id, record);
    return record;
  }

  private send(record: OverlayRecord, state: unknown): void {
    if (record.view.webContents.isDestroyed()) return;
    record.view.webContents.send(CALL_OVERLAY_STATE_CHANNEL, state);
  }

  private recordForSender(senderId: number): OverlayRecord | null {
    for (const record of this.overlays.values()) {
      if (
        !record.view.webContents.isDestroyed() &&
        record.view.webContents.id === senderId
      ) {
        return record;
      }
    }
    return null;
  }
}
