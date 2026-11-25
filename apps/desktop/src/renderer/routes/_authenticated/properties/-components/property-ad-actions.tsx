import { formatUnitName } from '@estate-erp/shared';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateAdvertisementChangeRequestsBatchDto, CreateListingAdvertisementDto } from '@estate-erp/api-client';
import { ClipboardPlus, Loader2, Pencil, Plus, Send } from 'lucide-react';
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
  adRequestLabels, adTradeLabels, buildAdChangeRequestsBatch, buildManualAdPayload,
  initialAdTerms, initialManualAdDraft, todayInput,
  type AdListing, type AdRequestAction, type AdRequestTarget, type AdTerms, type ManualAdDraft,
} from './property-ad-actions-state';
import {
  buildInlineAdChangeRequestsBatch,
  countPropertyAdDrafts,
  isPropertyAdDraftEmpty,
  summarizePropertyAdDraft,
  summarizePublishDraft,
  type PropertyAdPanelMode,
  type PropertyAdPublishDraft,
  type PropertyAdRequestDrafts,
} from './property-ad-request-drafts';

const AGENT_ASSIGNEE = '__agent__';

type Editor = { kind: 'manual'; listing: AdListing; draft: ManualAdDraft }
  | {
    kind: 'request';
    targets: AdRequestTarget[];
    action: AdRequestAction;
    title: string;
    assignedToId: string;
    dueDate: string;
    notes: string;
  }
  | {
    kind: 'request-confirm';
    title: string;
    assignedToId: string;
    dueDate: string;
    notes: string;
  };
type Submission = { kind: 'request'; payload: CreateAdvertisementChangeRequestsBatchDto }
  | { kind: 'create'; payload: CreateListingAdvertisementDto };
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const actionClass = 'h-[26px] gap-1 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground';

/** 광고 작업에 필요한 만큼의 매물 묶음. 매물관리 표의 한 줄(PropertyListingGroup)과 매물 상세가 함께 쓴다. */
export type AdActionsGroup = Pick<PropertyListingGroup, 'propertyId' | 'intakeId' | 'property'> & {
  listings: AdListing[];
};

