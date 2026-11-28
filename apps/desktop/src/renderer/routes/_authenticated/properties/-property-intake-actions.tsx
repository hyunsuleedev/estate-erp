import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, MoreVertical, PhoneCall, Trash2 } from 'lucide-react';
import type { ListingIntake } from '@estate-erp/api-client';
import {
  IntakeLifecycleStatus,
  MAINTENANCE_FEE_INCLUDE_LABELS,
} from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
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
import { ConfirmDialog } from '@/components/domain';
import { getStatusMeta } from '@/lib/status-config';
import { formatMoney } from '@/lib/format';
import { formatDateShort } from '@/components/quick-sheet';
import { propertyErrorMessage } from './-error-message';
import { canDeleteListing } from './-property-permissions';
import { useAuth } from '@/providers/auth-provider';

// (desktop) 웹의 ListingSummary/PropertyListingGroup 대신 최소 구조 타입 사용 —
// 데스크톱의 의뢰(ListingIntake) 중심 그룹 모델과 웹의 매물(Listing) 중심 모델
// 양쪽에서 그대로 쓸 수 있도록 필요한 필드만 요구한다.
export interface RowActionListing {
  id: string;
  transactionType: string;
}

export interface BulkActionGroup {
  listings: Array<{ id: string; intakeId: string }>;
}

// ── 공통 invalidate ──────────────────────────────────────────────

// 매칭(매물 쪽 패널·희망매물)도 의뢰의 확인·상태를 보고 거래 전환을 막거나 풀므로 함께 다시 읽는다
const RELATED_QUERY_KEYS = [
  ['listings'],
  ['listing-intakes'],
  ['properties'],
  ['matches'],
  ['buyer-requirements'],
] as const;

function useInvalidatePropertyLists() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of RELATED_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey: [...key] });
    }
  };
}

// ── 확인 기록 다이얼로그 ────────────────────────────────────────

const CONFIRM_CHANNELS = [
  { value: 'phone', label: '전화' },
  { value: 'sms', label: '문자' },
  { value: 'visit', label: '방문' },
  { value: 'owner_message', label: '소유자 먼저 연락' },
  { value: 'note', label: '기타 메모' },
] as const;

