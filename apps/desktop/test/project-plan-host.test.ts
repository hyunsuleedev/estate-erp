import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../src/renderer/routes/_authenticated/${path}`, import.meta.url), 'utf8');

describe('project plan window', () => {
  const menu = read('customers/-customer-case-action-menu.tsx');
  const dialog = read('customers/-project-plan-dialog.tsx');

  it('is not owned by a ledger row: the row menu only asks the page-level host to open it', () => {
    // 줄 안에 창을 두면 원장이 다시 불러와져 줄이 새로 그려질 때 창과 입력이 사라진다.
    assert.doesNotMatch(menu, /useState/);
    assert.doesNotMatch(menu, /<Dialog|ProjectPlanHost|ProjectPlanDialog/);
    assert.match(menu, /openProjectPlan\(/);
    assert.match(dialog, /export function ProjectPlanHost\(\)/);
    assert.match(dialog, /useProjectPlanTarget\(\)/);
  });

  it('is mounted once on each customer screen, with a list that reaches projects missing from the ledger', () => {
    for (const page of ['customers/index.tsx', 'customers-table/index.tsx']) {
      const source = read(page);
      assert.equal(source.match(/<ProjectPlanHost \/>/g)?.length, 1, page);
      assert.match(source, /<ProjectListButton/, page);
    }
    assert.match(dialog, /api\.projects\.findAll\(\)/);
    // 묶을 때는 화면에 보이는 줄이 아니라 그 고객의 의뢰 전부를 보낸다.
    assert.match(dialog, /ledgerRow\.listingIntakeIds \?\?/);
    assert.match(dialog, /ledgerRow\.buyerIntakeIds \?\?/);
  });

  it('does not lose what is being typed', () => {
    // 저장 중에도 글 입력을 막지 않는다.
    const savedInput = dialog.slice(dialog.indexOf('function SavedInput('));
    assert.doesNotMatch(savedInput, /disabled=\{/);
    // 입력 칸을 서버 값이 바뀔 때마다 다시 만들지 않는다(key에 값을 넣지 않는다).
    assert.doesNotMatch(dialog, /<SavedInput\s+key=\{`/);
    // 고치는 중인 칸은 서버 값으로 덮어쓰지 않는다.
    assert.match(savedInput, /document\.activeElement === inputRef\.current/);
    // 단계 추가 칸은 보내는 즉시 비우고, 저장이 끝난 뒤에는 건드리지 않는다.
    assert.doesNotMatch(dialog, /onSuccess: \(\) => setNewStepTitle\(""\)/);
    // 다른 저장이 진행 중이라고 단계 추가를 막지 않는다(막으면 Enter가 조용히 무시된다).
    assert.doesNotMatch(dialog, /disabled=\{busy \|\| !newStepTitle/);
    assert.match(dialog, /setNewStepTitle\(\(current\) => current \|\| title\)/);
    // 글을 고치는 중의 Esc는 창을 닫지 않는다.
    assert.match(dialog, /onEscapeKeyDown=/);
    // 덜 채운 날짜는 저장된 목표일을 지우지 않는다.
    assert.match(savedInput, /validity\.badInput/);
    // 이미 불러온 계획이 있으면, 다시 불러오다 실패해도 입력 칸을 치우지 않는다.
    assert.doesNotMatch(dialog, /planQuery\.isError \|\| !plan \?/);
    assert.match(dialog, /\{!plan \? \(/);
    // 저장에 실패해 서버에 없는 글은 저장된 것처럼 보이지 않는다.
    assert.match(savedInput, /data-unsaved=\{unsaved \|\| undefined\}/);
    // 저장은 하나씩 차례로 보낸다.
    assert.match(dialog, /scope: \{ id: `project-plan-\$\{projectId\}` \}/);
  });
});
