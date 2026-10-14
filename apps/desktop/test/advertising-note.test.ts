import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop advertising note page', () => {
  it('batches nested ad-entry drafts under a chosen site', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/external-listings.tsx',
      ),
      'utf8',
    );

    const buttonHandler = source.slice(
      source.indexOf('const handleManualButtonClick'),
      source.indexOf('// 범위 카드 구성'),
    );
    const dialogSource = source.slice(
      source.indexOf('function ManualEntryDialog'),
    );
    const duplicateDraftSource = dialogSource.slice(
      dialogSource.indexOf('const openDuplicateDraft'),
      dialogSource.indexOf('const commitDraftToList'),
    );

    assert.match(buttonHandler, /setShowManualDialog\(true\)/);
    assert.doesNotMatch(source, /입력을 시작하려면 단지를 1개만 선택하세요/);
    assert.match(source, /defaultSiteId=\{scopeSiteId\}/);
    assert.doesNotMatch(source, /scopeSiteId \?\? selectedSiteIds\[0\]/);
    assert.match(dialogSource, /<DialogTitle>광고 입력<\/DialogTitle>/);
    assert.match(
      dialogSource,
      /단지와 거래유형을 고정한 뒤 광고를 하나씩 목록에 추가하세요/,
    );
    assert.match(dialogSource, /!form\.siteId \? \(/);
    assert.match(dialogSource, /먼저 단지를 선택하세요/);
    assert.match(dialogSource, /const \[drafts, setDrafts\] = useState/);
    assert.match(
      dialogSource,
      /const \[showDraftDialog, setShowDraftDialog\] = useState/,
    );
    assert.match(dialogSource, /<h3[^>]*>\s*입력 목록\s*<\/h3>/);
    assert.match(dialogSource, /open=\{showDraftDialog\}/);
    assert.match(dialogSource, /광고 1건 추가/);
    assert.match(dialogSource, /목록에 추가/);
    assert.match(dialogSource, /const commitDraftToList = \(\) =>/);
    assert.match(dialogSource, /const openDraftForEditing =/);
    assert.match(dialogSource, /const openDuplicateDraft =/);
    assert.match(
      duplicateDraftSource,
      /createInitialForm\(draft\.siteId, draft\.transactionType\)/,
    );
    for (const field of ['dongId', 'ho', 'siteUnitTypeId', 'direction']) {
      assert.match(
        duplicateDraftSource,
        new RegExp(`${field}: draft\\.${field}`),
      );
    }
    assert.doesNotMatch(
      duplicateDraftSource,
      /(?:price|deposit|monthlyRent|realtorName|representativeTelNo|articleFeatureDesc|articleNo): draft\./,
    );
    assert.match(dialogSource, /중복매물 추가/);
    assert.match(dialogSource, /중복매물로 추가/);
    assert.match(
      dialogSource,
      /disabled=\{[\s\S]*?drafts\.length >= MAX_MANUAL_ENTRY_DRAFTS[\s\S]*?\}[\s\S]*?openDuplicateDraft\(draft\)/,
    );
    assert.match(dialogSource, /const removeDraft =/);
    assert.match(dialogSource, /disabled=\{drafts\.length > 0\}/);
    assert.match(source, /const MAX_MANUAL_ENTRY_DRAFTS = 3_000/);
    assert.match(source, /const EXTERNAL_LISTING_BATCH_SIZE = 100/);
    assert.match(dialogSource, /const listings = drafts\.map\(\(draft\) =>/);
    assert.match(dialogSource, /useVirtualizer\(\{/);
    assert.match(dialogSource, /count: drafts\.length/);
    assert.match(
      dialogSource,
      /offset \+= EXTERNAL_LISTING_BATCH_SIZE[\s\S]*?listings\.slice\([\s\S]*?offset \+ EXTERNAL_LISTING_BATCH_SIZE[\s\S]*?batchUpsert\(/,
    );
    assert.match(dialogSource, /setSubmittedCount\(/);
    assert.match(
      dialogSource,
      /disabled=\{drafts\.length >= MAX_MANUAL_ENTRY_DRAFTS\}/,
    );
    assert.doesNotMatch(dialogSource, /한 번에 최대 100건/);
    assert.match(dialogSource, /drafts\.length === 0/);
    assert.match(
      dialogSource,
      /getActiveSession\(form\.siteId, form\.transactionType\)/,
    );
    assert.match(
      dialogSource,
      /if \(!entrySession\) \{[\s\S]*?createSession\(\{[\s\S]*?siteId: form\.siteId/,
    );
    assert.match(
      dialogSource,
      /`\$\{drafts\.length\.toLocaleString\('ko-KR'\)\}건 시작하고 등록`/,
    );
  });

  it('uses the agreed sortable column order and own-ad publication date', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/external-listings.tsx',
      ),
      'utf8',
    );
    const columnSource = source.slice(
      source.indexOf('function buildColumns'),
      source.indexOf('// ── Property-table style text editors'),
    );
    const discoveryStatusColumnSource = columnSource.slice(
      columnSource.indexOf("id: 'discoveryStatus'"),
      columnSource.indexOf("id: 'myAd'"),
    );
    const myAdColumnSource = columnSource.slice(
      columnSource.indexOf("id: 'myAd'"),
      columnSource.indexOf("id: 'owner'"),
    );
    const orderedColumnIds = [
      'discoveryStatus',
      'myAd',
      'owner',
      'site',
      'dong',
      'ho',
      'floor',
      'type',
      'area',
      'duplicate',
      'price',
      'priceMin',
      'priceMax',
      'direction',
      'features',
      'memo',
    ];

    let previousIndex = -1;
    for (const columnId of orderedColumnIds) {
      const columnIndex = columnSource.indexOf(`id: '${columnId}'`);
      assert.ok(
        columnIndex > previousIndex,
        `${columnId} column should be in order`,
      );
      previousIndex = columnIndex;
    }

    assert.match(discoveryStatusColumnSource, /label="상태"/);
    assert.match(discoveryStatusColumnSource, /size: 58/);
    assert.match(
      discoveryStatusColumnSource,
      /DISCOVERY_STATUS_META\[status\]/,
    );
    for (const label of ['신규', '추가', '기존']) {
      assert.match(source, new RegExp(`label: '${label}'`));
    }
    assert.match(
      discoveryStatusColumnSource,
      /ariaLabel=\{`수집 상태 \$\{meta\.label\}\. \$\{meta\.description\}`\}/,
    );
    assert.match(myAdColumnSource, /label="광고"/);
    assert.doesNotMatch(myAdColumnSource, /label="내광고"/);
    assert.match(columnSource, /group\.ownAdvertisementYmd/);
    assert.match(columnSource, /id: 'myAd',[\s\S]*?size: 68/);
    assert.match(
      source,
      /function formatMonthDay[\s\S]*const month = Number\(dateStr\.slice\(4, 6\)\)[\s\S]*const day = Number\(dateStr\.slice\(6, 8\)\)[\s\S]*return `\$\{month\}\/\$\{day\}`/,
    );
    assert.match(
      columnSource,
      /const postedAt = formatMonthDay\(group\.ownAdvertisementYmd\)/,
    );
    assert.match(
      myAdColumnSource,
      /rounded-\[4px\] bg-\[#e7f3f8\][\s\S]*?tabular-nums text-\[#337ea9\]/,
    );
    assert.match(
      myAdColumnSource,
      /size-1\.5 shrink-0 rounded-full bg-\[#529cca\]/,
    );
    assert.doesNotMatch(myAdColumnSource, /<NotionTag/);
    assert.doesNotMatch(myAdColumnSource, /title=/);
    assert.match(
      myAdColumnSource,
      /aria-label="내 광고 없음"[\s\S]*?rounded-\[4px\] bg-\[#f1f1ef\][\s\S]*?text-\[#787774\][\s\S]*?size-1\.5 shrink-0 rounded-full bg-\[#b4b4b1\][\s\S]*?없음/,
    );
    assert.doesNotMatch(
      columnSource,
      /광고 O|광고 X|mainExternalListing\?\.isActive/,
    );
    assert.match(
      source,
      /if \(onlyAd && !formatMonthDay\(g\.ownAdvertisementYmd\)\) return false/,
    );
    assert.match(
      columnSource,
      /id: 'owner',[\s\S]*?label="주인"[\s\S]*?size: 62[\s\S]*?ownerVerified \? '집주인' : '중개사'/,
    );
    assert.match(
      columnSource,
      /id: 'type',[\s\S]*?label="타입"[\s\S]*?size: 64[\s\S]*?row\.original\.areaName/,
    );
    assert.match(
      columnSource,
      /id: 'area',[\s\S]*?label="면적"[\s\S]*?size: 72[\s\S]*?exclusiveAreaM2[\s\S]*?supplyAreaM2[\s\S]*?areaLabel/,
    );
    assert.match(columnSource, /id: 'direction',[\s\S]*?label="방향"/);
    assert.doesNotMatch(columnSource, /id: 'registrationDate'/);
    assert.match(columnSource, /label="랭킹"/);
    assert.match(
      columnSource,
      /id: 'priceMin',[\s\S]*?label=\{transactionType === 'monthly' \? '최소보증금' : '최소가'\}/,
    );
    assert.match(
      columnSource,
      /id: 'priceMax',[\s\S]*?label=\{transactionType === 'monthly' \? '최대보증금' : '최대가'\}/,
    );
    assert.doesNotMatch(
      columnSource,
      /id: '(?:status|minMax|dates|realtor|link)'/,
    );
    assert.match(
      source,
      /pinnedColumns=\{\[\s*'discoveryStatus',\s*'myAd',\s*'owner',\s*'site',\s*'dong',\s*'ho',\s*\]\}/,
    );
    assert.match(source, /sorting=\{sorting\}/);
    assert.match(source, /onSortingChange=\{setSorting\}/);
    assert.match(
      columnSource,
      /id: 'ho',[\s\S]*?initial=\{row\.original\.ho\}[\s\S]*?onSave=\{ctx\.onUpdateHo\}/,
    );
    assert.doesNotMatch(
      source,
      /UnitLinkPopover|onLinkUnit|linkUnitMutation|호실\(Unit\) 연결|호실 연결 해제|inferredHo/,
    );
    assert.match(
      source,
      /<Label className="text-xs">호수<\/Label>[\s\S]*?placeholder="예: 1503호"[\s\S]*?value=\{form\.ho\}/,
    );
    assert.match(source, /ho: draft\.ho\.trim\(\) \|\| null/);
  });

  it('uses icon-labeled headers and the property-list typographic hierarchy', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/external-listings.tsx',
      ),
      'utf8',
    );
    const columnSource = source.slice(
      source.indexOf('function buildColumns'),
      source.indexOf('// ── Property-table style text editors'),
    );
    const iconNames = [
      'Building2',
      'Hash',
      'Layers3',
      'DoorOpen',
      'Tag',
      'Ruler',
      'CircleDot',
      'Megaphone',
      'UserRound',
      'ListOrdered',
      'CircleDollarSign',
      'TrendingDown',
      'TrendingUp',
      'Compass',
      'FileText',
    ];

    assert.match(source, /data-advertising-note-header-label/);
    assert.equal(
      (columnSource.match(/<TableHeaderLabel/g) ?? []).length,
      16,
      'every data column should use an icon-labeled header',
    );
    for (const iconName of iconNames) {
      assert.match(
        columnSource,
        new RegExp(`icon=\\{<${iconName} className="size-4" \\/>\\}`),
      );
    }

    assert.match(columnSource, /text-\[14px\] font-semibold text-slate-900/);
    assert.match(
      columnSource,
      /whitespace-nowrap text-\[13px\] font-semibold tabular-nums text-slate-950/,
    );
    const editableCellSource = source.slice(
      source.indexOf('// ── Property-table style text editors'),
      source.indexOf('function formatListingPrice'),
    );
    assert.match(source, /<CellEditProvider>/);
    assert.match(
      editableCellSource,
      /text-\[13px\] font-medium tabular-nums text-slate-800/,
    );
    assert.match(
      editableCellSource,
      /w-full truncate text-\[13px\] text-slate-700/,
    );
    assert.equal(
      (editableCellSource.match(/<EditableCell/g) ?? []).length,
      2,
      'ho and memo should use the shared property-table editor',
    );
    assert.equal(
      (editableCellSource.match(/activation="doubleClick"/g) ?? []).length,
      2,
      'editable values should enter edit mode on double click',
    );
    assert.equal(
      (editableCellSource.match(/editorChrome="floating"/g) ?? []).length,
      2,
      'editable values should use the property-table floating editor',
    );
    assert.doesNotMatch(editableCellSource, /<Input/);
  });

  it('matches the property-list filter hierarchy and keeps only secondary market details collapsible', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/external-listings.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/data-table.tsx'),
      'utf8',
    );
    assert.match(pageSource, /data-advertising-note-primary-filters/);
    assert.match(pageSource, /data-advertising-note-secondary-filters/);
    assert.match(
      pageSource,
      /className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white"/,
      'advertising note filters should start at the same top edge as the property list',
    );
    assert.match(pageSource, /enableRowSelection/);
    assert.match(pageSource, /rowHeight=\{40\}/);
    assert.doesNotMatch(pageSource, /rowHeight="auto"/);
    assert.doesNotMatch(
      pageSource,
      /onlyFavorite|FavoriteToggle|label="즐겨찾기"|renderSelectionAccessory/,
    );

    const tabsIndex = pageSource.indexOf('<TabsList');
    const siteIndex = pageSource.indexOf('placeholder="단지 전체"');
    const dongIndex = pageSource.indexOf('ariaLabel="동 필터"');
    const unitIndex = pageSource.indexOf('ariaLabel="호 필터"');
    const searchIndex = pageSource.indexOf('ariaLabel="광고노트 통합 검색"');

    assert.ok(
      tabsIndex < siteIndex &&
        siteIndex < dongIndex &&
        dongIndex < unitIndex &&
        unitIndex < searchIndex,
      'quick filters should follow the property-list priority order',
    );

    assert.match(
      pageSource,
      /const \[areMarketDetailColumnsCollapsed, setAreMarketDetailColumnsCollapsed\]\s*=\s*useState\(true\)/,
    );
    assert.match(
      pageSource,
      /const MARKET_DETAIL_COLUMN_IDS = \[\s*'priceMin',\s*'priceMax',\s*'direction',\s*'features',\s*\] as const/,
    );
    assert.doesNotMatch(pageSource, /isMemoColumnCollapsed|MEMO_COLUMN_IDS/);
    assert.match(pageSource, /columnGroupControls=\{\[/);
    assert.match(pageSource, /anchorColumnId: 'price'/);
    assert.match(pageSource, /label: '최소가–매물특징'/);
    assert.match(
      pageSource,
      /setSorting\(\(previous\) =>\s*previous\.some\(\(\{ id \}\) =>\s*MARKET_DETAIL_COLUMN_ID_SET\.has\(id\)/,
    );
    assert.match(
      pageSource,
      /areMarketDetailColumnsCollapsed &&\s*MARKET_DETAIL_COLUMN_ID_SET\.has\(columnId\)/,
    );
    assert.match(pageSource, /id: 'features',[\s\S]*?label="매물특징"/);
    assert.match(
      pageSource,
      /id: 'memo',[\s\S]*?label="내 메모"[\s\S]*?meta: \{[\s\S]*?fill: true,[\s\S]*?cellClassName: 'hover:bg-muted\/50'/,
    );

    assert.match(tableSource, /data-data-table-column-guide/);
    assert.match(tableSource, /data-data-table-column-group-toggle/);
    assert.match(tableSource, /columnGroupLayouts\.map/);
    assert.match(tableSource, /aria-expanded=\{!control\.collapsed\}/);
    assert.match(tableSource, /hasColumnGroupGuide \? 'top-9' : 'top-0'/);
  });

  it('expands ranking details inline like the property advertisement column', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/external-listings.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/data-table.tsx'),
      'utf8',
    );
    const rankPanelSource = pageSource.slice(
      pageSource.indexOf('function ExternalListingRankPanel'),
      pageSource.indexOf('function ConfirmDialog'),
    );

    assert.match(pageSource, /const \[expandedRankingRowIds,/);
    assert.match(pageSource, /expandedRowIds=\{expandedRankingRowIds\}/);
    assert.match(
      pageSource,
      /renderExpandedRow=\{\(group\) => \(\s*<ExternalListingRankPanel group=\{group\} \/>/,
    );
    assert.match(pageSource, /aria-expanded=\{isOpen\}/);
    assert.match(
      pageSource,
      /aria-controls=\{`external-listing-rank-panel-\$\{g\.id\}`\}/,
    );
    assert.match(pageSource, /function ExternalListingRankPanel/);
    assert.match(pageSource, /네이버 노출 순서 비교/);
    assert.doesNotMatch(pageSource, /function GroupListingsDialog/);
    assert.match(rankPanelSource, /min-w-\[620px\] max-w-\[720px\]/);
    assert.doesNotMatch(
      rankPanelSource,
      /listing\.isActive|광고 O|광고 X|listing\.articleNo|매물번호/,
    );

    assert.match(tableSource, /data-table-expanded-row/);
    assert.match(tableSource, /renderExpandedRow\(row\.original\)/);
  });
});
