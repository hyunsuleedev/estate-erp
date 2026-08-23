import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { JsonValue } from '@estate-erp/shared';
import { useTabStore } from '../store/useTabStore';

function toJsonValue(value: unknown): JsonValue | undefined {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return undefined;
    return JSON.parse(serialized) as JsonValue;
  } catch {
    return undefined;
  }
}

/**
 * 페이지 subtree가 탭 전환 때 unmount되어도 JSON-safe form state를 해당 탭에 보존한다.
 * 앱 재시작 영속화가 아니라 현재 renderer/창 수명 동안의 draft 보호용이다.
 */
export function useTabScopedState<T>(
  key: string,
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const ownerTabIdRef = useRef(useTabStore.getState().activeTabId);
  const [value, setValue] = useState<T>(() => {
    const ownerTab = useTabStore
      .getState()
      .tabs.find((tab) => tab.id === ownerTabIdRef.current);
    const stored = ownerTab?.uiState?.formDraft?.[key];
    if (stored !== undefined) return stored as T;
    return typeof initialValue === 'function'
      ? (initialValue as () => T)()
      : initialValue;
  });
  const valueRef = useRef(value);

  const setScopedValue = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      const next =
        typeof action === 'function'
          ? (action as (previous: T) => T)(valueRef.current)
          : action;
      valueRef.current = next;
      setValue(next);

      const ownerTabId = ownerTabIdRef.current;
      const jsonValue = toJsonValue(next);
      if (ownerTabId && jsonValue !== undefined) {
        useTabStore.getState().updateTabFormDraft(ownerTabId, key, jsonValue);
      }
    },
    [key],
  );

  return [value, setScopedValue];
}
