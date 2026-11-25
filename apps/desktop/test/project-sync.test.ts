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
    assert.match(hooks, /announceProjectChange\("changed", project\.id\);/);
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

describe('project text fields and removal (source)', () => {
  const inspector = read('projects/-project-inspector.tsx');
  const hooks = read('projects/-project-hooks.ts');
  const detail = read('projects/$id.tsx');
  const dialog = read('customers/-project-plan-dialog.tsx');

  it('keeps what was typed in the name and memo when saving fails', () => {
    const savedText = inspector.slice(inspector.indexOf('export function SavedText('));
    // 저장하지 못하면 적은 글을 칸에 다시 놓고, 서버 값이 그 글을 덮지 않는다.
    assert.match(savedText, /result\.catch\(\(\) => \{/);
    assert.match(savedText, /if \(!editing && !conflict && !failed\) setDraft\(current\);/);
    assert.match(savedText, /data-saved-text-failed/);
    assert.match(savedText, /다시 저장/);
    // 화면은 끝나기를 기다릴 수 있게 mutateAsync로 넘긴다.
    assert.match(detail, /onSave=\{\(next\) => update\.mutateAsync\(\{ title: next \}\)\}/);
    assert.match(detail, /onSave=\{\(next\) => update\.mutateAsync\(\{ memo: next \}\)\}/);
    // 실패하면 바로 반영해 둔 글을 보내기 전 값으로 되돌린다.
    assert.match(hooks, /previousTitle/);
  });

  it('does not re-read a project this tab just removed', () => {
    assert.match(hooks, /markProjectRemoved\(projectId\);\s*toast\.success/);
    assert.match(inspector, /enabled: !isProjectRemoved\(project\.id\)/);
    assert.match(inspector, /enabled: !isProjectRemoved\(projectId\)/);
    assert.match(detail, /enabled: !removedHere/);
    assert.match(dialog, /markProjectRemoved\(projectId\);\s*queryClient\.removeQueries/);
  });
});

describe('project removal is for owner and manager only (source)', () => {
  const inspector = read('projects/-project-inspector.tsx');
  const detail = read('projects/$id.tsx');
  const dialog = read('customers/-project-plan-dialog.tsx');
  const list = read('projects/index.tsx');

  it('hides "프로젝트 풀기" from staff in the panel, the detail page and the plan window', () => {
    // 상세 · 패널은 같은 판단(projectRemovalFor): 대표 · 매니저는 풀기, 아무것도 없는 내 빈 프로젝트는 지우기.
    // 업무가 있으면 빈 프로젝트가 아니다 — 둘 다 이 프로젝트의 업무 수를 함께 넘긴다(모르면 null).
    assert.match(
      detail,
      /const removal = projectRemovalFor\(plan, useAuth\(\)\.user, tasksQuery\.data \? tasksQuery\.data\.length : null\);/,
    );
    assert.match(inspector, /projectRemovalFor\(plan, user, tasksQuery\.data \? tasksQuery\.data\.length : null\)/);
    for (const [name, source] of [
      ['panel', inspector],
      ['detail', detail],
    ] as const) {
      assert.match(source, /\{removal && \(/, name);
      assert.match(source, /remove\.mutate\(\{ empty: removal === "delete-empty" \}\)/, name);
    }
    assert.match(dialog, /const mayRemove = canRemoveProject\(useAuth\(\)\.user\?\.role\);/);
    assert.match(dialog, /\{mayRemove \?/);
    // 목록의 일괄 작업에는 풀기가 아예 없다.
    assert.doesNotMatch(list, /projects\.remove\(/);
  });

  it('explains that ending a project does not change its intakes or deals', () => {
    assert.match(detail, /title=\{PROJECT_ARCHIVE_NOTE\}/);
    assert.match(list, /description: PROJECT_ARCHIVE_NOTE/);
    assert.match(list, /끝내기는 \{PROJECT_ARCHIVE_NOTE\}/);
  });
});

describe('opening a project is a new page, not a dialog (source)', () => {
  const hooks = read('projects/-project-hooks.ts');
  const list = read('projects/index.tsx');
  const contactSection = read('projects/-contact-projects.tsx');
  const detail = read('projects/$id.tsx');

  it('creates an empty project at once and opens it in a new tab, only once', () => {
    // 대화창은 없다.
    assert.throws(() => read('projects/-project-create-dialog.tsx'));
    assert.throws(() => read('projects/new.tsx'));
    assert.doesNotMatch(list, /ProjectCreateDialog|<Dialog/);
    assert.match(list, /const newProject = useOpenNewProject\(\);/);
    assert.match(contactSection, /newProject\.open\(\{ primaryContactId: contact\.id \}\)/);
    // 한 번만: 만드는 동안 두 번째 요청을 보내지 않는다.
    assert.match(hooks, /if \(openingNewProject\) return;\s*openingNewProject = true;\s*mutation\.mutate\(dto\);/);
    assert.match(hooks, /onSettled: \(\) => \{\s*openingNewProject = false;/);
    // 새 탭(옆 패널의 "새 탭으로 열기"와 같은 길)으로, 제목에 커서를 둘 표시(?new=1)와 함께 연다.
    assert.match(hooks, /const route = `\/projects\/\$\{project\.id\}\?new=1`;/);
    assert.match(hooks, /openOrRevealResource\(\{/);
    // 실패하면 알림에서 다시 시도한다.
    assert.match(hooks, /toast\.error\("프로젝트를 열지 못했습니다"/);
    assert.match(hooks, /action: \{ label: "다시 시도", onClick: \(\) => open\(dto\) \}/);
    // 새 문서는 제목에 커서
    assert.match(detail, /input\[aria-label="프로젝트 이름"\]/);
  });
});
