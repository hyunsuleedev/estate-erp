import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { QueryClient } from '@tanstack/react-query';
import {
  NOTICES_QUERY_KEY,
  NOTICE_READS_KEY,
  announceNotice,
  applyNoticeRead,
  listenToNotices,
  withKnownReads,
  type NoticeList,
  type NoticeSignal,
} from '../src/renderer/lib/notices';

const testDir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(testDir, '../src/renderer', path), 'utf8');
const popupSource = read('components/layout/required-notice-popup.tsx');
const layoutSource = read('routes/_authenticated.tsx');
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

const notice = (id: string, readAt: string | null, isRequired = false) => ({
  id, title: id, body: '', isRequired, publishedAt: '2026-11-19T00:00:00.000Z', readAt,
});

describe('notice read state', () => {
  it('marks one notice read in the cache and counts it once', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(NOTICES_QUERY_KEY, { items: [notice('a', null), notice('b', null)], unreadCount: 2 });
    applyNoticeRead(queryClient, 'a', '2026-11-19T01:00:00.000Z');
    applyNoticeRead(queryClient, 'a', '2026-11-19T02:00:00.000Z'); // 두 번째는 아무것도 바꾸지 않는다
    applyNoticeRead(queryClient, 'missing', '2026-11-19T02:00:00.000Z');
    assert.deepEqual(queryClient.getQueryData(NOTICES_QUERY_KEY), {
      items: [notice('a', '2026-11-19T01:00:00.000Z'), notice('b', null)],
      unreadCount: 1,
    });
  });

  it('keeps a read notice read when an older list response overwrites the cache', () => {
    const queryClient = new QueryClient();
    const stale = { items: [notice('a', null, true), notice('b', null)], unreadCount: 2 };
    queryClient.setQueryData(NOTICES_QUERY_KEY, stale);
    applyNoticeRead(queryClient, 'a', '2026-11-19T01:00:00.000Z');
    // 읽기 전에 떠난 응답이 늦게 도착했다
    queryClient.setQueryData(NOTICES_QUERY_KEY, stale);
    const known = queryClient.getQueryData<Record<string, string>>(NOTICE_READS_KEY) ?? {};
    const shown = withKnownReads(queryClient.getQueryData<NoticeList>(NOTICES_QUERY_KEY), known);
    assert.equal(shown.items[0].readAt, '2026-11-19T01:00:00.000Z');
    assert.equal(shown.unreadCount, 1);
    // 서버가 읽음을 반영한 목록이 오면 두 번 빼지 않는다
    queryClient.setQueryData(NOTICES_QUERY_KEY, { items: [notice('a', '2026-11-19T01:00:00.000Z', true), notice('b', null)], unreadCount: 1 });
    assert.equal(withKnownReads(queryClient.getQueryData<NoticeList>(NOTICES_QUERY_KEY), known).unreadCount, 1);
  });

  it('forgets what was read when the cache is cleared at sign-out', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(NOTICES_QUERY_KEY, { items: [notice('a', null)], unreadCount: 1 });
    applyNoticeRead(queryClient, 'a', '2026-11-19T01:00:00.000Z');
    queryClient.clear();
    assert.equal(queryClient.getQueryData(NOTICE_READS_KEY), undefined);
  });

  it('remembers a read even when the list has not been loaded yet', () => {
    const queryClient = new QueryClient();
    applyNoticeRead(queryClient, 'a', '2026-11-19T01:00:00.000Z');
    assert.equal(queryClient.getQueryData(NOTICES_QUERY_KEY), undefined);
    // 목록이 나중에 예전 값으로 와도 읽음으로 그린다
    const known = queryClient.getQueryData<Record<string, string>>(NOTICE_READS_KEY) ?? {};
    assert.equal(withKnownReads({ items: [notice('a', null)], unreadCount: 1 }, known).unreadCount, 0);
  });

  it('tells other tabs, and ignores messages that are not notice signals', async () => {
    const received: NoticeSignal[] = [];
    const stop = listenToNotices((signal) => received.push(signal));
    const stray = new BroadcastChannel('estate-erp:notices');
    stray.postMessage({ type: 'read', noticeId: 'x' }); // readAt 없음
    stray.postMessage('hello');
    stray.close();
    announceNotice({ type: 'confirmed', noticeId: 'a' });
    announceNotice({ type: 'read', noticeId: 'a', readAt: '2026-11-19T01:00:00.000Z' });
    // 전달은 비동기다. 고정된 시간만 기다리면 전체 테스트를 한꺼번에 돌릴 때(부하가 클 때) 가끔 늦게 온다.
    // 두 신호가 올 때까지 기다리되 2초를 넘기지 않는다. 그 뒤 잠깐 더 기다려 버려야 할 신호가 섞이지 않았는지 본다.
    const deadline = Date.now() + 2000;
    while (received.length < 2 && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 10));
    }
    await new Promise((done) => setTimeout(done, 30));
    stop();
    assert.deepEqual(received, [
      { type: 'confirmed', noticeId: 'a' },
      { type: 'read', noticeId: 'a', readAt: '2026-11-19T01:00:00.000Z' },
    ]);
  });
});

describe('required notice popup', () => {
  it('is mounted in every signed-in shell so it shows when the app opens, whatever the first screen is', () => {
    assert.equal(code(layoutSource).match(/<RequiredNoticePopup \/>/g)?.length, 2);
  });

  it('shows unread required notices one at a time, and only those', () => {
    assert.match(popupSource, /notice\.isRequired && !notice\.readAt && !confirmed\.has\(notice\.id\)/);
    // 읽음 기록을 얹은 목록에서 고른다. 한 번 읽은 것은 캐시가 덮여도 다시 띄우지 않는다.
    assert.match(popupSource, /withKnownReads\(notices\.data, known\)\.items\.filter\(/);
    assert.match(popupSource, /const current = waiting\[0\] \?\? null;/);
    assert.match(popupSource, /<Dialog open=\{current !== null\}>/);
    // 대시보드 목록과 같은 캐시를 쓴다. 따로 불러오면 한쪽에서 읽은 것이 다른 쪽에 안 보인다.
    assert.match(popupSource, /queryKey: NOTICES_QUERY_KEY/);
  });

  it('closes only with the confirm button', () => {
    assert.match(popupSource, /showCloseButton=\{false\}/);
    assert.match(popupSource, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/);
    assert.match(popupSource, /onInteractOutside=\{\(event\) => \{\s*event\.preventDefault\(\);/);
    // 바깥을 눌러 포커스가 빠져도 확인 단추로 되돌린다.
    assert.match(popupSource, /requestAnimationFrame\(\(\) => confirmRef\.current\?\.focus\(\)\)/);
  });

  it('confirming saves it as read and closes the popup in other tabs too', () => {
    assert.match(popupSource, /announceNotice\(\{ type: 'confirmed', noticeId: current\.id \}\);\s*markRead\.mutate\(current\.id\);/);
    assert.match(popupSource, /announceNotice\(\{ type: 'read', noticeId, readAt \}\);/);
    // 다른 탭이 확인했으면 이 탭도 닫는다. 저장 결과와 상관없이 이번에는 다시 띄우지 않는다.
    assert.match(popupSource, /listenToNotices\(\(signal\) => \{\s*setConfirmed\(/);
    assert.match(popupSource, /if \(signal\.type === 'read'\) applyNoticeRead\(queryClient, signal\.noticeId, signal\.readAt\);/);
  });

  it('renders the body as plain text', () => {
    assert.match(popupSource, /whitespace-pre-wrap/);
    assert.doesNotMatch(code(popupSource), /dangerouslySetInnerHTML/);
  });
});
