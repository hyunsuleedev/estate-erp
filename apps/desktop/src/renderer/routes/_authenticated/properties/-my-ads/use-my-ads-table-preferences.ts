import { useSyncExternalStore } from "react";
import {
  myAdsTablePreferencesKey,
  parseMyAdsTablePreferences,
  serializeMyAdsTablePreferences,
  type MyAdsTablePreferences,
} from "./my-ads-table-state";

// 매물관리 광고 표의 use-ad-table-preferences.ts와 같은 저장소 모양이다.
function createPreferenceStore(key: string) {
  const read = (
    fallback: MyAdsTablePreferences = parseMyAdsTablePreferences(null),
  ) => {
    try {
      return parseMyAdsTablePreferences(localStorage.getItem(key));
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
        if (listeners.size === 0)
          window.removeEventListener("storage", onStorage);
      };
    },
    update: (
      update: (current: MyAdsTablePreferences) => MyAdsTablePreferences,
    ) => {
      snapshot = update(snapshot);
      try {
        localStorage.setItem(key, serializeMyAdsTablePreferences(snapshot));
      } catch {
        /* Keep the current session usable when storage is unavailable. */
      }
      emit();
    },
  };
}

const stores = new Map<string, ReturnType<typeof createPreferenceStore>>();

/** 사무소·사용자별로 정렬과 열 너비를 탭·앱 재시작을 넘어 기억한다. */
export function useMyAdsTablePreferences(officeId: string, userId: string) {
  const key = myAdsTablePreferencesKey(officeId, userId);
  let store = stores.get(key);
  if (!store) {
    store = createPreferenceStore(key);
    stores.set(key, store);
  }
  const preferences = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { preferences, updatePreferences: store.update };
}
