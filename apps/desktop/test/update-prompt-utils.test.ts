import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getUpdatePromptModel,
  shouldShowUpdatePrompt,
} from '../src/renderer/components/update/update-prompt-utils';

describe('desktop update prompt utilities', () => {
  it('keeps startup update checks silent until user action is needed', () => {
    const model = getUpdatePromptModel({
      state: 'checking',
      currentVersion: '1.0.0',
      startedAt: 1,
    });

    assert.equal(shouldShowUpdatePrompt(model), false);
    assert.equal(model.variant, 'silent');
  });

  it('shows a restart action when an update has finished downloading', () => {
    const model = getUpdatePromptModel({
      state: 'downloaded',
      currentVersion: '1.0.0',
      version: '1.1.0',
      releaseName: '1.1.0',
      startedAt: 1,
    });

    assert.equal(shouldShowUpdatePrompt(model), true);
    assert.equal(model.variant, 'modal');
    assert.equal(model.title, '업데이트 준비 완료');
    assert.equal(model.primaryAction, 'restart');
  });

  it('shows manual check errors without blocking the current workflow', () => {
    const model = getUpdatePromptModel({
      state: 'error',
      currentVersion: '1.0.0',
      message: 'network timeout',
      manual: true,
      startedAt: 1,
    });

    assert.equal(shouldShowUpdatePrompt(model), true);
    assert.equal(model.variant, 'banner');
    assert.equal(model.detail.includes('network timeout'), true);
  });
});
