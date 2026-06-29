import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface DetailFieldProps {
  label: ReactNode;
  /** 값 — children과 value 둘 다 지원. 비어 있으면 "—" */
  value?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** 상세 패널의 라벨:값 한 행. (라벨 w-24 고정, 값은 text-sm) */
export function DetailField({ label, value, children, className }: DetailFieldProps) {
  const content = children ?? value;
  return (
    <div data-slot="detail-field" className={cn('flex items-start gap-2 py-1', className)}>
      <div className="w-24 shrink-0 text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 text-sm text-foreground">
        {content == null || content === '' ? <span className="text-muted-foreground">—</span> : content}
      </div>
    </div>
  );
}
