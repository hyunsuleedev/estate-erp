import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * 단계 카드에서 펼치고 접은 것(매칭 패널 · 매칭 묶음)을 이 화면에 머무는 동안 기억한다.
 * 카드를 끌어 다른 차례로 옮기면 카드가 새로 그려지고, 개요 ↔ 다른 탭을 오가도 다시 그려진다 — 그때 펼침이
 * 처음 값으로 돌아가지 않게 화면(프로젝트 상세)이 들고 있는다. 새로 열면(새로 고침 · 새 탭) 처음 값이다.
 * 값이 없으면(undefined) 카드가 정한 처음 값(진행 중인 매칭이 있으면 펼침)을 쓴다.
 */
type PanelStateStore = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
};

const PanelStateContext = createContext<PanelStateStore | null>(null);

export function PlanPanelStateProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<ReadonlyMap<string, unknown>>(() => new Map());
  const get = useCallback((key: string) => values.get(key), [values]);
  const set = useCallback((key: string, value: unknown) => {
    setValues((current) => {
      if (current.get(key) === value && current.has(key)) return current;
      const next = new Map(current);
      next.set(key, value);
      return next;
    });
  }, []);
  return <PanelStateContext.Provider value={{ get, set }}>{children}</PanelStateContext.Provider>;
}

/** 이 화면에 머무는 동안 남는 펼침 값. 화면 밖(공급자 없음)에서는 이 카드만의 값이다. */
export function usePanelState<T>(key: string): [T | undefined, (value: T) => void] {
  const store = useContext(PanelStateContext);
  const [local, setLocal] = useState<T | undefined>(undefined);
  if (store) return [store.get(key) as T | undefined, (value: T) => store.set(key, value)];
  return [local, setLocal];
}

/** 요소의 지금 폭(px). 처음 그릴 때는 0이다. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
