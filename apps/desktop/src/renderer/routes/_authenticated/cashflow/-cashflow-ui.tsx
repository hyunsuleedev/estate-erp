/**
 * 수수료/정산 화면 공통 부품. 카드 없이 경계선으로 나누는 평면 구조를 모든 페이지가 같이 쓴다.
 * 툴바 알약과 필터 칩은 매물관리의 property-toolbar를 그대로 쓴다.
 */
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { EmptyState } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import './-cashflow.css';

export function CashflowPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      data-cashflow-page
      className="-m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <h1 className="sr-only">{title}</h1>
      {children}
    </main>
  );
}

/** 1행 툴바. withLine이면 아래에 경계선을 긋는다 (2행 필터가 없는 화면). */
export function CashflowToolbar({
  label,
  withLine,
  children,
}: {
  label: string;
  withLine?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        '@container flex min-h-[50px] shrink-0 items-center gap-2 bg-white px-3 py-2',
        withLine && 'border-b border-border',
      )}
    >
      {children}
    </section>
  );
}

/** 2행 필터. 매물관리와 같이 툴바에 붙이고 아래에만 선을 긋는다. */
export function CashflowFilterRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-white px-3 pb-2"
    >
      {children}
    </section>
  );
}

export function SummaryStrip({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 border-b border-border">{children}</div>;
}

export function SummaryStat({
  label,
  value,
  hint,
  valueClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 border-r border-[#eeeeec] px-4 pt-[11px] pb-3 last:border-r-0',
        className,
      )}
    >
      <div className="truncate text-xs text-muted-foreground-strong">{label}</div>
      <div
        className={cn(
          'mt-0.5 truncate text-xl leading-[1.3] font-semibold tracking-[-0.01em]',
          valueClassName,
        )}
      >
        {value}
      </div>
      {hint !== undefined && (
        <div className="mt-px truncate text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

/** 표 위 안내 띠 (36px). 합계와 일괄 작업이 같은 자리를 쓴다. */
export function CashflowBand({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-h-9 shrink-0 items-center gap-3.5 border-b border-border bg-[#f7f7f5] px-3 text-[12.5px] whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BandItem({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {label}
      <b
        className={cn(
          'font-semibold text-foreground tabular-nums',
          valueClassName,
        )}
      >
        {value}
      </b>
    </span>
  );
}

export function PaneHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky top-0 z-[3] flex h-9 items-center gap-2 border-b border-[#d8d6d0] bg-[#f7f7f5] px-3 text-[13px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CashflowFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="flex min-h-7 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-[#faf9f6] px-3 text-[11.5px] text-muted-foreground">
      {children}
    </footer>
  );
}

export function MonthStepper({
  year,
  month,
  onStep,
}: {
  year: number;
  month: number;
  onStep: (delta: number) => void;
}) {
  const stepClassName =
    'grid size-[26px] place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20';
  return (
    <div
      role="group"
      aria-label="월 선택"
      className="inline-flex h-[30px] shrink-0 items-center rounded-full bg-[#f1f0ec] p-0.5"
    >
      <button
        type="button"
        aria-label="이전 달"
        className={stepClassName}
        onClick={() => onStep(-1)}
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <b
        aria-live="polite"
        className="min-w-[92px] text-center text-[13px] font-semibold tabular-nums"
      >
        {year}년 {month}월
      </b>
      <button
        type="button"
        aria-label="다음 달"
        className={stepClassName}
        onClick={() => onStep(1)}
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}

export function SortHead<K extends string>({
  sortKey,
  active,
  direction,
  align,
  onSort,
  children,
}: {
  sortKey: K;
  active: K;
  direction: 'asc' | 'desc';
  align?: 'right';
  onSort: (key: K) => void;
  children: ReactNode;
}) {
  const on = sortKey === active;
  return (
    <th
      className="cf-sort-head"
      aria-sort={on ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="cf-sort-button"
        data-align={align}
        onClick={() => onSort(sortKey)}
      >
        {children}
        {on && (direction === 'asc' ? <ArrowUp /> : <ArrowDown />)}
      </button>
    </th>
  );
}

export function FoldButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? '접기' : '펼치기'}
      className="-ml-1 grid size-[22px] shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation();
        onToggle?.();
      }}
    >
      {open ? (
        <ChevronDown className="size-3.5" />
      ) : (
        <ChevronRight className="size-3.5" />
      )}
    </button>
  );
}

/** 얇은 수금 진행 막대. 색은 수금완료와 같은 success만 쓴다. */
export function CollectMeter({
  percent,
  label,
  style,
}: {
  percent: number;
  label?: string;
  style?: CSSProperties;
}) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <span
      role="img"
      aria-label={label ?? `수금 ${width}%`}
      className="block h-1 overflow-hidden rounded-full bg-neutral-soft"
      style={style}
    >
      <i
        className="block h-full rounded-full bg-success"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

export function CashflowLoading() {
  return (
    <div className="flex flex-col gap-3 p-3" aria-busy="true">
      <Skeleton className="h-16 rounded-md" />
      <Skeleton className="h-9 rounded-md" />
      <Skeleton className="h-9 rounded-md" />
      <Skeleton className="h-9 rounded-md" />
      <Skeleton className="h-9 rounded-md" />
    </div>
  );
}

export function CashflowError({
  icon,
  title,
  onRetry,
}: {
  icon: ElementType;
  title: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
      className="flex-1"
      action={
        <Button variant="outline" onClick={onRetry}>
          <RotateCw className="size-4" />
          다시 시도
        </Button>
      }
    />
  );
}

export function useCanManageFinance() {
  const { user } = useAuth();
  return user?.role === 'owner' || user?.role === 'manager';
}

/** 메뉴에서 숨긴 화면을 주소로 직접 열었을 때의 안내 */
export function ManagerOnly({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const allowed = useCanManageFinance();
  if (allowed) return <>{children}</>;
  return (
    <CashflowPage title={title}>
      <EmptyState
        icon={Lock}
        title="접근 권한이 없습니다"
        description="대표와 매니저만 볼 수 있는 화면입니다. 본인 수수료는 내 수수료에서 확인할 수 있습니다."
        className="flex-1"
        action={
          <Button asChild variant="outline">
            <Link to="/cashflow/my-settlement">내 수수료로 이동</Link>
          </Button>
        }
      />
    </CashflowPage>
  );
}
