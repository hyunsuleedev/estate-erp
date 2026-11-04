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
const propertiesPageSource = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/properties/index.tsx'),
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
const statusConfigSource = readFileSync(
  resolve(testDir, '../src/renderer/lib/status-config.ts'),
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
      readFileSync(resolve(rendererDir, 'features/tabs/lib/routeMeta.ts'), 'utf8'),
      /"\/wanted-properties": \{ title: "희망매물"/,
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
    assert.match(matchesPageSource, /className="-m-4 flex min-h-0/);
    assert.doesNotMatch(matchesPageSource, /aria-label="매칭 요약"/);
    assert.doesNotMatch(matchesPageSource, /<PageHeader/);
    assert.doesNotMatch(
      matchesPageSource,
      /구매고객 조건과 매물을 연결해 제안부터 거래 전환까지 추적합니다/,
    );
  });

  it('keeps only customer and stage views beside the desktop filters', () => {
    assert.match(matchesPageSource, /<ToolbarPillToggle/);
    assert.match(matchesPageSource, /value: 'buyer', label: '고객별'/);
    assert.match(matchesPageSource, /value: 'stage', label: '단계별'/);
    assert.doesNotMatch(matchesPageSource, /viewMode === 'property'/);
    assert.doesNotMatch(matchesPageSource, /viewMode === 'list'/);
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
    assert.match(matchGroupsSource, /space-y-2/);
    assert.match(
      matchGroupsSource,
      /rounded-md border border-border bg-background/,
    );
    assert.match(
      matchGroupsSource,
      /onClick=\{\(\) => actions\.onOpenDetail\(match\.id\)\}/,
    );
    assert.match(matchGroupsSource, /aria-expanded=\{expanded\}/);
  });

  it('prioritizes readable buyer requirements over decorative initials', () => {
    assert.doesNotMatch(matchGroupsSource, /<Avatar/);
    assert.doesNotMatch(matchGroupsSource, /getInitials/);
    assert.match(matchGroupsSource, /data-buyer-summary-row/);
    assert.match(matchGroupsSource, /data-buyer-requirement-summary/);
    assert.match(matchGroupsSource, /data-buyer-requirement-details/);
    assert.doesNotMatch(matchGroupsSource, /md:grid-cols-3/);
    assert.match(
      matchGroupsSource,
      /label="희망 지역"[\s\S]*expanded && buyerRequirement\.memo[\s\S]*>고객 메모<\/dt>/,
    );
    assert.match(matchGroupsSource, /label="매물 유형"/);
    assert.match(matchGroupsSource, /label="희망 평형"/);
    assert.match(matchGroupsSource, /value=\{requirementSummary\.areaText\}/);
    assert.match(matchGroupsSource, /label="예산"/);
    assert.doesNotMatch(matchGroupsSource, /label="고객 메모"/);
    assert.match(matchGroupsSource, /expanded && buyerRequirement\.memo/);
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

  it('shares the property page header on the buyer view', () => {
    // 툴바: 매물관리 부품을 그대로 쓰고, 건수는 툴바에 다시 보여주지 않는다
    for (const part of [
      'ToolbarPillTabs',
      'ToolbarPillSearch',
      'ToolbarFilterChip',
      'ToolbarPillToggle',
    ]) {
      assert.match(matchesPageSource, new RegExp(`<${part}`));
    }
    assert.match(matchesPageSource, /\.\.\/properties\/-components\/property-toolbar/);
    assert.doesNotMatch(matchesPageSource, /FilterSearch|FilterSelect|MultiSelect/);
    assert.doesNotMatch(
      matchesPageSource,
      /\{filteredMatches\.length\.toLocaleString\(\)\}건\s*<\/p>/,
    );

    // 표: 맨 위 헤더가 칸 이름을 맡고, 헤더와 고객 행이 같은 칸 너비를 쓴다
    assert.match(matchesPageSource, /<BuyerMatchTableHeader/);
    assert.match(
      matchGroupsSource,
      /BUYER_TABLE_COLUMNS,\s*'sticky top-0 z-20 h-9 border-b border-border bg-\[#f7f7f5\]'/,
    );
    assert.match(
      matchGroupsSource,
      /data-buyer-summary-row\s*className=\{cn\(BUYER_TABLE_COLUMNS, 'min-h-10'\)\}/,
    );
    for (const label of ['고객', '연락처', '매물 유형', '희망 평형', '예산', '희망 지역', '매칭']) {
      assert.match(matchGroupsSource, new RegExp(`\\{ label: '${label}', icon:`));
    }
    assert.match(matchGroupsSource, /<dt className="sr-only">\{label\}<\/dt>/);

    // 하단: 건수·선택은 매물관리 표처럼 아래 줄에 둔다
    assert.match(matchesPageSource, /data-buyer-table-status/);
    assert.match(matchesPageSource, /고객 \{selectedVisibleItemCount\.toLocaleString\(\)\}명 선택/);
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
    assert.match(matchGroupsSource, /minmax\(140px,200px\)/);
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
    assert.match(matchGroupsSource, /expanded && 'border-b border-border'/);
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

  it('adds item selection with a sticky list header in both match views', () => {
    assert.match(
      matchesPageSource,
      /const \[selectedItemIds, setSelectedItemIds\]/,
    );
    assert.match(matchesPageSource, /data-match-list-sticky-header/);
    assert.match(matchesPageSource, /sticky -top-3 z-20/);
    assert.match(matchesPageSource, /id="matches-select-all"/);
    assert.match(matchesPageSource, /'indeterminate'/);
    assert.match(matchesPageSource, />\s*선택 해제\s*<\/Button>/);

    assert.match(
      matchGroupsSource,
      /import \{ Checkbox \} from '@\/components\/ui\/checkbox'/,
    );
    assert.match(matchGroupsSource, /aria-label=\{`\$\{buyerName\} 선택`\}/);
    assert.match(
      matchGroupsSource,
      /aria-label=\{`\$\{group\.label\} 매칭 전체 선택`\}/,
    );
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
      propertiesPageSource,
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
      /viewingConfirmed: \{ label: '임장 가능 확인'/,
    );
    assert.match(matchBoardSource, /onStageChange\(MatchStage\.NEGOTIATING\)/);
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
