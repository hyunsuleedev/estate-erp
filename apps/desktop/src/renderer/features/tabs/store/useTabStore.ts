import { create } from 'zustand';
import type { Tab, TabId, TabKind } from '@estate-erp/shared';

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface OpenTabInput {
  route: string;
  kind?: TabKind;
  title: string;
  routeParams?: Record<string, unknown>;
  activate?: boolean;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: TabId | null;

  openTab(input: OpenTabInput): TabId;
  closeTab(id: TabId): void;
  closeOtherTabs(id: TabId): void;
  closeAllTabs(): void;
  activateTab(id: TabId): void;
  reorderTabs(fromId: TabId, toId: TabId): void;
  updateTabTitle(id: TabId, title: string): void;
  updateTabRoute(id: TabId, route: string, routeParams?: Record<string, unknown>): void;
  removeTabById(id: TabId): void;
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab(input) {
    const id = genId();
    const tab: Tab = {
      id,
      kind: input.kind ?? 'generic',
      title: input.title,
      route: input.route,
      routeParams: input.routeParams,
      createdAt: Date.now(),
    };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: input.activate === false ? state.activeTabId : id,
    }));
    return id;
  },

  closeTab(id) {
    const state = get();
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const next = state.tabs.filter((t) => t.id !== id);
    let nextActive = state.activeTabId;
    if (state.activeTabId === id) {
      const fallback = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
      nextActive = fallback?.id ?? null;
    }
    set({ tabs: next, activeTabId: nextActive });
  },

  closeOtherTabs(id) {
    set((state) => ({
      tabs: state.tabs.filter((t) => t.id === id),
      activeTabId: id,
    }));
  },

  closeAllTabs() {
    set({ tabs: [], activeTabId: null });
  },

  activateTab(id) {
    set((state) => (state.tabs.some((t) => t.id === id) ? { activeTabId: id } : state));
  },

  reorderTabs(fromId, toId) {
    set((state) => {
      const fromIdx = state.tabs.findIndex((t) => t.id === fromId);
      const toIdx = state.tabs.findIndex((t) => t.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return state;
      const next = [...state.tabs];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { tabs: next };
    });
  },

  updateTabTitle(id, title) {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  updateTabRoute(id, route, routeParams) {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, route, routeParams } : t)),
    }));
  },

  removeTabById(id) {
    set((state) => ({
      tabs: state.tabs.filter((t) => t.id !== id),
      activeTabId: state.activeTabId === id ? null : state.activeTabId,
    }));
  },
}));
