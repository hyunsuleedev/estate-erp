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
const wantedFilterBarSource = readFileSync(
  resolve(
    testDir,
    '../src/renderer/routes/_authenticated/wanted-properties/-wanted-filter-bar.tsx',
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
      /label="희망 지역·단지"[\s\S]*expanded && buyerRequirement\.memo[\s\S]*>고객 메모<\/dt>/,
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
    for (const part of ['ToolbarPillTabs', 'ToolbarPillSearch', 'ToolbarPillToggle']) {
      assert.match(matchesPageSource, new RegExp(`<${part}`));
    }
    assert.match(matchesPageSource, /<WantedFilterBar/);
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
    for (const label of ['고객', '연락처', '매물 유형', '희망 평형', '예산', '희망 지역·단지', '매칭']) {
      assert.match(matchGroupsSource, new RegExp(`\\{ label: '${label}', icon:`));
    }
    assert.match(matchGroupsSource, /<dt className="sr-only">\{label\}<\/dt>/);

    // 하단: 건수·선택은 매물관리 표처럼 아래 줄에 둔다
    assert.match(matchesPageSource, /data-buyer-table-status/);
    assert.match(matchesPageSource, /희망 조건 \{selectedVisibleItemCount\.toLocaleString\(\)\}건 선택/);
  });

  it('lists every open buyer requirement, including ones without a match', async () => {
    // 진행·보류 조건을 끝까지 불러오고, 어느 한쪽 조회가 실패하면 목록을 그리지 않는다
    assert.match(matchesPageSource, /fetchBuyerRequirements\('active,hold'\)/);
    assert.match(matchesPageSource, /page >= result\.pagination\.totalPages/);
    assert.match(
      matchesPageSource,
      /isMatchesError \|\|\s*isRequirementsError \|\|\s*\(viewMode === 'stage' && isCompletedError\)/,
    );
    // 매칭 없는 행에서 그 조건으로 고정해 매칭을 만든다
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
      EMPTY_REQUIREMENT_FILTERS,
      getAssigneeFilterOptions,
      getLocationFilterOptions,
      matchesRequirementFilters,
      scopeRequirementFilters,
      toOpenRange,
    } = (filtersModule.default ?? filtersModule) as {
      EMPTY_REQUIREMENT_FILTERS: Record<string, unknown>;
      getAssigneeFilterOptions: (items: unknown[]) => Array<{ value: string; label: string }>;
      getLocationFilterOptions: (items: unknown[]) => Array<{ value: string; meta: string }>;
      matchesRequirementFilters: (item: unknown, filters: unknown) => boolean;
      toOpenRange: (range: [number, number], min: number, max: number) => unknown;
      scopeRequirementFilters: (
        filters: unknown,
        items: unknown[],
      ) => { statuses: string[]; locations: string[]; assignees: string[]; siteTypes: string[] };
    };

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

    // 단계별 보기에서 고른 완료 조건 전용 값은 고객별 보기를 비우지 않는다
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
    // 단계별 보기에는 완료 조건이 있으므로 선택이 그대로 적용된다
    const stageScoped = scopeRequirementFilters(stageOnlySelection, [base, completed]);
    assert.deepEqual(stageScoped.statuses, ['completed', 'hold']);
    assert.deepEqual(stageScoped.locations, ['site:site-1', 'site:completed-only']);
    assert.deepEqual(stageScoped.assignees, ['u1', 'completed-agent']);
    assert.match(matchesPageSource, /scopeRequirementFilters\(requirementFilters, filterableRequirements\)/);
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
    // 단계별 보기의 조건 필터는 희망 단지가 빠진 매칭 응답이 아니라 조건 목록으로 판정한다
    assert.match(matchesPageSource, /fetchBuyerRequirements\('completed'\),\s*enabled: viewMode === 'stage'/);
    assert.match(matchesPageSource, /const requirement = requirementById\.get\(match\.buyerReqId\);/);
    assert.doesNotMatch(matchesPageSource, /requirementById\.get\(match\.buyerReqId\) \?\? match\.buyerRequirement/);

    // 필터 줄은 매물관리의 칩과 범위 패널을 그대로 쓴다
    for (const part of ['ToolbarFilterChip', 'NumericRangeFilterPanel', 'AddFilterMenu']) {
      assert.match(wantedFilterBarSource, new RegExp(`<${part}`));
    }
    assert.match(wantedFilterBarSource, /numeric-range-filter/);
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
