import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APP_WINDOW_TITLE, windowTitleForTabs } from '../src/common/tabs/windowTitle';

describe('window title', () => {
  const tabs = [
    { id: 'a', title: '대시보드' },
    { id: 'b', title: '고덕그라시움 101동 1503호' },
  ];

  it('names the window after the tab it shows', () => {
    assert.equal(
      windowTitleForTabs({ tabs, activeTabId: 'b' }),
      `고덕그라시움 101동 1503호 — ${APP_WINDOW_TITLE}`,
    );
    assert.equal(
      windowTitleForTabs({ tabs, activeTabId: 'a' }),
      `대시보드 — ${APP_WINDOW_TITLE}`,
    );
  });

  it('falls back to the product name when there is no tab or no real title yet', () => {
    assert.equal(windowTitleForTabs(null), APP_WINDOW_TITLE);
    assert.equal(windowTitleForTabs({ tabs: [], activeTabId: null }), APP_WINDOW_TITLE);
    assert.equal(windowTitleForTabs({ tabs, activeTabId: 'gone' }), APP_WINDOW_TITLE);
    assert.equal(
      windowTitleForTabs({ tabs: [{ id: 'x', title: '...' }], activeTabId: 'x' }),
      APP_WINDOW_TITLE,
    );
    assert.equal(
      windowTitleForTabs({ tabs: [{ id: 'x', title: '   ' }], activeTabId: 'x' }),
      APP_WINDOW_TITLE,
    );
  });

  it('keeps the title on one line and within a sane length', () => {
    assert.equal(
      windowTitleForTabs({ tabs: [{ id: 'x', title: ' 김\n집주인\t 상담 ' }], activeTabId: 'x' }),
      `김 집주인 상담 — ${APP_WINDOW_TITLE}`,
    );
    const long = windowTitleForTabs({
      tabs: [{ id: 'x', title: '가'.repeat(500) }],
      activeTabId: 'x',
    });
    assert.ok(long.length <= 120 + ` — ${APP_WINDOW_TITLE}`.length);
    assert.ok(long.endsWith(`… — ${APP_WINDOW_TITLE}`));
  });
});
