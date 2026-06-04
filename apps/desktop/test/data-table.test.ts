import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop data table', () => {
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
      resolve(testDir, '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx'),
      'utf8',
    );

    assert.match(
      source,
      /className="[^"]*outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"/,
    );
  });

  it('scopes the property listing confirm pending state to the clicked intake row', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/properties/index.tsx'),
      'utf8',
    );

    assert.match(
      source,
      /confirmMutation\.isPending\s*&&\s*confirmMutation\.variables\?\.intakeId\s*===\s*row\.original\.representative\.id/,
    );
  });

  it('keeps property quick search controls in tab, site, dong, unit, integrated search order', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/properties/index.tsx'),
      'utf8',
    );

    const tabsIndex = source.indexOf('<Tabs value={selectedTransactionType}');
    const siteIndex = source.indexOf('placeholder="단지 검색"');
    const dongIndex = source.indexOf('placeholder="동"');
    const unitIndex = source.indexOf('placeholder="호"');
    const integratedSearchIndex = source.indexOf('placeholder="주소, 연락처, 메모"');
    const createIndex = source.indexOf('새 매물 등록');

    assert.ok(tabsIndex !== -1, 'transaction tabs should be rendered');
    assert.ok(siteIndex !== -1, 'site quick search should be rendered in the top row');
    assert.ok(integratedSearchIndex !== -1, 'integrated search should use the secondary-search placeholder');
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
      resolve(testDir, '../src/renderer/routes/_authenticated/properties/index.tsx'),
      'utf8',
    );

    assert.match(source, /label="지역"/);
    assert.doesNotMatch(source, /<FilterPopoverChip\s+label="시도"/);
    assert.doesNotMatch(source, /<FilterPopoverChip\s+label="시군구"/);
    assert.doesNotMatch(source, /<FilterPopoverChip\s+label="법정동"/);
  });

  it('adds a map view toggle to property management', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/properties/index.tsx'),
      'utf8',
    );

    assert.match(source, /type PropertyViewMode = 'list' \| 'map'/);
    assert.match(source, /<ViewModeSwitch value=\{viewMode\} onChange=\{setViewMode\} \/>/);
    assert.match(source, /viewMode === 'list'/);
    assert.match(source, /<PropertyMapView/);
    assert.match(source, /api\.listingIntakes\.map/);
    assert.match(source, /buildPropertyMapPoints\(mapGroups\)/);
    assert.match(source, /VITE_NAVER_MAPS_NCP_KEY_ID/);
    assert.match(source, /https:\/\/oapi\.map\.naver\.com\/openapi\/v3\/maps\.js\?ncpKeyId=/);
    assert.match(source, /new mapsApi\.Map/);
    assert.match(source, /new mapsApi\.Marker/);
    assert.match(source, /buildPropertyMapClusters/);
    assert.match(source, /PROPERTY_MAP_CLUSTER_GRID_SIZE/);
  });

  it('selects site coordinates for property map view', () => {
    const source = readFileSync(
      resolve(testDir, '../../../apps/server/src/modules/listing-intakes/listing-intakes.service.ts'),
      'utf8',
    );

    const siteSelectIndex = source.indexOf('site: {');
    const latIndex = source.indexOf('lat: true', siteSelectIndex);
    const lngIndex = source.indexOf('lng: true', siteSelectIndex);
    const wardCodeIndex = source.indexOf('wardCode: true', siteSelectIndex);

    assert.ok(siteSelectIndex !== -1, 'property site select should exist');
    assert.ok(latIndex !== -1, 'property site select should include lat');
    assert.ok(lngIndex !== -1, 'property site select should include lng');
    assert.ok(latIndex < wardCodeIndex && lngIndex < wardCodeIndex, 'coordinates should be selected with the site summary fields');
  });

  it('adds a listing intake map endpoint for unpaginated map data', () => {
    const controllerSource = readFileSync(
      resolve(testDir, '../../../apps/server/src/modules/listing-intakes/listing-intakes.controller.ts'),
      'utf8',
    );
    const serviceSource = readFileSync(
      resolve(testDir, '../../../apps/server/src/modules/listing-intakes/listing-intakes.service.ts'),
      'utf8',
    );
    const apiClientSource = readFileSync(
      resolve(testDir, '../../../packages/api-client/src/modules/listing-intakes.ts'),
      'utf8',
    );

    assert.match(controllerSource, /@Get\('map'\)/);
    assert.ok(
      controllerSource.indexOf("@Get('map')") < controllerSource.indexOf("@Get(':id')"),
      'map route should be registered before id route',
    );
    assert.match(serviceSource, /findMapIntakes/);
    assert.match(serviceSource, /MAP_INTAKES_LIMIT/);
    assert.match(serviceSource, /buildMapSelect/);
    assert.match(apiClientSource, /ListingIntakesMapResponse/);
    assert.match(apiClientSource, /request<ListingIntakesMapResponse>\('\/listing-intakes\/map'/);
  });
});
