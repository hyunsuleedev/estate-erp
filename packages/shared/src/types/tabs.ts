export type TabId = string;

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
  | 'inbox'
  | 'employee'
  | 'settings'
  | 'dashboard'
  | 'generic';

export interface Tab {
  id: TabId;
  kind: TabKind;
  title: string;
  route: string;
  routeParams?: Record<string, unknown>;
  uiState?: {
    scrollY?: number;
    formDraft?: Record<string, unknown>;
  };
  createdAt: number;
}

export interface DetachPayload {
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
  tab: Tab;
  /** 마우스 다운 시점의 화면(screen) 좌표 */
  pointerScreen: { x: number; y: number };
  /** 마우스가 탭 좌측 상단으로부터 떨어진 offset */
  mouseOffset: { x: number; y: number };
  size?: { width: number; height: number };
}

export type WindowKind = 'main' | 'detached';

export interface InvalidateMessage {
  queryKey: readonly unknown[];
  sourceWindowId: number;
}
