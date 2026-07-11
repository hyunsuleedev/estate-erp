import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import type { Match } from '@estate-erp/api-client';
import {
  formatMatchPrice,
  getActiveDealLink,
  getMatchTitle,
  getPrimaryOwnerContact,
} from './-match-view-utils';
import { api } from '@/lib/api';
import { getStatusMeta } from '@/lib/status-config';
import { DetailField, StatusBadge } from '@/components/domain';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

function parseManwon(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * 거래 전환 다이얼로그 — dealCreated 진입 시 Deal을 실제로 생성한다.
 * 이미 연결된 거래가 있으면 단계만 변경한다.
 */
export function MatchConvertDialog({
  match,
  open,
  onOpenChange,
}: {
  match: Match | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [priceInput, setPriceInput] = useState('');
  const [depositInput, setDepositInput] = useState('');
  const [monthlyRentInput, setMonthlyRentInput] = useState('');

  const listing = match?.listing ?? null;
  const transactionType = listing?.transactionType ?? null;
  const isMonthly = transactionType === 'monthly';
  const activeDeal = match ? getActiveDealLink(match) : null;

  useEffect(() => {
    if (!match) {
      return;
    }
    const listingForMatch = match.listing;
    setPriceInput(
      listingForMatch?.price != null
        ? String(listingForMatch.price)
        : listingForMatch?.deposit != null && listingForMatch.transactionType !== 'monthly'
          ? String(listingForMatch.deposit)
          : '',
    );
    setDepositInput(listingForMatch?.deposit != null ? String(listingForMatch.deposit) : '');
    setMonthlyRentInput(
      listingForMatch?.monthlyRent != null ? String(listingForMatch.monthlyRent) : '',
    );
  }, [match?.id]);

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!match) {
        return;
      }

      if (!activeDeal) {
        await api.deals.create({
          listingId: match.listingId,
          propertyId: match.propertyId,
          matchId: match.id,
          transactionType: transactionType ?? undefined,
          agreedPrice: isMonthly ? undefined : parseManwon(priceInput),
          agreedDeposit: isMonthly ? parseManwon(depositInput) : undefined,
          agreedMonthlyRent: isMonthly ? parseManwon(monthlyRentInput) : undefined,
          buyerContactId: match.buyerRequirement?.contactId,
          sellerContactId: getPrimaryOwnerContact(match.listing)?.id,
        });
      }

      await api.matches.updateStage(match.id, { stage: 'dealCreated' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      onOpenChange(false);
      toast.success(activeDeal ? '거래 전환 단계로 변경했습니다' : '거래가 생성되었습니다', {
        action: {
          label: '거래 보기',
          onClick: () => navigate({ to: '/deals' }),
        },
      });
    },
    onError: (error: Error) => {
      toast.error(`거래 전환에 실패했습니다: ${error.message}`);
    },
  });

  const typeLabel = transactionType
    ? getStatusMeta('transactionType', transactionType).label
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {!match ? null : (
          <>
            <DialogHeader>
              <DialogTitle>거래 전환</DialogTitle>
              <DialogDescription>
                {activeDeal
                  ? '이미 연결된 거래가 있어 매칭 단계만 거래 전환으로 변경합니다.'
                  : '매칭을 거래 전환하면 거래(Deal)가 함께 생성되어 계약/수수료 관리로 이어집니다.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
              <DetailField label="고객" value={match.buyerRequirement?.contact?.name ?? '미지정'} />
              <DetailField label="매물" value={getMatchTitle(match)} />
              <DetailField label="거래유형">
                {transactionType ? (
                  <StatusBadge kind="transactionType" status={transactionType} size="sm" />
                ) : (
                  '—'
                )}
              </DetailField>
              <DetailField label="매물 가격">
                <span className="tabular-nums">{formatMatchPrice(match)}</span>
              </DetailField>
              {activeDeal && (
                <DetailField label="연결 거래">
                  <StatusBadge kind="dealStage" status={activeDeal.stage} size="sm" />
                </DetailField>
              )}
            </div>

            {!activeDeal && (
              <div className="space-y-3">
                {isMonthly ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      <span>합의 보증금 (만원)</span>
                      <Input
                        inputMode="numeric"
                        value={depositInput}
                        onChange={(event) => setDepositInput(event.target.value)}
                        placeholder="예: 10000"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      <span>합의 월세 (만원)</span>
                      <Input
                        inputMode="numeric"
                        value={monthlyRentInput}
                        onChange={(event) => setMonthlyRentInput(event.target.value)}
                        placeholder="예: 120"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    <span>
                      합의 {transactionType === 'yearly_rent' ? '연세 (연간 총액, 만원)' : `${typeLabel}가 (만원)`}
                    </span>
                    <Input
                      inputMode="numeric"
                      value={priceInput}
                      onChange={(event) => setPriceInput(event.target.value)}
                      placeholder="예: 158000"
                    />
                  </label>
                )}

                <Alert>
                  <Info className="size-4" />
                  <AlertDescription>
                    매수인은 매칭 고객, 매도인은 매물 소유자로 자동 연결됩니다. 합의 금액 기준으로
                    수수료 수금 항목이 자동 생성됩니다.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={convertMutation.isPending}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending}
              >
                {activeDeal ? '단계 변경' : '거래 생성하고 전환'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
