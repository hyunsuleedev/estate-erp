import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Plus,
  SearchX,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  type CreateTaskDto,
  type Task,
  type TaskContact,
  type UpdateTaskDto,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, EmptyState } from '@/components/domain';
import {
  taskStatusLabel,
  type StatusChangeOptions,
  type TaskUpdatePatch,
} from './-task-shared';
import {
  countByCategory,
  countByDueFacet,
  countByPriority,
  countByScope,
  countByStatus,
  applyTaskUpdate,
  filterTasks,
  isTaskOverdue,
  listStatusColumns,
  matchesTaskFilters,
  nextCheckStatus,
  type DueDateFilter,
  type HeldTaskState,
  type TaskFilterState,
} from './-task-filters';
import {
  effectiveGroupBy,
  parseTaskDisplay,
  parseTaskScope,
  type TaskDisplay,
  type TaskScope,
} from './-task-display';
import { LoadingSkeleton, StatusView, TaskGroupedList, type TaskCreatePreset } from './-task-table';
import { BoardView } from './-task-board';
import { TaskToolbar } from './-task-toolbar';
import { TaskFormModal } from './-task-form';

export const Route = createFileRoute('/_authenticated/tasks/')({
  component: TasksPage,
});

// ─── Config ───────────────────────────────────────────────


const DISPLAY_STORAGE_KEY = 'estate-erp.tasks.display';
const SCOPE_STORAGE_KEY = 'estate-erp.tasks.scope';
/** 예전 보기 설정(작업별·상태별·보드·전체) — 처음 한 번 새 표시 설정으로 옮긴다 */
const LEGACY_VIEW_MODE_STORAGE_KEY = 'estate-erp.tasks.viewMode';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // 저장소 접근 불가(프라이빗 모드 등) — 기본값
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 무시 — 다음 진입 때 기본값
  }
}

const readStoredDisplay = (): TaskDisplay =>
  parseTaskDisplay(readStorage(DISPLAY_STORAGE_KEY), readStorage(LEGACY_VIEW_MODE_STORAGE_KEY));

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return '요청을 처리하지 못했습니다';
}

type CreatePreset = TaskCreatePreset;
type StatusChangeVars = {
  id: string;
  status: string;
  prevStatus?: string;
  isUndo?: boolean;
  /** 낙관적 반영 직전 캐시 — 실패 시 복원용 */
  snapshot?: Task[];
};
type InlineUpdateVars = { id: string; dto: TaskUpdatePatch; snapshot?: Task[] };
type ModalUpdateVars = { id: string; dto: UpdateTaskDto; snapshot?: Task[] };
type BulkStatusVars = { ids: string[]; status: string; snapshot?: Task[] };

/** 업무 쓰기는 모두 한 줄로 세워 누른 순서대로 보낸다 (생성·수정·상태·순서·삭제·일괄) */
const TASK_WRITE_KEY = ['tasks', 'write'];
const TASK_WRITE_SCOPE = { id: 'tasks-write' };

// ─── Main Page ────────────────────────────────────────────

function TasksPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? 'agent';
  const canBulkDelete = role === 'owner' || role === 'manager';

  const [display, setDisplay] = useState<TaskDisplay>(readStoredDisplay);
  const [scope, setScope] = useState<TaskScope>(() => parseTaskScope(readStorage(SCOPE_STORAGE_KEY)));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isBoard = display.layout === 'board';
  const groupBy = effectiveGroupBy(display.groupBy, scope);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createPreset, setCreatePreset] = useState<CreatePreset | null>(null);
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
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const searchWrapRef = useRef<HTMLLabelElement>(null);

  // 선택 (목록 보기)
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  /**
   * 방금 체크·선택·메뉴로 상태를 바꾼 업무의 "바꾸기 전" 상태 — 필터·뷰를 바꾸기 전까지 행/카드를 제자리에 둔다.
   * (완료 체크 직후 행이 빠지거나 다른 그룹으로 이동하면 다음 행이 커서 밑으로 올라와 연속 클릭 시 잘못 완료됨)
   */
  const [heldTasks, setHeldTasks] = useState<Map<string, HeldTaskState>>(new Map());

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

  // ─── Mutations ───────────────────────────────────────────

  // ─── 업무 쓰기 공통 규칙 — 연속·혼합 조작에도 마지막 의도가 남도록 ──────
  //  모든 업무 쓰기(생성·모달 수정·상태·인라인·순서·삭제·일괄)는 같은 scope 하나로 한 줄로 세운다.
  //  1) 낙관적 반영을 클릭 순간 동기로 캐시에 쓴다 → 다음 클릭은 항상 최신 값에서 계산
  //  2) 같은 scope → 서버에 누른 순서대로 도착 (나중에 누른 일괄 변경이 앞서 쌓인 개별 변경에 덮이지 않음)
  //  3) 마지막 쓰기가 끝났을 때만 재조회 → 앞 요청의 응답이 뒤 클릭의 낙관적 상태를 덮지 않음
  //  4) 실패 시 스냅샷 복원은 혼자 진행 중일 때만 (뒤에 쌓인 변경을 지우지 않도록), 그 외엔 마지막 재조회가 정답을 가져온다

  const readCachedTask = (id: string) =>
    queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === id);

  /** 진행 중인 재조회를 취소(즉시 되돌림)한 뒤 그 위에 낙관적 변경을 쓴다. 쓰기 전 스냅샷을 돌려준다. */
  const applyOptimisticTask = (id: string, patch: (task: Task) => Task) => {
    void queryClient.cancelQueries({ queryKey: ['tasks'] });
    const snapshot = queryClient.getQueryData<Task[]>(['tasks']);
    queryClient.setQueryData<Task[]>(['tasks'], (old) => old?.map((t) => (t.id === id ? patch(t) : t)));
    return snapshot;
  };

  const isLastTaskWrite = () => queryClient.isMutating({ mutationKey: TASK_WRITE_KEY }) <= 1;

  const settleTaskWrite = () => {
    if (isLastTaskWrite()) void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const rollbackTaskWrite = (snapshot: Task[] | undefined) => {
    if (snapshot && isLastTaskWrite()) queryClient.setQueryData(['tasks'], snapshot);
  };

  const createMutation = useMutation({
    mutationKey: TASK_WRITE_KEY,
    scope: TASK_WRITE_SCOPE,
    mutationFn: (dto: CreateTaskDto) => api.tasks.create(dto),
    onSuccess: () => {
      toast.success('업무가 등록되었습니다');
      setIsCreateModalOpen(false);
      setCreatePreset(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
    onSettled: settleTaskWrite,
  });

  // 모달 저장 (전체 필드)
  const updateMutation = useMutation({
    mutationKey: TASK_WRITE_KEY,
    scope: TASK_WRITE_SCOPE,
    mutationFn: ({ id, dto }: ModalUpdateVars) => api.tasks.update(id, dto),
    onSuccess: () => {
      toast.success('업무가 수정되었습니다');
      setEditingTask(null);
    },
    onError: (e, { snapshot }) => {
      rollbackTaskWrite(snapshot);
      toast.error(getErrorMessage(e));
    },
    onSettled: settleTaskWrite,
  });

  // 인라인 수정 (우선순위·마감일·담당자) — 성공 토스트는 생략(화면이 곧 피드백)
  const inlineUpdateMutation = useMutation({
    mutationKey: TASK_WRITE_KEY,
    scope: TASK_WRITE_SCOPE,
    mutationFn: ({ id, dto }: InlineUpdateVars) => api.tasks.update(id, dto),
    onError: (e, { snapshot }) => {
      rollbackTaskWrite(snapshot);
      toast.error(getErrorMessage(e));
    },
    onSettled: settleTaskWrite,
  });

  // 상태 변경 (체크/DnD/퀵액션) — 되돌리기 토스트
  const updateStatusMutation = useMutation({
    mutationKey: TASK_WRITE_KEY,
    scope: TASK_WRITE_SCOPE,
    mutationFn: ({ id, status }: StatusChangeVars) => api.tasks.update(id, { status }),
    onSuccess: (_data, { id, status, prevStatus, isUndo }) => {
      if (isUndo) {
        toast.success('변경을 되돌렸습니다');
        return;
      }
      const message =
        status === 'completed' ? '업무를 완료했습니다' : `'${taskStatusLabel(status)}' 상태로 변경되었습니다`;
      toast.success(
        message,
        prevStatus && prevStatus !== status
          ? {
              action: {
                label: '되돌리기',
                onClick: () => changeStatus(id, prevStatus, { isUndo: true }),
              },
            }
          : undefined,
      );
    },
    onError: (e, { snapshot }) => {
      rollbackTaskWrite(snapshot);
      toast.error(getErrorMessage(e));
    },
    onSettled: settleTaskWrite,
  });

  function changeStatus(
    id: string,
    status: string,
    options: { isUndo?: boolean; fromDrag?: boolean } = {},
  ) {
    const current = readCachedTask(id); // 렌더 시점이 아니라 캐시의 최신 상태
    if (!current) return;
    if (options.fromDrag) {
      // 드래그는 사용자가 위치를 직접 정한 것 — 붙잡아 둔 위치를 풀고 놓은 곳으로 보낸다
      setHeldTasks((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      if (current.status === status) return; // 실제 상태는 이미 같음 — 위치만 갱신
    } else {
      // 처음 바꾸기 전 상태만 기억 (연속 클릭 중간 상태로 덮어쓰지 않음)
      setHeldTasks((prev) => (prev.has(id) ? prev : new Map(prev).set(id, { status: current.status })));
    }
    if (current.status === status) return;
    const snapshot = applyOptimisticTask(id, (t) => ({ ...t, status }));
    updateStatusMutation.mutate({ id, status, prevStatus: current.status, isUndo: options.isUndo, snapshot });
  }

  /** 행 앞 체크: 대기 → 진행중 → 완료 → 대기. 캐시의 최신 상태에서 다음 단계를 계산한다. */
  const handleCycleCheck = (id: string) => {
    const current = readCachedTask(id);
    if (!current || current.status === 'cancelled') return;
    changeStatus(id, nextCheckStatus(current.status));
  };

  const handleInlineUpdate = (id: string, dto: TaskUpdatePatch) => {
    const snapshot = applyOptimisticTask(id, (t) => applyTaskUpdate(t, dto, { employees: activeEmployees }));
    inlineUpdateMutation.mutate({ id, dto, snapshot });
  };

  /** 수정 창 저장 — 즉시 캐시에 반영해 이어지는 편집(재열기 포함)이 저장한 값에서 시작하게 한다 */
  const submitTaskEdit = (id: string, dto: UpdateTaskDto, contact?: TaskContact | null) => {
    const snapshot = applyOptimisticTask(id, (t) =>
      applyTaskUpdate(t, dto, { employees: activeEmployees, contact }),
    );
    updateMutation.mutate({ id, dto, snapshot });
  };

  /** 수정 창은 렌더 시점 객체가 아니라 캐시의 최신 업무로 연다 */
  const openEdit = (task: Task) => setEditingTask(readCachedTask(task.id) ?? task);

  const reorderMutation = useMutation({
    mutationKey: TASK_WRITE_KEY,
    scope: TASK_WRITE_SCOPE,
    mutationFn: (orderedIds: string[]) => api.tasks.reorder(orderedIds),
    onError: (e) => {
      toast.error(getErrorMessage(e));
      setDndResetKey((k) => k + 1);
    },
    onSettled: settleTaskWrite,
  });

  const deleteMutation = useMutation({
    mutationKey: TASK_WRITE_KEY,
    scope: TASK_WRITE_SCOPE,
    mutationFn: (id: string) => api.tasks.remove(id),
    onSuccess: () => {
      toast.success('업무가 삭제되었습니다');
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
    onSettled: settleTaskWrite,
  });

  const bulkStatusMutation = useMutation({
    mutationKey: TASK_WRITE_KEY,
    scope: TASK_WRITE_SCOPE,
    mutationFn: ({ ids, status }: BulkStatusVars) => api.tasks.bulkUpdateStatus(ids, status),
    onSuccess: (_data, { ids, status }) => {
      toast.success(`${ids.length}개 업무가 '${taskStatusLabel(status)}' 상태로 변경되었습니다`);
    },
    onError: (e, { snapshot }) => {
      rollbackTaskWrite(snapshot);
      toast.error(getErrorMessage(e));
    },
    onSettled: settleTaskWrite,
  });

  /** 일괄 상태 변경 — 다른 쓰기와 같은 순서 규칙 + 즉시 화면 반영 */
  const runBulkStatus = (status: string) => {
    const ids = [...selectedTasks];
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    void queryClient.cancelQueries({ queryKey: ['tasks'] });
    const snapshot = queryClient.getQueryData<Task[]>(['tasks']);
    queryClient.setQueryData<Task[]>(['tasks'], (old) =>
      old?.map((t) => (idSet.has(t.id) ? { ...t, status } : t)),
    );
    setSelectedTasks(new Set());
    bulkStatusMutation.mutate({ ids, status, snapshot });
  };

  const bulkDeleteMutation = useMutation({
    mutationKey: TASK_WRITE_KEY,
    scope: TASK_WRITE_SCOPE,
    mutationFn: (ids: string[]) => api.tasks.bulkDelete(ids),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length}개 업무가 삭제되었습니다`);
      setSelectedTasks(new Set());
      setBulkDeleteOpen(false);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
    onSettled: settleTaskWrite,
  });

  // ─── 필터링 / 집계 ───────────────────────────────────────

  const userId = user?.id ?? null;
  const filters = useMemo<TaskFilterState>(
    () => ({
      status: statusFilter,
      due: dueDateFilter,
      category: categoryFilter,
      // 내 담당 탭에서는 담당자 필터가 의미 없다 (탭이 이미 나로 좁힘)
      assignee: scope === 'mine' ? '' : assigneeFilter,
      scope,
      currentUserId: userId,
      hideCompleted: !display.showCompleted,
      priorities: priorityFilter,
      search: deferredSearch,
    }),
    [
      statusFilter,
      dueDateFilter,
      categoryFilter,
      assigneeFilter,
      scope,
      userId,
      display.showCompleted,
      priorityFilter,
      deferredSearch,
    ],
  );

  const filteredTasks = useMemo(
    () => filterTasks(tasks, filters, heldTasks),
    [tasks, filters, heldTasks],
  );
  // 필터·보기·묶기·정렬을 바꾸면 붙잡아 둔 업무를 놓아 실제 상태대로 다시 배치
  useEffect(() => {
    setHeldTasks((prev) => (prev.size === 0 ? prev : new Map()));
  }, [filters, display.layout, groupBy, display.sortBy]);
  const dueCounts = useMemo(() => countByDueFacet(tasks, filters), [tasks, filters]);
  const categoryCounts = useMemo(() => countByCategory(tasks, filters), [tasks, filters]);
  const statusCounts = useMemo(() => countByStatus(tasks, filters), [tasks, filters]);
  const priorityCounts = useMemo(() => countByPriority(tasks, filters), [tasks, filters]);
  const scopeCounts = useMemo(() => countByScope(tasks, filters), [tasks, filters]);
  /** 툴바 "기한 지남 N" — 마감 필터를 뺀 지금 탭·필터 기준 */
  const overdueInScope = useMemo(
    () => tasks.filter((task) => isTaskOverdue(task) && matchesTaskFilters(task, { ...filters, due: '' })).length,
    [tasks, filters],
  );

  const activeFilterCount =
    (statusFilter ? 1 : 0) +
    (dueDateFilter ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (scope !== 'mine' && assigneeFilter ? 1 : 0) +
    (priorityFilter.length > 0 ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0 || !!searchText.trim();

  const resetFilters = () => {
    setSearchText('');
    setStatusFilter('');
    setDueDateFilter('');
    setCategoryFilter('');
    setAssigneeFilter('');
    setPriorityFilter([]);
  };

  const changeDisplay = (patch: Partial<TaskDisplay>) => {
    setDisplay((prev) => {
      const next = { ...prev, ...patch };
      writeStorage(DISPLAY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const changeScope = (next: TaskScope) => {
    setScope(next);
    writeStorage(SCOPE_STORAGE_KEY, next);
  };

  // ─── 핸들러 ──────────────────────────────────────────────

  const openCreate = (preset?: CreatePreset) => {
    setEditingTask(null);
    setCreatePreset(preset ?? null);
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

  const handleStatusChange = (id: string, status: string, options?: StatusChangeOptions) =>
    changeStatus(id, status, { fromDrag: options?.fromDrag });


  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
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

  // 보드로 바꾸면 선택 해제 (보드에는 선택 칸이 없다)
  useEffect(() => {
    if (isBoard) setSelectedTasks(new Set());
  }, [isBoard]);

  const hasSelection = !isBoard && selectedTasks.size > 0;

  // ─── 키보드 단축키: N 새 업무 / "/" 검색 / Esc 선택 해제 ──

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"]',
        )
      ) {
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openCreate();
      } else if (e.key === '/') {
        e.preventDefault();
        searchWrapRef.current?.querySelector('input')?.focus();
      } else if (e.key === 'Escape') {
        setSelectedTasks((prev) => (prev.size === 0 ? prev : new Set()));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 본문 콘텐츠 ─────────────────────────────────────────

  const rowHandlers = {
    onRowClick: openEdit,
    onStatusChange: handleStatusChange,
    onCycleCheck: handleCycleCheck,
    onDelete: requestDelete,
    onUpdate: handleInlineUpdate,
    employeeOptions: activeEmployees,
  };

  const showCancelledHint = statusFilter === 'cancelled' && isBoard;
  /** 상태별 + 직접 정렬일 때만 끌어서 순서·상태를 바꾼다 */
  const dragEnabled = groupBy === 'status' && display.sortBy === 'manual' && statusFilter !== 'cancelled';
  const listProps = {
    visible: display.visible,
    selectedIds: selectedTasks,
    onToggleSelect: toggleTaskSelection,
    onAddTask: (preset: CreatePreset) => openCreate(preset),
    ...rowHandlers,
  };

  let content: ReactNode;
  if (isError) {
    content = (
      <CenteredState>
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
      </CenteredState>
    );
  } else if (isLoading) {
    content = <LoadingSkeleton />;
  } else if (tasks.length === 0) {
    content = (
      <CenteredState>
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
      </CenteredState>
    );
  } else if (filteredTasks.length === 0) {
    content = (
      <CenteredState>
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
      </CenteredState>
    );
  } else if (showCancelledHint) {
    content = (
      <CenteredState>
        <EmptyState
          icon={XCircle}
          title="취소된 업무는 보드에 표시되지 않습니다"
          description="취소 업무는 목록 보기에서 확인하세요"
          action={
            <Button variant="outline" size="sm" onClick={() => changeDisplay({ layout: 'list' })}>
              목록으로 보기
            </Button>
          }
        />
      </CenteredState>
    );
  } else if (isBoard) {
    content = (
      <BoardView
        tasks={filteredTasks}
        heldTasks={heldTasks}
        onEdit={openEdit}
        onStatusChange={handleStatusChange}
        onCycleCheck={handleCycleCheck}
        onDelete={requestDelete}
        onAddTask={(status) => openCreate({ status })}
      />
    );
  } else if (dragEnabled) {
    content = (
      <StatusView
        key={dndResetKey}
        filteredTasks={filteredTasks}
        heldTasks={heldTasks}
        columns={listStatusColumns(statusFilter, display.showCompleted)}
        onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
        {...listProps}
      />
    );
  } else {
    content = (
      <TaskGroupedList
        tasks={filteredTasks}
        groupBy={groupBy}
        sortBy={display.sortBy}
        heldTasks={heldTasks}
        currentUserId={userId}
        {...listProps}
      />
    );
  }

  return (
    <div data-tasks-page className="relative -m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <TaskToolbar
        scope={scope}
        scopeCounts={scopeCounts}
        onScopeChange={changeScope}
        search={searchText}
        onSearchChange={setSearchText}
        searchWrapRef={searchWrapRef}
        overdueCount={overdueInScope}
        overdueActive={dueDateFilter === 'overdue'}
        onToggleOverdue={() => setDueDateFilter((prev) => (prev === 'overdue' ? '' : 'overdue'))}
        filtersOpen={filtersOpen}
        onFiltersOpenChange={setFiltersOpen}
        activeFilterCount={activeFilterCount}
        display={display}
        onDisplayChange={changeDisplay}
        onCreate={() => openCreate()}
        status={statusFilter}
        statusCounts={statusCounts}
        onStatusChange={setStatusFilter}
        due={dueDateFilter}
        dueCounts={dueCounts}
        onDueChange={setDueDateFilter}
        category={categoryFilter}
        categoryCounts={categoryCounts}
        onCategoryChange={setCategoryFilter}
        priorities={priorityFilter}
        priorityCounts={priorityCounts}
        onPrioritiesChange={setPriorityFilter}
        assignee={assigneeFilter}
        employees={activeEmployees}
        onAssigneeChange={setAssigneeFilter}
        resultCount={isLoading ? null : filteredTasks.length}
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
      />

        <main className={cn('min-h-0 flex-1 overflow-auto', isBoard ? 'px-3 pb-4' : 'pb-20')}>
          {content}
        </main>

      {/* 일괄 작업 바 (목록 보기) — 목록 위에 끼워 넣지 않고 하단에 띄운다: 선택 순간 행이 밀려 다음 클릭이 다른 행에 떨어지지 않도록 */}
      {hasSelection && (
        <div
          role="toolbar"
          aria-label="선택한 업무 일괄 작업"
          className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-[#37352f] py-1.5 pr-1.5 pl-3.5 text-white shadow-[0_8px_24px_rgba(15,15,15,0.18)]"
        >
          <span className="mr-1.5 text-[12.5px] font-medium tabular-nums">{selectedTasks.size}개 선택됨</span>
          <span className="mx-1 h-4 w-px bg-white/20" aria-hidden="true" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-white/85 hover:bg-white/10 hover:text-white"
            disabled={bulkStatusMutation.isPending}
            onClick={() => runBulkStatus('in_progress')}
          >
            <Clock className="size-3" /> 진행중
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-white/85 hover:bg-white/10 hover:text-white"
            disabled={bulkStatusMutation.isPending}
            onClick={() => runBulkStatus('completed')}
          >
            <CheckCircle2 className="size-3" /> 완료
          </Button>
          {canBulkDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#ff9b8f] hover:bg-white/10 hover:text-[#ffb3aa]"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-3" /> 삭제
            </Button>
          )}
          <span className="mx-1 h-4 w-px bg-white/20" aria-hidden="true" />
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setSelectedTasks(new Set())}
            aria-label="선택 해제 (Esc)"
            title="선택 해제 (Esc)"
          >
            <X />
          </Button>
        </div>
      )}

      {/* 생성/수정 다이얼로그 */}
      <TaskFormModal
        isOpen={isCreateModalOpen || !!editingTask}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreatePreset(null);
          setEditingTask(null);
        }}
        task={editingTask}
        presetStatus={createPreset?.status ?? null}
        presetCategory={createPreset?.category ?? null}
        employeeOptions={activeEmployees}
        onSubmit={(data, meta) => {
          if (editingTask) {
            submitTaskEdit(editingTask.id, data as UpdateTaskDto, meta?.contact);
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

function CenteredState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full items-center justify-center py-8">{children}</div>;
}
