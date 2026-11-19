import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { Match } from '@estate-erp/api-client';
import { MatchStage } from '@estate-erp/shared';
import {
  formatMatchPrice,
  getActiveDealLink,
  getMatchTitle,
  getPrimaryOwnerContact,
} from './-match-view-utils';
import { api } from '@/lib/api';
import { getStatusMeta } from '@/lib/status-config';
import { StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const [moveInInput, setMoveInInput] = useState('');

  const listing = match?.listing ?? null;
  const transactionType = listing?.transactionType ?? null;
  const isMonthly = transactionType === 'monthly';
  const activeDeal = match ? getActiveDealLink(match) : null;

  useEffect(() => {
    if (!match) {
      return;
    }
    const listingForMatch = match.listing;
    // 협상하며 적어 둔 합의 조건이 있으면 그것을, 없으면 매물 가격을 넣어 둔다.
    setPriceInput(
      match.agreedPrice != null
        ? String(match.agreedPrice)
        : listingForMatch?.price != null
          ? String(listingForMatch.price)
          : listingForMatch?.deposit != null && listingForMatch.transactionType !== 'monthly'
            ? String(listingForMatch.deposit)
            : '',
    );
    setDepositInput(
      match.agreedDeposit != null
        ? String(match.agreedDeposit)
        : listingForMatch?.deposit != null
          ? String(listingForMatch.deposit)
          : '',
    );
    setMonthlyRentInput(
      match.agreedMonthlyRent != null
        ? String(match.agreedMonthlyRent)
        : listingForMatch?.monthlyRent != null
          ? String(listingForMatch.monthlyRent)
          : '',
    );
    setMoveInInput(match.agreedMoveInDate ? match.agreedMoveInDate.slice(0, 10) : '');
    // 합의 조건은 창을 여는 순간에도 저장 중일 수 있어, 저장된 값이 도착하면 다시 채운다.
  }, [
    match?.id,
    match?.agreedPrice,
    match?.agreedDeposit,
    match?.agreedMonthlyRent,
    match?.agreedMoveInDate,
  ]);

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
          agreedMoveInDate: moveInInput || undefined,
          buyerContactId: match.buyerRequirement?.contactId,
          sellerContactId: getPrimaryOwnerContact(match.listing)?.id,
        });
      }

      await api.matches.updateStage(match.id, { stage: MatchStage.DEAL_CREATED });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      onOpenChange(false);
      toast.success(activeDeal ? '거래 전환 단계로 변경했습니다' : '계약 준비 거래가 생성되었습니다', {
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
      {/* Notion의 작은 창처럼: 테두리 대신 옅은 그림자, 상자 없이 "이름 — 값" 줄, 설명은 옅은 한 줄 */}
      {/* grid-cols-[minmax(0,1fr)]: 긴 매물명이 창을 밀어내지 않고 말줄임되게 칸의 최소 폭을 0으로 둔다 */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 rounded-[12px] border-0 p-0 shadow-[0_0_0_1px_rgba(15,15,15,0.05),0_5px_10px_rgba(15,15,15,0.08),0_15px_40px_rgba(15,15,15,0.16)] sm:max-w-[440px]">
        {!match ? null : (
          <>
            <DialogHeader className="gap-1 px-5 pb-3 pt-5 pr-12">
              <DialogTitle className="text-[16px] font-semibold leading-6">거래 전환</DialogTitle>
              <DialogDescription className="break-keep text-[13px] leading-5">
                {activeDeal
                  ? '이미 연결된 거래가 있어 매칭 단계만 거래 전환으로 변경합니다.'
                  : '계약 준비 단계의 거래를 만들고 계약·대금·수수료 관리로 이어갑니다.'}
              </DialogDescription>
            </DialogHeader>

            <dl className="px-5 pb-1 text-[14px] leading-5 text-foreground">
              <ConvertRow label="고객">
                {match.buyerRequirement?.contact?.name ?? '미지정'}
              </ConvertRow>
              <ConvertRow label="매물">{getMatchTitle(match)}</ConvertRow>
              <ConvertRow label="거래유형">
                {transactionType ? (
                  <StatusBadge kind="transactionType" status={transactionType} size="sm" />
                ) : (
                  '—'
                )}
              </ConvertRow>
              <ConvertRow label="매물 가격">
                <span className="tabular-nums">{formatMatchPrice(match)}</span>
              </ConvertRow>
              {activeDeal && (
                <ConvertRow label="연결 거래">
                  <StatusBadge kind="dealStage" status={activeDeal.stage} size="sm" />
                </ConvertRow>
              )}
            </dl>

            {!activeDeal && (
              <>
                <div className="mx-5 border-t border-border" />
                <div className="px-5 pb-1 pt-1 text-[14px] leading-5 text-foreground">
                  {isMonthly ? (
                    <>
                      <ConvertInputRow
                        label="합의 보증금"
                        suffix="만원"
                        inputMode="numeric"
                        value={depositInput}
                        onChange={setDepositInput}
                        placeholder="10000"
                      />
                      <ConvertInputRow
                        label="합의 월세"
                        suffix="만원"
                        inputMode="numeric"
                        value={monthlyRentInput}
                        onChange={setMonthlyRentInput}
                        placeholder="120"
                      />
                    </>
                  ) : (
                    <ConvertInputRow
                      label={`합의 ${typeLabel}가`}
                      suffix="만원"
                      inputMode="numeric"
                      value={priceInput}
                      onChange={setPriceInput}
                      placeholder="158000"
                    />
                  )}
                  <ConvertInputRow
                    label="합의 입주일"
                    type="date"
                    value={moveInInput}
                    onChange={setMoveInInput}
                    hint="선택"
                  />
                </div>
                <p className="break-keep px-5 pb-4 pt-2 text-[12px] leading-[18px] text-muted-foreground">
                  매수인은 매칭 고객, 매도인은 매물 소유자로 자동 연결됩니다. 합의 금액 기준으로
                  수수료 수금 항목이 자동 생성됩니다.
                </p>
              </>
            )}

            <DialogFooter className="gap-1.5 border-t border-border px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={convertMutation.isPending}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
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

/** "이름 — 값" 한 줄. 이름은 옅게, 값은 같은 세로줄에서 시작한다. */
function ConvertRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <dt className="w-[92px] shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd
        className="min-w-0 flex-1 truncate"
        title={typeof children === 'string' ? children : undefined}
      >
        {children}
      </dd>
    </div>
  );
}

/** 값 자리에 입력칸이 오는 줄. 단위는 이름이 아니라 입력칸 안 오른쪽에 둔다. */
function ConvertInputRow({
  label,
  value,
  onChange,
  suffix,
  hint,
  type = 'text',
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  hint?: string;
  type?: 'text' | 'date';
  inputMode?: 'numeric';
  placeholder?: string;
}) {
  return (
    <label className="flex min-h-10 items-center gap-3">
      <span className="w-[92px] shrink-0 text-[13px] text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-[12px] text-[#a3a09a]">{hint}</span>}
      </span>
      <span className="flex h-8 min-w-0 flex-1 items-center rounded-[6px] bg-[rgba(242,241,238,0.6)] px-2.5 shadow-[inset_0_0_0_1px_rgba(15,15,15,0.1)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_#2383e2,0_0_0_2px_rgba(35,131,226,0.2)]">
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] tabular-nums text-foreground outline-none placeholder:text-[#b4b1ab]"
        />
        {suffix && (
          <span className="ml-2 shrink-0 text-[13px] text-muted-foreground">{suffix}</span>
        )}
      </span>
    </label>
  );
}
