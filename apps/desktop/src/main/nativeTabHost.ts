import type { Tab } from '@estate-erp/shared';

export interface NativeTabBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Electron types are deliberately hidden behind this port. Besides making the
 * ownership rules testable, this keeps node:test from loading Electron's runtime.
 */
export interface NativeTabViewPort {
  readonly senderId: number;
  isDestroyed(): boolean;
  navigate(route: string): Promise<void>;
  setBounds(bounds: NativeTabBounds): void;
  setVisible(visible: boolean): void;
  send(channel: string, payload: unknown): void;
  focus(): void;
  destroy(): void;
  /** 탭 화면이 사이드바와 화면 틀을 처음 그릴 때까지 기다린다(없으면 바로 끝). */
  whenReady?(): Promise<void>;
  /** 미리 띄워 둔 탭 화면에 실제 탭을 맡긴다. */
  assign?(tab: Readonly<Tab>): void;
  /**
   * 화면의 프로세스가 죽었는지. 죽은 화면은 없어지지 않고 남아 있지만 아무것도 그리지
   * 못하고 메시지도 받지 못한다.
   */
  isCrashed?(): boolean;
}

export interface NativeTabHostPort {
  readonly id: number;
  isDestroyed(): boolean;
  attach(view: NativeTabViewPort): void;
  detach(view: NativeTabViewPort): void;
  bringToFront(view: NativeTabViewPort): void;
  /**
   * 이 창에서 보여 주는 탭 화면에 키보드 입력을 줘도 되는지. 탭 화면에 입력을 주면 그 창도
   * 앞으로 나오므로, 앱의 다른 창을 쓰고 있는 동안에는 아니다. 없으면 늘 준다.
   */
  canTakeFocus?(): boolean;
}

export interface NativeTabViewFactory {
  create(tab: Readonly<Tab>): NativeTabViewPort;
}

export interface NativeTabSenderIdentity {
  tabId: string;
  hostId: number;
  tab: Tab;
}

export interface NativeTabRendererState {
  route: string;
  title?: string;
  kind?: Tab['kind'];
  resourceKey?: string;
}

export interface NativeTabMove {
  readonly tabId: string;
  readonly sourceHostId: number;
  readonly targetHostId: number;
  readonly revision: number;
  readonly previousSourceActiveTabId: string | null;
  readonly previousTargetActiveTabId: string | null;
}

export interface NativeTabHostOptions {
  onCleanupError?: (error: unknown) => void;
  /**
   * Global soft cap for live renderer views. Active and explicitly protected
   * tabs win over this limit; the oldest eligible inactive view is discarded.
   */
  maxLiveTabs?: number;
  /** Minimum inactive time before a clean renderer becomes evictable. */
  inactiveGraceMs?: number;
  /**
   * 새 탭이 앱을 처음부터 띄우지 않도록 탭 화면 하나를 미리 띄워 둔다(Notion의
   * prewarmed tab). `createTab`은 미리 띄울 때 쓸 자리표시 탭을 만든다.
   */
  spare?: {
    createTab: () => Tab;
    /** 하나를 쓰고 다음 것을 띄우기까지 기다리는 시간. 방금 연 탭과 경쟁하지 않게 한다. */
    replenishDelayMs?: number;
  };
}

interface SpareRecord {
  view: NativeTabViewPort;
  loaded: boolean;
}

export type NativeTabProtectionReason =
  | 'unreported'
  | 'dirty'
  | 'mutation'
  | 'suspended';

export interface NativeTabRetentionState {
  mutating: boolean;
  transientEditor: boolean;
  explicitDirty: boolean;
}

interface HostRecord {
  port: NativeTabHostPort;
  bounds: NativeTabBounds;
  activeTabId: string | null;
  tabIds: Set<string>;
  /** Host projection revision. Ownership rollback uses the tab revision instead. */
  epoch: number;
}

interface TabRecord {
  tab: Tab;
  view: NativeTabViewPort;
  hostId: number;
  revision: number;
  lastAccessed: number;
  lastAccessedAt: number;
  protectionReasons: Set<NativeTabProtectionReason>;
  latestOpeningOperationId: number;
  loadedRoute: string | null;
  pendingNavigation: { route: string; promise: Promise<void> } | null;
}

export interface OpenNativeTabResult {
  created: boolean;
  senderId: number;
  /** Caller-held pin for the await-open -> activate gap. */
  activationLease?: NativeTabActivationLease;
}

