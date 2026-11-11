import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCheck,
  GitPullRequestArrow,
  Handshake,
  ListTodo,
  Loader2,
  Pencil,
  RotateCcw,
  UserRoundPen,
  UserRoundPlus,
} from 'lucide-react';
import type {
  CallActionSuggestion,
  CallSuggestionPayloadByType,
  CallSuggestionTypeValue,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CONTACT_REQUIRED_TYPES,
  describeSuggestion,
  splitKstDateTime,
  SUGGESTION_TYPE_LABEL,
  toKstValue,
} from './-call-suggestion-format';

/**
 * 통화 분석이 제안한 업무.
 * 받아쓰기는 숫자·이름을 틀릴 수 있어 사람이 확인(필요하면 고쳐서)한 뒤 반영한다.
 */

const TYPE_ICON: Record<CallSuggestionTypeValue, typeof ListTodo> = {
  task: ListTodo,
  calendar_event: CalendarClock,
  buyer_requirement_create: UserRoundPlus,
  buyer_requirement_update: UserRoundPen,
  match_create: Handshake,
  match_stage: GitPullRequestArrow,
  listing_confirm: ClipboardCheck,
};

/** 반영하면 화면 여러 곳이 바뀐다 */
const RELATED_QUERY_KEYS = [
  ['call-recordings'],
  ['tasks'],
  ['calendar-events'],
  ['buyer-requirements'],
  ['buyer-intakes'],
  ['matches'],
  ['listing-intakes'],
  ['listings'],
  ['consultations'],
];

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function CallSuggestionList({
  suggestions,
  labels,
  hasContact,
  renderEvidenceLink,
}: {
  suggestions: CallActionSuggestion[];
  labels: Record<string, string>;
  hasContact: boolean;
  /** 근거 인용문 옆에 원문으로 가는 링크 (받아쓰기에서 찾지 못하면 null) */
  renderEvidenceLink?: (evidence: string) => ReactNode;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const open = suggestions.filter((s) => s.status === 'pending' || s.status === 'applying');
  const resolved = suggestions.filter((s) => s.status === 'accepted' || s.status === 'dismissed');
  if (suggestions.length === 0) return null;

  return (
    <section data-call-suggestions className="border-b px-6 py-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-violet">
          AI 제안{open.length > 0 ? ` · ${open.length}건` : ''}
        </h3>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        받아쓰기는 숫자·이름을 틀릴 수 있어요. 내용을 확인하고 반영하세요.
      </p>

      {open.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-3 text-center text-[12px] text-muted-foreground">
          처리할 제안이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((suggestion) => (
            <li key={suggestion.id}>
              <SuggestionCard
                suggestion={suggestion}
                labels={labels}
                hasContact={hasContact}
                renderEvidenceLink={renderEvidenceLink}
              />
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowResolved((value) => !value)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            aria-expanded={showResolved}
          >
            <ChevronDown className={cn('size-3 transition-transform', !showResolved && '-rotate-90')} />
            처리한 제안 {resolved.length}건
          </button>
          {showResolved && (
            <ul className="mt-2 space-y-1.5">
              {resolved.map((suggestion) => (
                <li key={suggestion.id}>
                  <ResolvedRow suggestion={suggestion} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function useSuggestionMutations(suggestion: CallActionSuggestion) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all(RELATED_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const label = SUGGESTION_TYPE_LABEL[suggestion.type];

  const accept = useMutation({
    mutationFn: (payload?: CallSuggestionPayloadByType[CallSuggestionTypeValue]) =>
      api.callRecordings.acceptSuggestion(suggestion.id, payload),
    onSuccess: async () => {
      toast.success(`${label} 반영했습니다`);
      await refresh();
    },
    onError: async (error) => {
      toast.error(errorText(error, `${label} 반영에 실패했습니다`));
      await queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
    },
  });
  const dismiss = useMutation({
    mutationFn: () => api.callRecordings.dismissSuggestion(suggestion.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['call-recordings'] }),
    onError: (error) => toast.error(errorText(error, '제안을 무시하지 못했습니다')),
  });
  const restore = useMutation({
    mutationFn: () => api.callRecordings.restoreSuggestion(suggestion.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['call-recordings'] }),
    onError: (error) => toast.error(errorText(error, '제안을 되돌리지 못했습니다')),
  });
  return { accept, dismiss, restore };
}

function SuggestionCard({
  suggestion,
  labels,
  hasContact,
  renderEvidenceLink,
}: {
  suggestion: CallActionSuggestion;
  labels: Record<string, string>;
  hasContact: boolean;
  renderEvidenceLink?: (evidence: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const { accept, dismiss } = useSuggestionMutations(suggestion);
  const Icon = TYPE_ICON[suggestion.type] ?? ListTodo;
  const needsContact = CONTACT_REQUIRED_TYPES.includes(suggestion.type) && !hasContact;
  const busy = accept.isPending || dismiss.isPending || suggestion.status === 'applying';
  const editable = suggestion.type !== 'match_stage';
  const lines = describeSuggestion(suggestion, labels);

  return (
    <article
      data-call-suggestion={suggestion.type}
      className="rounded-lg border bg-background px-3 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5 text-violet" aria-hidden />
        <span>{SUGGESTION_TYPE_LABEL[suggestion.type]}</span>
      </div>
      <p className="mt-1 text-[13px] font-medium leading-snug">{suggestion.title}</p>
      {lines.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[12px] leading-relaxed text-muted-foreground">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      {suggestion.evidence && (
        <div className="mt-2 flex items-start justify-between gap-2">
          <blockquote className="min-w-0 border-l-2 border-violet/30 pl-2 text-[12px] leading-relaxed text-muted-foreground">
            “{suggestion.evidence}”
          </blockquote>
          {renderEvidenceLink?.(suggestion.evidence)}
        </div>
      )}

      {editing ? (
        <SuggestionEditor
          suggestion={suggestion}
          pending={accept.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(payload) => accept.mutate(payload, { onSuccess: () => setEditing(false) })}
        />
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={busy || needsContact}
            onClick={() => accept.mutate(undefined)}
          >
            {accept.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            반영
          </Button>
          {editable && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={busy || needsContact}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
              고쳐서 반영
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-xs text-muted-foreground"
            disabled={busy}
            onClick={() => dismiss.mutate()}
          >
            무시
          </Button>
        </div>
      )}
      {needsContact && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          통화 상대 연락처를 연결하면 반영할 수 있어요.
        </p>
      )}
    </article>
  );
}

function ResolvedRow({ suggestion }: { suggestion: CallActionSuggestion }) {
  const { restore } = useSuggestionMutations(suggestion);
  const accepted = suggestion.status === 'accepted';
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-[12px]">
      <span
        className={cn(
          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
          accepted ? 'bg-success-soft text-success' : 'bg-neutral-soft text-muted-foreground',
        )}
      >
        {accepted ? '반영함' : '무시함'}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', !accepted && 'text-muted-foreground line-through')}>
        {suggestion.title}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {[suggestion.resolvedBy?.name, suggestion.resolvedAt && formatDateTime(suggestion.resolvedAt)]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {!accepted && (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={restore.isPending}
          onClick={() => restore.mutate()}
        >
          <RotateCcw className="size-3" />
          되돌리기
        </button>
      )}
    </div>
  );
}

// ── 고쳐서 반영 ────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** 만원 입력 (빈 칸 = 없음) */
function ManwonInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={ariaLabel}
        className="h-8 pr-9 text-[13px] tabular-nums"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
        만원
      </span>
    </div>
  );
}

const MONEY_FIELDS = [
  ['priceMin', '최소 매매가'],
  ['priceMax', '최대 매매가'],
  ['depositMin', '최소 보증금'],
  ['depositMax', '최대 보증금'],
  ['monthlyRentMin', '최소 월세'],
  ['monthlyRentMax', '최대 월세'],
] as const;

function SuggestionEditor({
  suggestion,
  pending,
  onCancel,
  onSubmit,
}: {
  suggestion: CallActionSuggestion;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: CallSuggestionPayloadByType[CallSuggestionTypeValue]) => void;
}) {
  // 제안 내용을 복사해 고친다 (모르는 항목은 그대로 보낸다)
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    JSON.parse(JSON.stringify(suggestion.payload)),
  );
  const set = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  const body = (() => {
    switch (suggestion.type) {
      case 'task': {
        const due = draft.dueDate ? splitKstDateTime(String(draft.dueDate)) : { date: '', time: null };
        const setDue = (date: string, time: string | null) =>
          set('dueDate', date ? toKstValue(date, time) : null);
        return (
          <>
            <Field label="제목">
              <Input className="h-8 text-[13px]" value={String(draft.title ?? '')} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="마감일">
                <Input type="date" className="h-8 text-[13px]" value={due.date} onChange={(e) => setDue(e.target.value, due.time)} />
              </Field>
              <Field label="시각 (선택)">
                <Input
                  type="time"
                  className="h-8 text-[13px]"
                  value={due.time ?? ''}
                  disabled={!due.date}
                  onChange={(e) => setDue(due.date, e.target.value || null)}
                />
              </Field>
            </div>
            <Field label="우선순위">
              <select className={selectClass} value={String(draft.priority ?? 'medium')} onChange={(e) => set('priority', e.target.value)}>
                <option value="urgent">긴급</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
            </Field>
          </>
        );
      }
      case 'calendar_event': {
        const start = splitKstDateTime(String(draft.start ?? ''));
        const endTime = draft.end ? splitKstDateTime(String(draft.end)).time : null;
        const setWhen = (date: string, time: string | null, end: string | null) => {
          setDraft((current) => ({
            ...current,
            start: toKstValue(date, time),
            end: time && end ? toKstValue(date, end) : null,
          }));
        };
        return (
          <>
            <Field label="제목">
              <Input className="h-8 text-[13px]" value={String(draft.title ?? '')} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="날짜">
                <Input type="date" className="h-8 text-[13px]" value={start.date} onChange={(e) => setWhen(e.target.value, start.time, endTime)} />
              </Field>
              <Field label="시작">
                <Input type="time" className="h-8 text-[13px]" value={start.time ?? ''} onChange={(e) => setWhen(start.date, e.target.value || null, endTime)} />
              </Field>
              <Field label="끝 (선택)">
                <Input
                  type="time"
                  className="h-8 text-[13px]"
                  value={endTime ?? ''}
                  disabled={!start.time}
                  onChange={(e) => setWhen(start.date, start.time, e.target.value || null)}
                />
              </Field>
            </div>
            <Field label="종류">
              <select className={selectClass} value={String(draft.eventType ?? 'general')} onChange={(e) => set('eventType', e.target.value)}>
                <option value="viewing">임장</option>
                <option value="contract">계약</option>
                <option value="meeting">미팅</option>
                <option value="general">일정</option>
              </select>
            </Field>
          </>
        );
      }
      case 'listing_confirm': {
        const changes = (draft.priceChanges as Array<Record<string, number | null | string>>) ?? [];
        const setChange = (index: number, key: string, value: number | null) =>
          set(
            'priceChanges',
            changes.map((change, i) => (i === index ? { ...change, [key]: value } : change)),
          );
        return (
          <>
            <Field label="확인 결과">
              <select className={selectClass} value={String(draft.result)} onChange={(e) => set('result', e.target.value)}>
                <option value="alive">그대로 진행</option>
                <option value="price_changed">가격 변경</option>
                <option value="unavailable">거래 불가 (의뢰 종료)</option>
              </select>
            </Field>
            {draft.result === 'price_changed' &&
              changes.map((change, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  {(['price', 'deposit', 'monthlyRent'] as const)
                    .filter((key) => change[key] !== undefined)
                    .map((key) => (
                      <Field key={key} label={key === 'price' ? '바뀐 가격' : key === 'deposit' ? '보증금' : '월세'}>
                        <ManwonInput
                          ariaLabel={key}
                          value={change[key] as number | null}
                          onChange={(value) => setChange(index, key, value)}
                        />
                      </Field>
                    ))}
                </div>
              ))}
            <Field label="메모">
              <Input className="h-8 text-[13px]" value={String(draft.memo ?? '')} onChange={(e) => set('memo', e.target.value || null)} />
            </Field>
          </>
        );
      }
      case 'buyer_requirement_create':
      case 'buyer_requirement_update': {
        const isUpdate = suggestion.type === 'buyer_requirement_update';
        const fields = (isUpdate ? draft.changes : draft) as Record<string, unknown>;
        const setField = (key: string, value: unknown) =>
          isUpdate ? set('changes', { ...fields, [key]: value }) : set(key, value);
        const visibleMoney = MONEY_FIELDS.filter(([key]) => fields[key] !== undefined);
        return (
          <>
            {visibleMoney.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {visibleMoney.map(([key, label]) => (
                  <Field key={key} label={label}>
                    <ManwonInput ariaLabel={label} value={fields[key] as number | null} onChange={(value) => setField(key, value)} />
                  </Field>
                ))}
              </div>
            )}
            <Field label={isUpdate ? '덧붙일 메모' : '메모'}>
              <Input
                className="h-8 text-[13px]"
                value={String((isUpdate ? draft.memoAppend : draft.memo) ?? '')}
                onChange={(e) => set(isUpdate ? 'memoAppend' : 'memo', e.target.value || null)}
              />
            </Field>
          </>
        );
      }
      case 'match_create':
        return (
          <Field label="매칭 메모">
            <Input className="h-8 text-[13px]" value={String(draft.memo ?? '')} onChange={(e) => set('memo', e.target.value || null)} />
          </Field>
        );
      default:
        return null;
    }
  })();

  return (
    <form
      className="mt-2.5 space-y-2 rounded-md bg-muted/40 p-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft as unknown as CallSuggestionPayloadByType[CallSuggestionTypeValue]);
      }}
    >
      {body}
      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" size="sm" className="h-7 px-2.5 text-xs" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          이대로 반영
        </Button>
      </div>
    </form>
  );
}
