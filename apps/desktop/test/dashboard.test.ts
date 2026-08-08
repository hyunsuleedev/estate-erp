import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const dashboardSources = [
  readFileSync(resolve(testDir, '../src/renderer/routes/_authenticated/dashboard.tsx'), 'utf8'),
  readFileSync(resolve(testDir, '../../web/src/routes/_authenticated/dashboard.tsx'), 'utf8'),
];

describe('dashboard', () => {
  it('starts with operational widgets instead of duplicate action summary cards', () => {
    for (const source of dashboardSources) {
      assert.doesNotMatch(source, /function ActionCard|<ActionCard/);
      assert.doesNotMatch(source, /긴급 액션 레인|긴급 액션 카드/);
    }

    assert.match(dashboardSources[0], /<PendingTasksCard \/>/);
    assert.match(dashboardSources[0], /<TodayScheduleCard \/>/);
    assert.match(dashboardSources[0], /<RecentActivityCard \/>/);
    assert.match(dashboardSources[0], /<DealPipelineStrip \/>/);
  });
});
