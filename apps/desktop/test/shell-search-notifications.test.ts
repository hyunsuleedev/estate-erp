import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  dealMatchesQuery,
  formatDongUnitLabel,
  listingMatchesPlace,
  listingSearchTerm,
  parseSearchQuery,
} from '../src/renderer/components/layout/global-search-query';
import { notificationRoute } from '../src/renderer/components/layout/notification-route';
import { apiErrorMessage, NETWORK_ERROR_MESSAGE } from '../src/renderer/lib/api-error';
import { formatRelativeDay, formatPhone } from '../src/renderer/lib/format';
import { formatPhoneNumber } from '../src/renderer/lib/contacts';
import { timeAgo } from '../src/renderer/lib/time-ago';
import { ApiError, ApiNetworkError } from '../../../packages/api-client/src/types';
import { getRouteMetaCore } from '../src/common/tabs/routeMeta';

const testDir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(testDir, '../src/renderer', path), 'utf8');

describe('global search query (⌘K)', () => {
  it('keeps names and phone numbers as they are', () => {
    for (const raw of ['김민준', '0001', '010-2001-0001', '010 2001 0001', '그라시움']) {
      const parsed = parseSearchQuery(raw);
      assert.equal(parsed.isPlace, false, raw);
      assert.equal(listingSearchTerm(parsed), raw);
    }
    assert.equal(parseSearchQuery('0001').isPhoneLike, true);
  });

  it('reads dong and unit the way brokers type them', () => {
    const cases: Array<[string, string | null, string | null, string[]]> = [
      ['102동 3302호', '102', '3302', []],
      ['102-3302', '102', '3302', []],
      ['102 3302', '102', '3302', []],
      ['고덕그라시움 101동', '101', null, ['고덕그라시움']],
      ['그라시움 102동 3302', '102', '3302', ['그라시움']],
      ['그라시움 3302', null, '3302', ['그라시움']],
      ['A동 101호', 'A', '101', []],
      ['3302호', null, '3302', []],
    ];
    for (const [raw, dong, unit, words] of cases) {
      const parsed = parseSearchQuery(raw);
      assert.equal(parsed.isPlace, true, raw);
      assert.equal(parsed.dong, dong, raw);
      assert.equal(parsed.unit, unit, raw);
      assert.deepEqual(parsed.words, words, raw);
    }
    // 법정동 이름("고덕동")은 동 번호로 보지 않는다
    assert.equal(parseSearchQuery('고덕동').isPlace, false);
  });

  it('sends one word to the server and filters the rest on screen', () => {
    const parsed = parseSearchQuery('그라시움 102동 3302호');
    assert.equal(listingSearchTerm(parsed), '3302');
    assert.equal(
      listingMatchesPlace(parsed, { siteName: '고덕그라시움', dongName: '102', unitName: '3302' }),
      true,
    );
    assert.equal(
      listingMatchesPlace(parsed, { siteName: '고덕그라시움', dongName: '101', unitName: '3302' }),
      false,
    );
    assert.equal(
      listingMatchesPlace(parsed, { siteName: '래미안', dongName: '102', unitName: '3302' }),
      false,
    );
    assert.equal(formatDongUnitLabel('102', '3302'), '102동 3302호');
    assert.equal(formatDongUnitLabel('A동', '지하1층'), 'A동 지하1층');
  });

  it('finds deals by place or party name, never by phone digits (6차)', () => {
    const deal = {
      siteName: '고덕그라시움',
      dongName: '105',
      unitName: '1003',
      partyNames: ['김매도', '이매수'],
    };
    assert.equal(dealMatchesQuery(parseSearchQuery('105동 1003호'), deal), true);
    assert.equal(dealMatchesQuery(parseSearchQuery('그라시움 105동 1003'), deal), true);
    assert.equal(dealMatchesQuery(parseSearchQuery('105동 1004호'), deal), false);
    assert.equal(dealMatchesQuery(parseSearchQuery('이매수'), deal), true);
    assert.equal(dealMatchesQuery(parseSearchQuery('그라시움 김매도'), deal), true);
    assert.equal(dealMatchesQuery(parseSearchQuery('박손님'), deal), false);
    assert.equal(dealMatchesQuery(parseSearchQuery('010-2001'), deal), false);
    assert.equal(dealMatchesQuery(parseSearchQuery(''), deal), false);
  });

  it('starts the selection on the first visible result, so Enter opens what is on top (6차)', () => {
    const search = read('components/layout/global-search.tsx');
    assert.match(search, /value=\{selectedValue\}\s*onValueChange=\{setSelectedValue\}/);
    assert.match(search, /<CommandGroup heading="거래">/);
  });

  it('lives at the top of the sidebar, not in the titlebar', () => {
    const sidebar = read('components/layout/app-sidebar.tsx');
    const contentStart = sidebar.indexOf('<SidebarContent data-app-sidebar-scroll>');
    const searchAt = sidebar.indexOf('<GlobalSearch variant="sidebar" />');
    const firstNav = sidebar.indexOf('<NavMain');
    assert.ok(contentStart !== -1 && searchAt > contentStart && searchAt < firstNav);
    const search = read('components/layout/global-search.tsx');
    // 숨긴 화면으로 가는 결과가 없다
    assert.doesNotMatch(search, /\/network|\/service-vendors|\/documents|external-listings/);
    assert.match(search, /data-slot="sidebar-global-search"/);
    // 거래가 끝난 매물도 호수로 찾고(한 달 뒤 손님 전화), 진행 중인 것을 위에 놓는다
    assert.match(search, /includeClosed: true/);
    assert.match(search, /'종료 · 우리 거래'/);
    assert.match(search, /\(event\.metaKey \|\| event\.ctrlKey\)/);
  });
});

