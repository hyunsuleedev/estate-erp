/**
 * 대시보드 공용 헬퍼 — 날짜 키/디데이 계산과 로딩·에러 상태 컴포넌트.
 * 카드 UI 자체는 dashboard.tsx가 소유한다.
 */
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** 로컬 기준 'YYYY-MM-DD' — queryKey에 날짜를 포함해 자정 경과 시 캐시 재사용을 방지 */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** 오늘(달력일)부터 대상일까지 남은 일수. 과거면 음수. */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t1 = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((t1 - t0) / 86_400_000);
}

export function QueryErrorState({
  onRetry,
  className,
}: {
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 py-8 text-center', className)}
    >
      <p className="text-sm text-muted-foreground">데이터를 불러오지 못했습니다.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw /> 다시 시도
      </Button>
    </div>
  );
}

export function WidgetSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}
