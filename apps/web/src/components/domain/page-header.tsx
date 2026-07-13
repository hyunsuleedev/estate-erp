import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 우측 액션 영역 (예: <Button>+ 매물 등록</Button>) */
  actions?: ReactNode;
  /** 뒤로가기 링크 대상 라우트 (예: "/properties") */
  backTo?: LinkProps['to'];
  className?: string;
}

/** 페이지 상단 헤더 — h1 text-xl font-semibold, 하단 mb-4. */
export function PageHeader({ title, description, actions, backTo, className }: PageHeaderProps) {
  return (
    // 좁은 화면은 열(제목 위 / 액션 아래)로 전환 — 호출부가 액션을 비-wrapping
    // 그룹으로 넘겨도(예: 버튼 4개 div) 제목을 침범하지 않는다.
    <div
      data-slot="page-header"
      className={cn(
        'mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        {backTo && (
          <Button asChild variant="ghost" size="icon-sm" className="mt-0.5 -ml-1.5 shrink-0">
            <Link to={backTo} aria-label="뒤로가기">
              <ChevronLeftIcon />
            </Link>
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
  );
}
