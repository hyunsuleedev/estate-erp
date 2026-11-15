import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCheck, ChevronDown, ChevronUp, Clock3, History, MessageSquare, RotateCcw, X } from 'lucide-react';
import { actionHint, checks, nextActions, scheduleLabel, stages, stageTitles, type Customer, type VariantProps } from './model';

export function Person({ customer: c, compact = false }: { customer: Customer; compact?: boolean }) {
  return <div className={`person ${compact ? 'compact' : ''}`}><span className="avatar">{c.initials}</span><div><div className="person-name">{c.name}{c.urgent && <span className="tag warm">급함</span>}{c.closed && <span className="tag neutral">종료</span>}</div><div className="person-meta">{c.budget}{!compact && <span> · {c.condition}</span>}</div></div></div>;
}
export function StageDot({ c, index, onClick }: { c: Customer; index: number; onClick: () => void }) {
  const state = index < c.stage ? 'done' : index === c.stage ? c.closed ? 'stopped' : 'current' : 'future';
  return <button className={`stage-dot ${state}`} aria-label={`${c.name} ${stages[index]} ${state === 'done' ? '완료' : state === 'current' ? '현재 단계' : state === 'stopped' ? '종료 시점' : '예정'}`} aria-current={index === c.stage ? 'step' : undefined} onClick={onClick}><span>{state === 'done' ? <Check size={13} /> : state === 'stopped' ? <X size={12} /> : state === 'current' ? <span className="dot-core" /> : null}</span></button>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; el?.showModal(); return () => { el?.close(); }; }, []);
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}><div className="modal-body"><header><h2>{title}</h2><button className="icon-btn" aria-label="닫기" onClick={onClose}><X size={18} /></button></header>{children}</div></dialog>;
}

function VisitSchedule({ customer: c, update }: { customer: Customer; update: VariantProps['update'] }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.value = c.schedule; }, [c.id, c.schedule]);
  // Keep the native control's partial date/time edits intact until a complete value exists.
  const saveComplete = (value: string) => { if (value) update(c.id, { schedule: value }); };
  return <div className="schedule-field"><label htmlFor={`visit-${c.id}`} className="field-title"><CalendarDays size={14} />방문 일정 <small>선택</small></label><div className="schedule-input-row"><input ref={input} id={`visit-${c.id}`} type="datetime-local" aria-label={`${c.name} 방문 일정`} defaultValue={c.schedule} onInput={e => saveComplete(e.currentTarget.value)} onChange={e => saveComplete(e.target.value)} />{c.schedule && <button className="icon-btn" aria-label="방문 일정 지우기" onClick={() => update(c.id, { schedule: '' })}><X size={13} /></button>}</div>{!c.schedule && <div className="quick-schedules"><span>빠른 선택</span><button className="text-btn" onClick={() => update(c.id, { schedule: '2026-11-14T14:00' })}>11. 14. 14:00</button><button className="text-btn" onClick={() => update(c.id, { schedule: '2026-11-16T18:30' })}>11. 16. 18:30</button></div>}<span className="field-hint">{c.schedule ? scheduleLabel(c.schedule) : '가능 여부를 먼저 확인하고, 일정은 나중에 정해도 됩니다.'}</span></div>;
}

