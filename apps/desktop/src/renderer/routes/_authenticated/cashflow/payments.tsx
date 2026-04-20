import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/cashflow/payments')({
  component: PaymentsPage,
});

function toEok(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

const statusLabel: Record<string, string> = {
  pending: '대기',
  collected: '수금',
  partial: '부분수금',
  overdue: '연체',
  waived: '면제',
};
const statusColor: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  collected: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  waived: 'bg-gray-100 text-gray-500',
};
const sideLabel: Record<string, string> = {
  seller: '매도측',
  buyer: '매수측',
  partner: '공동중개',
};

function PaymentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['commission-payments'],
    queryFn: () => api.finance.commissionPayments.list(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Wallet className="size-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">수금 관리</h1>
          <p className="text-sm text-muted-foreground">
            거래별 수수료 수금 상태와 세금계산서 발행을 관리합니다.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">수금 내역이 없습니다</CardTitle>
            <CardDescription>
              거래가 생성되면 수수료 수금 내역이 자동으로 나타납니다.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((payment) => {
            const deal = (payment as any).deal;
            const prop = deal?.listing?.property;
            const location = prop
              ? [prop.site?.name, prop.unit?.dong?.name, prop.unit?.name && `${prop.unit.name}호`]
                  .filter(Boolean)
                  .join(' ')
              : '-';

            return (
              <Card key={payment.id} className="border">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{location}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {sideLabel[payment.clientSide] ?? payment.clientSide}
                      </Badge>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[payment.status] ?? ''}`}
                      >
                        {statusLabel[payment.status] ?? payment.status}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {payment.payerContact && (
                        <span>지급자: {payment.payerContact.name}</span>
                      )}
                      {payment.dueDate && (
                        <span>
                          예정일:{' '}
                          {new Date(payment.dueDate).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                      {payment.paidAt && (
                        <span>
                          입금일:{' '}
                          {new Date(payment.paidAt).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      {toEok(payment.actualAmount ?? payment.expectedAmount)}
                    </div>
                    {payment.actualAmount != null &&
                      payment.actualAmount !== payment.expectedAmount && (
                        <div className="text-[11px] text-muted-foreground line-through">
                          {toEok(payment.expectedAmount)}
                        </div>
                      )}
                    {payment.taxInvoiceStatus !== 'none' && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        세금계산서 {payment.taxInvoiceStatus === 'issued' ? '발행' : '발송'}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
