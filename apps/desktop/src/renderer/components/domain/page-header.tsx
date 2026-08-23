import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface PageHeaderProps {
  title: ReactNode;
  /**
   * web 과의 시그니처 호환용. web 은 정적 제목을 셸 헤더로 옮겨 showTitle 로
   * 본문 표시를 제어하지만, desktop 셸(탭 바)은 페이지 제목을 그리지 않으므로
   * desktop 은 값과 무관하게 항상 제목을 표시한다.
   */
  showTitle?: boolean;
  description?: ReactNode;
  /** 우측 액션 영역 (예: <Button>+ 매물 등록</Button>) */
  actions?: ReactNode;
  /** 뒤로가기 링크 대상 라우트 (예: "/properties") */
  backTo?: LinkProps['to'];
  /** 탭 lifecycle처럼 link보다 먼저 처리할 동작이 필요한 경우 사용 */
  onBack?: () => void;
  className?: string;
}

/** 페이지 상단 헤더 — h1 text-xl font-semibold, 하단 mb-4. */
export function PageHeader({ title, description, actions, backTo, onBack, className }: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn('mb-4 flex items-start justify-between gap-4', className)}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mt-0.5 -ml-1.5 shrink-0"
            onClick={onBack}
            aria-label="뒤로가기"
          >
            <ChevronLeftIcon />
          </Button>
        ) : backTo ? (
          <Button asChild variant="ghost" size="icon-sm" className="mt-0.5 -ml-1.5 shrink-0">
            <Link to={backTo} aria-label="뒤로가기">
              <ChevronLeftIcon />
            </Link>
          </Button>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
