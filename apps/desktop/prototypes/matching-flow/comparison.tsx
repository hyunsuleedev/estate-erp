import { ArrowUpRight } from 'lucide-react';
import { stages, type VariantProps } from './model';
import { Person, StageDot, StageEditor, Hint } from './shared';

export function Comparison(props: VariantProps) {
  const { customers, selectedId, select } = props;
  const selected = customers.find(c => c.id === selectedId);
  return <div className="comparison"><div className="matrix-scroll"><div className="matrix"><div className="matrix-heading"><span>구매 고객</span>{stages.map(s => <span key={s}>{s}</span>)}<span>다음 할 일</span></div>{customers.map(c => <div className={`matrix-row ${selectedId === c.id ? 'selected' : ''} ${c.closed ? 'is-closed' : ''}`} key={c.id}><button className="person-select" onClick={() => select(c.id)}><Person customer={c} compact /></button>{stages.map((_, i) => <div className={`matrix-cell ${i < c.stage ? 'completed-line' : ''}`} key={i}><StageDot c={c} index={i} onClick={() => select(c.id, i)} /></div>)}<button className="row-action" onClick={() => select(c.id)}><Hint customer={c} /><ArrowUpRight size={14} /></button></div>)}</div></div>{selected ? <div className="matrix-detail"><StageEditor key={selected.id} {...props} customer={selected} /></div> : <div className="matrix-legend"><span><i className="legend-dot done" />완료</span><span><i className="legend-dot current" />현재</span><span><i className="legend-dot" />예정</span><span className="legend-help">고객이나 단계 점을 누르면 확인사항을 펼칩니다.</span></div>}</div>;
}
