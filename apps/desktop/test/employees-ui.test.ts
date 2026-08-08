import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const employeesPageSource = readFileSync(
  resolve(testDir, '../src/renderer/routes/_authenticated/employees/index.tsx'),
  'utf8',
);

describe('desktop employees workspace', () => {
  it('uses the app-wide full-bleed workbench instead of a dashboard of cards', () => {
    assert.match(employeesPageSource, /data-employees-page/);
    assert.match(
      employeesPageSource,
      /className="-m-4 flex min-h-0 min-w-0 flex-1/,
    );
    assert.match(employeesPageSource, /data-employee-toolbar/);
    assert.doesNotMatch(employeesPageSource, /<PageHeader/);
    assert.doesNotMatch(employeesPageSource, /function MetricTile/);
    assert.doesNotMatch(employeesPageSource, /function SectionPanel/);
  });

  it('keeps a compact filterable directory beside the selected employee document', () => {
    assert.match(employeesPageSource, /data-employee-directory/);
    assert.match(employeesPageSource, /data-employee-detail/);
    assert.match(employeesPageSource, /<FilterSearch/);
    assert.equal((employeesPageSource.match(/<FilterSelect/g) ?? []).length, 3);
    assert.match(employeesPageSource, /<AvatarBadge/);
    assert.match(
      employeesPageSource,
      /업무 \{employee\.counts\.activeTaskCount\}/,
    );
    assert.match(employeesPageSource, /employee\.counts\.activeDealCount/);
  });

  it('separates profile, work and activity into focused shadcn tabs', () => {
    assert.match(employeesPageSource, /<Tabs[\s\S]*?defaultValue="profile"/);
    assert.match(employeesPageSource, /<TabsList[\s\S]*?variant="line"/);
    assert.match(employeesPageSource, /<TabsTrigger value="profile"/);
    assert.match(employeesPageSource, /<TabsTrigger value="work"/);
    assert.match(employeesPageSource, /<TabsTrigger value="activity"/);
    assert.equal((employeesPageSource.match(/<TabsContent/g) ?? []).length, 3);
  });

  it('shows employee compensation settings only for non-owner accounts', () => {
    assert.match(
      employeesPageSource,
      /employee\.role !== 'owner'[\s\S]*?title="급여와 배분"/,
    );
  });

  it('preserves employee management mutations and keyboard access', () => {
    assert.match(employeesPageSource, /api\.employees\.create/);
    assert.match(employeesPageSource, /api\.employees\.update\(/);
    assert.match(employeesPageSource, /api\.employees\.updateRole/);
    assert.match(employeesPageSource, /api\.employees\.updateStatus/);
    assert.match(employeesPageSource, /api\.employees\.resetPassword/);
    assert.match(employeesPageSource, /event\.key === ["']\/["']/);
    assert.match(
      employeesPageSource,
      /event\.key\.toLowerCase\(\) === ["']n["']/,
    );
  });
});