export interface NativeTabActivationLease {
  readonly tabId: string;
  readonly senderId: number;
  readonly operationId: number;
  readonly hostId: number;
  readonly ownershipRevision: number;
}

const EMPTY_BOUNDS: NativeTabBounds = { x: 0, y: 0, width: 0, height: 0 };

function cloneTab(tab: Tab): Tab {
  return structuredClone(tab);
}

function normalizeBounds(bounds: NativeTabBounds): NativeTabBounds {
  const values = [bounds.x, bounds.y, bounds.width, bounds.height];
  if (!values.every(Number.isFinite) || bounds.width < 0 || bounds.height < 0) {
    throw new RangeError('native tab bounds must be finite and non-negative');
  }
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  };
}

/**
 * Main-process authority for native tab surfaces.
 *
 * Invariants:
 * - a tab owns exactly one live view;
 * - a view is attached to exactly one registered host;
 * - sender lookup is resolved here instead of BrowserWindow.fromWebContents();
 * - every view is explicitly destroyed when its tab or host closes.
 */
export class NativeTabHost {
  private readonly hosts = new Map<number, HostRecord>();
  private readonly tabs = new Map<string, TabRecord>();
  private readonly senderToTabId = new Map<number, string>();
  private readonly onCleanupError: (error: unknown) => void;
  private readonly maxLiveTabs: number;
  private readonly inactiveGraceMs: number;
  private readonly movingTabRevisions = new Map<string, number>();
  /** Tokenized `opening` protection; concurrent/stale operations cannot unpin each other. */
  private readonly openingOperations = new Map<string, Set<number>>();
  private accessClock = 0;
  private operationClock = 0;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly spareOptions: NativeTabHostOptions['spare'];
  private spare: SpareRecord | null = null;
  private spareTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly viewFactory: NativeTabViewFactory,
    options: NativeTabHostOptions = {},
  ) {
    this.onCleanupError = options.onCleanupError ?? (() => undefined);
    const maxLiveTabs = options.maxLiveTabs ?? Number.POSITIVE_INFINITY;
    if (
      maxLiveTabs !== Number.POSITIVE_INFINITY &&
      (!Number.isInteger(maxLiveTabs) || maxLiveTabs < 1)
    ) {
      throw new RangeError('maxLiveTabs must be a positive integer');
    }
    this.maxLiveTabs = maxLiveTabs;
    const inactiveGraceMs = options.inactiveGraceMs ?? 0;
    if (!Number.isFinite(inactiveGraceMs) || inactiveGraceMs < 0) {
      throw new RangeError('inactiveGraceMs must be finite and non-negative');
    }
    this.inactiveGraceMs = inactiveGraceMs;
    this.spareOptions = options.spare;
  }

  registerHost(
    host: NativeTabHostPort,
    initialBounds: NativeTabBounds = EMPTY_BOUNDS,
  ): () => void {
    if (host.isDestroyed())
      throw new Error(`native tab host ${host.id} is destroyed`);
    if (this.hosts.has(host.id)) {
      throw new Error(`native tab host ${host.id} is already registered`);
    }

    const record: HostRecord = {
      port: host,
      bounds: normalizeBounds(initialBounds),
      activeTabId: null,
      tabIds: new Set(),
      epoch: 0,
    };
    this.hosts.set(host.id, record);

    // A stale disposer must never unregister a later host which reused the id.
    return () => {
      if (this.hosts.get(host.id) === record) this.unregisterHost(host.id);
    };
  }

  unregisterHost(hostId: number): number {
    const host = this.hosts.get(hostId);
    if (!host) return 0;
    const tabIds = [...host.tabIds];
    for (const tabId of tabIds) this.close(tabId);
    this.hosts.delete(hostId);
    return tabIds.length;
  }

  updateBounds(hostId: number, bounds: NativeTabBounds): void {
    const host = this.requireHost(hostId);
    const normalized = normalizeBounds(bounds);
    host.bounds = normalized;
    for (const tabId of host.tabIds) {
      const record = this.tabs.get(tabId);
      if (!record || record.view.isDestroyed()) continue;
      record.view.setBounds(normalized);
    }
  }

  async openOrUpdateTab(
    hostId: number,
    tab: Tab,
    options: { activate?: boolean; retainUntilActivation?: boolean } = {},
  ): Promise<OpenNativeTabResult> {
    const host = this.requireHost(hostId);
    const shouldActivate = options.activate ?? true;
    const existing = this.tabs.get(tab.id);

    if (existing?.view.isDestroyed()) {
      this.close(tab.id);
    } else if (existing) {
      if (existing.hostId !== hostId) {
        throw new Error(
          `native tab ${tab.id} belongs to host ${existing.hostId}; use reparent()`,
        );
      }
      const nextTab = cloneTab(tab);
      const operation = this.beginOpening(existing);
      let retainOperation = false;
      try {
        if (
          existing.loadedRoute !== nextTab.route ||
          existing.pendingNavigation !== null
        ) {
          await this.navigateRecord(existing, nextTab.route);
        }
        this.requireCurrentOpening(existing, operation);
        existing.tab = nextTab;
        this.touch(existing);
        if (shouldActivate) this.activate(hostId, tab.id);
        else if (options.retainUntilActivation) retainOperation = true;
        return {
          created: false,
          senderId: existing.view.senderId,
          ...(retainOperation ? { activationLease: operation } : {}),
        };
      } catch (error) {
        if (
          existing.loadedRoute === null &&
          this.isCurrentOpening(existing, operation) &&
          existing.hostId === operation.hostId &&
          existing.revision === operation.ownershipRevision
        ) {
          // A second open can become the latest waiter for the creator's
          // shared initial navigation. If that load fails, the stale creator
          // is no longer allowed to clean up, so the latest waiter owns
          // removing the still-blank record. A renderer which loaded once is
          // retained on later navigation failures.
          this.close(tab.id);
        }
        throw error;
      } finally {
        if (!retainOperation) {
          this.releaseOpening(operation, !shouldActivate ? tab.id : undefined);
        }
      }
    }

    const nextTab = cloneTab(tab);
    const spareView = this.takeSpare();
    const view = spareView ?? this.viewFactory.create(nextTab);
    if (view.isDestroyed()) {
      throw new Error(`native tab view for ${tab.id} was created destroyed`);
    }
    if (this.senderToTabId.has(view.senderId)) {
      this.safeCleanup(() => view.destroy());
      throw new Error(
        `native tab sender ${view.senderId} is already registered`,
      );
    }

    const record: TabRecord = {
      tab: nextTab,
      view,
      hostId,
      revision: 0,
      lastAccessed: this.nextAccessTime(),
      lastAccessedAt: Date.now(),
      // Unknown renderer state is fail-safe: it may exceed the soft cap, but
      // it is never discarded until the renderer explicitly reports status.
      protectionReasons: new Set(['unreported']),
      latestOpeningOperationId: 0,
      loadedRoute: null,
      pendingNavigation: null,
    };
    this.tabs.set(tab.id, record);
    this.senderToTabId.set(view.senderId, tab.id);
    host.tabIds.add(tab.id);
    host.epoch += 1;
    const operation = this.beginOpening(record);

    let retainOperation = false;
    try {
      view.setVisible(false);
      host.port.attach(view);
      view.setBounds(host.bounds);
      if (spareView) {
        // 앱은 이미 떠 있다. 탭을 맡기면 화면 안에서 그 주소로 옮겨 그린다.
        spareView.assign?.(nextTab);
        record.loadedRoute = nextTab.route;
      } else {
        await this.navigateRecord(record, nextTab.route);
      }
      await view.whenReady?.();
      this.requireCurrentOpening(record, operation);
      if (shouldActivate) this.activate(hostId, tab.id);
      else if (options.retainUntilActivation) retainOperation = true;
      this.scheduleSparePreparation();
      return {
        created: true,
        senderId: view.senderId,
        ...(retainOperation ? { activationLease: operation } : {}),
      };
    } catch (error) {
      if (
        this.isCurrentOpening(record, operation) &&
        record.hostId === operation.hostId &&
        record.revision === operation.ownershipRevision
      ) {
        // close() resolves the record's current owner and active projection;
        // captured source-host cleanup can leave dangling host.tabIds.
        this.close(tab.id);
      }
      throw error;
    } finally {
      if (!retainOperation) {
        this.releaseOpening(operation, !shouldActivate ? tab.id : undefined);
      }
    }
  }

  releaseActivationLease(lease: NativeTabActivationLease): boolean {
    return this.releaseOpening(lease);
  }

  activate(hostId: number, tabId: string | null): void {
    const host = this.requireHost(hostId);
    if (tabId !== null) {
      const selected = this.requireTab(tabId);
      if (selected.hostId !== hostId) {
        throw new Error(
          `native tab ${tabId} does not belong to host ${hostId}`,
        );
      }
    }
    if (tabId !== null) this.touch(this.requireTab(tabId));
    if (host.activeTabId === tabId) {
      this.reconcileLiveTabLimit();
      return;
    }

    const previousActive =
      host.activeTabId === null ? null : this.tabs.get(host.activeTabId);
    if (previousActive && previousActive.tab.id !== tabId) {
      // Grace starts when a renderer actually becomes inactive, not when it
      // was last interacted with while still selected.
      this.touch(previousActive);
    }

    for (const candidateId of host.tabIds) {
      const candidate = this.tabs.get(candidateId);
      if (!candidate || candidate.view.isDestroyed()) continue;
      candidate.view.setVisible(candidateId === tabId);
    }
    if (tabId !== null) {
      const selected = this.requireTab(tabId);
      selected.view.setBounds(host.bounds);
      host.port.bringToFront(selected.view);
      selected.view.setVisible(true);
      // 뒤에 있는 창의 탭이 바뀐 것(탭을 다른 창으로 옮긴 뒤 남은 탭을 보여 줄 때 등)으로
      // 그 창이 쓰고 있는 창 앞으로 튀어나오면 안 된다.
      if (host.port.canTakeFocus?.() ?? true) selected.view.focus();
    }
    host.activeTabId = tabId;
    host.epoch += 1;
    this.reconcileLiveTabLimit();
  }

  reparent(tabId: string, targetHostId: number): NativeTabMove {
    const record = this.requireTab(tabId);
    if (this.movingTabRevisions.has(tabId)) {
      throw new Error(`native tab ${tabId} already has a pending move`);
    }
    const source = this.requireHost(record.hostId);
    const target = this.requireHost(targetHostId);
    if (source.port.id === target.port.id) {
      throw new Error(
        `native tab ${tabId} is already attached to host ${targetHostId}`,
      );
    }

    const previousSourceActiveTabId = source.activeTabId;
    const previousTargetActiveTabId = target.activeTabId;
    const wasVisible = previousSourceActiveTabId === tabId;

    const previousTargetActive = previousTargetActiveTabId
      ? this.tabs.get(previousTargetActiveTabId)
      : undefined;
    try {
      // Hide the resident before attaching the moving view. If either step
      // fails, both views are restored before any ownership bookkeeping moves.
      previousTargetActive?.view.setVisible(false);
      this.moveView(record.view, source, target, target.bounds, true, () => {
        record.view.setVisible(wasVisible);
      });
    } catch (error) {
      if (previousTargetActive && !target.port.isDestroyed()) {
        this.safeCleanup(() =>
          previousTargetActive.view.setBounds(target.bounds),
        );
        this.safeCleanup(() =>
          target.port.bringToFront(previousTargetActive.view),
        );
        this.safeCleanup(() => previousTargetActive.view.setVisible(true));
      }
      throw error;
    }

    if (previousTargetActive) {
      // Moving into an occupied host deactivates its resident tab. Its grace
      // period starts now, just like an ordinary activate() transition.
      this.touch(previousTargetActive);
    }
    source.tabIds.delete(tabId);
    target.tabIds.add(tabId);
    if (source.activeTabId === tabId) source.activeTabId = null;
    target.activeTabId = tabId;
    record.hostId = targetHostId;
    record.revision += 1;
    this.touch(record);
    this.movingTabRevisions.set(tabId, record.revision);
    source.epoch += 1;
    target.epoch += 1;

    return {
      tabId,
      sourceHostId: source.port.id,
      targetHostId: target.port.id,
      revision: record.revision,
      previousSourceActiveTabId,
      previousTargetActiveTabId,
    };
  }

  /**
   * Completes a successful reparent transaction. The move protection is
   * revision-bound so a stale commit cannot unpin a later move of the tab.
   */
  settleMove(move: NativeTabMove): boolean {
    if (this.movingTabRevisions.get(move.tabId) !== move.revision) return false;
    this.movingTabRevisions.delete(move.tabId);
    this.reconcileLiveTabLimit();
    return true;
  }

  /** Different reasons are tracked independently; clearing dirty never clears mutation. */
  setTabProtection(
    tabId: string,
    reason: NativeTabProtectionReason,
    protectedState: boolean,
  ): boolean {
    const record = this.tabs.get(tabId);
    if (!record || record.view.isDestroyed()) return false;
    if (protectedState) record.protectionReasons.add(reason);
    else record.protectionReasons.delete(reason);
    if (!protectedState) this.reconcileLiveTabLimit();
    return true;
  }

  /**
   * Atomically replaces the renderer-owned retention state and clears the
   * fail-safe `unreported` pin. The sender reverse index is the trust boundary.
   */
  reportTabRetention(
    senderId: number,
    state: NativeTabRetentionState,
  ): NativeTabSenderIdentity | null {
    const tabId = this.senderToTabId.get(senderId);
    const record = tabId ? this.tabs.get(tabId) : undefined;
    if (!tabId || !record || record.view.isDestroyed()) return null;
    record.protectionReasons.delete('unreported');
    this.replaceProtection(
      record,
      'mutation',
      state.mutating,
    );
    this.replaceProtection(
      record,
      'dirty',
      state.explicitDirty || state.transientEditor,
    );
    this.reconcileLiveTabLimit();
    return {
      tabId,
      hostId: record.hostId,
      tab: cloneTab(record.tab),
    };
  }

  close(tabId: string): boolean {
    const record = this.tabs.get(tabId);
    if (!record) return false;
    const host = this.hosts.get(record.hostId);

    this.tabs.delete(tabId);
    this.senderToTabId.delete(record.view.senderId);
    this.movingTabRevisions.delete(tabId);
    this.openingOperations.delete(tabId);
    if (host) {
      host.tabIds.delete(tabId);
      if (host.activeTabId === tabId) host.activeTabId = null;
      host.epoch += 1;
    }

    this.safeCleanup(() => record.view.setVisible(false));
    if (host && !host.port.isDestroyed()) {
      this.safeCleanup(() => host.port.detach(record.view));
    }
    // BaseWindow/BrowserWindow does not destroy child WebContentsViews for us.
    this.safeCleanup(() => record.view.destroy());
    if (this.tabs.size <= this.maxLiveTabs) this.clearReconcileTimer();
    return true;
  }

  lookupSender(senderId: number): NativeTabSenderIdentity | null {
    const tabId = this.senderToTabId.get(senderId);
    const record = tabId ? this.tabs.get(tabId) : undefined;
    if (!tabId || !record) return null;
    if (record.view.isDestroyed()) {
      this.close(tabId);
      return null;
    }
    return {
      tabId,
      hostId: record.hostId,
      tab: cloneTab(record.tab),
    };
  }

  /** Renderer failure 처리용. destroyed 여부와 무관하게 마지막 ownership을 읽는다. */
  peekSender(senderId: number): NativeTabSenderIdentity | null {
    const tabId = this.senderToTabId.get(senderId);
    const record = tabId ? this.tabs.get(tabId) : undefined;
    return tabId && record
      ? { tabId, hostId: record.hostId, tab: cloneTab(record.tab) }
      : null;
  }

  removeFailedSender(senderId: number): NativeTabSenderIdentity | null {
    const tabId = this.senderToTabId.get(senderId);
    const record = tabId ? this.tabs.get(tabId) : undefined;
    if (!tabId || !record) {
      // 탭을 맡기 전의 예비 화면이 죽었다. 그대로 두면 다음 새 탭이 죽은 화면을 받는다.
      this.replaceSpareIfSender(senderId);
      return null;
    }
    const identity: NativeTabSenderIdentity = {
      tabId,
      hostId: record.hostId,
      tab: cloneTab(record.tab),
    };
    this.close(tabId);
    return identity;
  }

  updateRendererState(
    senderId: number,
    state: NativeTabRendererState,
  ): NativeTabSenderIdentity | null {
    const tabId = this.senderToTabId.get(senderId);
    const record = tabId ? this.tabs.get(tabId) : undefined;
    if (!tabId || !record || record.view.isDestroyed()) return null;
    record.tab = {
      ...record.tab,
      route: state.route,
      title: state.title ?? record.tab.title,
      kind: state.kind ?? record.tab.kind,
      resourceKey: state.resourceKey ?? record.tab.resourceKey,
    };
    record.loadedRoute = state.route;
    this.touch(record);
    return {
      tabId,
      hostId: record.hostId,
      tab: cloneTab(record.tab),
    };
  }

  broadcast(
    channel: string,
    payload: unknown,
    options: { exceptSenderId?: number; includeSpare?: boolean } = {},
  ): number {
    let delivered = 0;
    for (const record of [...this.tabs.values()]) {
      if (record.view.senderId === options.exceptSenderId) continue;
      if (record.view.isDestroyed()) {
        this.close(record.tab.id);
        continue;
      }
      try {
        record.view.send(channel, payload);
        delivered += 1;
      } catch (error) {
        this.onCleanupError(error);
      }
    }
    // 미리 띄워 둔 여분 화면도 앱 전체 상태(로그인 세션)는 같이 받아야, 탭으로
    // 배정되는 순간 지난 값을 보여 주지 않는다.
    const spare = options.includeSpare ? this.spare : null;
    if (
      spare &&
      spare.view.senderId !== options.exceptSenderId &&
      !spare.view.isDestroyed()
    ) {
      try {
        spare.view.send(channel, payload);
        delivered += 1;
      } catch (error) {
        this.onCleanupError(error);
      }
    }
    return delivered;
  }

  /** 한 창(host)에 붙은 탭 화면에만 보낸다. 사이드바처럼 창 단위 상태에 쓴다. */
  sendToHost(hostId: number, channel: string, payload: unknown): number {
    let delivered = 0;
    for (const tabId of [...(this.hosts.get(hostId)?.tabIds ?? [])]) {
      if (this.sendToTab(tabId, channel, payload)) delivered += 1;
    }
    return delivered;
  }

  sendToTab(tabId: string, channel: string, payload: unknown): boolean {
    const record = this.tabs.get(tabId);
    if (!record) return false;
    if (record.view.isDestroyed()) {
      this.close(tabId);
      return false;
    }
    try {
      record.view.send(channel, payload);
      return true;
    } catch (error) {
      this.onCleanupError(error);
      return false;
    }
  }

  hasTab(tabId: string): boolean {
    return this.tabs.has(tabId);
  }

  getHostId(tabId: string): number | null {
    return this.tabs.get(tabId)?.hostId ?? null;
  }

  /**
   * 셸 내비게이션이 이 탭의 renderer를 버려도 되는지 판단한다.
   * 열린 편집기/다이얼로그, 저장 전 변경, 진행 중인 저장이 있으면 true.
   * 아직 첫 상태 보고 전(`unreported`)인 renderer도 LRU와 같은 fail-safe로
   * 미저장 작업이 있다고 본다.
   */
  hasUnsavedWork(hostId: number, tabId: string): boolean {
    const record = this.tabs.get(tabId);
    if (!record || record.hostId !== hostId || record.view.isDestroyed()) {
      return false;
    }
    return (
      record.protectionReasons.has('unreported') ||
      record.protectionReasons.has('dirty') ||
      record.protectionReasons.has('mutation')
    );
  }

  getTabSnapshot(tabId: string): Tab | null {
    const record = this.tabs.get(tabId);
    return record && !record.view.isDestroyed() ? cloneTab(record.tab) : null;
  }

  getActiveTabId(hostId: number): string | null {
    return this.hosts.get(hostId)?.activeTabId ?? null;
  }

  focus(tabId: string): boolean {
    const record = this.tabs.get(tabId);
    if (!record || record.view.isDestroyed()) return false;
    this.touch(record);
    record.view.focus();
    return true;
  }

  getLiveTabCount(): number {
    return this.tabs.size;
  }

  dispose(): void {
    this.clearReconcileTimer();
    this.discardSpare();
    for (const hostId of [...this.hosts.keys()]) this.unregisterHost(hostId);
  }

  /** 로그인한 사람이 바뀌면 미리 띄운 탭 화면도 버린다(이전 사람의 세션으로 떠 있다). */
  clearTabs(): void {
    this.clearReconcileTimer();
    this.discardSpare();
    for (const tabId of [...this.tabs.keys()]) this.close(tabId);
  }

  /** 미리 띄워 둔 탭 화면의 WebContents인지. 로그인 정보 요청을 허용할 때 쓴다. */
  isSpareSender(senderId: number): boolean {
    const spare = this.spare;
    return Boolean(spare && !spare.view.isDestroyed() && spare.view.senderId === senderId);
  }

  hasSpare(): boolean {
    return this.spare !== null;
  }

  /** 지금 바로 탭 화면 하나를 미리 띄운다. 이미 있거나 설정이 없으면 아무것도 하지 않는다. */
  prepareSpare(): void {
    this.clearSpareTimer();
    if (!this.spareOptions || this.spare) return;
    let view: NativeTabViewPort;
    const tab = this.spareOptions.createTab();
    try {
      view = this.viewFactory.create(cloneTab(tab));
    } catch (error) {
      this.onCleanupError(error);
      return;
    }
    if (typeof view.assign !== 'function') {
      this.safeCleanup(() => view.destroy());
      return;
    }
    const record: SpareRecord = { view, loaded: false };
    this.spare = record;
    this.safeCleanup(() => view.setVisible(false));
    view.navigate(tab.route).then(
      () => {
        if (this.spare === record) record.loaded = true;
      },
      (error: unknown) => {
        this.onCleanupError(error);
        if (this.spare === record) this.discardSpare();
      },
    );
  }

  discardSpare(): void {
    this.clearSpareTimer();
    const spare = this.spare;
    this.spare = null;
    if (spare) this.safeCleanup(() => spare.view.destroy());
  }

  /**
   * 그 WebContents가 예비 화면이면 버리고 새 예비 화면을 준비한다(예비 화면의 프로세스가
   * 죽었거나 문서를 불러오지 못했을 때). 예비 화면이었으면 true.
   */
  replaceSpareIfSender(senderId: number): boolean {
    const spare = this.spare;
    if (!spare || spare.view.senderId !== senderId) return false;
    this.discardSpare();
    this.scheduleSparePreparation();
    return true;
  }

  private nextAccessTime(): number {
    this.accessClock += 1;
    return this.accessClock;
  }

  private touch(record: TabRecord): void {
    record.lastAccessed = this.nextAccessTime();
    record.lastAccessedAt = Date.now();
  }

  private beginOpening(record: TabRecord): NativeTabActivationLease {
    this.operationClock += 1;
    const operations = this.openingOperations.get(record.tab.id) ?? new Set();
    operations.add(this.operationClock);
    this.openingOperations.set(record.tab.id, operations);
    record.latestOpeningOperationId = this.operationClock;
    return {
      tabId: record.tab.id,
      senderId: record.view.senderId,
      operationId: this.operationClock,
      hostId: record.hostId,
      ownershipRevision: record.revision,
    };
  }

  private releaseOpening(
    operation: NativeTabActivationLease,
    exceptTabId?: string,
  ): boolean {
    const operations = this.openingOperations.get(operation.tabId);
    if (!operations?.delete(operation.operationId)) return false;
    if (operations.size === 0) this.openingOperations.delete(operation.tabId);
    this.reconcileLiveTabLimit(exceptTabId);
    // A non-retained activate:false result must still name a live sender when
    // its Promise resolves. Reconcile again on the next task if it stayed idle.
    if (exceptTabId && this.tabs.size > this.maxLiveTabs) {
      this.scheduleReconcile(0);
    }
    return true;
  }

  private isCurrentOpening(
    record: TabRecord,
    operation: NativeTabActivationLease,
  ): boolean {
    return (
      this.tabs.get(operation.tabId) === record &&
      !record.view.isDestroyed() &&
      record.view.senderId === operation.senderId &&
      this.senderToTabId.get(operation.senderId) === operation.tabId &&
      record.latestOpeningOperationId === operation.operationId
    );
  }

  private requireCurrentOpening(
    record: TabRecord,
    operation: NativeTabActivationLease,
  ): void {
    if (
      !this.isCurrentOpening(record, operation) ||
      record.hostId !== operation.hostId ||
      record.revision !== operation.ownershipRevision
    ) {
      throw new Error(`native tab ${operation.tabId} opening was superseded`);
    }
  }

  /** 다 뜬 예비 탭 화면을 꺼낸다. 아직 뜨는 중이면 새로 만드는 쪽이 낫다. */
  private takeSpare(): NativeTabViewPort | null {
    const spare = this.spare;
    if (!spare) return null;
    if (spare.view.isDestroyed()) {
      this.spare = null;
      return null;
    }
    if (spare.view.isCrashed?.()) {
      // 죽은 예비 화면에 탭을 맡기면 빈 화면이 뜬다. 버리고 새로 만든다(연 뒤에 다음
      // 예비 화면을 다시 준비한다).
      this.discardSpare();
      return null;
    }
    if (!spare.loaded || this.senderToTabId.has(spare.view.senderId)) return null;
    this.spare = null;
    return spare.view;
  }

  private scheduleSparePreparation(): void {
    if (!this.spareOptions || this.spare || this.spareTimer) return;
    this.spareTimer = setTimeout(() => {
      this.spareTimer = null;
      this.prepareSpare();
    }, Math.max(0, this.spareOptions.replenishDelayMs ?? 1_500));
    this.spareTimer.unref?.();
  }

  private clearSpareTimer(): void {
    if (!this.spareTimer) return;
    clearTimeout(this.spareTimer);
    this.spareTimer = null;
  }

  private navigateRecord(record: TabRecord, route: string): Promise<void> {
    if (record.pendingNavigation?.route === route) {
      return record.pendingNavigation.promise;
    }
    const navigation = record.view.navigate(route);
    const pending = {
      route,
      promise: navigation
        .then(() => {
          if (record.pendingNavigation === pending) record.loadedRoute = route;
        })
        .finally(() => {
          if (record.pendingNavigation === pending) {
            record.pendingNavigation = null;
          }
        }),
    };
    record.pendingNavigation = pending;
    return pending.promise;
  }

  private reconcileLiveTabLimit(exceptTabId?: string): void {
    this.clearReconcileTimer();
    const now = Date.now();
    let nextEligibleAt: number | null = null;
    while (this.tabs.size > this.maxLiveTabs) {
      let oldest: TabRecord | null = null;
      for (const record of this.tabs.values()) {
        if (
          record.tab.id === exceptTabId ||
          this.hosts.get(record.hostId)?.activeTabId === record.tab.id ||
          record.protectionReasons.size > 0 ||
          this.openingOperations.has(record.tab.id) ||
          this.movingTabRevisions.has(record.tab.id)
        ) {
          continue;
        }
        const eligibleAt = record.lastAccessedAt + this.inactiveGraceMs;
        if (eligibleAt > now) {
          nextEligibleAt =
            nextEligibleAt === null
              ? eligibleAt
              : Math.min(nextEligibleAt, eligibleAt);
          continue;
        }
        if (!oldest || record.lastAccessed < oldest.lastAccessed) {
          oldest = record;
        }
      }
      // A soft cap must not trade correctness or unsaved state for memory.
      if (!oldest) {
        if (nextEligibleAt !== null) {
          this.scheduleReconcile(Math.max(0, nextEligibleAt - Date.now()));
        }
        return;
      }
      this.close(oldest.tab.id);
    }
  }

  private replaceProtection(
    record: TabRecord,
    reason: NativeTabProtectionReason,
    protectedState: boolean,
  ): void {
    if (protectedState) record.protectionReasons.add(reason);
    else record.protectionReasons.delete(reason);
  }

  private scheduleReconcile(delayMs: number): void {
    this.clearReconcileTimer();
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = null;
      this.reconcileLiveTabLimit();
    }, Math.max(1, Math.ceil(delayMs)));
    this.reconcileTimer.unref?.();
  }

  private clearReconcileTimer(): void {
    if (!this.reconcileTimer) return;
    clearTimeout(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  private moveView(
    view: NativeTabViewPort,
    source: HostRecord,
    target: HostRecord,
    targetBounds: NativeTabBounds,
    visibleAtTarget: boolean,
    restoreSourceVisibility: () => void,
  ): void {
    let detached = false;
    let attached = false;
    try {
      view.setVisible(false);
      source.port.detach(view);
      detached = true;
      target.port.attach(view);
      attached = true;
      view.setBounds(targetBounds);
      target.port.bringToFront(view);
      view.setVisible(visibleAtTarget);
    } catch (error) {
      if (attached) this.safeCleanup(() => target.port.detach(view));
      if (detached) this.safeCleanup(() => source.port.attach(view));
      this.safeCleanup(() => view.setBounds(source.bounds));
      this.safeCleanup(() => source.port.bringToFront(view));
      this.safeCleanup(restoreSourceVisibility);
      throw error;
    }
  }

  private applyHostVisibility(host: HostRecord): void {
    for (const tabId of host.tabIds) {
      const record = this.tabs.get(tabId);
      if (!record || record.view.isDestroyed()) continue;
      const active = tabId === host.activeTabId;
      this.safeCleanup(() => record.view.setBounds(host.bounds));
      this.safeCleanup(() => record.view.setVisible(active));
      if (active) {
        this.safeCleanup(() => host.port.bringToFront(record.view));
      }
    }
  }

  private validActiveTabForHost(
    tabId: string | null,
    hostId: number,
  ): string | null {
    return tabId !== null && this.tabs.get(tabId)?.hostId === hostId
      ? tabId
      : null;
  }

  private requireHost(hostId: number): HostRecord {
    const host = this.hosts.get(hostId);
    if (!host || host.port.isDestroyed()) {
      throw new Error(`native tab host ${hostId} is unavailable`);
    }
    return host;
  }

  private requireTab(tabId: string): TabRecord {
    const record = this.tabs.get(tabId);
    if (!record || record.view.isDestroyed()) {
      throw new Error(`native tab ${tabId} is unavailable`);
    }
    return record;
  }

  private safeCleanup(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.onCleanupError(error);
    }
  }
}
