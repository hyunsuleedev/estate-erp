import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop advertising note page', () => {
  it('matches the web implementation', () => {
    const desktopSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/external-listings.tsx',
      ),
      'utf8',
    );
    const webSource = readFileSync(
      resolve(
        testDir,
        '../../web/src/routes/_authenticated/properties/external-listings.tsx',
      ),
      'utf8',
    );

    assert.equal(desktopSource, webSource);
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
      source.indexOf('// ── Inline ho'),
    );
    const orderedColumnIds = [
      'site',
      'dong',
      'floor',
      'ho',
      'type',
      'myAd',
      'owner',
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

    assert.match(columnSource, /label="내광고"/);
    assert.match(columnSource, /group\.ownAdvertisementYmd/);
    assert.match(columnSource, /id: 'myAd',[\s\S]*?size: 80/);
    assert.match(
      source,
      /function formatMonthDay[\s\S]*dateStr\.slice\(4, 6\)[\s\S]*dateStr\.slice\(6, 8\)/,
    );
    assert.match(
      columnSource,
      /const postedAt = formatMonthDay\(group\.ownAdvertisementYmd\)/,
    );
    assert.match(columnSource, />광고 X<\/span>/);
    assert.doesNotMatch(columnSource, /광고 O|mainExternalListing\?\.isActive/);
    assert.match(
      source,
      /if \(onlyAd && !formatMonthDay\(g\.ownAdvertisementYmd\)\) return false/,
    );
    assert.match(
      columnSource,
      /id: 'owner',[\s\S]*?label="주인"[\s\S]*?size: 72[\s\S]*?ownerVerified \? '집주인' : '중개사'/,
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
    assert.match(source, /pinnedColumns=\{\['site', 'dong', 'floor', 'ho'\]\}/);
    assert.match(source, /sorting=\{sorting\}/);
    assert.match(source, /onSortingChange=\{setSorting\}/);
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
      source.indexOf('// ── Inline ho'),
    );
    const iconNames = [
      'Building2',
      'Hash',
      'Layers3',
      'DoorOpen',
      'Ruler',
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
      14,
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
    assert.match(
      source,
      /text-\[13px\] font-medium text-slate-800 shadow-none tabular-nums/,
    );
    assert.match(
      source,
      /text-\[13px\] text-slate-700 shadow-none placeholder:text-transparent/,
    );
    assert.equal(
      (source.match(/md:text-\[13px\]/g) ?? []).length,
      2,
      'inline unit and memo inputs should remain 13px on desktop',
    );
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
      /id: 'memo',[\s\S]*?label="내 메모"[\s\S]*?meta: \{ fill: true \}/,
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

    assert.match(tableSource, /data-table-expanded-row/);
    assert.match(tableSource, /renderExpandedRow\(row\.original\)/);
  });
});
