/**
 * 호실 상세 — 후속 작업(Task) 섹션.
 * 서버에 unit/property 필터 파라미터가 없어 사무소 Task 전체를 가져와 클라이언트에서 필터한다.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckSquare, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, StatusBadge } from '@/components/domain';
import { cn } from '@/lib/utils';
import { formatDday } from '@/lib/format';

function dueTone(dueDate: string, status: string): string {
  if (status === 'completed' || status === 'cancelled') {
    return 'bg-neutral-soft text-muted-foreground';
  }
  const due = new Date(dueDate);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'bg-destructive-soft text-destructive';
  if (diffDays <= 7) return 'bg-warning-soft text-warning';
  return 'bg-neutral-soft text-muted-foreground';
}

export function UnitTasksSection({ propertyIds }: { propertyIds: Set<string> }) {
  const tasksQuery = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks.findAll(),
    enabled: propertyIds.size > 0,
  });

  const unitTasks = useMemo(
    () =>
      (tasksQuery.data ?? [])
        .filter((task) => task.propertyId && propertyIds.has(task.propertyId))
        .sort((a, b) => {
          // 미완료 우선, 그 안에서 마감일 임박순
          const doneA = a.status === 'completed' || a.status === 'cancelled' ? 1 : 0;
          const doneB = b.status === 'completed' || b.status === 'cancelled' ? 1 : 0;
          if (doneA !== doneB) return doneA - doneB;
          const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          return dueA - dueB;
        }),
    [tasksQuery.data, propertyIds],
  );

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <CheckSquare className="size-3" />
          후속 작업
        </h3>
        <Badge variant="secondary" className="text-[10px] font-normal">
          {unitTasks.length}건
        </Badge>
      </div>
      {propertyIds.size === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
          관리호수(Property)로 등록하면 이 호실에 후속 작업을 연결할 수 있습니다.
        </p>
      ) : tasksQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : tasksQuery.isError ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <p className="text-xs text-muted-foreground">후속 작업을 불러오지 못했습니다</p>
          <Button variant="outline" size="sm" onClick={() => tasksQuery.refetch()}>
            <RotateCcw className="size-3.5" />
            다시 시도
          </Button>
        </div>
      ) : unitTasks.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border/60">
          {unitTasks.slice(0, 8).map((task, index) => (
            <div
              key={task.id}
              className={cn(
                'flex flex-wrap items-center gap-2 px-4 py-2.5',
                index > 0 && 'border-t border-border/40',
              )}
            >
              <StatusBadge kind="taskStatus" status={task.status} size="sm" />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px]',
                  (task.status === 'completed' || task.status === 'cancelled') &&
                    'text-muted-foreground line-through',
                )}
              >
                {task.title}
              </span>
              {task.assignedTo && (
                <span className="text-[11px] text-muted-foreground">{task.assignedTo.name}</span>
              )}
              {task.dueDate && (
                <Badge
                  className={cn(
                    'text-[10px] font-medium tabular-nums',
                    dueTone(task.dueDate, task.status),
                  )}
                >
                  {formatDday(task.dueDate)}
                </Badge>
              )}
            </div>
          ))}
          {unitTasks.length > 8 && (
            <div className="border-t border-border/40 px-4 py-2 text-center">
              <Button variant="ghost" size="xs" asChild>
                <Link to="/tasks">전체 {unitTasks.length}건 업무 페이지에서 보기</Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={CheckSquare}
          title="연결된 후속 작업이 없습니다"
          description="업무 페이지에서 이 호실의 매물을 연결해 Task를 만들 수 있습니다"
          className="rounded-lg border border-dashed py-6"
        />
      )}
    </section>
  );
}
