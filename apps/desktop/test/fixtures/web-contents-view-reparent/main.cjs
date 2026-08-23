const { once } = require('node:events');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const {
  app,
  BrowserWindow,
  WebContentsView,
  webContents,
} = require('electron');

const RESULT_PREFIX = 'WCV_REPARENT_RESULT:';
const SOURCE_BOUNDS = { x: 11, y: 17, width: 452, height: 316 };
const TARGET_BOUNDS = { x: 23, y: 29, width: 518, height: 344 };

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function closeWindow(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  const closed = once(window, 'closed');
  window.close();
  await closed;
}

async function waitForInPageNavigation(contents) {
  await Promise.race([
    once(contents, 'did-navigate-in-page'),
    delay(2_000).then(() => {
      throw new Error('Timed out waiting for in-page history navigation');
    }),
  ]);
}

async function run() {
  await app.whenReady();
  app.on('window-all-closed', () => {});

  const canExerciseOsFocus = process.env.CI !== 'true';
  const sourceWindow = new BrowserWindow({
    title: 'WCV source host',
    width: 520,
    height: 410,
    x: 40,
    y: 80,
    show: canExerciseOsFocus,
    skipTaskbar: true,
    webPreferences: { sandbox: true },
  });
  const targetWindow = new BrowserWindow({
    title: 'WCV target host',
    width: 600,
    height: 450,
    x: 620,
    y: 80,
    show: false,
    skipTaskbar: true,
    webPreferences: { sandbox: true },
  });

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  const contents = view.webContents;
  const originalWebContentsId = contents.id;
  let didFinishLoadAfterInitialLoad = 0;

  sourceWindow.contentView.addChildView(view);
  view.setBounds(SOURCE_BOUNDS);
  await contents.loadFile(path.join(__dirname, 'page.html'));
  contents.on('did-finish-load', () => {
    didFinishLoadAfterInitialLoad += 1;
  });

  if (canExerciseOsFocus) {
    sourceWindow.show();
    sourceWindow.focus();
    contents.focus();
  }

  await contents.executeJavaScript(`(() => {
    const input = document.getElementById('stateful-input');
    input.value = '상태 유지 3401동';
    input.focus();
    input.setSelectionRange(4, 7);
    window.scrollTo(0, 780);
    // History navigation has its own automatic scroll restoration semantics.
    // Disable that independent behavior so this fixture measures whether the
    // live WebContents itself survived reparenting, not whether Chromium chose
    // to restore a prior history entry's scroll offset a frame later.
    history.scrollRestoration = 'manual';
    history.pushState({ step: 1 }, '', '#one');
    history.pushState({ step: 2 }, '', '#two');
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  })()`);
  await delay(40);

  const rendererProcessIdBefore = contents.getOSProcessId();
  const stateBefore = await contents.executeJavaScript(`({
    value: document.getElementById('stateful-input').value,
    selectionStart: document.getElementById('stateful-input').selectionStart,
    selectionEnd: document.getElementById('stateful-input').selectionEnd,
    activeElementId: document.activeElement?.id ?? null,
    scrollY: window.scrollY,
    hash: location.hash,
    historyLength: history.length,
    identityNonce: window.__fixtureIdentity.nonce,
    tick: window.__fixtureTick,
  })`);

  const reparentStartedAt = performance.now();
  sourceWindow.contentView.removeChildView(view);
  targetWindow.contentView.addChildView(view);
  view.setBounds(TARGET_BOUNDS);
  const synchronousReparentMilliseconds = performance.now() - reparentStartedAt;

  const postReparentProbeStartedAt = performance.now();
  const stateImmediatelyAfter = await contents.executeJavaScript(`({
    value: document.getElementById('stateful-input').value,
    selectionStart: document.getElementById('stateful-input').selectionStart,
    selectionEnd: document.getElementById('stateful-input').selectionEnd,
    activeElementId: document.activeElement?.id ?? null,
    scrollY: window.scrollY,
    hash: location.hash,
    historyLength: history.length,
    identityNonce: window.__fixtureIdentity.nonce,
    tick: window.__fixtureTick,
  })`);
  const firstProbeAfterReparentMilliseconds =
    performance.now() - postReparentProbeStartedAt;

  if (canExerciseOsFocus) {
    targetWindow.show();
    targetWindow.focus();
    contents.focus();
    await delay(50);
  }

  const osFocusAfterReparent = canExerciseOsFocus
    ? contents.isFocused()
    : null;
  const rendererProcessIdAfter = contents.getOSProcessId();
  const appliedTargetBounds = view.getBounds();

  assertCondition(contents.id === originalWebContentsId, 'webContents.id changed');
  assertCondition(
    rendererProcessIdAfter === rendererProcessIdBefore,
    'renderer process changed during reparent',
  );
  assertCondition(
    stateImmediatelyAfter.identityNonce === stateBefore.identityNonce,
    'JavaScript realm was recreated',
  );
  assertCondition(
    stateImmediatelyAfter.value === stateBefore.value,
    'input value was not preserved',
  );
  assertCondition(
    stateImmediatelyAfter.selectionStart === stateBefore.selectionStart &&
      stateImmediatelyAfter.selectionEnd === stateBefore.selectionEnd,
    'input selection was not preserved',
  );
  assertCondition(
    stateImmediatelyAfter.activeElementId === 'stateful-input',
    'DOM focus was not preserved immediately after reparent',
  );
  assertCondition(
    stateImmediatelyAfter.scrollY === stateBefore.scrollY,
    `scroll position was not preserved (${stateBefore.scrollY} -> ${stateImmediatelyAfter.scrollY})`,
  );
  assertCondition(
    stateImmediatelyAfter.hash === '#two' &&
      stateImmediatelyAfter.historyLength === stateBefore.historyLength,
    'history state was not preserved',
  );
  assertCondition(
    stateImmediatelyAfter.tick >= stateBefore.tick,
    'renderer runtime stopped or restarted',
  );
  assertCondition(
    JSON.stringify(view.getBounds()) === JSON.stringify(TARGET_BOUNDS),
    'target bounds were not applied',
  );
  if (canExerciseOsFocus) {
    assertCondition(osFocusAfterReparent, 'OS-level webContents focus failed');
  }

  const inspectionPauseMilliseconds = Number.parseInt(
    process.env.ESTATE_WCV_INSPECTION_PAUSE_MS ?? '0',
    10,
  );
  if (inspectionPauseMilliseconds > 0) {
    await delay(inspectionPauseMilliseconds);
  }

  const navigation = waitForInPageNavigation(contents);
  await contents.executeJavaScript('history.back()');
  await navigation;
  const stateAfterHistoryBack = await contents.executeJavaScript(`({
    value: document.getElementById('stateful-input').value,
    scrollY: window.scrollY,
    hash: location.hash,
    identityNonce: window.__fixtureIdentity.nonce,
  })`);
  assertCondition(
    stateAfterHistoryBack.hash === '#one',
    'history navigation failed after reparent',
  );
  assertCondition(
    stateAfterHistoryBack.value === stateBefore.value &&
      stateAfterHistoryBack.scrollY === stateBefore.scrollY &&
      stateAfterHistoryBack.identityNonce === stateBefore.identityNonce,
    'state changed after post-reparent history navigation',
  );

  await closeWindow(sourceWindow);
  const stateAfterSourceWindowClosed = await contents.executeJavaScript(`({
    value: document.getElementById('stateful-input').value,
    destroyed: false,
    identityNonce: window.__fixtureIdentity.nonce,
  })`);
  assertCondition(
    !contents.isDestroyed() &&
      stateAfterSourceWindowClosed.value === stateBefore.value &&
      stateAfterSourceWindowClosed.identityNonce === stateBefore.identityNonce,
    'reparented view died when its former host window closed',
  );
  const survivedSourceWindowClose = !contents.isDestroyed();

  const trackedContentsBeforeExplicitClose =
    webContents.fromId(originalWebContentsId) === contents;
  targetWindow.contentView.removeChildView(view);
  const destroyed = once(contents, 'destroyed');
  contents.close();
  await destroyed;
  const orphanAfterExplicitClose = webContents.fromId(originalWebContentsId);
  const trackedAfterExplicitClose = webContents
    .getAllWebContents()
    .some((candidate) => candidate.id === originalWebContentsId);

  assertCondition(
    trackedContentsBeforeExplicitClose,
    'view webContents was not tracked before explicit close',
  );
  assertCondition(contents.isDestroyed(), 'explicit close did not destroy webContents');
  assertCondition(
    orphanAfterExplicitClose == null && !trackedAfterExplicitClose,
    'orphan webContents remained after explicit close',
  );

  await closeWindow(targetWindow);

  const result = {
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    platform: `${process.platform}-${process.arch}`,
    originalWebContentsId,
    sameWebContentsId: contents.id === originalWebContentsId,
    sameRendererProcess: rendererProcessIdAfter === rendererProcessIdBefore,
    rendererProcessId: rendererProcessIdAfter,
    inputValuePreserved: stateImmediatelyAfter.value === stateBefore.value,
    inputSelectionPreserved:
      stateImmediatelyAfter.selectionStart === stateBefore.selectionStart &&
      stateImmediatelyAfter.selectionEnd === stateBefore.selectionEnd,
    domFocusImmediatelyPreserved:
      stateImmediatelyAfter.activeElementId === 'stateful-input',
    osFocusExercised: canExerciseOsFocus,
    osFocusAfterReparent,
    scrollPositionPreserved: stateImmediatelyAfter.scrollY === stateBefore.scrollY,
    historyPreserved:
      stateImmediatelyAfter.hash === '#two' &&
      stateAfterHistoryBack.hash === '#one',
    javascriptRealmPreserved:
      stateImmediatelyAfter.identityNonce === stateBefore.identityNonce,
    runtimeContinued: stateImmediatelyAfter.tick >= stateBefore.tick,
    sourceBounds: SOURCE_BOUNDS,
    targetBounds: appliedTargetBounds,
    didFinishLoadAfterInitialLoad,
    survivedSourceWindowClose,
    explicitlyDestroyed: contents.isDestroyed(),
    orphanAfterExplicitClose: orphanAfterExplicitClose != null,
    synchronousReparentMilliseconds,
    firstProbeAfterReparentMilliseconds,
  };

  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`);
  app.quit();
}

run().catch(async (error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  app.exit(1);
});
