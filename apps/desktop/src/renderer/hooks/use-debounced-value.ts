import { useEffect, useState } from 'react';

/** 값이 delayMs 동안 바뀌지 않으면 그제야 반영한다 — 입력할 때마다 요청이 나가지 않게 할 때 쓴다 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
