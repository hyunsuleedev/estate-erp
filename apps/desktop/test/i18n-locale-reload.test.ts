import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UNSAVED_WORK_SELECTOR, createLocaleReloader } from '../src/renderer/i18n/locale-reload';
import {
  ACTIVE_TRANSFER_SELECTOR,
  EXPLICIT_DIRTY_SELECTOR,
  TRANSIENT_EDITOR_SELECTOR,
} from '../src/renderer/features/tabs/lib/unsavedWork';

/** 화면 대신 쓰는 가짜: 값만 바꿔 가며 다시 불러오기가 언제 일어나는지 본다 */
function setup(initial: { wanted?: boolean; saving?: boolean; unsaved?: boolean } = {}) {
  const state = { wanted: initial.wanted ?? true, saving: initial.saving ?? false, unsaved: initial.unsaved ?? false };
  const log: string[] = [];
  let watcher: (() => void) | null = null;
  let reloadNow: (() => void) | null = null;
  const reloader = createLocaleReloader({
    stillWanted: () => state.wanted,
    isSaving: async () => state.saving,
    hasUnsavedWork: () => state.unsaved,
    reload: () => log.push('reload'),
    watch: (check) => {
      log.push('watch');
      watcher = check;
      return () => {
        log.push('unwatch');
        watcher = null;
      };
    },
    onDeferred: (now) => {
      log.push('deferred');
      reloadNow = now;
    },
    onSettled: () => log.push('settled'),
  });
  /** 화면이 바뀌었다고 알린 뒤 확인이 끝나기를 기다린다 */
  const tick = async () => {
    watcher?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { state, log, reloader, tick, pressReloadNow: () => reloadNow?.() };
}

describe('language change reload', () => {
  it('reloads at once when nothing is being written', async () => {
    const { reloader, log } = setup();
    await reloader.request();
    assert.deepEqual(log, ['reload']);
  });

  it('does not reload a screen with an open editor until it is closed', async () => {
    const { reloader, log, state, tick } = setup({ unsaved: true });
    await reloader.request();
    assert.deepEqual(log, ['deferred', 'watch'], '작성 중인 화면은 다시 불러오지 않고 알리기만 한다');
    assert.equal(reloader.isDeferred(), true);

    await tick();
    assert.deepEqual(log, ['deferred', 'watch'], '아직 열려 있으면 그대로 둔다(알림도 한 번만)');

    state.unsaved = false;
    await tick();
    assert.deepEqual(log, ['deferred', 'watch', 'unwatch', 'settled', 'reload']);
  });

  it('waits for a save request that is still running', async () => {
    const { reloader, log, state, tick } = setup({ saving: true });
    await reloader.request();
    assert.deepEqual(log, ['deferred', 'watch']);
    state.saving = false;
    await tick();
    assert.equal(log.at(-1), 'reload');
  });

  it('gives up the pending reload when the language is switched back', async () => {
    const { reloader, log, state, tick } = setup({ unsaved: true });
    await reloader.request();
    state.wanted = false;
    await reloader.request();
    assert.deepEqual(log, ['deferred', 'watch', 'unwatch', 'settled']);
    assert.equal(reloader.isDeferred(), false);
    // 그 뒤 대화창을 닫아도 다시 불러오지 않는다
    state.unsaved = false;
    await tick();
    assert.equal(log.includes('reload'), false);
  });

  it('reloads when the user presses the action on the notice', async () => {
    const { reloader, log, pressReloadNow } = setup({ unsaved: true });
    await reloader.request();
    pressReloadNow();
    assert.deepEqual(log, ['deferred', 'watch', 'unwatch', 'settled', 'reload']);
  });

  it('looks again when the screen changes while a check is still waiting', async () => {
    const { reloader, log, state } = setup({ unsaved: true });
    const first = reloader.request();
    // 첫 확인이 저장 여부를 기다리는 사이 대화창이 닫히고 다시 확인이 들어온다
    state.unsaved = false;
    const second = reloader.request();
    await Promise.all([first, second]);
    assert.deepEqual(log, ['reload']);
  });

  it('uses the same signs as tab discard protection', () => {
    for (const selector of [TRANSIENT_EDITOR_SELECTOR, EXPLICIT_DIRTY_SELECTOR, ACTIVE_TRANSFER_SELECTOR]) {
      assert.ok(UNSAVED_WORK_SELECTOR.includes(selector));
    }
  });
});
