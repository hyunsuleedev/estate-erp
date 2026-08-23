import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Edit,
  LayoutGrid,
  Layers,
  List,
  ListOrdered,
  MoreHorizontal,
  Plus,
  SearchX,
  Trash2,
  User,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  type CreateTaskDto,
  type Task,
  type UpdateTaskDto,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import {
  ConfirmDialog,
  EmptyState,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  PageHeader,
} from '@/components/domain';
import {
  ASSIGNEE_UNASSIGNED,
  DueDateText,
  TASK_STATUSES,
  TaskContextChips,
  TaskSourceBadge,
  boardColumns,
  categoryConfig,
  getPropertyLabel,
  isOverdue,
  priorityConfig,
  taskStatusLabel,
  type DueDateFilter,
  type TaskCategory,
  type TaskPriority,
  type ViewMode,
} from './-task-shared';
import {
  CategoryTaskTable,
  LoadingSkeleton,
  NotionTableHeader,
  NotionTableRow,
  StatusView,
} from './-task-table';
import { TaskFormModal } from './-task-form';

export const Route = createFileRoute('/_authenticated/tasks/')({
  component: TasksPage,
});

// ─── Config ───────────────────────────────────────────────

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: LucideIcon }[] = [
  { mode: 'category', label: '작업별', icon: Layers },
  { mode: 'status', label: '상태별', icon: ListOrdered },
  { mode: 'board', label: '보드', icon: LayoutGrid },
  { mode: 'list', label: '전체', icon: List },
];

const DUE_DATE_OPTIONS = [
  { value: 'overdue', label: '지연됨' },
  { value: 'today', label: '오늘' },
  { value: 'week', label: '이번 주' },
  { value: 'none', label: '마감일 없음' },
];

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return '요청을 처리하지 못했습니다';
}

// ─── Main Page ────────────────────────────────────────────

function TasksPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? 'agent';
  const canBulkDelete = role === 'owner' || role === 'manager';

  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createPresetStatus, setCreatePresetStatus] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  /** reorder 실패 시 StatusView 로컬 순서를 props 기준으로 리셋하기 위한 key */
  const [dndResetKey, setDndResetKey] = useState(0);

  // 필터
  const [searchText, setSearchText] = useState('');
  const deferredSearch = useDeferredValue(searchText);
  const [statusFilter, setStatusFilter] = useState('');
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // 선택 (전체 뷰)
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

  const {
    data: tasks = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks.findAll(),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive),
    [employees],
  );

  // ─── Mutations (성공 toast + 실패 toast + invalidate) ────

  const createMutation = useMutation({
    mutationFn: (dto: CreateTaskDto) => api.tasks.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('업무가 등록되었습니다');
      setIsCreateModalOpen(false);
      setCreatePresetStatus(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTaskDto }) => api.tasks.update(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('업무가 수정되었습니다');
      setEditingTask(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // 상태 변경 (DnD/퀵액션) — 낙관적 캐시 업데이트 + 실패 시 롤백
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.tasks.update(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previous = queryClient.getQueryData<Task[]>(['tasks']);
      queryClient.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => (t.id === id ? { ...t, status } : t)),
      );
      return { previous };
    },
    onSuccess: (_data, { status }) => {
      toast.success(`'${taskStatusLabel(status)}' 상태로 변경되었습니다`);
    },
    onError: (e, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['tasks'], context.previous);
      toast.error(getErrorMessage(e));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => api.tasks.reorder(orderedIds),
    onSuccess: () => toast.success('순서가 저장되었습니다'),
    onError: (e) => {
      toast.error(getErrorMessage(e));
      setDndResetKey((k) => k + 1);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.tasks.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('업무가 삭제되었습니다');
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      api.tasks.bulkUpdateStatus(ids, status),
    onSuccess: (_data, { ids, status }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`${ids.length}개 업무가 '${taskStatusLabel(status)}' 상태로 변경되었습니다`);
      setSelectedTasks(new Set());
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.tasks.bulkDelete(ids),
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`${ids.length}개 업무가 삭제되었습니다`);
      setSelectedTasks(new Set());
      setBulkDeleteOpen(false);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ─── 필터링 ──────────────────────────────────────────────

  const matchesDueDateFilter = (task: Task) => {
    if (!dueDateFilter) return true;
    if (dueDateFilter === 'none') return !task.dueDate;
    if (!task.dueDate) return false;
    const d = new Date(task.dueDate);
    const today = new Date(new Date().toDateString());
    if (dueDateFilter === 'overdue') {
      return d < today && task.status !== 'completed' && task.status !== 'cancelled';
    }
    if (dueDateFilter === 'today') return d.toDateString() === today.toDateString();
    if (dueDateFilter === 'week') {
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() + 7);
      return d >= today && d <= weekEnd;
    }
    return true;
  };

  const filteredTasks = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return tasks
      .filter((task) => {
        // 취소 업무는 기본 숨김 — 상태 필터로 '취소'를 선택했을 때만 조회 (아카이브)
        if (statusFilter === 'cancelled') {
          if (task.status !== 'cancelled') return false;
        } else {
          if (task.status === 'cancelled') return false;
          if (statusFilter && task.status !== statusFilter) return false;
        }
        if (categoryFilter && task.category !== categoryFilter) return false;
        if (!matchesDueDateFilter(task)) return false;
        if (showOnlyMyTasks && user && task.assignedToId !== user.id) return false;
        if (assigneeFilter === ASSIGNEE_UNASSIGNED && task.assignedToId) return false;
        if (
          assigneeFilter &&
          assigneeFilter !== ASSIGNEE_UNASSIGNED &&
          task.assignedToId !== assigneeFilter
        ) {
          return false;
        }
        if (q) {
          const haystack = [
            task.title,
            task.content,
            task.contact?.name,
            task.contact?.phone,
            task.property?.site?.name,
            task.property?.unit?.name,
            task.property?.unit?.dong?.name,
            task.property ? getPropertyLabel(task) : null,
            task.assignedTo?.name,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, statusFilter, categoryFilter, dueDateFilter, showOnlyMyTasks, user, assigneeFilter, deferredSearch]);

  const hasActiveFilters =
    !!statusFilter ||
    !!dueDateFilter ||
    !!categoryFilter ||
    !!assigneeFilter ||
    showOnlyMyTasks ||
    !!searchText.trim();

  const resetFilters = () => {
    setSearchText('');
    setStatusFilter('');
    setDueDateFilter('');
    setCategoryFilter('');
    setAssigneeFilter('');
    setShowOnlyMyTasks(false);
  };

  const handleMyTasksChange = (checked: boolean) => {
    setShowOnlyMyTasks(checked);
    if (checked) setAssigneeFilter('');
  };

  const handleAssigneeFilterChange = (value: string) => {
    setAssigneeFilter(value);
    if (value) setShowOnlyMyTasks(false);
  };

  // ─── 키보드 단축키: N 새 업무 / "/" 검색 포커스 ──────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')
      ) {
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setEditingTask(null);
        setIsCreateModalOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        searchWrapRef.current?.querySelector('input')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── 핸들러 ──────────────────────────────────────────────

  const openCreate = (presetStatus?: string) => {
    setEditingTask(null);
    setCreatePresetStatus(presetStatus ?? null);
    setIsCreateModalOpen(true);
  };

  /** 단건 삭제 요청 — agent는 시스템/AI 생성 업무 삭제 불가 */
  const requestDelete = (task: Task) => {
    if (task.source !== 'manual' && role === 'agent') {
      toast.error('시스템/AI 생성 업무는 매니저 이상만 삭제할 수 있습니다');
      return;
    }
    setDeleteTarget(task);
  };

  const handleStatusChange = (id: string, status: string) =>
    updateStatusMutation.mutate({ id, status });

  const handleInlineUpdate = (id: string, dto: UpdateTaskDto) =>
    updateMutation.mutate({ id, dto });

  // 선택 관련
  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedTasks.size === filteredTasks.length) setSelectedTasks(new Set());
    else setSelectedTasks(new Set(filteredTasks.map((t) => t.id)));
  };

  // 필터/데이터 변경으로 목록에서 사라진 업무는 선택에서 제거 (숨은 업무 일괄 처리 방지)
  useEffect(() => {
    setSelectedTasks((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredTasks.map((t) => t.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredTasks]);

  const hasSelection = selectedTasks.size > 0;
  const isAllSelected = filteredTasks.length > 0 && selectedTasks.size === filteredTasks.length;

  // ─── 본문 콘텐츠 ─────────────────────────────────────────

  const showCancelledHint =
    statusFilter === 'cancelled' && (viewMode === 'board' || viewMode === 'status');

  let content: ReactNode;
  if (isError) {
    content = (
      <EmptyState
        icon={AlertCircle}
        title="업무 목록을 불러오지 못했습니다"
        description={getErrorMessage(error)}
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            다시 시도
          </Button>
        }
      />
    );
  } else if (isLoading) {
    content = <LoadingSkeleton />;
  } else if (tasks.length === 0) {
    content = (
      <EmptyState
        icon={ClipboardList}
        title="등록된 업무가 없습니다"
        description="첫 업무를 추가해 후속 작업 누락을 방지하세요"
        action={
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="size-4" />
            업무 추가
          </Button>
        }
      />
    );
  } else if (filteredTasks.length === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="조건에 맞는 업무가 없습니다"
        description="검색어 또는 필터를 조정해 보세요"
        action={
          hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              <X className="size-4" />
              필터 초기화
            </Button>
          ) : undefined
        }
      />
    );
  } else if (showCancelledHint) {
    content = (
      <EmptyState
        icon={XCircle}
        title="취소된 업무는 보드/상태별 뷰에 표시되지 않습니다"
        description="취소 업무는 전체 또는 작업별 뷰에서 확인하세요"
        action={
          <Button variant="outline" size="sm" onClick={() => setViewMode('list')}>
            전체 뷰로 보기
          </Button>
        }
      />
    );
  } else if (viewMode === 'board') {
    content = (
      <BoardView
        tasks={filteredTasks}
        onEdit={setEditingTask}
        onStatusChange={handleStatusChange}
        onDelete={requestDelete}
        onAddTask={(status) => openCreate(status)}
      />
    );
  } else if (viewMode === 'status') {
    content = (
      <StatusView
        key={dndResetKey}
        filteredTasks={filteredTasks}
        onRowClick={setEditingTask}
        onStatusChange={handleStatusChange}
        onDelete={requestDelete}
        onUpdate={handleInlineUpdate}
        onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
        employeeOptions={activeEmployees}
      />
    );
  } else if (viewMode === 'category') {
    content = (
      <div>
        {Object.entries(categoryConfig).map(([catKey, catData]) => {
          const catTasks = filteredTasks.filter((t) => t.category === catKey);
          if (catTasks.length === 0) return null;
          return (
            <CategoryTaskTable
              key={catKey}
              categoryData={catData}
              tasks={catTasks}
              onRowClick={setEditingTask}
              onStatusChange={handleStatusChange}
              onDelete={requestDelete}
              onUpdate={handleInlineUpdate}
              employeeOptions={activeEmployees}
            />
          );
        })}
      </div>
    );
  } else {
    content = (
      <div>
        {/* 일괄 작업 바 */}
        {hasSelection && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-info/30 bg-info-soft/50 p-2">
            <span className="text-sm font-medium text-info">{selectedTasks.size}개 선택됨</span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={bulkStatusMutation.isPending}
                onClick={() =>
                  bulkStatusMutation.mutate({ ids: [...selectedTasks], status: 'in_progress' })
                }
              >
                <Clock className="size-3" /> 진행중
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={bulkStatusMutation.isPending}
                onClick={() =>
                  bulkStatusMutation.mutate({ ids: [...selectedTasks], status: 'completed' })
                }
              >
                <CheckCircle2 className="size-3" /> 완료
              </Button>
              {canBulkDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:bg-destructive-soft hover:text-destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="size-3" /> 삭제
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedTasks(new Set())}
              >
                <X className="size-3" /> 선택 취소
              </Button>
            </div>
          </div>
        )}

        <table className="w-full">
          <thead>
            <NotionTableHeader
              showCategory
              showCheckbox
              isAllSelected={isAllSelected}
              onToggleAll={toggleAllSelection}
            />
          </thead>
          <tbody>
            {filteredTasks.map((task, idx) => (
              <NotionTableRow
                key={task.id}
                task={task}
                index={idx + 1}
                onRowClick={setEditingTask}
                onStatusChange={handleStatusChange}
                onDelete={requestDelete}
                onUpdate={handleInlineUpdate}
                employeeOptions={activeEmployees}
                showCategory
                showCheckbox
                isSelected={selectedTasks.has(task.id)}
                onToggleSelect={toggleTaskSelection}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex flex-col pt-4">
      <PageHeader
        title="업무"
        description="사무소 전체의 후속 작업을 만들고 상태·담당·마감일로 관리합니다"
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-md border p-0.5">
              {VIEW_OPTIONS.map(({ mode, label, icon: Icon }) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode(mode)}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              ))}
            </div>
            <Button onClick={() => openCreate()}>
              <Plus className="size-4" />
              업무 추가
            </Button>
          </>
        }
      />

      {/* 필터 바 (sticky) */}
      <div className="sticky top-0 z-10 bg-background pb-3">
        <FilterBar>
          <div ref={searchWrapRef}>
            <FilterSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="제목·내용·연락처 검색 ( / )"
            />
          </div>
          <div className="flex h-8 items-center gap-2 rounded-md border border-dashed bg-background px-3">
            <Switch size="sm" checked={showOnlyMyTasks} onCheckedChange={handleMyTasksChange} />
            <label
              className="cursor-pointer text-xs font-medium text-muted-foreground select-none"
              onClick={() => handleMyTasksChange(!showOnlyMyTasks)}
            >
              <User className="mr-1 inline size-3" />내 업무
            </label>
          </div>
          <FilterSelect
            label="상태"
            value={statusFilter}
            onChange={setStatusFilter}
            options={TASK_STATUSES.map((s) => ({ value: s, label: taskStatusLabel(s) }))}
          />
          <FilterSelect
            label="마감일"
            value={dueDateFilter}
            onChange={(v) => setDueDateFilter(v as DueDateFilter)}
            options={DUE_DATE_OPTIONS}
          />
          <FilterSelect
            label="카테고리"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={Object.entries(categoryConfig).map(([value, { label }]) => ({ value, label }))}
          />
          <FilterSelect
            label="담당자"
            value={assigneeFilter}
            onChange={handleAssigneeFilterChange}
            options={[
              { value: ASSIGNEE_UNASSIGNED, label: '미배정' },
              ...activeEmployees.map((e) => ({ value: e.id, label: e.name })),
            ]}
          />
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-8 gap-1.5 text-xs text-muted-foreground"
            >
              <X className="size-3" />
              필터 초기화
            </Button>
          )}
          <FilterCount n={filteredTasks.length} />
        </FilterBar>
      </div>

      {content}

      {/* 생성/수정 다이얼로그 */}
      <TaskFormModal
        isOpen={isCreateModalOpen || !!editingTask}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreatePresetStatus(null);
          setEditingTask(null);
        }}
        task={editingTask}
        presetStatus={createPresetStatus}
        employeeOptions={activeEmployees}
        onSubmit={(data) => {
          if (editingTask) {
            updateMutation.mutate({ id: editingTask.id, dto: data as UpdateTaskDto });
          } else {
            createMutation.mutate(data as CreateTaskDto);
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* 단건 삭제 확인 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="업무를 삭제할까요?"
        description={
          deleteTarget ? (
            <>
              “{deleteTarget.title}” 업무가 영구 삭제됩니다.
              {deleteTarget.source !== 'manual' &&
                ' 시스템/AI가 생성한 업무는 규칙에 따라 다시 생성될 수 있습니다.'}
            </>
          ) : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />

      {/* 일괄 삭제 확인 */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`${selectedTasks.size}개 업무를 삭제할까요?`}
        description="선택한 업무가 모두 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
        confirmLabel="모두 삭제"
        destructive
        loading={bulkDeleteMutation.isPending}
        onConfirm={() => bulkDeleteMutation.mutate([...selectedTasks])}
      />
    </div>
  );
}

// ─── Board View (칸반 + drag-and-drop 상태 변경) ──────────

type BoardHandlers = {
  onEdit: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (task: Task) => void;
  onAddTask: (status: string) => void;
};

function BoardView({ tasks, ...handlers }: BoardHandlers & { tasks: Task[] }) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const task = activeTask;
    setActiveTask(null);
    const { over } = event;
    if (!over || !task) return;
    const newStatus = over.id as string;
    if (boardColumns.some((c) => c.status === newStatus) && newStatus !== task.status) {
      handlers.onStatusChange(task.id, newStatus);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveTask(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-3 gap-4">
        {boardColumns.map((column) => (
          <BoardColumn
            key={column.status}
            column={column}
            tasks={tasks.filter((t) => t.status === column.status)}
            {...handlers}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="pointer-events-none w-64 rotate-2 opacity-95">
            <KanbanCard
              task={activeTask}
              onEdit={() => {}}
              onStatusChange={() => {}}
              onDelete={() => {}}
              currentStatus={activeTask.status}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  column,
  tasks,
  onEdit,
  onStatusChange,
  onDelete,
  onAddTask,
}: BoardHandlers & { column: (typeof boardColumns)[number]; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium',
            column.bgColor,
          )}
        >
          <span className={cn('size-2 rounded-full', column.dotColor)} />
          {column.title}
          <span className="text-xs opacity-70 tabular-nums">{tasks.length}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="size-6 p-0 text-muted-foreground"
          onClick={() => onAddTask(column.status)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[200px] flex-1 rounded-lg p-2 transition-shadow',
          column.columnBg,
          isOver && 'ring-2 ring-info/40',
        )}
      >
        <div className="space-y-2">
          {tasks.map((task) => (
            <DraggableBoardCard
              key={task.id}
              task={task}
              onEdit={onEdit}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              currentStatus={column.status}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-start py-2 text-muted-foreground hover:bg-background/60"
            onClick={() => onAddTask(column.status)}
          >
            <Plus className="size-4" />새 업무
          </Button>
        </div>
      </div>
    </div>
  );
}

function DraggableBoardCard(props: {
  task: Task;
  onEdit: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (task: Task) => void;
  currentStatus: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('touch-none', isDragging && 'opacity-40')}
    >
      <KanbanCard {...props} />
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────

function KanbanCard({
  task,
  onEdit,
  onStatusChange,
  onDelete,
  currentStatus,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (task: Task) => void;
  currentStatus: string;
}) {
  const overdue = isOverdue(task);
  const pCfg = priorityConfig[task.priority as TaskPriority];
  const cCfg = categoryConfig[task.category as TaskCategory] ?? categoryConfig.other;

  return (
    <div
      className={cn(
        'group cursor-pointer rounded-md border bg-background p-3 transition-shadow hover:shadow-sm',
        overdue && 'border-destructive/40 bg-destructive-soft/20',
      )}
      onClick={() => onEdit(task)}
    >
      <div className="mb-2 flex items-start gap-1.5">
        <h4
          className={cn(
            'flex-1 text-sm leading-tight font-medium',
            task.status === 'completed' && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </h4>
        <TaskSourceBadge source={task.source} className="mt-px" />
        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
          >
            <Edit className="size-3" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="size-6 p-0">
                <MoreHorizontal className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {currentStatus !== 'pending' && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, 'pending');
                  }}
                >
                  <Circle className="mr-2 size-4" />
                  대기로 변경
                </DropdownMenuItem>
              )}
              {currentStatus !== 'in_progress' && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, 'in_progress');
                  }}
                >
                  <ArrowRight className="mr-2 size-4" />
                  진행중으로 변경
                </DropdownMenuItem>
              )}
              {currentStatus !== 'completed' && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, 'completed');
                  }}
                >
                  <CheckCircle2 className="mr-2 size-4" />
                  완료로 변경
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(task);
                }}
              >
                <Trash2 className="mr-2 size-4" />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge className={cn(pCfg?.color, 'text-xs')}>{pCfg?.label}</Badge>
        <Badge className={cn(cCfg.color, 'gap-1 text-xs')}>
          {cCfg.icon}
          {cCfg.label}
        </Badge>
        <DueDateText task={task} />
      </div>

      <TaskContextChips task={task} compact />

      {task.assignedTo && (
        <div className="mt-2 flex items-center gap-1.5">
          <Avatar className="size-5">
            <AvatarFallback className="text-[10px]">
              {task.assignedTo.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-xs text-muted-foreground">{task.assignedTo.name}</span>
        </div>
      )}
    </div>
  );
}
