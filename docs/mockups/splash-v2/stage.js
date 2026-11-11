// 스플래시 시안 공용 무대: 로딩 시간·도착 화면·다시 재생을 다루고, 시안은 window.Demo만 정의한다.
(() => {
  const PA = "M19.142 32.872 25.370 77.037 65.571 81 63.306 65.995 41.224 63.164 36.977 35.420Z";
  const PB = "M35.845 19 38.110 34.005 60.758 37.402 64.721 64.580 80.858 66.562 74.347 24.096Z";
  const logo = (cls = "") =>
    `<svg class="${cls}" viewBox="15 15 70 70" aria-hidden="true"><path class="pa" d="${PA}"/><path class="pb" d="${PB}"/></svg>`;
  const qs = new URLSearchParams(location.search);
  const embed = qs.has("embed");
  const opt = { load: +(qs.get("load") || 2000), dest: qs.get("dest") || "app", rm: qs.has("rm") };
  const STEPS = [
    [0, "로그인 확인 중"],
    [0.36, "사무소 정보 불러오는 중"],
    [0.72, "작업 화면 준비 중"],
  ];
  // 실제 로딩처럼 구간마다 속도가 다른 진행률
  const curve = (t) => (t < 0.25 ? t * 1.4 : t < 0.6 ? 0.35 + (t - 0.25) * 0.86 : 0.651 + (t - 0.6) * 0.8725);

  document.documentElement.classList.toggle("embed", embed);
  const win = document.createElement("div");
  win.className = "win";
  win.innerHTML = `<div class="dest"><div class="dest-in"></div></div><div class="splash-host"></div>`;
  document.body.prepend(win);
  const dest = win.querySelector(".dest");
  const destIn = win.querySelector(".dest-in");
  const host = win.querySelector(".splash-host");

  const ctl = document.createElement("div");
  ctl.className = "ctl";
  ctl.innerHTML = `
    <a href="index.html" title="목록">←</a>
    <span class="lb">로딩</span>
    <div class="seg" data-k="load"><button data-v="500">빠름 0.5초</button><button data-v="2000">보통 2초</button><button data-v="8000">느림 8초</button></div>
    <span class="lb">도착</span>
    <div class="seg" data-k="dest"><button data-v="app">앱</button><button data-v="login">로그인</button></div>
    <button data-rm>동작 줄이기</button>
    <button class="go" data-replay>↻ 다시 재생</button>`;
  document.body.append(ctl);

  let raf = 0, timers = [], root = null;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function paintDest() {
    dest.className = `dest dest-${opt.dest}`;
    destIn.className = `dest-in dest-${opt.dest}`;
    destIn.innerHTML =
      opt.dest === "app"
        ? `<img src="../ui-refresh/shot-properties.png" alt="매물관리 화면">`
        : `<form class="login" onsubmit="return false">${logo()}<b>에스테잇플로우</b><h1>로그인</h1><p>사무소 계정으로 업무를 계속합니다.</p>
           <label>아이디<input autocomplete="off"></label><label>비밀번호<input type="password" autocomplete="off"></label>
           <button>로그인</button></form><small>© 2026 Estait Inc.</small>`;
  }
  function syncCtl() {
    ctl.querySelectorAll(".seg").forEach((seg) =>
      seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(opt[seg.dataset.k]) === b.dataset.v)),
    );
    ctl.querySelector("[data-rm]").setAttribute("aria-pressed", opt.rm);
    const q = new URLSearchParams({ load: opt.load, dest: opt.dest });
    if (opt.rm) q.set("rm", "1");
    if (embed) q.set("embed", "1");
    history.replaceState(null, "", "?" + q);
  }
  function setState(name) {
    root.dataset.state = name;
    win.dataset.state = name;
    if (!opt.rm) window.Demo.state?.(name, root);
  }
  function setStatus(text) {
    const el = root.querySelector("[data-status]");
    if (!el || el.dataset.text === text) return;
    el.dataset.text = text;
    el.lastChild.textContent = text;
    el.classList.remove("swap");
    void el.offsetWidth;
    el.classList.add("swap");
  }

  function run() {
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    timers = [];
    const D = window.Demo;
    paintDest();
    syncCtl();
    host.innerHTML = "";
    if (opt.rm) {
      host.innerHTML = `<main class="splash static"><div class="static-mark">${logo()}<div class="brand">에스테잇플로우</div></div></main>`;
    } else {
      host.append(document.getElementById("tpl").content.cloneNode(true));
    }
    root = host.querySelector(".splash");
    root.querySelectorAll("[data-logo]").forEach((el) => (el.innerHTML = logo()));
    root.querySelectorAll(".chars").forEach((el) => {
      el.innerHTML = [...el.textContent].map((c, i) => `<span style="--i:${i}">${c}</span>`).join("");
    });
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="st"><span class="st-t" data-status role="status"><i></i> </span><span class="st-slow" data-slow>평소보다 조금 오래 걸리고 있어요</span></div>`,
    );
    root.style.setProperty("--p", 0);
    setState("loading");
    if (!opt.rm) D.mount?.(root);
    ctl.classList.add("dim");

    const total = opt.rm ? opt.load : Math.max(opt.load, D.min || 900);
    const t0 = performance.now();
    const tick = (now) => {
      const el = now - t0;
      const raw = Math.min(Math.max(el / total, 0), 1);
      const p = curve(raw);
      root.style.setProperty("--p", p.toFixed(4));
      if (!opt.rm) D.progress?.(p, root, el);
      setStatus(STEPS.filter(([at]) => p >= at).pop()[1]);
      if (el > 5000) root.querySelector("[data-slow]").classList.add("on");
      if (raw < 1) return (raf = requestAnimationFrame(tick));
      root.querySelector("[data-slow]").classList.remove("on");
      setStatus(opt.dest === "app" ? "준비 완료" : "로그인이 필요합니다");
      setState("ready");
      later(() => {
        setState("exit");
        later(() => {
          win.dataset.state = "done";
          host.innerHTML = "";
          ctl.classList.remove("dim");
          if (embed) later(run, 1500);
        }, opt.rm ? 160 : D.exitMs || 500);
      }, opt.rm ? 0 : D.readyMs || 300);
    };
    raf = requestAnimationFrame(tick);
  }

  ctl.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const seg = b.closest(".seg");
    if (seg) opt[seg.dataset.k] = seg.dataset.k === "load" ? +b.dataset.v : b.dataset.v;
    if (b.hasAttribute("data-rm")) opt.rm = !opt.rm;
    run();
  });
  addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey && e.target.tagName !== "INPUT") run();
  });
  window.Stage = { logo, PA, PB, run };
  addEventListener("DOMContentLoaded", run);
})();
