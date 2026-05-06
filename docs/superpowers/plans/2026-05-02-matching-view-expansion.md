# Matching View Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `매물별` and `단계별` views to the Matches page while renaming the old list view to `전체`.

**Architecture:** Keep the current `/matches` API and derive all view data from the fetched Match list. Extract pure grouping helpers into a `-match-view-utils.ts` module, then reuse the same helper and component structure in web and desktop route files.

**Tech Stack:** React 19, TanStack Query/Router, TypeScript, Node test runner with `tsx`, shadcn/ui-compatible local components.

---

### Task 1: Match View Utilities

**Files:**
- Create: `apps/web/src/routes/_authenticated/matches/-match-view-utils.ts`
- Create: `apps/desktop/src/renderer/routes/_authenticated/matches/-match-view-utils.ts`
- Create: `apps/web/test/match-view-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/match-view-utils.test.ts` with tests that assert listing grouping, stage grouping, and empty group exclusion.

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getMatchListingGroups,
  getMatchStageGroups,
  matchStageGroups,
  type MatchViewListItem,
} from '../src/routes/_authenticated/matches/-match-view-utils';

describe('match view utilities', () => {
  it('groups matches by listing and sorts groups by updated match recency', () => {
    const groups = getMatchListingGroups([
      match({ id: 'a-old', listingId: 'listing-a', updatedAt: '2026-04-20T00:00:00.000Z' }),
      match({ id: 'b-new', listingId: 'listing-b', updatedAt: '2026-04-23T00:00:00.000Z' }),
      match({ id: 'a-new', listingId: 'listing-a', updatedAt: '2026-04-25T00:00:00.000Z' }),
    ]);

    assert.deepEqual(
      groups.map((group) => ({ listingId: group.listingId, matchIds: group.matches.map((item) => item.id) })),
      [
        { listingId: 'listing-a', matchIds: ['a-new', 'a-old'] },
        { listingId: 'listing-b', matchIds: ['b-new'] },
      ],
    );
    assert.deepEqual(groups[0].summary, { total: 2, active: 2, converted: 0, closed: 0 });
  });

  it('keeps dealCreated and closed out of active listing counts', () => {
    const groups = getMatchListingGroups([
      match({ id: 'active', listingId: 'listing-a', stage: 'viewing' }),
      match({ id: 'deal', listingId: 'listing-a', stage: 'dealCreated' }),
      match({ id: 'closed', listingId: 'listing-a', stage: 'closed' }),
    ]);

    assert.deepEqual(groups[0].summary, { total: 3, active: 1, converted: 1, closed: 1 });
  });

  it('builds stage groups in configured stage order and omits empty groups by default', () => {
    const groups = getMatchStageGroups([
      match({ id: 'negotiating', stage: 'negotiating' }),
      match({ id: 'suggested', stage: 'suggested' }),
    ]);

    assert.deepEqual(
      groups.map((group) => ({ stage: group.stage, rowNumbers: group.rows.map((row) => row.rowNumber), ids: group.rows.map((row) => row.match.id) })),
      [
        { stage: 'suggested', rowNumbers: [1], ids: ['suggested'] },
        { stage: 'negotiating', rowNumbers: [1], ids: ['negotiating'] },
      ],
    );
    assert.equal(matchStageGroups[0].stage, 'suggested');
    assert.equal(matchStageGroups.at(-1)?.stage, 'closed');
  });
});

