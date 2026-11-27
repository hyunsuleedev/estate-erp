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
const dashboardCss = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/-dashboard.css'),
  'utf8',
);
/** 주석을 뺀 실행 코드 — '왜 그렇게 하지 않는지' 설명하는 주석이 금지어 검사에 걸리지 않게 한다. */
const dashboardCode = dashboardSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('dashboard', () => {
  it('is a pure-white three-column dashboard: calendar & upcoming / tasks, consultations / status, guide, news', () => {
    for (const component of [
      'MiniCalendarCard',
      'ScheduleCard',
      'TaskSection',
      'StatusSection',
      'ConsultationsSection',
      'NoticeSection',
      'GuideBannerCard',
    ]) {
      assert.match(dashboardSource, new RegExp(`<${component}\\b`));
    }
    assert.match(dashboardSource, /dash-canvas/);
    assert.match(dashboardSource, /dash-bento-grid/);
    assert.match(dashboardSource, /dash-bento-card/);
    // 오른쪽 단의 맨 위는 현재 상황 계기판이다 (2026-11-25, 진행 중인 거래 목록 · 단계 띠를 뺐다).
    // '내 담당'이면 내가 담당인 거래만 세도록 범위를 함께 넘긴다.
    assert.match(dashboardSource, /<aside className="dash-rail">\s*<StatusSection deals=\{deals\} matches=\{matches\} scope=\{scope\} userId=\{user\?\.id\} now=\{now\} \/>\s*<GuideBannerCard[\s\S]*?<NoticeSection/);
    // 계기는 일이 흘러가는 순서: 매칭 중 → 거래 진행 → 거래 완료
    assert.match(dashboardSource, /label: '매칭 중'[\s\S]*?label: '거래 진행'[\s\S]*?label: '거래 완료'/);
    assert.doesNotMatch(dashboardCode, /DealsSection|DealRow|dash-band/);
    // 공지사항과 부동산 뉴스는 '소식' 카드 하나의 탭이다.
    assert.match(dashboardSource, /aria-pressed=\{feed === 'notice'\}/);
    assert.match(dashboardSource, /aria-pressed=\{feed === 'news'\}/);
    // 부동산 · 시장 뉴스는 아직 서버 데이터가 없어 정직하게 '준비 중'만 둔다.
    assert.match(dashboardSource, /부동산 · 시장 뉴스[\s\S]*?준비 중/);
    assert.doesNotMatch(dashboardCode, /BROKERAGE_NEWS/);
    // 제거된 옛 구성 요소가 돌아오지 않는다.
    assert.doesNotMatch(dashboardCode, /<Lead\b|<SoonSection\b|DOC_COLUMN/);
    assert.doesNotMatch(dashboardCode, /통화 제안|매물 신호/);
    // '관리단지'는 새 사무소의 '처음 할 일' 첫 단계(관리단지 고르기)에만 나온다. 옛 관리단지 위젯은 돌아오지 않는다.
    assert.equal(dashboardCode.match(/관리단지/g)?.length ?? 0, 1);
    assert.match(dashboardCode, /title: '관리단지 고르기'/);
  });

  it('keeps money off the dashboard, avoids KPI tiles, and keeps QuickCreate', () => {
    // 이달 수금 카드와 할 일 머리의 수금 단추는 뺐다 (사용자 결정 2026-11-23). 수금은 수수료/정산 화면에서 본다.
    assert.doesNotMatch(dashboardCode, /CollectionCard|useMonthlyLedgerQuery|api\.finance\.ledger|collectPercent\(/);
    assert.doesNotMatch(dashboardCode, /KpiRow|AttentionList|PipelineCard|NotificationBell|api\.dashboard\.summary/);
    assert.match(dashboardSource, /<QuickCreate \/>/);
  });

  it('uses CSS container queries and drops the right rail when three columns do not fit, without ResizeObserver hacks', () => {
    assert.match(dashboardCss, /\.dash-canvas\s*\{[^}]*container-type:\s*inline-size;[^}]*container-name:\s*dash-canvas;[^}]*background:\s*var\(--color-background\)/s);
    // 오른쪽 단(현재 상황 · 가이드 · 소식)은 세 단이 들어가지 않으면 아래로 내려가지 않고 화면에서 빠진다 (사용자 결정 2026-11-25).
    assert.match(dashboardCss, /@container dash-canvas \(max-width: 959px\)[\s\S]*?\.dash-rail\s*\{\s*display:\s*none;\s*\}/);
    assert.doesNotMatch(dashboardCss, /\.dash-rail\s*\{[^}]*grid-column/);
    // 화면에 맞출 때 할 일과 최근 상담은 남은 높이를 정확히 반씩 나눈다.
    assert.match(dashboardCss, /\.dash-bento-grid \.dash-tasks-card,\s*\.dash-bento-grid \.dash-consult-card\s*\{\s*flex:\s*1 1 0;/);
    // 숨긴 단을 대신 열던 단추와 요약 창은 없앴다.
    assert.doesNotMatch(dashboardCode, /digestOpen|onOpenDigest|dash-compact-actions/);
    // 한 줄로 쌓는 것은 정말 좁을 때만(759px 아래). 작은 노트북(판 약 830px)은 두 단이라 달력 옆에 할 일이 보인다 (6차 검수).
    assert.match(dashboardCss, /@container dash-canvas \(max-width: 759px\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.doesNotMatch(dashboardCode, /ResizeObserver|useRowCapacity/);
  });

  it('branches on isPending so an offline-paused query is never shown as an empty result', () => {
    // React Query v5: 오프라인 대기(paused)면 isLoading=false, isPending=true.
    assert.doesNotMatch(dashboardCode, /\.isLoading\b/);
    assert.match(dashboardSource, /if \(isQueryPaused\(query\)\) return 'offline'/);
    assert.match(dashboardSource, /<OfflineState/);
    // 다섯 구획(일정, 할 일, 현재 상황, 상담, 공지) 모두 불러오는 중·오프라인·오류를 목록보다 먼저 그린다.
    assert.equal(dashboardCode.match(/[{(]status \?\?/g)?.length, 5);
  });

  it('drives the monthly calendar, selected day schedule, and upcoming events without breaking multi-day spans', () => {
    // 달력을 다른 달로 넘겨도 상단 인사 보드의 오늘 건수·깃발은 오늘 일정을 그대로 유지한다.
    assert.match(dashboardSource, /queryKey: \['calendar-events', 'day', todayKey\]/);
    assert.match(dashboardSource, /queryKey: \['calendar-events', 'month', localDateKey\(rangeStart\), localDateKey\(rangeEnd\)\]/);
    // 여러 날에 걸친 일정은 걸친 날마다 센다. 시작한 날에만 넣으면 둘째 날부터 사라진다.
    assert.match(dashboardSource, /event\.end != null && new Date\(event\.end\)\.getTime\(\) > dayStart/);
    assert.match(dashboardSource, /monthEvents\.filter\(\(event\) => eventCoversDay\(event, day\)\)\.length/);
    assert.match(dashboardSource, /\.filter\(\(event\) => eventCoversDay\(event, selectedDate\)\)/);
    assert.match(dashboardSource, /scopedTodayEvents\.filter\(\(event\) => eventCoversDay\(event, now\)\)/);
    assert.doesNotMatch(dashboardCode, /localDateKey\(new Date\(event\.start\)\)/);
    // 다음 날 0시에 끝나는 이어진 일정은 그 날을 다 덮는다: '~00:00'이 아니라 '종일'.
    assert.match(dashboardSource, /end\.getTime\(\) < addDays\(day, 1\)\.getTime\(\) \? `~\$\{clockLabel\(end\)\}` : '종일'/);
  });

  it('lets a completed or snoozed task be undone with the value it had before', () => {
    assert.match(dashboardSource, /patch: \{ status: task\.status \}/);
    assert.match(dashboardSource, /patch: \{ dueDate: task\.dueDate \}/);
    // 미룰 수 있는 날은 지금 기한보다 뒤인 날뿐이다.
    assert.match(dashboardSource, /option\.date\.getTime\(\) > floor/);
    // 미루기 단추는 안 보일 때도 Tab으로 닿는다 (display:none 금지).
    assert.match(dashboardSource, /opacity-0 group-hover\/task:opacity-100 group-focus-within\/task:opacity-100/);
  });

  it('splits tasks into tabs that scroll inside the card and adds a task for today in place', () => {
    // 지남 · 오늘 · 다가옴은 접는 묶음이 아니라 탭이다. 고르기 전에는 일이 있는 첫 탭을 보인다.
    assert.match(dashboardSource, /const \[pickedTab, setPickedTab\] = useState<TaskBucket \| null>\(null\);/);
    assert.match(dashboardSource, /pickedTab \?\? TASK_TABS\.find\(\(item\) => groups\[item\.key\]\.length > 0\)\?\.key \?\? 'today'/);
    assert.match(dashboardSource, /aria-pressed=\{activeTab === item\.key\}/);
    // 탭의 일은 모두 싣고 카드 안에서 굴린다('더 보기' 없음). 탭을 바꾸면 목록이 맨 위에서 시작한다.
    assert.doesNotMatch(dashboardSource, /TASK_PREVIEW|DEAL_PREVIEW|NOTICE_PREVIEW/);
    assert.match(dashboardSource, /<ul key=\{activeTab\} className="dash-scroll flex flex-col">/);
    // 인사 영역의 알약을 누르면 그 탭을 고르고 탭으로 포커스를 옮긴다.
    assert.match(dashboardSource, /setPickedTab\(reveal\.bucket\);/);
    // 기한은 글자가 아니라 점 알약이다 (지남 빨강 · 오늘 노랑 · 그 밖 회색).
    assert.match(dashboardSource, /DUE_PILL_CLASS\[bucket === 'overdue' \? 'late' : days === 0 \? 'today' : 'later'\]/);
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
    assert.match(dashboardCss, /@media \(prefers-reduced-motion: no-preference\)/);
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

  it('counts the status gauges with the deals page rules instead of re-deriving deal risk', () => {
    assert.match(dashboardSource, /from '\.\/deals\/-deal-view-utils'/);
    // 정체 · 지연은 거래관리와 같은 판정으로 센다. 끝난 거래 · 진행 중인 거래의 구분도 거래관리의 묶음을 쓴다.
    assert.match(dashboardSource, /getDealPipelineHealth\(deal, now\)\.state !== 'healthy'/);
    assert.match(dashboardSource, /getDealDisplayGroupKey\(deal\.stage\) === 'closed'/);
    // 매칭 중은 닫힌 매칭과 거래로 넘어간 매칭을 뺀다. 건수만 필요하므로 서버가 세게 한다
    // (조건을 건 목록을 한 줄만 청하고 전체 수를 읽는다 — 매칭을 전부 받아 세지 않는다).
    assert.match(dashboardSource, /api\.matches\.findAll\(\{ scope: 'open', limit: 1 \}\)/);
    assert.match(
      dashboardSource,
      /api\.matches\.findAll\(\{ scope: 'open', upcomingViewing: true, limit: 1 \}\)/,
    );
    assert.doesNotMatch(dashboardSource, /api\.matches\.findAll\(\)/);
    // 세 계기는 같은 눈금을 쓴다 — 호의 길이로 서로 견줄 수 있게.
    assert.match(dashboardSource, /<Gauge key=\{stat\.key\} stat=\{stat\} scale=\{scale\} order=\{index\} \/>/);
    // 계기는 통째로 링크다. role="row"를 씌우면 보조 기술에서 링크가 사라진다.
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

  it('shows recent consultations using the consultation list model rules', () => {
    assert.match(dashboardSource, /from '\.\/consultations\/-consultation-list-model'/);
    assert.match(dashboardSource, /api\.consultations\.findAll\(/);
    assert.match(dashboardSource, /getConsultationChannel\(/);
    assert.match(dashboardSource, /getConsultationRowStatus\(/);
    assert.match(dashboardSource, /getConsultationSummaryLine\(/);
    assert.match(dashboardSource, /formatConsultationWhen\(/);
    assert.match(dashboardSource, /<Link to="\/consultations" search=\{\{ consultationId: selected\.id \}\}>/);
    // 날짜로 묶고(공용 표기), 매물 확인으로 생긴 짧은 기록은 그 날의 한 묶음으로 접는다.
    assert.match(dashboardSource, /formatConsultationDay\(item\.createdAt, now\)/);
    assert.match(dashboardSource, /if \(splitConsultationTag\(item\.content\)\.tag\)/);
    // 상담 적기는 빠른 등록과 같은 창을 그 자리에서 연다.
    assert.match(dashboardSource, /<ConsultationFormDialog open=\{writing\} onOpenChange=\{setWriting\} \/>/);
  });
});
