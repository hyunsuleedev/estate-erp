import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopDetailSource = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/deals/-deal-detail.tsx'),
  'utf8',
);
const webDetailSource = readFileSync(
  resolve(testDir, '../../web/src/routes/_authenticated/deals/-deal-detail.tsx'),
  'utf8',
);

function assertDealDetailSheetScrolls(source: string, label: string) {
  assert.match(
    source,
    /className="w-\[calc\(100vw-40px\)\] max-w-none gap-0 overflow-hidden p-0 sm:w-\[740px\] sm:max-w-\[740px\]"/,
    `${label} SheetContent should clip to the viewport instead of owning overflow-y-auto`,
  );
  assert.match(
    source,
    /className="min-h-0 flex-1 overflow-y-auto bg-background"/,
    `${label} DealDetailPanel must be the flex child that actually scrolls`,
  );
  assert.doesNotMatch(
    source,
    /className="min-h-full overflow-hidden bg-background"/,
    `${label} DealDetailPanel must not clip inside a flex sheet or the sheet cannot scroll`,
  );
}

describe('deal detail sheet scroll', () => {
  it('lets the desktop sheet body scroll when content exceeds the viewport', () => {
    assertDealDetailSheetScrolls(desktopDetailSource, 'desktop');
  });

  it('lets the web sheet body scroll when content exceeds the viewport', () => {
    assertDealDetailSheetScrolls(webDetailSource, 'web');
  });
});
