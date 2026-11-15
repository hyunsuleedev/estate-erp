import { useSyncExternalStore } from "react";
import {
  competitorTableStorageKey,
  parseCompetitorTablePreferences,
  type CompetitorTablePreferences,
} from "./my-ads-competitor-table-state";

// use-ad-table-preferences.ts와 같은 모양. 그 훅은 매물관리 광고 열에 묶여 있어 따로 둔다.
function createPreferenceStore(key: string) {
  const read = (
    fallback: CompetitorTablePreferences = parseCompetitorTablePreferences(null),
  ) => {
    try {
      return parseCompetitorTablePreferences(localStorage.getItem(key));
    } catch {
      return fallback;
    }
  };
  let snapshot = read();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    snapshot = read(snapshot);
    emit();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      if (listeners.size === 0) {
        snapshot = read(snapshot);
        window.addEventListener("storage", onStorage);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          window.removeEventListener("storage", onStorage);
        }
      };
    },
    update: (
      update: (current: CompetitorTablePreferences) => CompetitorTablePreferences,
    ) => {
      snapshot = update(snapshot);
      try {
        localStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        /* 저장소를 못 써도 지금 화면에서는 계속 쓸 수 있게 둔다. */
      }
      emit();
    },
  };
}

const stores = new Map<string, ReturnType<typeof createPreferenceStore>>();

/** 사무소·사용자별로 하나. 여러 행을 펼치거나 탭을 옮기거나 앱을 다시 켜도 같은 정렬·너비를 쓴다. */
export function useCompetitorTablePreferences(officeId: string, userId: string) {
  const key = competitorTableStorageKey(officeId, userId);
  let store = stores.get(key);
  if (!store) {
    store = createPreferenceStore(key);
    stores.set(key, store);
  }
  const preferences = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { preferences, updatePreferences: store.update };
}
