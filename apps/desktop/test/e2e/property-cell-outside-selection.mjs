// Real Electron regression; all non-read requests are intercepted before the server.
// node test/e2e/property-cell-outside-selection.mjs --target=<CDP target> --output=<directory>
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
assert(args.target && args.output, 'An exact Electron target and output directory are required');
const target = (await (await fetch('http://127.0.0.1:9334/json/list')).json()).find((item) => item.id === args.target);
assert(target && new URL(target.url).pathname === '/properties');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 8000);
  ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
});
let sequence = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data), request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
  pending.set(id, { resolve, reject, timer });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description);
  return result.result.value;
};
const exec = promisify(execFile);
const ab = async (...command) => (await exec('agent-browser', [
  '--session', 'estate-outside-selection', ...command,
], { timeout: 15000 })).stdout;
const tick = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
const waitFor = async (expression) => {
  const deadline = Date.now() + 6000;
  do {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  } while (Date.now() < deadline);
  throw new Error(`Condition timed out: ${expression}`);
};
const click = async (selector) => {
  await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest', inline:'nearest'})`);
  await tick();
  await ab('click', selector);
  await tick();
};
const press = async (key) => { await ab('press', key); await tick(); };
const editor = '[data-cell-edit-popup] input';
const filter = 'input[aria-label="동 검색"]';
const selected = '[data-cell-selected="true"]';
const noSelection = `!document.querySelector('${selected}')`;
const closed = `!document.querySelector('[data-cell-edit-popup], [data-cell-chip-popup]')`;
const passed = [];
const check = async (name, expression) => {
  assert(await evaluate(expression), name);
  passed.push(name);
  console.log(`PASS ${name}`);
};
const shot = (name) => ab('screenshot', `${args.output}/${name}.png`);
await mkdir(args.output, { recursive: true });
let checkbox, toggledCheckbox = false, original, price;
try {
  await ab('connect', target.webSocketDebuggerUrl);
  const tabs = await ab('tab');
  const tab = tabs.split('\n').find((line) => line.trim().endsWith(` - ${target.url}`))?.match(/\[(t\d+)\]/)?.[1];
  assert(tab, 'Exact properties tab must be selected');
  await ab('tab', tab);
  assert.equal((await ab('get', 'url')).trim(), target.url);
  assert(await evaluate(closed), 'Finish any current user edit before running this regression');
  await evaluate(`(() => {
    if (window.__outsideSelectionTest) throw new Error('A test transport is already installed');
    const originalFetch = window.fetch;
    const state = { mode: 'failure', writes: [], pending: 0,
      restore: () => { window.fetch = originalFetch; delete window.__outsideSelectionTest; } };
    window.__outsideSelectionTest = state;
    window.fetch = async (resource, init) => {
      const method = (init?.method ?? resource?.method ?? 'GET').toUpperCase();
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return originalFetch(resource, init);
      const status = state.mode === 'success' ? 200 : 500;
      state.writes.push({ method, status }); state.pending++;
      try {
        await new Promise(r => setTimeout(r, 600));
        return new Response(JSON.stringify(status === 200 ? {} : {message:'Selection regression failure'}),
          {status, headers:{'Content-Type':'application/json'}});
      } finally { state.pending--; }
    };
  })()`);
  const record = await evaluate(`document.querySelectorAll('[data-cell-field="price"]')[document.querySelectorAll('[data-cell-field="price"]').length-1].dataset.cellRecordId`);
  price = `[data-cell-record-id="${record}"][data-cell-field="price"]`;
  original = await evaluate(`document.querySelector(${JSON.stringify(price)}).textContent`);
  await writeFile(`${args.output}/before-snapshot.txt`, await ab('snapshot', '-i'));

  await click(price);
  await click(editor);
  await check('click inside the editor preserves cell selection', `!!document.querySelector('${selected}') && !!document.querySelector('${editor}')`);
  await click(filter);
  await check('unchanged edit closes and deselects on filter click', `${closed} && ${noSelection} && document.activeElement.matches(${JSON.stringify(filter)})`);
  await shot('after-filter-click');

  await click(price);
  await press('Escape');
  await check('Escape ends editing but retains the selected cell', `${closed} && !!document.querySelector('${selected}')`);
  const blank = await evaluate(`(() => {
    const table = document.querySelector('[data-property-table-scroller] > table'), r = table.getBoundingClientRect();
    const x = Math.min(innerWidth - 25, r.left + 700), y = r.bottom + 30;
    const target = document.elementFromPoint(x, y);
    return {x, y, valid: y < innerHeight && target?.hasAttribute('data-property-table-scroller')};
  })()`);
  assert(blank.valid, 'A visible blank area below the final row is required');
  for (const [type, buttons] of [['mouseMoved', 0], ['mousePressed', 1], ['mouseReleased', 0]]) {
    await send('Input.dispatchMouseEvent', { type, x: blank.x, y: blank.y,
      button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  }
  await tick();
  await check('idle cell deselects in blank space inside the scroller', noSelection);
  await shot('after-blank-click');

  checkbox = 'tbody > tr[data-property-row]:first-child [role="checkbox"]';
  const initiallyChecked = await evaluate(`document.querySelector(${JSON.stringify(checkbox)}).getAttribute('aria-checked') === 'true'`);
  if (!initiallyChecked) { await click(checkbox); toggledCheckbox = true; }
  await click(price);
  await click(filter);
  await check('outside click preserves row checkbox selection', `${noSelection} && document.querySelector(${JSON.stringify(checkbox)}).getAttribute('aria-checked') === 'true'`);
  if (toggledCheckbox) { await click(checkbox); toggledCheckbox = false; }

  await click(price);
  await click('button[aria-label="가격/보증금 필터"]');
  await check('the first toolbar click opens its menu and clears the cell', `${closed} && ${noSelection} && document.querySelector('button[aria-label="가격/보증금 필터"]').getAttribute('aria-expanded') === 'true'`);
  await press('Escape');

  await click('td[data-table-row="0"] [data-cell-field="moveInAvailableType"]');
  await click('[data-cell-chip-popup] [role="option"]:nth-child(2)');
  await check('date picker remains part of the selected cell', `!!document.querySelector('[data-cell-chip-popup]') && !!document.querySelector('${selected}')`);
  await click('[data-cell-chip-popup] .rdp-nav button:last-child');
  await check('calendar navigation retains selection without saving', `!!document.querySelector('[data-cell-chip-popup]') && !!document.querySelector('${selected}') && window.__outsideSelectionTest.writes.length === 0`);
  await click(filter);
  await check('outside click closes the date picker and clears selection', `${closed} && ${noSelection}`);

  await click(price);
  await ab('fill', editor, '1,00');
  await click(filter);
  await check('invalid draft stays open and selected without a request', `document.querySelector('${editor}')?.value === '1,00' && !!document.querySelector('[data-cell-edit-popup] [role="alert"]') && !!document.querySelector('${selected}') && window.__outsideSelectionTest.writes.length === 0`);
  await ab('fill', editor, '315001');
  await click(filter);
  await check('pending outside save retains selection', `window.__outsideSelectionTest.pending === 1 && !!document.querySelector('${selected}')`);
  await waitFor(`window.__outsideSelectionTest.pending === 0 && !!document.querySelector('[data-cell-edit-popup] [role="alert"]')`);
  await check('failed outside save keeps the draft and cell selection', `document.querySelector('${editor}')?.value === '315001' && !!document.querySelector('${selected}')`);
  await shot('save-failure-preserved');
  await evaluate(`window.__outsideSelectionTest.mode = 'success'`);
  await click(filter);
  await waitFor(closed);
  await check('successful outside save clears selection', noSelection);
  await waitFor(`document.activeElement.matches(${JSON.stringify(filter)})`);

  const other = '[data-table-row="0"][data-column-id="dong"]';
  await click(price);
  await ab('fill', editor, '315002');
  await click(other);
  await waitFor(`document.querySelector('${selected}')?.dataset.columnId === 'dong'`);
  await check('successful save resumes the next cell selection', `document.querySelector('${selected}')?.dataset.tableRow === '0'`);

  const splitRecord = await evaluate(`(() => {
    const cell = [...document.querySelectorAll('td[data-column-id="price"]')].find(x => x.querySelectorAll('[data-cell-field="price"]').length > 1);
    return cell?.querySelectorAll('[data-cell-field="price"]')[1].dataset.cellRecordId;
  })()`);
  assert(splitRecord, 'A stacked price cell is required');
  const split = `[data-cell-record-id="${splitRecord}"][data-cell-field="price"]`;
  await click(split);
  await press('Escape');
  await press('F2');
  await check('stacked price retains its exact record for keyboard editing', `document.querySelector('[data-editing="true"]')?.dataset.cellRecordId === ${JSON.stringify(splitRecord)}`);
  await click(filter);
  await check('stacked price also deselects outside', `${closed} && ${noSelection}`);
  await check('persisted price remains unchanged', `document.querySelector(${JSON.stringify(price)}).textContent === ${JSON.stringify(original)}`);
  await shot('verified-table');
} finally {
  let writes = [];
  if (await evaluate('!!window.__outsideSelectionTest')) {
    await waitFor('window.__outsideSelectionTest.pending === 0');
    await press('Escape');
    if (toggledCheckbox) await click(checkbox);
    writes = await evaluate('window.__outsideSelectionTest.writes');
    await evaluate('window.__outsideSelectionTest.restore()');
  }
  await writeFile(`${args.output}/results.json`, JSON.stringify({ passed, writes,
    transport: 'All non-read fetch requests intercepted; no business writes forwarded',
    originalPrice: original, cleanup: 'Original fetch restored' }, null, 2));
  ws.close();
}
