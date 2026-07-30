import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

const contactRouteFiles = [
  'index.tsx',
  '$id.tsx',
  'new.tsx',
  '-group-chips.tsx',
  '-quick-sheet.tsx',
  '-detail-action-dialogs.tsx',
  '-detail-cards.tsx',
  '-detail-dialogs.tsx',
];

describe('desktop contacts pages', () => {
  for (const fileName of contactRouteFiles) {
    it(`matches the web implementation for ${fileName}`, () => {
      const desktopSource = readFileSync(
        resolve(testDir, '../src/renderer/routes/_authenticated/contacts', fileName),
        'utf8',
      );
      const webSource = readFileSync(
        resolve(testDir, '../../web/src/routes/_authenticated/contacts', fileName),
        'utf8',
      );

      assert.equal(desktopSource, webSource);
    });
  }
});
