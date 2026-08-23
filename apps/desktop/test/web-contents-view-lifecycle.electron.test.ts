import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';

interface LifecycleResult {
  electronVersion: string;
  initialViewCount: number;
  evictedViewCount: number;
  evictedContentsDestroyed: boolean;
  evictedContentsUnregistered: boolean;
  survivorContentsRegistered: boolean;
  recreatedWithNewWebContents: boolean;
  recreatedWithNewJavascriptRealm: boolean;
  restoredSerializedState: boolean;
  orphanedChildContentsAfterCleanup: number;
}

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureMain = resolve(
  testDir,
  'fixtures/web-contents-view-lifecycle/main.cjs',
);
const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const shouldRun = process.env.ESTATE_ELECTRON_INTEGRATION === '1';

it(
  'destroys evicted WebContentsViews and recreates a logical tab without orphans',
  { skip: !shouldRun, timeout: 30_000 },
  async () => {
    const { exitCode, stdout, stderr } = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>((resolveProcess, rejectProcess) => {
      const child = spawn(electronPath, [fixtureMain], {
        cwd: dirname(fixtureMain),
        env: {
          ...process.env,
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', rejectProcess);
      child.once('close', (code) => {
        resolveProcess({ exitCode: code, stdout, stderr });
      });
    });

    assert.equal(exitCode, 0, `Electron fixture failed:\n${stderr}\n${stdout}`);
    const resultLine = stdout
      .split(/\r?\n/u)
      .find((line) => line.startsWith('WCV_LIFECYCLE_RESULT:'));
    assert.ok(resultLine, `Missing fixture result:\n${stdout}`);

    const result = JSON.parse(
      resultLine.slice('WCV_LIFECYCLE_RESULT:'.length),
    ) as LifecycleResult;

    assert.equal(result.electronVersion, '41.1.0');
    assert.equal(result.initialViewCount, 6);
    assert.equal(result.evictedViewCount, 3);
    assert.equal(result.evictedContentsDestroyed, true);
    assert.equal(result.evictedContentsUnregistered, true);
    assert.equal(result.survivorContentsRegistered, true);
    assert.equal(result.recreatedWithNewWebContents, true);
    assert.equal(result.recreatedWithNewJavascriptRealm, true);
    assert.equal(result.restoredSerializedState, true);
    assert.equal(result.orphanedChildContentsAfterCleanup, 0);
  },
);
