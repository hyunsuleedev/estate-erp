import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/dashboard.tsx'),
  'utf8',
);

describe('dashboard', () => {
  it('starts with operational widgets instead of duplicate action summary cards', () => {
    assert.doesNotMatch(dashboardSource, /function ActionCard|<ActionCard/);
    assert.doesNotMatch(dashboardSource, /긴급 액션 레인|긴급 액션 카드/);

    assert.match(dashboardSource, /<PendingTasksCard \/>/);
    assert.match(dashboardSource, /<TodayScheduleCard \/>/);
    assert.match(dashboardSource, /<RecentActivityCard \/>/);
    assert.match(dashboardSource, /<DealPipelineStrip \/>/);
  });
});
