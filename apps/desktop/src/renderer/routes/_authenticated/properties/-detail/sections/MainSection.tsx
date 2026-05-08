import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function MainSection({
  title,
  count,
  action,
  children,
  className,
}: Props) {
  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="flex items-baseline gap-1.5 text-[14px] font-semibold text-foreground">
          {title}
          {count != null && (
            <span className="text-[12px] font-normal text-muted-foreground">
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function MainSectionEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-[12px] text-muted-foreground">
      {text}
    </div>
  );
}
