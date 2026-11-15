// macOS regression against the real Electron calendar. No calendar records are written.
// node test/e2e/calendar-month-scroll.mjs --target=<CDP target> --window=<Electron window id>
// Requires Electron CDP (9334), main inspector (9229), Swift and event-posting permission.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
assert.equal(process.platform, 'darwin', 'This regression exercises macOS momentum phases.');
assert(args.target && args.window, 'Pass the exact calendar --target and --window.');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect(port, targetId) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targetId ? targets.find(item => item.id === targetId) : targets[0];
  assert(target, 'Debug target not found');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.onmessage = message => {
    const data = JSON.parse(message.data), task = pending.get(data.id);
    if (!task) return;
    pending.delete(data.id);
    data.error ? task.reject(data.error) : task.resolve(data.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description);
    return response.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}
const main = await connect(args.inspect ?? 9229);
const page = await connect(args.port ?? 9334, args.target);
const scratch = mkdtempSync(join(tmpdir(), 'calendar-scroll-regression-'));
const swift = `import CoreGraphics
import Foundation
let x=Double(CommandLine.arguments[1])!, y=Double(CommandLine.arguments[2])!
let sign=Int32(CommandLine.arguments[3])!
guard CGPreflightPostEventAccess() else { fatalError("Event-posting permission is required") }
func send(_ delta:Int32,_ phase:Int64,_ momentum:Int64=0) {
 let event=CGEvent(scrollWheelEvent2Source:nil,units:.pixel,wheelCount:1,wheel1:delta*sign,wheel2:0,wheel3:0)!
 event.location=CGPoint(x:x,y:y)
 event.setIntegerValueField(.scrollWheelEventIsContinuous,value:1)
 event.setIntegerValueField(.scrollWheelEventScrollPhase,value:phase)
 event.setIntegerValueField(.scrollWheelEventMomentumPhase,value:momentum)
 event.post(tap:.cghidEventTap)
 usleep(16000)
}
CGWarpMouseCursorPosition(CGPoint(x:x,y:y))
usleep(50000)
send(12,1)
for _ in 0..<8 { send(12,2) }
send(0,4)
send(9,0,1)
for d:Int32 in [8,6,4,2,1] { send(d,0,2) }
send(0,0,3)
`;
const state = () => page.evaluate(`(() => {
  const e=document.querySelector('[data-month-scroll]'), h=e.firstElementChild.offsetHeight;
  return { base:e.firstElementChild.dataset.monthWeek, top:e.scrollTop, height:h,
    absoluteWeek:Date.parse(e.firstElementChild.dataset.monthWeek)/604800000+e.scrollTop/h,
    snap:getComputedStyle(e).scrollSnapType, rows:e.children.length };
})()`);
try {
  assert(await page.evaluate(`!!document.querySelector('[data-month-scroll]') && !document.querySelector('[data-event-editor]')`), 'Open month view and close the editor first.');
  writeFileSync(join(scratch, 'scroll.swift'), swift);
  execFileSync('swiftc', [join(scratch, 'scroll.swift'), '-o', join(scratch, 'scroll')]);
  for (const direction of [1, -1]) {
    await main.evaluate(`(() => { const w=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron').BrowserWindow.fromId(${Number(args.window)}); w.restore(); w.show(); w.focus(); })()`);
    await pause(150);
    await page.evaluate(`(() => { const e=document.querySelector('[data-month-scroll]'); e.scrollTop=e.firstElementChild.offsetHeight*${direction > 0 ? 12 : 4}; })()`);
    await pause(400);
    const before = await state();
    const point = await page.evaluate(`(() => { const r=document.querySelector('[data-month-scroll]').getBoundingClientRect(); return {x:screenX+r.left+200,y:screenY+outerHeight-innerHeight+r.top+200}; })()`);
    execFileSync(join(scratch, 'scroll'), [String(point.x), String(point.y), String(-direction)]);
    await pause(1600);
    const after = await state();
    await pause(500);
    const settled = await state();
    const movedWeeks = after.absoluteWeek - before.absoluteWeek;
    console.log(JSON.stringify({ direction, inputPixels: direction * 138, movedWeeks, before, after, settled }));
    assert(Math.abs(movedWeeks) <= 2, `A 138px gesture moved ${movedWeeks} weeks`);
    assert(movedWeeks * direction > 0, 'The native gesture did not reach the calendar or moved it backwards');
    assert(Math.abs(settled.absoluteWeek - after.absoluteWeek) < 0.01, 'The calendar continued moving after the gesture settled');
    assert(Math.abs(after.top / after.height - Math.round(after.top / after.height)) < 0.01, 'The calendar did not snap to a week');
    assert.equal(after.rows, 22, 'Buffered week count changed');
    assert.equal(after.snap, 'y mandatory', 'Week snapping was not restored');
    assert.equal(after.top / after.height, 8, 'The week buffer did not recenter after momentum ended');
  }
} finally {
  page.close();
  main.close();
  rmSync(scratch, { recursive: true, force: true });
}
