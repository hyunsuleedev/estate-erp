import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Building2, CalendarDays, Check, ChevronDown, ChevronRight, CircleHelp, GitBranch, LayoutDashboard, ListTodo, Megaphone, Plus, RotateCcw, Search, Users, X } from 'lucide-react';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import { candidates, seed, type Customer } from './model';
import { Modal } from './shared';
import { Comparison } from './comparison';
import { Paths } from './paths';
import { Workbench } from './workbench';
import './styles.css';
import './picker.css';

const variants = [
  { name: '한눈에 비교', description: '단계별 위치를 나란히 비교하는 매칭 원장', component: Comparison },
  { name: '고객별 경로', description: '사람마다 전체 경로와 다음 행동을 함께 보는 흐름', component: Paths },
  { name: '단계별 처리', description: '한 고객의 현재 단계와 확인사항에 집중하는 작업 공간', component: Workbench },
];
function initialVariant() { const value = Number(new URLSearchParams(location.search).get('v')); return Number.isInteger(value) && value >= 1 && value <= 3 ? value - 1 : 0; }

export function Demo({ variant, standalone = false }: { variant: number; standalone?: boolean }) {
  const [customers, setCustomers] = useState(seed);
  const [selectedId, setSelectedId] = useState<string | null>(variant === 2 ? 'minjun' : null);
  const [inspectedStage, setInspectedStage] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const notify = (message: string) => { if (timer.current) clearTimeout(timer.current); setToast(message); timer.current = setTimeout(() => setToast(''), 3500); };
  const update = (id: string, patch: Partial<Customer>) => { setCustomers(old => old.map(c => c.id === id ? { ...c, ...patch } : c)); if (patch.closed === true) setShowClosed(true); };
  const select = (id: string, stage?: number) => { if (variant !== 2 && id === selectedId && stage === undefined) { setSelectedId(null); setInspectedStage(null); return; } setSelectedId(id); setInspectedStage(stage ?? customers.find(c => c.id === id)?.stage ?? null); };
  const visible = customers.filter(c => (showClosed || !c.closed) && `${c.name} ${c.budget} ${c.condition}`.includes(query));
  const active = customers.filter(c => !c.closed && c.stage < 5).length;
  const closed = customers.filter(c => c.closed).length;
  const converted = customers.filter(c => !c.closed && c.stage === 5).length;
  const Variant = variants[variant].component;
  function reset() { setCustomers(seed()); setSelectedId(variant === 2 ? 'minjun' : null); setInspectedStage(null); setQuery(''); setShowClosed(false); setExpanded(true); notify('예시 데이터를 처음 상태로 되돌렸습니다'); }
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><Building2 size={22} /><span>Estait Flow</span></div><div className="nav-section">시작</div><div className="nav-item"><LayoutDashboard size={17} />대시보드</div><div className="nav-section">매물·공간</div><div className="nav-item active"><Building2 size={17} />매물관리</div><div className="nav-item"><Megaphone size={17} />광고관리</div><div className="nav-section">고객·상담</div><div className="nav-item"><Users size={17} />고객 원장</div><div className="nav-item"><GitBranch size={17} />희망매물</div><div className="nav-section">업무·운영</div><div className="nav-item"><ListTodo size={17} />업무</div><div className="nav-item"><CalendarDays size={17} />캘린더</div><div className="office"><span className="office-avatar">고</span><div>고덕 부동산<small>매칭 디자인 데모</small></div></div></aside><main>
    <div className="demo-banner"><span><span className="demo-mark">DEMO {variant + 1}</span>{variants[variant].description}</span><div><span className="demo-note">예시 데이터 · 서버 저장 없음</span><button className="text-btn" onClick={() => setHelpOpen(true)}><CircleHelp size={14} />체험 안내</button></div></div>
    <header className="workspace-header"><div><span className="breadcrumb">매물·공간 <ChevronRight size={12} /></span><h1>매물관리</h1></div><button className="btn" onClick={reset}><RotateCcw size={14} />처음부터</button></header>
    <div className="property-table"><div className="property-heading"><span>거래</span><span>단지</span><span>동 / 호</span><span>면적 · 타입</span><span>매칭</span><span>광고</span><span>매물상태</span><span>가격</span></div><div className="property-row selected"><span><span className="tag pink">매매</span></span><strong>고덕그라시움</strong><span>102동 3401호</span><span>74평 · 243C</span><button className="match-count" aria-expanded={expanded} aria-label="연결 구매고객 펼치기 또는 접기" onClick={() => setExpanded(!expanded)}><GitBranch size={14} />{customers.length}{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button><span className="ad-count"><Megaphone size={14} />2</span><span><span className="tag green">활성</span></span><strong>31억 9,000만</strong></div>
    {expanded && <section className="matching-panel" aria-label="고덕그라시움 연결 구매고객"><header className="matching-header"><div className="matching-title"><GitBranch size={16} /><h2>연결 구매고객</h2><span className="counter">{customers.length}</span><span className="tag blue">진행 {active}</span>{converted > 0 && <span className="tag green">거래전환 {converted}</span>}</div><div className="matching-tools"><label className="search-field"><Search size={14} /><input aria-label="고객 검색" placeholder="고객 검색" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="검색 지우기" onClick={() => setQuery('')}><X size={12} /></button>}</label><button className={`text-btn closed-toggle ${showClosed ? 'on' : ''}`} aria-pressed={showClosed} onClick={() => setShowClosed(!showClosed)}>종료 {closed}명 {showClosed ? '접기' : '보기'}</button><button className="btn" onClick={() => setAddOpen(true)}><Plus size={14} />고객 연결</button></div></header>
      {visible.length ? <Variant customers={visible} selectedId={selectedId} inspectedStage={inspectedStage} select={select} update={update} notify={notify} /> : <div className="empty"><Search size={22} /><strong>조건에 맞는 고객이 없어요</strong><button className="text-btn" onClick={() => { setQuery(''); setShowClosed(true); }}>전체 고객 보기</button></div>}
    </section>}
    <div className="property-row neighbor"><span><span className="tag blue">전세</span></span><strong>고덕그라시움</strong><span>101동 3404호</span><span>47평 · 153A</span><span>—</span><span className="ad-count"><Megaphone size={14} />1</span><span><span className="tag neutral">거래중</span></span><strong>10억 8,000만</strong></div><div className="property-row neighbor"><span><span className="tag orange">월세</span></span><strong>고덕그라시움</strong><span>101동 3403호</span><span>47평 · 155B</span><span>—</span><span className="ad-count"><Megaphone size={14} />1</span><span><span className="tag green">활성</span></span><strong>5,000만 / 180만</strong></div></div><div className="workspace-foot"><span>의뢰 3건 · 매칭 {customers.length}명</span><span>같은 매물, 같은 고객으로 세 가지 방식을 비교해 보세요.</span></div>
    {addOpen && <Modal title="구매 고객 연결" onClose={() => setAddOpen(false)}><p className="muted">고덕그라시움 102동 3401호에 연결할 고객을 선택하세요.</p><div className="candidate-list">{candidates.filter(c => !customers.some(item => item.id === c.id)).map(c => <button key={c.id} onClick={() => { const item: Customer = { ...c, stage: 0, age: '방금', note: '', schedule: '', checked: [], closed: false, reason: '', history: ['방금 내부 후보 등록'] }; setCustomers(old => [...old, item]); setAddOpen(false); setQuery(''); select(c.id, 0); notify(`${c.name} 고객을 연결했습니다`); }}><span className="avatar">{c.initials}</span><div><strong>{c.name}</strong><p>{c.budget} · {c.condition}</p></div><Plus size={16} /></button>)}{candidates.every(c => customers.some(item => item.id === c.id)) && <p className="muted">준비된 예시 고객을 모두 연결했습니다.</p>}</div></Modal>}
    {helpOpen && <Modal title={standalone ? '고객별 경로 체험 안내' : '세 가지 매칭 흐름 비교'} onClose={() => setHelpOpen(false)}>{standalone ? <p>고객마다 진행 경로를 살펴보고, 현재 단계에서 필요한 작업을 펼쳐보세요.</p> : <p>아래 선택기 또는 숫자 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>으로 디자인을 바꿉니다. <kbd>←</kbd> <kbd>→</kbd>도 사용할 수 있어요.</p>}<ol className="help-list"><li>고객이나 단계를 눌러 확인사항을 열어보세요.</li><li>확인 항목을 체크하고 다음 단계로 진행해 보세요.</li><li>방문 일정·메모를 수정하거나 매칭을 종료·재개해 보세요.</li></ol><p className="muted">{standalone ? '변경 내용은 새로고침하면 초기화됩니다.' : '각 디자인은 전환할 때 같은 예시 데이터로 다시 시작합니다.'} 단계별 확인 항목은 동작을 비교하기 위한 제안이며 실제 서비스 규칙에 반영되지 않습니다.</p><footer><button className="btn primary" onClick={() => setHelpOpen(false)}>체험하기</button></footer></Modal>}
    {toast && <div role="status" className="toast"><Check size={16} />{toast}</div>}
  </main></div>;
}

