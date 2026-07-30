import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getInitialDongScope,
  isDefaultDongScope,
} from '../src/renderer/routes/_authenticated/sites/-site-helpers';

describe('managed site dong scope', () => {
  it('selects the overview default dong instead of the whole site', () => {
    assert.deepEqual(getInitialDongScope('dong-101'), ['dong-101']);
    assert.equal(isDefaultDongScope(['dong-101'], 'dong-101'), true);
  });

  it('keeps an empty scope only when the site has no default dong', () => {
    assert.deepEqual(getInitialDongScope(null), []);
    assert.equal(isDefaultDongScope([], null), false);
  });

  it('distinguishes an explicit all-dong scope from the default dong', () => {
    assert.equal(isDefaultDongScope([], 'dong-101'), false);
    assert.equal(isDefaultDongScope(['dong-102'], 'dong-101'), false);
  });
});
