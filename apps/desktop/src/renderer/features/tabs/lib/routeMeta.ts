import {
  Building,
  BookUser,
  Handshake,
  GitBranch,
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
  Inbox as InboxIcon,
  Network,
  Bot,
  Wrench,
  Home,
  type LucideIcon,
} from 'lucide-react';
import type { TabKind } from '@estate-erp/shared';

export interface RouteMeta {
  title: string;
  kind: TabKind;
  icon: LucideIcon;
}

const STATIC_ROUTES: Record<string, RouteMeta> = {
  '/dashboard': { title: '대시보드', kind: 'dashboard', icon: SquareTerminal },
  '/properties': { title: '매물관리', kind: 'property', icon: Building },
  '/properties/new': { title: '매물 등록', kind: 'property', icon: Building },
  '/properties/external-listings': { title: '광고노트', kind: 'property', icon: Building },
  '/properties/naver-my-ads': { title: '네이버 내 광고', kind: 'property', icon: Building },
  '/contacts': { title: '연락처', kind: 'contact', icon: BookUser },
  '/contacts/new': { title: '연락처 추가', kind: 'contact', icon: BookUser },
  '/partner-brokers': { title: '파트너 중개사', kind: 'contact', icon: Handshake },
  '/service-vendors': { title: '서비스 업체', kind: 'contact', icon: Wrench },
  '/deals': { title: '거래관리', kind: 'deal', icon: Handshake },
  '/matches': { title: '매칭', kind: 'match', icon: GitBranch },
  '/consultations': { title: '상담기록', kind: 'consultation', icon: MessageSquare },
  '/calls': { title: '통화', kind: 'consultation', icon: PhoneCall },
  '/buyer-requirements': { title: '구매고객', kind: 'contact', icon: UserSearch },
  '/tasks': { title: '업무', kind: 'task', icon: ListTodo },
  '/calendar': { title: '캘린더', kind: 'calendar', icon: CalendarDays },
  '/sites': { title: '관리단지', kind: 'site', icon: MapIcon },
  '/contracts': { title: '계약서 관리', kind: 'contract', icon: FileText },
  '/cashflow': { title: '캐시플로우', kind: 'cashflow', icon: Wallet },
  '/cashflow/ledger': { title: '수금 원장', kind: 'cashflow', icon: Wallet },
  '/cashflow/expenses': { title: '고정비', kind: 'cashflow', icon: Wallet },
  '/cashflow/partner-commissions': { title: '파트너 수수료', kind: 'cashflow', icon: Wallet },
  '/cashflow/employee-settlements': { title: '직원 정산', kind: 'cashflow', icon: Wallet },
  '/cashflow/my-settlement': { title: '내 정산', kind: 'cashflow', icon: Wallet },
  '/employees': { title: '직원관리', kind: 'employee', icon: Users },
  '/settings': { title: '설정', kind: 'settings', icon: SettingsIcon },
  '/inbox': { title: '인박스', kind: 'inbox', icon: InboxIcon },
  '/network': { title: '네트워크', kind: 'generic', icon: Network },
  '/ai-operations': { title: 'AI 운영', kind: 'generic', icon: Bot },
};

const DYNAMIC_ROUTE_META: Array<{
  match: RegExp;
  meta: (m: RegExpMatchArray) => RouteMeta;
}> = [
  {
    match: /^\/properties\/([^/]+)$/,
    meta: () => ({ title: '매물 상세', kind: 'property', icon: Building }),
  },
  {
    match: /^\/contacts\/([^/]+)$/,
    meta: () => ({ title: '연락처 상세', kind: 'contact', icon: BookUser }),
  },
];

export function getRouteMeta(route: string): RouteMeta {
  const direct = STATIC_ROUTES[route];
  if (direct) return direct;
  for (const { match, meta } of DYNAMIC_ROUTE_META) {
    const result = route.match(match);
    if (result) return meta(result);
  }
  return { title: route, kind: 'generic', icon: Home };
}

export function isDetachableRoute(route: string): boolean {
  return route !== '/login' && !route.startsWith('/_');
}
