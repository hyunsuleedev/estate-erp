import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop app sidebar', () => {
  it('does not render managed sites as favorite complexes', () => {
    const sidebarSource = readFileSync(
      resolve(testDir, '../src/renderer/components/layout/app-sidebar.tsx'),
      'utf8',
    );

    assert.equal(sidebarSource.includes('NavFavorites'), false);
  });
});
