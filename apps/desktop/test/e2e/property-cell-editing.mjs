// Real Electron renderer regression. All listing writes are intercepted before the server.
// node test/e2e/property-cell-editing.mjs --target=<properties CDP target> --window=1 --output=/absolute/path
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
const exec = promisify(execFile);
const args = Object.fromEntries(
  process.argv.slice(2).map((s) => s.replace(/^--/, '').split('=')),
);
assert(
  args.target && args.window && args.output,
  'Exact target, window and artifact directory required.',
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect(port, targetId) {
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const target = targetId ? targets.find((t) => t.id === targetId) : targets[0];
  assert(target, 'Target missing');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let seq = 0;
  const pending = new Map(),
    listeners = new Set();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data),
      promise = pending.get(msg.id);
    if (promise) {
      pending.delete(msg.id);
      msg.error ? promise.reject(msg.error) : promise.resolve(msg.result);
    } else listeners.forEach((fn) => fn(msg));
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  return { target, send, evaluate, listeners, close: () => ws.close() };
}
const page = await connect(9334, args.target),
  main = await connect(9229);
assert(new URL(page.target.url).pathname === '/properties');
const session = 'estate-cell-improve';
const assertTransportStub = async () =>
  assert(
    await page.evaluate('!!window.__cellEditingRegression'),
    'Transport stub must be active before any test input',
  );
const ab = async (...commands) => {
  await assertTransportStub();
  const result = await exec('agent-browser', [
    '--session',
    session,
    ...commands,
  ]);
  await page.evaluate(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))',
  );
  return result.stdout;
};
const cell = (row, column) =>
  `[data-table-row="${row}"][data-column-id="${column}"]`;
const trigger = (row, column) =>
  `${cell(row, column)} [data-editable-cell-trigger]`;
const input = '[data-cell-edit-popup] input, [data-cell-edit-popup] textarea';
const focus = () =>
  main.evaluate(
    `(() => { const e=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron'); const w=e.BrowserWindow.fromId(${Number(args.window)});e.app.show();e.app.focus({steal:true});w.show();w.focus();w.contentView.children.find(v=>v.webContents?.getURL()===${JSON.stringify(page.target.url)})?.webContents.focus();return true;})()`,
  );
const click = async (selector, count = 1, insetX) => {
  await focus();
  await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
  await page.evaluate(
    `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`,
  );
  await pause(120);
  await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
  await assertTransportStub();
  const point = await page.evaluate(
    `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+${insetX ?? 'r.width/2'},y:r.y+r.height/2}})()`,
  );
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  for (let n = 1; n <= count; n++) {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      buttons: 1,
      clickCount: n,
    });
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      buttons: 0,
      clickCount: n,
    });
  }
  await pause(100);
};
const waitFor = async (expression) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await page.evaluate(expression)) return;
    await pause(100);
  }
  throw new Error(`Timed out: ${expression}`);
};
const errorVisible = `!!document.querySelector('[data-cell-edit-popup] [role=alert]')`;
const editorClosed = `!document.querySelector('[data-cell-edit-popup]')`;
const selected = () =>
  page.evaluate(
    `(()=>{const e=document.querySelector('[data-cell-selected]');return e?{row:e.dataset.tableRow,col:e.dataset.columnId}:null})()`,
  );
const shot = (name) => ab('screenshot', `${args.output}/${name}.png`);
const log = [];
// Keep the transport stub inside the renderer: other CDP clients cannot disable it.
const setMode = (mode) =>
  page.evaluate(`window.__cellEditingRegression.mode=${JSON.stringify(mode)}`);
