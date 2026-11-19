import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/dashboard.tsx'),
  'utf8',
);
/** 주석을 뺀 실행 코드 — '왜 그렇게 하지 않는지' 설명하는 주석이 금지어 검사에 걸리지 않게 한다. */
const dashboardCode = dashboardSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('dashboard', () => {
  it('is one document in two columns: summary, week, tasks / deals table, notices, news, managed sites', () => {
    assert.match(dashboardSource, /<Lead\b/);
    assert.match(dashboardSource, /<WeekSection\b/);
    assert.match(dashboardSource, /<TaskSection\b/);
    assert.match(dashboardSource, /<DealsSection deals=/);
    // 카드는 쓰지 않는다. 구획은 제목과 여백으로 나눈다.
    assert.doesNotMatch(dashboardCode, /DashCard|ComingSoonCard|dash-card/);
    // 서버에 데이터가 없는 두 구획(부동산 뉴스, 관리단지)은 자리만 둔다.
    assert.equal(dashboardCode.match(/<SoonSection\b/g)?.length, 2);
    for (const title of ['공지사항', '관리단지', '부동산 뉴스']) {
      assert.match(dashboardCode, new RegExp(`title="${title}"`));
    }
    assert.match(dashboardSource, /<NoticeSection notices=\{notices\} \/>/);
    // 진행 거래는 보드가 아니라 표다.
    assert.match(dashboardSource, /className="dash-table/);
  });

  it('has no KPI tiles, collection figures, attention summary, or notification bell', () => {
    assert.doesNotMatch(dashboardCode, /KpiRow|AttentionList|PipelineCard/);
    assert.doesNotMatch(dashboardCode, /api\.dashboard\.summary|수금|연체/);
    assert.doesNotMatch(dashboardCode, /NotificationBell/);
    assert.match(dashboardSource, /<QuickCreate \/>/);
  });

  it('fits on one screen: the two columns take the remaining height and scroll on their own', () => {
    // 최소 높이를 숫자로 준다. 자동으로 두면 목록 길이만큼 늘어나 한 화면에 들어가지 않는다.
    assert.match(dashboardSource, /min-h-\[420px\] flex-\[1_1_0\] grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.12fr\)\]/);
    assert.match(dashboardSource, /const DOC_COLUMN = '[^']*min-h-0[^']*overflow-auto[^']*'/);
    assert.equal(dashboardCode.match(/className=\{DOC_COLUMN\}/g)?.length, 2);
    assert.doesNotMatch(dashboardCode, /ResizeObserver|useRowCapacity/);
  });

  it('branches on isPending so an offline-paused query is never shown as an empty result', () => {
    // React Query v5: 오프라인 대기(paused)면 isLoading=false, isPending=true.
    assert.doesNotMatch(dashboardCode, /\.isLoading\b/);
    assert.match(dashboardSource, /if \(isQueryPaused\(query\)\) return 'offline'/);
    assert.match(dashboardSource, /<OfflineState/);
    // 세 구획 모두 불러오는 중·오프라인·오류를 목록보다 먼저 그린다.
    assert.equal(dashboardCode.match(/\{status \?\?/g)?.length, 4);
  });

  it('shows the selected day of this week and keeps one query for the strip and the list', () => {
    assert.match(dashboardSource, /queryKey: \['calendar-events', 'week', localDateKey\(weekStart\)\]/);
    assert.match(dashboardSource, /end: addDays\(weekStart, 7\)\.toISOString\(\)/);
    // 여러 날에 걸친 일정은 걸친 날마다 센다. 시작한 날에만 넣으면 둘째 날부터 사라진다.
    assert.match(dashboardSource, /event\.end != null && new Date\(event\.end\)\.getTime\(\) > dayStart/);
    assert.match(dashboardSource, /weekEvents\.filter\(\(event\) => eventCoversDay\(event, day\)\)\.length/);
    assert.match(dashboardSource, /\.filter\(\(event\) => eventCoversDay\(event, selectedDate\)\)/);
    assert.match(dashboardSource, /scopedWeekEvents\.filter\(\(event\) => eventCoversDay\(event, now\)\)/);
    assert.doesNotMatch(dashboardCode, /localDateKey\(new Date\(event\.start\)\)/);
    // 다음 날 0시에 끝나는 이어진 일정은 그 날을 다 덮는다: '~00:00'이 아니라 '종일'.
    assert.match(dashboardSource, /end\.getTime\(\) < addDays\(day, 1\)\.getTime\(\) \? `~\$\{clockLabel\(end\)\}` : '종일'/);
    // 고른 날은 그 주에서만 유효하다. 주가 바뀌면 오늘로 돌아간다.
    assert.match(dashboardSource, /picked\?\.week === weekKey \? picked\.day : todayKey/);
  });

  it('lets a completed or snoozed task be undone with the value it had before', () => {
    assert.match(dashboardSource, /patch: \{ status: task\.status \}/);
    assert.match(dashboardSource, /patch: \{ dueDate: task\.dueDate \}/);
    // 미룰 수 있는 날은 지금 기한보다 뒤인 날뿐이다.
    assert.match(dashboardSource, /option\.date\.getTime\(\) > floor/);
    // 미루기 단추는 안 보일 때도 Tab으로 닿아야 한다 (display:none 금지).
    assert.match(dashboardSource, /opacity-0 group-hover\/task:opacity-100 group-focus-within\/task:opacity-100/);
  });

  it('groups tasks into foldable buckets and adds a task for today in place', () => {
    assert.match(dashboardSource, /useState<Record<TaskBucket, boolean>>\(\{ overdue: true, today: true, upcoming: false \}\)/);
    assert.match(dashboardSource, /aria-expanded=\{isOpen\}/);
    // 알약을 누르면 그 묶음을 펴고 묶음 머리로 포커스를 옮긴다.
    assert.match(dashboardSource, /setOpened\(\(prev\) => \(\{ \.\.\.prev, \[reveal\.bucket\]: true \}\)\)/);
    // 바로 추가: 기한은 오늘, 담당은 나. 저장되는 사이에 적기 시작한 글은 지우지 않는다.
    assert.match(dashboardSource, /api\.tasks\.create\(\{ title, dueDate: due\.toISOString\(\), assignedToId: userId \}\)/);
    assert.match(dashboardSource, /setDraft\(\(current\) => \(current\.trim\(\) === title \? '' : current\)\)/);
    assert.match(dashboardSource, /if \(title && !create\.isPending\) create\.mutate\(title\)/);
  });

  it('draws today on the greeting board: the sun sits over the current time and events are flagged', () => {
    const sceneSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/-dashboard-scene.tsx'),
      'utf8',
    );
    const css = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/-dashboard.css'),
      'utf8',
    );
    assert.match(dashboardSource, /<DashboardScene\b/);
    // 그림과 인사말의 시각은 지금 시각이다. 개발 중 미리보기 값이 있을 때만 그 값을 쓴다.
    assert.match(dashboardSource, /hour=\{preview\?\.hour \?\? now\.getHours\(\) \+ now\.getMinutes\(\) \/ 60\}/);
    // 시각은 1분마다 다시 읽는다. 열어 둔 채로 두면 해가 멈춰 있으면 안 된다.
    assert.match(dashboardSource, /const now = useMinuteClock\(\)/);
    // 시간 축 밖(06시 전, 20시 뒤)의 일정은 끝에 몰아 그리지 않는다.
    assert.match(sceneSource, /flags\.filter\(\(flag\) => flag\.hour >= DAY_START && flag\.hour <= DAY_END\)/);
    // 그림의 깃발은 오늘 시작하는, 시각이 있는 일정이다.
    assert.match(dashboardSource, /!event\.allDay && eventCoversDay\(event, now\) && !startedBefore\(event, now\)/);
    // 해가 떠오르는 움직임은 화면을 열 때 한 번뿐이다.
    assert.match(sceneSource, /\}, \[\]\);/);
    assert.match(sceneSource, /if \(cheer > 0\) hop\(\);/);
    // 움직임 줄이기: 그림의 움직임은 no-preference에서만 정의하고, 스크립트로 재생하는 것도 건너뛴다.
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
    // 스크립트가 움직이는 곳 다섯(떠오르기 · 뛰기 · 비와 눈과 마우스 따르기 · 고양이 하트 · 걷는 사람)이 모두 설정을 본다.
    assert.equal(sceneSource.match(/prefersReducedMotion\(\)/g)?.length, 6);
    // 손 흔드는 이모지는 넣지 않는다 (사용자가 뺐다).
    assert.doesNotMatch(dashboardSource + sceneSource, /👋|🌙/u);
  });

  it('dresses the board in the office weather, and stays quiet when there is none', () => {
    const sceneSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/-dashboard-scene.tsx'),
      'utf8',
    );
    const sceneCode = sceneSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    // 날씨를 모르면 날씨 글자를 내지 않는다 (그림만 맑은 날로 그린다).
    assert.match(dashboardSource, /\{weather && <WeatherNote weather=\{weather\}/);
    assert.match(dashboardSource, /const weather: SceneWeather \| undefined = preview\?\.weather;/);
    // 미리보기는 개발 빌드에서만 읽는다.
    assert.match(dashboardSource, /return import\.meta\.env\.DEV \? readWeatherPreview\(realHour\) : null;/);
    // 판의 밝기에 따라 글자 톤이 바뀐다.
    assert.match(dashboardSource, /data-tone=\{tone\}/);
    // 해·달·구름에는 얼굴을 넣지 않는다 (사용자가 뺐다). 얼굴이 있는 것은 고양이와 사람뿐이다.
    assert.doesNotMatch(sceneCode, /className="(smile|cheek|face|mouth)\b/);
    // 걷는 사람은 관절로 걷는다: 허벅지 안에 정강이가 따로 돈다.
    assert.match(sceneSource, /<g className="thigh">[\s\S]*?<g className="shin">/);
    // 사람은 끝없이 지나가지 않는다: 가끔 건물에 들어가 한동안 있다가 나온다. 걷는 속도는 걸음 폭에 맞춘다.
    assert.match(sceneSource, /if \(Math\.random\(\) > 0\.4\) continue;\s+await walk\(x, doorX\);/);
    assert.match(sceneSource, /const WALK_SPEED = \(13 \/ 1\.1\) \* WALKER_SCALE;/);
    // 대시보드는 하루 종일 열려 있다. 비·눈이 없고 마우스도 떠났으면 그리기를 멈춘다.
    assert.match(sceneSource, /if \(document\.hidden \|\| !onScreen \|\| \(!raining && settle <= 0\)\) \{\s+frame = 0;\s+return;/);
  });

  it('plays the entrance once and cheers when a task is completed', () => {
    assert.match(dashboardSource, /window\.setTimeout\(\(\) => setPlaying\(false\), 2600\)/);
    assert.match(dashboardSource, /playing && 'dash-play'/);
    // 축하는 완료가 저장된 뒤에 한다. 누른 순간에 하면 저장에 실패해도 해가 뛴다.
    assert.match(dashboardSource, /onSuccess: \(_result, task\) => \{[^}]*?onCheer\(\);/s);
    assert.doesNotMatch(dashboardSource, /onCheer\(\);\s+complete\.mutate\(task\);/);
    assert.match(dashboardSource, /pin\.key === 'today' && cheer > 0 && <Sparkles key=\{cheer\} \/>/);
    // 알약은 단추다: 일정으로 가거나 할 일의 묶음을 편다.
    assert.match(dashboardSource, /onClick=\{\(\) => onPin\(pin\.key\)\}/);
  });

  it('reuses the deals page rules instead of re-deriving deal risk or stage labels', () => {
    assert.match(dashboardSource, /from '\.\/deals\/-deal-view-utils'/);
    assert.match(dashboardSource, /getDealPipelineHealth\(/);
    assert.match(dashboardSource, /sortDealsForDisplay\(/);
    assert.match(dashboardSource, /<StatusBadge kind="dealStage" status=\{deal\.stage\} \/>/);
    // 거래 줄은 통째로 링크다. role="row"를 씌우면 보조 기술에서 링크가 사라진다.
    assert.doesNotMatch(dashboardCode, /role="(row|cell|table|columnheader)"/);
  });

  it('shows service-wide notices: read-only in the app, marked read when opened', () => {
    assert.match(dashboardSource, /queryKey: NOTICES_QUERY_KEY, queryFn: \(\) => api\.notices\.list\(\)/);
    // 열면 읽음으로 표시한다. 이미 읽은 것은 다시 보내지 않는다.
    assert.match(dashboardSource, /if \(!notice\.readAt\) markRead\.mutate\(notice\)/);
    // 읽으면 캐시를 고치고 다른 탭에도 알린다 (규칙은 lib/notices, 검사는 notices.test.ts).
    assert.match(dashboardSource, /applyNoticeRead\(queryClient, noticeId, readAt\);\s*\/\/[^\n]*\n\s*announceNotice\(\{ type: 'read', noticeId, readAt \}\);/);
    // 읽음 기록을 목록 위에 얹어 그린다 (팝업·다른 탭에서 읽은 것 포함). 늦게 도착한 예전 목록이 캐시를 덮어도
    // '안 읽음'으로 돌아가지 않고, 안 읽음 수도 서버가 센 전체 수에서 그만큼만 뺀다 (규칙과 검사는 lib/notices).
    assert.match(dashboardSource, /const \{ items, unreadCount: unread \} = withKnownReads\(notices\.data, useKnownNoticeReads\(\)\);/);
    // 보이는 것을 다 읽었는데 수가 남으면 나머지를 받아 온다. 같은 응답에 대해서는 한 번만.
    assert.match(dashboardSource, /const hasHiddenUnread = unread > 0 && listedUnread === 0;/);
    assert.match(dashboardSource, /refetchedFor\.current === dataUpdatedAt\) return;/);
    // 본문 창은 목록과 상관없이 사용자가 닫을 때까지 열려 있다. 목록을 다시 불러 그 공지가 빠져도 닫히지 않는다.
    assert.match(dashboardSource, /<Dialog open=\{openId !== null\}/);
    assert.match(dashboardSource, /items\.find\(\(item\) => item\.id === openId\) \?\? lastOpened/);
    // 본문은 일반 글이다. HTML로 넣지 않는다.
    assert.match(dashboardSource, /whitespace-pre-wrap/);
    assert.doesNotMatch(dashboardCode, /dangerouslySetInnerHTML/);
    // 앱에는 공지를 올리거나 고치는 화면이 없다 (운영자가 서버 API로 올린다).
    assert.doesNotMatch(dashboardCode, /notices\.(create|update|remove)|\/notices\/admin/);
    // 사무소 공지가 아니라 서비스 공지라는 것을 본문 창에 밝힌다.
    assert.match(dashboardSource, /에스테잇플로우 공지/);
  });
});