export default function App() {
  const [current, setCurrent] = useState(initialVariant);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const highlight = useRef<HTMLSpanElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const moveHighlight = useCallback(() => { const el = buttons.current[current]; if (!el || !highlight.current) return; highlight.current.style.width = `${el.offsetWidth}px`; highlight.current.style.transform = `translateX(${el.offsetLeft}px)`; }, [current]);
  const setActive = useCallback((i: number) => { if (i < 0 || i >= variants.length) return; setCurrent(i); setRevision(n => n + 1); const url = new URL(location.href); url.searchParams.set('v', String(i + 1)); history.replaceState(null, '', url); }, []);
  useLayoutEffect(moveHighlight, [moveHighlight]);
  useEffect(() => { window.addEventListener('resize', moveHighlight); return () => window.removeEventListener('resize', moveHighlight); }, [moveHighlight]);
  useEffect(() => { let second = 0; const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setReady(true)); }); return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); }; }, []);
  useEffect(() => { const url = new URL(location.href); url.searchParams.set('v', String(current + 1)); history.replaceState(null, '', url); }, []);
  useEffect(() => { function onKey(e: KeyboardEvent) { const target = e.target as HTMLElement; if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return; const n = parseInt(e.key, 10); if (n >= 1 && n <= variants.length) setActive(n - 1); else if (e.key === 'ArrowRight') { e.preventDefault(); setActive((current + 1) % variants.length); } else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((current - 1 + variants.length) % variants.length); } else if (e.key.toLowerCase() === 'r') setRevision(n => n + 1); } document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [current, setActive]);
  return <><Demo key={`${current}-${revision}`} variant={current} /><nav className="proto-picker" aria-label="Prototype variants" data-ready={ready ? '' : undefined}><span ref={highlight} className="proto-picker-highlight" aria-hidden="true" />{variants.map((item, index) => <button key={item.name} ref={el => { buttons.current[index] = el; }} className="proto-picker-item" data-active={current === index ? '' : undefined} aria-current={current === index ? 'true' : undefined} onClick={() => setActive(index)}>{item.name}</button>)}</nav></>;
}
