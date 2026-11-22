import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  announceProjectChange,
  isProjectSignal,
  listenToProjectChanges,
  type ProjectSignal,
} from '../src/renderer/lib/project-sync.ts';

const routes = resolve(dirname(fileURLToPath(import.meta.url)), '../src/renderer/routes/_authenticated');
const read = (path: string) => readFileSync(resolve(routes, path), 'utf8');

/** 알림이 올 때까지 기다린다. 시간에 기대지 않게 조건으로 본다(오지 않아야 하는 것은 조금 더 기다려 확인한다). */
async function until(check: () => boolean, timeoutMs = 2000) {
  const started = Date.now();
  while (!check() && Date.now() - started < timeoutMs) {
    await new Promise((done) => setTimeout(done, 10));
  }
}

describe('project change signal between tabs', () => {
  it('accepts only well-formed signals', () => {
    assert.equal(isProjectSignal({ type: 'changed', projectId: 'p1', sender: 'tab-a' }), true);
    assert.equal(isProjectSignal({ type: 'removed', projectId: null, sender: 'tab-a' }), true);
    assert.equal(isProjectSignal({ type: 'renamed', projectId: 'p1', sender: 'tab-a' }), false);
    assert.equal(isProjectSignal({ type: 'changed', projectId: 1, sender: 'tab-a' }), false);
    assert.equal(isProjectSignal({ type: 'changed', projectId: 'p1' }), false);
    assert.equal(isProjectSignal('changed'), false);
    assert.equal(isProjectSignal(null), false);
  });

  it('hears another tab, but not itself and not stray messages', async () => {
    const received: ProjectSignal[] = [];
    const stop = listenToProjectChanges((signal) => received.push(signal));
    // 이 탭이 보낸 것: 같은 문서의 다른 채널에는 도착하지만 넘기지 않는다.
    announceProjectChange('changed', 'p-own');
    // 다른 탭이 보낸 것 (보낸 탭 이름이 다르다)
    const other = new BroadcastChannel('estate-erp:projects');
    other.postMessage('hello');
    other.postMessage({ type: 'changed', projectId: 'p1' }); // sender 없음
    other.postMessage({ type: 'changed', projectId: 'p1', sender: 'other-tab' });
    other.postMessage({ type: 'removed', projectId: 'p2', sender: 'other-tab' });
    await until(() => received.length >= 2);
    // 뒤늦게 오는 것이 없는지 조금 더 본다.
    await new Promise((done) => setTimeout(done, 50));
    other.close();
    stop();
    assert.deepEqual(received, [
      { type: 'changed', projectId: 'p1', sender: 'other-tab' },
      { type: 'removed', projectId: 'p2', sender: 'other-tab' },
    ]);
  });

  it('stops hearing after it is told to stop', async () => {
    const received: ProjectSignal[] = [];
    const stop = listenToProjectChanges((signal) => received.push(signal));
    stop();
    const other = new BroadcastChannel('estate-erp:projects');
    other.postMessage({ type: 'changed', projectId: 'p1', sender: 'other-tab' });
    await new Promise((done) => setTimeout(done, 50));
    other.close();
    assert.deepEqual(received, []);
  });

  it('is announced after every way a project can change', () => {
    const hooks = read('projects/-project-hooks.ts');
    // 고치기 · 풀기 · 코멘트 적기
    assert.match(hooks, /announceProjectChange\("changed", projectId\);/);
    assert.match(hooks, /announceProjectChange\("removed", projectId\);/);
    assert.match(hooks, /announceProjectChange\("changed", request\.projectId\);/);
    // 코멘트 고치기 · 지우기
    assert.match(read('projects/-project-inspector.tsx'), /announceProjectChange\("changed", projectId\);/);
    // 한꺼번에 끝내기 · 다시 열기, 새로 열기
    assert.match(read('projects/index.tsx'), /announceProjectChange\("changed", null\);/);
    assert.match(read('projects/-project-create-dialog.tsx'), /announceProjectChange\("changed", project\.id\);/);
    // 진행 계획 창: 단계 고치기 · 묶어 열기 · 풀기
    const planDialog = read('customers/-project-plan-dialog.tsx');
    assert.match(planDialog, /announceProjectChange\("changed", projectId\);/);
    assert.match(planDialog, /announceProjectChange\("changed", plan\.id\);/);
    assert.match(planDialog, /announceProjectChange\("removed", projectId\);/);
  });

  it('is heard by every screen that shows projects, in any state of the detail page', () => {
    for (const page of ['projects/index.tsx', 'projects/$id.tsx', 'customers-table/index.tsx', 'customers/index.tsx']) {
      assert.match(read(page), /useProjectChangesFromOtherTabs\(\);/, page);
    }
    // 상세는 불러오는 중이거나 "없음" 화면일 때도 들어야 한다: 맨 바깥 컴포넌트에서 부른다.
    assert.match(
      read('projects/$id.tsx'),
      /function ProjectDetailPage\(\) \{\s*const \{ id \} = Route\.useParams\(\);[\s\S]{0,260}useProjectChangesFromOtherTabs\(\);/,
    );
    // 들으면 프로젝트 데이터를 모두 다시 읽는다 (목록 · 상세 · 코멘트 · 원장).
    assert.match(
      read('projects/-project-hooks.ts'),
      /listenToProjectChanges\(\(\) => \{\s*void queryClient\.invalidateQueries\(\{ queryKey: \["projects"\] \}\);/,
    );
  });
});
