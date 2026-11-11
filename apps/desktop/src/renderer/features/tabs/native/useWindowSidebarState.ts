import { useCallback, useEffect, useState } from 'react';

type SidebarState = readonly [open: boolean, setOpen: (open: boolean) => void];

/**
 * 셸 창의 사이드바 펼침 상태. 창 단위 상태의 주인이며, 바뀌면 main을 거쳐
 * 그 창의 모든 탭 화면에 알린다. 탭 화면 안에서 접거나 편 요청도 여기로 온다.
 */
export function useShellSidebarState(): SidebarState {
  const [open, setOpenState] = useState(true);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    window.electronBridge?.tabs?.setSidebarOpen?.(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.electronBridge?.tabs?.getSidebarState?.().then((state) => {
      if (!cancelled) setOpenState(state.open);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const subscribe = window.electronBridge?.tabs?.onSidebarOpenRequested;
    if (!subscribe) return;
    return subscribe(({ open: requested }) => setOpen(requested));
  }, [setOpen]);

  return [open, setOpen] as const;
}

/**
 * 탭 화면(native 탭)의 사이드바 상태. 창의 셸이 정한 값을 따르고, 화면 안에서
 * 접거나 펴면 셸에 요청한다. 첫 값은 탭 화면을 그리기 전에 받아 둔다.
 */
export function useNativeSidebarState(initialOpen: boolean): SidebarState {
  const [open, setOpenState] = useState(initialOpen);

  useEffect(() => {
    const subscribe = window.electronBridge?.tabs?.onSidebarState;
    if (!subscribe) return;
    return subscribe((state) => setOpenState(state.open));
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    window.electronBridge?.tabs?.requestSidebarOpen?.(next);
  }, []);

  return [open, setOpen] as const;
}
