import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = new URL('./run-state.mjs', import.meta.url).pathname;

test('prevents duplicate active runs and preserves step history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'estate-erp-ad-task-'));
  const env = { ...process.env, ESTATE_ERP_AD_TASK_DB_PATH: join(dir, 'state.sqlite') };
  const run = (...args) => {
    const result = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };

  try {
    const first = run('begin', '--task-id', 'task-1', '--task-json', '{"category":"advertisement"}');
    const second = run('begin', '--task-id', 'task-1');
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.run.id, first.run.id);

    run('step', '--run-id', first.run.id, '--key', 'target_confirm', '--status', 'running');
    run('step', '--run-id', first.run.id, '--key', 'target_confirm', '--status', 'succeeded', '--details-json', '{"verified":true}');
    const finished = run('finish', '--run-id', first.run.id, '--status', 'completed', '--result-json', '{"verified":true}');
    assert.equal(finished.run.status, 'completed');

    const shown = run('show', '--task-id', 'task-1');
    assert.equal(shown.steps.length, 1);
    assert.deepEqual(shown.steps[0].details, { verified: true });

    const next = run('begin', '--task-id', 'task-1');
    assert.equal(next.reused, false);
    assert.notEqual(next.run.id, first.run.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
