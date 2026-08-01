import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const matchesPageSource = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/matches/index.tsx'),
  'utf8',
);
const matchGroupsSource = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/matches/-match-groups.tsx'),
  'utf8',
);
const matchBoardSource = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/matches/-match-board.tsx'),
  'utf8',
);

describe('desktop matches workbench', () => {
  it('uses a compact full-bleed workspace without a duplicate page header', () => {
    assert.match(matchesPageSource, /data-matches-page/);
    assert.match(matchesPageSource, /className="-m-4 flex min-h-0/);
    assert.match(matchesPageSource, /aria-label="매칭 요약"/);
    assert.doesNotMatch(matchesPageSource, /<PageHeader/);
    assert.doesNotMatch(
      matchesPageSource,
      /구매고객 조건과 매물을 연결해 제안부터 거래 전환까지 추적합니다/,
    );
  });

  it('keeps the original grouped view switch beside the filters', () => {
    assert.match(
      matchesPageSource,
      /variant=\{viewMode === 'buyer' \? 'secondary' : 'ghost'\}/,
    );
    assert.match(
      matchesPageSource,
      /variant=\{viewMode === 'property' \? 'secondary' : 'ghost'\}/,
    );
    assert.match(
      matchesPageSource,
      /variant=\{viewMode === 'stage' \? 'secondary' : 'ghost'\}/,
    );
    assert.match(
      matchesPageSource,
      /variant=\{viewMode === 'kanban' \? 'secondary' : 'ghost'\}/,
    );
    assert.match(matchesPageSource, />\s*고객별\s*<\/Button>/);
    assert.match(matchesPageSource, />\s*매물별\s*<\/Button>/);
    assert.match(matchesPageSource, />\s*단계별\s*<\/Button>/);
    assert.match(matchesPageSource, />\s*칸반\s*<\/Button>/);
  });

  it('uses dense document-like groups with explicit single-click detail links', () => {
    assert.match(matchGroupsSource, /space-y-2/);
    assert.match(matchGroupsSource, /rounded-md border border-border bg-background/);
    assert.match(matchGroupsSource, /onClick=\{\(\) => actions\.onOpenDetail\(match\.id\)\}/);
    assert.match(matchGroupsSource, /aria-expanded=\{expanded\}/);
  });

  it('prioritizes readable buyer requirements over decorative initials', () => {
    assert.doesNotMatch(matchGroupsSource, /<Avatar/);
    assert.doesNotMatch(matchGroupsSource, /getInitials/);
    assert.match(matchGroupsSource, /data-buyer-requirement-summary/);
    assert.match(matchGroupsSource, /label="희망 지역"/);
    assert.match(matchGroupsSource, /label="매물 유형"/);
    assert.match(matchGroupsSource, /label="예산"/);
    assert.match(matchGroupsSource, />고객 메모<\/span>/);
    assert.match(matchGroupsSource, /buyerRequirement\.urgency === 'urgent'/);
  });

  it('keeps stage actions accessible while reducing pipeline chrome', () => {
    assert.match(matchBoardSource, /aria-label=\{`\$\{match\.buyerRequirement/);
    assert.match(matchBoardSource, /state === 'completed' && 'text-success/);
    assert.match(matchBoardSource, /state === 'current' && 'bg-info-soft text-info'/);
    assert.match(matchBoardSource, /getMatchStageDotClass\(stage\)/);
  });
});
