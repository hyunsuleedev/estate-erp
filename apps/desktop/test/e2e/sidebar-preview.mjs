// Real Electron regression: hover crosses the titlebar and active-tab WebContents.
// Run on a clean dashboard: node test/e2e/sidebar-preview.mjs --window=1 --port=9334
// No business records are created or updated.
import assert from "node:assert/strict";
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")),
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const clients = [];
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data),
      p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    clearTimeout(p.timer);
    d.error ? p.reject(d.error) : p.resolve(d.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq,
        timer = setTimeout(() => reject(Error("Timeout: " + method)), 6000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw Error(r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  const point = (selector) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
  const move = async (p) =>
    send("Input.dispatchMouseEvent", { type: "mouseMoved", ...p });
  const click = async (selector) => {
    const p = await point(selector);
    await move(p);
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", {
        type,
        ...p,
        button: "left",
        clickCount: 1,
      });
    await pause(300);
  };
  const key = async (key, code, modifiers = 0) => {
    for (const type of ["keyDown", "keyUp"])
      await send("Input.dispatchKeyEvent", { type, key, code, modifiers });
    await pause(300);
  };
  const c = {
    send,
    evaluate,
    point,
    move,
    click,
    key,
    close: () => ws.close(),
  };
  clients.push(c);
  return c;
}
const targets = await (
  await fetch(`http://127.0.0.1:${args.port ?? 9334}/json/list`)
).json();
let bar, page;
const state = () =>
  page.evaluate(
    `(()=>{const e=document.querySelector('[data-app-sidebar]'),g=document.querySelector('[data-slot="sidebar-gap"]');return{preview:!!document.querySelector('[data-preview="true"]'),left:document.querySelector('[data-slot="sidebar-inset"]').getBoundingClientRect().left,gap:g.getBoundingClientRect().width,inert:e.inert,route:location.pathname}})()`,
  );
const passed = [];
try {
  for (const t of targets.filter((t) => t.url.endsWith("/tabbar.html"))) {
    const c = await connect(t);
    const view = await c.evaluate(
      "window.electronBridge.tabs.tabBar.getState()",
    );
    if (view.windowId === Number(args.window ?? 1)) bar = c;
  }
  assert(bar, "Window titlebar not found");
  const view = await bar.evaluate(
    "window.electronBridge.tabs.tabBar.getState()",
  );
  for (const t of targets.filter(
    (t) =>
      t.type === "page" &&
      !t.url.includes("tabbar") &&
      t.url.startsWith("http://localhost:"),
  )) {
    const c = await connect(t);
    const id = await c.evaluate("window.electronBridge?.surface?.tabId");
    if (id === view.activeTabId) page = c;
  }
  assert(page, "Active tab not found");
  assert.equal(
    (await state()).route,
    "/dashboard",
    "Use a clean dashboard for this UI regression",
  );
  const trigger = '[data-slot="sidebar-trigger"]';
  if (view.sidebarOpen) await bar.click(trigger);
  await bar.move({ x: 400, y: 20 });
  await pause(350);
  assert.equal((await state()).gap, 0);
  assert.equal((await state()).left, 0);
  assert.equal((await state()).inert, true);
  passed.push("hidden has zero width and is not focusable");
  await bar.move(await bar.point(trigger));
  await pause(70);
  await bar.move({ x: 400, y: 20 });
  await pause(450);
  assert.equal((await state()).preview, false);
  passed.push("brief hover does not open");
  const show = async () => {
    await bar.move({ x: 400, y: 20 });
    await bar.move(await bar.point(trigger));
    await pause(550);
    assert.equal((await state()).preview, true);
    assert.equal((await state()).left, 0);
  };
  await show();
  passed.push("hover opens over content without resizing it");
  await bar.move({ x: 400, y: 20 });
  await page.move({ x: 120, y: 70 });
  await pause(550);
  assert.equal((await state()).preview, true);
  passed.push("crossing from titlebar to panel keeps it open");
  await page.move({ x: 700, y: 100 });
  await pause(550);
  assert.equal((await state()).preview, false);
  passed.push("leaving closes");
  await page.move({ x: 1, y: 200 });
  await pause(500);
  assert.equal((await state()).preview, false);
  passed.push("left screen edge does not open it");
  await show();
  await page.key("Escape", "Escape");
  assert.equal((await state()).preview, false);
  passed.push("Escape dismisses");
  await show();
  await page.click("h1");
  assert.equal((await state()).preview, false);
  passed.push("outside click dismisses");
  await show();
  await page.click('[data-slot="sidebar-footer"] button');
  await pause(500);
  assert.equal((await state()).preview, true);
  assert.equal(
    await page.evaluate('!!document.querySelector("[role=menu]")'),
    true,
  );
  passed.push("account menu keeps the temporary panel open");
  await page.key("Escape", "Escape");
  await page.move({ x: 700, y: 100 });
  await pause(500);
  assert.equal((await state()).preview, false);
  passed.push("leaving after closing the account menu dismisses");
  await show();
  await page.click('[aria-label="사이드바 고정"]');
  assert.equal((await state()).preview, false);
  assert.equal((await state()).left, 256);
  passed.push("pin reserves space");
  await page.send("Page.reload");
  await pause(1000);
  assert.equal((await state()).left, 256);
  passed.push("pin survives renderer reload");
  await bar.click(trigger);
  await show();
  await page.click('a[href="/calendar"]');
  await pause(400);
  assert.equal((await state()).route, "/calendar");
  assert.equal((await state()).preview, false);
  assert.equal((await state()).left, 0);
  passed.push("navigation dismisses without pinning");
  await page.key("\\", "Backslash", view.platform === "darwin" ? 4 : 2);
  assert.equal((await state()).left, 256);
  passed.push("keyboard shortcut pins");
  await page.click('a[href="/dashboard"]');
  console.log(JSON.stringify({ passed: passed.length, checks: passed }));
} finally {
  for (const c of clients) c.close();
}
