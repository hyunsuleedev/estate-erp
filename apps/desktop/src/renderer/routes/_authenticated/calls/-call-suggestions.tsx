import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatPrice } from '@estate-erp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buyerRequirementQueries } from '@/queries/buyer-requirements';
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
import {
  ApiError,
  CALL_SUGGESTION_BASE_CHANGED,
  type CallSuggestionBaseChange,
} from '@estate-erp/api-client';
import type {
  CallActionSuggestion,
  CallSuggestionPayloadByType,
  CallSuggestionTypeValue,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/lib/api-error';
import { formatManwonEcho, MANWON_INPUT_HINT, parseManwon } from '@/lib/manwon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CONTACT_REQUIRED_TYPES,
  defaultIncludedRequirementRows,
  describeSuggestion,
  describeSuggestionEffect,
  isHeavySuggestion,
  pickRequirementFields,
  requirementFieldRows,
  splitKstDateTime,
  SUGGESTION_ACTION_LABEL,
  SUGGESTION_GROUP_LABEL,
  SUGGESTION_GROUP_ORDER,
  SUGGESTION_TYPE_LABEL,
  suggestionGroupOf,
  toKstValue,
  type RequirementCurrentValues,
} from './-call-suggestion-format';

/**
 * 통화 분석이 제안한 업무.
 * 받아쓰기는 숫자·이름을 틀릴 수 있어 사람이 확인(필요하면 고쳐서)한 뒤 반영한다.
 *
 * 제안을 한 가지 카드로 다루지 않는다. 무엇을 쓰느냐에 따라 확인하는 방식이 다르다:
 * 할 일·일정은 목록에서 바로 만들고, 희망조건은 항목별로 골라 저장하고,
 * 매칭·매물 확인은 무엇이 바뀌는지 읽고 직접 실행한다. 어느 것도 자동으로 반영하지 않는다.
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
  ['consultation'],
];

/** 처리 전 제안 수를 보여 주는 곳: 통화 상세, 상담 목록(상태 · 작업 요청 보기), 상담 한 건 */
const SUGGESTION_COUNT_QUERY_KEYS = [['call-recordings'], ['consultations'], ['consultation']];

