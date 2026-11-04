/* 네 데모가 함께 쓰는 상태, 표시 규칙, 시트, 입력 폼. 저장은 이 브라우저의 localStorage에만 합니다. */
(function () {
  "use strict";
  const KEY = "estait-ledger-demos-v1";
  const seed = window.DEMO_SEED;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.v === seed.v) return parsed;
      }
    } catch (e) { /* 저장소를 못 쓰면 초기 데이터로 동작 */ }
    return clone(seed);
  }
  let state = load();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }

  const listeners = [];
  const emit = () => { listeners.forEach((fn) => fn()); renderSheet(); };

  const ME = "u1";
  const TODAY = "2026-11-03";
  const WEEK_END = 5; // 이번 주 일요일까지 남은 일수
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const KIND = { demand: "구함", listing: "내놓음" };
  const TX = { sale: "매매", jeonse: "전세", monthly: "월세" };
  const VERB = { demand: "연락", listing: "확인" };
  const CTYPE = { phone: "전화", visit: "방문", online: "온라인" };
  const STAGES = [
    ["suggested", "제안", 0],
    ["buyerInterested", "관심", 0],
    ["viewingConfirmed", "임장 확정", 1],
    ["viewing", "임장", 1],
    ["negotiating", "협상", 2],
    ["dealCreated", "거래 전환", 3],
  ];
  const BUCKETS = {
    overdue: { label: "지남", rank: 0 },
    today: { label: "오늘", rank: 1 },
    tomorrow: { label: "내일", rank: 2 },
    week: { label: "이번 주", rank: 3 },
    later: { label: "이후", rank: 4 },
    none: { label: "일정 없음", rank: 5 },
  };
  const BUCKET_ORDER = Object.keys(BUCKETS);

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");

  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    jump: '<path d="M7 17 17 7M8 7h9v9"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    swap: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    sort: '<path d="m7 15 5 5 5-5"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M15 4v16"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;

  /* 날짜 */
  function toDate(s) {
    const [d, t] = s.split("T");
    const [y, m, dd] = d.split("-").map(Number);
    const [h = 0, mi = 0] = t ? t.split(":").map(Number) : [];
    return new Date(y, m - 1, dd, h, mi);
  }
  const dayDiff = (s) => Math.round((toDate(s.split("T")[0]) - toDate(TODAY)) / 864e5);
  const fmtDate = (s) => { const d = toDate(s); return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
  const timeOf = (s) => { const t = s.split("T")[1]; return t || ""; };
  function addDays(n) {
    const d = toDate(TODAY);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function bucketOfDate(at) {
    const n = dayDiff(at);
    if (n < 0) return "overdue";
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n <= WEEK_END) return "week";
    return "later";
  }
  const bucketOf = (it) => (it.next ? bucketOfDate(it.next.at) : "none");
  function whenText(at) {
    const n = dayDiff(at);
    const t = timeOf(at);
    if (n < 0) return `${-n}일 지남`;
    if (n === 0) return `오늘${t ? " " + t : ""}`;
    if (n === 1) return `내일${t ? " " + t : ""}`;
    if (n <= WEEK_END) return `${DOW[toDate(at).getDay()]} ${fmtDate(at)}`;
    return fmtDate(at);
  }
  const nextTime = (it) => (it.next ? toDate(it.next.at).getTime() : Infinity);

  /* 금액 */
  function won(v) {
    if (v == null) return "";
    const eok = Math.floor(v / 10000);
    const man = v % 10000;
    if (eok && man) return `${eok}억 ${man.toLocaleString("ko-KR")}`;
    if (eok) return `${eok}억`;
    return man.toLocaleString("ko-KR");
  }
  const range = (a, b, fn) => (a === b ? fn(a) : `${fn(a)}~${fn(b)}`);
  function priceLines(it) {
    if (it.kind === "demand") {
      return [{
        tx: it.tx,
        price: range(it.priceMin, it.priceMax, won),
        rent: it.rentMin != null ? range(it.rentMin, it.rentMax, (x) => x) + "만" : null,
        paused: false,
      }];
    }
    return it.options.map((o) => ({ tx: o.tx, price: won(o.price), rent: o.rent != null ? `${o.rent}만` : null, paused: !!o.paused }));
  }
  const priceKey = (it) => (it.kind === "demand" ? it.priceMin : it.options[0].price);
  const areaText = (it) => (it.kind === "demand" ? range(it.areaMin, it.areaMax, (x) => x) + "평" : `${it.area}평`);
  const areaKey = (it) => (it.kind === "demand" ? it.areaMin : it.area);

  /* 조회 */
  const contact = (id) => state.contacts[id];
  const user = (id) => state.users.find((u) => u.id === id) || null;
  const items = () => state.items;
  const item = (id) => state.items.find((i) => i.id === id);
  const stageInfo = (key) => STAGES.findIndex((s) => s[0] === key);
  function compareItems(a, b) {
    const d = BUCKETS[bucketOf(a)].rank - BUCKETS[bucketOf(b)].rank;
    if (d) return d;
    const t = nextTime(a) - nextTime(b);
    if (t) return t;
    return a.id < b.id ? -1 : 1;
  }
  function consultsOf(cid) {
    const ids = new Set(state.items.filter((i) => i.primary === cid).map((i) => i.id));
    return state.consults
      .filter((k) => ids.has(k.item) || k.contact === cid)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
  function customer(cid) {
    const its = state.items.filter((i) => i.primary === cid).sort(compareItems);
    return { id: cid, contact: contact(cid), items: its, next: its[0] || null, bucket: its[0] ? bucketOf(its[0]) : "none" };
  }
  function customers() {
    const ids = [...new Set(state.items.filter((i) => i.primary).map((i) => i.primary))];
    return ids.map(customer).sort((a, b) => compareItems(a.next, b.next) || (a.contact.name < b.contact.name ? -1 : 1));
  }
  const unknownItems = () => state.items.filter((i) => !i.primary).sort(compareItems);
  function linksOf(id) {
    return state.links.flatMap((l) => {
      if (l.from === id) return [{ ...l, other: item(l.to), dir: "out" }];
      if (l.to === id) return [{ ...l, other: item(l.from), dir: "in" }];
      return [];
    });
  }

  /* 공용 조각 */
  function dueHTML(it, o = {}) {
    if (!it.next) {
      if (it.status === "hold") return `<span class="due due-hold">보류 중</span>`;
      return `<button type="button" class="due due-none" data-work="${it.id}">${icon("plus")}일정 잡기</button>`;
    }
    const b = bucketOf(it);
    const label = `${whenText(it.next.at)} ${VERB[it.kind]}`;
    const note = o.note !== false && it.next.note ? `<div class="due-note" title="${esc(it.next.note)}">${esc(it.next.note)}</div>` : "";
    return `<button type="button" class="due due-${b}" data-work="${it.id}" title="눌러서 상담 기록과 다음 일정 남기기">${esc(label)}</button>${note}`;
  }
  function assignHTML(it) {
    const opts = state.users.map((u) => `<option value="${u.id}"${it.assignee === u.id ? " selected" : ""}>${esc(u.name)}</option>`).join("");
    return `<select class="assign${it.assignee ? "" : " none"}" data-assign="${it.id}" aria-label="${esc(it.title)} 담당"><option value=""${it.assignee ? "" : " selected"}>미배정</option>${opts}</select>`;
  }
  function stageHTML(it) {
    const m = it.matches;
    if (!m || !m.total) return `<span class="dim">—</span>`;
    const i = stageInfo(m.top);
    return `<span class="num">${m.total}건</span> <span class="stage st-${STAGES[i][2]}">${STAGES[i][1]}</span>`;
  }
  function stageBarHTML(it) {
    const i = it.matches && it.matches.total ? stageInfo(it.matches.top) : -1;
    return `<div class="stagebar" role="img" aria-label="매칭 ${it.matches ? it.matches.total : 0}건, 가장 앞선 단계 ${i >= 0 ? STAGES[i][1] : "없음"}">${STAGES.map((s, n) => `<div class="${n === i ? "top" : ""}"><i class="${n === i ? "top" : n < i ? "on" : ""}"></i><span>${s[1]}</span></div>`).join("")}</div>`;
  }
  function peopleText(it) {
    return it.people.filter((p) => p.c !== it.primary).map((p) => `${p.role} ${contact(p.c).name}`).join(" · ");
  }
  function linkHTML(it) {
    return linksOf(it.id).map((l) => {
      const other = l.other;
      const cross = other.primary !== it.primary;
      const who = cross && other.primary ? `${contact(other.primary).name}의 ` : "";
      const arrow = l.dir === "out" ? "→" : "←";
      return `<div class="linkline">${icon("link")}<span class="trunc">연계 · ${esc(l.label)} ${arrow} <button type="button" data-jump="${other.primary}" data-jump-item="${other.id}">${esc(who + other.title)}</button></span></div>`;
    }).join("");
  }
  function relChips(cust, knownIds) {
    return (cust.contact.relations || []).filter((r) => knownIds.has(r.to)).map((r) => `<button type="button" class="rel" data-jump="${r.to}">${esc(r.type)} ${esc(contact(r.to).name)}${icon("jump")}</button>`).join("");
  }
  const knownCustomerIds = () => new Set(state.items.filter((i) => i.primary).map((i) => i.primary));
  function latestText(cid) {
    const k = consultsOf(cid)[0];
    return k ? { at: fmtDate(k.at), text: k.text, type: CTYPE[k.type] } : null;
  }

  /* 변경 */
  function commit(msg, snap) {
    persist();
    emit();
    toast(msg, snap ? () => { state = snap; persist(); emit(); } : null);
  }
  function setAssignee(id, uid) {
    const snap = clone(state);
    const it = item(id);
    it.assignee = uid || null;
    commit(`담당 변경: ${it.title} → ${uid ? user(uid).name : "미배정"}`, snap);
  }
  function setField(id, patch, msg) {
    const snap = clone(state);
    Object.assign(item(id), patch);
    commit(msg, snap);
  }
  function setMany(ids, patch, msg) {
    const snap = clone(state);
    ids.forEach((id) => {
      const it = item(id);
      const p = typeof patch === "function" ? patch(it) : patch;
      Object.assign(it, p);
    });
    commit(msg, snap);
  }
  function logWork(id, { type, text, next, assignee, contactId }) {
    const snap = clone(state);
    const it = item(id);
    const counterpart = contactId || it.primary;
    if (text) {
      const now = new Date();
      state.consults.push({ id: `k${Date.now()}`, at: `${TODAY}T${pad(now.getHours())}:${pad(now.getMinutes())}`, type, contact: counterpart, item: id, by: ME, text });
      it.lastContact = TODAY;
    }
    it.next = next;
    it.assignee = assignee || null;
    const where = next ? `다음 ${VERB[it.kind]} ${whenText(next.at)}` : "다음 일정 없음";
    commit(`${text ? "상담 저장" : "일정 변경"}: ${contact(text ? counterpart : it.primary).name} · ${where}`, snap);
    return it;
  }
  function connectOwner(id, cid) {
    const snap = clone(state);
    const it = item(id);
    it.primary = cid;
    it.people = [{ c: cid, role: "소유자" }];
    commit(`소유자 연결: ${it.title} → ${contact(cid).name}`, snap);
  }
  function createContact(name, phone) {
    const id = `n${Date.now()}`;
    state.contacts[id] = { name, phone: phone || "번호 미입력", relations: [] };
    return id;
  }
  function reset() {
    document.querySelectorAll("form[data-composer]").forEach((f) => f.reset());
    Object.keys(drafts).forEach((k) => delete drafts[k]);
    state = clone(seed);
    persist();
    emit();
    toast("시안 데이터를 처음 상태로 되돌렸습니다");
  }

  /* 알림 */
  let toastTimer = null;
  function toast(msg, undo) {
    let el = document.getElementById("toast");
    if (el) el.remove();
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    el.innerHTML = `<span class="trunc">${esc(msg)}</span>${undo ? `<button type="button">되돌리기</button>` : ""}`;
    document.body.appendChild(el);
    if (undo) el.querySelector("button").addEventListener("click", () => { undo(); el.remove(); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 5000);
  }

  /* 작성 중인 내용은 의뢰별로 보관한다. 상담 대상을 바꿔도 다른 고객이나 의뢰로 섞여 들어가면 안 된다.
     규칙: 폼이 지금 보여 주는 의뢰의 초안은 폼에만 있고 drafts에는 없다. 그래서 초안끼리 덮어쓰지 않는다. */
  const DEFAULT_TYPE = "phone";
  const DEFAULT_WHEN = "d3";
  const drafts = {};
  function readDraft(form) {
    const e = form.elements;
    return { owner: form.dataset.composer, itemId: e.itemId.value, contactId: e.contactId.value, type: e.type.value, text: e.text.value, when: e.when.value, date: e.date.value, note: e.note.value, assignee: e.assignee.value, baseAssignee: form.dataset.baseAssignee };
  }
  function isBlankDraft(d) {
    return !d.text.trim() && !d.note.trim() && d.type === DEFAULT_TYPE && d.when === DEFAULT_WHEN && !d.date && d.assignee === d.baseAssignee && d.contactId === item(d.itemId).primary;
  }
  function storeDraft(d) {
    if (isBlankDraft(d)) delete drafts[d.itemId];
    else drafts[d.itemId] = d;
  }
  /* 폼을 지금 의뢰의 빈 상태로 되돌린다 */
  function clearComposer(form) {
    const e = form.elements;
    e.type.value = DEFAULT_TYPE;
    e.text.value = "";
    e.when.value = DEFAULT_WHEN;
    e.date.value = "";
    e.date.hidden = true;
    e.note.value = "";
    e.assignee.value = form.dataset.baseAssignee;
    e.contactId.value = item(e.itemId.value).primary;
  }
  /* 이 의뢰에 보관해 둔 초안을 폼으로 옮긴다. 그 사이 소유자가 바뀐 의뢰의 초안은 쓰지 않는다. */
  function restoreDraft(form) {
    const id = form.elements.itemId.value;
    const d = drafts[id];
    if (!d) return;
    delete drafts[id];
    if (d.owner === form.dataset.composer) applyDraft(form, d);
  }
  function applyDraft(form, d) {
    const e = form.elements;
    e.type.value = d.type;
    e.text.value = d.text;
    e.when.value = d.when;
    e.date.value = d.date;
    e.date.hidden = d.when !== "custom";
    e.note.value = d.note;
    if ([...e.contactId.options].some((o) => o.value === d.contactId)) e.contactId.value = d.contactId;
    /* 사용자가 폼에서 직접 고른 담당만 유지한다. 그 사이 표에서 바뀐 담당을 옛값으로 덮으면 안 된다. */
    if (d.assignee !== d.baseAssignee) e.assignee.value = d.assignee;
  }
  /* 폼을 다시 그리기 전에 호출한다. 대상이 그대로면 입력값을 돌려주고, 바뀌면 이전 입력을 보관한다. */
  function beginComposer(form, sameTarget) {
    if (!form) return null;
    if (sameTarget) return readDraft(form);
    storeDraft(readDraft(form));
    return null;
  }
  /* 새 폼을 그린 뒤 호출한다. 이어 쓸 입력이 없으면 이 의뢰에 보관해 둔 작성 내용을 되살린다. */
  function finishComposer(form, kept) {
    if (kept) applyDraft(form, kept);
    else restoreDraft(form);
  }

  /* 입력 폼: 상담 기록 + 다음 일정 */
  function personOptions(it, selectedId) {
    return it.people.map((p) => `<option value="${p.c}"${p.c === selectedId ? " selected" : ""}>${esc(contact(p.c).name)} · ${esc(p.role)}</option>`).join("");
  }
  function composerHTML(cust, focusId, o = {}) {
    const focus = cust.items.find((i) => i.id === focusId) || cust.next;
    const itemOpts = cust.items.map((it) => `<option value="${it.id}"${it.id === focus.id ? " selected" : ""}>${KIND[it.kind]} · ${esc(it.title)}</option>`).join("");
    const whoOpts = state.users.map((u) => `<option value="${u.id}"${focus.assignee === u.id ? " selected" : ""}>${esc(u.name)}</option>`).join("");
    const chips = [["today", "오늘"], ["tomorrow", "내일"], ["d3", "3일 뒤"], ["nextmon", "다음 주 월"], ["custom", "날짜 선택"], ["none", "일정 없음"]];
    return `<form class="composer" data-composer="${cust.id}" data-item-id="${focus.id}" data-base-assignee="${focus.assignee || ""}">
      ${cust.items.length > 1
        ? `<select class="ctl" name="itemId" aria-label="어떤 의뢰에 남길지">${itemOpts}</select>`
        : `<input type="hidden" name="itemId" value="${focus.id}"><div class="cmp-target"><span class="badge b-${focus.kind}">${KIND[focus.kind]}</span><span class="trunc">${esc(focus.title)}</span></div>`}
      <label class="cmp-person" data-person${focus.people.length > 1 ? "" : " hidden"}>상담 상대 <select name="contactId">${personOptions(focus, focus.primary)}</select></label>
      <div class="seg" role="radiogroup" aria-label="상담 유형" style="align-self:flex-start">
        ${Object.entries(CTYPE).map(([k, v]) => `<label><input type="radio" name="type" value="${k}"${k === DEFAULT_TYPE ? " checked" : ""}>${v}</label>`).join("")}
      </div>
      <textarea name="text" rows="3" placeholder="상담 내용을 적어 주세요. 비워 두면 일정만 옮깁니다." aria-label="상담 내용"></textarea>
      <fieldset>
        <legend data-next-legend>다음 ${VERB[focus.kind]}</legend>
        <div class="chips">${chips.map(([k, v]) => `<label class="chip"><input type="radio" name="when" value="${k}"${k === DEFAULT_WHEN ? " checked" : ""}>${v}</label>`).join("")}</div>
      </fieldset>
      <input class="ctl" type="date" name="date" min="2026-01-01" aria-label="다음 일정 날짜" hidden>
      <input class="ctl" name="note" placeholder="다음에 할 일 (선택)" aria-label="다음에 할 일">
      <div class="cmp-foot">
        <label class="field">담당 <select name="assignee"><option value="">미배정</option>${whoOpts}</select></label>
        <button type="submit" class="btn primary">${esc(o.saveLabel || "저장")}</button>
      </div>
      ${o.hint ? `<div class="cmp-hint">${esc(o.hint)}</div>` : ""}
    </form>`;
  }
  function resolveNext(form) {
    const when = form.elements.when.value;
    const note = form.elements.note.value.trim();
    const map = { today: addDays(0), tomorrow: addDays(1), d3: addDays(3), nextmon: "2026-11-09" };
    if (when === "none") return { next: null };
    if (when === "custom") {
      const v = form.elements.date.value;
      if (!v) return { error: "날짜를 골라 주세요" };
      return { next: { at: v, note } };
    }
    return { next: { at: map[when], note } };
  }

  /* 오른쪽 시트 */
  let sheet = null;
  function openSheet(cid, o = {}) {
    sheet = { cid, itemId: o.itemId || null, fresh: true };
    renderSheet(true);
  }
  function closeSheet() {
    sheet = null;
    const el = document.getElementById("sheet");
    if (el) {
      const form = el.querySelector("form");
      if (form) storeDraft(readDraft(form));
      el.remove();
    }
    document.body.classList.remove("sheet-open");
    if (handlers.sheetClosed) handlers.sheetClosed();
  }
  function timelineHTML(cid) {
    return `<ul class="timeline">${consultsOf(cid).map((k) => {
      const ctx = item(k.item);
      const other = k.contact !== cid && contact(k.contact) ? ` · 상대 ${esc(contact(k.contact).name)}` : "";
      return `<li><div class="tl-meta num">${fmtDate(k.at)} ${timeOf(k.at)} · ${CTYPE[k.type]} · ${esc((user(k.by) || {}).name || "")}${other}</div><div class="tl-text">${esc(k.text)}</div>${ctx ? `<div class="tl-ctx">${KIND[ctx.kind]} · ${esc(ctx.title)}</div>` : ""}</li>`;
    }).join("") || `<li><div class="tl-meta">기록 없음</div></li>`}</ul>`;
  }
  function renderSheet(focus) {
    let el = document.getElementById("sheet");
    if (!sheet) { if (el) el.remove(); return; }
    const cust = customer(sheet.cid);
    if (!cust.contact || !cust.items.length) { closeSheet(); return; }
    const oldForm = el && el.querySelector("form");
    const sameTarget = !!oldForm && !sheet.fresh && oldForm.dataset.composer === sheet.cid && cust.items.some((i) => i.id === oldForm.elements.itemId.value);
    const kept = beginComposer(oldForm, sameTarget);
    const fresh = sheet.fresh;
    sheet.fresh = false;
    document.body.classList.add("sheet-open");
    if (!el) {
      el = document.createElement("aside");
      el.id = "sheet";
      el.className = "sheet";
      el.setAttribute("role", "dialog");
      document.body.appendChild(el);
    }
    el.setAttribute("aria-label", `${cust.contact.name} 상세`);
    const known = knownCustomerIds();
    const others = state.items.filter((i) => i.people.some((p) => p.c === sheet.cid) && i.primary !== sheet.cid);
    const focusId = kept ? kept.itemId : sheet.itemId;
    const scroll = !fresh && el.querySelector(".sheet-body") ? el.querySelector(".sheet-body").scrollTop : 0;
    el.innerHTML = `
      <div class="sheet-head">
        <div style="min-width:0;flex:1"><div class="sheet-name">${esc(cust.contact.name)}</div><div class="sheet-phone num">${esc(cust.contact.phone)}</div></div>
        <button type="button" class="btn sm" data-fake="전화 연결은 시안에서 동작하지 않습니다">${icon("phone")}전화</button>
        <button type="button" class="icon-btn" data-close-sheet aria-label="닫기">${icon("x")}</button>
      </div>
      ${relChips(cust, known) ? `<div class="sheet-rels">${relChips(cust, known)}</div>` : ""}
      <div class="sheet-body">
        <section class="sheet-sec"><h3 class="sec-title">상담 남기고 다음 일정 잡기</h3>${composerHTML(cust, focusId, { saveLabel: "저장" })}</section>
        <section class="sheet-sec"><h3 class="sec-title">진행 의뢰 ${cust.items.length}건</h3>
          ${cust.items.map((it) => `<div class="mini-item">
            <div class="mini-top"><span class="badge b-${it.kind}">${KIND[it.kind]}</span>${priceLines(it).map((l) => `<span class="tx">${TX[l.tx]}</span>`).join("")}<span class="mini-title trunc">${esc(it.title)}</span>${it.status === "hold" ? `<span class="badge b-hold">보류</span>` : ""}</div>
            <div class="mini-sub num">${priceLines(it).map((l) => `<span${l.paused ? ' class="dim"' : ""}>${esc(l.price)}${l.rent ? " / " + esc(l.rent) : ""}${l.paused ? " (중단)" : ""}</span>`).join("")}<span>${areaText(it)}</span><span>${stageHTML(it)}</span></div>
            ${peopleText(it) ? `<div class="mini-sub">${esc(peopleText(it))}</div>` : ""}
            ${linkHTML(it)}
            <div class="mini-next"><span>${dueHTML(it, { note: false })}</span>${it.next && it.next.note ? `<span class="due-note">${esc(it.next.note)}</span>` : ""}</div>
          </div>`).join("")}
        </section>
        ${others.length ? `<section class="sheet-sec"><h3 class="sec-title">함께 참여 중인 다른 의뢰</h3>${others.map((it) => `<div class="mini-item"><div class="mini-top"><span class="badge b-${it.kind}">${KIND[it.kind]}</span><span class="mini-title trunc">${esc(it.title)}</span></div><div class="mini-sub">${esc(contact(it.primary).name)}의 의뢰 · ${esc((it.people.find((p) => p.c === sheet.cid) || {}).role || "")}</div></div>`).join("")}</section>` : ""}
        <section class="sheet-sec"><h3 class="sec-title">상담 기록</h3>${timelineHTML(sheet.cid)}</section>
      </div>`;
    finishComposer(el.querySelector("form"), kept);
    el.querySelector(".sheet-body").scrollTop = scroll;
    if (focus) el.querySelector("textarea").focus();
  }

  /* 소유자 연결 */
  function openConnect(id, note) {
    const it = item(id);
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.id = "connect-dialog";
    ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="소유자 연결">
      <div class="dialog-head"><h2>소유자 연결</h2><p>${esc(it.title)}${note ? ` · ${esc(note)}` : ""}</p></div>
      <div class="dialog-search"><input placeholder="이름 또는 전화번호로 찾기" aria-label="연락처 찾기"></div>
      <div class="dialog-list"></div>
      <form class="dialog-new"><div class="dialog-new-title">새 고객으로 등록</div><input name="name" placeholder="이름" aria-label="이름" required><input name="phone" placeholder="전화번호" aria-label="전화번호"><button class="btn" type="submit">등록</button></form>
    </div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector(".dialog-search input");
    const list = ov.querySelector(".dialog-list");
    const draw = () => {
      const q = input.value.trim();
      const rows = Object.entries(state.contacts).filter(([, c]) => !q || c.name.includes(q) || c.phone.replace(/-/g, "").includes(q.replace(/-/g, ""))).slice(0, 7);
      list.innerHTML = rows.map(([cid, c]) => `<button type="button" data-pick="${cid}"><span>${esc(c.name)}</span><span class="num" style="color:var(--muted-strong)">${esc(c.phone)}</span></button>`).join("") || `<div class="dialog-empty">찾는 연락처가 없습니다. 아래에서 새로 등록해 주세요.</div>`;
    };
    draw();
    input.addEventListener("input", draw);
    const close = () => ov.remove();
    ov.addEventListener("click", (e) => {
      if (e.target === ov) close();
      const pick = e.target.closest("[data-pick]");
      if (pick) { close(); connectOwner(id, pick.dataset.pick); }
    });
    ov.querySelector(".dialog-new").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = e.target.elements.name.value.trim();
      if (!name) return;
      const cid = createContact(name, e.target.elements.phone.value.trim());
      close();
      connectOwner(id, cid);
    });
    input.focus();
  }

  /* 공용 이벤트 */
  const handlers = { openCustomer: null, work: null, jump: null, saved: null, sheetClosed: null };
  document.addEventListener("click", (e) => {
    const t = e.target;
    const open = t.closest("[data-open-customer]");
    if (open) {
      (handlers.openCustomer || openSheet)(open.dataset.openCustomer);
      return;
    }
    const work = t.closest("[data-work]");
    if (work) {
      const it = item(work.dataset.work);
      if (!it.primary) { openConnect(it.id, "상담을 남기려면 소유자를 먼저 연결합니다"); return; }
      if (handlers.work) handlers.work(it);
      else openSheet(it.primary, { itemId: it.id });
      return;
    }
    const conn = t.closest("[data-connect]");
    if (conn) { openConnect(conn.dataset.connect); return; }
    const jump = t.closest("[data-jump]");
    if (jump) {
      const cid = jump.dataset.jump;
      if (cid && cid !== "null") {
        if (handlers.jump) handlers.jump(cid, jump.dataset.jumpItem);
        else openSheet(cid, { itemId: jump.dataset.jumpItem });
      }
      return;
    }
    if (t.closest("[data-close-sheet]")) { closeSheet(); return; }
    const fake = t.closest("[data-fake]");
    if (fake) { toast(fake.dataset.fake); return; }
    if (t.closest("[data-reset]")) reset();
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("select[data-assign]")) { setAssignee(t.dataset.assign, t.value); return; }
    const form = t.closest("form[data-composer]");
    if (!form) return;
    if (t.name === "itemId") {
      /* 드롭다운도 일정 칩과 같은 대상 전환이다. 쓰던 내용은 원래 의뢰에 두고, 고른 의뢰의 초안을 꺼낸다. */
      const prev = readDraft(form);
      prev.itemId = form.dataset.itemId;
      storeDraft(prev);
      const it = item(t.value);
      form.dataset.itemId = it.id;
      form.dataset.baseAssignee = it.assignee || "";
      form.querySelector("[data-next-legend]").textContent = `다음 ${VERB[it.kind]}`;
      form.elements.contactId.innerHTML = personOptions(it, it.primary);
      form.querySelector("[data-person]").hidden = it.people.length <= 1;
      clearComposer(form);
      restoreDraft(form);
    }
    if (t.name === "when") form.elements.date.hidden = t.value !== "custom";
  });
  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-composer]");
    if (!form) return;
    e.preventDefault();
    const res = resolveNext(form);
    if (res.error) { toast(res.error); form.elements.date.focus(); return; }
    const v = readDraft(form);
    clearComposer(form);
    const it = logWork(v.itemId, { type: v.type, text: v.text.trim(), next: res.next, assignee: v.assignee, contactId: v.contactId });
    if (handlers.saved) handlers.saved(it);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      const form = e.target.closest && e.target.closest("form[data-composer]");
      if (form) { e.preventDefault(); form.requestSubmit(); return; }
    }
    if (e.key === "Escape") {
      const dlg = document.getElementById("connect-dialog");
      if (dlg) { dlg.remove(); return; }
      if (sheet) closeSheet();
    }
  });

  /* 셸 */
  const DEMOS = [
    ["a", "a-action-ledger.html", "할 일 원장"],
    ["b", "b-inbox.html", "오늘 처리함"],
    ["c", "c-sheet.html", "스프레드시트"],
    ["d", "d-team-board.html", "담당자 보드"],
  ];
  const NAV = [
    ["시작", [["grid", "대시보드"]]],
    ["매물·공간", [["home", "매물관리"], ["grid", "관리단지"], ["file", "광고관리"]]],
    ["고객·상담", [["users", "고객 원장", true], ["user", "연락처"], ["msg", "상담기록"]]],
    ["거래·계약", [["swap", "매칭"], ["file", "거래관리"], ["file", "계약서 관리"]]],
    ["업무·운영", [["cal", "일정"], ["check", "업무"]]],
  ];
  function mount({ active, crumb }) {
    const me = user(ME);
    document.getElementById("app").innerHTML = `<div class="app">
      <header class="titlebar">
        <span class="brand-mark">e</span><span class="brand">Estait Flow</span><span class="proto">디자인 시안</span>
        <nav class="demo-nav" aria-label="데모 전환">${DEMOS.map(([k, href, label]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ""}><b>${k.toUpperCase()}</b><span>${label}</span></a>`).join("")}</nav>
        <div class="title-right"><a class="link-btn" href="index.html">전체 비교</a><button type="button" class="link-btn" data-reset>시안 초기화</button><span class="office">고덕 부동산</span></div>
      </header>
      <nav class="sidebar" aria-label="앱 메뉴">
        ${NAV.map(([g, its]) => `<div class="nav-label">${g}</div>${its.map(([ic, l, on]) => `<div class="nav-item${on ? " active" : ""}">${icon(ic)}${l}</div>`).join("")}`).join("")}
        <div class="me"><span class="avatar">${esc(me.name[0])}</span><div>${esc(me.name)}<small>고덕 부동산 · ${esc(me.role)}</small></div></div>
      </nav>
      <main><div class="crumb">고객·상담 <span>/</span> <strong>${esc(crumb)}</strong></div><div id="view"></div></main>
    </div>`;
    return document.getElementById("view");
  }

  window.Demo = {
    ME, TODAY, KIND, TX, VERB, CTYPE, STAGES, BUCKETS, BUCKET_ORDER,
    esc, icon, pad, toDate, dayDiff, fmtDate, timeOf, addDays, whenText, bucketOf, bucketOfDate, nextTime,
    won, range, priceLines, priceKey, areaText, areaKey,
    contact, user, items, item, users: () => state.users, stageInfo, compareItems, consultsOf, customer, customers, unknownItems, linksOf,
    allContacts: () => state.contacts,
    dueHTML, assignHTML, stageHTML, stageBarHTML, peopleText, linkHTML, relChips, knownCustomerIds, latestText,
    setAssignee, setField, setMany, logWork, connectOwner, reset, toast,
    composerHTML, beginComposer, finishComposer, timelineHTML, openSheet, closeSheet, sheetOpen: () => !!sheet, openConnect, handlers, mount,
    on: (fn) => listeners.push(fn),
  };
})();
