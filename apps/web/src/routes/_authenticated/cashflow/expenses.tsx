import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
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

export const Route = createFileRoute('/_authenticated/cashflow/expenses')({
  component: ExpensesPage,
});

function toEok(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

const categoryLabel: Record<string, string> = {
  rent: '임대료',
  ad: '광고비',
  telecom: '통신비',
  insurance: '보험료',
  association: '협회비',
  supplies: '소모품',
  vehicle: '차량/교통',
  other: '기타',
};

const frequencyLabel: Record<string, string> = {
  monthly: '매월',
  quarterly: '분기',
  yearly: '연간',
};

function ExpensesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['office-expenses'],
    queryFn: () => api.finance.expenses.list(),
  });

  const monthlyTotal =
    data?.reduce((sum, t) => {
      if (!t.isActive) return sum;
      if (t.frequency === 'monthly') return sum + t.amount;
      if (t.frequency === 'quarterly') return sum + Math.round(t.amount / 3);
      if (t.frequency === 'yearly') return sum + Math.round(t.amount / 12);
      return sum;
    }, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Receipt className="size-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">고정비 설정</h1>
          <p className="text-sm text-muted-foreground">
            사무소 운영 고정비를 등록하면 캐시플로우에서 순이익이 자동 계산됩니다.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-muted/50 p-4">
        <span className="text-sm text-muted-foreground">월 고정비 합계: </span>
        <span className="text-lg font-bold">{toEok(monthlyTotal)}</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">등록된 고정비가 없습니다</CardTitle>
            <CardDescription>
              임대료, 광고비 등 사무소 고정비를 등록해주세요.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((expense) => (
            <Card key={expense.id} className={expense.isActive ? 'border' : 'border opacity-50'}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{expense.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {categoryLabel[expense.category] ?? expense.category}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {frequencyLabel[expense.frequency] ?? expense.frequency}
                    </Badge>
                    {expense.taxDeductible && (
                      <Badge variant="secondary" className="text-[10px]">
                        공제 가능
                      </Badge>
                    )}
                    {!expense.isActive && (
                      <Badge variant="destructive" className="text-[10px]">
                        비활성
                      </Badge>
                    )}
                  </div>
                  {expense.dayOfMonth && (
                    <span className="text-xs text-muted-foreground">
                      매월 {expense.dayOfMonth}일
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold">{toEok(expense.amount)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