function errorText(error: unknown, fallback: string) {
  return apiErrorMessage(error, fallback);
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

  const shared = { labels, hasContact, renderEvidenceLink };

  return (
    <section data-call-suggestions className="border-b px-6 py-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-violet">
          AI 제안 · 통화에서 나온 다음 일{open.length > 0 ? ` · ${open.length}건` : ''}
        </h3>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        AI가 통화 내용에서 골라낸 것입니다. 받아쓰기는 숫자·이름을 틀릴 수 있어요. 내용을 확인하고 필요한 것만 만드세요.
      </p>

      {open.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">처리할 것이 없습니다.</p>
      ) : (
        <div className="space-y-5">
          {/* 무엇을 쓰느냐에 따라 확인하는 방식이 다르다: 가볍게 만드는 것 → 값을 고르는 것 → 직접 실행하는 것 */}
          {SUGGESTION_GROUP_ORDER.map((group) => {
            const items = open.filter((suggestion) => suggestionGroupOf(suggestion.type) === group);
            if (items.length === 0) return null;
            return (
              <div key={group} data-suggestion-group={group}>
                <h4 className="mb-1 text-[12px] font-medium text-foreground">
                  {SUGGESTION_GROUP_LABEL[group]}
                  <span className="ml-1 font-normal text-muted-foreground">{items.length}</span>
                </h4>
                <ul className="divide-y divide-border border-y border-border">
                  {items.map((suggestion) => (
                    <li key={suggestion.id}>
                      {group === 'followUp' ? (
                        <FollowUpRow suggestion={suggestion} {...shared} />
                      ) : group === 'requirement' ? (
                        <RequirementBlock suggestion={suggestion} {...shared} />
                      ) : (
                        <DecisionRow suggestion={suggestion} {...shared} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
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
            처리한 것 {resolved.length}건
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
  /** 무시 · 되돌리기: 다른 기록은 바뀌지 않지만 처리 전 제안 수는 바뀐다 */
  const refreshSuggestionCounts = () =>
    Promise.all(
      SUGGESTION_COUNT_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  const label = SUGGESTION_TYPE_LABEL[suggestion.type];
  const [conflict, setConflict] = useState<{
    changes: CallSuggestionBaseChange[];
    payload: CallSuggestionPayloadByType[CallSuggestionTypeValue] | undefined;
  } | null>(null);

  const accept = useMutation({
    mutationFn: (payload?: CallSuggestionPayloadByType[CallSuggestionTypeValue]) =>
      api.callRecordings.acceptSuggestion(suggestion.id, payload),
    onSuccess: async () => {
      toast.success(`${label} 반영했습니다`);
      await refresh();
    },
    onMutate: () => setConflict(null),
    onError: async (error, payload) => {
      // 제안한 뒤 누가 값을 고쳤다 — 덮어쓰지 않고 무엇이 달라졌는지 보여 준다
      const changes = baseChangesOf(error);
      if (changes) {
        setConflict({ changes, payload });
        await refresh();
        return;
      }
      toast.error(errorText(error, `${label} 반영에 실패했습니다`));
      await queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
    },
  });
  // 달라진 값을 보고도 반영 (서버에 확인했다고 알린다)
  const acceptAnyway = useMutation({
    mutationFn: () => api.callRecordings.acceptSuggestion(suggestion.id, conflict?.payload, { force: true }),
    onSuccess: async () => {
      setConflict(null);
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
    // 처리 전 제안 수가 바뀐다 — 상담 목록의 상태(작업 요청 ↔ 완료)와 "작업 요청" 보기도 새로 불러온다
    onSuccess: () => refreshSuggestionCounts(),
    onError: (error) => toast.error(errorText(error, '제안을 무시하지 못했습니다')),
  });
  const restore = useMutation({
    mutationFn: () => api.callRecordings.restoreSuggestion(suggestion.id),
    onSuccess: () => refreshSuggestionCounts(),
    onError: (error) => toast.error(errorText(error, '제안을 되돌리지 못했습니다')),
  });
  const conflictNotice = conflict ? (
    <div
      role="alert"
      data-suggestion-base-changed
      className="mt-2 border-l-2 border-warning pl-3 text-[12px] leading-relaxed"
    >
      <p className="font-medium text-warning-strong">지금 저장된 값을 확인해 주세요. 아직 반영하지 않았어요.</p>
      <ul className="mt-0.5 text-muted-foreground">
        {conflict.changes.map((change) => (
          <li key={change.label}>
            {change.label}: 제안할 때 <span className="tabular-nums">{change.was}</span> → 지금 저장된 값{' '}
            <span className="tabular-nums text-foreground">{change.now}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex items-center gap-0.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs"
          disabled={acceptAnyway.isPending}
          onClick={() => acceptAnyway.mutate()}
        >
          {acceptAnyway.isPending && <Loader2 className="size-3.5 animate-spin" />}
          지금 값을 확인했고, 제안대로 바꾸기
        </Button>
        <button type="button" className={ghostAction} disabled={acceptAnyway.isPending} onClick={() => setConflict(null)}>
          닫기
        </button>
      </div>
    </div>
  ) : null;

  return { accept, dismiss, restore, conflictNotice, busyConflict: acceptAnyway.isPending };
}

/** 서버가 "제안한 뒤 값이 바뀌었다"고 멈춘 오류면 달라진 항목을 돌려준다 */
function baseChangesOf(error: unknown): CallSuggestionBaseChange[] | null {
  if (!(error instanceof ApiError) || error.statusCode !== 409) return null;
  const body = error.body as { code?: unknown; changes?: unknown } | null;
  if (!body || body.code !== CALL_SUGGESTION_BASE_CHANGED || !Array.isArray(body.changes)) return null;
  return body.changes.filter(
    (change): change is CallSuggestionBaseChange =>
      !!change && typeof change.label === 'string' && typeof change.was === 'string' && typeof change.now === 'string',
  );
}

interface SuggestionRowProps {
  suggestion: CallActionSuggestion;
  labels: Record<string, string>;
  hasContact: boolean;
  renderEvidenceLink?: (evidence: string) => ReactNode;
}

const ghostAction =
  'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-[rgba(33,27,23,0.05)] hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

function EvidenceQuote({
  evidence,
  renderEvidenceLink,
}: {
  evidence: string | null;
  renderEvidenceLink?: (evidence: string) => ReactNode;
}) {
  if (!evidence) return null;
  return (
    <div className="mt-1 flex items-start gap-2">
      <blockquote className="min-w-0 text-[12px] leading-relaxed text-muted-foreground">“{evidence}”</blockquote>
      {renderEvidenceLink?.(evidence)}
    </div>
  );
}

function NeedsContactNote() {
  return (
    <p className="mt-1.5 text-[11px] text-muted-foreground">통화 상대 연락처를 연결하면 반영할 수 있어요.</p>
  );
}

/** 할 일 · 일정: 한 줄에 내용과 "만들기". 틀리면 고쳐서 만들고, 필요 없으면 지운다. */
function FollowUpRow({ suggestion, labels, hasContact, renderEvidenceLink }: SuggestionRowProps) {
  const [editing, setEditing] = useState(false);
  const { accept, dismiss, conflictNotice } = useSuggestionMutations(suggestion);
  const Icon = TYPE_ICON[suggestion.type] ?? ListTodo;
  const needsContact = CONTACT_REQUIRED_TYPES.includes(suggestion.type) && !hasContact;
  const busy = accept.isPending || dismiss.isPending || suggestion.status === 'applying';
  const lines = describeSuggestion(suggestion, labels);

  return (
    <article data-call-suggestion={suggestion.type} className="py-2.5">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-[#8e8b86]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug">{suggestion.title}</p>
          {lines.length > 0 && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{lines.join(' · ')}</p>
          )}
          <EvidenceQuote evidence={suggestion.evidence} renderEvidenceLink={renderEvidenceLink} />
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              disabled={busy || needsContact}
              onClick={() => accept.mutate(undefined)}
            >
              {accept.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {SUGGESTION_ACTION_LABEL[suggestion.type]}
            </Button>
            <button
              type="button"
              className={ghostAction}
              aria-label={`${suggestion.title} 고쳐서 만들기`}
              title="고쳐서 만들기"
              disabled={busy || needsContact}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
            </button>
            <button type="button" className={ghostAction} disabled={busy} onClick={() => dismiss.mutate()}>
              무시
            </button>
          </div>
        )}
      </div>
      {editing && (
        <SuggestionEditor
          suggestion={suggestion}
          pending={accept.isPending}
          submitLabel={SUGGESTION_ACTION_LABEL[suggestion.type]}
          onCancel={() => setEditing(false)}
          onSubmit={(payload) => accept.mutate(payload, { onSuccess: () => setEditing(false) })}
        />
      )}
      {conflictNotice}
      {needsContact && <NeedsContactNote />}
    </article>
  );
}

/**
 * 희망조건: 항목마다 "지금 값 → 통화에서 들은 값"을 보이고, 체크한 줄만 저장한다.
 * 빈 칸을 채우는 줄은 미리 체크돼 있고, 이미 있는 값을 바꾸는 줄은 사람이 골라야 한다.
 */
function RequirementBlock({ suggestion, labels, hasContact, renderEvidenceLink }: SuggestionRowProps) {
  const { accept, dismiss, conflictNotice } = useSuggestionMutations(suggestion);
  const [editing, setEditing] = useState(false);
  const isUpdate = suggestion.type === 'buyer_requirement_update';
  const updatePayload = suggestion.payload as CallSuggestionPayloadByType['buyer_requirement_update'];
  const createPayload = suggestion.payload as CallSuggestionPayloadByType['buyer_requirement_create'];
  const fields = isUpdate ? updatePayload.changes : createPayload;
  const memo = isUpdate ? updatePayload.memoAppend : createPayload.memo;

  // 고치는 제안은 지금 저장된 값을 읽어 와 나란히 보인다
  const currentQuery = useQuery({
    ...buyerRequirementQueries.detail(isUpdate ? updatePayload.buyerReqId : null),
    enabled: isUpdate,
  });
  const current = (isUpdate ? (currentQuery.data ?? null) : null) as RequirementCurrentValues | null;
  const waitingCurrent = isUpdate && currentQuery.isLoading;

  const rows = useMemo(
    () => requirementFieldRows(fields, labels, current, !isUpdate),
    [fields, labels, current, isUpdate],
  );
  // 사람이 손대기 전에는 기본 체크를 따른다 (지금 값을 읽어 오면 기본값도 다시 정해진다)
  const [picked, setPicked] = useState<string[] | null>(null);
  // 지금 값을 읽지 못했으면 무엇을 덮어쓰는지 알 수 없다 — 아무것도 미리 체크하지 않는다
  const currentUnknown = isUpdate && !current;
  const included = picked ?? (currentUnknown ? [] : defaultIncludedRequirementRows(rows));
  const [includeMemo, setIncludeMemo] = useState(true);

  const needsContact = CONTACT_REQUIRED_TYPES.includes(suggestion.type) && !hasContact;
  const busy = accept.isPending || dismiss.isPending || suggestion.status === 'applying';
  const chosenCount = rows.filter((row) => included.includes(row.key)).length + (memo && includeMemo ? 1 : 0);
  const comparisonFailed = isUpdate && currentQuery.isError;

  // 저장하는 내용은 어느 경로든(바로 저장 · 값 고쳐서 반영) 체크한 줄에서만 나온다
  const chosenPayload = (): CallSuggestionPayloadByType[CallSuggestionTypeValue] => {
    const chosen = pickRequirementFields(fields, rows, included);
    return isUpdate
      ? { buyerReqId: updatePayload.buyerReqId, changes: chosen, memoAppend: includeMemo ? updatePayload.memoAppend : null }
      : { ...chosen, buyerIntakeId: createPayload.buyerIntakeId, memo: includeMemo ? createPayload.memo : null };
  };
  const save = () => accept.mutate(chosenPayload());

  const toggle = (key: string) =>
    setPicked(included.includes(key) ? included.filter((item) => item !== key) : [...included, key]);

  return (
    <article data-call-suggestion={suggestion.type} className="py-3">
      <p className="text-[13px] font-medium leading-snug">{suggestion.title}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {isUpdate
          ? `${labels[updatePayload.buyerReqId] ?? '저장된 희망 조건'}을 고칩니다.`
          : '새 희망 조건으로 등록합니다.'}
      </p>
      <EvidenceQuote evidence={suggestion.evidence} renderEvidenceLink={renderEvidenceLink} />

      {editing ? (
        // 고치는 창은 체크한 줄의 값만 가지고 연다 — 뺀 줄이나 보이지 않은 값이 함께 저장되지 않게
        <SuggestionEditor
          suggestion={{ ...suggestion, payload: chosenPayload() }}
          pending={accept.isPending}
          submitLabel={SUGGESTION_ACTION_LABEL[suggestion.type]}
          onCancel={() => setEditing(false)}
          onSubmit={(payload) => accept.mutate(payload, { onSuccess: () => setEditing(false) })}
        />
      ) : (
        <>
          <table data-requirement-fields className="mt-2 w-full text-[13px]">
            <thead className="sr-only">
              <tr>
                <th>저장</th>
                <th>항목</th>
                <th>지금 값</th>
                <th>통화에서 들은 값</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const checked = included.includes(row.key);
                return (
                  <tr key={row.key} className="align-top">
                    <td className="w-6 py-1">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-3.5 accent-foreground"
                        aria-label={`${row.label} 저장`}
                        checked={checked}
                        disabled={row.locked || busy || waitingCurrent}
                        onChange={() => toggle(row.key)}
                      />
                    </td>
                    <td className="w-20 py-1 text-muted-foreground">{row.label}</td>
                    <td className="py-1">
                      {row.current && (
                        <span className={cn('mr-1.5 text-muted-foreground', checked && 'line-through')}>
                          {row.current}
                        </span>
                      )}
                      {row.current && <span className="mr-1.5 text-muted-foreground">→</span>}
                      <span className={cn('tabular-nums', checked ? 'text-foreground' : 'text-muted-foreground')}>
                        {row.proposed}
                      </span>
                      {row.changesExisting && !checked && (
                        <span className="ml-1.5 text-[11px] text-warning-strong">지금 값을 바꿉니다 — 확인 후 체크</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {memo && (
                <tr className="align-top">
                  <td className="w-6 py-1">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-3.5 accent-foreground"
                      aria-label="메모 저장"
                      checked={includeMemo}
                      disabled={busy}
                      onChange={() => setIncludeMemo((value) => !value)}
                    />
                  </td>
                  <td className="w-20 py-1 text-muted-foreground">{isUpdate ? '메모 추가' : '메모'}</td>
                  <td className={cn('py-1', !includeMemo && 'text-muted-foreground')}>{memo}</td>
                </tr>
              )}
            </tbody>
          </table>
          {waitingCurrent && <p className="mt-1 text-[11px] text-muted-foreground">지금 값을 불러오는 중…</p>}
          {comparisonFailed && (
            <p className="mt-1 text-[11px] text-warning-strong">
              지금 저장된 값을 불러오지 못해 견줄 수 없습니다. 체크한 항목은 저장된 값을 덮어쓰므로 직접 골라 주세요.{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => void currentQuery.refetch()}>
                다시 불러오기
              </button>
            </p>
          )}
          <div className="mt-2 flex items-center gap-0.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              disabled={busy || needsContact || waitingCurrent || chosenCount === 0}
              onClick={save}
            >
              {accept.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {chosenCount === 0 ? '저장할 항목을 고르세요' : `${chosenCount}개 항목 ${isUpdate ? '고치기' : '등록'}`}
            </Button>
            <button
              type="button"
              className={ghostAction}
              disabled={busy || needsContact || waitingCurrent || chosenCount === 0}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
              값 고쳐서 반영
            </button>
            <button type="button" className={cn(ghostAction, 'ml-auto')} disabled={busy} onClick={() => dismiss.mutate()}>
              무시
            </button>
          </div>
        </>
      )}
      {conflictNotice}
      {needsContact && <NeedsContactNote />}
    </article>
  );
}

/**
 * 매칭 · 매물 확인: 다른 기록에 연쇄 효과가 있는 변경.
 * 누르면 무엇이 바뀌는지 문장으로 먼저 보이고, 버튼에는 그 일을 적는다.
 */
function DecisionRow({ suggestion, labels, hasContact, renderEvidenceLink }: SuggestionRowProps) {
  const [editing, setEditing] = useState(false);
  const { accept, dismiss, conflictNotice } = useSuggestionMutations(suggestion);
  const Icon = TYPE_ICON[suggestion.type] ?? ListTodo;
  const needsContact = CONTACT_REQUIRED_TYPES.includes(suggestion.type) && !hasContact;
  const busy = accept.isPending || dismiss.isPending || suggestion.status === 'applying';
  const editable = suggestion.type !== 'match_stage';
  const lines = describeSuggestion(suggestion, labels);
  const effect = describeSuggestionEffect(suggestion);
  const heavy = isHeavySuggestion(suggestion);

  return (
    <article data-call-suggestion={suggestion.type} className="py-3">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-[#8e8b86]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug">{suggestion.title}</p>
          {lines.length > 0 && (
            <ul className="mt-0.5 space-y-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}
          <EvidenceQuote evidence={suggestion.evidence} renderEvidenceLink={renderEvidenceLink} />
          {effect && (
            <p
              data-suggestion-effect
              className={cn('mt-1.5 text-[12px] leading-relaxed', heavy ? 'text-warning-strong' : 'text-foreground')}
            >
              {effect}
            </p>
          )}
        </div>
      </div>
      {editing ? (
        <SuggestionEditor
          suggestion={suggestion}
          pending={accept.isPending}
          submitLabel={SUGGESTION_ACTION_LABEL[suggestion.type]}
          onCancel={() => setEditing(false)}
          onSubmit={(payload) => accept.mutate(payload, { onSuccess: () => setEditing(false) })}
        />
      ) : (
        <div className="mt-2 flex items-center gap-0.5 pl-[26px]">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={busy || needsContact}
            onClick={() => accept.mutate(undefined)}
          >
            {accept.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {SUGGESTION_ACTION_LABEL[suggestion.type]}
          </Button>
          {editable && (
            <button
              type="button"
              className={ghostAction}
              disabled={busy || needsContact}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
              고쳐서 반영
            </button>
          )}
          <button type="button" className={cn(ghostAction, 'ml-auto')} disabled={busy} onClick={() => dismiss.mutate()}>
            무시
          </button>
        </div>
      )}
      {conflictNotice}
      {needsContact && <NeedsContactNote />}
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

/**
 * 만원 입력 (빈 칸 = 없음). 전화로 들은 대로 "15억 8천"처럼 적어도 읽는다(앱 공용 규칙 parseManwon).
 * 읽은 값을 바로 아래에 되비춘다("= 15억 8,000만"). 못 읽는 글이면 값을 바꾸지 않고 그렇다고 알린다.
 */
function ManwonInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  ariaLabel: string;
}) {
  const [text, setText] = useState(() => (value == null ? '' : formatPrice(value)));
  // 바깥에서 값이 바뀌면(다른 칸에서 고침, 초기화) 적힌 글도 맞춘다. 같은 값을 다르게 적은 것은 그대로 둔다.
  useEffect(() => {
    const parsed = parseManwon(text);
    const current = parsed.valid ? parsed.value : undefined;
    if (current !== (value ?? null)) setText(value == null ? '' : formatPrice(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = parseManwon(text);
  return (
    <div className="space-y-0.5">
      <Input
        type="text"
        inputMode="text"
        aria-label={ariaLabel}
        aria-invalid={!parsed.valid || undefined}
        placeholder={MANWON_INPUT_HINT}
        className="h-8 text-[13px] tabular-nums"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const read = parseManwon(next);
          if (read.valid) onChange(read.value);
        }}
      />
      {!parsed.valid ? (
        <p className="text-[11px] text-destructive">금액을 읽을 수 없습니다. 예: 15억 8천</p>
      ) : parsed.value != null ? (
        <p className="text-[11px] tabular-nums text-muted-foreground">{formatManwonEcho(parsed.value)}</p>
      ) : null}
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
  submitLabel,
  onCancel,
  onSubmit,
}: {
  suggestion: CallActionSuggestion;
  pending: boolean;
  /** 누르면 일어나는 일 ("할 일 만들기" 등) */
  submitLabel: string;
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
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