export function IntakeConfirmDialog({
  intake,
  open,
  onOpenChange,
  onSaved,
}: {
  intake: ListingIntake;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 저장한 뒤(창이 닫힌 뒤) 부른다 */
  onSaved?: () => void;
}) {
  const invalidate = useInvalidatePropertyLists();
  const [channel, setChannel] = useState<string>('phone');
  const [memo, setMemo] = useState('');
  const [nextConfirmAt, setNextConfirmAt] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.listingIntakes.confirm(intake.id, {
        channel,
        memo: memo.trim() || undefined,
        nextConfirmAt: nextConfirmAt || undefined,
      }),
    onSuccess: () => {
      toast.success('확인 기록을 저장했습니다.');
      invalidate();
      onOpenChange(false);
      onSaved?.();
      setChannel('phone');
      setMemo('');
      setNextConfirmAt('');
    },
    onError: (error: Error) => {
      toast.error(propertyErrorMessage(error, '확인 기록을 저장하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>매물 확인 기록</DialogTitle>
          <DialogDescription>
            마지막 유효 확인{' '}
            {intake.lastVerifiedAt ? formatDateShort(intake.lastVerifiedAt) : '없음'} ·
            다음 확인 예정{' '}
            {intake.nextConfirmAt ? formatDateShort(intake.nextConfirmAt) : '미정'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
              <p className="text-[11px] text-muted-foreground">비워두면 7일 뒤</p>
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
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
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
  triggerLabel = '행 작업 메뉴',
  onOpenInNewWindow,
  isOpeningNewWindow = false,
  onIntakeRemoved,
}: {
  listings: RowActionListing[];
  intake: ListingIntake | null;
  /** 메뉴 버튼의 접근성 이름. 상세 패널에서는 "매물 작업 메뉴"로 쓴다. */
  triggerLabel?: string;
  onOpenInNewWindow?: () => void;
  isOpeningNewWindow?: boolean;
  /** 마지막 거래 조건을 지워 의뢰가 함께 지워졌을 때(패널을 닫는다) */
  onIntakeRemoved?: () => void;
}) {
  const invalidate = useInvalidatePropertyLists();
  // 지우기는 대표·매니저만(서버도 같은 기준으로 막는다). 직원에게는 메뉴를 보이지 않는다.
  const mayDelete = canDeleteListing(useAuth().user?.role);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RowActionListing | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (listingId: string) => api.listings.remove(listingId),
    onSuccess: (result) => {
      toast.success(result?.intakeRemoved ? '매물을 삭제했습니다.' : '거래 조건을 삭제했습니다.');
      setDeleteTarget(null);
      if (result?.intakeRemoved && onIntakeRemoved) {
        // 패널을 먼저 닫고 목록을 다시 받는다 — 사라진 의뢰를 패널이 다시 부르지 않게
        onIntakeRemoved();
        window.setTimeout(invalidate, 0);
      } else {
        invalidate();
      }
    },
    onError: (error: Error) => {
      toast.error(propertyErrorMessage(error, '삭제하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const transactionLabel = (transactionType: string) =>
    getStatusMeta('transactionType', transactionType).label;

  return (
    <div className="flex items-center justify-center" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={triggerLabel}>
            <MoreVertical className="size-4 text-slate-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {onOpenInNewWindow && (
            <>
              <DropdownMenuItem onSelect={onOpenInNewWindow} disabled={isOpeningNewWindow}>
                <ExternalLink className="size-3.5" />
                새 창으로 열기
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {intake && (
            <>
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                의뢰 (접수 {formatDateShort(intake.receivedAt)})
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
                <PhoneCall className="size-3.5" />
                확인 기록...
              </DropdownMenuItem>
              {mayDelete && <DropdownMenuSeparator />}
            </>
          )}
          {mayDelete && listings.length > 0 && (
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              거래별 작업
            </DropdownMenuLabel>
          )}
          {mayDelete && listings.map((listing) => (
            <DropdownMenuItem
              key={`delete-${listing.id}`}
              variant="destructive"
              onSelect={() => setDeleteTarget(listing)}
            >
              <Trash2 className="size-3.5" />
              {listings.length <= 1 ? '매물 삭제…' : `${transactionLabel(listing.transactionType)} 조건 삭제…`}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {intake && (
        <IntakeConfirmDialog intake={intake} open={confirmOpen} onOpenChange={setConfirmOpen} />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
        title={listings.length <= 1 ? '매물 삭제' : '거래 조건 삭제'}
        description={
          deleteTarget
            ? listings.length <= 1
              ? `${transactionLabel(deleteTarget.transactionType)} 조건이 이 매물의 마지막 거래 조건이라 매물이 목록에서 사라집니다. 가격 이력과 접수일·확인 이력도 함께 사라지며 되돌릴 수 없습니다(연락처·상담 기록은 남습니다). 거래가 끝난 것이면 지우지 말고 의뢰 종료를 쓰세요.`
              : `${transactionLabel(deleteTarget.transactionType)} 조건만 삭제합니다. 가격 이력도 함께 지워지며 되돌릴 수 없습니다.`
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
] as const;

export function PropertyBulkActions({ groups }: { groups: BulkActionGroup[] }) {
  const invalidate = useInvalidatePropertyLists();
  const [statusValue, setStatusValue] = useState<IntakeLifecycleStatus | ''>('');

  const listingIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((group) => group.listings.forEach((listing) => ids.add(listing.id)));
    return Array.from(ids);
  }, [groups]);

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
            closedReason: null,
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
        toast.success(`매물 ${total}건의 상태를 바꿨습니다.`);
      }
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(propertyErrorMessage(error, '상태를 바꾸지 못했습니다. 다시 시도해 주세요.'));
    },
    onSettled: () => setStatusValue(''),
  });

  const busy = bulkStatusMutation.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground">매물 {groups.length}건 선택</span>
      <Select
        value={statusValue || undefined}
        onValueChange={(value) => {
          setStatusValue(value as IntakeLifecycleStatus);
          bulkStatusMutation.mutate(value as IntakeLifecycleStatus);
        }}
        disabled={busy}
      >
        <SelectTrigger size="sm" className="h-7 w-40 bg-white text-xs">
          <SelectValue placeholder="상태 한꺼번에 바꾸기" />
        </SelectTrigger>
        <SelectContent>
          {BULK_LIFECYCLE_VALUES.map((value) => (
            <SelectItem key={value} value={value} className="text-xs">
              {/* 목록의 매물상태 낱말과 같게(활성 · 보류) */}
              {value === IntakeLifecycleStatus.OPEN ? '활성' : getStatusMeta('intakeLifecycle', value).label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── 비용 요약 (관리비/융자/권리금) — 시트 거래 카드용 ──

export interface ListingCostExtras {
  maintenanceFee?: number | null;
  maintenanceFeeIncludes?: string[];
  loanAmount?: number | null;
  premium?: number | null;
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

  if (costItems.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
        {costItems.map((item) => (
          <span key={item} className="tabular-nums">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
