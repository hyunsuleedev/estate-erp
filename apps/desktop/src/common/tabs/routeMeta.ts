import type { TabKind } from '@estate-erp/shared';
import { getTabPathname } from './tabResource';

/**
 * 주소(route)에서 탭 제목·종류·아이콘 이름을 정한다. Electron·React에 의존하지 않는다.
 *
 * main의 탭 목록은 새 탭을 만들 때 제목과 종류가 필요하고, 탭바 화면은 아이콘이
 * 필요하다. 아이콘 컴포넌트(lucide)는 화면 쪽에서 `iconKey`로 고른다.
 * (renderer/features/tabs/lib/routeMeta.ts 와 같은 표이며, 연결 단계에서 그 파일이
 * 이 표에 아이콘 컴포넌트만 붙이게 한다.)
 */
export type RouteIconKey =
  | 'building'
  | 'book-user'
  | 'handshake'
  | 'message-square'
  | 'phone-call'
  | 'user-search'
  | 'list-todo'
  | 'calendar-days'
  | 'map'
  | 'file-text'
  | 'wallet'
  | 'users'
  | 'settings'
  | 'square-terminal'
  | 'network'
  | 'wrench'
  | 'home';

export interface RouteMetaCore {
  title: string;
  kind: TabKind;
  iconKey: RouteIconKey;
}

const STATIC_ROUTES: Record<string, RouteMetaCore> = {
  '/dashboard': { title: '대시보드', kind: 'dashboard', iconKey: 'square-terminal' },
  '/properties': { title: '매물관리', kind: 'property', iconKey: 'building' },
  '/properties/new': { title: '매물 등록', kind: 'property', iconKey: 'building' },
  '/properties/external-listings': {
    title: '광고노트',
    kind: 'property',
    iconKey: 'building',
  },
  '/properties/naver-my-ads': {
    title: '내광고관리',
    kind: 'property',
    iconKey: 'building',
  },
  '/properties/my-ads': { title: '내광고관리', kind: 'property', iconKey: 'building' },
  '/contacts': { title: '연락처', kind: 'contact', iconKey: 'book-user' },
  '/customers': { title: '고객 중심 보기', kind: 'contact', iconKey: 'users' },
  '/customers-table': { title: '고객 원장', kind: 'contact', iconKey: 'users' },
  '/contacts/new': { title: '연락처 추가', kind: 'contact', iconKey: 'book-user' },
  '/partner-brokers': { title: '파트너 중개사', kind: 'contact', iconKey: 'handshake' },
  '/service-vendors': { title: '서비스 업체', kind: 'contact', iconKey: 'wrench' },
  '/deals': { title: '거래관리', kind: 'deal', iconKey: 'handshake' },
  '/wanted-properties': { title: '희망매물', kind: 'match', iconKey: 'user-search' },
  '/consultations': {
    title: '상담분석',
    kind: 'consultation',
    iconKey: 'message-square',
  },
  '/calls': { title: '상담분석', kind: 'consultation', iconKey: 'phone-call' },
  '/buyer-requirements/new': {
    title: '구함 의뢰 추가',
    kind: 'contact',
    iconKey: 'user-search',
  },
  '/tasks': { title: '업무', kind: 'task', iconKey: 'list-todo' },
  '/calendar': { title: '캘린더', kind: 'calendar', iconKey: 'calendar-days' },
  '/sites': { title: '관리단지', kind: 'site', iconKey: 'map' },
  '/contracts': { title: '계약서 관리', kind: 'contract', iconKey: 'file-text' },
  '/cashflow': { title: '캐시플로우', kind: 'cashflow', iconKey: 'wallet' },
  '/cashflow/ledger': { title: '수금 원장', kind: 'cashflow', iconKey: 'wallet' },
  '/cashflow/expenses': { title: '고정비 설정', kind: 'cashflow', iconKey: 'wallet' },
  '/cashflow/partner-commissions': {
    title: '공동중개 수수료',
    kind: 'cashflow',
    iconKey: 'wallet',
  },
  '/cashflow/employee-settlements': {
    title: '직원 정산',
    kind: 'cashflow',
    iconKey: 'wallet',
  },
  '/cashflow/my-settlement': {
    title: '내 수수료',
    kind: 'cashflow',
    iconKey: 'wallet',
  },
  '/employees': { title: '직원관리', kind: 'employee', iconKey: 'users' },
  '/settings': { title: '설정', kind: 'settings', iconKey: 'settings' },
  '/network': { title: '네트워크', kind: 'generic', iconKey: 'network' },
};

const DYNAMIC_ROUTE_META: Array<{
  match: RegExp;
  meta: (match: RegExpMatchArray) => RouteMetaCore;
}> = [
  {
    match: /^\/properties\/([^/]+)$/,
    meta: () => ({ title: '매물 상세', kind: 'property', iconKey: 'building' }),
  },
  {
    match: /^\/contacts\/([^/]+)$/,
    meta: () => ({ title: '연락처 상세', kind: 'contact', iconKey: 'book-user' }),
  },
  {
    match: /^\/buyer-requirements\/([^/]+)(?:\/edit)?$/,
    meta: (match) => ({
      title: match[0].endsWith('/edit') ? '구매고객 수정' : '구매고객 상세',
      kind: 'contact',
      iconKey: 'user-search',
    }),
  },
];

/** 표에 있는 고정 주소 목록. 화면 쪽 표와 같은지 테스트에서 맞춰 본다. */
export const STATIC_ROUTE_PATHS: readonly string[] = Object.keys(STATIC_ROUTES);

export function getRouteMetaCore(route: string): RouteMetaCore {
  const pathname = getTabPathname(route);
  const direct = STATIC_ROUTES[pathname];
  if (direct) return direct;
  for (const { match, meta } of DYNAMIC_ROUTE_META) {
    const result = pathname.match(match);
    if (result) return meta(result);
  }
  return { title: pathname, kind: 'generic', iconKey: 'home' };
}

export function isDetachableRoute(route: string): boolean {
  const pathname = getTabPathname(route);
  return pathname !== '/login' && !pathname.startsWith('/_');
}
