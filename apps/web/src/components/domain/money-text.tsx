import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

export interface MoneyTextProps {
  /** 만원 단위 금액. null/undefined/0 → "—" */
  value: number | null | undefined;
  /** 뒤에 붙일 접미사 (예: "원", " / 월") */
  suffix?: string;
  className?: string;
}

/** 금액 표시 텍스트 — tabular-nums 고정폭 숫자. */
export function MoneyText({ value, suffix, className }: MoneyTextProps) {
  const text = formatMoney(value);
  return (
    <span data-slot="money-text" className={cn('tabular-nums', className)}>
      {text}
      {text !== '—' && suffix ? suffix : null}
    </span>
  );
}
