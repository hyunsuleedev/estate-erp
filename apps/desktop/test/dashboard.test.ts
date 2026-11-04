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
/** 주석을 뺀 실행 코드 — '왜 그렇게 하지 않는지' 설명하는 주석이 금지어 검사에 걸리지 않게 한다. */
const dashboardCode = dashboardSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('dashboard', () => {
  it('starts with operational widgets instead of duplicate action summary cards', () => {
    assert.doesNotMatch(dashboardSource, /function ActionCard|<ActionCard/);
    assert.doesNotMatch(dashboardSource, /긴급 액션 레인|긴급 액션 카드/);

    assert.match(dashboardSource, /<KpiRow summary=/);
    assert.match(dashboardSource, /<AttentionList items=/);
    assert.match(dashboardSource, /<TodayCard\b/);
    assert.match(dashboardSource, /<PipelineCard deals=/);
  });

  it('fits on one screen by sizing lists to the remaining height instead of scrolling', () => {
    // 아래 영역은 탭 높이의 나머지를 채우고, 목록은 들어가는 행만 그린 뒤 '더 보기'로 넘긴다.
    assert.match(dashboardSource, /grid-rows-\[minmax\(0,1fr\)\]/);
    assert.match(dashboardSource, /new ResizeObserver\(measure\)/);
    assert.match(dashboardSource, /\.slice\(0, taskCapacity\)/);
    assert.match(dashboardSource, /\.slice\(0, eventCapacity\)/);
    assert.match(dashboardSource, /\.slice\(0, dealCapacity\)/);
    assert.doesNotMatch(dashboardCode, /RecentConsultationsCard|TASK_LIMIT|FOCUS_DEAL_LIMIT/);
    // 높이에 맞춰 자르는 건 행 목록뿐 — 오류·오프라인·빈 상태는 잘리지 않는 영역에 그려야
    // 작은 창에서도 '다시 시도' 버튼이 가려지지 않는다.
    assert.match(dashboardSource, /const STATUS_BODY = '[^']*'/);
    assert.doesNotMatch(dashboardSource.match(/const STATUS_BODY = '([^']*)'/)?.[1] ?? '', /overflow-hidden/);
    for (const name of ['eventStatus', 'taskStatus', 'status']) {
      assert.match(dashboardSource, new RegExp(`<div className=\\{STATUS_BODY\\}>\\{${name}\\}</div>`));
    }
  });

  it('does not merge differently-scoped commission amounts into a collection rate', () => {
    // collectedAmount(paidAt 이번달)와 expectedAmount(dueDate 이번달)는 모집단이 달라 비율이 성립하지 않는다.
    assert.doesNotMatch(dashboardCode, /수금률/);
    assert.doesNotMatch(dashboardCode, /collected \+ expected|collected \/ /);
  });

  it('never claims an all-clear when a source query failed or unverified count is zero', () => {
    assert.match(dashboardSource, /incomplete=\{attentionIncomplete\}/);
    assert.match(dashboardSource, /summary\.isError \|\| tasks\.isError \|\| deals\.isError/);
    assert.doesNotMatch(dashboardCode, /모두 확인됨/);
  });

  it('branches on isPending so an offline-paused query is never shown as an empty result', () => {
    // React Query v5: 오프라인 대기(paused)면 isLoading=false, isPending=true.
    assert.doesNotMatch(dashboardCode, /\.isLoading\b/);
    assert.match(dashboardSource, /attentionSources\.some\(isQueryPaused\)/);
    assert.match(dashboardSource, /<OfflineState/);
  });

  it('counts only overdue or stale deals under the delayed-deal label', () => {
    assert.match(dashboardSource, /state === 'overdue' \|\| state === 'stale'/);
    assert.doesNotMatch(dashboardCode, /\.isAtRisk\)\.length/);
  });

  it('reuses the deals page health rules instead of re-deriving deal risk', () => {
    assert.match(dashboardSource, /from '\.\/deals\/-deal-view-utils'/);
    assert.match(dashboardSource, /getDealPipelineHealth\(/);
    assert.match(dashboardSource, /sortDealsForDisplay\(/);
  });
});
