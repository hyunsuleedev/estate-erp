import {
  Building,
  BookUser,
  Handshake,
  MessageSquare,
  PhoneCall,
  UserSearch,
  ListTodo,
  CalendarDays,
  Map as MapIcon,
  FileText,
  Wallet,
  Users,
  Settings as SettingsIcon,
  SquareTerminal,
  Network,
  Wrench,
  Home,
  type LucideIcon,
} from 'lucide-react';
import type { TabKind } from '@estate-erp/shared';
import {
  getRouteMetaCore,
  type RouteIconKey,
  type RouteMetaCore,
} from '../../../../common/tabs/routeMeta';

export { isDetachableRoute } from '../../../../common/tabs/routeMeta';

export interface RouteMeta {
  title: string;
  kind: TabKind;
  icon: LucideIcon;
}

/**
 * 주소별 제목·종류의 표는 `src/common/tabs/routeMeta.ts`에 있다(main의 탭 목록과 같이
 * 쓴다). 여기서는 그 표가 말하는 아이콘 이름을 실제 아이콘으로 바꾸기만 한다.
 */
const ROUTE_ICONS: Record<RouteIconKey, LucideIcon> = {
  building: Building,
  'book-user': BookUser,
  handshake: Handshake,
  'message-square': MessageSquare,
  'phone-call': PhoneCall,
  'user-search': UserSearch,
  'list-todo': ListTodo,
  'calendar-days': CalendarDays,
  map: MapIcon,
  'file-text': FileText,
  wallet: Wallet,
  users: Users,
  settings: SettingsIcon,
  'square-terminal': SquareTerminal,
  network: Network,
  wrench: Wrench,
  home: Home,
};

/**
 * 고정 주소는 예전처럼 매번 같은 객체를 돌려준다(받은 쪽이 hook 의존값으로 쓰기도
 * 한다). id가 들어간 주소는 예전에도 부를 때마다 새 객체였다.
 */
const cache = new WeakMap<RouteMetaCore, RouteMeta>();

export function getRouteMeta(route: string): RouteMeta {
  const core = getRouteMetaCore(route);
  const cached = cache.get(core);
  if (cached) return cached;
  const meta: RouteMeta = {
    title: core.title,
    kind: core.kind,
    icon: ROUTE_ICONS[core.iconKey],
  };
  cache.set(core, meta);
  return meta;
}
