import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runStartup, type StartupSteps } from '../src/main/startup';

function steps(overrides: Partial<StartupSteps> = {}) {
  const calls: string[] = [];
  const all: StartupSteps = {
    prepare: async () => {
      calls.push('prepare');
    },
    checkForUpdates: () => {
      calls.push('check-updates');
    },
    createWindow: () => {
      calls.push('create-window');
    },
    startServices: () => {
      calls.push('start-services');
    },
    reportFailure: (error) => {
      calls.push(`report:${error instanceof Error ? error.message : String(error)}`);
    },
    ...overrides,
  };
  return { calls, all };
}

describe('app startup order', () => {
  it('starts the update check before the window, then the services', async () => {
    const { calls, all } = steps();
    assert.equal(await runStartup(all), 'started');
    assert.deepEqual(calls, ['prepare', 'check-updates', 'create-window', 'start-services']);
  });

  it('reports a build that cannot open its window, after the update check was started', async () => {
    const { calls, all } = steps();
    all.createWindow = () => {
      calls.push('create-window');
      throw new Error('documents are missing from the packaged renderer: tabbar.html');
    };
    assert.equal(await runStartup(all), 'failed');
    assert.deepEqual(calls, [
      'prepare',
      'check-updates',
      'create-window',
      'report:documents are missing from the packaged renderer: tabbar.html',
    ]);
    // 창이 없는 채로 전화 연동 등을 시작하지 않는다.
    assert.ok(!calls.includes('start-services'));
  });

  it('waits for the failure to be reported before it returns', async () => {
    const { calls, all } = steps();
    all.createWindow = () => {
      throw new Error('boom');
    };
    let release: () => void = () => undefined;
    all.reportFailure = () =>
      new Promise<void>((resolve) => {
        release = () => {
          calls.push('reported');
          resolve();
        };
      });
    let finished = false;
    const run = runStartup(all).then((result) => {
      finished = true;
      return result;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(finished, false);
    release();
    assert.equal(await run, 'failed');
    assert.deepEqual(calls, ['prepare', 'check-updates', 'reported']);
  });

  it('still opens the window when cleanup or the update check throws', async () => {
    const { calls, all } = steps({
      prepare: async () => {
        throw new Error('cleanup failed');
      },
      checkForUpdates: () => {
        throw new Error('updater unavailable');
      },
    });
    assert.equal(await runStartup(all), 'started');
    assert.deepEqual(calls, ['create-window', 'start-services']);
  });
});