function match(overrides: Partial<MatchViewListItem> = {}): MatchViewListItem {
  return {
    id: 'match',
    officeId: 'office',
    listingId: 'listing',
    propertyId: 'property',
    buyerReqId: 'buyer-req',
    stage: 'suggested',
    memo: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test apps/web/test/match-view-utils.test.ts
```

Expected: FAIL because `-match-view-utils.ts` does not exist.

- [ ] **Step 3: Implement the shared utility**

Create `apps/web/src/routes/_authenticated/matches/-match-view-utils.ts` and copy it to `apps/desktop/src/renderer/routes/_authenticated/matches/-match-view-utils.ts`.

```ts
import type { Match } from '@estate-erp/api-client';

export type MatchViewListItem = Match;

export type MatchStageGroupDefinition = {
  stage: string;
  label: string;
  dotClassName: string;
  isResult: boolean;
};

export type MatchListingGroup = {
  listingId: string;
  listing: MatchViewListItem['listing'] | null;
  matches: MatchViewListItem[];
  summary: {
    total: number;
    active: number;
    converted: number;
    closed: number;
  };
};

export type MatchStageRow = {
  rowNumber: number;
  match: MatchViewListItem;
};

export type MatchStageGroup = {
  stage: string;
  label: string;
  dotClassName: string;
  isResult: boolean;
  rows: MatchStageRow[];
};

export const matchStageGroups: MatchStageGroupDefinition[] = [
  { stage: 'suggested', label: '추천됨', dotClassName: 'bg-slate-500', isResult: false },
  { stage: 'buyerContacted', label: '구매자 관심', dotClassName: 'bg-sky-600', isResult: false },
  { stage: 'viewing', label: '방문', dotClassName: 'bg-violet-600', isResult: false },
  { stage: 'ownerContacted', label: '판매자 동의', dotClassName: 'bg-amber-600', isResult: false },
  { stage: 'negotiating', label: '조건 협의', dotClassName: 'bg-orange-600', isResult: false },
  { stage: 'dealCreated', label: '거래 전환', dotClassName: 'bg-emerald-600', isResult: true },
  { stage: 'closed', label: '종료', dotClassName: 'bg-zinc-500', isResult: true },
];

export function getMatchListingGroups(matches: MatchViewListItem[]): MatchListingGroup[] {
  const grouped = new Map<string, MatchListingGroup>();

  for (const match of matches) {
    const listingId = match.listingId || 'unassigned-listing';
    const existing = grouped.get(listingId);

    if (existing) {
      existing.matches.push(match);
      continue;
    }

    grouped.set(listingId, {
      listingId,
      listing: match.listing ?? null,
      matches: [match],
      summary: {
        total: 0,
        active: 0,
        converted: 0,
        closed: 0,
      },
    });
  }

  return Array.from(grouped.values())
    .map((group) => {
      const matchesForListing = sortMatchesByUpdatedAt(group.matches);

      return {
        ...group,
        matches: matchesForListing,
        summary: summarizeListingMatches(matchesForListing),
      };
    })
    .sort((left, right) => {
      const leftTime = getLatestUpdatedAt(left.matches);
      const rightTime = getLatestUpdatedAt(right.matches);
      return rightTime - leftTime;
    });
}

export function getMatchStageGroups(matches: MatchViewListItem[], includeEmpty = false): MatchStageGroup[] {
  return matchStageGroups
    .map((group) => {
      const stageMatches = sortMatchesByUpdatedAt(
        matches.filter((match) => match.stage === group.stage),
      );

      return {
        ...group,
        rows: stageMatches.map((match, index) => ({
          rowNumber: index + 1,
          match,
        })),
      };
    })
    .filter((group) => includeEmpty || group.rows.length > 0);
}

function summarizeListingMatches(matches: MatchViewListItem[]) {
  return matches.reduce(
    (summary, match) => {
      summary.total += 1;

      if (match.stage === 'dealCreated') {
        summary.converted += 1;
      } else if (match.stage === 'closed') {
        summary.closed += 1;
      } else {
        summary.active += 1;
      }

      return summary;
    },
    { total: 0, active: 0, converted: 0, closed: 0 },
  );
}

function sortMatchesByUpdatedAt(matches: MatchViewListItem[]) {
  return [...matches].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function getLatestUpdatedAt(matches: MatchViewListItem[]) {
  return matches.reduce(
    (latest, match) => Math.max(latest, new Date(match.updatedAt).getTime()),
    0,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec tsx --test apps/web/test/match-view-utils.test.ts
```

Expected: PASS.

### Task 2: Matches Page Views

**Files:**
- Modify: `apps/web/src/routes/_authenticated/matches/index.tsx`
- Modify: `apps/desktop/src/renderer/routes/_authenticated/matches/index.tsx`

- [ ] **Step 1: Extend imports and view mode**

Add `List`, `ListOrdered`, and helper imports. Change `MatchViewMode` to include `'property'` and `'stage'`.

- [ ] **Step 2: Add derived grouped data**

Add `groupedPropertyMatches` and `stageGroupedMatches` with `useMemo` from `filteredMatches`.

- [ ] **Step 3: Replace the view switcher**

Render buttons for `고객별`, `매물별`, `단계별`, `칸반`, and `전체`. The `전체` button should keep the internal mode value `list`.

- [ ] **Step 4: Add property view body**

Render `PropertyMatchGroup` when `viewMode === 'property'`. Empty state text is `매물별로 묶어 보여줄 매칭이 없습니다.`

- [ ] **Step 5: Add stage view body**

Render `StageMatchView` when `viewMode === 'stage'`. Empty state text is `조건에 맞는 단계별 매칭이 없습니다.`

- [ ] **Step 6: Rename list label**

Keep the existing table body but expose it through the `전체` tab.

- [ ] **Step 7: Mirror changes to desktop**

Copy the finalized web route file and helper file to the desktop renderer path because the two files are currently identical.

- [ ] **Step 8: Verify typecheck**

Run:

```bash
pnpm --filter @estate-erp/web typecheck
pnpm --filter @estate-erp/desktop typecheck
```

Expected: both commands pass.
