import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getTabPathname,
  resolveTabResourceKey,
  tabResourceKeys,
} from '../src/renderer/features/tabs/lib/tabResource';

describe('tab resource identity', () => {
  it('keeps search and hash out of the canonical pathname', () => {
    assert.equal(
      getTabPathname('/properties/id-1?view=history#price'),
      '/properties/id-1',
    );
    assert.equal(getTabPathname('/contacts/'), '/contacts');
  });

  it('classifies entity routes independently from their view state', () => {
    assert.equal(
      resolveTabResourceKey('/properties/id-1?view=history', 'tab-a'),
      tabResourceKeys.entity('property', 'id-1'),
    );
    assert.equal(
      resolveTabResourceKey('/contacts/id-2#phones', 'tab-b'),
      tabResourceKeys.entity('contact', 'id-2'),
    );
    assert.equal(
      resolveTabResourceKey('/buyer-requirements/id-3/edit', 'tab-c'),
      tabResourceKeys.entity('buyer-requirement', 'id-3'),
    );
  });

  it('classifies new routes as distinct drafts before dynamic entity routes', () => {
    assert.equal(
      resolveTabResourceKey('/properties/new?siteId=site-1', 'draft-a'),
      tabResourceKeys.draft('property', 'draft-a'),
    );
    assert.equal(
      resolveTabResourceKey('/contacts/new', 'draft-b'),
      tabResourceKeys.draft('contact', 'draft-b'),
    );
  });

  it('does not mistake static property subpages for entity ids', () => {
    assert.equal(
      resolveTabResourceKey('/properties/external-listings', 'tab-a'),
      tabResourceKeys.module('/properties/external-listings'),
    );
    assert.equal(
      resolveTabResourceKey('/properties/naver-my-ads', 'tab-b'),
      tabResourceKeys.module('/properties/naver-my-ads'),
    );
  });

  it('treats query-driven sheets and filters as module view state', () => {
    assert.equal(
      resolveTabResourceKey('/matches?matchId=match-1', 'tab-a'),
      tabResourceKeys.module('/matches'),
    );
    assert.equal(
      resolveTabResourceKey('/network?roomId=room-1&view=chat', 'tab-b'),
      tabResourceKeys.module('/network'),
    );
  });
});
