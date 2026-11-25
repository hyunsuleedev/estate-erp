import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const matchesPageSource = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/wanted-properties/index.tsx'),
  'utf8',
);
const matchDetailSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/wanted-properties/-match-detail-dialog.tsx',
  ),
  'utf8',
);
// 매물관리의 매칭 펼침(연결 구매고객)은 별도 파일로 분리되어 있다.
const propertyMatchPanelSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/properties/-components/property-match-panel.tsx',
  ),
  'utf8',
);
const matchGroupsSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/wanted-properties/-match-groups.tsx',
  ),
  'utf8',
);
const matchBoardSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/wanted-properties/-match-board.tsx',
  ),
  'utf8',
);
const matchViewUtilsSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/wanted-properties/-match-view-utils.ts',
  ),
  'utf8',
);
const wantedFilterBarSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/wanted-properties/-wanted-filter-bar.tsx',
  ),
  'utf8',
);
const wantedViewBarSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/wanted-properties/-wanted-view-bar.tsx',
  ),
  'utf8',
);
const statusConfigSource = readFileSync(
  resolve(testDir, '../src/renderer/lib/status-config.ts'),
  'utf8',
);
const requirementCellsSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/wanted-properties/-requirement-cells.tsx',
  ),
  'utf8',
);
const requirementEditSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/wanted-properties/-requirement-edit.ts',
  ),
  'utf8',
);

