import { useSyncExternalStore } from "react";
import {
  parseMatchTablePreferences,
  type MatchTablePreferences,
} from "./property-match-table-state";

function createPreferenceStore(key: string) {
  const read = (
    fallback: MatchTablePreferences = parseMatchTablePreferences(null),
  ) => {
    try {
      return parseMatchTablePreferences(localStorage.getItem(key));
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
      update: (current: MatchTablePreferences) => MatchTablePreferences,
    ) => {
      snapshot = update(snapshot);
      try {
        localStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        /* Keep the current session usable when storage is unavailable. */
      }
      emit();
    },
  };
}

const stores = new Map<string, ReturnType<typeof createPreferenceStore>>();

/** One layout per office/user across expanded properties, tabs and app launches. */
export function useMatchTablePreferences(officeId: string, userId: string) {
  const key = `estate:match-table:v1:${officeId}:${userId}`;
  let store = stores.get(key);
  if (!store) {
    store = createPreferenceStore(key);
    stores.set(key, store);
  }
  const preferences = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { preferences, updatePreferences: store.update };
}
