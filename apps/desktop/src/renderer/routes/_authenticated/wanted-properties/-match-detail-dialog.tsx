import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patchWantedMatch } from '@/queries/buyer-requirements';
import { refreshMatchData } from '@/queries/matches';
import { AlertTriangle, CalendarPlus, MessageSquarePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import {
  formatMatchPrice,
  formatRequirementSummaryFromBuyerRequirement,
  getActiveDealLink,
  getListingAddress,
  getMatchTitle,
  getPrimaryOwnerText,
  type MatchRowActions,
} from './-match-view-utils';
import { MatchProgressTrack } from './-match-board';
import { parseManwonText } from './-money-text';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { formatDate, formatDateTime, formatMoney, formatPhone } from '@/lib/format';
import { getIntakeConfirmationState } from '@/lib/listing-status';
import { getStatusMeta } from '@/lib/status-config';
import { DetailField, EntityChip, StatusBadge } from '@/components/domain';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const CONSULTATION_TYPE_OPTIONS = [
  { value: 'phone', label: '전화' },
  { value: 'visit', label: '방문' },
  { value: 'online', label: '문자·온라인' },
];

export function MatchDetailDialog({
  match,
  open,
  onOpenChange,
  actions,
}: {
  match: Match | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: MatchRowActions;
}) {
  const queryClient = useQueryClient();
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const [followUpForm, setFollowUpForm] = useState<'consultation' | 'task' | null>(null);

  useEffect(() => {
    setIsEditingMemo(false);
    setFollowUpForm(null);
    setMemoDraft(match?.memo ?? '');
  }, [match?.id]);

  const activeDeal = match ? getActiveDealLink(match) : null;
  const dealMismatch =
    match !== null &&
    normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED &&
    !activeDeal;
  const listingConfirmationState = match?.listing?.intake
    ? getIntakeConfirmationState(match.listing.intake)
    : null;

  const memoMutation = useMutation({
    mutationFn: ({ match, memo }: { match: Match; memo: string | null }) =>
      api.matches.updateMemo(match.id, {
        memo,
        expectedUpdatedAt: match.updatedAt,
      }),
    onSuccess: (updated) => {
      void refreshMatchData(queryClient, queryClient, updated.buyerReqId);
      setIsEditingMemo(false);
      toast.success('메모를 저장했습니다');
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, '메모를 저장하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {!match ? (
          // 바로 가기(?matchId=)로 열면 목록이 오기 전에 창이 먼저 뜬다
          <DialogHeader className="px-6 py-4 pr-12">
            <DialogTitle>매칭 상세</DialogTitle>
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader className="border-b border-border/60 px-6 py-4 pr-12">
              <DialogTitle className="flex items-center gap-3">
                매칭 상세
                <StatusBadge kind="matchStage" status={match.stage} />
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                {dealMismatch && (
                  <Alert variant="destructive">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>거래 전환 상태이지만 연결된 거래가 없습니다</AlertTitle>
                    <AlertDescription>
                      <div className="flex items-center gap-3">
                        <span>거래를 생성해 매칭과 연결하세요.</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => actions.onStageChange(match.id, 'dealCreated')}
                        >
                          거래 전환
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <section className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">진행 단계</h3>
                      <p className="text-xs text-muted-foreground">
                        단계를 눌러 다음 단계로 넘기거나, 건너뛰거나, 종료합니다.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <MatchProgressTrack match={match} actions={actions} />
                  </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-lg border border-border/60 bg-background p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">고객</h3>
                      {match.buyerRequirement?.contactId && (
                        <EntityChip
                          kind="contact"
                          id={match.buyerRequirement.contactId}
                          label={match.buyerRequirement.contact?.name ?? '연락처'}
                        />
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      <DetailField
                        label="이름"
                        value={match.buyerRequirement?.contact?.name ?? '미지정'}
                      />
                      <DetailField
                        label="연락처"
                        value={formatPhone(match.buyerRequirement?.contact?.phone)}
                      />
                      <DetailField
                        label="희망 조건"
                        value={
                          match.buyerRequirement
                            ? formatRequirementSummaryFromBuyerRequirement(match.buyerRequirement)
                            : '조건 미정'
                        }
                      />
                      <DetailField label="고객 메모" value={match.buyerRequirement?.memo ?? undefined} />
                    </div>
                  </section>

                  <section className="rounded-lg border border-border/60 bg-background p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">매물</h3>
                      <EntityChip
                        kind="listing"
                        id={match.listingId}
                        propertyId={match.propertyId}
                        label={getMatchTitle(match)}
                      />
                    </div>
                    <div className="mt-4 space-y-2">
                      <DetailField label="주소" value={getListingAddress(match.listing)} />
                      <DetailField label="가격">
                        <span className="tabular-nums">{formatMatchPrice(match)}</span>
                      </DetailField>
                      <DetailField label="거래유형">
                        {match.listing?.transactionType ? (
                          <StatusBadge
                            kind="transactionType"
                            status={match.listing.transactionType}
                            size="sm"
                          />
                        ) : (
                          '—'
                        )}
                      </DetailField>
                      <DetailField label="확인 상태">
                        {listingConfirmationState ? (
                          <StatusBadge
                            kind="confirmationState"
                            status={listingConfirmationState}
                            size="sm"
                          />
                        ) : (
                          '—'
                        )}
                      </DetailField>
                      <DetailField label="소유자" value={getPrimaryOwnerText(match.listing)} />
                      <DetailField label="연결한 날" value={formatDate(match.createdAt)} />
                    </div>
                  </section>
                </div>

                <AgreedTermsSection match={match} />

                {activeDeal && (
                  <section className="rounded-lg border border-border/60 bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">연결된 거래</h3>
                        <p className="text-xs text-muted-foreground">
                          이 매칭에서 전환된 거래입니다. 계약/수수료는 거래 화면에서 관리합니다.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge kind="dealStage" status={activeDeal.stage} size="sm" />
                        <EntityChip
                          kind="deal"
                          id={activeDeal.id}
                          label="거래 보기"
                          sublabel={getStatusMeta('dealStage', activeDeal.stage).label}
                        />
                      </div>
                    </div>
                  </section>
                )}

                <MatchConsultationSection
                  match={match}
                  formOpen={followUpForm === 'consultation'}
                  onToggleForm={() =>
                    setFollowUpForm((prev) => (prev === 'consultation' ? null : 'consultation'))
                  }
                />

                <MatchTaskForm
                  match={match}
                  formOpen={followUpForm === 'task'}
                  onToggleForm={() => setFollowUpForm((prev) => (prev === 'task' ? null : 'task'))}
                />

                <section className="rounded-lg border border-border/60 bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">매칭 메모</h3>
                      <p className="text-xs text-muted-foreground">
                        이 매물과 고객 사이의 진행 메모입니다.
                      </p>
                    </div>

                    {isEditingMemo ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setIsEditingMemo(false);
                            setMemoDraft(match.memo ?? '');
                          }}
                          disabled={memoMutation.isPending}
                        >
                          취소
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          onClick={() =>
                            memoMutation.mutate({
                              match,
                              memo: memoDraft.trim() || null,
                            })
                          }
                          disabled={memoMutation.isPending}
                        >
                          저장
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" size="xs" variant="outline" onClick={() => setIsEditingMemo(true)}>
                        메모 수정
                      </Button>
                    )}
                  </div>

                  {isEditingMemo ? (
                    <Textarea
                      className="mt-4 min-h-28"
                      placeholder="매칭 메모를 입력하세요"
                      value={memoDraft}
                      onChange={(event) => setMemoDraft(event.target.value)}
                    />
                  ) : (
                    <div className="mt-4 rounded-md bg-muted/30 px-3 py-3 text-sm leading-6 text-muted-foreground">
                      {match.memo?.trim() ? match.memo : '등록된 메모가 없습니다.'}
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-background px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => actions.onRequestDelete(match.id)}
                disabled={activeDeal !== null}
                title={activeDeal ? '거래와 연결된 매칭은 삭제 대신 종료를 권장합니다' : undefined}
              >
                <Trash2 className="size-4" />
                삭제
              </Button>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  닫기
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── 합의 조건 섹션 ───────────────────────────────────────────────────────────
// 협상하며 손님 · 집주인과 맞춘 금액과 입주일을 적어 둔다. 협상은 여러 날 걸리고 담당자가 바뀔 수 있다.
// 거래로 전환할 때 이 값이 거래의 합의 조건으로 넘어가고, 그 뒤에는 거래관리에서 고친다(서버도 막는다).

function toAmountText(value: number | null | undefined) {
  return value == null ? '' : String(value);
}

function AgreedTermsSection({ match }: { match: Match }) {
  const queryClient = useQueryClient();
  const isMonthly = match.listing?.transactionType === 'monthly';
  const isConverted = normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED;
  const savedMoveIn = match.agreedMoveInDate ? match.agreedMoveInDate.slice(0, 10) : '';
  const [price, setPrice] = useState(toAmountText(match.agreedPrice));
  const [deposit, setDeposit] = useState(toAmountText(match.agreedDeposit));
  const [rent, setRent] = useState(toAmountText(match.agreedMonthlyRent));
  const [moveIn, setMoveIn] = useState(savedMoveIn);

  // 다른 매칭을 열거나 저장한 값이 오면 입력을 저장된 값으로 맞춘다
  useEffect(() => {
    setPrice(toAmountText(match.agreedPrice));
    setDeposit(toAmountText(match.agreedDeposit));
    setRent(toAmountText(match.agreedMonthlyRent));
    setMoveIn(match.agreedMoveInDate ? match.agreedMoveInDate.slice(0, 10) : '');
  }, [match.id, match.agreedPrice, match.agreedDeposit, match.agreedMonthlyRent, match.agreedMoveInDate]);

  const fields = isMonthly
    ? ([
        ['agreedDeposit', '합의 보증금', deposit, setDeposit, match.agreedDeposit],
        ['agreedMonthlyRent', '합의 월세', rent, setRent, match.agreedMonthlyRent],
      ] as const)
    : ([['agreedPrice', '합의 가격', price, setPrice, match.agreedPrice]] as const);
  const parsed = fields.map(([key, , text, , saved]) => ({
    key,
    value: parseManwonText(text),
    saved,
  }));
  const invalid = parsed.some((field) => Number.isNaN(field.value ?? 0));
  const dirty =
    parsed.some((field) => (field.value ?? null) !== (field.saved ?? null)) ||
    moveIn !== savedMoveIn;

  const saveMutation = useMutation({
    mutationFn: () =>
      api.matches.updateAgreedTerms(match.id, {
        ...Object.fromEntries(parsed.map((field) => [field.key, field.value])),
        agreedMoveInDate: moveIn || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Match[]>(['matches'], (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)),
      );
      // 희망매물 목록은 손님 줄 안에 매칭을 싣는다. 고친 칸만 덮어 곧장 바뀌게 한다
      patchWantedMatch(queryClient, updated.id, {
        agreedPrice: updated.agreedPrice,
        agreedDeposit: updated.agreedDeposit,
        agreedMonthlyRent: updated.agreedMonthlyRent,
        agreedMoveInDate: updated.agreedMoveInDate,
        updatedAt: updated.updatedAt,
      });
      void refreshMatchData(queryClient, queryClient, updated.buyerReqId);
      toast.success('합의 조건을 저장했습니다');
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, '합의 조건을 저장하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  if (isConverted) {
    const summary = isMonthly
      ? [
          match.agreedDeposit != null ? `보증금 ${formatMoney(match.agreedDeposit)}` : null,
          match.agreedMonthlyRent != null ? `월세 ${formatMoney(match.agreedMonthlyRent)}` : null,
        ]
      : [match.agreedPrice != null ? formatMoney(match.agreedPrice) : null];
    const text = [...summary, savedMoveIn ? `입주 ${formatDate(match.agreedMoveInDate)}` : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <section className="rounded-lg border border-border/60 bg-background p-4">
        <h3 className="text-sm font-semibold">합의 조건</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          거래로 전환한 뒤에는 거래관리에서 고칩니다. 아래는 전환할 때의 값입니다.
        </p>
        <p className="mt-3 text-sm tabular-nums">{text || '적어 둔 합의 조건이 없습니다.'}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">합의 조건</h3>
          <p className="text-xs text-muted-foreground">
            협상하며 맞춘 금액과 입주일을 적어 둡니다. 거래로 전환할 때 그대로 넘어갑니다.
          </p>
        </div>
        <Button
          type="button"
          size="xs"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || invalid || saveMutation.isPending}
        >
          {saveMutation.isPending ? '저장 중…' : '저장'}
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label, text, setText]) => {
          const value = parseManwonText(text);
          return (
            <label key={key} className="space-y-1 text-xs text-muted-foreground">
              <span>{label}</span>
              <div className="relative">
                <Input
                  value={text}
                  placeholder="예: 9억 5000"
                  aria-invalid={Number.isNaN(value ?? 0) || undefined}
                  onChange={(event) => setText(event.target.value)}
                  className="h-8 pr-10 text-sm tabular-nums text-foreground"
                />
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs">
                  만원
                </span>
              </div>
              <span
                className={
                  value !== null && Number.isNaN(value)
                    ? 'block text-[11px] text-destructive'
                    : 'block h-4 text-[11px] tabular-nums text-info'
                }
              >
                {value === null
                  ? ''
                  : Number.isNaN(value)
                    ? '금액을 읽을 수 없습니다. 예: 9억 5000 또는 95000'
                    : formatMoney(value)}
              </span>
            </label>
          );
        })}
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>합의 입주일</span>
          <Input
            type="date"
            value={moveIn}
            onChange={(event) => setMoveIn(event.target.value)}
            className="h-8 text-sm tabular-nums text-foreground"
          />
        </label>
      </div>
    </section>
  );
}

// ── 상담 기록 섹션 ───────────────────────────────────────────────────────────

function MatchConsultationSection({
  match,
  formOpen,
  onToggleForm,
}: {
  match: Match;
  formOpen: boolean;
  onToggleForm: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState('phone');
  const [content, setContent] = useState('');
  const contactId = match.buyerRequirement?.contactId;

  const consultationsQuery = useQuery({
    queryKey: ['consultations', { matchId: match.id }],
    queryFn: () => api.consultations.findAll({ matchId: match.id, limit: 5 }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.consultations.create({
        contactId: contactId!,
        type,
        content: content.trim(),
        matchId: match.id,
        listingId: match.listingId,
        propertyId: match.propertyId,
        buyerReqId: match.buyerReqId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      setContent('');
      onToggleForm();
      toast.success('상담 기록을 등록했습니다');
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, '상담을 저장하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const consultations = consultationsQuery.data?.items ?? [];

  return (
    <section className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">상담 기록</h3>
          <p className="text-xs text-muted-foreground">이 매칭에 연결된 최근 상담 기록입니다.</p>
        </div>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={onToggleForm}
          disabled={!contactId}
          title={!contactId ? '고객 연락처가 없어 상담을 기록할 수 없습니다' : undefined}
        >
          <MessageSquarePlus className="size-3.5" />
          상담 적기
        </Button>
      </div>

      {formOpen && contactId && (
        <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSULTATION_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {match.buyerRequirement?.contact?.name ?? '고객'}님과의 상담으로 기록됩니다
            </span>
          </div>
          <Textarea
            placeholder="상담 내용을 입력하세요"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-20"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="xs" variant="outline" onClick={onToggleForm}>
              취소
            </Button>
            <Button
              type="button"
              size="xs"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || content.trim().length === 0}
            >
              등록
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {consultationsQuery.isLoading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : consultationsQuery.isError ? (
          <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span>상담 기록을 불러오지 못했습니다.</span>
            <Button type="button" size="xs" variant="outline" onClick={() => consultationsQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : consultations.length === 0 ? (
          <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            연결된 상담 기록이 없습니다.
          </p>
        ) : (
          consultations.map((consultation) => (
            <div key={consultation.id} className="rounded-md border border-border/50 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {CONSULTATION_TYPE_OPTIONS.find((option) => option.value === consultation.type)
                    ?.label ?? consultation.type}
                  {consultation.createdBy?.name ? ` · ${consultation.createdBy.name}` : ''}
                </span>
                <span>{formatDateTime(consultation.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-5">{consultation.content}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ── 후속 태스크 섹션 ─────────────────────────────────────────────────────────

function MatchTaskForm({
  match,
  formOpen,
  onToggleForm,
}: {
  match: Match;
  formOpen: boolean;
  onToggleForm: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      api.tasks.create({
        title: title.trim(),
        source: 'manual',
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        matchId: match.id,
        listingId: match.listingId,
        propertyId: match.propertyId,
        buyerReqId: match.buyerReqId,
        contactId: match.buyerRequirement?.contactId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTitle('');
      setDueDate('');
      onToggleForm();
      toast.success('업무를 추가했습니다');
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, '업무를 만들지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  return (
    <section className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">다음 업무</h3>
          <p className="text-xs text-muted-foreground">
            임장 확인, 서류 준비처럼 이어서 할 일을 업무로 남깁니다.
          </p>
        </div>
        <Button type="button" size="xs" variant="outline" onClick={onToggleForm}>
          <CalendarPlus className="size-3.5" />
          업무 추가
        </Button>
      </div>

      {formOpen && (
        <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <Input
            placeholder="할 일 제목 (예: 등기부 확인 후 고객 연락)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="match-task-due">
              마감일
            </label>
            <Input
              id="match-task-due"
              type="date"
              className="h-8 w-40"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="xs" variant="outline" onClick={onToggleForm}>
              취소
            </Button>
            <Button
              type="button"
              size="xs"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || title.trim().length === 0}
            >
              생성
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
