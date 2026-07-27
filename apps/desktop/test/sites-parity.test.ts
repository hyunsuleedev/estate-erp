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
});
