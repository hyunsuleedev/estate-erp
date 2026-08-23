import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const settingsPath = resolve(
  testDir,
  '../src/renderer/routes/_authenticated/settings/index.tsx',
);
const mcpPath = resolve(
  testDir,
  '../src/renderer/routes/_authenticated/settings/-mcp-card.tsx',
);
const navUserPath = resolve(testDir, '../src/renderer/components/nav-user.tsx');
const settingsSource = readFileSync(settingsPath, 'utf8');
const mcpSource = readFileSync(mcpPath, 'utf8');
const navUserSource = readFileSync(navUserPath, 'utf8');

describe('desktop settings workbench', () => {
  it('uses a searchable desktop settings rail with five focused categories', () => {
    assert.match(settingsSource, /data-settings-page/);
    assert.match(settingsSource, /<SettingsNavigation/);
    assert.match(settingsSource, /aria-label="설정 범주"/);
    assert.match(settingsSource, /aria-label="설정 검색"/);

    for (const sectionId of [
      'account',
      'office',
      'commission',
      'templates',
      'connections',
    ]) {
      assert.match(settingsSource, new RegExp(`id: '${sectionId}'`));
    }

    assert.match(settingsSource, /estate-erp:settings:v1:last-section/);
    assert.doesNotMatch(settingsSource, /<ExpenseSummaryCard/);
  });

  it('surfaces office-wide Naver identity without storing CP credentials', () => {
    assert.match(settingsSource, /네이버 매물등록 인증 아이디/);
    assert.match(settingsSource, /naverVerificationId: emptyToNull/);
    assert.match(settingsSource, /광고 플랫폼 로그인 정보는 이 앱에 저장하지 않습니다/);
    assert.doesNotMatch(settingsSource, /password.*cp|cp.*password/i);
  });

  it('treats closer bonus as money while validating percentage fields separately', () => {
    assert.match(settingsSource, /kind="money"/);
    assert.match(settingsSource, /kind === 'rate' \? '%' : '만원'/);
    assert.match(settingsSource, /const PERCENTAGE_FIELDS/);
    assert.match(settingsSource, /closerBonus < 0/);
    assert.doesNotMatch(settingsSource, /closerBonus[^\n]*> 100/);
  });

  it('tracks unsaved changes and keeps personal MCP keys available per account', () => {
    assert.match(settingsSource, /저장하지 않은 변경사항이 있습니다/);
    assert.match(settingsSource, /dirtySections/);
    assert.match(settingsSource, /<McpApiKeyCard \/>/);
    assert.match(mcpSource, /export function McpApiKeyCard\(\)/);
    assert.doesNotMatch(mcpSource, /canEdit/);
  });

  it('opens the account pane from the user menu', () => {
    assert.match(navUserSource, /to="\/settings"/);
    assert.match(navUserSource, /estate-erp:settings:v1:last-section/);
    assert.match(navUserSource, /"account"/);
  });
});
