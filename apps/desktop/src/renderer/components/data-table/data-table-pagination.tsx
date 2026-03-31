import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface DataTablePaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  totalCount: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function DataTablePagination({
  page,
  pageCount,
  pageSize,
  totalCount,
  onPageChange,
}: DataTablePaginationProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-muted-foreground">
        총 {totalCount.toLocaleString()}건
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onPageChange?.(1)}
          disabled={page === 1}
        >
          <ChevronsLeft className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onPageChange?.(page - 1)}
          disabled={page === 1}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="px-2 text-xs tabular-nums text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onPageChange?.(page + 1)}
          disabled={page === pageCount}
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onPageChange?.(pageCount)}
          disabled={page === pageCount}
        >
          <ChevronsRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
