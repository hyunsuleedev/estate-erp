import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';

interface ReparentResult {
  electronVersion: string;
  sameWebContentsId: boolean;
  sameRendererProcess: boolean;
  inputValuePreserved: boolean;
  inputSelectionPreserved: boolean;
  domFocusImmediatelyPreserved: boolean;
  osFocusExercised: boolean;
  osFocusAfterReparent: boolean | null;
  scrollPositionPreserved: boolean;
  historyPreserved: boolean;
  javascriptRealmPreserved: boolean;
  runtimeContinued: boolean;
  targetBounds: { x: number; y: number; width: number; height: number };
  didFinishLoadAfterInitialLoad: number;
  survivedSourceWindowClose: boolean;
  explicitlyDestroyed: boolean;
  orphanAfterExplicitClose: boolean;
  synchronousReparentMilliseconds: number;
  firstProbeAfterReparentMilliseconds: number;
}

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureMain = resolve(
  testDir,
  'fixtures/web-contents-view-reparent/main.cjs',
);
const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const shouldRun = process.env.ESTATE_ELECTRON_INTEGRATION === '1';

it(
  'reparents one live WebContentsView without recreating renderer state',
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
      child.once('close', (exitCode) => {
        resolveProcess({ exitCode, stdout, stderr });
      });
    });

    assert.equal(exitCode, 0, `Electron fixture failed:\n${stderr}\n${stdout}`);
    const resultLine = stdout
      .split(/\r?\n/u)
      .find((line) => line.startsWith('WCV_REPARENT_RESULT:'));
    assert.ok(resultLine, `Missing fixture result:\n${stdout}`);

    const result = JSON.parse(
      resultLine.slice('WCV_REPARENT_RESULT:'.length),
    ) as ReparentResult;

    assert.equal(result.electronVersion, '41.1.0');
    assert.equal(result.sameWebContentsId, true);
    assert.equal(result.sameRendererProcess, true);
    assert.equal(result.inputValuePreserved, true);
    assert.equal(result.inputSelectionPreserved, true);
    assert.equal(result.domFocusImmediatelyPreserved, true);
    assert.equal(result.scrollPositionPreserved, true);
    assert.equal(result.historyPreserved, true);
    assert.equal(result.javascriptRealmPreserved, true);
    assert.equal(result.runtimeContinued, true);
    assert.deepEqual(result.targetBounds, {
      x: 23,
      y: 29,
      width: 518,
      height: 344,
    });
    assert.equal(result.didFinishLoadAfterInitialLoad, 0);
    assert.equal(result.survivedSourceWindowClose, true);
    assert.equal(result.explicitlyDestroyed, true);
    assert.equal(result.orphanAfterExplicitClose, false);
    if (result.osFocusExercised) {
      assert.equal(result.osFocusAfterReparent, true);
    }
    assert.ok(result.synchronousReparentMilliseconds < 100);
    assert.ok(result.firstProbeAfterReparentMilliseconds < 1_000);
  },
);
