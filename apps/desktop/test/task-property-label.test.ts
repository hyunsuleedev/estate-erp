import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '@estate-erp/api-client';

import { getPropertyLabel } from '../src/renderer/routes/_authenticated/tasks/-task-property-label';

function taskWithProperty(property: Task['property']): Task {
  return { property } as Task;
}

describe('task property context label', () => {
  it('shows the real dong between the site and unit', () => {
    const task = taskWithProperty({
      site: { name: '고덕그라시움' },
      unit: {
        name: '3401',
        dong: { id: 'dong-102', name: '102', isPlaceholder: false },
      },
    } as Task['property']);

    assert.equal(getPropertyLabel(task), '고덕그라시움 102동 3401호');
  });

  it('does not duplicate suffixes already stored in names', () => {
    const task = taskWithProperty({
      site: { name: '고덕그라시움' },
      unit: {
        name: '3401호',
        dong: { id: 'dong-102', name: '102동', isPlaceholder: false },
      },
    } as Task['property']);

    assert.equal(getPropertyLabel(task), '고덕그라시움 102동 3401호');
  });

  it('hides placeholder dongs while keeping the unit', () => {
    const task = taskWithProperty({
      site: { name: '단일동 건물' },
      unit: {
        name: '501',
        dong: { id: 'placeholder', name: '-', isPlaceholder: true },
      },
    } as Task['property']);

    assert.equal(getPropertyLabel(task), '단일동 건물 501호');
  });

  it('keeps the existing fallback for properties without a unit', () => {
    const task = taskWithProperty({ site: { name: '강동구 토지' }, unit: null } as Task['property']);

    assert.equal(getPropertyLabel(task), '강동구 토지');
    assert.equal(getPropertyLabel(taskWithProperty(null)), '매물');
  });
});
