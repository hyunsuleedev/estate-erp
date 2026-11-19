import { formatUnitName } from '@estate-erp/shared';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateListingAdvertisementDto, CreateTaskDto } from '@estate-erp/api-client';
import { ClipboardPlus, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { isNaverCpChannel, naverCpChannels } from '@/lib/advertisement-channels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PropertyListingGroup } from './property-listings-table';
import { getAdChannelLabel } from './property-ad-table-state';
import {
  adRequestLabels, adTradeLabels, buildAdRequestTask, buildManualAdPayload,
  initialAdTerms, initialManualAdDraft, todayInput,
  type AdListing, type AdRequestAction, type AdRequestTarget, type AdTerms, type ManualAdDraft,
} from './property-ad-actions-state';

type Editor = { kind: 'manual'; listing: AdListing; draft: ManualAdDraft }
  | { kind: 'request'; targets: AdRequestTarget[]; action: AdRequestAction; title: string; notes: string };
type Submission = { kind: 'request'; payload: CreateTaskDto }
  | { kind: 'create'; payload: CreateListingAdvertisementDto };
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const actionClass = 'h-[26px] gap-1 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground';

export function PropertyAdActions({ group, selectedIds, onClearSelection }: {
  group: PropertyListingGroup; selectedIds: ReadonlySet<string>; onClearSelection: () => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const opener = useRef<HTMLButtonElement | null>(null);
  const submitting = useRef(false);
  const queryClient = useQueryClient();
  const id = useId();
  const selected = group.listings.flatMap(listing => (listing.activeAdvertisements ?? [])
    .filter(ad => selectedIds.has(ad.id)).map(advertisement => ({ listing, advertisement })));
  const dong = group.property?.unit?.dong;
  const unit = formatUnitName(group.property?.unit);
  const location = [group.property?.site?.name, dong && !dong.isPlaceholder ? `${dong.name.replace(/동$/, '')}동` : null,
    unit ? `${unit.replace(/호$/, '')}호` : null].filter(Boolean).join(' ') || '매물';
  const mutation = useMutation({
    mutationFn: async (submission: Submission) => {
      if (submission.kind === 'request') await api.tasks.create(submission.payload);
      else await api.listingAdvertisements.create(submission.payload);
      return submission.kind;
    },
    onSuccess: async kind => {
      await Promise.all((kind === 'request' ? ['tasks'] : ['listing-intakes', 'listings', 'listing-advertisements', 'properties'])
        .map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      setIsOpen(false);
      onClearSelection();
      toast.success(kind === 'request' ? '광고 요청 업무를 생성했습니다.' : '광고 정보를 추가했습니다.');
    },
    onError: err => setError(err instanceof Error ? err.message : '저장하지 못했습니다. 다시 시도해 주세요.'),
    onSettled: () => { submitting.current = false; },
  });
  function open(next: Editor, button: HTMLButtonElement) {
    opener.current = button;
    setError('');
    setEditor(next);
    setIsOpen(true);
  }
  function newTarget(listing: AdListing): AdRequestTarget {
    return { listing, channel: initialManualAdDraft(listing).channel, terms: initialAdTerms(listing) };
  }
  function submit() {
    if (!editor || submitting.current) return;
    setError('');
    try {
      let submission: Submission;
      if (editor.kind === 'request') submission = { kind: 'request', payload: buildAdRequestTask({
        ...editor, location, propertyId: group.propertyId, intakeId: group.intakeId,
      }) };
      else {
        const payload = buildManualAdPayload(editor.listing, editor.draft);
        submission = { kind: 'create', payload: payload as CreateListingAdvertisementDto };
      }
      submitting.current = true;
      mutation.mutate(submission);
    } catch (err) { setError(err instanceof Error ? err.message : '입력한 내용을 확인해 주세요.'); }
  }
  const title = editor?.kind === 'request' ? '광고 요청 업무 생성' : '광고 수동 추가';
  const patchManual = (patch: Partial<ManualAdDraft>) => setEditor(current => current?.kind === 'manual'
    ? { ...current, draft: { ...current.draft, ...patch } } : current);
  const patchRequest = (patch: Partial<Extract<Editor, { kind: 'request' }>>) => setEditor(current => current?.kind === 'request' ? { ...current, ...patch } : current);

  return <>
    <div className="flex shrink-0 items-center gap-0.5" aria-label="광고 작업">
      <Button variant="ghost" className={actionClass} disabled={!group.listings.length} onClick={event => {
        const targets = selected.length ? selected.map(({ listing, advertisement }) => ({ listing, advertisement, channel: advertisement.channel, terms: initialAdTerms(listing, advertisement) })) : [newTarget(group.listings[0])];
        const action = selected.length ? 'update' : 'create';
        open({ kind: 'request', targets, action, title: `${location} ${adRequestLabels[action]}`, notes: '' }, event.currentTarget);
      }}><ClipboardPlus className="size-3.5" />광고 요청</Button>
      <Button variant="ghost" className={actionClass} disabled={!group.listings.length} onClick={event => {
        const listing = selected.length === 1 ? selected[0].listing : group.listings[0];
        open({ kind: 'manual', listing, draft: initialManualAdDraft(listing) }, event.currentTarget);
      }}><Plus className="size-3.5" />수동 추가</Button>
    </div>
    <Dialog open={isOpen} onOpenChange={open => { if (!open && !submitting.current) setIsOpen(false); }}>
      <DialogContent className="max-h-[85svh] gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={!mutation.isPending}
        onInteractOutside={event => event.preventDefault()}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const button = opener.current;
          if (button?.disabled) button.parentElement?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
          else button?.focus();
        }}>
        <DialogHeader className="px-6 pb-4 pt-6">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {editor?.kind === 'request' ? '요청 내용을 업무에 등록합니다. 실제 광고 반영은 업무를 실행할 때 진행됩니다.'
              : '앱에 광고 정보를 기록합니다. 광고 채널의 실제 게재 내용은 변경되지 않습니다.'}
          </DialogDescription>
          <p className="text-[13px] font-medium">{location}</p>
        </DialogHeader>
        <form className="flex min-h-0 flex-col overflow-hidden" onSubmit={event => { event.preventDefault(); submit(); }}>
          <fieldset disabled={mutation.isPending} className="min-h-0 space-y-4 overflow-y-auto px-6 pb-5 disabled:opacity-60">
            {editor?.kind === 'manual' && <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="거래" id={`${id}-listing`}><select id={`${id}-listing`} className={selectClass} value={editor.listing.id} disabled={group.listings.length < 2}
                  onChange={event => { const listing = group.listings.find(item => item.id === event.target.value)!; setError(''); setEditor({ ...editor, listing, draft: { ...editor.draft, ...initialAdTerms(listing), channel: initialManualAdDraft(listing).channel } }); }}>
                  {group.listings.map(listing => <option key={listing.id} value={listing.id}>{adTradeLabels[listing.transactionType] ?? listing.transactionType}</option>)}
                </select></Field>
                <Field label="광고 채널" id={`${id}-channel`}><ChannelSelect id={`${id}-channel`} value={editor.draft.channel} onChange={channel => patchManual({ channel })} /></Field>
              </div>
              <MoneyFields id={id} trade={editor.listing.transactionType} value={editor.draft} onChange={patchManual} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="상태" id={`${id}-status`}><select id={`${id}-status`} className={selectClass} value={editor.draft.status} onChange={event => {
                  const status = event.target.value as 'active' | 'ended'; patchManual({ status, endedAt: status === 'ended' ? editor.draft.endedAt || todayInput() : '' });
                }}><option value="active">광고 중</option><option value="ended">종료</option></select></Field>
                <Field label="등록일" id={`${id}-start`}><Input id={`${id}-start`} type="date" value={editor.draft.startedAt} onChange={event => patchManual({ startedAt: event.target.value })} /></Field>
                {editor.draft.status === 'ended' && <Field label="종료일" id={`${id}-end`}><Input id={`${id}-end`} type="date" required value={editor.draft.endedAt} onChange={event => patchManual({ endedAt: event.target.value })} /></Field>}
              </div>
              <Field label="원문 주소" id={`${id}-url`}><Input id={`${id}-url`} type="url" placeholder="https://" value={editor.draft.url} onChange={event => patchManual({ url: event.target.value })} /></Field>
              <Field label="메모" id={`${id}-memo`}><Textarea id={`${id}-memo`} className="min-h-20 resize-y" value={editor.draft.memo} onChange={event => patchManual({ memo: event.target.value })} /></Field>
            </>}
            {editor?.kind === 'request' && <>
              <Field label="업무 제목" id={`${id}-title`}><Input id={`${id}-title`} required value={editor.title} onChange={event => patchRequest({ title: event.target.value })} /></Field>
              <Field label="요청 작업" id={`${id}-action`}><select id={`${id}-action`} className={selectClass} value={editor.action} onChange={event => {
                const action = event.target.value as AdRequestAction;
                patchRequest({ action, title: editor.title === `${location} ${adRequestLabels[editor.action]}` ? `${location} ${adRequestLabels[action]}` : editor.title });
              }}>{(editor.targets[0]?.advertisement ? ['update', 'republish', 'end'] as const : ['create'] as const).map(action => <option key={action} value={action}>{adRequestLabels[action]}</option>)}</select></Field>
              <div className="space-y-3">
                {editor.targets.map((target, index) => <div key={target.advertisement?.id ?? 'new'} className="space-y-3 rounded-md border p-3">
                  {target.advertisement ? <p className="text-[13px] font-medium">{getAdChannelLabel(target.channel)} · {adTradeLabels[target.listing.transactionType]}<span className="ml-2 font-normal text-muted-foreground">{target.advertisement.externalAdId}</span></p>
                    : <div className="grid grid-cols-2 gap-3">
                      <Field label="거래" id={`${id}-request-listing`}><select id={`${id}-request-listing`} className={selectClass} value={target.listing.id} onChange={event => patchRequest({ targets: [newTarget(group.listings.find(listing => listing.id === event.target.value)!)] })}>
                        {group.listings.map(listing => <option key={listing.id} value={listing.id}>{adTradeLabels[listing.transactionType]}</option>)}
                      </select></Field>
                      <Field label="광고 채널" id={`${id}-request-channel`}><ChannelSelect id={`${id}-request-channel`} value={target.channel} onChange={channel => patchRequest({ targets: [{ ...target, channel }] })} /></Field>
                    </div>}
                  {editor.action !== 'end' && <MoneyFields id={`${id}-target-${index}`} trade={target.listing.transactionType} value={target.terms}
                    onChange={patch => patchRequest({ targets: editor.targets.map((current, i) => i === index ? { ...current, terms: { ...current.terms, ...patch } } : current) })} />}
                </div>)}
              </div>
              <Field label="요청사항" id={`${id}-notes`}><Textarea id={`${id}-notes`} className="min-h-20 resize-y" placeholder="추가로 전달할 내용을 입력하세요" value={editor.notes} onChange={event => patchRequest({ notes: event.target.value })} /></Field>
            </>}
          </fieldset>
          {error && <p role="alert" className="px-6 pb-3 text-[13px] text-destructive">{error}</p>}
          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => setIsOpen(false)}>취소</Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {mutation.isPending ? '저장 중…' : editor?.kind === 'request' ? `요청 업무 생성${editor.targets.length > 1 ? ` · ${editor.targets.length}건` : ''}` : '광고 추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-1.5"><label htmlFor={id} className="block text-xs text-muted-foreground">{label}</label>{children}</div>;
}
function ChannelSelect({ id, value, disabled, onChange }: { id: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <select id={id} className={selectClass} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
    {!isNaverCpChannel(value) && <option value={value} disabled>{getAdChannelLabel(value)}</option>}
    {naverCpChannels.map(channel => <option key={channel.value} value={channel.value}>{channel.label}</option>)}
  </select>;
}
function MoneyFields({ id, trade, value, onChange }: { id: string; trade: string; value: AdTerms; onChange: (patch: Partial<AdTerms>) => void }) {
  const fields: { key: keyof AdTerms; label: string }[] = trade === 'monthly'
    ? [{ key: 'advertisedDeposit', label: '보증금' }, { key: 'advertisedMonthlyRent', label: '월세' }]
    : [{ key: trade === 'sale' ? 'advertisedPrice' : 'advertisedDeposit', label: trade === 'sale' ? '매매가' : '전세가' }];
  return <div className={`grid gap-3 ${fields.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
    {fields.map(({ key, label }) => <Field key={key} id={`${id}-${key}`} label={`${label} · 만원`}>
      <Input id={`${id}-${key}`} type="text" inputMode="numeric" placeholder="미입력" value={value[key]} onChange={event => onChange({ [key]: event.target.value })} />
    </Field>)}
  </div>;
}
