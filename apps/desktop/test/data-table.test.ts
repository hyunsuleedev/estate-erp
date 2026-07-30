import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop data table', () => {
  it('lets an explicit fill column absorb remaining table width', () => {
    const tableSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/data-table.tsx'),
      'utf8',
    );
    const typesSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/types.ts'),
      'utf8',
    );

    assert.match(typesSource, /fill\?: boolean/);
    assert.match(
      tableSource,
      /const hasFillColumn = leafColumns\.some\([\s\S]*column\.columnDef\.meta\?\.fill/,
    );
    assert.match(
      tableSource,
      /width: hasFillColumn[\s\S]*\? `max\(100%, \$\{tableTotalSize\}px\)`[\s\S]*: tableTotalSize/,
    );
    assert.match(
      tableSource,
      /width: header\.column\.columnDef\.meta\?\.fill[\s\S]*\? undefined[\s\S]*: header\.getSize\(\)/,
    );
    assert.match(
      tableSource,
      /width: cell\.column\.columnDef\.meta\?\.fill[\s\S]*\? undefined[\s\S]*: cell\.column\.getSize\(\)/,
    );
  });

  it('removes the browser outline from the keyboard navigation scroller', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/data-table.tsx'),
      'utf8',
    );

    assert.match(
      source,
      /'relative w-full overflow-auto outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0'/,
    );
  });

  it('removes the browser outline from the property listings keyboard navigation scroller', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(
      source,
      /className="[^"]*outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"/,
    );
  });

  it('scopes the property listing confirm pending state to the clicked intake row', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(
      source,
      /confirmMutation\.isPending\s*&&\s*confirmMutation\.variables\?\.intakeId\s*===\s*row\.original\.representative\.id/,
    );
  });

  it('combines confirm action, date, and next-confirm columns into the web-style confirm column', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(
      source,
      /id: 'updatedAt'[\s\S]*?label="확인"[\s\S]*?<IntakeConfirmationCell/,
    );
    assert.match(source, /title="오늘로 확인 갱신"/);
    assert.doesNotMatch(source, /id: 'confirmAction'/);
    assert.doesNotMatch(source, /label="확인일"/);
    assert.doesNotMatch(source, /label="다음확인"/);
  });

  it('keeps the confirmation column within the compact property row height', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const confirmationCell = source.slice(
      source.indexOf('function IntakeConfirmationCell'),
      source.indexOf('function ListingPriceDepositStack'),
    );

    assert.match(
      confirmationCell,
      /className="flex h-8 min-w-0 items-center gap-1\.5"/,
    );
    assert.doesNotMatch(confirmationCell, /py-1/);
  });

  it('gives property controls precise press feedback without transition-all', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const cssSource = readFileSync(
      resolve(testDir, '../src/renderer/app.css'),
      'utf8',
    );

    assert.match(pageSource, /data-properties-page/);
    assert.match(
      cssSource,
      /:is\(\[data-properties-page\], \[data-property-quick-sheet\]\) :where\(button, \[data-slot="button"\]\)[\s\S]*?scale 140ms cubic-bezier\(0\.23, 1, 0\.32, 1\)/,
    );
    assert.match(
      cssSource,
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?active:hover[\s\S]*?scale: 0\.97/,
    );
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?scale: 1/,
    );
  });

  it('opens the property quick sheet in under 300ms and defers heavy content until motion completes', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const cssSource = readFileSync(
      resolve(testDir, '../src/renderer/app.css'),
      'utf8',
    );

    assert.match(
      pageSource,
      /const PROPERTY_QUICK_SHEET_OPEN_DURATION_MS = 280/,
    );
    assert.match(
      pageSource,
      /const PROPERTY_QUICK_SHEET_CONTENT_DELAY_MS = PROPERTY_QUICK_SHEET_OPEN_DURATION_MS \+ 20/,
    );
    assert.match(pageSource, /data-property-quick-sheet/);
    assert.match(
      cssSource,
      /\[data-property-quick-sheet\]\[data-state="open"\][\s\S]*?animation-duration: 280ms/,
    );
    assert.match(
      cssSource,
      /\[data-property-quick-sheet\]\[data-state="closed"\][\s\S]*?animation-duration: 180ms/,
    );
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-property-quick-sheet\]\[data-state="open"\][\s\S]*?animation-name: property-quick-sheet-fade-in/,
    );
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-property-quick-sheet\]\[data-state="closed"\][\s\S]*?animation-name: property-quick-sheet-fade-out/,
    );
  });

  it('removes the joint brokerage column from the desktop property table', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.doesNotMatch(source, /id: 'jointBrokerage'/);
    assert.doesNotMatch(source, /function JointBrokerageCell/);
  });

  it('does not show the quick-panel double-click hint above the desktop table', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.doesNotMatch(source, /행 더블클릭 시 빠른 확인 패널을 엽니다/);
  });

  it('places the row actions column immediately after the unit column', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    const unitColumnIndex = source.indexOf("id: 'unit'");
    const actionsColumnIndex = source.indexOf("id: 'actions'");
    const unitTypeColumnIndex = source.indexOf("id: 'unitType'");

    assert.ok(unitColumnIndex !== -1, 'unit column should exist');
    assert.ok(actionsColumnIndex !== -1, 'row actions column should exist');
    assert.ok(unitTypeColumnIndex !== -1, 'unit type column should exist');
    assert.ok(
      unitColumnIndex < actionsColumnIndex &&
        actionsColumnIndex < unitTypeColumnIndex,
      'row actions should be positioned between unit and unit type',
    );
    assert.match(
      source,
      /id: 'actions'[\s\S]*?size: 40,[\s\S]*?minSize: 40,[\s\S]*?maxSize: 40,[\s\S]*?cellClassName: 'px-0'/,
    );
    assert.match(
      source,
      /id: 'actions'[\s\S]*?header: \(\) => <span className="sr-only">작업<\/span>/,
    );
  });

  it('uses a spreadsheet-style control above the header to collapse columns from type through confirmation', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(
      pageSource,
      /const \[arePropertyDetailColumnsCollapsed, setArePropertyDetailColumnsCollapsed\] = useState\(true\)/,
    );
    assert.match(pageSource, /columnGroupControl=\{\{/);
    assert.match(tableSource, /data-column-group-toggle="property-details"/);
    assert.match(tableSource, /data-column-group-line="property-details"/);
    assert.match(
      tableSource,
      /aria-expanded=\{!columnGroupControl\.collapsed\}/,
    );
    assert.match(tableSource, /sticky left-\[462px\]/);
    assert.match(tableSource, /left-\[482px\][\s\S]*?w-\[404px\]/);
    assert.match(
      tableSource,
      /border-\[#9ba7a3\] bg-white[\s\S]*?text-\[#536b64\]/,
    );
    assert.doesNotMatch(
      tableSource,
      /border-slate-700 bg-slate-700 text-white/,
    );
    assert.match(
      tableSource,
      /columnGroupControl\.collapsed \? \([\s\S]*?<Plus className="size-3" \/>/,
    );
    assert.match(tableSource, /<Minus className="size-3" \/>/);
    assert.match(
      pageSource,
      /\.\.\.\(!arePropertyDetailColumnsCollapsed[\s\S]*?id: 'unitType'[\s\S]*?id: 'exclusiveArea'[\s\S]*?id: 'matching'[\s\S]*?id: 'advertisement'[\s\S]*?id: 'updatedAt'/,
    );
    assert.match(tableSource, /타입–확인 컬럼 펼치기/);
  });

  it('keeps the button fixed while the property detail guide follows native table scrolling', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );
    const cssSource = readFileSync(
      resolve(testDir, '../src/renderer/app.css'),
      'utf8',
    );

    assert.doesNotMatch(pageSource, /data-property-table-scroll-scope/);
    assert.match(
      tableSource,
      /data-property-table-scroller[\s\S]*?data-property-column-guide[\s\S]*?data-column-group-line="property-details"/,
    );
    assert.match(tableSource, /className="relative h-full pt-2"/);
    assert.match(
      tableSource,
      /data-column-group-cap="property-details"[\s\S]*?left-\[885px\] top-\[18px\][\s\S]*?h-2 w-px/,
    );
    assert.match(
      tableSource,
      /data-column-group-toggle="property-details"[\s\S]*?sticky left-\[462px\]/,
    );
    assert.doesNotMatch(
      cssSource,
      /timeline-scope: --property-table-horizontal/,
    );
    assert.doesNotMatch(
      cssSource,
      /scroll-timeline-name: --property-table-horizontal/,
    );
    assert.doesNotMatch(
      cssSource,
      /animation-timeline: --property-table-horizontal/,
    );
    assert.doesNotMatch(cssSource, /property-detail-group-(?:line|cap)-scroll/);
    assert.doesNotMatch(pageSource, /handlePropertyTableHorizontalScroll/);
    assert.doesNotMatch(tableSource, /onHorizontalScroll/);
  });

  it('keeps the property site column compact', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(source, /id: 'site'[\s\S]*?size: 240,/);
  });

  it('keeps the row actions column in the left sticky column group', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(
      source,
      /left: \['_select', 'info', 'site', 'dong', 'unit', 'actions'\]/,
    );
  });

  it('keeps pinned property cells above decorations from horizontally scrolled cells', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(source, /const PINNED_BODY_CELL_Z_INDEX = 10;/);
    assert.match(source, /zIndex: PINNED_BODY_CELL_Z_INDEX/);
  });

  it('uses a vertical ellipsis for the property row actions menu', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-property-intake-actions.tsx',
      ),
      'utf8',
    );

    assert.match(source, /<MoreVertical className="size-4 text-slate-500" \/>/);
    assert.match(source, /className="flex items-center justify-center"/);
    assert.doesNotMatch(
      source,
      /<MoreHorizontal className="size-4 text-slate-500" \/>/,
    );
    assert.doesNotMatch(source, /setHidden/);
    assert.doesNotMatch(source, /숨김 처리|숨김 해제|일괄 숨김/);
  });

  it('expands advertisement counts into the web-style detail row', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(pageSource, /const \[expandedAdRows, setExpandedAdRows\]/);
    assert.match(pageSource, /label="광고 현황"/);
    assert.match(pageSource, /광고 노출 \{adRows\.length\}개/);
    assert.match(pageSource, /renderExpandedRow=\{renderExpandedPropertyRow\}/);
    assert.equal(
      pageSource.match(/<ListingPanelToggle/g)?.length,
      2,
      'matching and advertisement counts should share the same expansion control',
    );
    assert.match(tableSource, /expandedRowIds\?: ReadonlySet<string>/);
    assert.match(tableSource, /data-expanded-row=\{row\.original\.id\}/);
    assert.match(tableSource, /renderExpandedRow\?\.\(row\.original\)/);
  });

  it('shows web-style match counts beside advertisements and expands their buyer requirements', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const clientSource = readFileSync(
      resolve(
        testDir,
        '../../../packages/api-client/src/modules/listing-intakes.ts',
      ),
      'utf8',
    );

    const matchingColumnIndex = pageSource.indexOf("id: 'matching'");
    const advertisementColumnIndex = pageSource.indexOf("id: 'advertisement'");
    const exclusiveAreaColumnIndex = pageSource.indexOf("id: 'exclusiveArea'");
    const updatedAtColumnIndex = pageSource.indexOf("id: 'updatedAt'");

    assert.ok(matchingColumnIndex !== -1, 'matching column should be rendered');
    assert.ok(
      advertisementColumnIndex !== -1,
      'advertisement column should be rendered',
    );
    assert.ok(
      exclusiveAreaColumnIndex !== -1,
      'exclusive area column should be rendered',
    );
    assert.ok(
      updatedAtColumnIndex !== -1,
      'confirmation column should be rendered',
    );
    assert.ok(
      exclusiveAreaColumnIndex < matchingColumnIndex &&
        matchingColumnIndex < advertisementColumnIndex &&
        advertisementColumnIndex < updatedAtColumnIndex,
      'matching and advertisement should sit directly after exclusive area',
    );
    assert.match(pageSource, /label="매칭"/);
    assert.match(pageSource, /label="연관 구매의뢰"/);
    assert.match(
      pageSource,
      /<span className="text-\[12\.5px\] font-semibold text-foreground">연관 구매의뢰<\/span>/,
    );
    assert.match(
      pageSource,
      /<StatusBadge kind="matchStage" status=\{match\.stage\} size="sm" \/>/,
    );
    assert.match(pageSource, /className="flex min-w-\[700px\] items-center"/);
    assert.match(pageSource, /data-match-stage-connector="true"/);
    assert.match(
      pageSource,
      /aria-current=\{isCurrent \? 'step' : undefined\}/,
    );
    assert.match(pageSource, /api\.matches\.updateStage/);
    assert.match(pageSource, /_count: listing\._count/);
    assert.match(clientSource, /_count\?: \{ matches: number \}/);
  });

  it('keeps property quick search controls in tab, site, dong, unit, integrated search order', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    const tabsIndex = source.indexOf('<Tabs value={selectedTransactionType}');
    const siteIndex = source.indexOf('placeholder="단지 전체"');
    const dongIndex = source.indexOf('placeholder="동"');
    const unitIndex = source.indexOf('placeholder="호"');
    const integratedSearchIndex = source.indexOf(
      'placeholder="주소, 연락처, 메모"',
    );
    const createIndex = source.indexOf(
      '<Plus className="size-3.5" />새 매물 등록',
    );

    assert.ok(tabsIndex !== -1, 'transaction tabs should be rendered');
    assert.ok(
      siteIndex !== -1,
      'site quick search should be rendered in the top row',
    );
    assert.ok(
      integratedSearchIndex !== -1,
      'integrated search should use the secondary-search placeholder',
    );
    assert.ok(
      tabsIndex < siteIndex &&
        siteIndex < dongIndex &&
        dongIndex < unitIndex &&
        unitIndex < integratedSearchIndex &&
        integratedSearchIndex < createIndex,
      'top row controls should follow the expected search priority',
    );
  });

  it('combines province district and ward filters into a single region popover', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(source, /label="지역"/);
    assert.doesNotMatch(source, /<FilterPopoverChip\s+label="시도"/);
    assert.doesNotMatch(source, /<FilterPopoverChip\s+label="시군구"/);
    assert.doesNotMatch(source, /<FilterPopoverChip\s+label="법정동"/);
  });

  it('exposes the NAVER property map through the list-to-map toggle', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(source, /type PropertyViewMode = 'list' \| 'map'/);
    assert.match(
      source,
      /const \[viewMode, setViewMode\] = useState<PropertyViewMode>\('list'\)/,
    );
    assert.match(
      source,
      /<ViewModeSwitch value=\{viewMode\} onChange=\{setViewMode\} \/>/,
    );
    assert.match(source, /function ViewModeSwitch/);
    assert.match(source, /aria-label="매물 보기 방식"/);
    assert.match(source, /aria-pressed=\{value === 'map'\}/);
    assert.match(source, /viewMode === 'list'/);
    assert.match(source, /<PropertyMapView/);
    assert.match(source, /api\.listingIntakes\.map/);
    assert.match(source, /buildPropertyMapPoints\(mapGroups\)/);
    assert.match(source, /VITE_NAVER_MAPS_NCP_KEY_ID/);
    assert.match(
      source,
      /https:\/\/oapi\.map\.naver\.com\/openapi\/v3\/maps\.js\?ncpKeyId=/,
    );
    assert.match(source, /new mapsApi\.Map/);
    assert.match(source, /new mapsApi\.Marker/);
    assert.match(source, /buildPropertyMapClusters/);
    assert.match(source, /PROPERTY_MAP_CLUSTER_GRID_SIZE/);
    assert.match(source, /buildPropertyMapClustersFromOffsets/);
    assert.match(source, /clusterRadius: PROPERTY_MAP_CLUSTER_GRID_SIZE/);
    assert.match(source, /placeholderData: keepPreviousData/);
    assert.match(source, /hasAutoFittedRef/);
  });

  it('selects site coordinates for property map view', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../../../apps/server/src/modules/listing-intakes/listing-intakes.service.ts',
      ),
      'utf8',
    );

    const siteSelectIndex = source.indexOf('site: {');
    const latIndex = source.indexOf('lat: true', siteSelectIndex);
    const lngIndex = source.indexOf('lng: true', siteSelectIndex);
    const wardCodeIndex = source.indexOf('wardCode: true', siteSelectIndex);

    assert.ok(siteSelectIndex !== -1, 'property site select should exist');
    assert.ok(latIndex !== -1, 'property site select should include lat');
    assert.ok(lngIndex !== -1, 'property site select should include lng');
    assert.ok(
      latIndex < wardCodeIndex && lngIndex < wardCodeIndex,
      'coordinates should be selected with the site summary fields',
    );
  });

  it('adds a listing intake map endpoint for unpaginated map data', () => {
    const controllerSource = readFileSync(
      resolve(
        testDir,
        '../../../apps/server/src/modules/listing-intakes/listing-intakes.controller.ts',
      ),
      'utf8',
    );
    const serviceSource = readFileSync(
      resolve(
        testDir,
        '../../../apps/server/src/modules/listing-intakes/listing-intakes.service.ts',
      ),
      'utf8',
    );
    const apiClientSource = readFileSync(
      resolve(
        testDir,
        '../../../packages/api-client/src/modules/listing-intakes.ts',
      ),
      'utf8',
    );

    assert.match(controllerSource, /@Get\('map'\)/);
    assert.ok(
      controllerSource.indexOf("@Get('map')") <
        controllerSource.indexOf("@Get(':id')"),
      'map route should be registered before id route',
    );
    assert.match(serviceSource, /findMapIntakes/);
    assert.match(serviceSource, /MAP_INTAKES_LIMIT/);
    assert.match(serviceSource, /buildMapSelect/);
    assert.match(apiClientSource, /ListingIntakesMapResponse/);
    assert.match(
      apiClientSource,
      /request<ListingIntakesMapResponse>\('\/listing-intakes\/map'/,
    );
  });
});
