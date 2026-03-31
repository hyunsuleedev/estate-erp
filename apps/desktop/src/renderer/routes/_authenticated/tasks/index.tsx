import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/tasks/')({
  component: TasksPage,
});

function TasksPage() {
  const queryClient = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const [newTask, setNewTask] = useState('');

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks.findAll(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) =>
      api.tasks.update(id, { isDone }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => api.tasks.create({ title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setNewTask('');
    },
  });

  const filtered = tasks?.filter((t) => showDone || !t.isDone) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">업무</h1>
          <span className="text-xs text-muted-foreground">
            {tasks ? tasks.filter((t) => !t.isDone).length : 0}건 미완료
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="showDone"
            checked={showDone}
            onCheckedChange={(checked) => setShowDone(checked === true)}
            className="size-3.5"
          />
          <Label htmlFor="showDone" className="text-xs font-normal text-muted-foreground">
            완료 항목 표시
          </Label>
        </div>
      </div>

      {/* Add task bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newTask.trim()) createMutation.mutate(newTask.trim());
        }}
        className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-2.5"
      >
        <Plus className="size-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="새 업무 추가..."
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          className="h-7 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="sm"
          className="h-7 text-xs"
          disabled={createMutation.isPending || !newTask.trim()}
        >
          추가
        </Button>
      </form>

      {/* Task list */}
      <div className="rounded-xl bg-muted/50">
        {isLoading ? (
          <div className="space-y-0 divide-y divide-border/40">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {showDone ? '업무가 없습니다.' : '미완료 업무가 없습니다.'}
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {filtered.map((task) => (
              <li
                key={task.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/80',
                  task.isDone && 'opacity-50',
                )}
              >
                <Checkbox
                  checked={task.isDone}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ id: task.id, isDone: checked === true })
                  }
                  className="size-4"
                />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', task.isDone && 'line-through text-muted-foreground')}>
                    {task.title}
                  </p>
                  {task.content && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.content}</p>
                  )}
                </div>
                {task.dueDate && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(task.dueDate).toLocaleDateString('ko-KR')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
