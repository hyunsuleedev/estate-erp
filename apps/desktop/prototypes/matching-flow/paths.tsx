import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { stages, type VariantProps } from './model';
import { Hint, Person, StageEditor } from './shared';

export function Paths(props: VariantProps) {
  const { customers, selectedId, select } = props;
  return <div className="paths">{customers.map(c => <article key={c.id} className={`path-row ${selectedId === c.id ? 'selected' : ''} ${c.closed ? 'is-closed' : ''}`}><div className="path-top"><Person customer={c} /><button className="text-btn current-action" onClick={() => select(c.id)}><Hint customer={c} /><span className="age">{c.age}</span>{selectedId === c.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button></div><div className="path-strip" aria-label={`${c.name} 진행 경로`}>{stages.map((label, i) => <button key={label} className={`path-step ${i < c.stage ? 'done' : i === c.stage ? c.closed ? 'stopped' : 'current' : 'future'}`} aria-current={i === c.stage ? 'step' : undefined} aria-label={`${c.name} ${label}`} onClick={() => select(c.id, i)}><span className="path-step-icon">{i < c.stage ? <Check size={13} /> : i === c.stage && c.closed ? <X size={13} /> : i + 1}</span>{label}</button>)}</div>{selectedId === c.id && <StageEditor key={c.id} {...props} customer={c} />}</article>)}</div>;
}
