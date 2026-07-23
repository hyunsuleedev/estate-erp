import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface PageHeaderProps {
  /** 페이지 제목. 기본적으로 렌더링하지 않는다(셸 헤더 h1이 담당) — showTitle 참고. */
  title?: ReactNode;
  /** 부가 설명. showTitle일 때만 표시. */
  description?: ReactNode;
  /**
   * true면 제목/설명을 본문에 표시한다.
   * 셸 헤더는 라우트의 정적 라벨만 알기 때문에, 엔티티명 등 동적 제목
   * (예: "김철수 고객")을 쓰는 상세 페이지에서만 켠다. 정적 목록 페이지는 끈 채로 둔다.
   */
  showTitle?: boolean;
  /** 우측 액션 영역 (예: <Button>+ 매물 등록</Button>) */
  actions?: ReactNode;
  /** 뒤로가기 링크 대상 라우트 (예: "/properties") */
  backTo?: LinkProps['to'];
  className?: string;
}

/**
 * 페이지 상단 액션 바.
 * 정적 페이지 제목은 상단 앱 헤더(h1)가 이미 표시하므로 기본으로는 제목을 그리지 않고,
 * 뒤로가기(backTo)·액션 버튼만 유지한다. 동적 제목이 필요한 상세 페이지만 showTitle을 켠다.
 * 제목을 표시할 때는 문서에 h1이 중복되지 않도록 h2를 쓴다 (h1은 셸 헤더 소유).
 */
export function PageHeader({
  title,
  description,
  showTitle = false,
  actions,
  backTo,
  className,
}: PageHeaderProps) {
  const hasTitleBlock = showTitle && title != null;
  if (!hasTitleBlock && !actions && !backTo) return null;

  return (
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
        {hasTitleBlock && (
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
  );
}
