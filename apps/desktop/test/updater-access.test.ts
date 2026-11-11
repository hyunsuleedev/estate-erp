import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allowsUpdaterRequest,
  type UpdaterRequest,
  type UpdaterSenderKind,
} from '../src/main/updaterAccess';

const READS: UpdaterRequest[] = ['getStatus', 'getDismissed'];
const ACTIONS: UpdaterRequest[] = ['check', 'install', 'dismiss'];

describe('who may use the updater channel', () => {
  it('lets every app screen read the status, so each can draw the notice', () => {
    for (const sender of ['gate', 'visible-tab', 'background-tab'] as UpdaterSenderKind[]) {
      for (const request of READS) {
        assert.equal(allowsUpdaterRequest(request, sender), true, `${request} from ${sender}`);
      }
    }
  });

  it('lets only the screen the user is looking at check, install or dismiss', () => {
    for (const request of ACTIONS) {
      assert.equal(allowsUpdaterRequest(request, 'gate'), true, request);
      assert.equal(allowsUpdaterRequest(request, 'visible-tab'), true, request);
      // 뒤에 있는 탭 화면이나 미리 띄워 둔 화면이 앱을 다시 시작시키면 안 된다.
      assert.equal(allowsUpdaterRequest(request, 'background-tab'), false, request);
    }
  });

  it('answers nothing to the tab bar document, the call popup, sub-frames and strangers', () => {
    for (const request of [...READS, ...ACTIONS]) {
      assert.equal(allowsUpdaterRequest(request, 'other'), false, request);
    }
  });
});