const getWrites = () => page.evaluate('window.__cellEditingRegression.writes');
const check = (name, condition) => {
  assert(condition, name);
  log.push(name);
  console.log(`PASS ${name}`);
};
await mkdir(args.output, { recursive: true });
let original;
try {
  await page.evaluate(`(() => {
    if (window.__cellEditingRegression) throw new Error('A transport stub is already installed');
    const originalFetch = window.fetch;
    const state = { mode: 'failure', writes: [], pending: 0, restore: () => { window.fetch = originalFetch; delete window.__cellEditingRegression; } };
    window.__cellEditingRegression = state;
    window.fetch = async (resource, init) => {
      const path = new URL(typeof resource === 'string' ? resource : resource.url, location.href).pathname;
      const method = (init?.method ?? resource?.method ?? 'GET').toUpperCase();
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return originalFetch(resource, init);
      const responseCode = state.mode === 'success' ? 200 : state.mode === 'conflict' ? 409 : 500;
      state.writes.push({ path, method, body: init?.body ? JSON.parse(init.body) : null, responseCode });
      state.pending++;
      try {
        await new Promise(resolve => setTimeout(resolve, 900));
        return new Response(JSON.stringify(responseCode === 200 ? {} : { message: 'Cell editor regression response' }), { status: responseCode, headers: { 'Content-Type': 'application/json' } });
      } finally { state.pending--; }
    };
  })()`);
  await focus();
  original = await page.evaluate(
    `({memo:document.querySelector(${JSON.stringify(cell(1, 'memo'))}).innerText,price:document.querySelector(${JSON.stringify(cell(0, 'price'))}).innerText})`,
  );
  await click(trigger(5, 'listingAvailability'));
  check(
    'current status preserved',
    await page.evaluate(
      `document.querySelector('[role=option][aria-selected=true]')?.textContent.trim()==='종료'`,
    ),
  );
  await ab('press', 'ArrowUp');
  check(
    'arrow candidate separate from stored status',
    await page.evaluate(
      `document.activeElement.textContent.trim()==='거래중'&&document.querySelector('[role=option][aria-selected=true]').textContent.trim()==='종료'`,
    ),
  );
  await shot('status-current-and-keyboard');
  await ab('press', 'Escape');
  check(
    'Escape returns focus to table',
    await page.evaluate(
      `document.activeElement.hasAttribute('data-property-table-scroller')`,
    ),
  );
  await click(cell(0, 'dong'));
  await click(trigger(1, 'memo'));
  check(
    'single click opens memo editor',
    await page.evaluate(
      `!!document.querySelector('[data-cell-edit-popup] textarea')`,
    ),
  );
  await waitFor(`document.querySelector('[data-cell-selected]')?.dataset.tableRow==='1'&&document.querySelector('[data-cell-selected]')?.dataset.columnId==='memo'`);
  assert.deepEqual(await selected(), { row: '1', col: 'memo' });
  await ab('fill', '[data-cell-edit-popup] textarea', '첫 줄');
  await ab('press', 'End');
  await ab('press', 'Shift+Enter');
  await ab('keyboard', 'inserttext', '둘째 줄');
  const draft = await page.evaluate(
    `document.querySelector('[data-cell-edit-popup] textarea').value`,
  );
  check(
    'Shift+Enter inserts a line',
    draft.includes('\n') && draft.includes('둘째 줄'),
  );
  await page.evaluate(
    `(()=>{const e=document.querySelector('[data-cell-edit-popup] textarea');e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true}));e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));})()`,
  );
  check(
    'composition keys neither save nor cancel',
    (await getWrites()).length === 0 &&
      (await page.evaluate(
        `!!document.querySelector('[data-cell-edit-popup] textarea')`,
      )),
  );
  await shot('multiline-memo');
  await ab('press', 'Enter');
  await pause(100);
  check(
    'pending feedback and readonly editor',
    await page.evaluate(
      `document.querySelector('[data-cell-edit-popup]').getAttribute('aria-busy')==='true'&&document.querySelector('[data-cell-edit-popup] textarea').readOnly`,
    ),
  );
  await ab('press', 'Enter');
  await waitFor(errorVisible);
  check('one request for repeated Enter', (await getWrites()).length === 1);
  check(
    'failed save keeps draft',
    await page.evaluate(
      `document.querySelector('[data-cell-edit-popup] textarea').value===${JSON.stringify(draft)}&&!!document.querySelector('[data-cell-edit-popup] [role=alert]')`,
    ),
  );
  await shot('memo-save-failed');
  await setMode('conflict');
  await ab('press', 'Enter');
  await waitFor(errorVisible);
  check(
    'conflict keeps draft with explanation',
    await page.evaluate(
      `document.querySelector('[data-cell-edit-popup] [role=alert]').textContent.includes('다른 사용자가 수정')`,
    ),
  );
  await ab('press', 'Escape');
  await click(trigger(0, 'price'));
  check(
    'single click opens price editor',
    await page.evaluate(
      `!!document.querySelector('[data-cell-edit-popup] input')`,
    ),
  );
  await ab('fill', '[data-cell-edit-popup] input', '1,00');
  const beforeInvalid = (await getWrites()).length;
  await ab('press', 'Enter');
  await pause(150);
  check(
    'invalid grouping rejected without request',
    (await getWrites()).length === beforeInvalid &&
      (await page.evaluate(
        `document.querySelector('[data-cell-edit-popup] input').getAttribute('aria-invalid')==='true'`,
      )),
  );
  await shot('invalid-price');
  await ab('fill', '[data-cell-edit-popup] input', '1,000');
  await setMode('failure');
  await ab('press', 'Enter');
  await waitFor(errorVisible);
  check(
    'formatted amount normalized to 1000',
    (await getWrites()).at(-1).body.price === 1000,
  );
  check(
    'optimistic concurrency token preserved',
    typeof (await getWrites()).at(-1).body.expectedUpdatedAt === 'string',
  );
  await setMode('success');
  await ab('press', 'Enter');
  await waitFor(editorClosed);
  check(
    'retry accepted and editor closed',
    await page.evaluate(`!document.querySelector('[data-cell-edit-popup]')`),
  );
  await waitFor(`document.querySelector('[data-cell-selected]')?.dataset.tableRow==='1'&&document.querySelector('[data-cell-selected]')?.dataset.columnId==='price'`);
  assert.deepEqual(await selected(), { row: '1', col: 'price' });
  await ab('press', 'ArrowDown');
  await waitFor(`document.querySelector('[data-cell-selected]')?.dataset.tableRow==='2'&&document.querySelector('[data-cell-selected]')?.dataset.columnId==='price'`);
  assert.deepEqual(await selected(), { row: '2', col: 'price' });
  await ab('press', 'F2');
  check(
    'F2 reopens selected cell',
    await page.evaluate(
      `!!document.querySelector('[data-cell-edit-popup] input')`,
    ),
  );
  await ab('press', 'Tab');
  await waitFor(`document.querySelector('[data-cell-selected]')?.dataset.tableRow==='2'&&document.querySelector('[data-cell-selected]')?.dataset.columnId==='monthlyRent'`);
  assert.deepEqual(await selected(), { row: '2', col: 'monthlyRent' });
  await ab('press', 'Shift+Tab');
  await waitFor(`document.querySelector('[data-cell-selected]')?.dataset.tableRow==='2'&&document.querySelector('[data-cell-selected]')?.dataset.columnId==='price'`);
  assert.deepEqual(await selected(), { row: '2', col: 'price' });
  log.push('Enter, arrows, F2 and Tab share table selection');
  await click(trigger(1, 'memo'));
  check(
    'single click opens memo editor',
    await page.evaluate(
      `!!document.querySelector('[data-cell-edit-popup] textarea')`,
    ),
  );
  await ab('fill', '[data-cell-edit-popup] textarea', '바깥 클릭 저장 검증');
  await setMode('failure');
  await click(cell(0, 'dong'));
  await waitFor(errorVisible);
  check(
    'outside click failure keeps editor and draft',
    await page.evaluate(
      `document.querySelector('[data-cell-edit-popup] textarea')?.value==='바깥 클릭 저장 검증'`,
    ),
  );
  await setMode('success');
  await click(cell(0, 'dong'));
  await waitFor(editorClosed);
  check(
    'outside click success resumes clicked cell',
    !(await page.evaluate(
      `!!document.querySelector('[data-cell-edit-popup]')`,
    )),
  );
  await waitFor(`document.querySelector('[data-cell-selected]')?.dataset.tableRow==='0'&&document.querySelector('[data-cell-selected]')?.dataset.columnId==='dong'`);
  assert.deepEqual(await selected(), { row: '0', col: 'dong' });
  await click(cell(1, 'memo'), 1, 2);
  check(
    'single click on cell padding opens editor',
    await page.evaluate(
      `!!document.querySelector('[data-cell-edit-popup] textarea')`,
    ),
  );
  await ab('fill', '[data-cell-edit-popup] textarea', '다음 입력 셀로 이동');
  await click(trigger(0, 'price'));
  await waitFor(`!!document.querySelector('[data-cell-edit-popup] input')`);
  check(
    'outside click resumes the exact editable cell',
    await page.evaluate(
      `!!document.querySelector('[data-cell-edit-popup] input')&&!document.querySelector('[data-cell-edit-popup] textarea')`,
    ),
  );
  await waitFor(`document.querySelector('[data-cell-selected]')?.dataset.tableRow==='0'&&document.querySelector('[data-cell-selected]')?.dataset.columnId==='price'`);
  assert.deepEqual(await selected(), { row: '0', col: 'price' });
  await ab('press', 'Escape');
  const secondPrice = `${cell(4, 'price')} > div > div:nth-child(2) [data-editable-cell-trigger]`;
  const secondRecord = await page.evaluate(
    `document.querySelector(${JSON.stringify(secondPrice)}).dataset.cellRecordId`,
  );
  await click(secondPrice);
  check(
    'single click targets the second stacked listing',
    await page.evaluate(
      `document.querySelector('[data-editing]').dataset.cellRecordId===${JSON.stringify(secondRecord)}&&document.querySelector('[data-cell-edit-popup] input').value==='130000'`,
    ),
  );
  await ab('press', 'Escape');
  const final = await page.evaluate(
    `({memo:document.querySelector(${JSON.stringify(cell(1, 'memo'))}).innerText,price:document.querySelector(${JSON.stringify(cell(0, 'price'))}).innerText})`,
  );
  assert.deepEqual(
    final,
    original,
    'No persisted values should change; all writes were mocked.',
  );
  log.push('original memo and price unchanged');
  await shot('verified-table');
  console.log(
    JSON.stringify(
      { passed: log, interceptedWrites: (await getWrites()).length },
      null,
      2,
    ),
  );
} finally {
  const writes = await getWrites().catch(() => []);
  await page.evaluate(`(async () => {
    const state = window.__cellEditingRegression;
    if (!state) return;
    while (state.pending) await new Promise(resolve => setTimeout(resolve, 100));
  })()`);
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await page.evaluate('window.__cellEditingRegression?.restore()');
  await writeFile(
    `${args.output}/behavior-results.json`,
    JSON.stringify(
      {
        passed: log,
        writes,
        original,
        transport:
          'renderer fetch stub; failure/conflict/success; non-read requests never forwarded',
        cleanup: 'original fetch restored',
      },
      null,
      2,
    ),
  );
  page.close();
  main.close();
}
