import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { api } from '@/lib/api';
import { formatDate, formatDateTime, formatPhone } from '@/lib/format';
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
  { value: 'online', label: '온라인' },
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
    mutationFn: ({ id, stage, memo }: { id: string; stage: string; memo: string | null }) =>
      api.matches.updateStage(id, { stage, memo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      setIsEditingMemo(false);
      toast.success('메모를 저장했습니다');
    },
    onError: (error: Error) => {
      toast.error(`메모 저장에 실패했습니다: ${error.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {!match ? null : (
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
                          거래 생성
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
                        현재 단계에서 다음 단계 이동 또는 종료를 처리할 수 있습니다.
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
                      <h3 className="text-sm font-semibold">구매자 정보</h3>
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
                      <DetailField label="요건 메모" value={match.buyerRequirement?.memo ?? undefined} />
                    </div>
                  </section>

                  <section className="rounded-lg border border-border/60 bg-background p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">매물 정보</h3>
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
                      <DetailField label="확인상태">
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
                      <DetailField label="등록일" value={formatDate(match.createdAt)} />
                    </div>
                  </section>
                </div>

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
                        현재 모델에서는 공용 메모 한 개만 저장됩니다.
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
                              id: match.id,
                              stage: match.stage,
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
      toast.error(`상담 기록 등록에 실패했습니다: ${error.message}`);
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
          title={!contactId ? '구매자 연락처가 없어 상담을 기록할 수 없습니다' : undefined}
        >
          <MessageSquarePlus className="size-3.5" />
          상담 기록 추가
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
              {match.buyerRequirement?.contact?.name ?? '구매자'}와의 상담으로 기록됩니다
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
              재시도
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
      toast.success('후속 태스크를 생성했습니다');
    },
    onError: (error: Error) => {
      toast.error(`태스크 생성에 실패했습니다: ${error.message}`);
    },
  });

  return (
    <section className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">후속 태스크</h3>
          <p className="text-xs text-muted-foreground">
            방문 확인, 서류 준비 등 후속 업무를 태스크로 남깁니다.
          </p>
        </div>
        <Button type="button" size="xs" variant="outline" onClick={onToggleForm}>
          <CalendarPlus className="size-3.5" />
          태스크 추가
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
