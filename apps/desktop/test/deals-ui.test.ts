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

function assertDealDetailSheetScrolls(source: string, label: string) {
  // 거래 상세는 매물관리와 같은 오른쪽 패널이다. 패널은 넘치는 내용을 자르고(flex 열),
  // 그 안의 탭 내용 영역 하나만 스크롤한다.
  assert.match(
    source,
    /data-property-inspector[\s\S]*?className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col/,
    `${label} inspector should be a full-height flex column pinned to the right edge`,
  );
  assert.match(
    source,
    /role="tabpanel" className="min-h-0 flex-1 overflow-y-auto/,
    `${label} tab panel must be the flex child that actually scrolls`,
  );
  assert.doesNotMatch(
    source,
    /SheetContent/,
    `${label} deal detail must not go back to the overlay sheet`,
  );
}

describe('deal detail sheet scroll', () => {
  it('lets the desktop sheet body scroll when content exceeds the viewport', () => {
    assertDealDetailSheetScrolls(desktopDetailSource, 'desktop');
  });
});
