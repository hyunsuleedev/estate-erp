import { useEffect } from 'react';
import { useLocation, useRouter } from '@tanstack/react-router';
import type { Tab } from '@estate-erp/shared';
import { useTabStore } from '../store/useTabStore';
import { resolveTabResourceKey } from '../lib/tabResource';
import { updateNativeTabMirrorLocation } from './nativeTabStoreBridge';

/**
 * 탭 화면 안 링크가 다른 업무(resourceKey)로 가려 하면 이 탭에서 옮기지 않고
 * 셸이 다른 탭으로 열어야 하는지 판단한다. 셸 창의 `adoptTabLocation`과 같은
 * 규칙이다. 다만 탭 화면에서는 원래 화면이 그대로 남으므로 상태를 잃지 않는다.
 * 주소만 바꾸는 REPLACE(정규화·리다이렉트)는 제자리에서 처리한다.
 */
export function shouldOpenNavigationInOtherTab(
  ownTab: Pick<Tab, 'id' | 'route' | 'resourceKey'> | undefined,
  nextHref: string,
  action: string,
): boolean {
  if (!ownTab || action !== 'PUSH') return false;
  const currentKey =
    ownTab.resourceKey ?? resolveTabResourceKey(ownTab.route, ownTab.id);
  return resolveTabResourceKey(nextHref, ownTab.id) !== currentKey;
}

/** 탭 화면(native 탭)의 라우터를 셸 탭 목록과 잇는다. */
export function NativeTabRouterBridge({ tabId }: { tabId: string }) {
  const router = useRouter();
  const href = useLocation({ select: (location) => location.href });

  useEffect(() => {
    const sendAction = window.electronBridge?.tabs?.sendTabAction;
    if (!sendAction) return;
    return router.history.block({
      enableBeforeUnload: false,
      blockerFn: ({ nextLocation, action }) => {
        const ownTab = useTabStore
          .getState()
          .tabs.find((candidate) => candidate.id === tabId);
        if (!shouldOpenNavigationInOtherTab(ownTab, nextLocation.href, action)) {
          return false;
        }
        sendAction({ type: 'adopt-location', route: nextLocation.href });
        return true;
      },
    });
  }, [router, tabId]);

  useEffect(() => {
    const subscribe = window.electronBridge?.tabs?.onNavigate;
    if (!subscribe) return;
    return subscribe(({ route }) => {
      if (router.state.location.href === route) return;
      // 셸이 정한 이동(뒤로/앞으로, 사이드바, 저장 후 탭 바꾸기)은 이미 탭 목록에
      // 반영됐으므로 다른 탭으로 돌리지 않는다.
      void router.navigate({ href: route, ignoreBlocker: true });
    });
  }, [router]);

  useEffect(() => {
    updateNativeTabMirrorLocation(tabId, href, resolveTabResourceKey(href, tabId));
  }, [href, tabId]);

  return null;
}