export function StageEditor({ customer: c, inspectedStage, select, update, notify, spacious = false }: VariantProps & { customer: Customer; spacious?: boolean }) {
  const stage = inspectedStage ?? c.stage;
  const preview = stage !== c.stage;
  const [memo, setMemo] = useState(c.note);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('고객 관심 없음');
  const [dealOpen, setDealOpen] = useState(false);
  useEffect(() => { setMemo(c.note); setHistoryOpen(false); }, [c.id, c.note]);
  const required = checks[c.stage];
  const ready = required.every((item) => c.checked.includes(item));
  function advance() {
    if (!ready || c.closed || c.stage >= 5 || preview) return;
    update(c.id, { stage: c.stage + 1, checked: [], age: '방금', history: [`방금 ${stages[c.stage]} 완료 → ${stages[c.stage + 1]}`, ...c.history] });
    select(c.id, c.stage + 1);
    notify(`${c.name} · ${stages[c.stage + 1]} 단계로 이동했습니다`);
  }
  return <section className={`stage-editor ${spacious ? 'spacious' : ''}`} aria-label={`${c.name} 단계 상세`}>
    <div className="editor-heading"><div><div className="eyebrow">{c.name} <span>/</span> {preview ? '단계 살펴보기' : c.closed ? '종료된 매칭' : `현재 ${c.stage + 1} / 6단계`}</div><h3>{preview ? stages[stage] : c.closed ? `${stages[c.stage]} 단계에서 종료했어요` : stageTitles[c.stage]}</h3></div><span className="age"><Clock3 size={13} />{c.age}</span></div>
    {preview ? <div className="preview-stage"><p>{stage < c.stage ? '이미 지난 단계입니다. 현재 단계의 업무는 아래 버튼으로 돌아가서 처리할 수 있어요.' : '앞선 단계를 마치면 이 단계로 진행할 수 있어요.'}</p><ul>{checks[stage].map(item => <li key={item}>{item}</li>)}</ul><button className="btn" onClick={() => select(c.id, c.stage)}>현재 단계로 돌아가기 <ArrowRight size={14} /></button></div>
      : c.closed ? <div className="closed-detail"><p><span className="tag neutral">종료 사유</span> {c.reason}</p><p className="muted">{c.note}</p><button className="btn" onClick={() => { update(c.id, { closed: false, reason: '', age: '방금', history: [`방금 ${stages[c.stage]} 단계에서 재개`, ...c.history] }); notify(`${c.name} 매칭을 재개했습니다`); }}><RotateCcw size={14} />이 단계에서 재개</button></div>
      : c.stage === 5 ? <div className="converted"><CheckCheck size={25} /><div><strong>{c.name} 고객의 매칭을 거래로 전환했어요</strong><p>이후의 계약 준비·계약·잔금은 거래 진행으로 이어집니다.</p></div><button className="btn" onClick={() => setDealOpen(true)}>거래 준비 보기 <ArrowRight size={14} /></button></div>
      : <><div className="editor-columns"><div className="checklist"><label className="field-title">이번 단계에서 확인할 것</label>{required.map(item => <label className="check-item" key={item}><input type="checkbox" checked={c.checked.includes(item)} onChange={e => update(c.id, { checked: e.target.checked ? [...c.checked, item] : c.checked.filter(x => x !== item) })} /><span>{item}</span></label>)}{(c.stage === 2 || c.stage === 3) && <VisitSchedule customer={c} update={update} />}</div><div className="memo-field"><label className="field-title" htmlFor={`memo-${c.id}`}><MessageSquare size={14} />매칭 메모</label><textarea id={`memo-${c.id}`} value={memo} onChange={e => setMemo(e.target.value)} rows={spacious ? 4 : 2} /><button className="text-btn" disabled={memo === c.note} onClick={() => { update(c.id, { note: memo }); notify('매칭 메모를 저장했습니다'); }}>메모 저장</button></div></div><footer className="editor-footer"><button className="text-btn subtle" onClick={() => setClosing(true)}>매칭 종료</button><div className="next-area">{!ready && <span className="field-hint">확인 항목을 체크해 주세요</span>}<button className="btn primary" disabled={!ready} onClick={advance}>{nextActions[c.stage]}<ArrowRight size={14} /></button></div></footer></>}
    <div className="history-section"><button className="text-btn subtle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}><History size={13} />진행 이력 {historyOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>{historyOpen && <ol>{c.history.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ol>}</div>
    {closing && <Modal title={`${c.name} 매칭 종료`} onClose={() => setClosing(false)}><p className="muted">현재 단계와 메모를 남겨두고 매칭을 종료합니다.</p><label className="form-field">종료 사유<select value={reason} onChange={e => setReason(e.target.value)}><option>고객 관심 없음</option><option>다른 매물 선택</option><option>방문 불가</option><option>조건 협의 불발</option><option>고객 요청으로 종료</option></select></label><footer><button className="btn" onClick={() => setClosing(false)}>취소</button><button className="btn danger" onClick={() => { update(c.id, { closed: true, reason, age: '방금', history: [`방금 매칭 종료 · ${reason}`, ...c.history] }); setClosing(false); notify(`${c.name} 매칭을 종료했습니다`); }}>매칭 종료</button></footer></Modal>}
    {dealOpen && <Modal title="거래 준비" onClose={() => setDealOpen(false)}><p className="muted">고덕그라시움 102동 3401호 · {c.name}</p><div className="deal-preview"><span className="tag blue">계약 준비</span><h3>합의한 조건을 계약서로 정리하세요</h3><p>매매 호가 31억 9,000만 · 실제 계약금액 확인 필요</p><p>참여 고객 · {c.name}</p><p>다음 업무 · 계약 일정과 계약금 확인</p></div><p className="field-hint">데모 안에서 전환한 예시입니다. 실제 거래는 생성되지 않습니다.</p><footer><button className="btn primary" onClick={() => setDealOpen(false)}>확인</button></footer></Modal>}
  </section>;
}
export function Hint({ customer }: { customer: Customer }) {
  return <span className={`action-hint ${customer.stage === 2 && !customer.closed ? 'waiting' : ''}`}>{actionHint(customer)}</span>;
}
