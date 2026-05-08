import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SideCard({ title, action, children, className }: Props) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-white px-3 py-3',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>
        {action && <div className="-mr-1">{action}</div>}
      </div>
      <div className="text-[13px]">{children}</div>
    </section>
  );
}

export function SideCardRow({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-1 text-[12px]',
        className,
      )}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground">
        {value || '-'}
      </span>
    </div>
  );
}
