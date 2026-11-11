import type { TabId } from '@estate-erp/shared';
import {
  isOverlongTabScreenRoute,
  resolveTabScreenRoute,
} from '../../common/nativeTabs';
import type { NativeTabHost } from '../nativeTabHost';

/**
 * 탭 화면이 스스로 옮긴 주소를 기록한다. Electron에 의존하지 않는다.
 *
 * 주소를 아는 곳은 둘이다: 탭 목록(TabRegistry, 기준)과 탭 화면 관리(NativeTabHost, "이
 * 화면이 지금 어느 주소를 보여 주는지"). 둘이 다르면 탭을 다시 고를 때 화면을 탭 목록의
 * 주소로 되돌려 보낸다. 그래서 탭 목록이 받지 않은 주소는 탭 화면 관리에도 기록하지 않는다.
 */
export type ViewLocationOutcome =
  /** 탭 목록과 탭 화면 관리 양쪽에 반영했다. */
  | 'recorded'
  /** 앱 화면이지만 주소가 한도보다 길다. 화면은 그대로 두고 어디에도 기록하지 않는다. */
  | 'left-unrecorded'
  /** 탭 화면이 있을 수 없는 주소다. 부른 쪽이 화면을 그 탭의 주소로 되돌린다. */
  | 'not-a-tab-screen'
  /** 탭 목록이 모르는 화면이다(미리 띄워 둔 화면, 닫히는 중인 탭). */
  | 'unknown';

export interface ViewLocationRegistry {
  /** 받아들였으면 true. */
  reportViewLocation(tabId: TabId, route: string): boolean;
}

export function recordViewLocation(
  views: Pick<NativeTabHost, 'peekSender' | 'updateRendererState'>,
  registry: ViewLocationRegistry,
  senderId: number,
  route: string | null,
): ViewLocationOutcome {
  if (route !== null && isOverlongTabScreenRoute(route)) return 'left-unrecorded';
  const descriptor = route === null ? null : resolveTabScreenRoute(route);
  if (route === null || !descriptor) return 'not-a-tab-screen';
  const identity = views.peekSender(senderId);
  if (!identity) return 'unknown';
  if (!registry.reportViewLocation(identity.tabId, route)) return 'unknown';
  // 탭 화면이 지금 보여 주는 주소를 기록한다(같은 주소로 다시 보내지 않게).
  // 종류·제목·업무 identity는 탭 목록이 주소로 다시 계산한다.
  views.updateRendererState(senderId, {
    route,
    ...(descriptor.kind === 'property-detail'
      ? {
          kind: 'property' as const,
          resourceKey: `entity:property:${encodeURIComponent(descriptor.entityId)}`,
        }
      : {}),
  });
  return 'recorded';
}
