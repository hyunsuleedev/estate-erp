import type { ElementType, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** lucide 아이콘 컴포넌트 (예: icon={InboxIcon}) — 일러스트 금지, 아이콘 1개 */
  icon: ElementType;
  title: ReactNode;
  description?: ReactNode;
  /** CTA 버튼 (예: <Button>+ 매물 등록</Button>) */
  action?: ReactNode;
  className?: string;
}

/** 공용 빈 상태 — 중앙 정렬, 차분한 톤. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center', className)}
    >
      <Icon className="size-10 text-muted-foreground/50" aria-hidden="true" />
      <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
