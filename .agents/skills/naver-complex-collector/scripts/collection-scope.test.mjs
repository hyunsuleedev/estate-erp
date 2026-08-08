import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = new URL('./collection-scope.mjs', import.meta.url).pathname;

test('stores an exact local site-to-complex mapping', () => {
  const dir = mkdtempSync(join(tmpdir(), 'naver-collection-scope-'));
  const env = { ...process.env, NAVER_COLLECTION_SCOPE_DB_PATH: join(dir, 'scope.sqlite') };
  const run = (...args) => {
    const result = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };

  try {
    const added = run('add', '--site-id', 'site-1', '--site-name', '고덕그라시움', '--external-code', '113907', '--type', 'apartment');
    assert.equal(added.source.external_code, '113907');
    assert.equal(added.source.enabled, true);

    const disabled = run('disable', '--site-id', 'site-1');
    assert.equal(disabled.source.enabled, false);
    assert.equal(run('list', '--enabled', 'true').sources.length, 0);

    run('enable', '--site-id', 'site-1');
    const marked = run('mark-collected', '--site-id', 'site-1', '--at', '2026-08-08T12:00:00.000Z');
    assert.equal(marked.source.last_collected_at, '2026-08-08T12:00:00.000Z');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
