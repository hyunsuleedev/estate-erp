export type TabId = string;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type TabKind =
  | 'home'
  | 'property'
  | 'contact'
  | 'consultation'
  | 'deal'
  | 'match'
  | 'task'
  | 'calendar'
  | 'site'
  | 'contract'
  | 'cashflow'
  | 'employee'
  | 'settings'
  | 'dashboard'
  | 'generic';

export interface Tab {
  schemaVersion: 1;
  id: TabId;
  /**
   * 탭 인스턴스와 별개인 업무 리소스 identity.
   * 같은 key를 명시적으로 open-or-reveal 할 때만 기존 탭을 재사용한다.
   */
  resourceKey?: string;
  kind: TabKind;
  title: string;
  /** pathname + search + hash를 모두 포함하는 앱 내부 href */
  route: string;
  routeParams?: Record<string, JsonValue>;
  uiState?: {
    scrollY?: number;
    formDraft?: Record<string, JsonValue>;
  };
  createdAt: number;
}

export interface TabWorkspaceSnapshot {
  schemaVersion: 1;
  tabs: Tab[];
  activeTabId: TabId | null;
}

export interface InitialTabTransfer {
  transferId: string;
  transferTabId: TabId;
  workspace: TabWorkspaceSnapshot;
  /** reload 시 final snapshot 적용/ownership commit 완료 여부 */
  committed: boolean;
}

export interface InitialTabTransferAck {
  transferId: string;
  tabId: TabId;
  accepted: boolean;
  error?: string;
}

export interface CommitTabTransfer {
  transferId: string;
  /** source가 pointer release 직전에 읽은 최신 snapshot */
  tab: Tab;
}

export interface ApplyTabTransferSnapshot {
  transferId: string;
  snapshotId: string;
  tab: Tab;
}

export interface FinalTabTransferSnapshotAck extends InitialTabTransferAck {
  snapshotId: string;
}

export interface TabTransferCommitted {
  transferId: string;
  /** reload/event 순서와 무관하게 target이 마지막으로 적용할 authoritative snapshot */
  tab: Tab;
}

export interface TabTransferAborted {
  transferId: string;
  tabId: string;
  /** rollback target에서 마지막으로 관찰한 native tab state */
  tab?: Tab;
}

export interface DetachPayload {
  transferId: string;
  tab: Tab;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}

/**
 * 드래그 detach 시작 시 source 창이 main에 보내는 payload.
 * mouseOffset = 마우스 누른 시점 탭 좌측 상단 기준 마우스 위치
 *   → 새 창의 같은 상대 위치에 마우스가 오도록 새 창 좌표 계산.
 */
export interface BeginDragPayload {
  transferId: string;
  tab: Tab;
  /** 마우스 다운 시점의 화면(screen) 좌표 */
  pointerScreen: { x: number; y: number };
  /** 마우스가 탭 좌측 상단으로부터 떨어진 offset */
  mouseOffset: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface DragPositionPayload {
  transferId: string;
  pointerScreen: { x: number; y: number };
}

/**
 * 기존 탭을 이동하지 않고 매물 상세를 독립된 focused window로 연다.
 * tab id와 createdAt은 신뢰 경계인 main process가 새로 만든다.
 */
export interface OpenPropertyWindowPayload {
  propertyId: string;
  title: string;
}

export type WindowKind = 'main' | 'detached';

export interface InvalidateMessage {
  queryKey: readonly unknown[];
  sourceWindowId: number;
}
