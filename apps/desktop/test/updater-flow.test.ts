import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import {
  releaseNotesText,
  updateDisabledReason,
  updateErrorMessage,
  UpdateFlow,
  type UpdateEnvironment,
  type UpdaterLike,
  type UpdateStatus,
} from '../src/main/updaterFlow';

const PACKAGED_WINDOWS: UpdateEnvironment = {
  isPackaged: true,
  platform: 'win32',
  hasUpdateConfig: true,
};

type CheckResult = Awaited<ReturnType<UpdaterLike['checkForUpdates']>>;

/** electron-updater의 autoUpdater 자리에 서는 가짜. 이벤트는 테스트가 직접 낸다. */
class FakeUpdater extends EventEmitter implements UpdaterLike {
  checks = 0;
  installs = 0;
  /** 다음 checkForUpdates가 할 일. 기본은 실제처럼 확인 중 이벤트를 내고 기다린다. */
  onCheck: () => Promise<CheckResult> = () => {
    this.emit('checking-for-update');
    return new Promise(() => undefined);
  };

  checkForUpdates(): Promise<CheckResult> {
    this.checks += 1;
    return this.onCheck();
  }

  quitAndInstall(): void {
    this.installs += 1;
  }
}

function setup(environment: UpdateEnvironment = PACKAGED_WINDOWS) {
  const updater = new FakeUpdater();
  const seen: UpdateStatus[] = [];
  let created = 0;
  let clock = 1000;
  const flow = new UpdateFlow({
    environment,
    getVersion: () => '1.2.0',
    createUpdater: () => {
      created += 1;
      return updater;
    },
    onStatus: (status) => seen.push(status),
    now: () => (clock += 1),
  });
  return {
    flow,
    updater,
    seen,
    states: () => seen.map((status) => status.state),
    created: () => created,
  };
}

