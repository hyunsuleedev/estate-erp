import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { Tab } from '@estate-erp/shared';
import { useTabStore } from '../src/renderer/features/tabs/store/useTabStore';

function makeTab(id: string): Tab {
  return {
    id,
    kind: 'generic',
    title: id,
    route: `/${id}`,
    createdAt: 1,
  };
}

describe('desktop tab store', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null });
  });

  it('activates the neighboring tab when an active tab is detached', () => {
    useTabStore.setState({
      tabs: [makeTab('left'), makeTab('active'), makeTab('right')],
      activeTabId: 'active',
    });

    useTabStore.getState().removeTabById('active');

    assert.deepEqual(
      useTabStore.getState().tabs.map((tab) => tab.id),
      ['left', 'right'],
    );
    assert.equal(useTabStore.getState().activeTabId, 'right');
  });

  it('clears the active tab when the detached tab was the last tab', () => {
    useTabStore.setState({
      tabs: [makeTab('only')],
      activeTabId: 'only',
    });

    useTabStore.getState().removeTabById('only');

    assert.deepEqual(useTabStore.getState().tabs, []);
    assert.equal(useTabStore.getState().activeTabId, null);
  });
});
