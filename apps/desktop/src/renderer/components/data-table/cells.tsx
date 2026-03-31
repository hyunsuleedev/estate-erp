import { cn } from '@/lib/utils';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';

// ── Field-type display components (Twenty-inspired routing) ─────
// Each field type gets a dedicated display component.
// This keeps rendering logic isolated and type-safe.

// ── Price Cell ──────────────────────────────────────────────────

interface PriceCellProps {
  transactionType: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
}

export function PriceCell({ transactionType, price, deposit, monthlyRent }: PriceCellProps) {
  if (transactionType === 'monthly') {
    const d = deposit ? formatPrice(deposit) : '-';
    const m = monthlyRent ? formatPrice(monthlyRent) : '-';
    return (
      <span className="tabular-nums text-sm">
        <span>{d}</span>
        <span className="text-muted-foreground"> / </span>
        <span>{m}</span>
      </span>
    );
  }
  const value = price ?? deposit;
  return (
    <span className="tabular-nums text-sm font-medium">
      {value ? formatPrice(value) : '-'}
    </span>
  );
}

// ── Area Cell ───────────────────────────────────────────────────

interface AreaCellProps {
  exclusiveAreaM2?: number | null;
  supplyAreaM2?: number | null;
  showSupply?: boolean;
}

export function AreaCell({ exclusiveAreaM2, supplyAreaM2, showSupply = false }: AreaCellProps) {
  if (!exclusiveAreaM2) return <span className="text-sm text-muted-foreground">-</span>;

  const pyeong = sqmToPyeong(Number(exclusiveAreaM2));
  return (
    <span className="tabular-nums text-sm">
      <span>{pyeong}평</span>
      {showSupply && supplyAreaM2 && (
        <span className="ml-1 text-muted-foreground">
          ({sqmToPyeong(Number(supplyAreaM2))}평)
        </span>
      )}
    </span>
  );
}

// ── Status Badge Cell (Select-type display) ─────────────────────

interface StatusBadgeCellProps {
  value: string;
  labels: Record<string, string>;
  colors: Record<string, string>;
}

export function StatusBadgeCell({ value, labels, colors }: StatusBadgeCellProps) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
        colors[value] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {labels[value] ?? value}
    </span>
  );
}

// ── Transaction Type Cell ───────────────────────────────────────

const txTypeStyles: Record<string, string> = {
  sale: 'bg-rose-50 text-rose-700',
  jeonse: 'bg-blue-50 text-blue-700',
  monthly: 'bg-violet-50 text-violet-700',
};

const txTypeLabels: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

export function TransactionTypeCell({ value }: { value: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        txTypeStyles[value] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {txTypeLabels[value] ?? value}
    </span>
  );
}

// ── Date Cell ───────────────────────────────────────────────────

interface DateCellProps {
  value: string | Date | null;
  relative?: boolean;
}

export function DateCell({ value, relative = false }: DateCellProps) {
  if (!value) return <span className="text-sm text-muted-foreground">-</span>;

  const date = typeof value === 'string' ? new Date(value) : value;

  if (relative) {
    const diff = Date.now() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return <span className="text-xs text-muted-foreground">오늘</span>;
    if (days === 1) return <span className="text-xs text-muted-foreground">어제</span>;
    if (days < 7) return <span className="text-xs text-muted-foreground">{days}일 전</span>;
  }

  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
    </span>
  );
}

// ── Text Cell (with optional link styling) ──────────────────────

interface TextCellProps {
  value: string | null;
  bold?: boolean;
  muted?: boolean;
}

export function TextCell({ value, bold = false, muted = false }: TextCellProps) {
  if (!value) return <span className="text-sm text-muted-foreground">-</span>;
  return (
    <span
      className={cn(
        'text-sm',
        bold && 'font-medium',
        muted && 'text-muted-foreground',
      )}
    >
      {value}
    </span>
  );
}

// ── Floor Cell ──────────────────────────────────────────────────

export function FloorCell({ value }: { value: number | null }) {
  if (!value) return <span className="text-sm text-muted-foreground">-</span>;
  return <span className="tabular-nums text-sm">{value}층</span>;
}

// ── Hidden indicator ────────────────────────────────────────────

export function HiddenIndicator({ isHidden }: { isHidden: boolean }) {
  if (!isHidden) return null;
  return (
    <span className="inline-flex size-1.5 rounded-full bg-amber-400" title="숨김 매물" />
  );
}
