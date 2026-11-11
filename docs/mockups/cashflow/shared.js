/* 시안 공통 코드: 앱 셸, 저장소, 표기, 팝오버·다이얼로그, 거래 상세. 실제 앱에는 포함되지 않는다. */
(function () {
  'use strict';

  const SEED = window.DEMO_SEED;
  const KEY = 'estait-cashflow-demo-v4';
  const OLD_KEYS = ['estait-cashflow-demo-v1', 'estait-cashflow-demo-v2', 'estait-cashflow-demo-v3'];
  const VIEW_PREFS = ['side', 'ledger-cols'];

  /* 이전 버전이 남긴 금액은 지금 규칙으로 되살릴 수 없다. v1은 분배마다 정산 여부만 저장해 부분수금을
     얼마나 정산했는지 알 수 없고, v2는 반올림 규칙이 달라 정산을 끝낸 청구에 잔액이 다시 생기며 소수 금액이
     남아 있으면 수금을 끝낼 수 없다. v3는 입금을 청구마다 한 건으로 덮어써 나눠 받은 입금의 날짜와 증빙을
     되살릴 수 없다. 가상 데이터이므로 버리고 처음 상태로 시작하되 표시 설정은 옮긴다. */
  function dropOldData() {
    try {
      let had = false;
      OLD_KEYS.forEach((old) => {
        had = had || localStorage.getItem(old) !== null;
        localStorage.removeItem(old);
        VIEW_PREFS.forEach((pref) => {
          const value = localStorage.getItem(`${old}:${pref}`);
          if (value !== null) localStorage.setItem(`${KEY}:${pref}`, value);
          localStorage.removeItem(`${old}:${pref}`);
        });
      });
      return had;
    } catch (e) { return false; }
  }
  const droppedOldData = dropOldData();
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 저장소를 못 쓰면 기본값으로 동작한다 */ }
    return fresh();
  }

  /* 계산 함수가 모두 정의된 뒤 파일 끝에서 불러온다 */
  let db = null;
  const listeners = new Set();
  function commit() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* noop */ }
    listeners.forEach((fn) => fn());
  }

  // ── 표기 ───────────────────────────────────────────
  const TODAY = SEED.today;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, cls) => `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${window.ICONS[n] || ''}</svg>`;
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const parse = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

  function money(n) {
    if (n == null || n === 0 || Number.isNaN(n)) return '—';
    const a = Math.abs(n);
    const t = a >= 10000
      ? (a % 10000 === 0 ? `${Math.floor(a / 10000)}억` : `${Math.floor(a / 10000)}억 ${(a % 10000).toLocaleString()}만`)
      : `${a.toLocaleString()}만`;
    return n < 0 ? `-${t}` : t;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => (d ? d.replace(/-/g, '.') : '—');
  const md = (d) => { if (!d) return '—'; const x = parse(d); return `${pad(x.getMonth() + 1)}.${pad(x.getDate())}`; };
  const mdw = (d) => { if (!d) return '—'; const x = parse(d); return `${pad(x.getMonth() + 1)}.${pad(x.getDate())} (${WEEK[x.getDay()]})`; };
  const daysFrom = (d) => Math.round((parse(d) - parse(TODAY)) / 86400000);
  function rel(d) {
    if (!d) return '';
    const n = daysFrom(d);
    if (n === 0) return '오늘';
    return n > 0 ? `D-${n}` : `${-n}일 경과`;
  }
  const monthKey = (y, m) => `${y}-${pad(m)}`;

  // ── 상태 표기 (lib/status-config.ts와 같은 라벨·색) ──
  const STATUS = {
    commission: {
      draft: ['작성중', 't-gray'], pending: ['수금대기', 't-warning'], partial: ['부분수금', 't-orange'],
      collected: ['수금완료', 't-success'], overdue: ['연체', 't-destructive'], waived: ['면제', 't-gray'], cancelled: ['취소', 't-gray'],
    },
    stage: {
      preparing: ['계약 준비', 't-gray'], preContract: ['가계약', 't-violet'], contracted: ['본계약', 't-info'],
      settling: ['중도금/잔금', 't-orange'], completed: ['잔금완료', 't-success'], closed: ['정산종료', 't-neutral'],
    },
    tx: { sale: ['매매', 'tx-sale'], jeonse: ['전세', 'tx-jeonse'], monthly: ['월세', 'tx-monthly'] },
  };
  const badge = (kind, s) => { const m = STATUS[kind][s] || [s, 't-gray']; return `<span class="badge ${m[1]}">${esc(m[0])}</span>`; };
  const statusLabel = (kind, s) => (STATUS[kind][s] || [s])[0];

  const ROLE = { owner: '대표', manager: '매니저', agent: '중개사' };
  const PART_ROLE = { listing_agent: '매도측', buying_agent: '매수측', dual_agent: '단독중개', manager: '관리', assistant: '보조', closer: '마감' };
  const PAY_TYPE = { fixed: '고정급', mixed: '혼합', commission_only: '수수료제' };
  const ADJ = { discount: '할인 합의', waive: '면제', bad_debt: '대손 처리' };
  const METHOD = { transfer: '계좌이체', cash: '현금', card: '카드', other: '기타' };
  const KIND = { housing: '주택', officetel: '주거용 오피스텔', non_housing: '주택 외 (상가·토지·업무용)' };
  const EVIDENCE = { cash_receipt: '현금영수증', tax_invoice: '세금계산서', card: '카드 결제', partner: '파트너 발행' };
  const PAYER = { person: '개인', business: '사업자' };
  const TAX_TYPE = { business: '사업소득 3.3%', wage: '근로소득', none: '대표 몫' };
  const VAT_RATE = 0.1;
  /** 만원 단위 소수 첫째 자리(천 원)까지 */
  const round1 = (n) => Math.round(n * 10) / 10;
  const addDays = (d, n) => { const x = parse(d); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

  // ── 계산 ───────────────────────────────────────────
  const sideLabel = (p) => (p.clientSide === 'seller' ? '매도측' : '매수측');
  const partnerOf = (deal) => (deal.partnerBrokerId ? SEED.partners.find((b) => b.id === deal.partnerBrokerId) : null);
  const loc = (deal) => [deal.siteName, deal.dongName, deal.unitName].filter(Boolean).join(' ') || '매물 미지정';
  const payerName = (deal, p) => (p.clientSide === 'seller' ? deal.sellerContactName : deal.buyerContactName);
  const isClosedPay = (p) => p.status === 'waived' || p.status === 'cancelled';
  const hasOpenStatus = (p) => p.status === 'pending' || p.status === 'partial' || p.status === 'overdue';

  /** 다 받은 청구. 상태가 부분수금이어도 할인으로 남은 돈이 없으면 다 받은 것으로 본다. */
  const isPayDone = (p) => p.status === 'collected' || (hasOpenStatus(p) && p.expectedAmount - (p.actualAmount || 0) <= 0);
  /** 수금 처리를 할 수 있는, 아직 돈이 다 안 들어온 청구 */
  const isOpenPay = (p) => hasOpenStatus(p) && !isPayDone(p);

  /** 실제로 들어온 돈. 취소는 없던 일로 본다. */
  function received(p) {
    if (p.status === 'cancelled') return 0;
    if (p.status === 'collected') return p.actualAmount == null ? p.expectedAmount : p.actualAmount;
    return p.actualAmount || 0;
  }
  /** 청구로 남는 금액. 면제·대손은 그때까지 받은 돈까지만 남는다. */
  function billable(p) {
    if (p.status === 'waived') return received(p);
    return p.status === 'cancelled' ? 0 : p.expectedAmount;
  }
  /** 합계와 건수에 넣는 청구. 받은 돈 없이 면제·취소된 청구만 뺀다. */
  const countsAsBilled = (p) => !isClosedPay(p) || received(p) > 0;
  const collectPct = (got, billed) => (billed > 0 ? Math.min(100, Math.round((got / billed) * 100)) : 0);

  function remaining(p) {
    if (isClosedPay(p) || p.status === 'collected') return 0;
    return Math.max(0, p.expectedAmount - (p.actualAmount || 0));
  }
  const effectiveDue = (p) => (p.status === 'partial' && p.agreedRemainingDate ? p.agreedRemainingDate : p.dueDate);
  function isOverdue(p) {
    if (!isOpenPay(p)) return false;
    if (p.status === 'overdue') return true;
    const due = effectiveDue(p);
    return !!due && due < TODAY;
  }
  /** 화면에 보이는 상태: 남은 돈이 없으면 수금완료, 기한이 지났으면 연체 */
  const payStatus = (p) => (isPayDone(p) ? 'collected' : isOverdue(p) ? 'overdue' : p.status);

  // ── 법정 상한 (공인중개사법 시행규칙, 2021년 10월 개정) ──
  /** 요율 계산 기준 금액. 월세는 보증금 + 월세 × 100, 그 값이 5천만 미만이면 × 70 */
  function commissionBase(deal) {
    if (deal.transactionType === 'monthly') {
      const dep = deal.agreedDeposit || 0;
      const rent = deal.agreedMonthlyRent || 0;
      const base = dep + rent * 100;
      return base < 5000 ? dep + rent * 70 : base;
    }
    return deal.agreedPrice || 0;
  }
  /** 한쪽에 받을 수 있는 상한 요율(%)과 한도액(만원). 앱은 임대차 12억~15억을 0.6%로 잘못 계산한다. */
  function legalRate(tx, base, kind) {
    if (kind === 'non_housing') return { rate: 0.9, limit: null };
    if (kind === 'officetel') return { rate: tx === 'sale' ? 0.5 : 0.4, limit: null };
    if (tx === 'sale') {
      if (base < 5000) return { rate: 0.6, limit: 25 };
      if (base < 20000) return { rate: 0.5, limit: 80 };
      if (base < 90000) return { rate: 0.4, limit: null };
      if (base < 120000) return { rate: 0.5, limit: null };
      if (base < 150000) return { rate: 0.6, limit: null };
      return { rate: 0.7, limit: null };
    }
    if (base < 5000) return { rate: 0.5, limit: 20 };
    if (base < 10000) return { rate: 0.4, limit: 30 };
    if (base < 60000) return { rate: 0.3, limit: null };
    if (base < 120000) return { rate: 0.4, limit: null };
    if (base < 150000) return { rate: 0.5, limit: null };
    return { rate: 0.6, limit: null };
  }
  /** 거래 조건으로 계산한 상한. 금액은 넘지 않도록 내림한다. */
  function legalCap(deal, override) {
    const d = Object.assign({}, deal, override || {});
    const base = commissionBase(d);
    const r = legalRate(d.transactionType, base, d.propertyKind || 'housing');
    const raw = Math.floor((base * r.rate) / 100);
    return { base, rate: r.rate, limit: r.limit, amount: r.limit != null ? Math.min(raw, r.limit) : raw };
  }
  const capText = (c) => `법정 상한 ${money(c.amount)} (${money(c.base)} × ${c.rate}%${c.limit != null ? ` · 한도 ${money(c.limit)}` : ''})`;
  /** 상한을 넘는 금액. 면제·취소한 청구는 보지 않는다. */
  function overCap(deal, p) {
    if (isClosedPay(p)) return 0;
    const c = legalCap(deal);
    return c.base > 0 ? Math.max(0, p.expectedAmount - c.amount) : 0;
  }
  /** 청구에 적용된 실제 요율(%) */
  const effRate = (deal, p) => { const base = p.baseAmount || commissionBase(deal); return base > 0 ? Math.round((p.expectedAmount / base) * 10000) / 100 : null; };

  // ── 입금 건별 기록과 증빙 ─────────────────────────
  /** 입금 목록에서 청구의 수금액·마지막 입금일을 다시 만든다. 화면 계산은 이 두 값을 쓴다. */
  function syncReceipts(p) {
    const rs = p.receipts;
    p.actualAmount = rs.length ? rs.reduce((a, r) => a + r.amount, 0) : null;
    const last = rs[rs.length - 1];
    p.paidAt = last ? last.date : null;
    p.method = last ? last.method : null;
  }
  const evidenceDone = (r) => r.evidenceType === 'card' || r.evidenceType === 'partner' || !!r.evidenceDate;
  /** 증빙 기한: 현금영수증은 받은 날부터 5일, 세금계산서는 다음 달 10일 */
  function evidenceDue(r) {
    if (r.evidenceType === 'tax_invoice') { const x = parse(r.date); return `${x.getMonth() === 11 ? x.getFullYear() + 1 : x.getFullYear()}-${pad(x.getMonth() === 11 ? 1 : x.getMonth() + 2)}-10`; }
    return addDays(r.date, 5);
  }
  const pendingEvidence = (p) => (p.collectedByOffice === 'us' ? p.receipts.filter((r) => !evidenceDone(r)) : []);
  const defaultEvidence = (p, method) => (p.collectedByOffice !== 'us' ? 'partner' : method === 'card' ? 'card' : p.payerType === 'business' ? 'tax_invoice' : 'cash_receipt');

  // ── 이력 ───────────────────────────────────────────
  function log(target, text) {
    (target.history = target.history || []).push({ at: TODAY, by: me().name, text });
  }

  // ── 분배 ───────────────────────────────────────────
  const isPartnerRow = (d) => d.recipientType === 'partner_broker';
  const partnerRatioOf = (rows) => rows.filter(isPartnerRow).reduce((a, d) => a + Number(d.shareRatio), 0);
  const partnerIdOf = (rows) => { const row = rows.find(isPartnerRow); return row ? row.partnerBrokerId : null; };
  const ourRatioFrom = (partnerRatio) => Math.round((100 - partnerRatio) * 100) / 100;
  const partnerById = (id) => SEED.partners.find((b) => b.id === id) || null;

  /** 이 분배에서 이미 주고받은 금액 */
  const settledAmountOf = (d) => d.settledAmount || 0;

  /** 서버 computeDistributionRows와 같은 규칙: 행마다 내림하고 나머지는 우리 몫(없으면 첫 행)에 준다. */
  function ratioAmounts(amount, rows) {
    const amounts = rows.map((d) => Math.floor((amount * Number(d.shareRatio)) / 100));
    const rest = amount - amounts.reduce((a, v) => a + v, 0);
    if (rest && rows.length) {
      const our = rows.findIndex((d) => d.recipientType === 'our_office');
      amounts[our >= 0 ? our : 0] += rest;
    }
    return amounts;
  }
  /** 지금 금액 기준의 행별 금액. 정산을 끝낸 행은 실제로 주고받은 금액을 유지하고 나머지 행에서 맞춘다. */
  function splitRows(amount, rows) {
    const isOpenRow = (d) => d.status !== 'settled';
    const amounts = rows.map((d) => (isOpenRow(d) ? Math.floor((amount * Number(d.shareRatio)) / 100) : settledAmountOf(d)));
    const rest = amount - amounts.reduce((a, v) => a + v, 0);
    if (rest) {
      const our = rows.findIndex((d) => d.recipientType === 'our_office' && isOpenRow(d));
      const target = our >= 0 ? our : rows.findIndex(isOpenRow);
      if (target >= 0) amounts[target] = Math.max(0, amounts[target] + rest);
    }
    return amounts;
  }
  /** 비율을 적용했을 때의 금액: 파트너를 내림하고 나머지가 우리 몫이다. */
  function splitByRatio(amount, partnerRatio) {
    const partner = Math.floor((amount * partnerRatio) / 100);
    return { our: amount - partner, partner };
  }
  function refreshShareAmounts(p) {
    const amounts = splitRows(p.expectedAmount, p.distributions);
    p.distributions.forEach((d, i) => { d.shareAmount = amounts[i]; });
  }

  function dealSum(deal) {
    const sum = { billed: 0, collected: 0, remaining: 0, ourShare: 0, partnerShare: 0 };
    deal.payments.forEach((p) => {
      const amount = billable(p);
      sum.billed += amount;
      sum.collected += received(p);
      sum.remaining += remaining(p);
      if (p.distributions.length) {
        const amounts = splitRows(amount, p.distributions);
        p.distributions.forEach((d, i) => {
          if (d.recipientType === 'our_office') sum.ourShare += amounts[i];
          else sum.partnerShare += amounts[i];
        });
      } else {
        sum.ourShare += amount;
      }
    });
    return sum;
  }
  function worstStatus(deal) {
    const ps = deal.payments;
    if (ps.some(isOverdue)) return 'overdue';
    if (ps.some((p) => isOpenPay(p) && p.status === 'partial')) return 'partial';
    if (ps.length && ps.every(isClosedPay)) return 'waived';
    if (ps.length && ps.every((p) => isPayDone(p) || isClosedPay(p))) return 'collected';
    if (ps.length && ps.every((p) => p.status === 'draft')) return 'draft';
    return 'pending';
  }
  /** 더 받을 돈이 없는 거래 */
  const isFullyCollected = (deal) => { const s = worstStatus(deal); return s === 'collected' || s === 'waived'; };
  const pendingAdj = (pid) => db.adjustments.filter((a) => a.paymentId === pid && a.status === 'requested');

  /**
   * 공동중개 정산 잔액: 들어온 돈 기준으로, 우리가 받았으면 파트너 몫을 주고 파트너가 받았으면 우리 몫을 받는다.
   * 부분수금을 먼저 정산해도 나머지가 들어오면 차액이 다시 잔액으로 잡히도록 정산한 금액을 뺀다.
   * 할인으로 청구액이 받은 돈보다 작아지면 청구액까지만 나누고, 일부 받은 뒤 면제·대손한 청구도 받은 돈은 나눈다.
   */
  function partnerItems(deal) {
    const out = [];
    deal.payments.forEach((p) => {
      const got = Math.min(received(p), p.expectedAmount);
      if (got <= 0 || !p.distributions.length) return;
      const held = p.collectedByOffice === 'us';
      const amounts = ratioAmounts(got, p.distributions);
      p.distributions.forEach((d, i) => {
        if (held !== isPartnerRow(d)) return;
        const amount = d.status === 'settled' ? 0 : Math.max(0, amounts[i] - settledAmountOf(d));
        out.push({ deal, payment: p, dist: d, kind: held ? 'pay' : 'receive', amount, settled: amount === 0 });
      });
    });
    return out;
  }

  /** 잔액만큼 정산을 기록한다. 더 들어올 돈이 없을 때만 완료로 잠근다. */
  function settlePartnerItem(it, date, memo) {
    const d = it.dist;
    d.settledAmount = settledAmountOf(d) + it.amount;
    d.settledAt = date;
    d.settlementMemo = memo || null;
    d.status = isPayDone(it.payment) || isClosedPay(it.payment) ? 'settled' : 'pending';
  }

  // ── 직원 배분 ───────────────────────────────────────
  const userById = (id) => SEED.users.find((u) => u.id === id) || null;
  /** 지금 청구액 중 우리 사무소 몫. 파트너 몫을 뺀 금액이 직원 배분의 기준이다. */
  function ourShareOf(p) {
    const amount = billable(p);
    if (!p.distributions.length) return amount;
    const amounts = splitRows(amount, p.distributions);
    return p.distributions.reduce((a, d, i) => a + (isPartnerRow(d) ? 0 : amounts[i]), 0);
  }
  /** 받은 금액 중 우리 몫: 파트너 몫을 내림하고 나머지가 우리 몫이다. */
  const ourPart = (p, amount) => splitByRatio(amount, partnerRatioOf(p.distributions)).our;
  const coversSide = (w, p) => w.side === 'both' || p.clientSide === w.side;
  /** 직원 배분액: 그 직원 쪽 청구의 우리 몫 × 배분률. 정산한 건은 지급한 금액으로 고정한다. */
  function partAmount(deal, w) {
    if (w.settlementStatus === 'settled' && w.settledGross != null) return w.settledGross;
    const base = deal.payments.filter((p) => countsAsBilled(p) && coversSide(w, p)).reduce((a, p) => a + ourShareOf(p), 0);
    return Math.round((base * Number(w.commissionRate || 0)) / 100);
  }
  /** 원천징수: 사업소득은 3.3%(소득세 3% + 지방소득세 0.3%). 근로소득은 급여와 함께 처리하므로 여기서 떼지 않는다. */
  function withholdingOf(userId, gross) {
    const u = userById(userId);
    return u && u.taxType === 'business' ? round1(gross * 0.033) : 0;
  }
  /** 수당으로 나가는 배분률 합. 대표 본인 몫은 비용이 아니다. */
  const staffRate = (deal, p) => deal.participants.filter((w) => coversSide(w, p) && (userById(w.userId) || {}).taxType !== 'none').reduce((a, w) => a + Number(w.commissionRate || 0), 0);

  /** 직원 배분의 고객 수금 상태: 그 직원 쪽 청구가 다 들어와야 정산 가능으로 본다. */
  function participantState(deal, part) {
    const ps = deal.payments.filter((p) => countsAsBilled(p) && (part.side === 'both' || p.clientSide === part.side));
    const billed = ps.reduce((a, p) => a + billable(p), 0);
    const got = ps.reduce((a, p) => a + received(p), 0);
    const pct = collectPct(got, billed);
    if (part.settlementStatus === 'settled') return { key: 'settled', billed, got, pct };
    if (ps.length && ps.every((p) => isPayDone(p) || isClosedPay(p))) return { key: 'ready', billed, got, pct };
    return { key: got > 0 ? 'partial' : 'waiting', billed, got, pct };
  }

  function monthlyAmount(t) {
    if (t.frequency === 'quarterly') return Math.round(t.amount / 3);
    if (t.frequency === 'yearly') return Math.round(t.amount / 12);
    return t.amount;
  }
  const monthlyExpense = () => db.expenses.reduce((a, e) => (e.isActive ? a + monthlyAmount(e) : a), 0);
  const allPayments = () => db.deals.flatMap((deal) => deal.payments.map((p) => ({ deal, p })));

  /**
   * 그달의 돈. 입금 건마다 입금일이 속한 달에 넣는다.
   * - collected: 받은 수수료(부가세 제외) 중 우리 몫. 파트너 몫은 우리 매출이 아니다.
   * - staff: 그 입금에서 생긴 직원 수당(우리 몫 × 배분률). 대표 본인 몫은 뺀다.
   * - vat: 우리가 받은 부가세. 매출이 아니라 신고 때 낼 돈이다.
   * - net: 우리 몫 수금 − 직원 수당 − 고정비
   */
  function monthStats(y, m) {
    const key = monthKey(y, m);
    const isNow = key === TODAY.slice(0, 7);
    let collected = 0; let staff = 0; let vat = 0; let pending = 0; let overdue = 0;
    db.deals.forEach((deal) => deal.payments.forEach((p) => {
      if (p.status !== 'cancelled') {
        p.receipts.forEach((r) => {
          if (!r.date.startsWith(key)) return;
          const our = ourPart(p, r.amount);
          collected += our;
          staff += (our * staffRate(deal, p)) / 100;
          if (p.collectedByOffice === 'us') vat += r.vat || 0;
        });
      }
      if (!isOpenPay(p)) return;
      const due = effectiveDue(p);
      const left = ourPart(p, remaining(p));
      if (isOverdue(p)) {
        if (isNow || (due && due.startsWith(key))) overdue += left;
      } else if (due && due.startsWith(key)) {
        pending += left;
      }
    }));
    staff = Math.round(staff);
    const expense = monthlyExpense();
    return { collected, staff, vat: round1(vat), pending, overdue, expense, net: collected - staff - expense };
  }

  function trend() {
    const months = [[2026, 6], [2026, 7], [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1]];
    return months.map(([y, m]) => {
      const key = monthKey(y, m);
      const s = monthStats(y, m);
      const hist = SEED.trendHistory[key];
      const collected = hist ? hist.collected : s.collected;
      const staff = hist ? hist.staff : s.staff;
      return { y, m, key, collected, staff, forecast: key >= TODAY.slice(0, 7) ? s.pending + s.overdue : 0, overdue: s.overdue, expense: s.expense, net: collected - staff - s.expense };
    });
  }

  /**
   * 가상 데이터를 지금 모델로 옮긴다. 입금 한 건짜리 청구는 입금 목록을 만들고, 세금계산서 번호는
   * 고객 구분에 맞는 증빙으로 바꾼다. 정산을 끝낸 직원 배분은 그때 지급한 금액과 원천징수를 남긴다.
   */
  function normalize(state) {
    state.deals.forEach((deal) => {
      deal.propertyKind = deal.propertyKind || 'housing';
      deal.isCancelled = !!deal.isCancelled;
      deal.history = deal.history || [];
      deal.payments.forEach((p) => {
        p.payerType = p.payerType || 'person';
        if (!p.receipts) {
          p.receipts = [];
          if (p.actualAmount > 0 && p.paidAt) {
            const us = p.collectedByOffice === 'us';
            const type = defaultEvidence(p, p.method);
            const issued = type === 'card' || type === 'partner' || !!p.taxInvoiceNo;
            p.receipts.push({
              id: `${p.id}-r1`, date: p.paidAt, amount: p.actualAmount, vat: us ? round1(p.actualAmount * VAT_RATE) : 0, method: p.method || 'transfer',
              evidenceType: type, evidenceNo: p.taxInvoiceNo || null, evidenceDate: issued && type !== 'partner' ? p.paidAt : null,
            });
          }
        }
        syncReceipts(p);
        delete p.taxInvoiceStatus; delete p.taxInvoiceNo;
        if (!p.history) {
          p.history = [{ at: deal.stageChangedAt, by: '', text: `청구 생성 ${money(p.expectedAmount)}` }];
          p.receipts.forEach((r) => p.history.push({ at: r.date, by: '', text: `수금 ${money(r.amount)}${r.vat ? ` + 부가세 ${money(r.vat)}` : ''}` }));
        }
      });
      deal.participants.forEach((w) => {
        if (w.settlementStatus === 'settled' && w.settledGross == null) {
          w.settledGross = partAmount(deal, w);
          w.withheld = withholdingOf(w.userId, w.settledGross);
        }
      });
    });
    return state;
  }
  const fresh = () => normalize(clone(SEED.state));

  /** 사무소 안에서 겹치지 않는 다음 청구번호 */
  function nextCode() {
    const max = db.deals.flatMap((d) => d.payments).reduce((a, p) => Math.max(a, Number(String(p.code || '').replace(/\D/g, '')) || 0), 0);
    return `CP-${String(max + 1).padStart(4, '0')}`;
  }

  // ── 팝오버 ─────────────────────────────────────────
  let openPop = null;
  function closePop() {
    if (!openPop) return;
    openPop.el.remove();
    document.removeEventListener('mousedown', openPop.onDoc);
    const a = openPop.anchor; openPop = null;
    if (a && document.contains(a)) a.focus({ preventScroll: true });
  }
  function popover(anchor, content, opts) {
    closePop();
    const o = opts || {};
    const pop = el('<div class="pop"></div>');
    if (typeof content === 'string') pop.innerHTML = content; else pop.append(content);
    if (o.width) pop.style.width = `${o.width}px`;
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth; const h = pop.offsetHeight;
    let left = o.align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 4);
    pop.style.left = `${left}px`; pop.style.top = `${top}px`;
    const onDoc = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    setTimeout(() => document.addEventListener('mousedown', onDoc));
    openPop = { el: pop, onDoc, anchor };
    return pop;
  }
  function menu(anchor, items, opts) {
    const box = document.createElement('div');
    items.forEach((it) => {
      if (it === '-') { box.append(el('<div class="pop-sep"></div>')); return; }
      const b = el(`<button type="button" class="pop-item ${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`);
      b.addEventListener('click', () => { closePop(); it.onClick && it.onClick(); });
      box.append(b);
    });
    return popover(anchor, box, opts);
  }

  /** 매물관리 2행 필터와 같은 칩. 값이 없으면 이름만, 있으면 이름+값+지우기 */
  function chip({ label, value, options, onChange, width }) {
    const cur = options.find((o) => o.value === value);
    const box = el(`<div class="chip ${cur ? 'on' : ''}"><button type="button" aria-haspopup="listbox" aria-label="${esc(label)} 필터"><span>${esc(label)}</span>${cur ? `<b>${esc(cur.label)}</b>` : icon('chevron-down')}</button>${cur ? `<button type="button" class="clear" aria-label="${esc(label)} 필터 지우기">${icon('x')}</button>` : ''}</div>`);
    const trigger = box.querySelector('button');
    trigger.addEventListener('click', () => {
      const list = document.createElement('div');
      options.forEach((o) => {
        const b = el(`<button type="button" class="pop-item"><span class="chk">${o.value === value ? icon('check') : ''}</span><span>${esc(o.label)}</span></button>`);
        b.addEventListener('click', () => { closePop(); onChange(o.value); });
        list.append(b);
      });
      popover(box, list, { width });
    });
    const clear = box.querySelector('.clear');
    if (clear) clear.addEventListener('click', () => onChange(''));
    return box;
  }

  // ── 토스트 ─────────────────────────────────────────
  function toast(msg) {
    let host = document.querySelector('.toasts');
    if (!host) { host = el('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.append(host); }
    const t = el('<div class="toast"></div>');
    t.textContent = msg;
    host.append(t);
    setTimeout(() => t.remove(), 2800);
  }

  // ── 다이얼로그 (native dialog: 포커스 가두기와 Esc를 브라우저에 맡긴다) ──
  function dialog({ title, desc, body, submit, danger, onSubmit, onOpen, width }) {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    if (width) d.style.width = `${width}px`;
    d.innerHTML = `<form novalidate>
      <div class="dlg-head"><h2></h2>${desc ? '<p></p>' : ''}</div>
      <div class="dlg-body">${body || ''}<div class="dlg-error" hidden></div></div>
      <div class="dlg-foot"><button type="button" class="btn lg" data-cancel>취소</button><button type="submit" class="btn lg ${danger ? 'danger' : 'dark'}">${esc(submit || '저장')}</button></div>
    </form>`;
    d.querySelector('h2').textContent = title;
    if (desc) d.querySelector('.dlg-head p').textContent = desc;
    document.body.append(d);
    const form = d.querySelector('form');
    const error = d.querySelector('.dlg-error');
    d.querySelector('[data-cancel]').addEventListener('click', () => d.close());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => d.remove());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = onSubmit(new FormData(form), d);
      if (typeof msg === 'string') { error.textContent = msg; error.hidden = false; return; }
      d.close();
    });
    d.showModal();
    if (onOpen) onOpen(d);
    return d;
  }

  /** 만원 입력 옆에 실제 금액을 바로 보여 준다 (15800 → 1억 5,800만) */
  function moneyPreview(d, name, hintId, extra) {
    const input = d.querySelector(`[name="${name}"]`);
    const hint = d.querySelector(`#${hintId}`);
    const up = () => { const v = Number(input.value); hint.textContent = (v > 0 ? `= ${money(v)}원` : '') + (extra ? extra(v) : ''); };
    input.addEventListener('input', up); up();
  }

  // ── 업무 동작 ──────────────────────────────────────
  const findPay = (id) => { for (const deal of db.deals) { const p = deal.payments.find((x) => x.id === id); if (p) return { deal, p }; } return null; };

  const EVIDENCE_HINT = {
    cash_receipt: '부동산중개업은 현금영수증 의무발행 업종입니다. 현금·계좌이체로 10만원 이상 받으면 고객이 요청하지 않아도 받은 날부터 5일 안에 발행합니다.',
    tax_invoice: '사업자 고객에게는 세금계산서를 발행합니다. 늦어도 받은 달의 다음 달 10일까지 발행합니다.',
    card: '카드 결제는 카드 매출전표가 증빙이라 따로 발행하지 않습니다.',
  };

  /** 입금 한 건을 기록한다. 금액은 부가세를 뺀 수수료이고 부가세는 따로 남긴다. */
  function collectDialog(pid) {
    const { deal, p } = findPay(pid);
    const left = remaining(p);
    const us = p.collectedByOffice === 'us';
    const vatOn = us && SEED.office.vatType === 'general';
    const evOpts = ['cash_receipt', 'tax_invoice'].map((k) => `<option value="${k}" ${defaultEvidence(p, 'transfer') === k ? 'selected' : ''}>${EVIDENCE[k]}</option>`).join('');
    dialog({
      title: '수금 처리',
      desc: `${loc(deal)} · ${sideLabel(p)} ${p.code || ''} · ${esc(PAYER[p.payerType])} · 남은 수수료 ${money(left)}${us ? '' : ' · 파트너가 받는 청구'}`,
      submit: '수금 기록',
      width: 460,
      body: `<div class="field"><label for="f-amt">이번에 받은 수수료 (만원${vatOn ? ', 부가세 제외' : ''})</label><input id="f-amt" class="input tnum" name="amount" type="number" min="1" value="${left}"><small id="f-amt-h"></small></div>
        ${vatOn ? `<label class="check"><input type="checkbox" name="vat" checked> 부가세 10%도 함께 받음 <span class="muted tnum" id="f-total"></span></label>` : ''}
        <div class="row2"><div class="field"><label for="f-m">지급 방식</label><select id="f-m" class="input" name="method">${Object.entries(METHOD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label for="f-d">입금일</label><input id="f-d" class="input tnum" name="paidAt" type="date" value="${TODAY}"></div></div>
        ${us ? `<div class="row2" id="f-ev"><div class="field"><label for="f-et">증빙</label><select id="f-et" class="input" name="evType">${evOpts}</select></div>
          <div class="field"><label for="f-en">승인번호 (발행했으면)</label><input id="f-en" class="input tnum" name="evNo" placeholder="비우면 할 일로 남습니다"></div></div>
          <small class="muted" id="f-ev-h" style="font-size:12px;line-height:1.5"></small>` : '<small class="muted" style="font-size:12px;line-height:1.5">파트너가 받은 돈이라 부가세와 증빙은 파트너 사무소가 처리합니다. 우리 몫은 공동중개 수수료에서 정산합니다.</small>'}
        <div class="field"><label for="f-n">메모 (선택)</label><input id="f-n" class="input" name="note" value="" placeholder="예) 잔여분 11월 16일 입금 약속"></div>`,
      onOpen: (d) => {
        moneyPreview(d, 'amount', 'f-amt-h', (v) => (v > 0 && v < left ? ` · 부분수금으로 기록되고 ${money(left - v)}이 남습니다` : ''));
        d.querySelector('[name="amount"]').select();
        const amt = d.querySelector('[name="amount"]');
        const vat = d.querySelector('[name="vat"]');
        const method = d.querySelector('[name="method"]');
        const evBox = d.querySelector('#f-ev');
        const evHint = d.querySelector('#f-ev-h');
        const evType = d.querySelector('[name="evType"]');
        const up = () => {
          const v = Number(amt.value) || 0;
          if (vat) d.querySelector('#f-total').textContent = vat.checked && v > 0 ? `· 고객 입금 총액 ${money(round1(v * (1 + VAT_RATE)))}` : '';
          if (evBox) {
            const isCard = method.value === 'card';
            evBox.hidden = isCard;
            evHint.textContent = EVIDENCE_HINT[isCard ? 'card' : evType.value];
          }
        };
        [amt, vat, method, evType].forEach((x) => x && x.addEventListener('input', up));
        up();
      },
      onSubmit: (fd) => {
        const amt = Number(fd.get('amount'));
        if (!(amt > 0)) return '받은 수수료를 입력해 주세요.';
        if (!Number.isInteger(amt)) return '만원 단위 정수로 입력해 주세요.';
        if (amt > left) return `남은 수수료 ${money(left)}보다 많습니다. 부가세는 빼고 입력해 주세요.`;
        const method = fd.get('method');
        const type = us ? (method === 'card' ? 'card' : fd.get('evType')) : 'partner';
        const no = String(fd.get('evNo') || '').trim();
        const date = fd.get('paidAt') || TODAY;
        const r = {
          id: `${p.id}-r${Date.now()}`, date, amount: amt, vat: vatOn && fd.get('vat') ? round1(amt * VAT_RATE) : 0, method,
          evidenceType: type, evidenceNo: no || null, evidenceDate: type === 'card' || no ? date : null,
        };
        p.receipts.push(r);
        p.receipts.sort((a, b) => (a.date < b.date ? -1 : 1));
        syncReceipts(p);
        if (fd.get('note')) p.note = fd.get('note');
        p.status = p.actualAmount >= p.expectedAmount ? 'collected' : 'partial';
        log(p, `수금 ${money(amt)}${r.vat ? ` + 부가세 ${money(r.vat)}` : ''} · ${METHOD[method]}${r.evidenceDate && type !== 'card' ? ` · ${EVIDENCE[type]} ${no}` : ''}`);
        commit();
        const tail = us && !evidenceDone(r) ? ` ${EVIDENCE[type]}은 ${mdw(evidenceDue(r))}까지 발행해 주세요.` : '';
        toast((p.status === 'collected' ? '수금 완료로 기록했습니다.' : `부분수금으로 기록했습니다. 남은 수수료 ${money(remaining(p))}.`) + tail);
        return undefined;
      },
    });
  }

  /** 입금 한 건의 증빙(현금영수증·세금계산서)을 기록한다 */
  function evidenceDialog(pid, rid) {
    const { deal, p } = findPay(pid);
    const r = rid ? p.receipts.find((x) => x.id === rid) : pendingEvidence(p)[0];
    if (!r) { toast('발행할 증빙이 없습니다.'); return; }
    dialog({
      title: '증빙 기록',
      desc: `${loc(deal)} · ${sideLabel(p)} ${p.code} · ${esc(PAYER[p.payerType])} · ${md(r.date)} 입금 ${money(r.amount)}${r.vat ? ` + 부가세 ${money(r.vat)}` : ''}`,
      submit: '기록',
      body: `<div class="row2"><div class="field"><label for="v-t">증빙</label><select id="v-t" class="input" name="type">${['cash_receipt', 'tax_invoice'].map((k) => `<option value="${k}" ${r.evidenceType === k ? 'selected' : ''}>${EVIDENCE[k]}</option>`).join('')}</select></div>
        <div class="field"><label for="v-d">발행일</label><input id="v-d" class="input tnum" name="date" type="date" value="${TODAY}"></div></div>
        <div class="field"><label for="v-n">승인번호</label><input id="v-n" class="input tnum" name="no" placeholder="예) 2026-11-00042"></div>
        <small class="muted" id="v-h" style="font-size:12px;line-height:1.5"></small>`,
      onOpen: (d) => {
        const t = d.querySelector('[name="type"]');
        const up = () => { const due = evidenceDue({ date: r.date, evidenceType: t.value }); d.querySelector('#v-h').textContent = `${EVIDENCE_HINT[t.value]} 이 입금의 기한은 ${mdw(due)}(${rel(due)})입니다.`; };
        t.addEventListener('input', up); up();
      },
      onSubmit: (fd) => {
        const no = String(fd.get('no')).trim();
        if (!no) return '승인번호를 입력해 주세요.';
        r.evidenceType = fd.get('type'); r.evidenceNo = no; r.evidenceDate = fd.get('date') || TODAY;
        log(p, `${EVIDENCE[r.evidenceType]} 발행 ${no} (${md(r.date)} 입금분)`);
        commit(); toast(`${EVIDENCE[r.evidenceType]} 발행을 기록했습니다.`);
        return undefined;
      },
    });
  }

  function adjustDialog(pid) {
    const { deal, p } = findPay(pid);
    dialog({
      title: '수수료 조정 요청',
      desc: `${loc(deal)} · ${sideLabel(p)} ${p.code || ''} · 청구 ${money(p.expectedAmount)}. 대표가 승인하면 반영됩니다.`,
      submit: '요청',
      body: `<div class="field"><label for="a-t">조정 유형</label><select id="a-t" class="input" name="type">${Object.entries(ADJ).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field" id="a-amt-f"><label for="a-a">할인 금액 (만원)</label><input id="a-a" class="input tnum" name="amount" type="number" min="1" placeholder="예) 200"></div>
        <div class="field"><label for="a-r">요청 사유</label><textarea id="a-r" class="input" name="reason" placeholder="예) 고객 요청 협의"></textarea></div>`,
      onOpen: (d) => {
        const type = d.querySelector('[name="type"]');
        const f = d.querySelector('#a-amt-f');
        type.addEventListener('change', () => { f.hidden = type.value !== 'discount'; });
      },
      onSubmit: (fd) => {
        const type = fd.get('type');
        const amount = type === 'discount' ? Number(fd.get('amount')) : remaining(p);
        if (type === 'discount') {
          if (!(amount > 0)) return '할인 금액을 입력해 주세요.';
          if (!Number.isInteger(amount)) return '만원 단위 정수로 입력해 주세요.';
          if (amount > remaining(p)) return `남은 금액 ${money(remaining(p))}까지 깎을 수 있습니다.`;
        }
        if (!String(fd.get('reason')).trim()) return '요청 사유를 입력해 주세요.';
        const n = db.adjustments.length + 2031;
        db.adjustments.push({ id: `a${Date.now()}`, code: `CA-${n}`, type, amount, reason: String(fd.get('reason')).trim(), paymentId: p.id, dealId: deal.id, status: 'requested', requestedBy: me().name, requestedById: me().id });
        log(p, `${ADJ[type]} ${money(amount)} 요청 · ${String(fd.get('reason')).trim()}`);
        commit(); toast('조정을 요청했습니다.');
        return undefined;
      },
    });
  }

  /**
   * 승인 시점에 조정을 적용할 수 있는지 본다. 요청 뒤 돈이 들어오면 남은 금액이 줄어드는데,
   * 남은 금액을 넘는 할인을 승인하면 청구액이 받은 돈보다 작아져 돌려줄 돈이 생기고 분배 합계도 맞지 않는다.
   */
  function adjustmentProblem(a, p) {
    const left = remaining(p);
    if (left <= 0) return '요청 뒤 수금이 끝나 조정할 금액이 남아 있지 않습니다. 반려해 주세요.';
    if (a.type === 'discount' && a.amount > left) return `요청 뒤 수금이 들어와 남은 금액 ${money(left)}보다 큽니다. 승인하면 청구액이 받은 돈보다 작아지므로, 반려한 뒤 다시 요청해 주세요.`;
    return null;
  }

  function decideAdjustment(aid, approve) {
    const a = db.adjustments.find((x) => x.id === aid);
    if (!a) return;
    const hit = findPay(a.paymentId);
    const problem = approve && hit ? adjustmentProblem(a, hit.p) : null;
    if (problem) { toast(problem); return; }
    a.status = approve ? 'approved' : 'rejected';
    if (approve && hit) {
      const { p } = hit;
      if (a.type === 'discount') {
        p.expectedAmount = Math.max(0, p.expectedAmount - a.amount);
        refreshShareAmounts(p);
        if (isPayDone(p)) p.status = 'collected';
      } else {
        p.status = 'waived';
      }
    }
    if (hit) log(hit.p, `${ADJ[a.type]} ${money(a.amount)} ${approve ? '승인' : '반려'} (${a.code}, 요청 ${a.requestedBy})`);
    commit();
    toast(approve ? '수수료 조정을 승인했습니다.' : '수수료 조정을 반려했습니다.');
  }

  function decideDialog(aid) {
    const a = db.adjustments.find((x) => x.id === aid);
    const hit = findPay(a.paymentId);
    if (!canDecide()) { toast('조정 승인은 대표만 할 수 있습니다.'); return; }
    const problem = hit ? adjustmentProblem(a, hit.p) : null;
    const d = dialog({
      title: `${ADJ[a.type]} 검토`,
      desc: `${hit ? `${loc(hit.deal)} · ${sideLabel(hit.p)} ${hit.p.code}` : ''} · ${a.code}`,
      submit: '승인',
      body: `<dl class="kv"><dt>요청자</dt><dd>${esc(a.requestedBy)}</dd><dt>조정 금액</dt><dd class="strong">${money(a.amount)}</dd>${hit ? `<dt>청구액</dt><dd>${money(hit.p.expectedAmount)}${a.type === 'discount' ? ` → ${money(hit.p.expectedAmount - a.amount)}` : ''}</dd>` : ''}<dt>사유</dt><dd style="white-space:normal;line-height:1.5">${esc(a.reason)}</dd></dl>${problem ? `<p class="red" style="margin:0;font-size:12px;line-height:1.5">${esc(problem)}</p>` : ''}`,
      onSubmit: () => { decideAdjustment(aid, true); return undefined; },
    });
    if (problem) d.querySelector('button[type="submit"]').disabled = true;
    const reject = el('<button type="button" class="btn lg" style="margin-right:auto">반려</button>');
    reject.addEventListener('click', () => { decideAdjustment(aid, false); d.close(); });
    d.querySelector('.dlg-foot').prepend(reject);
  }

  const payerSelect = (name, value) => `<select class="input" name="${name}" aria-label="납부자 구분">${Object.entries(PAYER).map(([k, v]) => `<option value="${k}" ${value === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  /** 협의 수수료 입력: 상한을 함께 보여 주고 넘으면 저장하지 않는다 */
  const feeHint = (cap) => (v) => (v > cap.amount ? ` · 법정 상한보다 ${money(v - cap.amount)} 많아 저장할 수 없습니다` : v > 0 && cap.base ? ` · 요율 ${Math.round((v / cap.base) * 10000) / 100}%` : '');

  /**
   * 청구 확정: 계약 때 고객과 정한 수수료를 넣는다. 상한 아래로 협의한 금액은 할인이 아니므로 승인을 거치지 않는다.
   * 확정 뒤 금액을 줄이는 것만 조정 요청(대표 승인)으로 한다.
   */
  function confirmDraftDialog(pid) {
    const { deal, p } = findPay(pid);
    const cap = legalCap(deal);
    dialog({
      title: '청구 확정',
      desc: `${loc(deal)} · ${sideLabel(p)} ${p.code || ''} · ${esc(payerName(deal, p))}`,
      submit: '확정',
      width: 460,
      body: `<p class="cap-line">${capText(cap)} · ${esc(KIND[deal.propertyKind])}</p>
        <div class="field"><label for="c-a">협의한 수수료 (만원, 부가세 제외)</label><input id="c-a" class="input tnum" name="amount" type="number" min="1" value="${Math.min(p.expectedAmount, cap.amount) || p.expectedAmount}"><small id="c-a-h"></small></div>
        <div class="row2"><div class="field"><label for="c-d">수금 예정일</label><input id="c-d" class="input tnum" name="due" type="date" value="${p.dueDate || deal.balanceDueDate || ''}"></div>
        <div class="field"><label>납부자</label>${payerSelect('payer', p.payerType)}</div></div>
        <small class="muted" style="font-size:12px;line-height:1.5">예정일은 거래의 잔금일을 기본값으로 넣었습니다. 납부자가 사업자면 증빙이 세금계산서로 잡힙니다.</small>`,
      onOpen: (d) => moneyPreview(d, 'amount', 'c-a-h', feeHint(cap)),
      onSubmit: (fd) => {
        const amt = Number(fd.get('amount'));
        if (!(amt > 0) || !Number.isInteger(amt)) return '수수료를 만원 단위 정수로 입력해 주세요.';
        if (cap.base > 0 && amt > cap.amount) return `${capText(cap)}을 넘을 수 없습니다.`;
        if (!fd.get('due')) return '수금 예정일을 입력해 주세요.';
        const before = p.expectedAmount;
        p.expectedAmount = amt; p.baseAmount = cap.base || p.baseAmount; p.rate = effRate(deal, p);
        p.dueDate = fd.get('due'); p.status = 'pending'; p.payerType = fd.get('payer');
        refreshShareAmounts(p);
        log(p, `청구 확정 ${money(amt)}${before !== amt ? ` (자동 계산 ${money(before)})` : ''} · 예정일 ${ymd(p.dueDate)}`);
        commit(); toast('청구를 확정했습니다.');
        return undefined;
      },
    });
  }

  /** 청구가 없는 거래에 청구를 만든다. 앱은 거래를 만들 때 거래가가 없으면 청구를 만들지 않고 나중에 추가할 수도 없다. */
  function addPaymentDialog(dealId) {
    const deal = db.deals.find((x) => x.id === dealId);
    const cap = legalCap(deal);
    const has = (side) => deal.payments.some((p) => p.clientSide === side);
    const sideRow = (side, label) => `<label class="check"><input type="checkbox" name="side" value="${side}" ${has(side) ? 'disabled' : 'checked'}> ${label} ${esc(side === 'seller' ? deal.sellerContactName : deal.buyerContactName)}${has(side) ? ' <span class="muted">· 이미 청구 있음</span>' : ''} <span style="margin-left:auto">${payerSelect(`payer-${side}`, 'person')}</span></label>`;
    dialog({
      title: '청구 추가',
      desc: `${loc(deal)} · ${statusLabel('tx', deal.transactionType)} ${money(cap.base)}`,
      submit: '추가',
      width: 480,
      body: `<p class="cap-line">${cap.base ? `${capText(cap)} · ${esc(KIND[deal.propertyKind])}` : '거래가가 없어 상한을 계산할 수 없습니다. 거래 정보에서 조건을 먼저 넣어 주세요.'}</p>
        <div class="field"><span class="lab">청구할 쪽</span>${sideRow('seller', deal.transactionType === 'sale' ? '매도측' : '임대측')}${sideRow('buyer', deal.transactionType === 'sale' ? '매수측' : '임차측')}</div>
        <div class="row2"><div class="field"><label for="n-a">협의한 수수료 (한쪽, 만원)</label><input id="n-a" class="input tnum" name="amount" type="number" min="1" value="${cap.amount || ''}"><small id="n-a-h"></small></div>
        <div class="field"><label for="n-d">수금 예정일</label><input id="n-d" class="input tnum" name="due" type="date" value="${deal.balanceDueDate || ''}"></div></div>`,
      onOpen: (d) => moneyPreview(d, 'amount', 'n-a-h', feeHint(cap)),
      onSubmit: (fd) => {
        const sides = fd.getAll('side');
        const amt = Number(fd.get('amount'));
        if (!cap.base) return '거래가가 없어 청구를 만들 수 없습니다.';
        if (!sides.length) return '청구할 쪽을 골라 주세요.';
        if (!(amt > 0) || !Number.isInteger(amt)) return '수수료를 만원 단위 정수로 입력해 주세요.';
        if (amt > cap.amount) return `${capText(cap)}을 넘을 수 없습니다.`;
        if (!fd.get('due')) return '수금 예정일을 입력해 주세요.';
        const contracted = ['contracted', 'settling', 'completed', 'closed'].includes(deal.stage);
        sides.forEach((side) => {
          const p = {
            id: `p${Date.now()}${side[0]}`, code: nextCode(), clientSide: side, collectedByOffice: 'us', payerType: fd.get(`payer-${side}`) || 'person',
            baseAmount: cap.base, rate: null, expectedAmount: amt, actualAmount: null, dueDate: fd.get('due'), paidAt: null, agreedRemainingDate: null,
            status: contracted ? 'pending' : 'draft', method: null, note: null, distributions: [], receipts: [], history: [],
          };
          p.rate = effRate(deal, p);
          if (deal.partnerBrokerId) p.distributions = [{ id: `${p.id}-o`, recipientType: 'our_office', partnerBrokerId: null, shareRatio: 100, shareAmount: amt, settledAmount: 0, status: 'pending', settledAt: null, settlementMemo: null }];
          log(p, `청구 추가 ${money(amt)} · 예정일 ${ymd(p.dueDate)}`);
          deal.payments.push(p);
        });
        commit(); toast(`청구 ${sides.length}건을 추가했습니다.`);
        return undefined;
      },
    });
  }

  /** 예정일과 납부자 구분 수정. 금액은 여기서 바꾸지 않는다. */
  function payInfoDialog(pid) {
    const { deal, p } = findPay(pid);
    dialog({
      title: '청구 정보 수정',
      desc: `${loc(deal)} · ${sideLabel(p)} ${p.code}`,
      submit: '저장',
      body: `<div class="row2"><div class="field"><label for="i-d">수금 예정일</label><input id="i-d" class="input tnum" name="due" type="date" value="${p.dueDate || ''}"></div>
        <div class="field"><label>납부자</label>${payerSelect('payer', p.payerType)}</div></div>
        <small class="muted" style="font-size:12px;line-height:1.5">잔금일이 바뀌면 여기서 예정일을 옮깁니다. 금액을 줄이려면 조정 요청을, 거래가가 바뀌었으면 거래 정보의 조건 변경을 쓰세요.</small>`,
      onSubmit: (fd) => {
        if (!fd.get('due')) return '수금 예정일을 입력해 주세요.';
        const changes = [];
        if (fd.get('due') !== p.dueDate) changes.push(`예정일 ${ymd(p.dueDate)} → ${ymd(fd.get('due'))}`);
        if (fd.get('payer') !== p.payerType) changes.push(`납부자 ${PAYER[p.payerType]} → ${PAYER[fd.get('payer')]}`);
        if (!changes.length) return undefined;
        p.dueDate = fd.get('due'); p.payerType = fd.get('payer');
        log(p, changes.join(' · '));
        commit(); toast('청구 정보를 저장했습니다.');
        return undefined;
      },
    });
  }

  /** 상한을 넘는 청구를 상한으로 낮춘다. 법을 맞추는 수정이라 승인을 거치지 않고 이력만 남긴다. */
  function lowerToCap(pid) {
    const { deal, p } = findPay(pid);
    const cap = legalCap(deal);
    const target = Math.max(cap.amount, p.actualAmount || 0);
    if (target >= p.expectedAmount) { toast('이미 받은 돈이 상한보다 많아 청구액을 더 낮출 수 없습니다.'); return; }
    log(p, `법정 상한에 맞춰 ${money(p.expectedAmount)} → ${money(target)}`);
    p.expectedAmount = target; p.rate = effRate(deal, p);
    refreshShareAmounts(p);
    if (isPayDone(p)) p.status = 'collected';
    commit();
    toast(`청구액을 법정 상한 ${money(target)}으로 낮췄습니다.`);
  }

  /**
   * 거래 조건 변경: 거래가가 바뀌면 끝나지 않은 청구를 지금 협의 요율로 다시 계산하고 상한을 넘으면 상한으로 맞춘다.
   * 받은 돈보다 낮출 수는 없다. 앱은 거래가를 바꿔도 청구를 그대로 둔다.
   */
  function termsDialog(dealId) {
    const deal = db.deals.find((x) => x.id === dealId);
    const monthly = deal.transactionType === 'monthly';
    const targets = deal.payments.filter((p) => p.status === 'draft' || isOpenPay(p));
    const plan = (over) => {
      const cap = legalCap(deal, over);
      return { cap, rows: targets.map((p) => {
        const rate = effRate(deal, p) || cap.rate;
        const next = Math.max(p.actualAmount || 0, Math.min(cap.amount, Math.floor((cap.base * rate) / 100)));
        return { p, rate, next };
      }) };
    };
    dialog({
      title: '거래 조건 변경',
      desc: `${loc(deal)} · ${statusLabel('tx', deal.transactionType)}`,
      submit: '변경',
      width: 500,
      body: `${monthly
        ? `<div class="row2"><div class="field"><label for="t-dep">보증금 (만원)</label><input id="t-dep" class="input tnum" name="dep" type="number" min="0" value="${deal.agreedDeposit || 0}"></div><div class="field"><label for="t-rent">월세 (만원)</label><input id="t-rent" class="input tnum" name="rent" type="number" min="0" value="${deal.agreedMonthlyRent || 0}"></div></div>`
        : `<div class="field"><label for="t-price">${deal.transactionType === 'sale' ? '거래가' : '전세금'} (만원)</label><input id="t-price" class="input tnum" name="price" type="number" min="0" value="${deal.agreedPrice || ''}"><small id="t-price-h"></small></div>`}
        <div class="field"><label for="t-k">물건 유형</label><select id="t-k" class="input" name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${deal.propertyKind === k ? 'selected' : ''}>${v}</option>`).join('')}</select><small>업무용 오피스텔은 주택 외로 고릅니다.</small></div>
        <div class="plan" id="t-plan"></div>`,
      onOpen: (d) => {
        if (!monthly) moneyPreview(d, 'price', 't-price-h');
        const read = () => (monthly
          ? { agreedDeposit: Number(d.querySelector('[name="dep"]').value) || 0, agreedMonthlyRent: Number(d.querySelector('[name="rent"]').value) || 0, propertyKind: d.querySelector('[name="kind"]').value }
          : { agreedPrice: Number(d.querySelector('[name="price"]').value) || 0, propertyKind: d.querySelector('[name="kind"]').value });
        const up = () => {
          const { cap, rows } = plan(read());
          d.querySelector('#t-plan').innerHTML = `<p class="cap-line">${cap.base ? capText(cap) : '거래가를 넣으면 상한을 계산합니다.'}</p>${rows.length ? rows.map(({ p, rate, next }) => `<div class="plan-row"><span>${sideLabel(p)} ${esc(p.code)} <span class="muted">요율 ${rate}% 유지</span></span><span class="tnum">${money(p.expectedAmount)} → <b>${money(next)}</b>${next === cap.amount && next < Math.floor((cap.base * rate) / 100) ? ' <span class="amber">상한</span>' : ''}</span></div>`).join('') : '<p class="muted" style="font-size:12.5px">다시 계산할 청구가 없습니다. 수금이 끝난 청구는 바꾸지 않습니다.</p>'}`;
        };
        d.querySelectorAll('input,select').forEach((x) => x.addEventListener('input', up));
        up();
      },
      onSubmit: (fd) => {
        const over = monthly
          ? { agreedDeposit: Number(fd.get('dep')) || 0, agreedMonthlyRent: Number(fd.get('rent')) || 0, propertyKind: fd.get('kind') }
          : { agreedPrice: Number(fd.get('price')) || 0, propertyKind: fd.get('kind') };
        const { cap, rows } = plan(over);
        if (!cap.base) return '거래가를 입력해 주세요.';
        const before = commissionBase(deal);
        Object.assign(deal, over);
        log(deal, `거래 조건 변경: 기준 금액 ${money(before)} → ${money(cap.base)} · ${KIND[deal.propertyKind]}`);
        rows.forEach(({ p, rate, next }) => {
          if (next !== p.expectedAmount) log(p, `거래 조건 변경으로 ${money(p.expectedAmount)} → ${money(next)} (요율 ${rate}%)`);
          p.expectedAmount = next; p.baseAmount = cap.base; p.rate = effRate(deal, p);
          refreshShareAmounts(p);
          if (isPayDone(p)) p.status = 'collected';
        });
        commit(); toast(`거래 조건을 바꾸고 청구 ${rows.length}건을 다시 계산했습니다.`);
        return undefined;
      },
    });
  }

  /** 담당자 배정. 직원 배분액은 저장하지 않고 우리 몫 × 배분률로 계산한다. 정산한 사람은 바꿀 수 없다. */
  function partsDialog(dealId) {
    const deal = db.deals.find((x) => x.id === dealId);
    const locked = deal.participants.filter((w) => w.settlementStatus === 'settled');
    const open = deal.participants.filter((w) => w.settlementStatus !== 'settled');
    const users = SEED.users.filter((u) => u.isActive || open.some((w) => w.userId === u.id));
    const SIDE = { seller: '매도측', buyer: '매수측', both: '양측' };
    const ROLE_SIDE = { listing_agent: 'seller', buying_agent: 'buyer', dual_agent: 'both', manager: 'both' };
    const opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v}</option>`).join('');
    const row = (w) => `<div class="prow" data-row>
      <select class="input" name="user" aria-label="직원">${users.map((u) => `<option value="${u.id}" ${w && w.userId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <select class="input" name="role" aria-label="역할">${opt(PART_ROLE, w ? w.role : 'dual_agent')}</select>
      <select class="input" name="side" aria-label="담당 측">${opt(SIDE, w ? w.side : 'both')}</select>
      <input class="input tnum" name="rate" type="number" min="0" max="100" step="1" value="${w ? w.commissionRate : users[0].commissionRate}" aria-label="배분률(%)">
      <span class="tnum prow-amt" data-amt></span>
      <button type="button" class="icon-btn" data-del aria-label="이 담당자 빼기">${icon('trash-2')}</button></div>`;
    const sideBase = (side) => deal.payments.filter((p) => countsAsBilled(p) && (side === 'both' || p.clientSide === side)).reduce((a, p) => a + ourShareOf(p), 0);
    dialog({
      title: '담당자 배분',
      desc: `${loc(deal)} · 우리 몫 매도측 ${money(sideBase('seller'))} · 매수측 ${money(sideBase('buyer'))}`,
      submit: '저장',
      width: 600,
      body: `${locked.length ? `<p class="muted" style="font-size:12.5px">정산을 끝낸 ${locked.map((w) => esc(w.userName)).join(', ')}은 바꿀 수 없습니다.</p>` : ''}
        <div class="prow prow-head"><span>직원</span><span>역할</span><span>담당 측</span><span>배분률</span><span style="text-align:right">배분액</span><span></span></div>
        <div id="p-rows">${open.map(row).join('')}</div>
        <button type="button" class="btn" id="p-add" style="justify-self:start">${icon('plus')} 담당자 추가</button>
        <small class="muted" style="font-size:12px;line-height:1.5">배분률은 직원 설정의 기본값을 가져옵니다. 배분액은 파트너 몫과 할인을 뺀 우리 몫에서 계산하므로 청구가 바뀌면 함께 바뀝니다.</small>`,
      onOpen: (d) => {
        const box = d.querySelector('#p-rows');
        const up = () => box.querySelectorAll('[data-row]').forEach((r) => {
          const rate = Number(r.querySelector('[name="rate"]').value) || 0;
          r.querySelector('[data-amt]').textContent = money(Math.round((sideBase(r.querySelector('[name="side"]').value) * rate) / 100));
        });
        box.addEventListener('input', (e) => {
          const r = e.target.closest('[data-row]');
          if (e.target.name === 'user') { const u = userById(e.target.value); r.querySelector('[name="rate"]').value = u.commissionRate; }
          if (e.target.name === 'role' && ROLE_SIDE[e.target.value]) r.querySelector('[name="side"]').value = ROLE_SIDE[e.target.value];
          up();
        });
        box.addEventListener('click', (e) => { const del = e.target.closest('[data-del]'); if (del) { del.closest('[data-row]').remove(); up(); } });
        d.querySelector('#p-add').addEventListener('click', () => { box.append(el(row(null))); up(); });
        up();
      },
      onSubmit: (fd) => {
        const ids = fd.getAll('user'); const roles = fd.getAll('role'); const sides = fd.getAll('side'); const rates = fd.getAll('rate').map(Number);
        if (rates.some((r) => !Number.isInteger(r) || r < 0 || r > 100)) return '배분률은 0~100 사이의 정수로 넣어 주세요.';
        const keys = ids.map((id, i) => `${id}:${roles[i]}`);
        if (new Set([...keys, ...locked.map((w) => `${w.userId}:${w.role}`)]).size !== keys.length + locked.length) return '같은 직원을 같은 역할로 두 번 넣을 수 없습니다.';
        const next = ids.map((id, i) => {
          const prev = open.find((w) => w.userId === id && w.role === roles[i]);
          return Object.assign(prev || { id: `w${Date.now()}${i}`, settlementStatus: 'unsettled', settlementDate: null }, { userId: id, userName: userById(id).name, role: roles[i], side: sides[i], commissionRate: rates[i] });
        });
        const all = [...locked, ...next];
        for (const side of ['seller', 'buyer']) {
          const sum = all.filter((w) => w.side === 'both' || w.side === side).reduce((a, w) => a + Number(w.commissionRate), 0);
          if (sum > 100) return `${SIDE[side]} 배분률 합계가 ${sum}%입니다. 100%를 넘을 수 없습니다.`;
        }
        deal.participants = all;
        log(deal, `담당자 배분: ${all.map((w) => `${w.userName} ${PART_ROLE[w.role]} ${w.commissionRate}%`).join(', ') || '없음'}`);
        commit(); toast('담당자 배분을 저장했습니다.');
        return undefined;
      },
    });
  }

  /**
   * 거래 취소. 중개사 잘못 없이 계약이 해제되면 보수를 받을 수 있어(공인중개사법 32조) 청구를 유지할지 고른다.
   * 앱은 취소해도 청구를 그대로 두고, 원장은 취소 거래를 통째로 숨겨 받은 돈까지 사라진다.
   */
  function cancelDealDialog(dealId) {
    const deal = db.deals.find((x) => x.id === dealId);
    const s = dealSum(deal);
    const drafts = deal.payments.filter((p) => p.status === 'draft');
    dialog({
      title: '거래 취소',
      desc: `${loc(deal)} · 받은 수수료 ${money(s.collected)} · 남은 청구 ${money(s.remaining + drafts.reduce((a, p) => a + p.expectedAmount, 0))}`,
      submit: '거래 취소',
      danger: true,
      width: 480,
      body: `<div class="field"><label for="x-r">취소 사유</label><input id="x-r" class="input" name="reason" placeholder="예) 매수인 사정으로 계약 해제"></div>
        <div class="field"><span class="lab">남은 청구</span>
          <label class="radio"><input type="radio" name="mode" value="close" checked><span><b>남은 청구 취소</b><small>받은 돈만 매출로 남깁니다. 받은 돈이 없는 청구는 취소됩니다.</small></span></label>
          <label class="radio"><input type="radio" name="mode" value="keep"><span><b>청구 유지</b><small>중개사 잘못 없이 해제되어 보수를 받는 경우입니다. 원장에 거래 취소로 표시된 채 남습니다.</small></span></label></div>`,
      onSubmit: (fd) => {
        const reason = String(fd.get('reason')).trim();
        if (!reason) return '취소 사유를 입력해 주세요.';
        const mode = fd.get('mode');
        deal.isCancelled = true; deal.cancelReason = reason; deal.cancelledAt = TODAY;
        log(deal, `거래 취소 · ${reason} · ${mode === 'keep' ? '청구 유지' : '남은 청구 취소'}`);
        deal.payments.forEach((p) => {
          if (mode === 'keep' || !(p.status === 'draft' || isOpenPay(p))) { if (mode === 'keep') log(p, '거래 취소, 청구 유지'); return; }
          const got = received(p);
          if (got > 0) {
            log(p, `거래 취소로 남은 ${money(p.expectedAmount - got)} 청구 취소`);
            p.expectedAmount = got; p.status = 'collected';
            refreshShareAmounts(p);
          } else {
            log(p, '거래 취소로 청구 취소');
            p.status = 'cancelled';
          }
        });
        commit(); toast('거래를 취소했습니다.');
        return undefined;
      },
    });
  }

  /** 청구·거래 이력 */
  function historyPop(anchor, entries, title) {
    const box = document.createElement('div');
    box.className = 'hist';
    box.innerHTML = `<div class="hist-h">${esc(title)}</div>${[...entries].reverse().map((h) => `<div class="hist-r"><span class="tnum muted">${md(h.at)}</span><span>${esc(h.text)}${h.by ? ` <span class="muted">· ${esc(h.by)}</span>` : ''}</span></div>`).join('') || '<div class="hist-r muted">이력이 없습니다.</div>'}`;
    popover(anchor, box, { width: 340, align: 'right' });
  }

  function dun(pid) {
    const { deal, p } = findPay(pid);
    if (db.dunned[pid]) return;
    db.dunned[pid] = TODAY;
    commit();
    toast(`업무에 독촉을 추가했습니다: ${loc(deal)} ${sideLabel(p)} ${money(remaining(p))}`);
  }

  /**
   * 화면에서 분배를 바꿀 수 있는 청구. 화면은 파트너를 하나만 입력받으므로
   * 파트너가 둘 이상인 청구를 고치면 한쪽이 사라진다.
   */
  const isDistEditable = (p) => (p.status === 'draft' || isOpenPay(p))
    && p.distributions.every((d) => d.status !== 'settled' && settledAmountOf(d) === 0)
    && p.distributions.filter(isPartnerRow).length <= 1;

  function setPartnerRatio(dealId, partnerRatio, partnerId) {
    const deal = db.deals.find((x) => x.id === dealId);
    const targets = deal.payments.filter(isDistEditable);
    const ourRatio = ourRatioFrom(partnerRatio);
    targets.forEach((p) => {
      const blank = { shareAmount: 0, settledAmount: 0, status: 'pending', settledAt: null, settlementMemo: null };
      p.distributions = [
        ...(ourRatio > 0 ? [{ ...blank, id: `${p.id}-o`, recipientType: 'our_office', partnerBrokerId: null, shareRatio: ourRatio }] : []),
        ...(partnerRatio > 0 ? [{ ...blank, id: `${p.id}-p`, recipientType: 'partner_broker', partnerBrokerId: partnerId, shareRatio: partnerRatio }] : []),
      ];
      refreshShareAmounts(p);
      log(p, `분배 변경: 우리 ${ourRatio}% · 파트너 ${partnerRatio}%`);
    });
    commit();
    const skipped = deal.payments.length - targets.length;
    toast(`청구 ${targets.length}건의 분배를 우리 ${ourRatio}% · 파트너 ${partnerRatio}%로 바꿨습니다.${skipped ? ` 바꿀 수 없는 청구 ${skipped}건은 그대로입니다.` : ''}`);
  }

  // ── 거래 상세 (오른쪽 패널) ─────────────────────────
  let insp = null;
  function closeInspector() {
    if (!insp) return;
    insp.panel.remove(); insp.back.remove();
    const a = insp.returnFocus; insp = null;
    if (a && document.contains(a)) a.focus({ preventScroll: true });
  }
  function payRowActions(deal, p, readonly) {
    if (readonly) return '';
    const btns = [];
    const open = isOpenPay(p);
    if (p.status === 'draft') btns.push(`<button type="button" class="btn dark" data-a="confirm" data-p="${p.id}">청구 확정</button>`);
    if (open) btns.push(`<button type="button" class="btn dark" data-a="collect" data-p="${p.id}">수금 처리</button>`);
    if (open && overCap(deal, p) > 0) btns.push(`<button type="button" class="btn" data-a="cap" data-p="${p.id}">법정 상한으로 낮추기</button>`);
    if (pendingEvidence(p).length) btns.push(`<button type="button" class="btn" data-a="evidence" data-p="${p.id}">증빙 기록</button>`);
    if (isOverdue(p)) btns.push(`<button type="button" class="btn" data-a="dun" data-p="${p.id}" ${db.dunned[p.id] ? 'disabled' : ''}>${db.dunned[p.id] ? '독촉함' : '독촉'}</button>`);
    if (open) btns.push(`<button type="button" class="btn" data-a="adjust" data-p="${p.id}">조정 요청</button>`);
    if (open || p.status === 'draft') btns.push(`<button type="button" class="btn" data-a="info" data-p="${p.id}">예정일·납부자</button>`);
    return btns.length ? `<div class="pay-actions">${btns.join('')}</div>` : '';
  }
  /** 입금 한 줄: 날짜, 방식, 금액, 부가세, 증빙 */
  function receiptLine(p, r) {
    let ev = '';
    if (r.evidenceType === 'partner') ev = '파트너 수금';
    else if (r.evidenceType === 'card') ev = '카드 결제';
    else if (r.evidenceDate) ev = `${EVIDENCE[r.evidenceType]} ${esc(r.evidenceNo || '')}`;
    else { const due = evidenceDue(r); ev = `<span class="${due < TODAY ? 'red' : 'amber'}">${EVIDENCE[r.evidenceType]} 미발행 · ${rel(due)}</span>`; }
    return `<div class="rcpt"><span class="tnum">${md(r.date)}</span><span>${esc(METHOD[r.method] || '')} ${money(r.amount)}${r.vat ? ` <span class="muted">+ 부가세 ${money(r.vat)}</span>` : ''}</span><span class="rcpt-ev">${ev}</span></div>`;
  }
  function renderInspector() {
    if (!insp) return;
    const deal = db.deals.find((x) => x.id === insp.dealId);
    const s = dealSum(deal);
    const partner = partnerOf(deal);
    const ro = insp.readonly;
    const pct = collectPct(s.collected, s.billed);
    const editable = deal.payments.filter(isDistEditable);
    const curRatio = editable.length ? partnerRatioOf(editable[0].distributions) : 0;
    // 청구에 저장된 파트너를 유지한다. 거래의 파트너와 다를 수 있다.
    const storedRow = editable.flatMap((p) => p.distributions).find((d) => isPartnerRow(d) && d.partnerBrokerId);
    const sliderPartner = (storedRow && partnerById(storedRow.partnerBrokerId)) || partner;
    // 청구마다 분배가 다르면 첫 청구와 같은 값으로 맞추는 것도 변경이다.
    const uniform = editable.every((p) => partnerRatioOf(p.distributions) === curRatio && partnerIdOf(p.distributions) === partnerIdOf(editable[0].distributions));
    const curTotals = editable.reduce((acc, p) => {
      const amounts = splitRows(p.expectedAmount, p.distributions);
      p.distributions.forEach((d, i) => { if (isPartnerRow(d)) acc.partner += amounts[i]; else acc.our += amounts[i]; });
      if (!p.distributions.length) acc.our += p.expectedAmount;
      return acc;
    }, { our: 0, partner: 0 });
    const sliderHead = (ratio, showRatio, totals) => `<span>우리 ${showRatio ? `<b>${ourRatioFrom(ratio)}%</b> · ` : ''}${money(totals.our)}</span><span>${esc(sliderPartner ? sliderPartner.name : '파트너')} ${showRatio ? `<b>${ratio}%</b> · ` : ''}${money(totals.partner)}</span>`;
    const body = insp.panel.querySelector('.insp-body');
    const keep = body ? body.scrollTop : 0;
    const cap = legalCap(deal);
    const manage = !ro && canManage();
    insp.panel.innerHTML = `
      <div class="insp-head">
        <div class="insp-tags">${badge('tx', deal.transactionType)}${deal.isCancelled ? '<span class="badge t-gray">거래 취소</span>' : badge('stage', deal.stage)}${partner ? `<span class="badge t-neutral">${icon('handshake')}&nbsp;${esc(partner.name)}</span>` : ''}
          <button type="button" class="icon-btn" data-a="close" aria-label="닫기">${icon('x')}</button></div>
        <h2>${esc(loc(deal))}</h2>
        <p>계약 ${ymd(deal.stageChangedAt)}${deal.balanceDueDate ? ` · 잔금일 ${ymd(deal.balanceDueDate)}` : ''}${deal.isCancelled ? ` · ${ymd(deal.cancelledAt)} 취소: ${esc(deal.cancelReason || '')}` : ''}</p>
      </div>
      <div class="insp-body">
        <section class="insp-sec">
          <div class="insp-figs">
            <div><div class="l">청구 합계</div><div class="v">${money(s.billed)}</div></div>
            <div><div class="l">수금</div><div class="v">${money(s.collected)}</div></div>
            <div><div class="l">미수</div><div class="v ${worstStatus(deal) === 'overdue' ? 'red' : ''}">${money(s.remaining)}</div></div>
          </div>
          <span class="meter" role="img" aria-label="수금 진행률 ${pct}%"><i style="width:${pct}%"></i></span>
        </section>
        <section class="insp-sec">
          <h3>청구 ${deal.payments.length}건${deal.payments.length && manage && !deal.isCancelled && (['seller', 'buyer'].some((side) => !deal.payments.some((p) => p.clientSide === side))) ? ` <button type="button" class="link" data-a="add-pay" style="margin-left:6px">청구 추가</button>` : ''}</h3>
          ${deal.payments.length ? '' : `<div class="no-pay"><p>아직 청구가 없습니다. 거래가를 정하지 않고 만든 거래는 청구가 자동으로 만들어지지 않습니다.${cap.base ? ` 지금 조건의 ${capText(cap)}입니다.` : ''}</p>${manage ? '<button type="button" class="btn dark" data-a="add-pay">청구 추가</button>' : ''}</div>`}
          ${deal.payments.map((p) => {
            const adj = pendingAdj(p.id);
            const amounts = splitRows(billable(p), p.distributions);
            const rowName = (d) => { if (!isPartnerRow(d)) return '우리'; const b = partnerById(d.partnerBrokerId) || partner; return esc(b ? b.name : '파트너'); };
            const settledText = (d, i) => { const done = settledAmountOf(d); if (!done) return ''; return done >= amounts[i] ? ' 정산됨' : ` 중 ${money(done)} 정산됨`; };
            const dist = p.distributions.map((d, i) => `${rowName(d)} ${Number(d.shareRatio)}% (${money(amounts[i])})${settledText(d, i)}`).join(' · ');
            const over = overCap(deal, p);
            const overGot = Math.max(0, received(p) - cap.amount);
            const rate = effRate(deal, p);
            return `<div class="pay ${insp.paymentId === p.id ? 'hl' : ''}" data-pay="${p.id}">
              <div class="pay-top"><span class="strong">${sideLabel(p)}</span><span class="muted">${esc(payerName(deal, p))} · ${esc(PAYER[p.payerType])} · ${esc(p.code)}</span>${badge('commission', payStatus(p))}<span class="amt">${money(p.expectedAmount)}</span></div>
              <div class="pay-meta">
                ${p.receipts.length ? `<div class="rcpts">${p.receipts.map((r) => receiptLine(p, r)).join('')}</div>` : ''}
                ${p.status === 'waived' && received(p) > 0 ? `<div>수금 ${money(received(p))} · 나머지 ${money(p.expectedAmount - received(p))} 면제</div>` : ''}
                ${isOpenPay(p) && p.status === 'partial' ? `<div class="amber">남은 수수료 ${money(remaining(p))}${p.agreedRemainingDate ? ` · ${mdw(p.agreedRemainingDate)} 약속` : ''}</div>` : ''}
                ${isOpenPay(p) && p.status !== 'partial' && p.dueDate ? `<div class="${isOverdue(p) ? 'red' : ''}">예정일 ${mdw(p.dueDate)} · ${rel(p.dueDate)}</div>` : ''}
                ${p.status === 'draft' ? `<div>아직 확정하지 않은 청구입니다. 계약 때 정한 수수료로 확정하세요.${p.dueDate ? ` 예정일 ${mdw(p.dueDate)}` : ''}</div>` : ''}
                ${cap.base && !isClosedPay(p) ? `<div>${rate != null ? `청구 요율 ${rate}% · ` : ''}${capText(cap)}</div>` : ''}
                ${over > 0 ? `<div class="red">${overGot > 0 ? `법정 상한보다 ${money(overGot)} 더 받았습니다. 돌려줘야 하는 금액입니다.` : `법정 상한보다 ${money(over)} 많이 청구했습니다.`}</div>` : ''}
                ${dist ? `<div data-dist="${p.id}">${dist}${p.collectedByOffice === 'partner' ? ' · 파트너 수금' : ''}</div>` : ''}
                ${p.note ? `<div>${esc(p.note)}</div>` : ''}
                ${adj.map((a) => `<div class="amber">${ADJ[a.type]} ${money(a.amount)} 승인 대기 · <button type="button" class="link" data-a="decide" data-adj="${a.id}">${canDecide() ? '검토' : '대표 승인 대기'}</button></div>`).join('')}
                ${p.history.length ? `<div><button type="button" class="link muted" data-a="history" data-p="${p.id}">이력 ${p.history.length}건</button></div>` : ''}
              </div>
              ${payRowActions(deal, p, ro)}
            </div>`;
          }).join('')}
        </section>
        ${partner && editable.length && !ro ? `<section class="insp-sec">
          <h3>공동중개 분배</h3>
          <div class="slider-head" id="r-head">${sliderHead(curRatio, uniform, curTotals)}</div>
          <input class="slider" id="r-range" type="range" min="0" max="100" step="1" value="${curRatio}" aria-label="파트너 분배 비율">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span class="muted" style="font-size:12px">${uniform ? '' : '청구마다 분배가 다릅니다. '}수금이 끝나지 않은 청구 ${editable.length}건에 적용합니다.${deal.payments.length > editable.length ? ` 잠긴 청구 ${deal.payments.length - editable.length}건은 제외합니다.` : ''}</span><button type="button" class="btn" data-a="ratio" disabled>적용</button></div>
        </section>` : ''}
        <section class="insp-sec">
          <h3>거래 정보${manage && !deal.isCancelled ? ' <button type="button" class="link" data-a="terms" style="margin-left:6px">조건 변경</button>' : ''}</h3>
          <dl class="kv">
            <dt>${deal.transactionType === 'sale' ? '매도인' : '임대인'}</dt><dd>${esc(deal.sellerContactName)}</dd>
            <dt>${deal.transactionType === 'sale' ? '매수인' : '임차인'}</dt><dd>${esc(deal.buyerContactName)}</dd>
            ${deal.agreedPrice ? `<dt>${deal.transactionType === 'sale' ? '거래가' : '전세금'}</dt><dd>${money(deal.agreedPrice)}</dd>` : ''}
            ${deal.agreedDeposit ? `<dt>보증금</dt><dd>${money(deal.agreedDeposit)}</dd>` : ''}
            ${deal.agreedMonthlyRent ? `<dt>월세</dt><dd>${money(deal.agreedMonthlyRent)}</dd>` : ''}
            <dt>물건 유형</dt><dd>${esc(KIND[deal.propertyKind])}</dd>
            ${deal.transactionType === 'monthly' && cap.base ? `<dt>환산 금액</dt><dd>${money(cap.base)}</dd>` : ''}
          </dl>
          ${deal.history.length ? `<button type="button" class="link muted" data-a="deal-history" style="margin-top:8px;font-size:12.5px">거래 이력 ${deal.history.length}건</button>` : ''}
        </section>
        ${ro ? '' : `<section class="insp-sec">
          <h3>담당자 배분${manage ? ' <button type="button" class="link" data-a="parts" style="margin-left:6px">편집</button>' : ''}</h3>
          ${deal.participants.length ? `<ul class="people">${deal.participants.map((w) => {
            const amt = partAmount(deal, w);
            const settled = w.settlementStatus === 'settled';
            return `<li><span>${esc(w.userName)} <span class="muted">${PART_ROLE[w.role] || w.role} · ${w.commissionRate}%</span></span><span class="tnum" title="${settled && w.withheld ? `원천징수 ${money(w.withheld)} · 실지급 ${money(round1(amt - w.withheld))}` : ''}">${money(amt)}</span><span class="badge ${settled ? 't-success' : 't-warning'}">${settled ? '정산 완료' : '미정산'}</span></li>`;
          }).join('')}</ul>` : `<p class="amber" style="font-size:12.5px;line-height:1.5">담당자가 없습니다. 배정해야 직원 정산과 내 수수료에 잡힙니다.</p>`}
        </section>`}
        <section class="insp-sec insp-foot"><button type="button" class="btn" data-a="open-deal">${icon('external-link')} 거래관리에서 보기</button>${manage && !deal.isCancelled ? '<button type="button" class="btn ghost-danger" data-a="cancel-deal">거래 취소</button>' : ''}</section>
      </div>`;
    const nb = insp.panel.querySelector('.insp-body');
    nb.scrollTop = keep;
    const range = insp.panel.querySelector('#r-range');
    if (range) {
      const apply = insp.panel.querySelector('[data-a="ratio"]');
      const distRows = editable.map((p) => ({ p, node: insp.panel.querySelector(`[data-dist="${p.id}"]`) })).filter((x) => x.node);
      const original = new Map(distRows.map((x) => [x.p.id, x.node.textContent]));
      const partnerLabel = sliderPartner ? sliderPartner.name : '파트너';
      range.addEventListener('input', () => {
        const v = Number(range.value);
        const unchanged = uniform && v === curRatio;
        // 서버는 청구별로 내림하므로 합계도 청구별로 나눠 더한다.
        const totals = unchanged ? curTotals : editable.reduce((acc, p) => {
          const part = splitByRatio(p.expectedAmount, v);
          acc.our += part.our; acc.partner += part.partner;
          return acc;
        }, { our: 0, partner: 0 });
        insp.panel.querySelector('#r-head').innerHTML = sliderHead(v, uniform || !unchanged, totals);
        distRows.forEach(({ p, node }) => {
          const part = splitByRatio(p.expectedAmount, v);
          node.textContent = unchanged ? original.get(p.id) : `미리보기: 우리 ${ourRatioFrom(v)}% (${money(part.our)}) · ${partnerLabel} ${v}% (${money(part.partner)})`;
        });
        apply.disabled = unchanged;
      });
      apply.addEventListener('click', () => setPartnerRatio(deal.id, Number(range.value), sliderPartner ? sliderPartner.id : null));
    }
  }
  function openDeal(dealId, opts) {
    const o = opts || {};
    const ret = document.activeElement;
    if (insp) { insp.panel.remove(); insp.back.remove(); }
    const back = el('<div class="insp-back"></div>');
    const panel = el('<aside class="insp" role="dialog" aria-label="거래 상세" tabindex="-1"></aside>');
    document.body.append(back, panel);
    insp = { dealId, paymentId: o.paymentId || null, readonly: !!o.readonly, panel, back, returnFocus: ret };
    back.addEventListener('click', closeInspector);
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a; const pid = b.dataset.p;
      const deal = db.deals.find((x) => x.id === insp.dealId);
      if (a === 'close') closeInspector();
      else if (a === 'collect') collectDialog(pid);
      else if (a === 'confirm') confirmDraftDialog(pid);
      else if (a === 'evidence') evidenceDialog(pid);
      else if (a === 'adjust') adjustDialog(pid);
      else if (a === 'info') payInfoDialog(pid);
      else if (a === 'cap') lowerToCap(pid);
      else if (a === 'dun') dun(pid);
      else if (a === 'decide') decideDialog(b.dataset.adj);
      else if (a === 'add-pay') addPaymentDialog(deal.id);
      else if (a === 'terms') termsDialog(deal.id);
      else if (a === 'parts') partsDialog(deal.id);
      else if (a === 'cancel-deal') cancelDealDialog(deal.id);
      else if (a === 'history') { const { p } = findPay(pid); historyPop(b, p.history, `${sideLabel(p)} ${p.code} 이력`); }
      else if (a === 'deal-history') historyPop(b, deal.history, '거래 이력');
      else if (a === 'open-deal') toast('시안에서는 거래관리 화면으로 이동하지 않습니다.');
    });
    renderInspector();
    panel.focus({ preventScroll: true });
    if (o.paymentId) {
      const t = panel.querySelector(`[data-pay="${o.paymentId}"]`);
      if (t) t.scrollIntoView({ block: 'center' });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (openPop) { closePop(); return; }
    if (insp) closeInspector();
  });

  // ── 앱 셸 ──────────────────────────────────────────
  const me = () => SEED.users.find((u) => u.id === db.persona);
  const canManage = () => me().role === 'owner' || me().role === 'manager';
  const canDecide = () => me().role === 'owner';

  const NAV = [
    ['시작', [['대시보드', 'layout-dashboard']]],
    ['매물·공간', [['매물관리', 'building-2'], ['관리단지', 'map'], ['광고관리', 'megaphone', 'chev']]],
    ['고객·상담', [['고객 원장', 'users'], ['연락처', 'book-user'], ['상담기록', 'message-square']]],
    ['거래·계약', [['희망매물', 'user-search'], ['거래관리', 'handshake'], ['계약서 관리', 'file-text'], ['수수료/정산', 'wallet', 'cash']]],
    ['업무·운영', [['업무', 'list-todo'], ['캘린더', 'calendar-days'], ['직원관리', 'users'], ['설정', 'settings']]],
  ];
  const CASH_NAV = [
    ['cashflow', '캐시플로우', 'index.html', true],
    ['ledger', '수금 원장', 'ledger.html', true],
    ['partner', '공동중개 수수료', 'partner-commissions.html', true],
    ['employee', '직원 정산', 'employee-settlements.html', true],
    ['my', '내 수수료', 'my-settlement.html', false],
    ['expenses', '고정비 설정', 'expenses.html', true],
  ];

  function shell({ page, title, restricted }) {
    let collapsed = false;
    try { collapsed = localStorage.getItem(`${KEY}:side`) === '1'; } catch (e) { /* noop */ }
    const navHTML = NAV.map(([g, items]) => `<div class="nav-label">${g}</div>${items.map(([label, ic, kind]) => {
      if (kind === 'cash') {
        const subs = CASH_NAV.filter((c) => !c[3] || canManage()).map(([id, l, href]) => `<a href="${href}" class="${id === page ? 'on' : ''}" ${id === page ? 'aria-current="page"' : ''}>${l}</a>`).join('');
        return `<a class="nav-item" href="${canManage() ? 'index.html' : 'my-settlement.html'}">${icon(ic)}<span>${label}</span>${icon('chevron-down', 'chev')}</a><div class="nav-sub">${subs}</div>`;
      }
      return `<button type="button" class="nav-item" data-away="${label}">${icon(ic)}<span>${label}</span>${kind === 'chev' ? icon('chevron-right', 'chev') : ''}</button>`;
    }).join('')}`).join('');

    document.body.insertAdjacentHTML('afterbegin', `<div class="shell ${collapsed ? 'collapsed' : ''}" id="shell">
      <header class="titlebar">
        <div class="tb-brand"><b>Estaitt</b><button type="button" class="side-toggle" id="side-toggle" aria-label="사이드바 접기/펼치기">${icon('panel-left')}</button></div>
        <div class="tabs"><div class="tab">${icon('wallet')}<span>${esc(title)}</span></div><button type="button" class="tab-add" data-away="새 탭" aria-label="새 탭">${icon('plus')}</button></div>
      </header>
      <div class="body">
        <aside class="side"><nav class="side-scroll" aria-label="주 메뉴">${navHTML}</nav>
          <button type="button" class="side-user" id="persona"><span class="av">${esc(me().name[0])}</span><span>${esc(me().name)}<small>${ROLE[me().role]}</small></span>${icon('chevrons-up-down')}</button></aside>
        <main class="main" id="main"></main>
      </div>
    </div>`);
    document.title = `${title} 시안`;

    document.getElementById('side-toggle').addEventListener('click', () => {
      const s = document.getElementById('shell');
      s.classList.toggle('collapsed');
      try { localStorage.setItem(`${KEY}:side`, s.classList.contains('collapsed') ? '1' : '0'); } catch (e) { /* noop */ }
      window.dispatchEvent(new Event('resize'));
    });
    document.getElementById('persona').addEventListener('click', (e) => {
      menu(e.currentTarget, [
        { label: '서지현 · 대표로 보기', onClick: () => setPersona('u1') },
        { label: '김도윤 · 매니저로 보기', onClick: () => setPersona('u2') },
        { label: '박서연 · 중개사로 보기', onClick: () => setPersona('u3') },
      ]);
    });
    document.querySelector('.shell').addEventListener('click', (e) => {
      const away = e.target.closest('[data-away]');
      if (away) toast(`이 시안에는 캐시플로우 화면만 있습니다. (${away.dataset.away})`);
    });

    const main = document.getElementById('main');
    if (restricted && !canManage()) {
      main.innerHTML = `<div class="page"><div class="scroll"><div class="empty" style="height:100%">${icon('lock')}<b>접근 권한이 없습니다</b><p>대표와 매니저만 볼 수 있는 화면입니다. 본인 수수료는 내 수수료에서 확인할 수 있습니다.</p><a class="btn lg" href="my-settlement.html">내 수수료로 이동</a></div></div>${statusbar('')}</div>`;
      wireReset(main);
      return null;
    }
    return main;
  }

  function setPersona(id) {
    db.persona = id;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* noop */ }
    location.reload();
  }

  const statusbar = (text) => `<div class="statusbar"><span id="status-text">${text}</span><button type="button" data-reset>시안 데이터 초기화</button></div>`;
  function wireReset(root) {
    root.addEventListener('click', (e) => {
      if (!e.target.closest('[data-reset]')) return;
      try { localStorage.removeItem(KEY); } catch (err) { /* noop */ }
      db = fresh();
      location.reload();
    });
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  db = load();

  window.CF = {
    get db() { return db; }, STORE_KEY: KEY, commit, onChange: (fn) => listeners.add(fn), SEED, TODAY,
    esc, icon, el, money, ymd, md, mdw, rel, daysFrom, parse, monthKey, badge, statusLabel, WEEK, round1,
    ROLE, PART_ROLE, PAY_TYPE, ADJ, METHOD, KIND, EVIDENCE, PAYER, TAX_TYPE,
    loc, sideLabel, payerName, partnerOf, remaining, effectiveDue, isOverdue, isClosedPay, isPayDone, isOpenPay, payStatus, received, billable, countsAsBilled, partnerRatioOf, ourRatioFrom,
    dealSum, worstStatus, isFullyCollected, pendingAdj, partnerItems, settlePartnerItem, participantState,
    legalCap, overCap, capText, evidenceDone, evidenceDue, pendingEvidence, partAmount, withholdingOf, userById, ourPart,
    monthlyAmount, monthlyExpense, allPayments, monthStats, trend, findPay, log,
    popover, closePop, menu, chip, toast, dialog, moneyPreview,
    collectDialog, evidenceDialog, adjustDialog, adjustmentProblem, decideDialog, decideAdjustment, confirmDraftDialog, dun, openDeal, closeInspector,
    addPaymentDialog, payInfoDialog, lowerToCap, termsDialog, partsDialog, cancelDealDialog, historyPop,
    shell, statusbar, wireReset, me, canManage, canDecide, downloadCsv,
  };
  listeners.add(renderInspector);
  if (droppedOldData) toast('시안의 계산 규칙이 바뀌어 저장된 조작 내용을 지우고 처음 상태로 되돌렸습니다.');
})();