describe('wanted properties page identity', () => {
  it('is named 희망매물 at /wanted-properties and keeps no legacy /matches route', () => {
    const rendererDir = resolve(testDir, '../src/renderer');
    assert.match(
      matchesPageSource,
      /createFileRoute\('\/_authenticated\/wanted-properties\/'\)/,
    );
    assert.match(
      readFileSync(resolve(rendererDir, 'components/layout/nav-config.ts'), 'utf8'),
      /path: "\/wanted-properties", label: "희망매물"/,
    );
    assert.match(
      readFileSync(resolve(rendererDir, '../common/tabs/routeMeta.ts'), 'utf8'),
      /'\/wanted-properties': \{ title: '희망매물'/,
    );
    assert.equal(existsSync(resolve(rendererDir, 'routes/_authenticated/matches')), false);
    assert.doesNotMatch(
      readFileSync(resolve(rendererDir, 'routeTree.gen.ts'), 'utf8'),
      /_authenticated\/matches/,
    );
  });
});

describe('desktop matches workbench', () => {
  it('uses a compact full-bleed workspace without redundant header summaries', () => {
    assert.match(matchesPageSource, /data-matches-page/);
    assert.match(matchesPageSource, /className="relative -m-4 flex min-h-0/);
    assert.doesNotMatch(matchesPageSource, /aria-label="매칭 요약"/);
    assert.doesNotMatch(matchesPageSource, /<PageHeader/);
    assert.doesNotMatch(
      matchesPageSource,
      /구매고객 조건과 매물을 연결해 제안부터 거래 전환까지 추적합니다/,
    );
  });

  it('shows the customer table only, with no view switch', () => {
    // 보기는 고객별 하나다. 전환 버튼과 단계별 보기는 없앴다 (사용자 의견 2026-11-17)
    assert.doesNotMatch(wantedViewBarSource, /ToolbarPillToggle|MatchViewMode|label: '고객별'|단계별/);
    assert.doesNotMatch(matchesPageSource, /viewMode|MatchViewMode|StageMatchView|getMatchStageGroups/);
    assert.doesNotMatch(matchGroupsSource, /StageMatchView|StageMatchGroupSection|StageMatchTableRow/);
    assert.doesNotMatch(matchViewUtilsSource, /getMatchStageGroups|matchStageGroups|MatchStageGroup/);
    // 완료된 조건은 평소에는 불러오지 않고, 상태 필터에서 '완료'를 골랐을 때만 불러온다
    // (2026-11-22 검수: 완료하면 목록에서 사라져 다시 열 길이 없었다)
    assert.match(
      matchesPageSource,
      /queryFn: \(\) => fetchBuyerRequirements\('completed'\),\s*enabled: includeCompleted,/,
    );
    assert.doesNotMatch(matchesPageSource, />\s*매물별\s*<\/Button>/);
    assert.doesNotMatch(matchesPageSource, />\s*전체\s*<\/Button>/);
    assert.doesNotMatch(matchesPageSource, /MatchListTable/);
    assert.doesNotMatch(matchGroupsSource, /PropertyMatchGroup/);
    assert.doesNotMatch(
      matchViewUtilsSource,
      /getMatchListingGroups|MatchListingGroup/,
    );
  });

  it('removes every kanban entry point from the matches page', () => {
    assert.doesNotMatch(matchesPageSource, /\bkanban\b/);
    assert.doesNotMatch(matchesPageSource, />\s*칸반\s*<\/Button>/);
    assert.doesNotMatch(
      matchesPageSource,
      /MatchColumn|ResultPanel|matchBoardStages/,
    );
    assert.doesNotMatch(matchBoardSource, /칸반/);
    assert.doesNotMatch(
      matchBoardSource,
      /export function (?:MatchColumn|MatchCard|ResultPanel)/,
    );
  });

  it('uses dense document-like groups with explicit single-click detail links', () => {
    assert.match(
      matchGroupsSource,
      /onClick=\{\(\) => actions\.onOpenDetail\(match\.id\)\}/,
    );
    assert.match(matchGroupsSource, /aria-expanded=\{expanded\}/);
  });

  it('shows the buyer as the shared contact chip and keeps the requirements readable', () => {
    assert.doesNotMatch(matchGroupsSource, /<Avatar/);
    assert.doesNotMatch(matchGroupsSource, /getInitials/);
    assert.match(matchGroupsSource, /data-buyer-summary-row/);
    assert.match(matchGroupsSource, /data-buyer-requirement-summary/);
    assert.match(matchGroupsSource, /data-buyer-requirement-details/);
    assert.doesNotMatch(matchGroupsSource, /md:grid-cols-3/);
    assert.match(
      matchGroupsSource,
      /label="희망 지역·단지"[\s\S]*\{showMemo && \([\s\S]*>고객 메모<\/dt>/,
    );
    assert.match(matchGroupsSource, /label="매물 유형"/);
    assert.match(matchGroupsSource, /label="희망 평형"/);
    assert.match(matchGroupsSource, /value=\{requirementSummary\.areaText\}/);
    assert.match(matchGroupsSource, /label="예산"/);
    // 고객 메모는 표의 칸이 아니라 펼친 줄에 있다 (편집기의 읽어 주는 이름으로는 쓴다).
    assert.doesNotMatch(
      matchGroupsSource,
      /<BuyerRequirementSummaryItem[^>]*label="고객 메모"/,
    );
    // 메모가 있을 때만 줄이 보이고, 메모 편집기가 열려 있는 동안에는 메모가 비어도 남는다.
    assert.match(
      matchGroupsSource,
      /const showMemo = expanded && \(Boolean\(buyerRequirement\.memo\) \|\| memoEditorOpen\)/,
    );
    // 메모는 다른 칸과 같은 편집기로 고친다.
    assert.match(matchGroupsSource, /const memoEdit = editCell\('memo'\)/);
    assert.match(matchGroupsSource, /data-buyer-expanded-memo/);
    assert.match(matchGroupsSource, />고객 메모<\/dt>/);
    assert.match(matchGroupsSource, /whitespace-pre-wrap break-words/);
    assert.doesNotMatch(
      matchGroupsSource,
      /buyerRequirement\.urgency === 'urgent'/,
    );
    assert.match(matchGroupsSource, /data-buyer-contact-summary/);
    assert.match(matchGroupsSource, /label="연락처"/);
    assert.match(matchGroupsSource, /value=\{buyerPhone\}/);
    assert.match(matchGroupsSource, /formatPhone\(rawBuyerPhone\)/);
    assert.match(
      matchGroupsSource,
      /className="min-w-0 truncate text-\[13px\] font-semibold"/,
    );
  });

  it('puts a Notion-style view bar and filter row above the unchanged buyer table', () => {
    // 위쪽: 거래유형 묶음 탭 + 도구 줄, 그 아래 필터 줄. 건수는 위쪽에 다시 보여주지 않는다
    // 매물관리처럼 도구 줄과 필터 줄 사이에 선이 있다: 두 줄이 저마다 아래 선을 긋고, 바깥 틀은 긋지 않는다
    assert.match(matchesPageSource, /<header\s+data-wanted-header[\s\S]{0,80}className="shrink-0 bg-white"/);
    assert.match(wantedViewBarSource, /data-wanted-viewbar className="shrink-0 border-b border-border bg-white px-3 py-2\.5"/);
    assert.match(wantedFilterBarSource, /className="flex shrink-0 items-start gap-2 border-b border-border bg-white px-3 py-2"/);
    const propertyToolbarRow = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/properties/index.tsx'),
      'utf8',
    );
    assert.ok(
      propertyToolbarRow.includes('<section className="shrink-0 border-b border-border bg-white px-3 py-2.5">'),
      '매물관리 1행의 여백 · 선 값이 바뀌었다. 희망매물 도구 줄도 함께 맞춘다',
    );
    assert.match(matchesPageSource, /<WantedViewBar/);
    assert.match(matchesPageSource, /\{isFilterRowOpen && \(\s*<WantedFilterBar/);
    assert.doesNotMatch(matchesPageSource, /ToolbarPillSearch|rounded-full px-3\.5/);
    assert.doesNotMatch(matchesPageSource, /FilterSearch|FilterSelect|MultiSelect/);
    // 거래유형: 매물관리와 같은 묶음 탭(옅은 회색 트랙 하나, 고른 것만 검정). 낱개 탭으로 흩어 놓지 않는다
    assert.match(wantedViewBarSource, /<div className="@container flex min-w-0 items-center gap-2">/);
    assert.match(wantedViewBarSource, /<ToolbarPillTabs\s+shape="muted"\s+ariaLabel="거래유형"/);
    assert.doesNotMatch(wantedViewBarSource, /rounded-\[20px\]/);
    // 도구: 28px 아이콘 버튼 — 필터 줄 여닫기(접힌 채 조건이 있으면 개수) · 펼쳐지는 검색 · 만들기
    assert.match(wantedViewBarSource, /'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/);
    assert.match(wantedViewBarSource, /aria-label=\{isFilterRowOpen \? '필터 줄 접기' : '필터 줄 펼치기'\}/);
    assert.match(wantedViewBarSource, /!isFilterRowOpen && activeFilterCount > 0 && 'w-auto gap-1 px-1\.5 text-info hover:text-info'/);
    assert.match(wantedViewBarSource, /\.\.\/properties\/-components\/property-toolbar/);
    assert.match(matchesPageSource, /className="h-\[30px\] shrink-0 rounded-\[8px\] px-3 text-\[13px\]"/);
    // 이 화면에서 새로 만드는 것은 희망매물(구함 의뢰)이다: 주 버튼은 "희망매물 생성"이고,
    // 고객 원장처럼 등록 화면을 새 탭으로 연다. 취소하면 이 화면으로 돌아오게 연 곳을 함께 넘긴다
    assert.match(
      matchesPageSource,
      /const openRequirementCreate = \(\) => \{\s*const route = '\/buyer-requirements\/new\?from=wanted-properties';\s*const meta = getRouteMeta\(route\);\s*createTab\(\{ route, kind: meta\.kind, title: meta\.title \}\);/,
    );
    assert.match(
      matchesPageSource,
      /aria-label="희망매물 생성"\s+className="h-\[30px\] shrink-0 rounded-\[8px\] px-3 text-\[13px\]"\s+onClick=\{openRequirementCreate\}\s*>\s*<Plus className="size-3\.5" \/>\s*<span className="@max-3xl:hidden">희망매물 생성<\/span>/,
    );
    // 툴바에는 매칭 생성 버튼을 두지 않는다. 매칭은 고객 줄의 + 와 매물관리의 '고객 연결'에서 한다.
    assert.doesNotMatch(matchesPageSource, /aria-label="매칭 생성"/);
    // 빈 화면의 버튼도 같은 일을 한다. 같은 탭에서 등록 화면으로 넘어가지 않는다 (취소하면 이 탭이 닫혔다)
    assert.match(
      matchesPageSource,
      /<Button type="button" onClick=\{openRequirementCreate\}>\s*<Plus className="size-4" \/>\s*희망매물 생성\s*<\/Button>/,
    );
    assert.doesNotMatch(matchesPageSource, /navigate\(\{ to: '\/buyer-requirements\/new' \}\)/);
    assert.doesNotMatch(matchesPageSource, /구함 의뢰 추가/);
    // 검색: 돋보기를 누르거나 '/' · Cmd/Ctrl+F로 열고, 비운 채 벗어나면 접는다.
    // 접으면 왼쪽 도구가 밀리므로 눌러서 벗어난 경우에는 그 클릭이 끝난 뒤에 접는다
    assert.match(wantedViewBarSource, /placeholder="고객, 연락처, 매물, 주소 검색"\s+aria-label="희망매물 검색"/);
    assert.match(wantedViewBarSource, /if \(!value\) collapseAfterClick\(\);/);
    assert.match(wantedViewBarSource, /window\.addEventListener\('pointerup', later, true\);/);
    assert.match(matchesPageSource, /event\.key === '\/'[\s\S]*setSearchFocusSignal\(\(value\) => value \+ 1\)/);
    assert.match(matchesPageSource, /\(event\.metaKey \|\| event\.ctrlKey\) && event\.key === 'f'[\s\S]*?setSearchFocusSignal/);
    assert.doesNotMatch(
      matchesPageSource,
      /\{filteredMatches\.length\.toLocaleString\(\)\}건\s*<\/p>/,
    );

    // 표: 맨 위 헤더가 칸 이름을 맡고, 헤더와 고객 행이 같은 칸 너비를 쓴다
    assert.match(matchesPageSource, /<BuyerMatchTableHeader/);
    // 표 머리는 매물관리 표 머리와 같은 모양이다: 회색 띠 없이 흰 바탕 36px, 16px 아이콘 + 13px 보통 굵기 이름
    assert.match(
      matchGroupsSource,
      /BUYER_TABLE_COLUMNS,[\s\S]{0,80}'sticky top-0 z-20 h-9 border-b border-border bg-white'/,
    );
    assert.doesNotMatch(matchGroupsSource, /bg-\[#f7f7f5\]|bg-muted\/50 text-left|CircleDollarSign/);
    const propertyPageSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/properties/index.tsx'),
      'utf8',
    );
    for (const classes of [
      'inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px]',
      'shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]',
    ]) {
      assert.ok(propertyPageSource.includes(classes), `매물관리 표 머리에 없는 값: ${classes}`);
      assert.ok(matchGroupsSource.includes(classes), `희망매물 표 머리에 없는 값: ${classes}`);
    }
    assert.match(matchGroupsSource, /\{ label: '예산', icon: <WonCircleIcon \/> \}/);
    assert.match(
      matchGroupsSource,
      /<div key=\{label\} className=\{cn\(BUYER_TABLE_CELL, 'last:border-r-0'\)\}>\s*<TableHeaderLabel icon=\{icon\} label=\{label\} \/>/,
    );
    assert.match(
      matchGroupsSource,
      /data-buyer-summary-row[\s\S]{0,120}className=\{cn\(BUYER_TABLE_COLUMNS, 'min-h-10', 'group', peekOpen && 'bg-muted\/50'\)\}/,
    );
    for (const label of [
      '긴급도', '고객', '연락처', '상태', '매물 유형', '희망 평형', '예산', '희망 지역·단지', '입주 희망일',
    ]) {
      assert.match(matchGroupsSource, new RegExp(`\\{ label: '${label}', icon:`));
    }
    // 입주 희망일 · 상태 · 긴급도: 필터 줄에만 있던 값을 표에서도 보인다. 긴급도는 고객 이름 왼쪽, 상태는 연락처 바로 오른쪽, 그 뒤로 조건 → 입주 희망일. 매칭 칸은 뺐다 (건수는 아래 매칭 카드에서 보인다)
    assert.match(
      matchGroupsSource,
      /\{ label: '긴급도', icon: <Siren \/> \},\s*\{ label: '고객', icon: <User \/> \},\s*\{ label: '연락처', icon: <Phone \/> \},\s*\{ label: '상태', icon: <CircleDashed \/> \},\s*\{ label: '매물 유형', icon: <Tag \/> \}[\s\S]*\{ label: '희망 지역·단지', icon: <MapPin \/> \},\s*\{ label: '입주 희망일', icon: <CalendarDays \/> \},\s*\];/,
    );
    assert.match(
      matchGroupsSource,
      /label="입주 희망일"\s+value=\{formatDate\(buyerRequirement\.moveInDate\)\}\s+className="tabular-nums border-r-0"\s+muted=\{!buyerRequirement\.moveInDate\}/,
    );
    // 상태 칸은 매물관리 표의 매물상태 칸과 같은 알약(점 + 둥근 알약)이고, 고르는 목록도 같은 알약을 쓴다
    assert.match(matchGroupsSource, /<BuyerStatusPill status=\{buyerRequirement\.status\} \/>/);
    assert.match(requirementCellsSource, /export function BuyerStatusPill/);
    assert.match(requirementCellsSource, /kind === 'buyerStatus' \? \(\s*<BuyerStatusPill status=\{option\} \/>/);
    // 긴급도도 상태와 같은 알약이고, 고르는 목록도 같은 알약을 쓴다
    assert.match(matchGroupsSource, /<BuyerUrgencyPill status=\{buyerRequirement\.urgency\} \/>/);
    assert.match(requirementCellsSource, /export function BuyerUrgencyPill/);
    assert.match(requirementCellsSource, /<BuyerUrgencyPill status=\{option\} \/>/);
    // 칸 글자는 매물관리 표와 같다: 14px · 굵기 450 · 줄 높이 21px
    assert.match(matchGroupsSource, /'min-w-0 text-\[14px\] font-\[450\] leading-\[21px\]',/);
    // 필터 줄의 같은 필터와 아이콘이 같다
    for (const [label, icon] of [['입주 희망일', 'CalendarDays'], ['상태', 'CircleDashed'], ['긴급도', 'Siren']]) {
      assert.match(wantedFilterBarSource, new RegExp(`label="${label}"\\s+shape="soft"\\s+icon=\\{<${icon} />\\}`));
    }
    // 이름 옆의 "보류" 꼬리표는 상태 칸으로 옮겼다 (같은 값을 두 번 보이지 않는다)
    assert.doesNotMatch(matchGroupsSource, /buyerRequirement\.status === 'hold' &&/);
    // 왼쪽 메뉴를 편 1440px 창(본문 1184px)에 가로로 굴리지 않고 들어가는 너비
    assert.match(matchGroupsSource, /BUYER_TABLE_MIN_WIDTH_CLASS = 'min-w-\[1128px\]'/);
    const gridColumns = matchGroupsSource.match(/'grid grid-cols-\[([^\]]+)\]'/)?.[1] ?? '';
    assert.equal(
      gridColumns,
      '40px_28px_80px_148px_130px_80px_100px_104px_minmax(168px,212px)_minmax(140px,1fr)_110px',
    );
    // 최소 폭 값은 칸 너비(유동 칸은 최소값)의 합과 같아야 한다
    const minimumWidth = gridColumns
      .split('_')
      .reduce((sum, track) => sum + Number(track.match(/^(?:minmax\()?(\d+)px/)?.[1] ?? NaN), 0);
    assert.equal(minimumWidth, 1128);
    // 고객 칸에 매물관리 표와 같은 "열기" 버튼이 있고, 누르면 옆 상세 패널이 열린다
    assert.match(matchGroupsSource, /<RowOpenButton\s+label=\{buyerName\}\s+current=\{peekOpen\}/);
    const peekSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/wanted-properties/-requirement-peek.tsx'),
      'utf8',
    );
    const pageSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/wanted-properties/index.tsx'),
      'utf8',
    );
    // 다른 상세 패널과 같은 틀: 같은 도구 줄, 미끄러짐, Esc, 확장하면 전체 화면을 열고 닫힌다
    assert.match(peekSource, /data-property-inspector/);
    assert.match(peekSource, /<PropertyInspectorToolbar onClose=\{onClose\} onOpenNewTab=\{expand\} \/>/);
    assert.match(peekSource, /onOpenFull\(requirement\.id\);\s*onClose\(false\);/);
    assert.match(pageSource, /const route = `\/buyer-requirements\/\$\{requirementId\}`;/);
    // 패널의 연결 매물은 목록 필터로 걸러진 것이 아니라 이 고객의 매칭 전부다
    assert.match(pageSource, /matches\.filter\(\(match\) => match\.buyerReqId === peekRequirementId\)/);
    assert.match(pageSource, /<RequirementPeek[\s\S]{0,120}matches=\{peekMatches\}/);
    assert.doesNotMatch(pageSource, /matches=\{peekGroup\.matches\}/);
    // 목록에서 빠진 고객의 패널은 남기지 않는다
    assert.match(pageSource, /if \(peekRequirementId && !peekGroup\) finishClosingPeek\(\);/);

    // 고객 칸: 관리단지 표와 같은 이름 배지(공용 부품). 누르면 그 연락처를 연다
    assert.match(matchGroupsSource, /import \{ ContactNameChip, RowOpenButton, StatusBadge, WonCircleIcon \} from '@\/components\/domain';/);
    assert.match(
      matchGroupsSource,
      /buyerRequirement\.contact\?\.id \? \(\s*<span className="flex min-w-0 text-\[14px\] leading-\[21px\] text-foreground">\s*<ContactNameChip\s+contactId=\{buyerRequirement\.contact\.id\}\s+name=\{buyerName\}\s*\/>/,
    );
    const sitesPageSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );
    assert.ok(
      sitesPageSource.includes('<span className="flex min-w-0 text-[14px] leading-[21px] text-foreground">'),
      '관리단지 표의 이름 칸 값이 바뀌었다. 희망매물 고객 칸도 함께 맞춘다',
    );
    assert.match(matchGroupsSource, /<dt className="sr-only">\{label\}<\/dt>/);

    // 하단: 건수·선택은 매물관리 표처럼 아래 줄에 둔다
    assert.match(matchesPageSource, /data-buyer-table-status/);
    assert.match(matchesPageSource, /희망 조건 \{selectedVisibleItemCount\.toLocaleString\(\)\}건 선택/);
  });

  it('edits every requirement cell in place except customer, phone and matches', () => {
    // 일곱 칸에 편집을 건다. 고객 · 연락처 · 매칭은 그대로 둔다 (사용자 의견 2026-11-17)
    const editable = [
      ['매물 유형', 'siteTypes'],
      ['희망 평형', 'area'],
      ['예산', 'budget'],
      ['희망 지역·단지', 'places'],
      ['입주 희망일', 'moveInDate'],
      ['상태', 'status'],
      ['긴급도', 'urgency'],
    ];
    for (const [label, field] of editable) {
      assert.match(
        matchGroupsSource,
        new RegExp(`label="${label}"[^/]{0,260}?edit=\\{editCell\\('${field}'\\)\\}`),
      );
    }
    assert.equal(matchGroupsSource.match(/edit=\{editCell\(/g)?.length, editable.length);
    assert.match(
      matchGroupsSource,
      /label="연락처"\s+value=\{buyerPhone\}\s+className="tabular-nums"\s+\/>/,
    );

    // 칸 전체가 누르는 곳이다: 여백은 버튼이 갖고, 값의 모양은 읽기 전용 칸과 같은 것을 쓴다
    assert.match(
      matchGroupsSource,
      /const BUYER_TABLE_EDITABLE_CELL = 'flex min-w-0 border-r border-border';/,
    );
    assert.match(
      matchGroupsSource,
      /<EditableRequirementCell \{\.\.\.edit\} label=\{label\} valueText=\{value\}>\s*<span title=\{value\} className=\{valueClassName\}>/,
    );
    assert.match(
      matchGroupsSource,
      /<dd title=\{value\} className=\{valueClassName\}>/,
    );
    assert.match(requirementCellsSource, /'flex min-w-0 flex-1 cursor-pointer items-center px-2\.5 text-left/);

    // 매물관리 표의 칸 편집과 같은 표식을 단다 (광고 표의 날짜 칸이 같은 방식의 Popover 편집기다)
    assert.match(
      requirementCellsSource,
      /data-editable-cell-trigger\s+data-cell-record-id=\{requirement\.id\}\s+data-cell-field=\{field\}/,
    );
    assert.ok(
      readFileSync(
        resolve(
          testDir,
          '../src/renderer/routes/_authenticated/properties/-components/property-ad-editable-cell.tsx',
        ),
        'utf8',
      ).includes('data-editable-cell-trigger data-cell-record-id={recordId} data-cell-field="startedAt"'),
      '매물관리 광고 표 날짜 칸의 표식이 바뀌었다. 희망매물 칸도 함께 맞춘다',
    );
    for (const field of editable.map(([, field]) => field)) {
      assert.match(requirementCellsSource, new RegExp(`case '${field}':`));
    }

    // 고친 채 바깥을 누르면 저장하고, 저장하는 동안에는 닫히지 않는다. 고치지 않았으면 그냥 닫힌다
    assert.match(
      requirementCellsSource,
      /onInteractOutside=\{\(event\) => \{\s*if \(savingRef\.current\) \{\s*event\.preventDefault\(\);\s*return;\s*\}[\s\S]{0,140}if \(!isChanged\(draft\)\) return;\s*event\.preventDefault\(\);/,
    );
    assert.match(
      requirementCellsSource,
      /onEscapeKeyDown=\{\(event\) => \{\s*if \(savingRef\.current\) event\.preventDefault\(\);/,
    );
    // 고친 것이 있는 동안에는 막이 누름을 받는다: 저장이 끝나기 전에 다른 것이 눌리지 않는다
    assert.match(requirementCellsSource, /const GUARD_ATTRIBUTE = 'data-requirement-edit-guard';/);
    assert.match(requirementCellsSource, /\{dirty &&\s*createPortal\(/);
    // 실패하면 입력을 남기고, 꺼 두었던 입력칸의 포커스를 돌려준다
    assert.match(
      requirementCellsSource,
      /setError\(\s*cause instanceof ApiError && cause\.statusCode === 404 \? DELETED_ERROR : SAVE_ERROR,\s*\);\s*refocusRef\.current = focused;/,
    );
    // 고르면 끝나는 값은 고르는 즉시 저장한다. 단, 진행 중인 매칭이 있는 손님을 '완료'로 바꿀 때는
    // 매칭도 함께 닫히므로 한 번 묻는다 (2026-11-22 검수 2차)
    assert.match(
      requirementCellsSource,
      /confirm && option === confirm\.value && option !== value\s*\? setAsking\(true\)\s*: editor\.save\(option\)/,
    );
    assert.match(requirementCellsSource, /완료로 바꾸면 연결한 매물 \$\{openMatchCount\}건의 진행도 함께 끝납니다/);
    assert.match(requirementCellsSource, /setDraft\(next\);\s*editor\.save\(next\);/);
    // 고르는 꼬리표는 표의 칸과 같은 부품이다
    assert.match(requirementCellsSource, /kind === 'buyerStatus' \? \(\s*<BuyerStatusPill status=\{option\} \/>\s*\) : \(\s*<BuyerUrgencyPill status=\{option\} \/>\s*\)/);

    // 저장: 상태는 전용 경로, 나머지는 고친 값만 PATCH. 응답을 목록에 덮고 관련 목록을 다시 받는다
    assert.match(
      matchesPageSource,
      /change\.kind === 'status'\s*\? await api\.buyerRequirements\.updateStatus\(requirement\.id, change\.status\)\s*: await api\.buyerRequirements\.update\(requirement\.id, change\.patch\)/,
    );
    // 저장 직전에 그 조건의 지금 값을 받아, 그 위에 초안을 다시 얹고 무엇을 보낼지 다시 정한다.
    // 구매 조건 수정에는 서버의 동시 수정 검사(매물관리의 expectedUpdatedAt)가 없기 때문이다
    assert.match(
      matchesPageSource,
      /const refreshRequirement: RequirementRefreshHandler = async \(requirement\) => \{\s*const latest = await api\.buyerRequirements\.findOne\(requirement\.id\);/,
    );
    assert.match(matchesPageSource, /\(list\) => mergeLatestRequirement\(list, latest\)/);
    // 받아 오는 사이 목록이 더 새 값을 받았으면 그것을 지금 값으로 쓴다 (예전 값으로 되돌리지 않는다)
    assert.match(
      matchesPageSource,
      /if \(listed && listed\.updatedAt > latest\.updatedAt\) return listed;/,
    );
    assert.match(matchesPageSource, /onRefreshRequirement=\{refreshRequirement\}/);
    assert.match(
      requirementCellsSource,
      /const latest = await onRefresh\(requirement\);\s*const rebased =[\s\S]{0,700}try \{\s*change = toChange\(latest, rebased\);/,
    );
    // 방금 고른 값(상태 · 긴급도의 선택지, 달력의 날짜)은 고를 때 화면에 보이던 값을 기준으로 다시 얹는다.
    // 편집기를 열 때의 값을 기준으로 삼으면, 그 값과 같은 것을 고른 선택이 저장 없이 버려진다
    assert.match(
      requirementCellsSource,
      /picked !== undefined \|\| session === null\s*\?[\s\S]{0,260}rebaseDraft\(requirement, latest, value\)\s*:[\s\S]{0,120}rebaseDraft\(session\.base, latest, session\.draft\);/,
    );
    assert.match(requirementCellsSource, /const value = picked !== undefined \? picked : draft;/);
    assert.match(requirementCellsSource, /save: \(value\) => void save\(value\),/);
    assert.match(requirementCellsSource, /if \(change\) await onEdit\(target, change\);/);
    // 고치려는 바로 그 칸이 화면 모르게 바뀌어 있었으면 한 번 멈춘다 (본 적 없는 값을 덮지 않는다)
    assert.match(
      requirementCellsSource,
      /if \(change && findFieldsChangedBehind\(requirement, latest, change\)\.length > 0\) \{\s*setError\(picked !== undefined \? CHANGED_BEHIND_PICK_ERROR : CHANGED_BEHIND_ERROR\);/,
    );
    for (const build of [
      'buildStatusChange',
      'buildUrgencyChange',
      'buildSiteTypesChange',
      'buildAreaChange',
      'buildBudgetChange',
      'buildPlacesChange',
      'buildMoveInDateChange',
      'buildMemoChange',
    ]) {
      assert.match(requirementCellsSource, new RegExp(`toChange=\\{${build}\\}`));
    }

    // 저장 전에 목록 갱신을 멈추지 않는다 (invalidateQueries가 받는 중이던 것을 멈추고 다시 받는다).
    // 멈춰 두면 저장이 실패했을 때 그 갱신이 빠진다
    assert.doesNotMatch(matchesPageSource, /cancelQueries/);

    // 편집기가 열려 있는 조건의 줄은 목록이 새로 와도 남긴다: 필터에서 벗어나도, 목록에서 빠져도(열 때의 값으로)
    assert.match(
      matchesPageSource,
      /const \[editingRequirement, setEditingRequirement\] =\s*useState<BuyerRequirement \| null>\(null\);/,
    );
    assert.match(matchesPageSource, /keepRequirementId: editingRequirement\?\.id \?\? null,/);
    // 남겨 둔 줄은 "편집기를 열 때의 값"이 아니라 목록에서 마지막으로 본 값으로 그린다.
    // 열 때의 값으로 그리면 편집기가 이미 본 값보다 예전으로 돌아가, 감지한 거래유형 충돌이 풀린다
    assert.match(
      matchesPageSource,
      /useEffect\(\(\) => \{\s*if \(!editingListed\) return;\s*setEditingRequirement\(\(current\) =>\s*current && current\.id === editingListed\.id \? editingListed : current,\s*\);\s*\}, \[editingListed\]\);/,
    );
    assert.match(
      matchesPageSource,
      /const editingDetached = editingRequirement !== null && editingListed === undefined;/,
    );
    assert.match(
      matchesPageSource,
      /editingRequirement && editingDetached \? \[\.\.\.mine, editingRequirement\] : mine;/,
    );
    // 목록에서 빠진 조건은 지금 값을 알 수 없으므로 남겨 둔 줄에서는 저장하지 않는다 (입력은 편집기에 남긴다)
    assert.match(
      matchesPageSource,
      /requirementEditBlocked=\{\s*editingDetached && group\.buyerReqId === editingRequirement\?\.id\s*\? '완료되었거나 지워진 조건이라 이 목록에서는 저장할 수 없습니다\.'\s*: undefined\s*\}/,
    );
    assert.match(
      requirementCellsSource,
      /if \(!change\) \{\s*setOpen\(false\);\s*return;\s*\}\s*if \(blockedReason\) \{[\s\S]{0,120}return;\s*\}/,
    );
    assert.match(requirementCellsSource, /\{saving \? '저장 중…' : \(blockedReason \?\? error\)\}/);
    assert.match(matchGroupsSource, /blockedReason: requirementEditBlocked,/);
    // 한 줄에서 편집기가 겹쳐 열려 있을 수 있어(저장 중인 칸 + 새로 연 칸) 줄 단위로 센다
    assert.match(
      matchGroupsSource,
      /if \(editing \? openEditorsRef\.current === 1 : openEditorsRef\.current === 0\) \{\s*onRequirementEditingChange\?\.\(editing\);/,
    );
    assert.match(
      matchesPageSource,
      /onRequirementEditingChange=\{\(editing\) =>\s*setEditingRequirement\(\(current\) =>\s*editing\s*\? group\.buyerRequirement\s*: current\?\.id === group\.buyerReqId\s*\? null\s*: current,/,
    );
    // 편집기가 열려 있는 동안에는 목록을 다시 받다 실패해도 오류 화면으로 바꾸지 않는다
    assert.match(matchesPageSource, /const showError = isError && editingRequirement === null;/);
    assert.match(matchesPageSource, /\) : showError \? \(/);
    // 편집기는 열리고 닫힐 때(줄이 사라질 때 포함) 알린다
    assert.match(
      requirementCellsSource,
      /if \(!open\) return;\s*onEditingChangeRef\.current\?\.\(true\);\s*return \(\) => onEditingChangeRef\.current\?\.\(false\);\s*\}, \[open\]\);/,
    );

    // 예산: 금액을 고치는 사이 거래유형이 다른 곳에서 바뀌면 입력을 보던 유형 그대로 두고,
    // 사용자가 유형을 다시 고를 때까지 저장을 막는다 (매매가로 넣은 금액을 전세가로 저장하지 않는다)
    assert.match(requirementEditSource, /typeConflict\?: RequirementTransactionType \| '';/);
    assert.match(
      requirementEditSource,
      /if \(draft\.typeConflict !== undefined\) \{[\s\S]{0,120}throw new Error\('거래유형을 골라 주세요\.'\);/,
    );
    assert.match(requirementCellsSource, /data-budget-type-conflict/);
    assert.match(
      requirementCellsSource,
      /const selected = !awaitingType && draft\.transactionType === type;/,
    );
    assert.match(
      requirementCellsSource,
      /setDraft\(\{ \.\.\.draft, transactionType: type, typeConflict: undefined \}\)/,
    );
    assert.match(requirementCellsSource, /canSave=\{!awaitingType\}/);
    // 응답 전체가 아니라 고친 칸만 덮는다 (저장하는 사이 새로 온 목록의 다른 값을 예전 값으로 돌리지 않는다)
    assert.match(matchesPageSource, /\(list\) => mergeSavedRequirement\(list, saved, change\)/);
    assert.match(
      requirementEditSource,
      /const fields = change\.kind === 'status' \? \['status'\] : Object\.keys\(change\.patch\);/,
    );
    // 편집기를 열어 둔 사이 목록이 새로 오면, 초안을 지금 조건 위에 다시 얹는다:
    // 손대지 않은 값은 지금 값을 따르므로 예전 값이 "고친 값"으로 읽혀 저장되지 않는다
    assert.match(
      requirementCellsSource,
      /session\.base === requirement\s*\? session\.draft\s*: rebaseDraft\(session\.base, requirement, session\.draft\)/,
    );
    assert.match(
      requirementCellsSource,
      /setSession\(\{ base: requirement, draft: createDraft\(requirement\) \}\);/,
    );
    assert.match(requirementCellsSource, /setSession\(\{ base: requirement, draft: next \}\);/);
    for (const rebase of [
      'rebaseStatus',
      'rebaseUrgency',
      'rebaseSiteTypes',
      'rebaseAreaDraft',
      'rebaseBudgetDraft',
      'rebasePlacesDraft',
      'rebaseMoveInDate',
      'rebaseMemo',
    ]) {
      assert.match(requirementCellsSource, new RegExp(`rebaseDraft=\\{${rebase}\\}`));
    }
    assert.match(
      matchesPageSource,
      /\[\['buyer-requirements'\], \['matches'\], \['projects'\]\]/,
    );
    assert.match(matchesPageSource, /onEditRequirement=\{saveRequirement\}/);
    // 완료하면 진행 · 보류만 보는 이 목록에서 줄이 빠지므로, 이유를 알리고 되돌리기를 준다
    assert.match(
      matchesPageSource,
      /toast\.success\('완료로 바꿨습니다'[\s\S]{0,500}label: '되돌리기'/,
    );
    // 되돌리기 전에 지금 상태를 다시 확인한다: 그 사이 다른 곳에서 바뀌었으면 예전 값으로 덮지 않는다
    assert.match(
      matchesPageSource,
      /const latest = await api\.buyerRequirements\.findOne\(id\);\s*if \(currentStatus\(latest\) !== 'completed'\) \{\s*toast\.info\('그 사이 상태가 바뀌어 되돌리지 않았습니다'\);/,
    );

    // 서버가 입주 희망일 비우기(null)를 받으므로 저장된 날짜가 있으면 "날짜 지우기"를 두고, 빈 칸은 비우기로 읽는다
    assert.match(requirementCellsSource, /날짜 지우기/);
    assert.match(
      requirementEditSource,
      /if \(!date\) return requirement\.moveInDate \? toUpdate\(\{ moveInDate: null \}\) : null;/,
    );
  });

  it('lists every open buyer requirement, including ones without a match', async () => {
    // 진행·보류 조건을 끝까지 불러오고, 어느 한쪽 조회가 실패하면 목록을 그리지 않는다
    assert.match(matchesPageSource, /fetchBuyerRequirements\('active,hold'\)/);
    assert.match(matchesPageSource, /page >= result\.pagination\.totalPages/);
    assert.match(
      matchesPageSource,
      /const isError =\s*isMatchesError \|\| isRequirementsError \|\| \(includeCompleted && completedQuery\.isError\);/,
    );
    // 매칭 없는 고객은 줄 아래에서 그 조건으로 고정해 매칭을 만든다 (매칭 칸은 뺐다)
    assert.match(matchGroupsSource, /data-buyer-no-match/);
    assert.doesNotMatch(matchGroupsSource, /label: '매칭'/);
    assert.match(matchGroupsSource, />매칭 없음<\/span>/);
    assert.match(matchGroupsSource, /aria-label=\{`\$\{buyerName\} 매칭 생성`\}/);
    assert.match(matchesPageSource, /\{ kind: 'demand', requirementId: createRequirementId \}/);

    const loaded =
      (await import('../src/renderer/routes/_authenticated/wanted-properties/-match-view-utils.ts')) as unknown as Record<
        string,
        unknown
      >;
    const { groupMatchesByRequirement } = (loaded.default ?? loaded) as {
      groupMatchesByRequirement: (input: Record<string, unknown>) => Array<{
        buyerReqId: string;
        matches: Array<{ id: string }>;
      }>;
    };

    const requirement = (id: string, name: string, transactionType: string, priorityRank = 1) => ({
      id,
      transactionType,
      priorityRank,
      contact: { id: `c-${name}`, name, phone: null },
      memo: null,
      preferredRegions: [],
      siteTypes: [],
    });
    const match = (id: string, buyerReqId: string, stage: string, siteName: string) => ({
      id,
      buyerReqId,
      stage,
      memo: null,
      listing: { property: { site: { name: siteName, roadAddress: siteName } } },
    });
    const requirements = [
      requirement('with-match', '나중', 'sale'),
      requirement('no-match', '가나', 'jeonse'),
      requirement('second', '나중', 'sale', 2),
    ];
    const matches = [
      match('m1', 'with-match', 'viewing', '래미안'),
      match('m2', 'with-match', 'suggested', '힐스테이트'),
    ];
    const group = (overrides: Record<string, unknown> = {}) =>
      groupMatchesByRequirement({
        requirements,
        matches,
        search: '',
        stageFilters: [],
        transactionType: '',
        ...overrides,
      });
    const ids = (groups: Array<{ buyerReqId: string }>) => groups.map((item) => item.buyerReqId);

    // 매칭 없는 조건도 한 줄. 이름순, 같은 고객은 우선순위순
    assert.deepEqual(ids(group()), ['no-match', 'with-match', 'second']);
    assert.deepEqual(group()[0].matches, []);

    // 거래유형은 매물이 아니라 조건 기준
    assert.deepEqual(ids(group({ transactionType: 'jeonse' })), ['no-match']);

    // 단계 필터를 걸면 해당 단계 매칭이 있는 조건만 남는다
    const staged = group({ stageFilters: ['viewing'] });
    assert.deepEqual(ids(staged), ['with-match']);
    assert.deepEqual(staged[0].matches.map((item) => item.id), ['m1']);

    // 고객에 걸리면 매칭 전부, 매물에만 걸리면 걸린 매칭만
    assert.deepEqual(ids(group({ search: '가나' })), ['no-match']);
    assert.equal(group({ search: '나중' })[0].matches.length, 2);
    const byListing = group({ search: '래미안' });
    assert.deepEqual(ids(byListing), ['with-match']);
    assert.deepEqual(byListing[0].matches.map((item) => item.id), ['m1']);
    assert.deepEqual(group({ search: '없는말' }), []);
    // 희망 단지 이름으로도 찾는다
    // 칸 편집기가 열려 있는 조건은 필터에서 벗어나도 줄을 남긴다 (줄이 사라지면 고치던 입력이 함께 사라진다)
    const kept = (extra: Record<string, unknown>) =>
      groupMatchesByRequirement({
        requirements,
        matches: [],
        search: '',
        stageFilters: [],
        transactionType: '',
        ...extra,
      }).map((group) => group.buyerReqId);
    assert.deepEqual(kept({ transactionType: 'jeonse' }), ['no-match']);
    assert.deepEqual(kept({ transactionType: 'jeonse', keepRequirementId: 'with-match' }), [
      'no-match',
      'with-match',
    ]);
    assert.deepEqual(kept({ search: '없는 검색어', keepRequirementId: 'second' }), ['second']);
    assert.deepEqual(kept({ stageFilters: ['viewing'], keepRequirementId: 'no-match' }), ['no-match']);
    assert.deepEqual(kept({ transactionType: 'jeonse', keepRequirementId: null }), ['no-match']);

    const withSite = groupMatchesByRequirement({
      requirements: [
        {
          ...requirement('site-req', '다라', 'sale'),
          preferredSites: [{ siteId: 's1', site: { id: 's1', name: '고덕그라시움' } }],
        },
      ],
      matches: [],
      search: '그라시움',
      stageFilters: [],
      transactionType: '',
    });
    assert.deepEqual(ids(withSite), ['site-req']);

    // '매칭 없음'을 고르면 매칭이 하나도 없는 조건만, 단계와 함께 고르면 둘 다 남는다
    assert.deepEqual(ids(group({ stageFilters: ['none'] })), ['no-match', 'second']);
    assert.deepEqual(ids(group({ stageFilters: ['none', 'viewing'] })), [
      'no-match',
      'with-match',
      'second',
    ]);
  });

  it('filters wanted conditions by the values the customer actually set', async () => {
    const filtersModule =
      (await import('../src/renderer/routes/_authenticated/wanted-properties/-wanted-filters.ts')) as unknown as Record<
        string,
        unknown
      >;
    const {
      countRequirementFilters,
      EMPTY_REQUIREMENT_FILTERS,
      getAssigneeFilterOptions,
      getLocationFilterOptions,
      matchesRequirementFilters,
      scopeRequirementFilters,
      toOpenRange,
    } = (filtersModule.default ?? filtersModule) as {
      countRequirementFilters: (filters: unknown) => number;
      EMPTY_REQUIREMENT_FILTERS: Record<string, unknown>;
      getAssigneeFilterOptions: (items: unknown[]) => Array<{ value: string; label: string }>;
      getLocationFilterOptions: (items: unknown[]) => Array<{ value: string; meta: string }>;
      matchesRequirementFilters: (item: unknown, filters: unknown) => boolean;
      toOpenRange: (range: [number, number], min: number, max: number) => unknown;
      scopeRequirementFilters: (
        filters: unknown,
        items: unknown[],
        options?: { keepCompleted?: boolean },
      ) => { statuses: string[]; locations: string[]; assignees: string[]; siteTypes: string[] };
    };

    // 필터 줄을 접었을 때 도구 줄에 보이는 수: 값이 걸린 알약의 개수와 같다
    assert.equal(countRequirementFilters(EMPTY_REQUIREMENT_FILTERS), 0);
    assert.equal(
      countRequirementFilters({
        ...EMPTY_REQUIREMENT_FILTERS,
        statuses: ['active', 'hold'],
        budget: { min: null, max: 10 },
        moveInFrom: '2027-01-01',
        moveInTo: '2027-02-28',
      }),
      3,
    );
    assert.equal(
      countRequirementFilters({ ...EMPTY_REQUIREMENT_FILTERS, moveInTo: '2027-02-28' }),
      1,
    );

    const base = {
      status: 'active',
      urgency: 'normal',
      transactionType: 'sale',
      siteTypes: ['apartment'],
      priceMin: 180000,
      priceMax: 220000,
      depositMin: null,
      depositMax: null,
      monthlyRentMin: null,
      monthlyRentMax: null,
      areaMin: 82.64,
      areaMax: 112.4,
      moveInDate: null,
      assignedToId: 'u1',
      assignedTo: { id: 'u1', name: '이담당' },
      preferredRegions: [
        { provinceCode: null, districtCode: '11740', wardCode: null, district: { code: '11740', name: '강동구' } },
      ],
      preferredSites: [{ siteId: 'site-1', site: { id: 'site-1', name: '고덕그라시움' } }],
    };
    const passes = (patch: Record<string, unknown>, item: Record<string, unknown> = base) =>
      matchesRequirementFilters(item, { ...EMPTY_REQUIREMENT_FILTERS, ...patch });

    // 예산: 억 단위 필터와 고객 범위가 겹치면 통과 (18억~22억)
    assert.equal(passes({ budget: { min: 20, max: 25 } }), true);
    assert.equal(passes({ budget: { min: 25, max: null } }), false);
    assert.equal(passes({ budget: { min: null, max: 15 } }), false);
    // 고객이 예산을 정하지 않았으면 걸리지 않는다
    assert.equal(
      passes({ budget: { min: 25, max: null } }, { ...base, priceMin: null, priceMax: null }),
      true,
    );
    // 월세 조건의 예산은 매매가가 아니라 보증금으로 비교한다
    const monthly = {
      ...base,
      transactionType: 'monthly',
      priceMin: null,
      priceMax: null,
      depositMin: 10000,
      depositMax: 20000,
      monthlyRentMax: 100,
    };
    assert.equal(passes({ budget: { min: 3, max: null } }, monthly), false);
    assert.equal(passes({ budget: { min: 1, max: 2 } }, monthly), true);
    // 월세 필터는 월세 조건에만 해당한다
    assert.equal(passes({ monthlyRent: { min: 50, max: 150 } }, monthly), true);
    assert.equal(passes({ monthlyRent: { min: 200, max: null } }, monthly), false);
    assert.equal(passes({ monthlyRent: { min: 50, max: 150 } }), false);

    // 평형: m² 저장값을 평으로 바꿔 비교 (25평~34평)
    assert.equal(passes({ area: { min: 30, max: 40 } }), true);
    assert.equal(passes({ area: { min: 35, max: null } }), false);
    // 132.23m²는 39.9996평이지만 화면에 40평으로 보이므로 40평대에 걸려야 한다
    assert.equal(passes({ area: { min: 40, max: 50 } }, { ...base, areaMax: 132.23 }), true);

    // 지역은 상하위를 함께 본다: 강동구 고객은 강동구·고덕동 어느 쪽으로도 걸린다
    assert.equal(passes({ locations: ['region:11740'] }), true);
    assert.equal(passes({ locations: ['region:1174010100'] }), true);
    assert.equal(passes({ locations: ['region:11710'] }), false);
    assert.equal(passes({ locations: ['site:site-1'] }), true);
    assert.equal(passes({ locations: ['site:other'] }), false);

    assert.equal(passes({ siteTypes: ['villa', 'apartment'] }), true);
    assert.equal(passes({ siteTypes: ['villa'] }), false);
    assert.equal(passes({ statuses: ['hold'] }), false);
    assert.equal(passes({ urgencies: ['normal'] }), true);
    assert.equal(passes({ assignees: ['u1'] }), true);
    assert.equal(passes({ assignees: ['none'] }), false);
    assert.equal(passes({ assignees: ['none'] }, { ...base, assignedToId: null }), true);

    // 입주일을 정하지 않은 조건은 기간 필터에서 빠진다
    assert.equal(passes({ moveInFrom: '2026-11-01' }), false);
    const withMoveIn = { ...base, moveInDate: '2026-12-15T12:00:00.000Z' };
    assert.equal(passes({ moveInFrom: '2026-11-01', moveInTo: '2026-12-31' }, withMoveIn), true);
    assert.equal(passes({ moveInTo: '2026-11-30' }, withMoveIn), false);

    // 슬라이더 양 끝은 제한 없음
    assert.equal(toOpenRange([0, 30], 0, 30), null);
    assert.deepEqual(toOpenRange([30, 30], 0, 30), { min: 30, max: null });
    assert.deepEqual(toOpenRange([0, 5], 0, 30), { min: null, max: 5 });

    // 선택지는 실제 조건에 있는 값만
    assert.deepEqual(
      getLocationFilterOptions([base]).map((option) => [option.value, option.meta]),
      [
        ['region:11740', '지역'],
        ['site:site-1', '단지'],
      ],
    );
    assert.deepEqual(
      getAssigneeFilterOptions([base, { ...base, assignedToId: null, assignedTo: null }]).map(
        (option) => option.label,
      ),
      ['이담당', '담당자 없음'],
    );

    // 목록에 없는 조건(완료)에만 있던 값은 목록을 비우지 않는다
    const stageOnlySelection = {
      ...EMPTY_REQUIREMENT_FILTERS,
      statuses: ['completed', 'hold'],
      locations: ['site:site-1', 'site:completed-only'],
      assignees: ['u1', 'completed-agent'],
      siteTypes: ['villa'],
    };
    const completed = {
      ...base,
      status: 'completed',
      assignedToId: 'completed-agent',
      assignedTo: { id: 'completed-agent', name: '퇴사자' },
      preferredSites: [{ siteId: 'completed-only', site: { id: 'completed-only', name: '완료단지' } }],
    };
    const buyerScoped = scopeRequirementFilters(stageOnlySelection, [base]);
    assert.deepEqual(buyerScoped.statuses, ['hold']);
    assert.deepEqual(buyerScoped.locations, ['site:site-1']);
    assert.deepEqual(buyerScoped.assignees, ['u1']);
    assert.deepEqual(buyerScoped.siteTypes, ['villa']);
    // 완료 조건이 목록에 있으면 선택이 그대로 적용된다
    const stageScoped = scopeRequirementFilters(stageOnlySelection, [base, completed]);
    assert.deepEqual(stageScoped.statuses, ['completed', 'hold']);
    assert.deepEqual(stageScoped.locations, ['site:site-1', 'site:completed-only']);
    assert.deepEqual(stageScoped.assignees, ['u1', 'completed-agent']);
    assert.match(matchesPageSource, /scopeRequirementFilters\(requirementFilters, requirements, \{/);
    // 완료 조건을 따로 받아 온 뒤에는 완료가 없어도 '완료' 선택을 그대로 둔다
    assert.deepEqual(
      scopeRequirementFilters(stageOnlySelection, [base], { keepCompleted: true }).statuses,
      ['completed', 'hold'],
    );
    assert.match(matchesPageSource, /filters=\{activeRequirementFilters\}/);
    assert.match(matchesPageSource, /requirementFilters: activeRequirementFilters/);

    // 희망 단지는 지역과 한 줄로 표시한다. 단지만 있으면 '지역 협의'를 쓰지 않는다
    const utilsModule =
      (await import('../src/renderer/routes/_authenticated/wanted-properties/-match-view-utils.ts')) as unknown as Record<
        string,
        unknown
      >;
    const { getBuyerRequirementSummaryParts } = (utilsModule.default ?? utilsModule) as {
      getBuyerRequirementSummaryParts: (item: unknown) => { placeText: string };
    };
    assert.equal(getBuyerRequirementSummaryParts(base).placeText, '강동구 · 고덕그라시움');
    assert.equal(
      getBuyerRequirementSummaryParts({ ...base, preferredRegions: [] }).placeText,
      '고덕그라시움',
    );
    assert.equal(
      getBuyerRequirementSummaryParts({ ...base, preferredSites: [] }).placeText,
      '강동구',
    );
    assert.equal(
      getBuyerRequirementSummaryParts({ ...base, preferredRegions: [], preferredSites: [] })
        .placeText,
      '지역 협의',
    );

    // 날짜 패널은 시작일과 종료일을 연달아 저장하므로 이전 값 위에 덮어쓰면 안 된다
    assert.match(
      wantedFilterBarSource,
      /onFiltersChange\(\(current\) => \(\{ \.\.\.current, \.\.\.patch \}\)\)/,
    );
    // 조건 필터는 희망 단지가 빠진 매칭 응답이 아니라 조건 목록으로 판정한다
    assert.doesNotMatch(matchesPageSource, /match\.buyerRequirement\b[^;]*matchesRequirementFilters/);

    // 필터 줄은 매물관리의 칩과 범위 패널을 그대로 쓴다. 모양은 문서관리와 같은 Notion형(soft) 알약이다
    for (const part of ['ToolbarFilterChip', 'NumericRangeFilterPanel']) {
      assert.match(wantedFilterBarSource, new RegExp(`<${part}`));
    }
    assert.match(wantedFilterBarSource, /numeric-range-filter/);
    // 필터를 "+ 필터" 메뉴에 숨기지 않는다: 열 개 모두 이 줄에 아이콘 알약으로 늘 보인다
    assert.doesNotMatch(wantedFilterBarSource, /AddFilterMenu|moreFilterItems/);
    const chips = wantedFilterBarSource.match(/<ToolbarFilterChip\b[\s\S]*?\n\s*>/g) ?? [];
    assert.equal(chips.length, 10);
    for (const chip of chips) {
      assert.match(chip, /shape="soft"/);
      assert.match(chip, /icon=\{</);
    }
    for (const label of ['단계', '지역·단지', '매물 유형', '월세', '희망 평형', '상태', '담당자', '긴급도', '입주 희망일']) {
      assert.match(wantedFilterBarSource, new RegExp(`label="${label}"\\s+shape="soft"`));
    }
    assert.match(wantedFilterBarSource, /label=\{budgetLabel\}\s+shape="soft"\s+icon=\{<WonCircleIcon \/>\}/);
    assert.match(
      wantedFilterBarSource,
      /data-wanted-filter-bar[\s\S]*className="flex shrink-0 items-start gap-2 border-b border-border bg-white px-3 py-2"[\s\S]*className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1\.5 gap-y-1"/,
    );
    assert.match(wantedFilterBarSource, /cn\(toolbarGhostButtonClassName, 'shrink-0 rounded-full'\)/);
  });

  it('shows both minimum and maximum buyer budgets in match summaries', async () => {
    const loaded =
      (await import('../src/renderer/routes/_authenticated/wanted-properties/-match-view-utils.ts')) as unknown as Record<
        string,
        unknown
      >;
    const matchViewUtils = (loaded.default ?? loaded) as {
      formatBudgetSummary: (requirement: Record<string, unknown>) => string;
    };

    assert.equal(
      matchViewUtils.formatBudgetSummary({
        transactionType: 'sale',
        priceMin: 230000,
        priceMax: 260000,
      }),
      '매매 23억 ~ 26억',
    );
    assert.equal(
      matchViewUtils.formatBudgetSummary({
        transactionType: 'jeonse',
        priceMin: 90000,
        priceMax: 130000,
      }),
      '전세 9억 ~ 13억',
    );
    assert.equal(
      matchViewUtils.formatBudgetSummary({
        transactionType: 'monthly',
        depositMin: 10000,
        depositMax: 20000,
        monthlyRentMax: 300,
      }),
      '월세 보증금 1억 ~ 2억 / 월 300만 이하',
    );
    // 월세도 범위로 적는다: 표의 칸에서 최소 월세를 고칠 수 있으므로 저장한 값이 그대로 보여야 한다
    assert.equal(
      matchViewUtils.formatBudgetSummary({
        transactionType: 'monthly',
        depositMax: 5000,
        monthlyRentMin: 80,
        monthlyRentMax: 120,
      }),
      '월세 보증금 5,000만 이하 / 월 80만 ~ 120만',
    );
    assert.equal(
      matchViewUtils.formatBudgetSummary({
        transactionType: 'monthly',
        monthlyRentMin: 80,
      }),
      '월세 보증금 협의 / 월 80만 이상',
    );
    assert.equal(
      matchViewUtils.formatBudgetSummary({ transactionType: 'monthly' }),
      '월세 보증금 협의 / 월 협의',
    );
    // 예산 칸은 넓은 창에서 200px까지만 넓어지고, 좁을 때에도 두 값 범위("9억 ~ 10억 5,000만")가 보이는 폭을 지킨다
    assert.match(matchGroupsSource, /minmax\(168px,212px\)/);
  });

  it('shows the desired supply area in the top buyer summary', async () => {
    const loaded =
      (await import('../src/renderer/routes/_authenticated/wanted-properties/-match-view-utils.ts')) as unknown as Record<
        string,
        unknown
      >;
    const matchViewUtils = (loaded.default ?? loaded) as {
      getBuyerRequirementSummaryParts: (
        requirement: Record<string, unknown>,
      ) => { areaText: string };
    };

    assert.equal(
      matchViewUtils.getBuyerRequirementSummaryParts({
        preferredRegions: [],
        siteTypes: ['apartment'],
        transactionType: 'sale',
        priceMin: 230000,
        priceMax: 260000,
        areaMin: 99.17,
        areaMax: 112.4,
      }).areaText,
      '30평 ~ 34평',
    );
  });

  it('separates the buyer summary from its property branches without another nested card', () => {
    assert.match(matchGroupsSource, /data-buyer-summary-header/);
    assert.match(matchGroupsSource, /expanded && matches\.length > 0 && 'border-b border-border'/);
    assert.match(matchGroupsSource, /className="border-b border-border bg-white"/);
    assert.doesNotMatch(
      matchGroupsSource,
      /overflow-hidden rounded-lg border border-border bg-background/,
    );
    assert.match(
      matchGroupsSource,
      /mb-3 ml-\[68px\] mr-3 mt-2 space-y-1 pl-12/,
    );
    assert.match(matchGroupsSource, /className="ml-\[78px\]"/);
  });

  it('nests property matches under each buyer with curved terminal-aware branches', () => {
    assert.match(matchGroupsSource, /data-buyer-match-group/);
    assert.match(matchGroupsSource, /data-match-branch-list/);
    assert.match(matchGroupsSource, /data-match-branch-trunk/);
    assert.match(matchGroupsSource, /data-match-branch/);
    assert.match(matchGroupsSource, /data-match-branch-connector/);
    assert.match(matchGroupsSource, /d="M0 0C0 18 14 32 32 32"/);
    assert.doesNotMatch(matchGroupsSource, /32 32H48/);
    assert.match(matchGroupsSource, /data-match-branch-end/);
    assert.match(
      matchGroupsSource,
      /isLast=\{index === sortedMatches\.length - 1\}/,
    );
    assert.doesNotMatch(
      matchGroupsSource,
      /<Building2 className="mt-0\.5 size-4/,
    );
    assert.match(
      matchGroupsSource,
      /aria-label=\{`\$\{buyerName\} 매칭 \$\{expanded \? '접기' : '펼치기'\}`\}/,
    );
  });

  it('keeps item selection in the customer table', () => {
    assert.match(
      matchesPageSource,
      /const \[selectedItemIds, setSelectedItemIds\]/,
    );
    // 단계별 보기의 고정 머리줄은 없앴다. 전체 선택은 표 머리의 체크박스, 해제는 아래 선택 작업 줄에 있다
    assert.doesNotMatch(matchesPageSource, /data-match-list-sticky-header|matches-select-all/);
    assert.match(matchGroupsSource, /aria-label="현재 매칭 목록 전체 선택"/);
    assert.match(matchesPageSource, /'indeterminate'/);
    assert.match(matchesPageSource, />\s*선택 해제\s*<\/button>/);

    assert.match(
      matchGroupsSource,
      /import \{ Checkbox \} from '@\/components\/ui\/checkbox'/,
    );
    assert.match(matchGroupsSource, /aria-label=\{`\$\{buyerName\} 선택`\}/);
    assert.match(matchGroupsSource, /data-match-selected/);
    assert.match(
      matchGroupsSource,
      /onDoubleClick=\{\(event\) => event\.stopPropagation\(\)\}/,
    );
  });

  it('edits each customer-view match memo inline with keyboard support', () => {
    assert.match(matchGroupsSource, /data-match-memo-trigger/);
    assert.match(matchGroupsSource, /<Input/);
    assert.match(
      matchGroupsSource,
      /actions\.onSaveMemo\(match, nextMemo \|\| null\)/,
    );
    assert.match(matchGroupsSource, /event\.key === 'Enter'/);
    assert.match(matchGroupsSource, /event\.key === 'Escape'/);
    assert.match(matchGroupsSource, /skipBlurSaveRef/);
    assert.match(matchGroupsSource, /void saveMemo\(\)/);
    assert.match(matchGroupsSource, /role="status"\s+aria-live="polite"/);
    assert.match(matchesPageSource, /const memoMutation = useMutation/);
    assert.match(matchesPageSource, /savingMemoId: memoMutation\.isPending/);
  });

  it('saves memo-only edits without replaying a stale match stage', () => {
    for (const source of [
      matchesPageSource,
      matchDetailSource,
      propertyMatchPanelSource,
    ]) {
      assert.match(
        source,
        /api\.matches\.updateMemo\(match\.id, \{[\s\S]*?memo,[\s\S]*?expectedUpdatedAt: match\.updatedAt/,
      );
      assert.doesNotMatch(
        source,
        /stage: normalizeMatchStage\(match\.stage\),\s*memo/,
      );
    }
    assert.doesNotMatch(
      matchesPageSource,
      /api\.matches\.updateStage\(id, \{ stage, memo \}\)/,
    );
  });

  it('keeps stage actions accessible while reducing pipeline chrome', () => {
    assert.match(matchBoardSource, /aria-label=\{`\$\{match\.buyerRequirement/);
    assert.match(
      matchBoardSource,
      /state === 'completed' && 'border-success\/35 bg-success-soft text-success/,
    );
    assert.match(
      matchBoardSource,
      /state === 'current' && 'border-info\/40 bg-info-soft text-info-strong ring-1 ring-info\/15/,
    );
  });

  it('uses stage-specific progress or close outcomes and colors final results semantically', () => {
    assert.match(matchViewUtilsSource, /progressLabel: '고객에게 제안'/);
    assert.match(matchViewUtilsSource, /closeLabel: '관심 없음 · 종료'/);
    assert.match(matchViewUtilsSource, /closeLabel: '임장 불가 · 종료'/);
    assert.match(matchViewUtilsSource, /closeLabel: '협상 결렬 · 종료'/);
    assert.match(matchViewUtilsSource, /match\.closedFromStage/);
    assert.match(matchViewUtilsSource, /return 'failed'/);
    assert.match(
      matchBoardSource,
      /state === 'failed' && 'border-destructive\/35 bg-destructive-soft text-destructive-strong'/,
    );
    assert.match(
      matchBoardSource,
      /isConverted && stage === MatchStage\.DEAL_CREATED && 'ring-2 ring-success\/25 ring-offset-1'/,
    );
    assert.match(
      statusConfigSource,
      /closed: \{ label: '종료', tone: 'destructive' \}/,
    );
    assert.doesNotMatch(matchBoardSource, /단계 변경<\/DropdownMenuLabel>/);
  });

  it('orders verified match outcomes before viewing and negotiation', () => {
    const buyerInterestIndex = matchViewUtilsSource.indexOf(
      'MatchStage.BUYER_INTERESTED',
    );
    const viewingConfirmedIndex = matchViewUtilsSource.indexOf(
      'MatchStage.VIEWING_CONFIRMED',
    );
    const viewingIndex = matchViewUtilsSource.indexOf('MatchStage.VIEWING,');

    assert.ok(buyerInterestIndex >= 0);
    assert.ok(viewingConfirmedIndex > buyerInterestIndex);
    assert.ok(viewingIndex > viewingConfirmedIndex);
    assert.match(statusConfigSource, /buyerInterested: \{ label: '고객 관심'/);
    assert.match(
      statusConfigSource,
      /viewingConfirmed: \{ label: '임장 조율'/,
    );
    // 방문을 마치면 협상이 아니라 고객 검토로 넘어간다
    assert.match(matchBoardSource, /onStageChange\(MatchStage\.BUYER_REVIEWING\)/);
    assert.doesNotMatch(matchBoardSource, /onStageChange\('ownerContacted'\)/);
  });

  it('explains and blocks missing listing confirmation before customer interest', () => {
    assert.match(matchViewUtilsSource, /getMatchStageBlockReason/);
    assert.match(
      matchViewUtilsSource,
      /매물 확인을 완료한 뒤 고객 관심 단계로 이동할 수 있습니다/,
    );
    assert.match(matchBoardSource, /role="alert"/);
    assert.match(matchBoardSource, /Boolean\(blockReason\)/);
  });
});
