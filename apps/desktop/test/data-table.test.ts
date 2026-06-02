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
});
