import { cn } from '@/lib/utils';
import { getStatusMeta, type StatusKind, type Tone } from '@/lib/status-config';

/**
 * tone → Tailwind 클래스 정적 매핑 (동적 클래스 조합 금지 — purge 안전).
 * 뱃지 스타일 원칙: 연한 배경(bg-*-soft) + 진한 글자(text-*), 점(dot) 없음.
 */
const TONE_CLASSES: Record<Tone, string> = {
  gray: 'bg-neutral-soft text-muted-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
  pink: 'bg-pink-soft text-pink',
  orange: 'bg-orange-soft text-orange',
  destructive: 'bg-destructive-soft text-destructive',
  neutral: 'bg-neutral-soft text-neutral-strong',
};

export interface StatusBadgeProps {
  /** 파이프라인 종류 (status-config의 StatusKind) */
  kind: StatusKind;
  /** 상태 원문 값 (예: 'verified', 'preContract') */
  status: string | null | undefined;
  size?: 'sm' | 'default' | 'table';
  className?: string;
}

/**
 * 전 파이프라인 상태 뱃지의 단일 구현.
 * 미정의 상태값은 gray + 원문 라벨로 안전하게 표시된다.
 */
export function StatusBadge({ kind, status, size = 'default', className }: StatusBadgeProps) {
  const meta = getStatusMeta(kind, status);
  return (
    <span
      data-slot="status-badge"
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-md font-medium whitespace-nowrap',
        size === 'sm'
          ? 'px-1.5 py-px text-[11px]'
          : size === 'table'
            ? 'h-6 px-2 text-[11px]'
            : 'px-2 py-0.5 text-xs',
        meta.className ?? TONE_CLASSES[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
