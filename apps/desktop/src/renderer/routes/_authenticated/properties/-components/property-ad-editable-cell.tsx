import { useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ListingAdvertisement } from '@estate-erp/api-client';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { naverCpChannels } from '@/lib/advertisement-channels';
import { EditableCell } from '@/components/data-table';
import { CellTableNavigationProvider } from '@/components/data-table/cell-navigation';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buildAdvertisementCellPatch, canChangeAdChannel, type AdEditableField } from './property-ad-cell-state';

const cellClass = 'min-h-9 rounded-none px-2.5 text-[14px] font-[450] leading-[21px] focus-visible:ring-inset focus-visible:ring-offset-0';
const statusOptions = [
  { value: 'active', label: '광고중', className: 'rounded-full! bg-[#eef3ed] text-[#44745a]', dotClassName: 'bg-current opacity-70' },
  { value: 'ended', label: '종료', className: 'rounded-full! bg-[#f1f1ef] text-[#787774]', dotClassName: 'bg-current opacity-70' },
];
const channelOptions = naverCpChannels.map(channel => ({ ...channel, className: 'bg-transparent text-foreground' }));

export function PropertyAdEditableCell({ advertisement, field, label, disabled = false, children }: {
  advertisement: ListingAdvertisement; field: AdEditableField; label: string; disabled?: boolean; children: ReactNode;
}) {
  const queryClient = useQueryClient();
  async function save(value: unknown) {
    const patch = buildAdvertisementCellPatch(advertisement, field, value);
    if (!Object.keys(patch).length) return;
    await api.listingAdvertisements.update(advertisement.id, patch);
    await Promise.all(['listing-intakes', 'listings', 'listing-advertisements', 'properties'].map(key =>
      queryClient.invalidateQueries({ queryKey: [key] })));
  }
  const urlLink = field === 'url' && advertisement.url && /^https?:\/\//i.test(advertisement.url) ? (
    <a
      href={advertisement.url} target="_blank" rel="noreferrer" aria-label={`${label} 열기`}
      onClick={event => event.stopPropagation()}
      className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ExternalLink className="size-3.5" />
    </a>
  ) : null;
  if (disabled) {
    return <div className="relative h-full">
      <span className={`flex h-full items-center ${cellClass}${urlLink ? ' pr-8' : ''}`}>{children}</span>
      {urlLink}
    </div>;
  }
  const money = field.startsWith('advertised');
  if (field === 'channel' && !canChangeAdChannel(advertisement)) {
    return <span className={`flex h-full items-center ${cellClass}`} title="외부 광고와 연결된 채널은 변경할 수 없습니다.">{children}</span>;
  }
  return <CellTableNavigationProvider value={null}>
    {field === 'startedAt' ? <AdDateCell recordId={advertisement.id} value={advertisement.startedAt} label={label} onSave={save}>{children}</AdDateCell> :
      <div className="relative h-full">
        <EditableCell recordId={advertisement.id} field={field} value={advertisement[field]}
          onSave={async (_recordId, _field, value) => {
            try { buildAdvertisementCellPatch(advertisement, field, value); }
            catch (error) { toast.error(error instanceof Error ? error.message : '입력값을 확인해 주세요.'); return false; }
            await save(value);
          }}
          editType={field === 'status' || field === 'channel' ? 'select-chip' : money ? 'number' : 'text'}
          chipOptions={field === 'status' ? statusOptions : field === 'channel' ? channelOptions : undefined}
          numberMinimum={money ? 0 : undefined} numberUnit={money ? '만원' : undefined}
          multiline={field === 'memo'} commitOnBlur activation="click" portalAnchor="self" editorChrome="floating"
          portalContainer="body"
          hoverHighlight={false} ariaLabel={label}
          className={`${cellClass}${field === 'url' && advertisement.url ? ' pr-8' : ''}`}>
          {children}
        </EditableCell>
        {urlLink}
      </div>}
  </CellTableNavigationProvider>;
}

function AdDateCell({ recordId, value, label, onSave, children }: {
  recordId: string; value: string | null; label: string; onSave: (value: string) => Promise<void>; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value?.slice(0, 10) ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [month, setMonth] = useState<Date>();
  async function commit(next: string) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try { await onSave(next); setOpen(false); }
    catch (err) { setError(err instanceof Error ? err.message : '저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const selected = draft ? new Date(`${draft}T12:00:00`) : undefined;
  return <Popover open={open} onOpenChange={next => {
    if (savingRef.current) return;
    if (next) { setDraft(value?.slice(0, 10) ?? ''); setMonth(value ? new Date(value) : new Date()); setError(''); }
    setOpen(next);
  }}>
    <PopoverTrigger asChild><button type="button" aria-label={label} onClick={event => event.stopPropagation()}
      data-editable-cell-trigger data-cell-record-id={recordId} data-cell-field="startedAt"
      className={`flex h-full w-full items-center text-left ${cellClass}`}>{children}</button></PopoverTrigger>
    <PopoverContent align="start" className="w-[280px] p-0" aria-label={label} aria-busy={saving}
      onInteractOutside={event => { if (savingRef.current) event.preventDefault(); }}
      onEscapeKeyDown={event => { if (savingRef.current) event.preventDefault(); }}>
      <form className="border-b p-2" onSubmit={event => { event.preventDefault(); void commit(draft); }}>
        <Input type="date" aria-label={`${label} 입력`} value={draft} disabled={saving}
          onChange={event => { setDraft(event.target.value); setError(''); }} />
      </form>
      <Calendar mode="single" selected={selected && Number.isFinite(selected.getTime()) ? selected : undefined}
        month={month} onMonthChange={setMonth} disabled={saving} required
        onSelect={date => {
          if (!date) return;
          const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          setDraft(next); void commit(next);
        }} />
      {error && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between border-t px-2 py-1">
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setDraft(''); void commit(''); }}>날짜 지우기</Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => void commit(draft)}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : '적용'}</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
