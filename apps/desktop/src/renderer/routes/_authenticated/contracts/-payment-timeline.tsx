/**
 * 대금 타임라인 — 계약서 명목(stated*) 금액 vs 실입금(DealPayment) 구분 표시.
 */
import { useMemo } from 'react';
import type { Deal } from '@estate-erp/api-client';
import {
  DEAL_PAYMENT_KIND_LABELS,
  toOptionalNumber,
  type ContractForm,
} from './-contract-shared';
import { cn } from '@/lib/utils';
import { formatDate, formatDday, formatMoney } from '@/lib/format';
import { StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** api-client index가 DealPayment를 재export하지 않아 Deal에서 파생 */
type DealPayment = NonNullable<Deal['payments']>[number];

export function PaymentTimelineCard({
  form,
  payments,
  isLoading,
  isError,
  onRetry,
  hasDeal,
}: {
  form: ContractForm;
  payments: DealPayment[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  hasDeal: boolean;
}) {
  const steps = useMemo(() => {
    const byKind = (kind: string) =>
      payments.filter((payment) => payment.kind === kind && payment.status !== 'cancelled');

    const result: Array<{
      key: string;
      label: string;
      statedAmount: number | undefined;
      statedDate: string;
      payments: DealPayment[];
    }> = [];

    const preContract = byKind('pre_contract');
    if (preContract.length > 0) {
      result.push({
        key: 'pre_contract',
        label: DEAL_PAYMENT_KIND_LABELS.pre_contract,
        statedAmount: undefined,
        statedDate: '',
        payments: preContract,
      });
    }

    result.push(
      {
        key: 'contract',
        label: DEAL_PAYMENT_KIND_LABELS.contract,
        statedAmount: toOptionalNumber(form.statedDeposit),
        statedDate: form.contractDate,
        payments: byKind('contract'),
      },
      {
        key: 'interim',
        label: DEAL_PAYMENT_KIND_LABELS.interim,
        statedAmount: toOptionalNumber(form.statedInterimPayment),
        statedDate: form.statedInterimDate,
        payments: byKind('interim'),
      },
      {
        key: 'balance',
        label: DEAL_PAYMENT_KIND_LABELS.balance,
        statedAmount: toOptionalNumber(form.statedBalance),
        statedDate: form.statedBalanceDate,
        payments: byKind('balance'),
      },
    );

    const refunds = byKind('refund');
    if (refunds.length > 0) {
      result.push({
        key: 'refund',
        label: DEAL_PAYMENT_KIND_LABELS.refund,
        statedAmount: undefined,
        statedDate: '',
        payments: refunds,
      });
    }

    return result;
  }, [form, payments]);

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-base">대금 타임라인</CardTitle>
        <CardDescription>
          명목은 계약서 기재 금액, 실입금은 거래 대금(DealPayment) 기준입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        {isError ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            실입금 이력을 불러오지 못했습니다.
            <Button variant="outline" size="sm" onClick={onRetry}>
              다시 시도
            </Button>
          </div>
        ) : (
          <ol className="space-y-0">
            {steps.map((step, index) => {
              const isLast = index === steps.length - 1;
              const paidTotal = step.payments.reduce(
                (sum, payment) => sum + (payment.paidAmount ?? 0),
                0,
              );
              const allPaid =
                step.payments.length > 0 &&
                step.payments.every((payment) => payment.status === 'paid');

              return (
                <li key={step.key} className="relative flex gap-4 pb-5 last:pb-0">
                  {!isLast ? (
                    <span
                      aria-hidden
                      className="absolute left-[7px] top-4 h-full w-px bg-border"
                    />
                  ) : null}
                  <span
                    className={cn(
                      'relative mt-1 size-[15px] shrink-0 rounded-full border-2',
                      allPaid
                        ? 'border-success bg-success'
                        : step.payments.length > 0 || step.statedAmount
                          ? 'border-info bg-background'
                          : 'border-border bg-background',
                    )}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{step.label}</span>
                      {step.statedAmount !== undefined ? (
                        <span className="text-sm tabular-nums">
                          명목 {formatMoney(step.statedAmount)}
                        </span>
                      ) : null}
                      {step.statedDate ? (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(step.statedDate)} ({formatDday(step.statedDate)})
                        </span>
                      ) : null}
                    </div>
                    {isLoading && hasDeal ? (
                      <Skeleton className="h-5 w-48" />
                    ) : step.payments.length > 0 ? (
                      <div className="space-y-1">
                        {step.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex flex-wrap items-center gap-2 text-xs"
                          >
                            <StatusBadge
                              kind="dealPaymentStatus"
                              status={payment.status}
                              size="sm"
                            />
                            <span className="tabular-nums">
                              실입금 {formatMoney(payment.paidAmount)}
                              {' / 예정 '}
                              {formatMoney(payment.scheduledAmount)}
                            </span>
                            {payment.paidAt ? (
                              <span className="text-muted-foreground">
                                입금일 {formatDate(payment.paidAt)}
                              </span>
                            ) : payment.scheduledDate ? (
                              <span className="text-muted-foreground">
                                예정일 {formatDate(payment.scheduledDate)}
                              </span>
                            ) : null}
                          </div>
                        ))}
                        {step.payments.length > 1 ? (
                          <p className="text-xs text-muted-foreground">
                            합계 실입금 {formatMoney(paidTotal)}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {hasDeal
                          ? '등록된 실입금 이력이 없습니다. 입금 기록은 거래 페이지에서 관리합니다.'
                          : '연결된 거래가 없어 실입금 이력을 확인할 수 없습니다.'}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
