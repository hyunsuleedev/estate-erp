/**
 * 고정비 요약 카드 — OfficeExpenseTemplate 월 환산 합계 + /cashflow/expenses 점프.
 * 등록/수정은 캐시플로우 > 고정비 페이지에서 수행한다.
 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ReceiptText, RotateCw } from 'lucide-react';
import type { OfficeExpenseTemplate } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** 주기별 월 환산 금액 (cashflow/expenses.tsx와 동일 규칙) */
function monthlyEquivalent(template: OfficeExpenseTemplate): number {
  if (template.frequency === 'quarterly') return Math.round(template.amount / 3);
  if (template.frequency === 'yearly') return Math.round(template.amount / 12);
  return template.amount;
}

export function ExpenseSummaryCard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['office-expense-templates'],
    queryFn: () => api.finance.expenses.list(),
  });

  const templates = data ?? [];
  const active = templates.filter((template) => template.isActive);
  const monthlyTotal = active.reduce(
    (sum, template) => sum + monthlyEquivalent(template),
    0,
  );
  const topItems = [...active]
    .sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a))
    .slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="size-4" />
              고정비
            </CardTitle>
            <CardDescription>
              매월 자동 반영되는 사무소 고정비 템플릿 요약입니다.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/cashflow/expenses">
              고정비 관리
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border/60 px-3 py-4">
            <p className="text-sm text-muted-foreground">
              고정비 정보를 불러오지 못했습니다.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RotateCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : active.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
            등록된 고정비가 없습니다. 임대료·관리비 등을 등록하면 캐시플로우 순이익
            계산에 자동 반영됩니다.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums tracking-tight">
                {formatMoney(monthlyTotal)}원
              </span>
              <span className="text-xs text-muted-foreground">
                월 환산 합계 · 활성 {active.length}건
              </span>
            </div>
            <div className="space-y-1.5">
              {topItems.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between rounded-md border border-border/60 px-3 py-1.5 text-sm"
                >
                  <span className="truncate">{template.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    월 {formatMoney(monthlyEquivalent(template))}원
                  </span>
                </div>
              ))}
              {active.length > topItems.length ? (
                <p className="text-[11px] text-muted-foreground">
                  외 {active.length - topItems.length}건은 고정비 관리에서 확인하세요.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
