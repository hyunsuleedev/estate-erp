/* 수수료/정산 여섯 화면이 같이 쓰는 데이터·계산 규칙·입력 창·거래 상세.
 * 계산 규칙은 apps/desktop/.../cashflow/-cashflow-utils.ts 를 그대로 옮겼다. 금액은 만원. */
(() => {
  const { icon, won, toast, menu } = UI;
  const NOW = new Date(2026, 10, 11); // 데모의 오늘: 2026-11-11 (수)
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // 원본 formatMoney: 15억 8,000만 / 5,000만 / 16억 / 0·없음은 —
  const man = (v) => {
    if (v == null || v === 0 || Number.isNaN(v)) return '—';
    if (v < 0) return `-${man(-v)}`;
    return v % 10000 ? `${won(v)}만` : won(v);
  };

  // ── 날짜 ('YYYY-MM-DD' 문자열) ──
  const toDate = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const TODAY = dayKey(NOW);
  const monthKey = (y, m) => `${y}-${pad2(m)}`;
  const THIS = { year: NOW.getFullYear(), month: NOW.getMonth() + 1 };
  const stepMonth = ({ year, month }, delta) => { const d = new Date(year, month - 1 + delta, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; };
  const daysFrom = (s) => { const d = toDate(s); return d ? Math.round((d - NOW) / 864e5) : null; };
  const rel = (s) => { const n = daysFrom(s); if (n === null) return ''; if (n === 0) return '오늘'; return n > 0 ? `D-${n}` : `${-n}일 경과`; };
  const short = (s) => (s ? `${s.slice(5, 7)}.${s.slice(8, 10)}` : '—');
  const shortDay = (s) => (s ? `${short(s)} (${WEEK[toDate(s).getDay()]})` : '—');
  const full = (s) => (s ? s.replace(/-/g, '.') : '—');

  // ── 이름표 ──
  const TYPE = { sale: '매매', jeonse: '전세', monthly: '월세' };
  const STAGE = { preparing: ['', '계약 준비'], preContract: ['purple', '가계약'], contracted: ['blue', '본계약'], settling: ['orange', '중도금/잔금'], completed: ['green', '잔금완료'], closed: ['', '정산종료'] };
  const PSTATUS = { draft: ['', '작성중'], pending: ['warn', '수금대기'], partial: ['orange', '부분수금'], collected: ['ok', '수금완료'], overdue: ['danger', '연체'], waived: ['hold', '면제'], cancelled: ['done', '취소'] };
  const METHOD = { transfer: '계좌이체', cash: '현금', card: '카드', other: '기타' };
  const ADJ_LABEL = { discount: '할인 합의', waive: '면제', bad_debt: '대손 처리' };
  const ROLE = { owner: '대표', manager: '매니저', agent: '중개사' };
  const PAYTYPE = { fixed: '고정급', mixed: '혼합', commission_only: '수수료제' };
  const PART_ROLE = { listing_agent: '매도측', buying_agent: '매수측', dual_agent: '단독중개', manager: '관리', assistant: '보조', closer: '마감' };
  const PART_ROLE_LONG = { listing_agent: '매도 담당', buying_agent: '매수 담당', dual_agent: '양측 담당', manager: '매니저', assistant: '보조', closer: '마감' };
  const typeTag = (t) => `<span class="tag ${t}">${TYPE[t]}</span>`;
  const stageTag = (s) => `<span class="tag ${STAGE[s][0]}">${STAGE[s][1]}</span>`;
  const badge = (s) => `<span class="st ${PSTATUS[s][0]}">${PSTATUS[s][1]}</span>`;
  const sideLabel = (side) => (side === 'seller' ? '매도측' : '매수측');

  // ── 예시 데이터 ──
  const PARTNERS = {
    pb1: { id: 'pb1', name: '상일한강공인', phone: '02-441-2200' },
    pb2: { id: 'pb2', name: '고덕센트럴공인', phone: '02-428-7100' },
    pb3: { id: 'pb3', name: '강일리버공인', phone: '02-481-3355' },
  };
  const EMPLOYEES = [
    { id: '이현수', name: '이현수', role: 'owner', payType: 'mixed', base: 300, rate: 60, active: true, phone: '010-3120-4477' },
    { id: '박서연', name: '박서연', role: 'manager', payType: 'mixed', base: 250, rate: 50, active: true, phone: '010-8841-2093' },
    { id: '최민준', name: '최민준', role: 'agent', payType: 'commission_only', base: 0, rate: 60, active: true, phone: '010-5512-7780' },
    { id: '정다은', name: '정다은', role: 'agent', payType: 'mixed', base: 200, rate: 40, active: true, phone: '010-2267-9914' },
    { id: '한지우', name: '한지우', role: 'agent', payType: 'commission_only', base: 0, rate: 50, active: false, phone: '010-9034-5521' },
  ];
  const ME = '이현수';
  const P = (side, o = {}) => ({ side, status: 'pending', act: null, due: null, paid: null, agreed: null, by: 'us', tax: 'none', taxNo: null, method: null, note: '', pr: 0, partnerId: null, distSettled: false, ...o });
  const got = (paid, o = {}) => ({ status: 'collected', paid, method: 'transfer', ...o });
  const DEALS = [
    { id: 'd1', site: '고덕그라시움', dong: '103동', unit: '3401호', type: 'sale', stage: 'settling', changed: '2026-10-20', balance: '2026-11-28', seller: '한정우', buyer: '김지현', price: 168000,
      people: [['이현수', 'listing_agent', 'seller', 60], ['박서연', 'buying_agent', 'buyer', 50]], pays: [P('seller'), P('buyer')] },
    { id: 'd2', site: '고덕아르테온', dong: '312동', unit: '1704호', type: 'sale', stage: 'contracted', changed: '2026-11-03', balance: '2027-01-15', seller: '윤태호', buyer: '장하은', price: 152000, partner: 'pb1',
      people: [['이현수', 'listing_agent', 'seller', 60]], pays: [P('seller', { pr: 30 }), P('buyer', { pr: 70, by: 'partner' })] },
    { id: 'd3', site: '래미안힐스테이트고덕', dong: '120동', unit: '801호', type: 'jeonse', stage: 'completed', changed: '2026-10-28', balance: '2026-11-06', seller: '오세훈', buyer: '문가영', deposit: 72000,
      people: [['최민준', 'dual_agent', 'both', 60]], pays: [P('seller', got('2026-11-06')), P('buyer', { status: 'partial', act: 150, paid: '2026-11-06', method: 'transfer', agreed: '2026-11-16', note: '잔여분 11월 16일 입금 약속' })] },
    { id: 'd4', site: '고덕그라시움', dong: '205동', unit: '902호', type: 'monthly', stage: 'completed', changed: '2026-10-12', balance: '2026-10-30', seller: '서미란', buyer: '강도윤', deposit: 10000, rent: 190,
      people: [['최민준', 'dual_agent', 'both', 60]], pays: [P('seller', { note: '집주인 해외 체류, 귀국 후 입금 예정' }), P('buyer', got('2026-10-30', { tax: 'issued', taxNo: '2026-10-00031' }))] },
    { id: 'd5', site: '고덕센트럴아이파크', dong: '104동', unit: '2203호', type: 'jeonse', stage: 'settling', changed: '2026-10-25', balance: '2026-11-14', seller: '임수정', buyer: '조성민', deposit: 69000, partner: 'pb2',
      people: [['박서연', 'dual_agent', 'both', 50]], pays: [P('seller', { pr: 50 }), P('buyer', { pr: 50, by: 'partner' })] },
    { id: 'd6', site: '고덕자이', dong: '108동', unit: '1902호', type: 'sale', stage: 'completed', changed: '2026-09-18', balance: '2026-10-24', seller: '배정호', buyer: '신유나', price: 129000,
      people: [['박서연', 'listing_agent', 'seller', 50], ['정다은', 'buying_agent', 'buyer', 40]], pays: [P('seller', { note: '잔금 지연 건으로 할인 협의 중' }), P('buyer', got('2026-10-24', { tax: 'issued', taxNo: '2026-10-00027' }))] },
    { id: 'd7', site: '고덕아르테온', dong: '301동', unit: '1203호', type: 'jeonse', stage: 'closed', changed: '2026-09-30', balance: '2026-09-26', seller: '권혁', buyer: '이나래', deposit: 75000,
      people: [['정다은', 'dual_agent', 'both', 40, '2026-10-05']], pays: [P('seller', got('2026-09-26', { tax: 'issued', taxNo: '2026-09-00019' })), P('buyer', got('2026-09-26', { tax: 'issued', taxNo: '2026-09-00020' }))] },
    { id: 'd8', site: '고덕그라시움', dong: '121동', unit: '2502호', type: 'sale', stage: 'contracted', changed: '2026-11-06', balance: '2026-12-18', seller: '남궁민', buyer: '박준호', price: 175000,
      people: [['이현수', 'dual_agent', 'both', 60]], pays: [P('seller', { status: 'draft' }), P('buyer')] },
    { id: 'd9', site: '상일동 하늘빌라', dong: '-', unit: '302호', type: 'monthly', stage: 'completed', changed: '2026-10-20', balance: '2026-11-02', seller: '황보람', buyer: '유재원', deposit: 3000, rent: 75,
      people: [['최민준', 'dual_agent', 'both', 60]], pays: [P('seller', got('2026-11-02', { method: 'cash' })), P('buyer', { status: 'waived', note: '단골 고객 면제' })] },
    { id: 'd10', site: '고덕센트럴아이파크', dong: '101동', unit: '1501호', type: 'sale', stage: 'completed', changed: '2026-10-08', balance: '2026-10-31', seller: '차은주', buyer: '배유진', price: 148000, partner: 'pb3',
      people: [['이현수', 'listing_agent', 'seller', 60], ['정다은', 'buying_agent', 'buyer', 40]], pays: [P('seller', got('2026-10-31', { pr: 40, tax: 'issued', taxNo: '2026-10-00035' })), P('buyer', got('2026-10-31', { pr: 50, by: 'partner' }))] },
    { id: 'd11', site: '래미안힐스테이트고덕', dong: '105동', unit: '2304호', type: 'sale', stage: 'settling', changed: '2026-10-30', balance: '2026-11-20', seller: '송지훈', buyer: '안소희', price: 146000,
      people: [['박서연', 'dual_agent', 'both', 50]], pays: [P('seller', { status: 'partial', act: 300, paid: '2026-11-04', method: 'transfer', agreed: '2026-11-18' }), P('buyer')] },
    { id: 'd12', site: '고덕자이', dong: '104동', unit: '703호', type: 'monthly', stage: 'preContract', changed: '2026-11-09', balance: '2026-12-05', seller: '곽동현', buyer: '민서진', deposit: 20000, rent: 120,
      people: [['정다은', 'dual_agent', 'both', 40]], pays: [P('seller'), P('buyer')] },
    { id: 'd13', site: '고덕그라시움', dong: '117동', unit: '1203호', type: 'jeonse', stage: 'completed', changed: '2026-08-22', balance: '2026-08-29', seller: '노영석', buyer: '하지원', deposit: 78000, partner: 'pb1',
      people: [['이현수', 'dual_agent', 'both', 60, '2026-11-05']], pays: [P('seller', got('2026-08-29', { pr: 50, tax: 'issued', taxNo: '2026-08-00014' })), P('buyer', got('2026-08-29', { pr: 50, by: 'partner' }))] },
    { id: 'd14', site: '고덕아르테온', dong: '305동', unit: '503호', type: 'jeonse', stage: 'closed', changed: '2025-12-12', balance: '2025-12-19', seller: '정미경', buyer: '류현우', deposit: 64000, partner: 'pb2',
      people: [['박서연', 'dual_agent', 'both', 50, '2025-12-24']], pays: [P('seller', got('2025-12-19', { pr: 50, distSettled: true, tax: 'issued', taxNo: '2025-12-00044' })), P('buyer', got('2025-12-19', { pr: 50, by: 'partner', distSettled: true }))] },
    { id: 'd15', site: '고덕자이', dong: '102동', unit: '1101호', type: 'jeonse', stage: 'closed', changed: '2026-07-03', balance: '2026-07-10', seller: '도경민', buyer: '채수빈', deposit: 61000,
      people: [['최민준', 'dual_agent', 'both', 60, '2026-07-15']], pays: [P('seller', got('2026-07-10', { tax: 'issued', taxNo: '2026-07-00008' })), P('buyer', got('2026-07-10', { tax: 'issued', taxNo: '2026-07-00009' }))] },
    { id: 'd16', site: '고덕그라시움', dong: '109동', unit: '1101호', type: 'sale', stage: 'closed', changed: '2026-06-12', balance: '2026-06-19', seller: '변상철', buyer: '엄지호', price: 161000,
      people: [['한지우', 'listing_agent', 'seller', 50, '2026-06-25'], ['이현수', 'buying_agent', 'buyer', 60, '2026-06-25']], pays: [P('seller', got('2026-06-19', { tax: 'issued', taxNo: '2026-06-00003' })), P('buyer', got('2026-06-19', { tax: 'issued', taxNo: '2026-06-00004' }))] },
  ];
  const PAY = {};
  let seq = 0;
  DEALS.forEach((d) => {
    d.partner = d.partner || null;
    const base = d.type === 'sale' ? d.price : d.type === 'jeonse' ? d.deposit : d.deposit + d.rent * 100;
    const rate = d.type === 'sale' ? 0.5 : 0.4;
    d.pays.forEach((p) => {
      seq += 1;
      p.id = `p${seq}`;
      p.dealId = d.id;
      p.code = `CP-${d.changed.slice(2, 4)}${d.changed.slice(5, 7)}-${String(seq).padStart(3, '0')}`;
      p.base = base;
      p.rate = rate;
      p.exp = Math.round((base * rate) / 100);
      if (p.status === 'collected' && p.act == null) p.act = p.exp;
      PAY[p.id] = p;
    });
  });
  const dealOf = (p) => DEALS.find((d) => d.id === p.dealId);
  const dealById = (id) => DEALS.find((d) => d.id === id);
  const loc = (d) => [d.site, d.dong === '-' ? null : d.dong, d.unit].filter(Boolean).join(' ') || '매물 미지정';
  const payer = (d, p) => (p.side === 'seller' ? d.seller : d.buyer);
  const payLabel = (d, p) => `${loc(d)} · ${sideLabel(p.side)} ${p.code}`;
  const partnerOf = (d, p) => PARTNERS[(p && p.partnerId) || d.partner] || null;

  // 승인 대기 조정
  const ADJ = [
    { id: 'a1', code: 'ADJ-2611-01', payId: 'p11', type: 'discount', amount: 100, reason: '잔금 지연 보상으로 100만 할인 합의', by: '박서연', status: 'pending' },
    { id: 'a2', code: 'ADJ-2611-02', payId: 'p22', type: 'discount', amount: 50, reason: '지인 소개 고객, 할인 요청', by: '박서연', status: 'pending' },
    { id: 'a3', code: 'ADJ-2611-03', payId: 'p6', type: 'discount', amount: 150, reason: '이사 일정 변경 불편 보상', by: '최민준', status: 'pending' },
  ];
  const pendingAdj = () => ADJ.filter((a) => a.status === 'pending');
  const pendingAdjOf = (p) => ADJ.filter((a) => a.status === 'pending' && a.payId === p.id).length;

  const EXPENSES = [
    { id: 'e1', title: '사무실 임대료', category: 'rent', frequency: 'monthly', amount: 330, day: 25, deductible: true, note: '1층 상가, 보증금 5,000만 별도', active: true },
    { id: 'e2', title: '네이버 부동산 광고', category: 'ad', frequency: 'monthly', amount: 120, day: 10, deductible: true, note: '단지 5곳', active: true },
    { id: 'e3', title: '이실장 이용료', category: 'ad', frequency: 'monthly', amount: 33, day: 5, deductible: true, note: '', active: true },
    { id: 'e4', title: '부동산뱅크 광고', category: 'ad', frequency: 'monthly', amount: 55, day: 5, deductible: true, note: '12월부터 다시 사용', active: false },
    { id: 'e5', title: '인터넷·전화', category: 'telecom', frequency: 'monthly', amount: 18, day: 20, deductible: true, note: 'KT 3회선', active: true },
    { id: 'e6', title: '공제증서 (보증보험)', category: 'insurance', frequency: 'yearly', amount: 96, day: null, deductible: true, note: '3월 갱신', active: true },
    { id: 'e7', title: '공인중개사협회비', category: 'association', frequency: 'yearly', amount: 36, day: null, deductible: false, note: '', active: true },
    { id: 'e8', title: '복합기 임대·사무용품', category: 'supplies', frequency: 'monthly', amount: 15, day: 15, deductible: false, note: '', active: true },
    { id: 'e9', title: '업무 차량 리스', category: 'vehicle', frequency: 'monthly', amount: 68, day: 12, deductible: true, note: '2028년 4월 만기', active: true },
    { id: 'e10', title: '세무 기장료', category: 'other', frequency: 'monthly', amount: 22, day: 28, deductible: true, note: '', active: true },
    { id: 'e11', title: '정수기·공기청정기 렌탈', category: 'other', frequency: 'quarterly', amount: 12, day: null, deductible: false, note: '', active: true },
  ];
  const monthlyExpense = (e) => (e.frequency === 'quarterly' ? Math.round(e.amount / 3) : e.frequency === 'yearly' ? Math.round(e.amount / 12) : e.amount);
  const expenseTotal = () => EXPENSES.filter((e) => e.active).reduce((s, e) => s + monthlyExpense(e), 0);

  // ── 청구 한 건 (원본 -cashflow-utils.ts) ──
  const isClosed = (p) => p.status === 'waived' || p.status === 'cancelled';
  const hasOpenStatus = (p) => p.status === 'pending' || p.status === 'partial' || p.status === 'overdue';
  const isDone = (p) => p.status === 'collected' || (hasOpenStatus(p) && p.exp - (p.act ?? 0) <= 0);
  const isOpen = (p) => hasOpenStatus(p) && !isDone(p);
  const received = (p) => (p.status === 'cancelled' ? 0 : p.status === 'collected' ? (p.act ?? p.exp) : (p.act ?? 0));
  const billable = (p) => (p.status === 'waived' ? received(p) : p.status === 'cancelled' ? 0 : p.exp);
  const countsAsBilled = (p) => !isClosed(p) || received(p) > 0;
  const remaining = (p) => (isClosed(p) || p.status === 'collected' ? 0 : Math.max(0, p.exp - (p.act ?? 0)));
  const effDue = (p, d) => (p.status === 'partial' && p.agreed ? p.agreed : (p.due ?? d.balance ?? null));
  const isOverdue = (p, d) => { if (!isOpen(p)) return false; if (p.status === 'overdue') return true; const n = daysFrom(effDue(p, d)); return n !== null && n < 0; };
  const disp = (p, d) => (isDone(p) ? 'collected' : isOverdue(p, d) ? 'overdue' : p.status);
  const percent = (c, b) => (b > 0 ? Math.min(100, Math.round((c / b) * 100)) : 0);
  const rollup = (pays) => pays.reduce((a, p) => { a.billed += billable(p); a.collected += received(p); a.remaining += remaining(p); return a; }, { billed: 0, collected: 0, remaining: 0 });
  const worst = (d) => {
    const ps = d.pays;
    if (ps.some((p) => isOverdue(p, d))) return 'overdue';
    if (ps.some((p) => isOpen(p) && p.status === 'partial')) return 'partial';
    if (ps.length && ps.every(isClosed)) return 'waived';
    if (ps.length && ps.every((p) => isDone(p) || isClosed(p))) return 'collected';
    return 'pending';
  };
  const fullyCollected = (d) => { const s = worst(d); return s === 'collected' || s === 'waived'; };
  const taxPending = (p) => (p.status === 'collected' || p.status === 'partial') && p.tax === 'none' && p.by === 'us';
  const checkReceived = (v, left) => (!Number.isFinite(v) || v <= 0 ? 'empty' : !Number.isInteger(v) ? 'fraction' : v > left ? 'over' : null);
  const adjProblem = (a, p) => { const left = remaining(p); if (left <= 0) return 'nothing-left'; return a.type === 'discount' && Math.abs(a.amount) > left ? 'over-remaining' : null; };

  // ── 공동중개 ──
  const split = (amount, pr) => { const partner = Math.floor((amount * pr) / 100); return { our: amount - partner, partner }; };
  const ourRatio = (pr) => Math.round((100 - pr) * 100) / 100;
  const shares = (p) => split(billable(p), p.pr);
  const shareTotals = (pays) => pays.reduce((a, p) => { const s = shares(p); a.our += s.our; a.partner += s.partner; return a; }, { our: 0, partner: 0 });
  // 들어온 돈 기준: 우리가 받은 건 파트너 몫을, 파트너가 받은 건 우리 몫을 더한다. 정산된 분배는 뺀다.
  const partnerBalance = (pays) => pays.reduce((a, p) => {
    const got2 = Math.min(received(p), p.exp);
    if (got2 <= 0 || p.distSettled) return a;
    const s = split(got2, p.pr);
    if (p.by === 'us') a.payable += s.partner; else a.receivable += s.our;
    return a;
  }, { receivable: 0, payable: 0 });
  const distEditable = (p) => (p.status === 'draft' || isOpen(p)) && !p.distSettled;

  // ── 직원 배분 ──
  DEALS.forEach((d) => {
    d.people = d.people.map(([userId, role, side, rate, settledAt], i) => {
      const mine = d.pays.filter((p) => side === 'both' || p.side === side);
      const ourBilled = mine.reduce((s, p) => s + split(p.exp, p.pr).our, 0);
      return { id: `${d.id}-u${i}`, userId, role, side, rate, amount: Math.round((ourBilled * rate) / 100), settled: !!settledAt, settledAt: settledAt || null };
    });
  });
  const settlement = (pt, d) => {
    const mine = d.pays.filter((p) => countsAsBilled(p) && (pt.side === 'both' || p.side === pt.side));
    const billed = mine.reduce((s, p) => s + billable(p), 0);
    const collected = mine.reduce((s, p) => s + received(p), 0);
    const state = pt.settled ? 'settled' : mine.length && mine.every((p) => isDone(p) || isClosed(p)) ? 'ready' : 'waiting';
    return { state, billed, collected, percent: percent(collected, billed) };
  };

  // ── 캐시플로우 집계 ──
  const eachPay = (deals, fn) => deals.forEach((d) => d.pays.forEach((p) => fn(d, p)));
  const collectedIn = (key) => { let s = 0; eachPay(DEALS, (d, p) => { if (p.paid && p.paid.startsWith(key)) s += received(p); }); return s; };
  function monthlyOwed(year, month) {
    const key = monthKey(year, month);
    const cur = key === monthKey(THIS.year, THIS.month);
    const o = { pending: 0, overdue: 0, dueSoon: 0 };
    eachPay(DEALS, (d, p) => {
      if (!isOpen(p)) return;
      const due = effDue(p, d);
      const amt = remaining(p);
      if (isOverdue(p, d)) { if (cur || (due && due.startsWith(key))) o.overdue += amt; return; }
      if (due ? due.startsWith(key) : cur) o.pending += amt;
      const n = daysFrom(due);
      if (n !== null && n >= 0 && n <= 7) o.dueSoon += amt;
    });
    return o;
  }
  function todayQueue() {
    const q = { overdue: [], dueSoon: [], tax: [] };
    eachPay(DEALS, (d, p) => {
      const due = effDue(p, d);
      const item = { d, p, due, remaining: remaining(p) };
      if (isOpen(p)) {
        if (isOverdue(p, d)) q.overdue.push(item);
        else { const n = daysFrom(due); if (n !== null && n >= 0 && n <= 7) q.dueSoon.push(item); }
      }
      const paidDays = daysFrom(p.paid);
      if (taxPending(p) && paidDays !== null && paidDays >= -30) q.tax.push(item);
    });
    const byDue = (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999');
    q.overdue.sort(byDue);
    q.dueSoon.sort(byDue);
    q.tax.sort((a, b) => (b.p.paid ?? '').localeCompare(a.p.paid ?? ''));
    return q;
  }
  const CONTRACTED = new Set(['contracted', 'settling', 'completed', 'closed']);
  const monthContracts = (year, month) => DEALS.filter((d) => CONTRACTED.has(d.stage) && d.changed.startsWith(monthKey(year, month))).sort((a, b) => b.changed.localeCompare(a.changed));
  // 지난 여섯 달은 실제 수금, 이번 달부터는 앞으로 들어올 돈을 함께 쌓는다
  function trendBars() {
    const curKey = monthKey(THIS.year, THIS.month);
    const forecast = {};
    eachPay(DEALS, (d, p) => {
      if (!isOpen(p)) return;
      const dk = (effDue(p, d) || '').slice(0, 7);
      const key = !dk || isOverdue(p, d) || dk < curKey ? curKey : dk;
      forecast[key] = (forecast[key] || 0) + remaining(p);
    });
    const expense = expenseTotal();
    const out = [];
    for (let i = -5; i <= 2; i += 1) {
      const m = stepMonth(THIS, i);
      const key = monthKey(m.year, m.month);
      const collected = collectedIn(key);
      out.push({ key, ...m, label: `${m.year === THIS.year ? '' : `'${String(m.year).slice(2)}.`}${m.month}월`, collected, forecast: key >= curKey ? (forecast[key] || 0) : 0, expense, net: collected - expense });
    }
    return out;
  }

  // ── 바꾸고 되돌리기 ──
  // 실행 취소는 값이 아니라 변경 횟수(_rev)로 판단한다: 그 뒤에 다시 바뀌었으면 되돌리지 않는다.
  let onChange = () => {};
  const changed = () => { onChange(); renderPeek(); };
  const snap = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c._rev; return c; };
  function mutate(objs, apply, msg, undoable = true) {
    objs = [].concat(objs);
    const before = objs.map(snap);
    apply();
    const vs = objs.map((o) => (o._rev = (o._rev || 0) + 1));
    changed();
    toast(msg, undoable ? () => {
      if (objs.some((o, i) => o._rev !== vs[i])) { toast('그 뒤에 다시 바뀌어서 되돌리지 않았습니다'); return; }
      objs.forEach((o, i) => {
        Object.keys(o).forEach((k) => { if (k !== '_rev') delete o[k]; });
        Object.assign(o, before[i]);
        o._rev += 1;
      });
      changed();
    } : undefined);
  }

  // ── 입력 창 ──
  function dialog({ title, desc, body, ok = '저장', okClass = 'primary', extra, onOpen, onOk }) {
    document.querySelectorAll('.dlg-back').forEach((x) => x.remove());
    const back = document.createElement('div');
    back.className = 'dlg-back';
    back.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><h3>${title}</h3><p class="desc">${desc || ''}</p><div class="frm">${body || ''}</div>
      <div class="foot">${extra ? `<button class="btn l" data-extra>${extra.label}</button>` : ''}<button class="btn" data-x>${onOk ? '취소' : '닫기'}</button>${onOk ? `<button class="btn ${okClass}" data-ok>${ok}</button>` : ''}</div></div>`;
    document.body.append(back);
    const okBtn = back.querySelector('[data-ok]');
    const api = { close: () => back.remove(), q: (s) => back.querySelector(s), val: (s) => back.querySelector(s).value, setOk: (on) => { if (okBtn) okBtn.disabled = !on; } };
    back.addEventListener('mousedown', (e) => { if (e.target === back) api.close(); });
    back.querySelector('[data-x]').onclick = api.close;
    if (okBtn) okBtn.onclick = () => { if (onOk(api) !== false) api.close(); };
    if (extra) back.querySelector('[data-extra]').onclick = () => { if (extra.run(api) !== false) api.close(); };
    back.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 한글 조합 확정용 Enter·Esc는 넘긴다
      if (e.key === 'Escape') { e.stopPropagation(); api.close(); }
      else if (e.key === 'Enter' && e.target.matches('input') && okBtn && !okBtn.disabled) { e.preventDefault(); okBtn.click(); }
    });
    if (onOpen) onOpen(api);
    const first = back.querySelector('input:not([type=checkbox]), select');
    if (first) { first.focus(); if (first.select) first.select(); } else back.querySelector('[data-x]').focus();
    return api;
  }
  const fld = (label, inner) => `<label class="f">${label}${inner}</label>`;
  const opts = (map, cur) => Object.entries(map).map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');

  // 수금 처리: 남은 금액보다 적게 넣으면 부분수금으로 기록한다
  function collectDlg(p) {
    const d = dealOf(p);
    const left = remaining(p);
    if (!isOpen(p)) { toast('이미 수금이 끝난 청구입니다'); return; }
    dialog({
      title: '수금 처리', desc: `${esc(payLabel(d, p))} · 남은 금액 ${man(left)}`, ok: '수금 기록',
      body: `${fld('이번에 받은 금액 (만원)', `<input class="inp" id="cAmt" type="number" min="1" value="${left}"><p class="help" id="cHelp"></p>`)}
        <div class="twoc">${fld('지급 방식', `<select class="inp" id="cMethod">${opts(METHOD, 'transfer')}</select>`)}${fld('입금일', `<input class="inp" id="cDate" type="date" value="${TODAY}">`)}</div>
        ${fld('메모 (선택)', '<input class="inp" id="cNote" placeholder="예) 잔여분 11월 16일 입금 약속">')}<p class="help" id="cMove"></p>`,
      onOpen(api) {
        const upd = () => {
          const v = Number(api.val('#cAmt'));
          const prob = api.val('#cAmt') === '' ? 'empty' : checkReceived(v, left);
          const help = api.q('#cHelp');
          help.className = `help ${prob === 'over' || prob === 'fraction' ? 'bad' : ''}`;
          help.textContent = prob === 'over' ? `남은 금액 ${man(left)}보다 많습니다.` : prob === 'fraction' ? '만원 단위 정수로 입력해 주세요.' : prob ? '' : `= ${man(v)}원${v < left ? ` · 부분수금으로 기록되고 ${man(left - v)}이 남습니다` : ''}`;
          const date = api.val('#cDate');
          api.q('#cMove').textContent = (p.act ?? 0) > 0 && date && (p.paid || '').slice(0, 7) !== date.slice(0, 7) ? '입금일이 속한 달의 수금으로 집계됩니다. 입금일을 청구마다 하나만 저장하기 때문입니다.' : '';
          api.setOk(!prob && !!date);
        };
        api.q('#cAmt').oninput = upd;
        api.q('#cDate').oninput = upd;
        upd();
      },
      onOk(api) {
        const v = Number(api.val('#cAmt'));
        const part = v < left;
        const note = api.val('#cNote').trim();
        mutate(p, () => {
          p.act = (p.act ?? 0) + v; // 서버 collect는 금액을 덮어쓰므로 누적액을 보낸다
          p.paid = api.val('#cDate');
          p.method = api.val('#cMethod');
          if (note) p.note = note;
          p.status = part ? 'partial' : 'collected';
          if (!part) p.agreed = null;
        }, part ? `부분수금으로 기록했습니다. 남은 금액 ${man(left - v)}` : '수금 완료로 기록했습니다.');
      },
    });
  }
  function taxDlg(p) {
    const d = dealOf(p);
    dialog({
      title: '세금계산서 기록', desc: `${esc(payLabel(d, p))} · 수금 ${man(received(p))}`, ok: '기록',
      body: `${fld('세금계산서 번호', '<input class="inp" id="tNo" placeholder="예) 2026-11-00042">')}${fld('발행일', `<input class="inp" id="tDate" type="date" value="${TODAY}">`)}`,
      onOk(api) {
        const no = api.val('#tNo').trim();
        mutate(p, () => { p.tax = 'issued'; p.taxNo = no || null; p.taxAt = api.val('#tDate') || TODAY; }, '세금계산서 발행을 기록했습니다.');
      },
    });
  }
  function adjustDlg(p) {
    const d = dealOf(p);
    const left = remaining(p);
    dialog({
      title: '수수료 조정 요청', desc: `${esc(payLabel(d, p))} · 대표가 승인하면 반영됩니다.`, ok: '요청',
      body: `${fld('조정 유형', `<select class="inp" id="aType">${opts(ADJ_LABEL, 'discount')}</select>`)}
        <div id="aAmtBox">${fld('할인 금액 (만원)', '<input class="inp" id="aAmt" type="number" min="1" placeholder="예) 200"><p class="help" id="aHelp"></p>')}</div>
        ${fld('요청 사유', '<input class="inp" id="aWhy" placeholder="예) 고객 요청 협의">')}`,
      onOpen(api) {
        const upd = () => {
          const type = api.val('#aType');
          api.q('#aAmtBox').hidden = type !== 'discount';
          const v = Number(api.val('#aAmt'));
          const bad = type === 'discount' && (!(v > 0) || !Number.isInteger(v) || v > left);
          const help = api.q('#aHelp');
          help.className = `help ${v > left ? 'bad' : ''}`;
          help.textContent = v > left ? `남은 금액 ${man(left)}보다 많습니다.` : v > 0 && Number.isInteger(v) ? `청구 ${man(p.exp)} → ${man(p.exp - v)}` : '';
          api.setOk(!bad && api.val('#aWhy').trim().length > 0);
        };
        ['#aType', '#aAmt', '#aWhy'].forEach((s) => { api.q(s).oninput = upd; });
        upd();
      },
      onOk(api) {
        const type = api.val('#aType');
        const a = { id: `a${Date.now()}`, code: `ADJ-2611-${pad2(ADJ.length + 1)}`, payId: p.id, type, amount: type === 'discount' ? Number(api.val('#aAmt')) : left, reason: api.val('#aWhy').trim(), by: ME, status: 'pending', _rev: 1 };
        ADJ.push(a);
        changed();
        toast('조정을 요청했습니다. 대표가 승인하면 반영됩니다.', () => {
          if (a._rev !== 1 || !ADJ.includes(a)) { toast('그 뒤에 다시 바뀌어서 되돌리지 않았습니다'); return; }
          ADJ.splice(ADJ.indexOf(a), 1);
          changed();
        });
      },
    });
  }
  function confirmDraftDlg(p) {
    const d = dealOf(p);
    dialog({
      title: '청구 확정', desc: `${esc(payLabel(d, p))} · ${man(p.exp)}`, ok: '청구 확정',
      body: `${fld('수금 예정일 (선택)', `<input class="inp" id="dDue" type="date" value="${p.due || ''}">`)}<p class="help">비워 두면 잔금일을 기준으로 관리합니다. 확정한 뒤에는 일정을 바꿀 수 없습니다.</p>`,
      onOk(api) { mutate(p, () => { p.status = 'pending'; p.due = api.val('#dDue') || null; }, '청구를 확정했습니다.'); },
    });
  }
  const PROBLEM = { 'nothing-left': '이 청구는 남은 금액이 없어 조정을 적용할 수 없습니다. 반려해 주세요.', 'over-remaining': '요청 뒤 돈이 들어와 할인액이 남은 금액보다 큽니다. 승인하면 청구액이 받은 돈보다 작아집니다. 반려하고 다시 요청받아 주세요.' };
  function approveAdj(a) {
    const p = PAY[a.payId];
    if (a.status !== 'pending') return;
    if (adjProblem(a, p)) { decideDlg(a); return; }
    mutate([a, p], () => {
      a.status = 'approved';
      if (a.type === 'discount') p.exp -= a.amount; else p.status = 'waived';
    }, '수수료 조정을 승인했습니다.');
  }
  function rejectAdj(a) {
    if (a.status !== 'pending') return;
    mutate(a, () => { a.status = 'rejected'; }, '수수료 조정을 반려했습니다.');
  }
  // 조정 검토: 금액·사유를 보고 승인하거나 반려한다 (대표만)
  function decideDlg(a) {
    const p = PAY[a.payId];
    const d = dealOf(p);
    const prob = adjProblem(a, p);
    dialog({
      title: `${ADJ_LABEL[a.type]} 검토`, desc: esc(loc(d)), ok: '승인', extra: { label: '반려', run: () => rejectAdj(a) },
      body: `<dl><dt>청구</dt><dd>${sideLabel(p.side)} ${esc(payer(d, p))} · ${p.code}</dd><dt>청구액</dt><dd>${man(p.exp)} · 수금 ${man(received(p))} · 남은 금액 ${man(remaining(p))}</dd>
        <dt>${a.type === 'discount' ? '할인 금액' : '조정 금액'}</dt><dd>${man(a.amount)}${a.type === 'discount' && !prob ? ` → 청구 ${man(p.exp - a.amount)}` : ''}</dd><dt>요청</dt><dd>${esc(a.by)} · ${a.code}</dd><dt>사유</dt><dd>${esc(a.reason)}</dd></dl>
        ${prob ? `<p class="help bad">${PROBLEM[prob]}</p>` : ''}${fld('결정 메모 (선택)', '<input class="inp" placeholder="예) 원칙대로 승인">')}`,
      onOpen(api) { api.setOk(!prob); },
      onOk() { approveAdj(a); },
    });
  }
  function dunning(items) {
    const list = items.filter((p) => isOpen(p));
    if (!list.length) { toast('독촉할 미수 청구가 없습니다'); return 0; }
    toast(`독촉 업무 ${list.length}건을 만들었습니다.`);
    return list.length;
  }
  // 분배 수정: 청구 한 건 또는 거래 전체
  function distDlg(p) {
    const d = dealOf(p);
    const curPartner = p.partnerId || d.partner || '';
    dialog({
      title: '수수료 분배 수정', desc: `${p.code} · ${man(p.exp)}`,
      body: `<div class="ds-row"><span>우리 <b id="xOr"></b> · <span id="xOa"></span></span><span>파트너 <b id="xPr"></b> · <span id="xPa"></span></span></div>
        ${fld('파트너 분배 비율 (%)', `<input class="inp" id="xRatio" type="number" min="0" max="100" value="${p.pr}">`)}
        ${fld('파트너 중개사', `<select class="inp" id="xPartner"><option value="">파트너 선택</option>${Object.values(PARTNERS).map((b) => `<option value="${b.id}" ${b.id === curPartner ? 'selected' : ''}>${esc(b.name)} · ${b.phone}</option>`).join('')}</select><p class="help" id="xHelp"></p>`)}
        <label class="chk"><input type="checkbox" id="xAll">이 거래의 모든 청구에 적용</label>`,
      onOpen(api) {
        const upd = () => {
          const r = Number(api.val('#xRatio'));
          const ok = api.val('#xRatio') !== '' && r >= 0 && r <= 100;
          const s = split(p.exp, ok ? r : 0);
          api.q('#xOr').textContent = `${ok ? ourRatio(r) : '–'}%`;
          api.q('#xPr').textContent = `${ok ? r : '–'}%`;
          api.q('#xOa').textContent = man(s.our);
          api.q('#xPa').textContent = man(s.partner);
          const need = ok && r > 0 && !api.val('#xPartner');
          api.q('#xHelp').className = `help ${need ? 'bad' : ''}`;
          api.q('#xHelp').textContent = need ? '파트너 비율이 0%보다 크면 파트너를 골라야 합니다.' : '';
          api.q('[data-ok]').textContent = api.q('#xAll').checked ? '거래 전체 저장' : '저장';
          api.setOk(ok && !need);
        };
        ['#xRatio', '#xPartner', '#xAll'].forEach((s) => { api.q(s).oninput = upd; });
        upd();
      },
      onOk(api) {
        const r = Number(api.val('#xRatio'));
        const pid = api.val('#xPartner') || null;
        const targets = api.q('#xAll').checked ? d.pays.filter(distEditable) : [p];
        mutate(targets, () => targets.forEach((t) => { t.pr = r; t.partnerId = r > 0 ? pid : t.partnerId; }), targets.length > 1 ? `청구 ${targets.length}건의 분배를 우리 ${ourRatio(r)}% · 파트너 ${r}%로 바꿨습니다.` : '분배를 저장했습니다.');
      },
    });
  }
  const payAction = (kind, p) => ({ collect: collectDlg, tax: taxDlg, adjust: adjustDlg, confirmDraft: confirmDraftDlg, dist: distDlg, dun: (x) => dunning([x]) })[kind](p);

  // ── 거래 상세 (원본 LedgerDetailSheet) ──
  const peek = { dealId: null, payId: null, preview: null, pick: null, confirming: false, scrolled: false };
  function openDeal(dealId, payId) {
    Object.assign(peek, { dealId, payId: payId || null, preview: null, pick: null, confirming: false, scrolled: false });
    renderPeek();
  }
  function closeDeal() { peek.dealId = null; renderPeek(); }
  function payItem(d, p, preview) {
    const open = isOpen(p);
    const late = isOverdue(p, d);
    const pn = (partnerOf(d, p) || { name: '파트너' }).name;
    const lines = [];
    if (isDone(p)) lines.push(`${shortDay(p.paid)} 수금 ${man(received(p))}${p.method ? ` · ${METHOD[p.method]}` : ''}`);
    if (p.status === 'waived' && received(p) > 0) lines.push(`${shortDay(p.paid)} 수금 ${man(received(p))} · 나머지 ${man(p.exp - received(p))} 면제`);
    if (open && p.status === 'partial') lines.push(`${shortDay(p.paid)} 수금 ${man(p.act)} · <span class="warn-t">남은 금액 ${man(remaining(p))}${p.agreed ? ` · ${shortDay(p.agreed)} 약속` : ''}</span>`);
    if (open && p.status !== 'partial') { const due = effDue(p, d); if (due) lines.push(`<span class="${late ? 'danger-t' : ''}">예정일 ${shortDay(due)} · ${rel(due)}</span>`); }
    if (p.status === 'draft') lines.push('아직 확정하지 않은 청구입니다.');
    lines.push(`거래가 ${man(p.base)} × ${p.rate}%`);
    if (preview !== null) { const s = split(p.exp, preview); lines.push(`<span data-prev="${p.id}">미리보기: 우리 ${ourRatio(preview)}% (${man(s.our)}) · ${esc(pn)} ${preview}% (${man(s.partner)})</span>`); }
    else if (p.pr > 0) { const s = shares(p); lines.push(`우리 ${ourRatio(p.pr)}% (${man(s.our)}) · ${esc(pn)} ${p.pr}% (${man(s.partner)})${p.distSettled ? ' 정산됨' : ''}${p.by === 'partner' ? ' · 상대 수금' : ''}`); }
    if (p.tax !== 'none') lines.push(`세금계산서 ${esc(p.taxNo || '발행')}`);
    if (p.note) lines.push(esc(p.note));
    if (pendingAdjOf(p)) lines.push(`<span class="warn-t">조정 승인 대기 ${pendingAdjOf(p)}건</span>`);
    const b = (kind, label, cls = '') => `<button class="btn sm ${cls}" data-pa="${kind}">${label}</button>`;
    const acts = [
      p.status === 'draft' ? b('confirmDraft', '청구 확정', 'primary') : '',
      open ? b('collect', '수금 처리', 'primary') : '',
      late ? b('dun', '독촉') : '',
      (p.status === 'collected' || p.status === 'partial') && p.tax === 'none' ? b('tax', '계산서 기록') : '',
      open ? b('adjust', '조정 요청') : '',
      open && distEditable(p) && preview === null ? b('dist', '분배 수정') : '',
    ].join('');
    return `<li class="pay ${p.id === peek.payId ? 'hl' : ''}" data-pp="${p.id}">
      <div class="l1"><b>${sideLabel(p.side)}</b><span class="who3">${esc(payer(d, p))} · ${p.code}</span>${badge(disp(p, d))}<span class="amt">${man(p.exp)}</span></div>
      <div class="l2">${lines.map((x) => `<p>${x}</p>`).join('')}</div><div class="acts">${acts}</div></li>`;
  }
  function distTotals(editable) {
    if (peek.preview === null) return shareTotals(editable);
    return editable.reduce((a, p) => { const s = split(p.exp, peek.preview); a.our += s.our; a.partner += s.partner; return a; }, { our: 0, partner: 0 });
  }
  function distSection(d, editable) {
    const cur = editable[0].pr;
    const pid0 = editable[0].partnerId || d.partner;
    const uniform = editable.every((p) => p.pr === cur && (p.partnerId || d.partner) === pid0);
    const pr = peek.preview ?? cur;
    const dirty = peek.preview !== null;
    const show = dirty || uniform;
    const pid = peek.pick || pid0;
    const t = distTotals(editable);
    const locked = d.pays.length - editable.length;
    return `<div class="sec"><div class="sec-h">공동중개 분배</div>
      <div class="ds-row"><span>우리 <b id="dsOr">${show ? `${ourRatio(pr)}% · ` : ''}</b><span id="dsOa">${man(t.our)}</span></span><span>${esc((PARTNERS[pid] || { name: '파트너' }).name)} <b id="dsPr">${show ? `${pr}% · ` : ''}</b><span id="dsPa">${man(t.partner)}</span></span></div>
      <input class="ds-range" type="range" min="0" max="100" step="1" value="${pr}" data-ds aria-label="파트너 분배 비율">
      ${dirty && pr > 0 ? `<label class="frm"><span class="f">파트너 중개사<select class="inp" data-dspick>${Object.values(PARTNERS).map((b) => `<option value="${b.id}" ${b.id === pid ? 'selected' : ''}>${esc(b.name)} · ${b.phone}</option>`).join('')}</select></span></label>` : ''}
      <div class="ds-foot"><span>${show ? '' : '청구마다 분배가 다릅니다. '}수금이 끝나지 않은 청구에 모두 적용합니다.${locked ? ` 잠긴 청구 ${locked}건은 제외합니다.` : ''}</span>
        ${dirty && !peek.confirming ? '<span class="b"><button class="btn quiet sm" data-dsreset>되돌리기</button><button class="btn primary sm" data-dsapply>적용</button></span>' : ''}</div>
      ${dirty && peek.confirming ? `<div class="ds-confirm"><span>수금이 끝나지 않은 청구를 우리 ${ourRatio(pr)}% · 파트너 ${pr}%로 바꿀까요?</span><span class="b ds-foot" style="margin:0"><button class="btn quiet sm" data-dscancel>취소</button><button class="btn primary sm" data-dsgo>바꾸기</button></span></div>` : ''}</div>`;
  }
  function renderPeek() {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('cfPeek');
    const d = peek.dealId && dealById(peek.dealId);
    if (!d) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('aside');
      el.id = 'cfPeek';
      el.className = 'peek cf-peek';
      el.hidden = true;
      (document.querySelector('.panel') || document.body).append(el);
      el.addEventListener('click', peekClick);
      el.addEventListener('input', peekInput);
      el.addEventListener('change', (e) => { if (e.target.matches('[data-ds]')) renderPeek(); });
    }
    const top = el.querySelector('.peek-body') ? el.querySelector('.peek-body').scrollTop : 0;
    const wasHidden = el.hidden;
    const t = rollup(d.pays);
    const sale = d.type === 'sale';
    const editable = d.pays.filter(distEditable);
    const partner = PARTNERS[d.partner];
    const row = (k, v) => `<div class="pk">${k}</div><div class="pv">${v}</div>`;
    el.hidden = false;
    el.innerHTML = `<div class="peek-bar"><button class="ib" data-pclose aria-label="닫기">${icon('chevsRight')}</button><span class="crumb">거래 상세</span><span class="sp"></span><button class="btn quiet sm" data-pgo>${icon('handshake')}거래관리에서 보기</button></div>
      <div class="peek-body">
        <div>${typeTag(d.type)}${stageTag(d.stage)}${partner ? `<span class="tag">공동 · ${esc(partner.name)}</span>` : ''}</div>
        <h2>${esc(loc(d))}</h2>
        <div class="lead t2">단계 변경 ${full(d.changed)}${d.balance ? ` · 잔금일 ${full(d.balance)}` : ''}</div>
        <div class="figs"><div><div class="k">청구 합계</div><div class="v">${man(t.billed)}</div></div><div><div class="k">수금</div><div class="v">${man(t.collected)}</div></div><div><div class="k">미수</div><div class="v ${worst(d) === 'overdue' ? 'danger-t' : ''}">${man(t.remaining)}</div></div></div>
        <span class="meter"><i style="width:${percent(t.collected, t.billed)}%"></i></span>
        <div class="sec"><div class="sec-h">청구 <span class="n">${d.pays.length}건</span></div><ol class="pays">${d.pays.map((p) => payItem(d, p, peek.preview !== null && distEditable(p) ? peek.preview : null)).join('')}</ol></div>
        ${editable.length && partner ? distSection(d, editable) : ''}
        <div class="sec"><div class="sec-h">거래 정보</div><div class="props">
          ${row(sale ? '매도인' : '임대인', esc(d.seller))}${row(sale ? '매수인' : '임차인', esc(d.buyer))}
          ${d.price ? row('거래가', man(d.price)) : ''}${d.deposit ? row('보증금', man(d.deposit)) : ''}${d.rent ? row('월세', man(d.rent)) : ''}
          ${row('담당자', d.people.map((x) => `${esc(x.userId)} (${PART_ROLE_LONG[x.role]})`).join(', '))}</div></div>
      </div>`;
    el.querySelector('.peek-body').scrollTop = top;
    if (!peek.scrolled && peek.payId) { const hl = el.querySelector('.pay.hl'); if (hl && hl.scrollIntoView) hl.scrollIntoView({ block: 'center' }); }
    peek.scrolled = true;
    if (wasHidden === false) el.style.animation = 'none'; else el.style.animation = '';
  }
  function peekClick(e) {
    const t = e.target;
    const d = dealById(peek.dealId);
    if (t.closest('[data-pclose]')) return closeDeal();
    if (t.closest('[data-pgo]')) return toast(`거래관리에서 ${loc(d)} 거래를 엽니다`);
    const pa = t.closest('[data-pa]');
    if (pa) return payAction(pa.dataset.pa, PAY[pa.closest('[data-pp]').dataset.pp]);
    if (t.closest('[data-dsreset]')) { peek.preview = null; peek.pick = null; peek.confirming = false; return renderPeek(); }
    if (t.closest('[data-dsapply]')) { peek.confirming = true; return renderPeek(); }
    if (t.closest('[data-dscancel]')) { peek.confirming = false; return renderPeek(); }
    if (t.closest('[data-dsgo]')) {
      const targets = d.pays.filter(distEditable);
      const r = peek.preview;
      const pid = peek.pick || targets[0].partnerId || d.partner;
      Object.assign(peek, { preview: null, pick: null, confirming: false });
      mutate(targets, () => targets.forEach((p) => { p.pr = r; if (r > 0) p.partnerId = pid; }), `청구 ${targets.length}건의 분배를 우리 ${ourRatio(r)}% · 파트너 ${r}%로 바꿨습니다.`);
    }
  }
  // 막대를 끄는 동안에는 숫자만 바꾸고, 손을 떼면 다시 그린다 (다시 그리면 끌던 손잡이를 놓친다)
  function peekInput(e) {
    const d = dealById(peek.dealId);
    if (e.target.matches('[data-dspick]')) { peek.pick = e.target.value; return; }
    if (!e.target.matches('[data-ds]')) return;
    const editable = d.pays.filter(distEditable);
    const next = Number(e.target.value);
    const uniform = editable.every((p) => p.pr === editable[0].pr);
    peek.preview = uniform && next === editable[0].pr ? null : next;
    peek.confirming = false;
    const el = document.getElementById('cfPeek');
    const t = distTotals(editable);
    el.querySelector('#dsOr').textContent = `${ourRatio(next)}% · `;
    el.querySelector('#dsPr').textContent = `${next}% · `;
    el.querySelector('#dsOa').textContent = man(t.our);
    el.querySelector('#dsPa').textContent = man(t.partner);
  }

  // ── 화면 부품 ──
  const fsel = (id, k, v) => `<button class="fsel ${v ? 'on' : ''}" data-fs="${id}"><span class="k">${k}</span><span class="v">${esc(v || '전체')}</span>${v ? `<span class="clr" data-fclr="${id}" title="지우기">${icon('x')}</span>` : icon('chevDown')}</button>`;
  // options: [[값, 이름, 개수]]
  function fmenu(anchor, options, cur, set) {
    menu(anchor, [
      { label: '전체', on: !cur, run: () => set('') }, '-',
      ...options.map(([v, l, n]) => ({ label: l, hint: n == null ? '' : String(n), on: cur === v, run: () => set(v) })),
    ]);
  }
  const foldBtn = (open, label) => `<button class="fold ${open ? '' : 'shut'}" data-fold aria-expanded="${open}" aria-label="${esc(label)} ${open ? '접기' : '펼치기'}">${icon('chevDown')}</button>`;
  const mstep = (m) => `<span class="mstep"><button class="ib" data-mstep="-1" aria-label="이전 달">${icon('chevLeft')}</button><b>${m.year}년 ${m.month}월</b><button class="ib" data-mstep="1" aria-label="다음 달">${icon('chevRight')}</button></span>`;
  const kpi = (k, v, h, cls = '') => `<div class="kpi ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h || '&nbsp;'}</div></div>`;
  // 표 머리: 열 종류 아이콘·정렬 표시·너비 손잡이
  function paintHeads(root, sort) {
    root.querySelectorAll('th[data-h]').forEach((th) => {
      th.dataset.label = th.dataset.label || th.textContent.trim();
      const s = sort && sort.key === th.dataset.sort ? sort : null;
      th.classList.toggle('sorted', !!s);
      th.innerHTML = icon(th.dataset.h, 'hi') + th.dataset.label + (s ? icon('chevDown', 'caret') : '') + '<span class="rz"></span>';
      if (s && s.dir > 0) th.querySelector('.caret').style.transform = 'rotate(180deg)';
    });
  }
  // 표 머리를 누르면 열리는 정렬 메뉴. get/set으로 화면의 정렬 상태를 읽고 쓴다
  function sortMenu(th, get, set, fallback = null) {
    const key = th.dataset.sort;
    const s = get();
    const cur = s && s.key === key ? s.dir : 0;
    menu(th, [
      { label: '오름차순 정렬', icon: 'sort', on: cur === 1, run: () => set({ key, dir: 1 }) },
      { label: '내림차순 정렬', icon: 'sort', on: cur === -1, run: () => set({ key, dir: -1 }) },
      ...(cur && !(fallback && fallback.key === key && fallback.dir === cur) ? [{ label: fallback ? '기본 정렬로' : '정렬 해제', icon: 'x', run: () => set(fallback) }] : []),
    ]);
  }
  function csv(filename, rows) {
    const text = `﻿${rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${filename} 파일로 ${rows.length - 1}줄을 내보냈습니다`);
  }
  const fillIcons = () => document.querySelectorAll('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); el.removeAttribute('data-icon'); });

  window.CF = {
    NOW, TODAY, THIS, ME, WEEK, esc, man, pad2, toDate, dayKey, monthKey, stepMonth, daysFrom, rel, short, shortDay, full,
    TYPE, STAGE, PSTATUS, METHOD, ADJ_LABEL, ROLE, PAYTYPE, PART_ROLE, typeTag, stageTag, badge, sideLabel,
    PARTNERS, EMPLOYEES, DEALS, PAY, ADJ, EXPENSES, pendingAdj, pendingAdjOf, dealOf, dealById, loc, payer, payLabel, partnerOf,
    isClosed, isDone, isOpen, received, billable, countsAsBilled, remaining, effDue, isOverdue, disp, percent, rollup, worst, fullyCollected, taxPending, checkReceived, adjProblem,
    split, ourRatio, shares, shareTotals, partnerBalance, distEditable, settlement, monthlyExpense, expenseTotal,
    collectedIn, monthlyOwed, todayQueue, monthContracts, trendBars,
    mutate, changed, dialog, fld, opts, payAction, approveAdj, rejectAdj, decideDlg, dunning, openDeal, closeDeal, peek,
    fsel, fmenu, foldBtn, mstep, kpi, paintHeads, sortMenu, csv, fillIcons,
    set onChange(fn) { onChange = fn; },
  };
  if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape' && peek.dealId && !document.querySelector('.dlg-back, .menu')) closeDeal();
  });
})();
