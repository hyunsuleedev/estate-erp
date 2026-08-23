const { once } = require('node:events');
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, webContents } = require('electron');

const RESULT_PREFIX = 'WCV_LIFECYCLE_RESULT:';
const INITIAL_VIEW_COUNT = 6;
const EVICTED_VIEW_COUNT = 3;
const VIEW_BOUNDS = { x: 0, y: 0, width: 480, height: 320 };

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function childIsRegistered(id) {
  return (
    webContents.fromId(id) != null &&
    webContents.getAllWebContents().some((candidate) => candidate.id === id)
  );
}

async function makeLoadedView(host) {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  host.contentView.addChildView(view);
  view.setBounds(VIEW_BOUNDS);
  await view.webContents.loadFile(path.join(__dirname, '../web-contents-view-reparent/page.html'));
  return view;
}

async function destroyView(host, view) {
  const contents = view.webContents;
  const destroyed = once(contents, 'destroyed');
  host.contentView.removeChildView(view);
  contents.close();
  await destroyed;
  return contents.isDestroyed();
}

async function run() {
  await app.whenReady();
  app.on('window-all-closed', () => {});

  const host = new BrowserWindow({
    width: 480,
    height: 320,
    show: false,
    skipTaskbar: true,
    webPreferences: { sandbox: true },
  });
  const views = [];
  for (let index = 0; index < INITIAL_VIEW_COUNT; index += 1) {
    views.push(await makeLoadedView(host));
  }
  const childIds = views.map((view) => view.webContents.id);
  assertCondition(
    childIds.every(childIsRegistered),
    'not every created child WebContents was registered',
  );

  const victim = views[0];
  const victimContentsId = victim.webContents.id;
  const serializedState = await victim.webContents.executeJavaScript(`(() => {
    const input = document.getElementById('stateful-input');
    input.value = '복원 가능한 탭 상태';
    window.scrollTo(0, 640);
    history.replaceState({ logicalTabId: 'tab-0' }, '', '#restorable');
    return {
      value: input.value,
      scrollY: window.scrollY,
      hash: location.hash,
      logicalTabId: history.state.logicalTabId,
      identityNonce: window.__fixtureIdentity.nonce,
    };
  })()`);

  const evicted = views.slice(0, EVICTED_VIEW_COUNT);
  const evictedDestroyedStates = [];
  for (const view of evicted) {
    evictedDestroyedStates.push(await destroyView(host, view));
  }
  const evictedIds = childIds.slice(0, EVICTED_VIEW_COUNT);
  const survivorIds = childIds.slice(EVICTED_VIEW_COUNT);

  // WebContentsView.webContents becomes unavailable after the backing
  // WebContents is destroyed, so capture the state at the destroyed event.
  const evictedContentsDestroyed = evictedDestroyedStates.every(Boolean);
  const evictedContentsUnregistered = evictedIds.every(
    (id) => !childIsRegistered(id),
  );
  const survivorContentsRegistered = survivorIds.every(childIsRegistered);
  assertCondition(evictedContentsDestroyed, 'an evicted WebContents survived close');
  assertCondition(
    evictedContentsUnregistered,
    'an evicted WebContents remained in Electron registry',
  );
  assertCondition(
    survivorContentsRegistered,
    'eviction destroyed a non-victim WebContents',
  );

  const recreated = await makeLoadedView(host);
  const recreatedIdentity = await recreated.webContents.executeJavaScript(
    'window.__fixtureIdentity.nonce',
  );
  await recreated.webContents.executeJavaScript(`(() => {
    const state = ${JSON.stringify(serializedState)};
    const input = document.getElementById('stateful-input');
    input.value = state.value;
    window.scrollTo(0, state.scrollY);
    history.replaceState(
      { logicalTabId: state.logicalTabId },
      '',
      state.hash,
    );
  })()`);
  const restoredState = await recreated.webContents.executeJavaScript(`({
    value: document.getElementById('stateful-input').value,
    scrollY: window.scrollY,
    hash: location.hash,
    logicalTabId: history.state.logicalTabId,
  })`);
  const recreatedWithNewWebContents = recreated.webContents.id !== victimContentsId;
  const recreatedWithNewJavascriptRealm =
    recreatedIdentity !== serializedState.identityNonce;
  const restoredSerializedState =
    restoredState.value === serializedState.value &&
    restoredState.scrollY === serializedState.scrollY &&
    restoredState.hash === serializedState.hash &&
    restoredState.logicalTabId === serializedState.logicalTabId;
  assertCondition(
    recreatedWithNewWebContents,
    'recreated logical tab reused a destroyed WebContents id',
  );
  assertCondition(
    recreatedWithNewJavascriptRealm,
    'recreated logical tab unexpectedly retained the old JavaScript realm',
  );
  assertCondition(restoredSerializedState, 'serialized tab state was not restored');

  const remainingViews = [...views.slice(EVICTED_VIEW_COUNT), recreated];
  const remainingIds = remainingViews.map((view) => view.webContents.id);
  for (const view of remainingViews) await destroyView(host, view);
  const orphanedChildContentsAfterCleanup = [...evictedIds, ...remainingIds].filter(
    childIsRegistered,
  ).length;
  assertCondition(
    orphanedChildContentsAfterCleanup === 0,
    'child WebContents orphaned after full cleanup',
  );

  host.close();
  await once(host, 'closed');

  process.stdout.write(
    `${RESULT_PREFIX}${JSON.stringify({
      electronVersion: process.versions.electron,
      initialViewCount: INITIAL_VIEW_COUNT,
      evictedViewCount: EVICTED_VIEW_COUNT,
      evictedContentsDestroyed,
      evictedContentsUnregistered,
      survivorContentsRegistered,
      recreatedWithNewWebContents,
      recreatedWithNewJavascriptRealm,
      restoredSerializedState,
      orphanedChildContentsAfterCleanup,
    })}\n`,
  );
  app.quit();
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  app.exit(1);
});
