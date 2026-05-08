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

export type WindowKind = 'main' | 'detached';

export interface InvalidateMessage {
  queryKey: readonly unknown[];
  sourceWindowId: number;
}
