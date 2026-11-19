/**
 * 호실 상세 — 후속 작업(Task) 섹션.
 * 서버에 unit/property 필터 파라미터가 없어 사무소 Task 전체를 가져와 클라이언트에서 필터한다.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/domain';
import {
  EmptyText,
  RetryNote,
  SectionTitle,
} from '../properties/-components/property-inspector-view';
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
      <SectionTitle count={unitTasks.length || undefined}>후속 작업</SectionTitle>
      {propertyIds.size === 0 ? (
        <EmptyText>관리호수로 등록하면 이 호실에 후속 작업을 연결할 수 있습니다.</EmptyText>
      ) : tasksQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : tasksQuery.isError ? (
        <RetryNote onRetry={() => void tasksQuery.refetch()}>후속 작업을 불러오지 못했습니다.</RetryNote>
      ) : unitTasks.length > 0 ? (
        <div className="divide-y divide-[#f1f0ec]">
          {unitTasks.slice(0, 8).map((task) => (
            <div key={task.id} className="flex min-h-10 items-center gap-2.5 py-2">
              <StatusBadge kind="taskStatus" status={task.status} size="sm" />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px] text-[#2f2e2a]',
                  (task.status === 'completed' || task.status === 'cancelled') &&
                    'text-muted-foreground line-through',
                )}
              >
                {task.title}
              </span>
              {task.assignedTo && (
                <span className="shrink-0 text-[12px] text-muted-foreground">{task.assignedTo.name}</span>
              )}
              {task.dueDate && (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5 tabular-nums',
                    dueTone(task.dueDate, task.status),
                  )}
                >
                  {formatDday(task.dueDate)}
                </span>
              )}
            </div>
          ))}
          {unitTasks.length > 8 && (
            <div className="py-2">
              <Link
                to="/tasks"
                className="text-[12px] text-muted-foreground hover:text-foreground"
              >
                전체 {unitTasks.length}건 업무 페이지에서 보기
              </Link>
            </div>
          )}
        </div>
      ) : (
        <EmptyText>연결된 후속 작업이 없습니다. 업무 페이지에서 이 호실의 매물을 연결해 만들 수 있습니다.</EmptyText>
      )}
    </section>
  );
}
