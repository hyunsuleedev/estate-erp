import type { Tab, TabId } from '@estate-erp/shared';
import type { NativeTabHost } from '../nativeTabHost';
import type { TabViewsPort } from './tabRegistry';

/**
 * 탭 목록(TabRegistry)이 정한 것을 탭 화면(NativeTabHost)에 반영한다.
 *
 * 탭 목록은 "이 창에는 이 탭을 보여 준다"만 말하고, 화면을 만들고(예비 화면 사용
 * 포함) 옮기고 없애는 일은 여기서 한다. 화면을 띄우는 데는 시간이 걸릴 수 있어
 * (새로 만들면 수백 ms), 그 사이 다른 탭을 고르면 마지막 요청만 반영한다.
 *
 * Electron에 직접 의존하지 않는다. NativeTabHost가 창과 화면을 포트로 받기 때문이다.
 */
export type TabViewHost = Pick<
  NativeTabHost,
  | 'openOrUpdateTab'
  | 'activate'
  | 'close'
  | 'reparent'
  | 'settleMove'
  | 'hasUnsavedWork'
  | 'hasTab'
  | 'getHostId'
  | 'getActiveTabId'
  | 'releaseActivationLease'
  | 'sendToTab'
>;

export interface TabViewCoordinatorCallbacks {
  /** 탭 화면을 띄우지 못했다. 탭 목록이 다시 시도할지, 실패로 표시할지 정한다. */
  onPresentFailed(windowId: number, tabId: TabId, error: unknown): void;
  /**
   * 탭 화면이 그 창에 붙었다(새로 보여 줬거나 다른 창에서 옮겨 왔다). 창 단위 상태
   * (사이드바, 전화 팝업 여백)를 그 화면에 다시 알릴 때 쓴다.
   */
  onViewAttached?(tabId: TabId, windowId: number): void;
}

export type PresentOutcome = 'shown' | 'hidden' | 'superseded' | 'failed';

export class TabViewCoordinator implements TabViewsPort {
  /** 창마다의 요청 순번. 늦게 끝난 예전 요청이 새 요청을 덮지 못하게 한다. */
  private readonly sequence = new Map<number, number>();
  /** 창마다 진행 중인 마지막 "보여 주기". 그 뒤에 보낼 것(알림)이 끝나기를 기다릴 때 쓴다. */
  private readonly inFlight = new Map<number, Promise<PresentOutcome>>();

  constructor(
    private readonly host: TabViewHost,
    private readonly callbacks: TabViewCoordinatorCallbacks,
  ) {}

  present(windowId: number, tab: Tab | null): void {
    void this.presentAndWait(windowId, tab);
  }

  /** `present`와 같고, 끝난 결과를 알려 준다(테스트와 창을 보여 줄 시점을 정할 때). */
  presentAndWait(windowId: number, tab: Tab | null): Promise<PresentOutcome> {
    const run = this.runPresent(windowId, tab);
    this.inFlight.set(windowId, run);
    const done = () => {
      if (this.inFlight.get(windowId) === run) this.inFlight.delete(windowId);
    };
    void run.then(done, done);
    return run;
  }

  /**
   * 그 창에 대해 진행 중인 보여 주기가 끝날 때까지 기다린다. 기다리는 동안 다른 탭을 또
   * 고르면 그것까지 기다린다. 진행 중인 것이 없으면 바로 끝난다.
   */
  async whenPresented(windowId: number): Promise<void> {
    for (;;) {
      const pending = this.inFlight.get(windowId);
      if (!pending) return;
      await pending.catch(() => undefined);
      if (this.inFlight.get(windowId) === pending) {
        this.inFlight.delete(windowId);
        return;
      }
    }
  }

  /**
   * 그 창에서 보이는 탭 화면에 보낸다(알림 등). 탭을 바꾸는 중이면 바뀐 뒤에 보이는 화면에
   * 보낸다: 바꾸기 전 화면에 보내면 곧 가려져 사용자가 보지 못한다. 보이는 탭 화면이
   * 없으면 false다.
   */
  async sendToPresentedTab(
    windowId: number,
    channel: string,
    payload: unknown,
  ): Promise<boolean> {
    await this.whenPresented(windowId);
    const tabId = this.host.getActiveTabId(windowId);
    return tabId !== null && this.host.sendToTab(tabId, channel, payload);
  }

  private async runPresent(windowId: number, tab: Tab | null): Promise<PresentOutcome> {
    const sequence = (this.sequence.get(windowId) ?? 0) + 1;
    this.sequence.set(windowId, sequence);
    const isLatest = () => this.sequence.get(windowId) === sequence;

    try {
      if (!tab) {
        this.host.activate(windowId, null);
        return 'hidden';
      }

      // 화면이 아직 다른 창에 붙어 있으면 먼저 옮긴다. 같은 탭의 화면을 둘 만들지 않는다.
      const attachedTo = this.host.getHostId(tab.id);
      if (attachedTo !== null && attachedTo !== windowId) this.move(tab.id, windowId);

      // 새 화면이 뜨는 동안 이전 탭의 화면을 그대로 두면 고른 탭과 내용이 어긋난다.
      const previous = this.host.getActiveTabId(windowId);
      if (previous !== null && previous !== tab.id) this.host.activate(windowId, null);

      const opened = await this.host.openOrUpdateTab(windowId, tab, {
        activate: false,
        retainUntilActivation: true,
      });
      try {
        if (!isLatest()) return 'superseded';
        this.host.activate(windowId, tab.id);
        this.callbacks.onViewAttached?.(tab.id, windowId);
        return 'shown';
      } finally {
        if (opened.activationLease) {
          this.host.releaseActivationLease(opened.activationLease);
        }
      }
    } catch (error) {
      // 그사이 다른 탭을 골랐으면 이 실패는 지금 보이는 탭의 일이 아니다. 그 탭을
      // 다시 고를 때 새로 시도한다.
      if (!isLatest() || !tab) return 'superseded';
      this.callbacks.onPresentFailed(windowId, tab.id, error);
      return 'failed';
    }
  }

  discard(tabId: TabId): void {
    this.host.close(tabId);
  }

  move(tabId: TabId, toWindowId: number): void {
    if (!this.host.hasTab(tabId)) return;
    const from = this.host.getHostId(tabId);
    if (from === null || from === toWindowId) return;
    try {
      const move = this.host.reparent(tabId, toWindowId);
      // 탭 목록에서는 이미 옮겨졌다. 되돌릴 일이 없으므로 바로 확정한다.
      this.host.settleMove(move);
      this.callbacks.onViewAttached?.(tabId, toWindowId);
    } catch {
      // 떠 있는 화면을 옮기지 못했다. 그 화면은 버리고, 보여 줄 때 새로 띄운다.
      this.host.close(tabId);
    }
  }

  hasUnsavedWork(windowId: number, tabId: TabId): boolean {
    return this.host.hasUnsavedWork(windowId, tabId);
  }

  /** 창이 닫혔다. 그 창의 순번 기록을 지운다. */
  forgetWindow(windowId: number): void {
    this.sequence.delete(windowId);
    this.inFlight.delete(windowId);
  }
}
