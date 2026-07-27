import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lock, MoreHorizontal, PhoneCall, Trash2, XCircle } from 'lucide-react';
import type { IntakeRowSummary } from './-property-list-view-utils';
import { invalidateListingDerivedCaches } from '@/lib/listing-cache';
import {
  IntakeCheckResult,
  IntakeClosedReason,
  IntakeLifecycleStatus,
  MAINTENANCE_FEE_INCLUDE_LABELS,
} from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getIntakeConfirmationState } from '@/lib/listing-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog, StatusBadge } from '@/components/domain';
import { getStatusMeta } from '@/lib/status-config';
import { formatDday, formatMoney } from '@/lib/format';
import { formatDateShort } from '@/components/quick-sheet';
import {
  isIntakeOverdue,
  type ListingSummary,
  type PropertyListingGroup,
} from './-property-list-view-utils';

// ── 공통 invalidate ──────────────────────────────────────────────

function useInvalidatePropertyLists() {
  const queryClient = useQueryClient();
  return () => invalidateListingDerivedCaches(queryClient);
}

// ── 의뢰 다음확인 셀 ────────────────────────────────────────────

export function IntakeNextConfirmCell({ intake }: { intake: IntakeRowSummary | null }) {
  if (!intake) {
    return <span className="px-0.5 text-[12px] text-slate-400">—</span>;
  }

  const overdue = isIntakeOverdue(intake);

  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      <div className="flex min-w-0 items-center gap-1">
        <StatusBadge
          kind="intakeLifecycle"
          status={intake.lifecycleStatus}
          size="sm"
        />
        <StatusBadge
          kind="confirmationState"
          status={getIntakeConfirmationState(intake)}
          size="sm"
        />
        {overdue && intake.nextConfirmAt && (
          <span className="shrink-0 text-[11px] font-semibold text-destructive">
            {formatDday(intake.nextConfirmAt)} 경과
          </span>
        )}
      </div>
      <span
        className={cn(
          'truncate text-[11px]',
          overdue ? 'font-medium text-destructive' : 'text-slate-500',
        )}
      >
        다음 {intake.nextConfirmAt ? formatDateShort(intake.nextConfirmAt) : '미정'}
        {' · '}접수 {formatDateShort(intake.receivedAt)}
      </span>
    </div>
  );
}

// ── 확인 기록 다이얼로그 ────────────────────────────────────────

const CONFIRM_RESULTS = [
  {
    value: 'alive',
    label: '확인 완료 (이상 없음)',
    description: '매물이 유효하고 조건 변동이 없습니다.',
  },
  {
    value: 'price_changed',
    label: '가격 변경됨',
    description: '확인 후 매물 가격을 함께 수정하세요.',
  },
  {
    value: 'no_answer',
    label: '연락 안 됨',
    description: '소유주와 연락이 닿지 않았습니다.',
  },
  {
    value: 'unavailable',
    label: '거래 불가 / 매물 없어짐',
    description: '저장하면 의뢰가 자동으로 종결 처리됩니다.',
  },
] as const;

const CONFIRM_CHANNELS = [
  { value: 'phone', label: '전화' },
  { value: 'sms', label: '문자' },
  { value: 'visit', label: '방문' },
  { value: 'owner_message', label: '소유주 먼저 연락' },
  { value: 'note', label: '기타 메모' },
] as const;

