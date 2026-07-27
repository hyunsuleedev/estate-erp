import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop app sidebar', () => {
  // 웹(기준 구현)과 동일하게 사이드바에 관리 단지 즐겨찾기를 두지 않는다.
  it('does not render favorite complexes, matching the web sidebar', () => {
    const sidebarSource = readFileSync(
      resolve(testDir, '../src/renderer/components/layout/app-sidebar.tsx'),
      'utf8',
    );

    assert.equal(sidebarSource.includes('NavFavorites'), false);
  });

  it('does not render the office identity header', () => {
    const sidebarSource = readFileSync(
      resolve(testDir, '../src/renderer/components/layout/app-sidebar.tsx'),
      'utf8',
    );

    assert.equal(sidebarSource.includes('OfficeSwitcher'), false);
    assert.equal(sidebarSource.includes('SidebarHeader'), false);
  });

  it('uses the web sidebar information architecture and nested menu layout', () => {
    const navConfigSource = readFileSync(
      resolve(testDir, '../src/renderer/components/layout/nav-config.ts'),
      'utf8',
    );
    const navMainSource = readFileSync(
      resolve(testDir, '../src/renderer/components/nav-main.tsx'),
      'utf8',
    );

    for (const label of ['시작', '매물·공간', '고객·상담', '거래·계약', '업무·운영']) {
      assert.equal(navConfigSource.includes(`label: '${label}'`), true);
    }
    assert.equal(navConfigSource.includes("label: '매물관리'"), true);
    assert.equal(navConfigSource.includes("label: '매물 목록'"), true);
    assert.equal(navConfigSource.includes("label: '수수료/정산'"), true);
    assert.equal(navConfigSource.includes("label: '파트너 중개사'"), false);
    assert.equal(navMainSource.includes('<NavItemWithChildren'), true);
    assert.equal(navMainSource.includes('SidebarMenuAction'), true);
    assert.equal(navMainSource.includes('className="py-1"'), true);
    assert.equal(navMainSource.includes('className="h-7 px-2"'), true);
  });

  it('places the Estaitt brand before the titlebar sidebar trigger', () => {
    const layoutSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated.tsx'),
      'utf8',
    );

    const brandIndex = layoutSource.indexOf('data-slot="desktop-brand"');
    const spacerIndex = layoutSource.indexOf('data-slot="titlebar-brand-spacer"');
    const triggerIndex = layoutSource.indexOf('<SidebarTrigger');

    assert.ok(brandIndex !== -1, 'titlebar brand should exist');
    assert.ok(spacerIndex !== -1, 'titlebar brand spacer should exist');
    assert.ok(triggerIndex !== -1, 'sidebar trigger should exist');
    assert.ok(
      brandIndex < spacerIndex && spacerIndex < triggerIndex,
      'the flexible space should sit between Estaitt and the sidebar trigger',
    );
    assert.match(
      layoutSource,
      /w-\(--sidebar-width\)/,
      'titlebar controls should end at the expanded sidebar boundary',
    );
    assert.match(
      layoutSource,
      /isMac && !isFullscreen \? 'pl-\[92px\]' : 'pl-4'/,
      'macOS titlebar should leave breathing room after the 80px traffic-light area',
    );
    assert.match(
      layoutSource,
      /data-slot="titlebar-brand-spacer"[^>]*className="min-w-0 flex-1"/,
      'remaining titlebar space should be placed to the right of Estaitt',
    );
    assert.match(
      layoutSource,
      /<Separator[^>]*className="ml-1 mr-0/,
      'the titlebar separator should sit directly on that boundary',
    );
  });

  it('does not render global actions in the desktop titlebar', () => {
    const layoutSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated.tsx'),
      'utf8',
    );

    assert.equal(layoutSource.includes('GlobalSearch'), false);
    assert.equal(layoutSource.includes('NotificationBell'), false);
    assert.equal(layoutSource.includes('QuickCreate'), false);
  });
});
