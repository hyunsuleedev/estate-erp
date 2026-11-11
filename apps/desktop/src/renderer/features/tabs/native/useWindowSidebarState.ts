import { useCallback, useEffect, useState } from 'react';

type SidebarState = readonly [open: boolean, setOpen: (open: boolean) => void];

/**
 * 탭 화면(native 탭)의 사이드바 상태. 창 단위 상태이고 main이 갖는다. 화면 안에서
 * 접거나 펴면 main에 요청하고, 그 창의 모든 탭 화면이 따른다. 첫 값은 탭 화면을
 * 그리기 전에 받아 둔다.
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
