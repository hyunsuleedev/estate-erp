import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  moveStep,
  planStepOrder,
  toggleWithPrevious,
} from '../src/renderer/routes/_authenticated/customers/-project-plan-order';

const show = (order: Array<{ id: string; sortOrder: number }>) =>
  order.map((item) => `${item.id}${item.sortOrder}`).join(' ');

describe('project plan order', () => {
  it('renumbers server order from 1 without gaps and keeps simultaneous steps together', () => {
    const order = planStepOrder([
      { id: 'A', sortOrder: 2 },
      { id: 'B', sortOrder: 5 },
      { id: 'C', sortOrder: 5 },
      { id: 'D', sortOrder: 9 },
    ]);
    assert.equal(show(order), 'A1 B2 C2 D3');
  });

  it('moves one step up or down and makes it a step of its own', () => {
    const order = planStepOrder([
      { id: 'A', sortOrder: 1 },
      { id: 'B', sortOrder: 2 },
      { id: 'C', sortOrder: 2 },
      { id: 'D', sortOrder: 3 },
    ]);
    // 묶음의 첫 줄을 내리면 남은 줄이 그 자리의 단계가 된다.
    assert.equal(show(moveStep(order, 1, 'down')), 'A1 C2 B3 D4');
    // 묶음의 둘째 줄을 올리면 묶음에서 빠져 앞 단계가 된다.
    assert.equal(show(moveStep(order, 2, 'up')), 'A1 C2 B3 D4');
    assert.equal(show(moveStep(order, 3, 'up')), 'A1 B2 D3 C4');
  });

  it('keeps the rest of a simultaneous group when one of three leaves', () => {
    const order = planStepOrder([
      { id: 'A', sortOrder: 1 },
      { id: 'B', sortOrder: 2 },
      { id: 'C', sortOrder: 2 },
      { id: 'D', sortOrder: 2 },
    ]);
    assert.equal(show(moveStep(order, 2, 'down')), 'A1 B2 D2 C3');
  });

  it('does nothing at the ends', () => {
    const order = planStepOrder([
      { id: 'A', sortOrder: 1 },
      { id: 'B', sortOrder: 2 },
    ]);
    assert.equal(show(moveStep(order, 0, 'up')), 'A1 B2');
    assert.equal(show(moveStep(order, 1, 'down')), 'A1 B2');
    assert.equal(show(toggleWithPrevious(order, 0)), 'A1 B2');
  });

  it('toggles a step to run together with the previous one and back', () => {
    const order = planStepOrder([
      { id: 'A', sortOrder: 1 },
      { id: 'B', sortOrder: 2 },
      { id: 'C', sortOrder: 3 },
    ]);
    const together = toggleWithPrevious(order, 1);
    assert.equal(show(together), 'A1 B1 C2');
    assert.equal(show(toggleWithPrevious(together, 1)), 'A1 B2 C3');
    // 모든 단계를 빠짐없이 돌려준다(서버가 일부만 받지 않는다).
    assert.equal(together.length, order.length);
  });
});
