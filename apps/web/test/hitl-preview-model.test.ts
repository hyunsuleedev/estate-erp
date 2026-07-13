import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INITIAL_HITL_PREVIEW_STATE,
  hitlPreviewReducer,
} from '../src/features/hitl-preview/model.ts';

describe('HITL preview workflow', () => {
  it('keeps an immutable revision while handing revision work back to the agent', () => {
    const withInstruction = hitlPreviewReducer(INITIAL_HITL_PREVIEW_STATE, {
      type: 'instruction_changed',
      value: '잔금일을 9월 5일로 변경해 주세요.',
    });
    const working = hitlPreviewReducer(withInstruction, {
      type: 'revision_requested',
    });

    assert.equal(working.phase, 'agent_working');
    assert.equal(working.revisionNo, 4);
    assert.equal(
      working.contentHash,
      INITIAL_HITL_PREVIEW_STATE.contentHash,
    );

    const returned = hitlPreviewReducer(working, { type: 'agent_returned' });

    assert.equal(returned.phase, 'awaiting_review');
    assert.equal(returned.revisionNo, 5);
    assert.notEqual(returned.contentHash, working.contentHash);
    assert.equal(returned.lastInstruction, '잔금일을 9월 5일로 변경해 주세요.');
  });

  it('approves the exact revision currently under human review', () => {
    const approved = hitlPreviewReducer(INITIAL_HITL_PREVIEW_STATE, {
      type: 'revision_approved',
    });

    assert.equal(approved.phase, 'approved');
    assert.match(approved.activity[0]?.detail ?? '', /8f2c19a790/);
  });

  it('ignores approval while the agent is still working', () => {
    const working = {
      ...INITIAL_HITL_PREVIEW_STATE,
      phase: 'agent_working' as const,
    };

    assert.equal(
      hitlPreviewReducer(working, { type: 'revision_approved' }),
      working,
    );
  });

  it('creates a different hash for every repeated revision', () => {
    const firstWorking = {
      ...INITIAL_HITL_PREVIEW_STATE,
      phase: 'agent_working' as const,
      lastInstruction: '첫 번째 수정',
    };
    const revisionFive = hitlPreviewReducer(firstWorking, {
      type: 'agent_returned',
    });
    const secondWorking = {
      ...revisionFive,
      phase: 'agent_working' as const,
      lastInstruction: '두 번째 수정',
    };
    const revisionSix = hitlPreviewReducer(secondWorking, {
      type: 'agent_returned',
    });

    assert.equal(revisionFive.revisionNo, 5);
    assert.equal(revisionSix.revisionNo, 6);
    assert.notEqual(revisionFive.contentHash, revisionSix.contentHash);
    assert.notEqual(revisionFive.balanceDate, revisionSix.balanceDate);
  });
});
