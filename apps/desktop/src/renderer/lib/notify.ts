import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  toastBottomOffset,
  type CallOverlayInset,
  type WindowToast,
  type WindowToastLevel,
} from '../../common/callOverlay';
import { getRendererSurface } from '@/features/tabs/native/rendererSurface';

export function showToastLocally({ level, message, description }: WindowToast): void {
  toast[level](message, description ? { description } : undefined);
}

/**
 * 셸 창이나 전화 팝업 층에서 띄우는 알림. 셸이 그린 알림은 탭 화면 아래에
 * 가려지므로 Electron에서는 지금 보이는 탭 화면에서 대신 띄운다.
 * 탭 화면 안의 페이지와 브라우저 미리보기에서는 그 자리에서 띄운다.
 */
export function notify(
  level: WindowToastLevel,
  message: string,
  options?: { description?: string },
): void {
  const toastMessage: WindowToast = {
    level,
    message,
    ...(options?.description ? { description: options.description } : {}),
  };
  const forward =
    typeof window === 'undefined' ? undefined : window.electronBridge?.tabs?.showToast;
  if (getRendererSurface().kind !== 'native-tab' && forward) {
    forward(toastMessage);
    return;
  }
  showToastLocally(toastMessage);
}

/** 셸·탭 화면: 다른 곳(셸, 팝업 층)에서 보낸 알림을 여기서 띄운다. */
export function useForwardedToasts(): void {
  useEffect(() => window.electronBridge?.tabs?.onToast?.(showToastLocally), []);
}

/**
 * 알림을 띄울 아래쪽 여백. 전화 팝업이 창 오른쪽 아래를 차지한 동안에는 알림을
 * 팝업 카드 위로 올린다. 같은 자리에 뜨면 팝업 층에 가려지기 때문이다.
 */
export function useToastBottomOffset(): number {
  const [inset, setInset] = useState<CallOverlayInset>({ bottom: 0 });

  useEffect(() => {
    const tabs = window.electronBridge?.tabs;
    let received = false;
    let cancelled = false;
    const unsubscribe = tabs?.onOverlayInset?.((next) => {
      received = true;
      setInset(next);
    });
    void tabs?.getOverlayInset?.().then((current) => {
      if (!cancelled && !received) setInset(current);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return toastBottomOffset(inset);
}
