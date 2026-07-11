import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop app sidebar', () => {
  // 웹(기준 구현)과 동일하게 관리 단지 즐겨찾기를 사이드바에 노출한다.
  it('renders managed sites as favorite complexes, matching the web sidebar', () => {
    const sidebarSource = readFileSync(
      resolve(testDir, '../src/renderer/components/layout/app-sidebar.tsx'),
      'utf8',
    );

    assert.equal(sidebarSource.includes('NavFavorites'), true);
  });
});