export function PropertyAdActions({
  group,
  selectedIds,
  onClearSelection,
  location: locationLabel,
  mode,
  isEditMode,
  onToggleEditMode,
  onToggleRequestMode,
  onCancelRequestMode,
  requestDrafts,
  publishDrafts,
  onRequestSubmitted,
  manualOpen,
  onManualOpenChange,
}: {
  group: AdActionsGroup;
  selectedIds: ReadonlySet<string>;
  onClearSelection: () => void;
  /** 창 머리에 보일 호실 이름. 없으면 묶음의 단지·동·호로 만든다 */
  location?: string;
  mode?: PropertyAdPanelMode;
  isEditMode?: boolean;
  onToggleEditMode?: () => void;
  onToggleRequestMode?: () => void;
  onCancelRequestMode?: () => void;
  requestDrafts?: PropertyAdRequestDrafts;
  publishDrafts?: readonly PropertyAdPublishDraft[];
  onRequestSubmitted?: () => void;
  manualOpen?: boolean;
  onManualOpenChange?: (open: boolean) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState('');
  const opener = useRef<HTMLButtonElement | null>(null);
  const submitting = useRef(false);
  const queryClient = useQueryClient();
  const id = useId();
  const controlledManualOpen = Boolean(manualOpen);
  const isOpen = internalOpen || controlledManualOpen;
  const activeEditor: Editor | null = internalOpen
    ? editor
    : controlledManualOpen && group.listings.length > 0
      ? {
          kind: 'manual',
          listing: selectedIds.size === 1
            ? (group.listings.find(l => l.activeAdvertisements?.some(ad => selectedIds.has(ad.id))) ?? group.listings[0])
            : group.listings[0],
          draft: initialManualAdDraft(
            selectedIds.size === 1
              ? (group.listings.find(l => l.activeAdvertisements?.some(ad => selectedIds.has(ad.id))) ?? group.listings[0])
              : group.listings[0],
          ),
        }
      : null;

  const selected = group.listings.flatMap(listing => (listing.activeAdvertisements ?? [])
    .filter(ad => selectedIds.has(ad.id)).map(advertisement => ({ listing, advertisement })));
  const dong = group.property?.unit?.dong;
  const unit = formatUnitName(group.property?.unit);
  const location = locationLabel || ([group.property?.site?.name, dong && !dong.isPlaceholder ? `${dong.name.replace(/동$/, '')}동` : null,
    unit ? `${unit.replace(/호$/, '')}호` : null].filter(Boolean).join(' ') || '매물');

  const cpAccountsQuery = useQuery({
    queryKey: ['cp-accounts'],
    queryFn: () => api.listingAdvertisements.findCpAccounts(),
    enabled: isOpen,
    staleTime: 60_000,
  });
  const cpAccounts = cpAccountsQuery.data ?? [];

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
    enabled: isOpen && (activeEditor?.kind === 'request' || activeEditor?.kind === 'request-confirm'),
    staleTime: 60_000,
  });
  const employees = (employeesQuery.data ?? []).filter(employee => employee.isActive !== false);
  const inlineDrafts = requestDrafts ?? {};
  const inlinePublishes = publishDrafts ?? [];
  const inlineDraftCount = countPropertyAdDrafts(inlineDrafts, inlinePublishes);
  const isInlineRequestMode = mode === 'request' && Boolean(onToggleRequestMode);

  function closeDialog() {
    setInternalOpen(false);
    onManualOpenChange?.(false);
  }

  const mutation = useMutation({
    mutationFn: async (submission: Submission) => {
      if (submission.kind === 'request') await api.listingAdvertisements.createChangeRequestsBatch(submission.payload);
      else await api.listingAdvertisements.create(submission.payload);
      return submission.kind;
    },
    onSuccess: async kind => {
      await Promise.all((kind === 'request'
        ? ['listing-advertisements', 'listings', 'listing-intakes', 'tasks', 'properties', 'projects']
        : ['listing-intakes', 'listings', 'listing-advertisements', 'properties', 'projects'])
        .map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      if (kind === 'request') onRequestSubmitted?.();
      closeDialog();
      onClearSelection();
      toast.success(kind === 'request' ? '광고 요청을 등록했습니다.' : '광고 기록을 추가했습니다.');
    },
    onError: err => setError(err instanceof Error ? err.message : '저장하지 못했습니다. 다시 시도해 주세요.'),
    onSettled: () => { submitting.current = false; },
  });

  function open(next: Editor, button: HTMLButtonElement) {
    opener.current = button;
    setError('');
    setEditor(next);
    setInternalOpen(true);
  }
  function newTarget(listing: AdListing): AdRequestTarget {
    return { listing, channel: initialManualAdDraft(listing).channel, cpAccountId: null, terms: initialAdTerms(listing), floorExposure: '' };
  }
  function submit() {
    if (!activeEditor || submitting.current) return;
    setError('');
    try {
      let submission: Submission;
      if (activeEditor.kind === 'request') {
        submission = {
          kind: 'request',
          payload: buildAdChangeRequestsBatch({
            action: activeEditor.action,
            targets: activeEditor.targets,
            title: activeEditor.title,
            notes: activeEditor.notes,
            assignedToId: activeEditor.assignedToId === AGENT_ASSIGNEE ? null : activeEditor.assignedToId,
            dueDate: activeEditor.dueDate || null,
          }),
        };
      } else if (activeEditor.kind === 'request-confirm') {
        submission = {
          kind: 'request',
          payload: buildInlineAdChangeRequestsBatch({
            listings: group.listings,
            drafts: inlineDrafts,
            publishDrafts: inlinePublishes,
            title: activeEditor.title,
            memo: activeEditor.notes,
            assignedToId: activeEditor.assignedToId === AGENT_ASSIGNEE ? null : activeEditor.assignedToId,
            dueDate: activeEditor.dueDate || null,
          }),
        };
      } else {
        const payload = buildManualAdPayload(activeEditor.listing, activeEditor.draft);
        submission = { kind: 'create', payload: payload as CreateListingAdvertisementDto };
      }
      submitting.current = true;
      mutation.mutate(submission);
    } catch (err) { setError(err instanceof Error ? err.message : '입력한 내용을 확인해 주세요.'); }
  }
  const title = activeEditor?.kind === 'request' || activeEditor?.kind === 'request-confirm' ? '광고 요청' : '광고 기록 추가';
  const patchManual = (patch: Partial<ManualAdDraft>) => {
    setError('');
    setEditor(current => {
      const base = current?.kind === 'manual' ? current : activeEditor?.kind === 'manual' ? activeEditor : null;
      return base ? { ...base, draft: { ...base.draft, ...patch } } : current;
    });
    if (!internalOpen && activeEditor?.kind === 'manual') {
      setEditor({ ...activeEditor, draft: { ...activeEditor.draft, ...patch } });
      setInternalOpen(true);
    }
  };
  const patchRequest = (patch: Partial<Extract<Editor, { kind: 'request' | 'request-confirm' }>>) =>
    setEditor(current => (current?.kind === 'request' || current?.kind === 'request-confirm') ? { ...current, ...patch } as Editor : current);

  const summaryLines = activeEditor?.kind === 'request-confirm'
    ? [
        ...group.listings.flatMap(listing =>
          (listing.activeAdvertisements ?? []).flatMap(advertisement => {
            const draft = inlineDrafts[advertisement.id];
            return draft && !isPropertyAdDraftEmpty(draft)
              ? [summarizePropertyAdDraft(listing, advertisement, draft)]
              : [];
          }),
        ),
        ...inlinePublishes.map(draft =>
          summarizePublishDraft(
            group.listings.find(item => item.id === draft.listingId),
            draft,
          ),
        ),
      ]
    : [];

  return <>
    <div className="flex shrink-0 items-center gap-0.5" aria-label="광고 작업">
      {isInlineRequestMode ? (
        <>
          <Button
            variant="ghost"
            className={actionClass}
            onClick={onCancelRequestMode}
          >
            취소
          </Button>
          <Button
            variant="default"
            size="xs"
            className="h-[26px] gap-1 px-2 text-xs font-medium"
            disabled={inlineDraftCount === 0}
            onClick={event => {
              const onlyPublish =
                inlinePublishes.length > 0 &&
                Object.values(inlineDrafts).every(isPropertyAdDraftEmpty);
              open({
                kind: 'request-confirm',
                title: `${location} ${onlyPublish ? '신규 게재' : '광고 변경 요청'}`,
                assignedToId: AGENT_ASSIGNEE,
                dueDate: '',
                notes: '',
              }, event.currentTarget);
            }}
          >
            <Send className="size-3" />
            {inlineDraftCount > 0 ? `요청 보내기 · ${inlineDraftCount}건` : '요청 보내기'}
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            className={actionClass}
            disabled={!group.listings.length}
            onClick={event => {
              if (onToggleRequestMode) {
                onToggleRequestMode();
                return;
              }
              const targets: AdRequestTarget[] = selected.length
                ? selected.map(({ listing, advertisement }) => ({
                    listing,
                    advertisement,
                    channel: advertisement.channel,
                    cpAccountId: advertisement.cpAccountId ?? null,
                    terms: initialAdTerms(listing, advertisement),
                    floorExposure: (advertisement.floorExposure === 'exact' || advertisement.floorExposure === 'band')
                      ? advertisement.floorExposure
                      : '',
                  }))
                : [newTarget(group.listings[0])];
              const action: AdRequestAction = selected.length ? 'update' : 'publish';
              open({
                kind: 'request',
                targets,
                action,
                title: `${location} ${adRequestLabels[action]}`,
                assignedToId: AGENT_ASSIGNEE,
                dueDate: '',
                notes: '',
              }, event.currentTarget);
            }}
          >
            <ClipboardPlus className="size-3.5" />
            광고 요청
          </Button>
          {onToggleEditMode ? (
            <Button
              variant="ghost"
              className={actionClass}
              data-active={isEditMode || undefined}
              aria-pressed={Boolean(isEditMode)}
              disabled={!group.listings.length}
              onClick={onToggleEditMode}
            >
              <Pencil className="size-3.5" />
              {isEditMode ? '기록 수정·추가 끝' : '기록 수정·추가'}
            </Button>
          ) : (
            <Button variant="ghost" className={actionClass} disabled={!group.listings.length} onClick={event => {
              const listing = selected.length === 1 ? selected[0].listing : group.listings[0];
              open({ kind: 'manual', listing, draft: initialManualAdDraft(listing) }, event.currentTarget);
            }}><Plus className="size-3.5" />기록 추가</Button>
          )}
        </>
      )}
    </div>
    <Dialog open={isOpen} onOpenChange={openState => { if (!openState && !submitting.current) closeDialog(); }}>
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
            {activeEditor?.kind === 'request' || activeEditor?.kind === 'request-confirm'
              ? '광고 변경 요청을 등록하고 묶음 업무를 만듭니다. 실제 CP 변경은 담당자나 에이전트가 처리한 뒤 반영됩니다.'
              : '앱에 광고 정보를 기록합니다. 광고 채널의 실제 게재 내용은 변경되지 않습니다.'}
          </DialogDescription>
          <p className="text-[13px] font-medium">{location}</p>
        </DialogHeader>
        <form className="flex min-h-0 flex-col overflow-hidden" onSubmit={event => { event.preventDefault(); submit(); }}>
          <fieldset disabled={mutation.isPending} className="min-h-0 space-y-4 overflow-y-auto px-6 pb-5 disabled:opacity-60">
            {activeEditor?.kind === 'manual' && (() => {
              const channelAccounts = cpAccounts.filter(account => account.channel === activeEditor.draft.channel && account.isActive !== false);
              return <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="거래" id={`${id}-listing`}><select id={`${id}-listing`} className={selectClass} value={activeEditor.listing.id} disabled={group.listings.length < 2}
                    onChange={event => {
                      const listing = group.listings.find(item => item.id === event.target.value)!;
                      setError('');
                      const nextEditor: Editor = { ...activeEditor, listing, draft: { ...activeEditor.draft, ...initialAdTerms(listing), channel: initialManualAdDraft(listing).channel, cpAccountId: '' } };
                      setEditor(nextEditor);
                      if (!internalOpen) setInternalOpen(true);
                    }}>
                    {group.listings.map(listing => <option key={listing.id} value={listing.id}>{adTradeLabels[listing.transactionType] ?? listing.transactionType}</option>)}
                  </select></Field>
                  <Field label="광고 채널" id={`${id}-channel`}><ChannelSelect id={`${id}-channel`} value={activeEditor.draft.channel} onChange={channel => patchManual({ channel, cpAccountId: '' })} /></Field>
                </div>
                {channelAccounts.length > 0 && (
                  <Field label="CP 계정" id={`${id}-account`}>
                    <select id={`${id}-account`} className={selectClass} value={activeEditor.draft.cpAccountId} onChange={event => patchManual({ cpAccountId: event.target.value })}>
                      <option value="">지정 안 함</option>
                      {channelAccounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.accountName ? `${account.accountName} (${account.accountKey})` : account.accountKey}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <MoneyFields id={id} trade={activeEditor.listing.transactionType} value={activeEditor.draft} onChange={patchManual} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="상태" id={`${id}-status`}><select id={`${id}-status`} className={selectClass} value={activeEditor.draft.status} onChange={event => {
                    const status = event.target.value as 'active' | 'ended'; patchManual({ status, endedAt: status === 'ended' ? activeEditor.draft.endedAt || todayInput() : '' });
                  }}><option value="active">광고 중</option><option value="ended">종료</option></select></Field>
                  <Field label="등록일" id={`${id}-start`}><Input id={`${id}-start`} type="date" value={activeEditor.draft.startedAt} onChange={event => patchManual({ startedAt: event.target.value })} /></Field>
                  {activeEditor.draft.status === 'ended' && <Field label="종료일" id={`${id}-end`}><Input id={`${id}-end`} type="date" required value={activeEditor.draft.endedAt} onChange={event => patchManual({ endedAt: event.target.value })} /></Field>}
                </div>
                <Field label="원문 주소" id={`${id}-url`}><Input id={`${id}-url`} type="url" placeholder="https://" value={activeEditor.draft.url} onChange={event => patchManual({ url: event.target.value })} /></Field>
                <Field label="메모" id={`${id}-memo`}><Textarea id={`${id}-memo`} className="min-h-20 resize-y" value={activeEditor.draft.memo} onChange={event => patchManual({ memo: event.target.value })} /></Field>
              </>;
            })()}
            {activeEditor?.kind === 'request' && <>
              <Field label="업무 제목" id={`${id}-title`}><Input id={`${id}-title`} value={activeEditor.title} onChange={event => patchRequest({ title: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="요청 작업" id={`${id}-action`}><select id={`${id}-action`} className={selectClass} value={activeEditor.action} onChange={event => {
                  const action = event.target.value as AdRequestAction;
                  patchRequest({ action, title: activeEditor.title === `${location} ${adRequestLabels[activeEditor.action]}` ? `${location} ${adRequestLabels[action]}` : activeEditor.title });
                }}>{(activeEditor.targets[0]?.advertisement ? ['update', 'readvertise', 'takedown'] as const : ['publish'] as const).map(action => <option key={action} value={action}>{adRequestLabels[action]}</option>)}</select></Field>
                <Field label="맡길 사람" id={`${id}-assignee`}><select id={`${id}-assignee`} className={selectClass} value={activeEditor.assignedToId} onChange={event => patchRequest({ assignedToId: event.target.value })}>
                  <option value={AGENT_ASSIGNEE}>담당자 없음 (에이전트 실행)</option>
                  {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select></Field>
              </div>
              <div className="space-y-3">
                {activeEditor.targets.map((target, index) => {
                  const channelAccounts = cpAccounts.filter(account => account.channel === target.channel && account.isActive !== false);
                  return <div key={target.advertisement?.id ?? 'new'} className="space-y-3 rounded-md border p-3">
                    {target.advertisement ? <p className="text-[13px] font-medium">{getAdChannelLabel(target.channel)} · {adTradeLabels[target.listing.transactionType]}<span className="ml-2 font-normal text-muted-foreground">{target.advertisement.externalAdId}</span></p>
                      : <div className="grid grid-cols-2 gap-3">
                        <Field label="거래" id={`${id}-request-listing`}><select id={`${id}-request-listing`} className={selectClass} value={target.listing.id} onChange={event => patchRequest({ targets: [newTarget(group.listings.find(listing => listing.id === event.target.value)!)] })}>
                          {group.listings.map(listing => <option key={listing.id} value={listing.id}>{adTradeLabels[listing.transactionType]}</option>)}
                        </select></Field>
                        <Field label="광고 채널" id={`${id}-request-channel`}><ChannelSelect id={`${id}-request-channel`} value={target.channel} onChange={channel => patchRequest({ targets: [{ ...target, channel, cpAccountId: null }] })} /></Field>
                      </div>}
                    {channelAccounts.length > 0 && !target.advertisement && (
                      <Field label="CP 계정" id={`${id}-target-account-${index}`}>
                        <select id={`${id}-target-account-${index}`} className={selectClass} value={target.cpAccountId ?? ''} onChange={event => patchRequest({ targets: activeEditor.targets.map((current, i) => i === index ? { ...current, cpAccountId: event.target.value || null } : current) })}>
                          <option value="">지정 안 함</option>
                          {channelAccounts.map(account => (
                            <option key={account.id} value={account.id}>
                              {account.accountName ? `${account.accountName} (${account.accountKey})` : account.accountKey}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {activeEditor.action !== 'takedown' && <>
                      <MoneyFields id={`${id}-target-${index}`} trade={target.listing.transactionType} value={target.terms}
                        onChange={patch => patchRequest({ targets: activeEditor.targets.map((current, i) => i === index ? { ...current, terms: { ...current.terms, ...patch } } : current) })} />
                      <Field label="층수 노출" id={`${id}-floor-${index}`}>
                        <select id={`${id}-floor-${index}`} className={selectClass} value={target.floorExposure ?? ''} onChange={event => patchRequest({ targets: activeEditor.targets.map((current, i) => i === index ? { ...current, floorExposure: event.target.value as 'exact' | 'band' | '' } : current) })}>
                          <option value="">변경 안 함</option>
                          <option value="exact">정확한 층</option>
                          <option value="band">고·중·저 구간</option>
                        </select>
                      </Field>
                    </>}
                  </div>;
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="완료 기한" id={`${id}-due`}><Input id={`${id}-due`} type="date" value={activeEditor.dueDate} onChange={event => patchRequest({ dueDate: event.target.value })} /></Field>
              </div>
              <Field label="요청사항" id={`${id}-notes`}><Textarea id={`${id}-notes`} className="min-h-20 resize-y" placeholder="추가로 전달할 내용을 입력하세요" value={activeEditor.notes} onChange={event => patchRequest({ notes: event.target.value })} /></Field>
            </>}
            {activeEditor?.kind === 'request-confirm' && <>
              {summaryLines.length > 0 && (
                <ul className="divide-y rounded-md border bg-muted/20 text-[13px]">
                  {summaryLines.map((line, index) => (
                    <li key={`${line}-${index}`} className="px-3 py-2 text-foreground">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
              <Field label="업무 제목" id={`${id}-confirm-title`}><Input id={`${id}-confirm-title`} value={activeEditor.title} onChange={event => patchRequest({ title: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="맡길 사람" id={`${id}-confirm-assignee`}><select id={`${id}-confirm-assignee`} className={selectClass} value={activeEditor.assignedToId} onChange={event => patchRequest({ assignedToId: event.target.value })}>
                  <option value={AGENT_ASSIGNEE}>담당자 없음 (에이전트 실행)</option>
                  {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select></Field>
                <Field label="완료 기한" id={`${id}-confirm-due`}><Input id={`${id}-confirm-due`} type="date" value={activeEditor.dueDate} onChange={event => patchRequest({ dueDate: event.target.value })} /></Field>
              </div>
              <Field label="요청사항" id={`${id}-confirm-notes`}><Textarea id={`${id}-confirm-notes`} className="min-h-20 resize-y" placeholder="추가로 전달할 내용을 입력하세요" value={activeEditor.notes} onChange={event => patchRequest({ notes: event.target.value })} /></Field>
            </>}
          </fieldset>
          {error && <p role="alert" className="px-6 pb-3 text-[13px] text-destructive">{error}</p>}
          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="ghost" size="sm" disabled={mutation.isPending} onClick={closeDialog}>취소</Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {mutation.isPending
                ? '저장 중…'
                : activeEditor?.kind === 'request-confirm'
                  ? `광고 요청 등록${summaryLines.length > 1 ? ` · ${summaryLines.length}건` : ''}`
                  : activeEditor?.kind === 'request'
                    ? `광고 요청 등록${activeEditor.targets.length > 1 ? ` · ${activeEditor.targets.length}건` : ''}`
                    : '광고 기록 추가'}
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
