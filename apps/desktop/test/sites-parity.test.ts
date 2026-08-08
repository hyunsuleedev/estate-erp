import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

const siteRouteFiles = [
  'index.tsx',
  '-expiry-board.tsx',
  '-multi-filter-dropdown.tsx',
  '-site-helpers.ts',
  '-unit-detail-dialog.tsx',
  '-unit-dialogs.tsx',
  '-unit-layout-board.tsx',
  '-unit-tasks-section.tsx',
];

describe('desktop managed sites page', () => {
  for (const fileName of siteRouteFiles) {
    it(`matches the web implementation for ${fileName}`, () => {
      const desktopSource = readFileSync(
        resolve(testDir, '../src/renderer/routes/_authenticated/sites', fileName),
        'utf8',
      );
      const webSource = readFileSync(
        resolve(testDir, '../../web/src/routes/_authenticated/sites', fileName),
        'utf8',
      );

      assert.equal(desktopSource, webSource);
    });
  }

  it('provides an optimistic favorite toggle and favorite-only list filter', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );

    assert.match(source, /api\.officeSites\.update\(id, \{ isFavorite: !isFavorite \}\)/);
    assert.match(source, /aria-label=\{favoritesOnly \? '즐겨찾기 필터 해제' : '즐겨찾기만 보기'\}/);
    assert.match(source, /officeSite\.isFavorite/);
    assert.match(source, /조건에 맞는 관리단지가 없습니다/);
    assert.match(source, /resetSiteFilters/);
  });

  it('replaces the duplicate site header with two-tier working filters', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );

    assert.doesNotMatch(source, /siteMetaLine/);
    assert.match(source, /1차 필터: 선택 범위 · 검색 · 보기 방식/);
    assert.match(source, /2차 필터: 호수별 CRM 등록 상태/);
    assert.match(source, /filterUnitsByRecordPresence/);
    assert.match(source, /label="소유자"/);
    assert.match(source, /label="세입자"/);
    assert.match(source, /label="등록 매물"/);
    assert.match(source, /label="상담"/);
  });

  it('loads and summarizes several selected dongs as one table scope', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );

    assert.match(source, /dongIds: selectedDongIds\.length > 0 \? selectedDongIds : undefined/);
    assert.match(source, /selectedDongIds\.length > 1/);
    assert.match(source, /`\$\{selectedDongIds\.length\}개 동`/);
    assert.doesNotMatch(source, /label="동"[\s\S]{0,300}selectionMode="single"/);
  });

  it('uses the compact property-table visual language for the unit list', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );

    assert.match(source, /variant="notion"/);
    assert.match(source, /rowHeight=\{40\}/);
    assert.match(source, /enableRowSelection/);
    assert.match(source, /UnitTableHeaderLabel/);
    assert.match(source, /unitListingTransactionMeta/);
    assert.match(source, /UnitTableEmptyCell/);
    assert.match(source, /getUnitOwnerContacts/);
    assert.match(source, /id: 'ownerName'/);
    assert.match(source, /label="소유자명"/);
    assert.match(source, /id: 'ownerPhone'/);
    assert.match(source, /label="소유자 전화번호"/);
    assert.match(source, /외 \{owners\.length - 1\}명/);
    assert.match(
      source,
      /const \[areUnitRelationshipColumnsCollapsed, setAreUnitRelationshipColumnsCollapsed\]\s*=\s*useState\(true\)/,
    );
    assert.match(
      source,
      /const UNIT_RELATIONSHIP_COLUMN_IDS = \['tenant', 'listing'\] as const/,
    );
    assert.match(source, /columnGroupControls=\{\[/);
    assert.match(source, /anchorColumnId: 'ownerPhone'/);
    assert.match(source, /label: '세입자·등록 매물'/);
    assert.match(
      source,
      /areUnitRelationshipColumnsCollapsed &&\s*UNIT_RELATIONSHIP_COLUMN_ID_SET\.has\(columnId\)/,
    );
  });
});
