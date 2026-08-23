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
  it('uses a people-centered team overview instead of a spreadsheet ledger', () => {
    assert.match(employeesPageSource, /data-employees-page/);
    assert.match(employeesPageSource, /data-employee-header/);
    assert.match(employeesPageSource, /data-employee-toolbar/);
    assert.match(employeesPageSource, /data-team-overview/);
    assert.match(employeesPageSource, /data-employee-roster/);
    assert.match(employeesPageSource, /팀 멤버/);
    assert.doesNotMatch(employeesPageSource, /<DataTable/);
    assert.doesNotMatch(employeesPageSource, /data-employee-inspector/);
  });

  it('gives every employee a substantial identity row with operational context', () => {
    assert.match(employeesPageSource, /function EmployeeGroup/);
    assert.match(employeesPageSource, /data-employee-row/);
    assert.match(
      employeesPageSource,
      /aria-label=\{`\$\{employee\.name\} 직원 상세 열기`\}/,
    );
    assert.match(employeesPageSource, /label="업무"/);
    assert.match(employeesPageSource, /label="고객"/);
    assert.match(employeesPageSource, /label="거래"/);
    assert.match(
      employeesPageSource,
      /미정산 \{employee\.counts\.unsettledDealCount\}/,
    );
  });

  it('keeps search and filters keyboard accessible and announces result changes', () => {
    assert.match(employeesPageSource, /<FilterSearch/);
    assert.equal((employeesPageSource.match(/<FilterSelect/g) ?? []).length, 2);
    assert.match(employeesPageSource, /role="group"/);
    assert.match(employeesPageSource, /aria-pressed=\{statusFilter/);
    assert.match(employeesPageSource, /aria-live="polite"/);
  });

  it('opens employee management as a dedicated full-width workspace', () => {
    assert.match(employeesPageSource, /data-employee-workspace/);
    assert.match(employeesPageSource, /function EmployeeWorkspace/);
    assert.match(employeesPageSource, /직원 목록/);
    assert.match(employeesPageSource, /onBack=\{closeEmployeeWorkspace\}/);
    assert.match(employeesPageSource, /selectedEmployeeId \? \(/);
    assert.match(employeesPageSource, /event\.key !== ["']Escape["']/);
    assert.match(employeesPageSource, /\[data-employee-row\]/);
  });

  it('separates account, workload and activity into focused shadcn tabs', () => {
    assert.match(employeesPageSource, /<Tabs[\s\S]*?defaultValue="profile"/);
    assert.match(employeesPageSource, /<TabsList[\s\S]*?variant="line"/);
    assert.match(employeesPageSource, /value="profile"/);
    assert.match(employeesPageSource, /value="work"/);
    assert.match(employeesPageSource, /value="activity"/);
    assert.match(employeesPageSource, /aria-label="직원 상세 구역"/);
    assert.equal((employeesPageSource.match(/<TabsContent/g) ?? []).length, 3);
  });

  it('balances sparse teams with a factual operations summary', () => {
    assert.match(employeesPageSource, /data-team-operations/);
    assert.match(employeesPageSource, />운영 요약</);
    assert.match(employeesPageSource, /직원 계정 슬롯 사용량/);
    assert.match(employeesPageSource, />현재 업무</);
    assert.match(employeesPageSource, />직원 정산</);
    assert.match(employeesPageSource, />권한 안내</);
  });

  it('shows employee compensation settings only for non-owner accounts', () => {
    assert.match(
      employeesPageSource,
      /employee\.role !== ["']owner["'][\s\S]*?title="급여와 배분"/,
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