export function IntakeConfirmDialog({
  intake,
  open,
  onOpenChange,
}: {
  intake: IntakeRowSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invalidate = useInvalidatePropertyLists();
  const [result, setResult] = useState<IntakeCheckResult>(
    IntakeCheckResult.ALIVE,
  );
  const [channel, setChannel] = useState<string>('phone');
  const [memo, setMemo] = useState('');
  const [nextConfirmAt, setNextConfirmAt] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.listingIntakes.confirm(intake.id, {
        result,
        channel,
        memo: memo.trim() || undefined,
        nextConfirmAt: nextConfirmAt || undefined,
      }),
    onSuccess: () => {
      toast.success('확인 기록을 저장했습니다.');
      invalidate();
      onOpenChange(false);
      setResult(IntakeCheckResult.ALIVE);
      setChannel('phone');
      setMemo('');
      setNextConfirmAt('');
    },
    onError: (error: Error) => {
      toast.error(error.message || '확인 기록 저장에 실패했습니다.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>의뢰 확인 기록</DialogTitle>
          <DialogDescription>
            마지막 유효 확인 {intake.lastVerifiedAt ? formatDateShort(intake.lastVerifiedAt) : '없음'} · 다음
            확인 예정 {intake.nextConfirmAt ? formatDateShort(intake.nextConfirmAt) : '미정'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">확인 결과 *</Label>
            <RadioGroup
              value={result}
              onValueChange={(value) =>
                setResult(value as IntakeCheckResult)
              }
              className="gap-1.5"
            >
              {CONFIRM_RESULTS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors',
                    result === option.value
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  <RadioGroupItem value={option.value} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">확인 방법</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIRM_CHANNELS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">다음 확인일</Label>
              <Input
                type="date"
                value={nextConfirmAt}
                onChange={(event) => setNextConfirmAt(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">비워두면 결과에 따라 자동 설정</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">메모</Label>
            <Textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              rows={2}
              placeholder="예) 집주인 통화 — 7월 초 이사 예정 확인"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '저장 중...' : '확인 기록 저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 행 액션 메뉴 (확인 기록 / 의뢰 종결 / 삭제) ────────────────

export function PropertyRowActions({
  listings,
  intake,
}: {
  listings: ListingSummary[];
  intake: IntakeRowSummary | null;
}) {
  const invalidate = useInvalidatePropertyLists();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ListingSummary | null>(null);

  const closeMutation = useMutation({
    mutationFn: (intakeId: string) =>
      api.listingIntakes.updateLifecycleStatus(
        intakeId,
        IntakeLifecycleStatus.CLOSED,
        { closedReason: IntakeClosedReason.WITHDRAWN },
      ),
    onSuccess: () => {
      toast.success('의뢰를 종결 처리했습니다.');
      invalidate();
      setCloseOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || '의뢰 종결 처리에 실패했습니다.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (listingId: string) => api.listings.remove(listingId),
    onSuccess: () => {
      toast.success('매물을 삭제했습니다.');
      invalidate();
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || '매물 삭제에 실패했습니다.');
    },
  });

  const transactionLabel = (transactionType: string) =>
    getStatusMeta('transactionType', transactionType).label;

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="행 작업 메뉴">
            <MoreHorizontal className="size-4 text-slate-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {intake && (
            <>
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                의뢰 (접수 {formatDateShort(intake.receivedAt)})
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
                <PhoneCall className="size-3.5" />
                확인 기록...
              </DropdownMenuItem>
              {intake.lifecycleStatus !== IntakeLifecycleStatus.CLOSED && (
                <DropdownMenuItem onSelect={() => setCloseOpen(true)}>
                  <XCircle className="size-3.5" />
                  의뢰 종결 처리...
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel className="text-[11px] text-muted-foreground">
            거래별 작업
          </DropdownMenuLabel>
          {listings.map((listing) => (
            <DropdownMenuItem
              key={`delete-${listing.id}`}
              variant="destructive"
              onSelect={() => setDeleteTarget(listing)}
            >
              <Trash2 className="size-3.5" />
              {transactionLabel(listing.transactionType)} 매물 삭제...
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {intake && (
        <IntakeConfirmDialog intake={intake} open={confirmOpen} onOpenChange={setConfirmOpen} />
      )}

      {intake && (
        <ConfirmDialog
          open={closeOpen}
          onOpenChange={setCloseOpen}
          title="의뢰 종결 처리"
          description="이 호실의 의뢰를 종결 상태로 변경합니다. 연결된 거래 카드는 삭제되지 않습니다."
          confirmLabel="종결 처리"
          destructive
          loading={closeMutation.isPending}
          onConfirm={() => closeMutation.mutate(intake.id)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
        title="매물 삭제"
        description={
          deleteTarget
            ? `${transactionLabel(deleteTarget.transactionType)} 매물을 삭제합니다. 가격 이력·광고 기록도 함께 삭제되며 되돌릴 수 없습니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

// ── 일괄 작업 바 (선택 행) ──────────────────────────────────────

const BULK_LIFECYCLE_VALUES = [
  IntakeLifecycleStatus.OPEN,
  IntakeLifecycleStatus.HOLD,
  IntakeLifecycleStatus.CLOSED,
] as const;

export function PropertyBulkActions({ groups }: { groups: PropertyListingGroup[] }) {
  const invalidate = useInvalidatePropertyLists();
  const [statusValue, setStatusValue] = useState<IntakeLifecycleStatus | ''>('');

  const listingIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((group) => group.listings.forEach((listing) => ids.add(listing.id)));
    return Array.from(ids);
  }, [groups]);

  // 생명주기는 의뢰 단위 — 확인 이력과 거래 상태는 이 작업으로 변경하지 않는다.
  const intakeIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((group) =>
      group.listings.forEach((listing) => ids.add(listing.intakeId)),
    );
    return Array.from(ids);
  }, [groups]);

  const bulkStatusMutation = useMutation({
    mutationFn: async (status: IntakeLifecycleStatus) => {
      const results = await Promise.allSettled(
        intakeIds.map((id) =>
          api.listingIntakes.updateLifecycleStatus(id, status, {
            closedReason:
              status === IntakeLifecycleStatus.CLOSED
                ? IntakeClosedReason.WITHDRAWN
                : null,
          }),
        ),
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      return { failed, total: results.length };
    },
    onSuccess: ({ failed, total }) => {
      if (failed > 0) {
        toast.error(
          `${total - failed}건 변경, ${failed}건 실패했습니다. (허용되지 않는 상태 전환 포함)`,
        );
      } else {
        toast.success(`의뢰 ${total}건의 생명주기를 변경했습니다.`);
      }
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || '일괄 상태 변경에 실패했습니다.');
    },
    onSettled: () => setStatusValue(''),
  });

  const busy = bulkStatusMutation.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground">거래 {listingIds.length}건 대상</span>
      <Select
        value={statusValue || undefined}
        onValueChange={(value) => {
          setStatusValue(value as IntakeLifecycleStatus);
          bulkStatusMutation.mutate(value as IntakeLifecycleStatus);
        }}
        disabled={busy}
      >
        <SelectTrigger size="sm" className="h-7 w-40 bg-white text-xs">
          <SelectValue placeholder="의뢰상태 일괄 변경" />
        </SelectTrigger>
        <SelectContent>
          {BULK_LIFECYCLE_VALUES.map((value) => (
            <SelectItem key={value} value={value} className="text-xs">
              {getStatusMeta('intakeLifecycle', value).label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── 비용 요약 (관리비/융자/권리금/내부메모) — 시트 거래 카드용 ──

export interface ListingCostExtras {
  maintenanceFee?: number | null;
  maintenanceFeeIncludes?: string[];
  loanAmount?: number | null;
  premium?: number | null;
  privateMemo?: string | null;
}

export function ListingCostSummary({ listing }: { listing: ListingCostExtras }) {
  const includeLabels = (listing.maintenanceFeeIncludes ?? [])
    .map((slug) => (MAINTENANCE_FEE_INCLUDE_LABELS as Record<string, string>)[slug] ?? slug)
    .join('·');

  const costItems = [
    listing.maintenanceFee
      ? `관리비 ${formatMoney(listing.maintenanceFee)}${includeLabels ? ` (${includeLabels} 포함)` : ''}`
      : null,
    listing.loanAmount ? `융자 ${formatMoney(listing.loanAmount)}` : null,
    listing.premium ? `권리금 ${formatMoney(listing.premium)}` : null,
  ].filter((item): item is string => Boolean(item));

  const privateMemo = listing.privateMemo?.trim();

  if (costItems.length === 0 && !privateMemo) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {costItems.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
          {costItems.map((item) => (
            <span key={item} className="tabular-nums">
              {item}
            </span>
          ))}
        </div>
      )}
      {privateMemo && (
        <p className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-[12px] leading-5 text-muted-foreground">
          <Lock className="mt-0.5 size-3 shrink-0" />
          <span className="min-w-0">
            <span className="mr-1 font-medium text-foreground/70">내부 전용</span>
            {privateMemo}
          </span>
        </p>
      )}
    </div>
  );
}