describe('notifications from the user menu', () => {
  it('opens the right screen and never the hidden network screen', () => {
    assert.equal(notificationRoute({ type: 'task_assigned', linkType: 'task', linkId: 't1' }), '/tasks?task=t1');
    assert.equal(notificationRoute({ type: 'task_assigned', linkType: null, linkId: null }), '/tasks');
    assert.equal(notificationRoute({ type: 'x', linkType: 'deal', linkId: 'd1' }), '/deals?dealId=d1');
    assert.equal(
      notificationRoute({ type: 'x', linkType: 'match', linkId: 'm1' }),
      '/wanted-properties?matchId=m1',
    );
    assert.equal(
      notificationRoute({ type: 'advertisement_comparison_changed', linkType: null, linkId: null }),
      '/properties/naver-my-ads',
    );
    assert.equal(notificationRoute({ type: 'room', linkType: 'networkRoom', linkId: 'r1' }), null);
    assert.equal(notificationRoute({ type: 'network_inquiry', linkType: null, linkId: null }), null);
    assert.doesNotMatch(read('components/layout/notification-bell.tsx'), /\/network/);
  });

  it('turns the user menu notice item into a working entry and drops the dead upgrade item', () => {
    const navUser = read('components/nav-user.tsx');
    assert.doesNotMatch(navUser, /업그레이드/);
    assert.match(navUser, /onSelect=\{\(\) => onOpenNotifications\(\)\}/);
    const sidebar = read('components/layout/app-sidebar.tsx');
    assert.match(sidebar, /onOpenNotifications=\{\(\) => setNotificationsOpen\(true\)\}/);
    assert.match(sidebar, /<NotificationList/);
  });
});

describe('shared error and format rules', () => {
  it('shows what the server said, never raw "API Error 400" or fetch errors', () => {
    const korean = new ApiError(400, { message: ['사무소명을 1~100자로 입력해 주세요.'] });
    assert.equal(apiErrorMessage(korean, '저장하지 못했습니다.'), '사무소명을 1~100자로 입력해 주세요.');
    const english = new ApiError(400, { message: ['property x should not exist'] });
    assert.equal(apiErrorMessage(english, '저장하지 못했습니다.'), '저장하지 못했습니다.');
    const crash = new ApiError(500, { message: 'Internal server error' });
    assert.equal(apiErrorMessage(crash, '저장하지 못했습니다.'), '저장하지 못했습니다.');
    const auth0Down = new ApiError(503, { message: '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    assert.match(apiErrorMessage(auth0Down, 'x'), /로그인 서버/);
    assert.equal(apiErrorMessage(new TypeError('Failed to fetch'), 'x'), NETWORK_ERROR_MESSAGE);
    assert.equal(apiErrorMessage(new ApiNetworkError(new TypeError('boom')), 'x'), NETWORK_ERROR_MESSAGE);
  });

  it('formats days and phone numbers the same way everywhere', () => {
    const now = new Date(2026, 10, 22, 10, 0);
    assert.equal(formatRelativeDay(new Date(2026, 10, 22, 8), now), '오늘');
    assert.equal(formatRelativeDay(new Date(2026, 10, 21, 23), now), '어제');
    assert.equal(formatRelativeDay(new Date(2026, 10, 23, 1), now), '내일');
    assert.equal(formatRelativeDay(new Date(2026, 10, 19), now), '11.19 (목)');
    assert.equal(formatRelativeDay(new Date(2025, 10, 19), now), '2025.11.19');
    assert.equal(formatRelativeDay(null, now), '');
    // 알림의 "N일 전"은 7일부터 같은 날짜 표기로 넘어간다
    assert.equal(timeAgo(new Date(2026, 10, 22, 9), now), '1시간 전');
    assert.equal(timeAgo(new Date(2026, 10, 14, 23, 30), now), '11.14 (토)');
    for (const [raw, expected] of [
      ['01012345678', '010-1234-5678'],
      ['0212345678', '02-1234-5678'],
      ['15881234', '1588-1234'],
      ['+82 10-1234-5678', '010-1234-5678'],
    ]) {
      assert.equal(formatPhone(raw), expected, raw);
      assert.equal(formatPhoneNumber(raw), expected, raw);
    }
    assert.equal(formatPhoneNumber(''), '-');
  });

  it('gives every app address a tab title instead of the raw path', () => {
    for (const route of ['/calls/logs', '/documents', '/documents/photos', '/partner-brokers']) {
      assert.ok(!getRouteMetaCore(route).title.startsWith('/'), route);
    }
    assert.equal(getRouteMetaCore('/calls/logs').title, '통화 이력');
  });
});