/** 약속의 거절이 처리될 때까지 한 박자 기다린다. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('whether auto update is on', () => {
  it('is off in a development run, before anything else is looked at', () => {
    assert.equal(
      updateDisabledReason({ isPackaged: false, platform: 'linux', hasUpdateConfig: false }),
      'development',
    );
  });

  it('is off on Linux even when the build carries an update address', () => {
    assert.equal(
      updateDisabledReason({ isPackaged: true, platform: 'linux', hasUpdateConfig: true }),
      'unsupported-platform',
    );
  });

  it('is off when the build was made without an update address (no app-update.yml)', () => {
    for (const platform of ['darwin', 'win32']) {
      assert.equal(
        updateDisabledReason({ isPackaged: true, platform, hasUpdateConfig: false }),
        'missing-update-url',
      );
    }
  });

  it('is on for a packaged macOS or Windows build that carries an update address', () => {
    for (const platform of ['darwin', 'win32']) {
      assert.equal(
        updateDisabledReason({ isPackaged: true, platform, hasUpdateConfig: true }),
        null,
      );
    }
  });
});

describe('a run where auto update is off', () => {
  it('reports why, and never creates or calls the updater', () => {
    const cases: Array<[UpdateEnvironment, string]> = [
      [{ isPackaged: false, platform: 'darwin', hasUpdateConfig: false }, 'development'],
      [{ isPackaged: true, platform: 'linux', hasUpdateConfig: true }, 'unsupported-platform'],
      [{ isPackaged: true, platform: 'win32', hasUpdateConfig: false }, 'missing-update-url'],
    ];
    for (const [environment, reason] of cases) {
      const { flow, updater, seen, created } = setup(environment);
      flow.start();
      const status = flow.getStatus();
      assert.equal(status.state, 'disabled');
      assert.equal(status.state === 'disabled' && status.reason, reason);
      assert.equal(status.currentVersion, '1.2.0');

      // 확인과 설치를 요청해도 지금 상태만 돌려준다.
      assert.equal(flow.check(true), status);
      assert.deepEqual(flow.install(), { ok: false, error: 'update-not-downloaded' });
      assert.equal(created(), 0);
      assert.equal(updater.checks, 0);
      assert.equal(seen.length, 1);
    }
  });
});

describe('the update flow', () => {
  it('is idle and silent until it is started', () => {
    const { flow, seen, created } = setup();
    assert.equal(flow.getStatus().state, 'idle');
    assert.equal(seen.length, 0);
    assert.equal(created(), 0);
    // 시작하기 전의 확인 요청은 업데이터를 만들지 않는다.
    assert.equal(flow.check().state, 'idle');
    assert.equal(created(), 0);
  });

  it('creates the updater once, however often it is started', () => {
    const { flow, created } = setup();
    flow.start();
    flow.start();
    assert.equal(created(), 1);
  });

  it('goes from checking to available to downloaded, with the real version', () => {
    const { flow, updater, states } = setup();
    flow.start();
    assert.equal(flow.check().state, 'checking');

    updater.emit('update-available', { version: '1.3.0', releaseName: 'November', releaseNotes: null });
    const available = flow.getStatus();
    assert.equal(available.state, 'available');
    assert.equal(available.state === 'available' && available.version, '1.3.0');
    assert.equal(available.state === 'available' && available.releaseName, 'November');
    assert.equal(available.currentVersion, '1.2.0');

    updater.emit('update-downloaded', {
      version: '1.3.0',
      releaseName: 'November',
      releaseNotes: 'Fixes the tab bar.',
      downloadedFile: '/tmp/update.exe',
    });
    assert.deepEqual(flow.getStatus(), {
      state: 'downloaded',
      currentVersion: '1.2.0',
      version: '1.3.0',
      releaseName: 'November',
      releaseNotes: 'Fixes the tab bar.',
      startedAt: flow.getStatus().startedAt,
    });
    // 확인 요청이 한 번, 업데이터의 확인 중 이벤트가 한 번.
    assert.deepEqual(states(), ['checking', 'checking', 'available', 'downloaded']);
  });

  it('leaves the version and release name empty when the updater does not give them', () => {
    const { flow, updater } = setup();
    flow.start();
    flow.check();
    updater.emit('update-available', { version: '1.3.0', releaseName: null });
    const status = flow.getStatus();
    assert.equal(status.state === 'available' && status.releaseName, undefined);
    updater.emit('update-downloaded', undefined);
    const downloaded = flow.getStatus();
    assert.equal(downloaded.state, 'downloaded');
    assert.equal(downloaded.state === 'downloaded' && downloaded.version, undefined);
  });

  it('gives every status change a new startedAt, and sets the status before telling', () => {
    const updater = new FakeUpdater();
    let clock = 0;
    const seenAtTellTime: boolean[] = [];
    const startedAts: number[] = [];
    const flow: UpdateFlow = new UpdateFlow({
      environment: PACKAGED_WINDOWS,
      getVersion: () => '1.2.0',
      createUpdater: () => updater,
      onStatus: (status) => {
        // src/main/index.ts는 알림을 받는 자리에서 getStatus()를 읽어 설치 여부를 정한다.
        seenAtTellTime.push(flow.getStatus() === status);
        startedAts.push(status.startedAt);
      },
      now: () => (clock += 1),
    });
    flow.start();
    flow.check();
    updater.emit('update-not-available', { version: '1.2.0' });
    assert.ok(seenAtTellTime.length >= 3);
    assert.ok(seenAtTellTime.every(Boolean));
    assert.equal(new Set(startedAts).size, startedAts.length);
  });

  it('reports not-available and accepts the next check', () => {
    const { flow, updater, states } = setup();
    flow.start();
    flow.check();
    updater.emit('update-not-available', { version: '1.2.0' });
    assert.equal(flow.getStatus().state, 'not-available');
    assert.equal(flow.getStatus().currentVersion, '1.2.0');

    flow.check();
    assert.equal(updater.checks, 2);
    assert.deepEqual(states(), ['checking', 'checking', 'not-available', 'checking', 'checking']);
  });

  it('carries "the user asked" from the check to its result', () => {
    for (const [event, payload, state] of [
      ['update-not-available', { version: '1.2.0' }, 'not-available'],
      ['update-available', { version: '1.3.0' }, 'available'],
      ['error', new Error('offline'), 'error'],
    ] as const) {
      const { flow, updater, seen } = setup();
      flow.start();
      flow.check(true);
      // 업데이터가 낸 확인 중 이벤트도 직접 누른 확인이라는 것을 잃지 않는다.
      assert.deepEqual(
        seen.map((status) => status.state === 'checking' && status.manual),
        [true, true],
      );
      updater.emit(event, payload);
      const status = flow.getStatus();
      assert.equal(status.state, state);
      assert.equal('manual' in status && status.manual, true, state);
    }
  });

  it('does not mark a background check as asked for by the user', () => {
    const { flow, updater } = setup();
    flow.start();
    flow.check();
    updater.emit('update-not-available', { version: '1.2.0' });
    const status = flow.getStatus();
    assert.equal(status.state === 'not-available' && status.manual, false);
  });

  it('ignores a second check while one is in flight, including during the download', () => {
    const { flow, updater, seen } = setup();
    flow.start();
    flow.check();
    const checking = flow.getStatus();
    assert.equal(flow.check(true), checking);
    assert.equal(updater.checks, 1);

    updater.emit('update-available', { version: '1.3.0' });
    const available = flow.getStatus();
    const count = seen.length;
    assert.equal(flow.check(true), available);
    assert.equal(updater.checks, 1);
    assert.equal(seen.length, count);

    // 다 받고 나면 다시 확인할 수 있다.
    updater.emit('update-downloaded', { version: '1.3.0' });
    flow.check(true);
    assert.equal(updater.checks, 2);
  });
});

describe('update errors', () => {
  it('reports an error from the event and accepts the next check', () => {
    const { flow, updater } = setup();
    flow.start();
    flow.check();
    updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'), 'stack text');
    assert.deepEqual(flow.getStatus(), {
      state: 'error',
      currentVersion: '1.2.0',
      message: 'net::ERR_INTERNET_DISCONNECTED',
      manual: false,
      startedAt: flow.getStatus().startedAt,
    });
    flow.check();
    assert.equal(updater.checks, 2);
  });

  it('reports a rejected check once when the updater also emitted the same error', async () => {
    const { flow, updater, states } = setup();
    flow.start();
    // electron-updater는 확인이 실패하면 error 이벤트를 내고 같은 오류로 약속을 거절한다.
    updater.onCheck = () => {
      updater.emit('checking-for-update');
      const error = new Error('Cannot find channel "latest.yml" update info');
      return Promise.resolve().then(() => {
        updater.emit('error', error, 'Cannot check for updates');
        throw error;
      });
    };
    flow.check(true);
    await settle();
    assert.deepEqual(states(), ['checking', 'checking', 'error']);
    const status = flow.getStatus();
    assert.equal(status.state === 'error' && status.message, 'Cannot find channel "latest.yml" update info');
    assert.equal(status.state === 'error' && status.manual, true);
  });

  it('reports a rejected check that came without an error event', async () => {
    const { flow, updater, states } = setup();
    flow.start();
    updater.onCheck = () => Promise.reject(new Error('Could not get code signature for running application'));
    flow.check(true);
    await settle();
    assert.deepEqual(states(), ['checking', 'error']);
    const status = flow.getStatus();
    assert.equal(status.state === 'error' && status.message, 'Could not get code signature for running application');
    assert.equal(status.state === 'error' && status.manual, true);

    // 같은 오류가 다시 와도 매번 알린다(이벤트로 받은 적이 없는 오류다).
    flow.check();
    await settle();
    assert.deepEqual(states(), ['checking', 'error', 'checking', 'error']);
  });

  it('reports a check that throws instead of returning', () => {
    const { flow, updater, states } = setup();
    flow.start();
    updater.onCheck = () => {
      throw new Error('updater is broken');
    };
    assert.equal(flow.check().state, 'error');
    assert.deepEqual(states(), ['checking', 'error']);
    flow.check();
    assert.equal(updater.checks, 2);
  });

  it('reports a failed download once, whether it arrives as an event, a rejection or both', async () => {
    for (const emitsEvent of [true, false]) {
      const { flow, updater, states } = setup();
      flow.start();
      updater.onCheck = () => {
        updater.emit('checking-for-update');
        return Promise.resolve().then(() => {
          updater.emit('update-available', { version: '1.3.0' });
          const error = new Error('sha512 checksum mismatch');
          const downloadPromise = Promise.resolve().then(() => {
            if (emitsEvent) updater.emit('error', error);
            throw error;
          });
          return { downloadPromise };
        });
      };
      flow.check();
      await settle();
      assert.deepEqual(states(), ['checking', 'checking', 'available', 'error'], String(emitsEvent));
      // 실패한 뒤에는 다시 확인할 수 있다.
      updater.onCheck = () => new Promise(() => undefined);
      flow.check();
      assert.equal(updater.checks, 2);
    }
  });

  it('turns a downloaded update into an error when the installer rejects it afterwards', () => {
    // 서명이 맞지 않는 macOS 빌드: 내려받기는 끝나지만 Squirrel.Mac의 검증에서 떨어진다.
    const { flow, updater } = setup({ ...PACKAGED_WINDOWS, platform: 'darwin' });
    flow.start();
    flow.check();
    updater.emit('update-available', { version: '1.3.0' });
    updater.emit('update-downloaded', { version: '1.3.0' });
    updater.emit('error', new Error('Code signature did not pass validation'));
    assert.equal(flow.getStatus().state, 'error');
    assert.deepEqual(flow.install(), { ok: false, error: 'update-not-downloaded' });
    assert.equal(updater.installs, 0);
  });

  it('reports an updater that cannot be created, and keeps the app going', () => {
    const seen: UpdateStatus[] = [];
    const flow = new UpdateFlow({
      environment: PACKAGED_WINDOWS,
      getVersion: () => 'not-a-version',
      createUpdater: () => {
        throw new Error('App version is not a valid semver version: "not-a-version"');
      },
      onStatus: (status) => seen.push(status),
    });
    flow.start();
    assert.equal(flow.getStatus().state, 'error');
    assert.equal(flow.check(true), flow.getStatus());
    assert.equal(seen.length, 1);
  });

  it('shows one line of a long, multi-line updater error', () => {
    assert.equal(
      updateErrorMessage(new Error('Cannot find channel "latest.yml"\nHeaders: {\n  "server": "x"\n}')),
      'Cannot find channel "latest.yml"',
    );
    assert.equal(updateErrorMessage('plain text'), 'plain text');
    assert.equal(updateErrorMessage(new Error('x'.repeat(500))).length, 301);
  });
});

describe('installing a downloaded update', () => {
  it('is refused unless an update has been downloaded', () => {
    const { flow, updater } = setup();
    const refused = { ok: false, error: 'update-not-downloaded' };
    assert.deepEqual(flow.install(), refused);
    flow.start();
    assert.deepEqual(flow.install(), refused);
    flow.check();
    assert.deepEqual(flow.install(), refused);
    updater.emit('update-available', { version: '1.3.0' });
    assert.deepEqual(flow.install(), refused);
    assert.equal(updater.installs, 0);
  });

  it('quits and installs once the update is downloaded', () => {
    const { flow, updater } = setup();
    flow.start();
    flow.check();
    updater.emit('update-available', { version: '1.3.0' });
    updater.emit('update-downloaded', { version: '1.3.0' });
    assert.deepEqual(flow.install(), { ok: true });
    assert.equal(updater.installs, 1);
  });

  it('reports an install that throws', () => {
    const { flow, updater } = setup();
    flow.start();
    flow.check();
    updater.emit('update-downloaded', { version: '1.3.0' });
    updater.quitAndInstall = () => {
      throw new Error('installer is missing');
    };
    assert.deepEqual(flow.install(), { ok: false, error: 'install-failed' });
    const status = flow.getStatus();
    assert.equal(status.state === 'error' && status.message, 'installer is missing');
  });
});

describe('release notes', () => {
  it('passes a string through', () => {
    assert.equal(releaseNotesText('Fixes the tab bar.'), 'Fixes the tab bar.');
  });

  it('joins the per-version list into one text', () => {
    assert.equal(
      releaseNotesText([
        { version: '1.3.0', note: 'Fixes the tab bar.' },
        { version: '1.2.1', note: null },
        { version: '1.2.0', note: 'Adds the calendar.' },
      ]),
      'Fixes the tab bar.\n\nAdds the calendar.',
    );
  });

  it('is empty when there are none', () => {
    for (const value of [null, undefined, '', [], [{ version: '1.3.0', note: null }], 42]) {
      assert.equal(releaseNotesText(value), undefined);
    }
  });
});
