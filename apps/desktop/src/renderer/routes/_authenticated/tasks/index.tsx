import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  closestCorners,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Edit,
  FileSignature,
  FileText,
  GripVertical,
  HelpCircle,
  Layers,
  LayoutGrid,
  Link2,
  List,
  ListOrdered,
  MapPin,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Settings,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';
import type { Task, CreateTaskDto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_authenticated/tasks/')({
  component: TasksPage,
});

// ─── Config (estate-crm 노션 스타일) ─────────────────────

type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type TaskCategory = 'property' | 'buyer' | 'match' | 'deal' | 'contract' | 'consultation' | 'viewing' | 'admin' | 'other' | 'advertisement' | 'call' | 'document' | 'verify';

const priorityConfig: Record<TaskPriority, { label: string; color: string; icon: React.ReactNode }> = {
  urgent: { label: '긴급', color: 'bg-red-100 text-red-700', icon: <AlertCircle className="size-3" /> },
  high: { label: '높음', color: 'bg-orange-100 text-orange-700', icon: <Clock className="size-3" /> },
  medium: { label: '중간', color: 'bg-yellow-100 text-yellow-700', icon: <Circle className="size-3" /> },
  low: { label: '낮음', color: 'bg-gray-100 text-gray-600', icon: <Circle className="size-3" /> },
};

const statusConfig: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '대기', color: 'bg-gray-100 text-gray-700', icon: <Circle className="size-4" /> },
  in_progress: { label: '진행중', color: 'bg-blue-100 text-blue-700', icon: <Clock className="size-4" /> },
  completed: { label: '완료', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="size-4" /> },
  cancelled: { label: '취소', color: 'bg-red-100 text-red-700', icon: <XCircle className="size-4" /> },
};

const categoryConfig: Record<TaskCategory, { label: string; icon: React.ReactNode; color: string }> = {
  property: { label: '매물', icon: <Building2 className="size-3" />, color: 'bg-blue-100 text-blue-700' },
  buyer: { label: '구매고객', icon: <Search className="size-3" />, color: 'bg-green-100 text-green-700' },
  match: { label: '매칭', icon: <Link2 className="size-3" />, color: 'bg-purple-100 text-purple-700' },
  deal: { label: '거래', icon: <FileText className="size-3" />, color: 'bg-amber-100 text-amber-700' },
  contract: { label: '계약', icon: <FileSignature className="size-3" />, color: 'bg-indigo-100 text-indigo-700' },
  consultation: { label: '상담', icon: <MessageSquare className="size-3" />, color: 'bg-cyan-100 text-cyan-700' },
  viewing: { label: '방문', icon: <MapPin className="size-3" />, color: 'bg-rose-100 text-rose-700' },
  admin: { label: '관리', icon: <Settings className="size-3" />, color: 'bg-gray-100 text-gray-700' },
  other: { label: '기타', icon: <HelpCircle className="size-3" />, color: 'bg-slate-100 text-slate-700' },
  advertisement: { label: '광고작업', icon: <Megaphone className="size-3" />, color: 'bg-orange-100 text-orange-700' },
  call: { label: '전화작업', icon: <Phone className="size-3" />, color: 'bg-teal-100 text-teal-700' },
  document: { label: '서류작업', icon: <ClipboardList className="size-3" />, color: 'bg-yellow-100 text-yellow-700' },
  verify: { label: '확인작업', icon: <CheckCircle2 className="size-3" />, color: 'bg-emerald-100 text-emerald-700' },
};

const boardColumns: { status: TaskStatus; title: string; dotColor: string; bgColor: string; columnBg: string }[] = [
  { status: 'pending', title: '플래닝', dotColor: 'bg-gray-400', bgColor: 'bg-gray-100 text-gray-700', columnBg: 'bg-gray-50' },
  { status: 'in_progress', title: '진행 중', dotColor: 'bg-amber-400', bgColor: 'bg-amber-100 text-amber-700', columnBg: 'bg-amber-50/50' },
  { status: 'completed', title: '완료', dotColor: 'bg-green-500', bgColor: 'bg-green-100 text-green-700', columnBg: 'bg-green-50/50' },
];

type ViewMode = 'category' | 'board' | 'list' | 'status';
type DueDateFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

// ─── Helpers ──────────────────────────────────────────────

function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'completed' || task.status === 'cancelled') return false;
  return new Date(task.dueDate) < new Date(new Date().toDateString());
}

function isDueSoon(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return d.toDateString() === now.toDateString() ||
    d.toDateString() === new Date(now.getTime() + 86400000).toDateString();
}

function formatDueDate(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.toDateString());
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff < 0) {
    return `${Math.abs(diff)}일 지남`;
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatDateRange(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ─── Main Page ────────────────────────────────────────────

function TasksPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // 필터
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false);

  // 선택 (리스트 뷰)
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks.findAll(),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateTaskDto) => api.tasks.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsCreateModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Parameters<typeof api.tasks.update>[1] }) =>
      api.tasks.update(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditingTask(null);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.tasks.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => api.tasks.reorder(orderedIds),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.tasks.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      api.tasks.bulkUpdateStatus(ids, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSelectedTasks(new Set());
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.tasks.bulkDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSelectedTasks(new Set());
    },
  });

  // 마감일 필터
  const matchesDueDateFilter = (task: Task) => {
    if (dueDateFilter === 'all') return true;
    if (dueDateFilter === 'none') return !task.dueDate;
    if (!task.dueDate) return false;
    const d = new Date(task.dueDate);
    const today = new Date(new Date().toDateString());
    if (dueDateFilter === 'overdue') return d < today && task.status !== 'completed' && task.status !== 'cancelled';
    if (dueDateFilter === 'today') return d.toDateString() === today.toDateString();
    if (dueDateFilter === 'week') {
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() + 7);
      return d >= today && d <= weekEnd;
    }
    return true;
  };

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (task.status === 'cancelled') return false;
        if (statusFilter !== 'all' && task.status !== statusFilter) return false;
        if (categoryFilter !== 'all' && task.category !== categoryFilter) return false;
        if (!matchesDueDateFilter(task)) return false;
        if (showOnlyMyTasks && user && task.assignedToId !== user.id) return false;
        return true;
      })
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [tasks, statusFilter, categoryFilter, dueDateFilter, showOnlyMyTasks, user]);

  const handleInlineUpdate = (id: string, dto: { status?: string; priority?: string; dueDate?: string | null; assignedToId?: string | null }) => {
    updateMutation.mutate({ id, dto });
  };

  const hasActiveFilters = statusFilter !== 'all' || dueDateFilter !== 'all' || categoryFilter !== 'all' || showOnlyMyTasks;

  const resetFilters = () => {
    setStatusFilter('all');
    setDueDateFilter('all');
    setCategoryFilter('all');
    setShowOnlyMyTasks(false);
  };

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
    if (selectedTasks.size === filteredTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filteredTasks.map((t) => t.id)));
    }
  };

  const hasSelection = selectedTasks.size > 0;
  const isAllSelected = filteredTasks.length > 0 && selectedTasks.size === filteredTasks.length;

  return (
    <div className="flex flex-col gap-6 -mt-4 -mx-4">
      {/* 필터 + 뷰 스위처 + 업무 추가 (한 줄, sticky) */}
      <div className="flex items-center gap-2 flex-wrap sticky -top-4 z-10 bg-background py-3 px-4 border-b border-border/40">
        {/* 내 업무만 토글 */}
        <div className="flex items-center gap-2 px-3 py-1.5 border border-dashed rounded-md h-8">
          <Switch
            size="sm"
            checked={showOnlyMyTasks}
            onCheckedChange={setShowOnlyMyTasks}
          />
          <label
            className="text-xs font-medium cursor-pointer select-none text-muted-foreground"
            onClick={() => setShowOnlyMyTasks(!showOnlyMyTasks)}
          >
            <User className="size-3 inline mr-1" />
            내 업무
          </label>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* 상태 필터 */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 gap-1.5 text-xs border-dashed">
            <Circle className="size-3" />
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {Object.entries(statusConfig).map(([key, { label, icon }]) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  {icon}
                  {label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 마감일 필터 */}
        <Select value={dueDateFilter} onValueChange={(v) => setDueDateFilter(v as DueDateFilter)}>
          <SelectTrigger className="h-8 gap-1.5 text-xs border-dashed">
            <Calendar className="size-3" />
            <SelectValue placeholder="마감일" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="overdue">지연됨</SelectItem>
            <SelectItem value="today">오늘</SelectItem>
            <SelectItem value="week">이번 주</SelectItem>
            <SelectItem value="none">마감일 없음</SelectItem>
          </SelectContent>
        </Select>

        {/* 카테고리 필터 */}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 gap-1.5 text-xs border-dashed">
            <Layers className="size-3" />
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {Object.entries(categoryConfig).map(([key, { label, icon }]) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  {icon}
                  {label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 필터 초기화 */}
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

        {/* 오른쪽: 뷰 스위처 + 업무 추가 */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1 border rounded-lg p-1">
            <Button
              variant={viewMode === 'category' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('category')}
              className="gap-1.5"
            >
              <Layers className="size-4" />
              작업별
            </Button>
            <Button
              variant={viewMode === 'status' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('status')}
              className="gap-1.5"
            >
              <ListOrdered className="size-4" />
              상태별
            </Button>
            <Button
              variant={viewMode === 'board' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('board')}
              className="gap-1.5"
            >
              <LayoutGrid className="size-4" />
              보드
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="gap-1.5"
            >
              <List className="size-4" />
              전체
            </Button>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="size-4 mr-2" />
            업무 추가
          </Button>
        </div>
      </div>

      <div className="px-4">
      {/* ── 보드 뷰 (칸반) ── */}
      {viewMode === 'board' && (
        isLoading ? <LoadingSkeleton /> : (
          <div className="grid grid-cols-3 gap-4">
            {boardColumns.map((column) => {
              const colTasks = filteredTasks.filter((t) => t.status === column.status);
              return (
                <div key={column.status} className="flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium', column.bgColor)}>
                      <span className={cn('size-2 rounded-full', column.dotColor)} />
                      {column.title}
                    </div>
                    <Button variant="ghost" size="sm" className="size-6 p-0 text-muted-foreground" onClick={() => setIsCreateModalOpen(true)}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <div className={cn('rounded-xl p-3 min-h-[200px]', column.columnBg)}>
                    <div className="space-y-3">
                      {colTasks.map((task) => (
                        <KanbanCard
                          key={task.id}
                          task={task}
                          onEdit={setEditingTask}
                          onStatusChange={(id, status) => updateStatusMutation.mutate({ id, status })}
                          onDelete={(id) => deleteMutation.mutate(id)}
                          currentStatus={column.status}
                        />
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground hover:bg-white/50 h-auto py-2"
                        onClick={() => setIsCreateModalOpen(true)}
                      >
                        <Plus className="size-4 mr-2" />
                        새 프로젝트
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── 상태별 뷰 ── */}
      {viewMode === 'status' && (
        isLoading ? <LoadingSkeleton /> : (
          <StatusView
            filteredTasks={filteredTasks}
            onRowClick={setEditingTask}
            onStatusChange={(id, status) => updateStatusMutation.mutate({ id, status })}
            onDelete={(id) => deleteMutation.mutate(id)}
            onUpdate={handleInlineUpdate}
            onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
          />
        )
      )}

      {/* ── 카테고리별 뷰 ── */}
      {viewMode === 'category' && (
        isLoading ? <LoadingSkeleton /> : (
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
                  onStatusChange={(id, status) => updateStatusMutation.mutate({ id, status })}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onUpdate={handleInlineUpdate}
                />
              );
            })}
          </div>
        )
      )}

      {/* ── 전체 리스트 뷰 ── */}
      {viewMode === 'list' && (
        <div>
          {/* 일괄 작업 바 */}
          {hasSelection && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-medium text-blue-700">
                {selectedTasks.size}개 선택됨
              </span>
              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => bulkStatusMutation.mutate({ ids: [...selectedTasks], status: 'in_progress' })}>
                  <Clock className="size-3 mr-1" /> 진행중
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => bulkStatusMutation.mutate({ ids: [...selectedTasks], status: 'completed' })}>
                  <CheckCircle2 className="size-3 mr-1" /> 완료
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => bulkDeleteMutation.mutate([...selectedTasks])}>
                  <Trash2 className="size-3 mr-1" /> 삭제
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedTasks(new Set())}>
                  <X className="size-3 mr-1" /> 선택 취소
                </Button>
              </div>
            </div>
          )}

          {isLoading ? <LoadingSkeleton /> : (
            <table className="w-full">
              <thead>
                <NotionTableHeader showCategory showCheckbox isAllSelected={isAllSelected} onToggleAll={toggleAllSelection} />
              </thead>
              <tbody>
                {filteredTasks.map((task, idx) => (
                  <NotionTableRow
                    key={task.id}
                    task={task}
                    index={idx + 1}
                    onRowClick={setEditingTask}
                    onStatusChange={(id, status) => updateStatusMutation.mutate({ id, status })}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onUpdate={handleInlineUpdate}
                    showCategory
                    showCheckbox
                    isSelected={selectedTasks.has(task.id)}
                    onToggleSelect={toggleTaskSelection}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      <TaskFormModal
        isOpen={isCreateModalOpen || !!editingTask}
        onClose={() => { setIsCreateModalOpen(false); setEditingTask(null); }}
        task={editingTask}
        onSubmit={(data) => {
          if (editingTask) {
            updateMutation.mutate({ id: editingTask.id, dto: data });
          } else {
            createMutation.mutate(data as CreateTaskDto);
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
      </div>
    </div>
  );
}

// ─── Notion Table Header ──────────────────────────────────

function NotionTableHeader({
  showCategory = true,
  showCheckbox = false,
  showDragHandle = false,
  isAllSelected = false,
  onToggleAll,
}: {
  showCategory?: boolean;
  showCheckbox?: boolean;
  showDragHandle?: boolean;
  isAllSelected?: boolean;
  onToggleAll?: () => void;
}) {
  return (
    <tr className="border-b border-border/40 text-xs text-muted-foreground">
      {showDragHandle && <th className="w-[28px]" />}
      {showCheckbox && (
        <th className="py-2 px-3 w-[40px]">
          <Checkbox checked={isAllSelected} onCheckedChange={onToggleAll} />
        </th>
      )}
      <th className="text-left py-2 px-3 font-medium w-[50px]">No</th>
      <th className="text-left py-2 px-3 font-medium">작업</th>
      <th className="text-left py-2 px-3 font-medium w-[90px]">상태</th>
      <th className="text-left py-2 px-3 font-medium w-[80px]">담당자</th>
      <th className="text-left py-2 px-3 font-medium w-[100px]">마감일</th>
      <th className="text-left py-2 px-3 font-medium w-[70px]">우선순위</th>
      {showCategory && <th className="text-left py-2 px-3 font-medium w-[110px]">카테고리</th>}
      <th className="w-[40px]" />
    </tr>
  );
}

// ─── Notion Table Row ─────────────────────────────────────

type NotionRowProps = {
  task: Task;
  index: number;
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, dto: { status?: string; priority?: string; dueDate?: string | null; assignedToId?: string | null }) => void;
  showCategory?: boolean;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (taskId: string) => void;
};

function NotionTableRow({
  task,
  index,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
  showCategory = true,
  showCheckbox = false,
  isSelected = false,
  onToggleSelect,
}: NotionRowProps) {
  const overdue = isOverdue(task);

  return (
    <tr
      className={cn(
        'group/row border-b border-border/40 hover:bg-muted/30 transition-colors text-sm',
        overdue && 'bg-red-50/50',
        isSelected && 'bg-blue-50/50',
      )}
    >
      {showCheckbox && (
        <td className="py-2 px-3">
          <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect?.(task.id)} />
        </td>
      )}
      <NotionTableRowCells task={task} index={index} onRowClick={onRowClick} onStatusChange={onStatusChange} onDelete={onDelete} onUpdate={onUpdate} showCategory={showCategory} />
    </tr>
  );
}

function NotionTableRowCells({
  task,
  index,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
  showCategory = true,
}: {
  task: Task;
  index: number;
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, dto: { status?: string; priority?: string; dueDate?: string | null; assignedToId?: string | null }) => void;
  showCategory?: boolean;
}) {
  const sCfg = statusConfig[task.status as TaskStatus];
  const pCfg = priorityConfig[task.priority as TaskPriority];
  const cCfg = categoryConfig[task.category as TaskCategory] ?? categoryConfig.other;
  const overdue = isOverdue(task);

  return (
    <>
      <td className="py-2 px-3 text-muted-foreground border-r border-border/40">{index}</td>
      <td className="py-2 px-3 border-r border-border/40">
        <div className="flex items-center gap-1">
          <span className={cn('flex-1', task.status === 'completed' ? 'line-through text-muted-foreground' : '')}>{task.title}</span>
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0"
            onClick={() => onRowClick(task)}
          >
            <Edit className="size-3.5" />
          </Button>
        </div>
      </td>

      {/* 상태 — 클릭 시 인라인 선택 */}
      <td className="py-2 px-3 border-r border-border/40">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center rounded-md hover:ring-2 hover:ring-ring/20 transition-all">
              <Badge className={cn(sCfg?.color, 'text-xs gap-1')}>
                <span className="size-1.5 rounded-full bg-current" />
                {sCfg?.label}
              </Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[160px] p-1" align="start">
            <div className="flex flex-col">
              {Object.entries(statusConfig).map(([key, { label, icon }]) => (
                <button
                  key={key}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors text-left',
                    task.status === key && 'bg-accent',
                  )}
                  onClick={() => onUpdate?.(task.id, { status: key })}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </td>

      {/* 담당자 — 클릭 시 인라인 표시 */}
      <td className="py-2 px-3 border-r border-border/40">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center rounded-md hover:ring-2 hover:ring-ring/20 transition-all w-full">
              {task.assignedTo ? (
                <div className="flex items-center gap-1.5">
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[10px]">{task.assignedTo.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground truncate">{task.assignedTo.name}</span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[180px] p-2" align="start">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground px-1 mb-1">담당자</p>
              {task.assignedTo ? (
                <>
                  <div className="flex items-center gap-2 px-1 py-1 text-xs">
                    <Avatar className="size-5">
                      <AvatarFallback className="text-[10px]">{task.assignedTo.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span>{task.assignedTo.name}</span>
                  </div>
                  <button
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors text-left text-red-600"
                    onClick={() => onUpdate?.(task.id, { assignedToId: null })}
                  >
                    <X className="size-3" />
                    담당자 해제
                  </button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground px-1">담당자 없음</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </td>

      {/* 마감일 — 클릭 시 인라인 날짜 선택 */}
      <td className="py-2 px-3 border-r border-border/40">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center rounded-md hover:ring-2 hover:ring-ring/20 transition-all">
              {task.dueDate ? (
                <span className={cn('text-xs', overdue ? 'text-red-600 font-medium' : isDueSoon(task.dueDate) ? 'text-orange-600' : 'text-muted-foreground')}>
                  {formatDueDate(task.dueDate)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">마감일</p>
              <Input
                type="date"
                className="h-8 text-xs"
                defaultValue={task.dueDate ? task.dueDate.substring(0, 10) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdate?.(task.id, { dueDate: val || null });
                }}
              />
              {task.dueDate && (
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors text-left text-red-600"
                  onClick={() => onUpdate?.(task.id, { dueDate: null })}
                >
                  <X className="size-3" />
                  마감일 제거
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </td>

      {/* 우선순위 — 클릭 시 인라인 선택 */}
      <td className="py-2 px-3 border-r border-border/40">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center rounded-md hover:ring-2 hover:ring-ring/20 transition-all">
              <Badge className={cn(pCfg?.color, 'text-xs')}>{pCfg?.label}</Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[140px] p-1" align="start">
            <div className="flex flex-col">
              {Object.entries(priorityConfig).map(([key, { label, icon }]) => (
                <button
                  key={key}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors text-left',
                    task.priority === key && 'bg-accent',
                  )}
                  onClick={() => onUpdate?.(task.id, { priority: key })}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </td>

      {showCategory && (
        <td className="py-2 px-3 border-r border-border/40">
          <Badge className={cn(cCfg.color, 'text-xs gap-1')}>
            {cCfg.icon}
            {cCfg.label}
          </Badge>
        </td>
      )}
      <td className="py-2 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="size-6 p-0">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onRowClick(task)}>
              <Edit className="size-4 mr-2" />수정
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange(task.id, 'in_progress')}>
              <ArrowRight className="size-4 mr-2" />진행중으로 변경
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange(task.id, 'completed')}>
              <CheckCircle2 className="size-4 mr-2" />완료로 변경
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={() => onDelete(task.id)}>
              <Trash2 className="size-4 mr-2" />삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </>
  );
}

// ─── Status View (상위 DndContext — 크로스 그룹 이동 지원) ──

function StatusView({
  filteredTasks,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
  onReorder,
}: {
  filteredTasks: Task[];
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, dto: { status?: string; priority?: string; dueDate?: string | null; assignedToId?: string | null }) => void;
  onReorder?: (orderedIds: string[]) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // 로컬 순서 관리 (status별)
  const [localTaskMap, setLocalTaskMap] = useState<Record<string, Task[]>>(() => {
    const map: Record<string, Task[]> = {};
    for (const col of boardColumns) {
      map[col.status] = filteredTasks.filter((t) => t.status === col.status);
    }
    return map;
  });

  // prop sync: task 멤버십이 바뀔 때만 동기화
  const prevIdsRef = useRef('');
  const propIds = useMemo(() => filteredTasks.map((t) => t.id).sort().join(','), [filteredTasks]);
  if (propIds !== prevIdsRef.current) {
    prevIdsRef.current = propIds;
    const propMap = new Map(filteredTasks.map((t) => [t.id, t]));
    const newMap: Record<string, Task[]> = {};
    for (const col of boardColumns) {
      const colPropTasks = filteredTasks.filter((t) => t.status === col.status);
      const prev = localTaskMap[col.status] || [];
      const prevOrder = prev.map((t) => t.id);
      // 기존 로컬 순서 유지 + 데이터 업데이트
      const synced = prevOrder.filter((id) => propMap.has(id) && propMap.get(id)!.status === col.status).map((id) => propMap.get(id)!);
      // 새로 추가된 task (이 status에 새로 들어온 것)
      const syncedIds = new Set(synced.map((t) => t.id));
      const added = colPropTasks.filter((t) => !syncedIds.has(t.id));
      newMap[col.status] = [...synced, ...added];
    }
    setLocalTaskMap(newMap);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // task ID → status 매핑
  const findContainer = (taskId: string): string | null => {
    for (const [status, tasks] of Object.entries(localTaskMap)) {
      if (tasks.some((t) => t.id === taskId)) return status;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    // over가 task ID인지 container ID인지 확인
    let overContainer = findContainer(over.id as string);
    if (!overContainer) {
      // over.id가 status 이름(container)일 수 있음
      if (boardColumns.some((c) => c.status === over.id)) {
        overContainer = over.id as string;
      }
    }

    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer) {
      // 같은 그룹 내 리오더
      if (active.id === over.id) return;
      const tasks = localTaskMap[activeContainer];
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(tasks, oldIndex, newIndex);
      setLocalTaskMap((prev) => ({ ...prev, [activeContainer]: reordered }));
      onReorder?.(reordered.map((t) => t.id));
    } else {
      // 다른 그룹으로 이동 → status 변경
      const task = localTaskMap[activeContainer].find((t) => t.id === active.id);
      if (!task) return;
      // 로컬 상태 즉시 업데이트
      const fromTasks = localTaskMap[activeContainer].filter((t) => t.id !== active.id);
      const toTasks = [...localTaskMap[overContainer]];
      // over가 task라면 그 위치에 삽입, 아니면 끝에 추가
      const overIndex = toTasks.findIndex((t) => t.id === over.id);
      const movedTask = { ...task, status: overContainer };
      if (overIndex !== -1) {
        toTasks.splice(overIndex, 0, movedTask);
      } else {
        toTasks.push(movedTask);
      }
      setLocalTaskMap((prev) => ({
        ...prev,
        [activeContainer]: fromTasks,
        [overContainer]: toTasks,
      }));
      // 서버에 status 변경 전송
      onStatusChange(active.id as string, overContainer);
    }
  };

  const activeTask = activeId
    ? Object.values(localTaskMap).flat().find((t) => t.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div>
        {boardColumns.map((column) => (
          <StatusGroup
            key={column.status}
            column={column}
            tasks={localTaskMap[column.status] || []}
            onRowClick={onRowClick}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="flex items-center border border-border bg-background shadow-lg rounded-md text-sm opacity-90">
            <div className="py-2 px-1 w-[28px] shrink-0 flex items-center justify-center">
              <GripVertical className="size-4 text-muted-foreground" />
            </div>
            <div className="py-2 px-3 flex-1 truncate">{activeTask.title}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Status Group (droppable + sortable) ─────────────────

function StatusGroup({
  column,
  tasks,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
}: {
  column: typeof boardColumns[number];
  tasks: Task[];
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, dto: { status?: string; priority?: string; dueDate?: string | null; assignedToId?: string | null }) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="mb-6">
      <div
        className="flex items-center gap-2 py-2 cursor-pointer hover:bg-muted/30 rounded"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className={cn('transition-transform text-xs', !isCollapsed && 'rotate-90')}>▶</span>
        {statusConfig[column.status]?.icon}
        <span className="font-medium">{column.title}</span>
        <span className="text-muted-foreground text-sm">{tasks.length}</span>
      </div>
      {!isCollapsed && (
        <>
          {/* Header row */}
          <div className="flex items-center border-b border-border/40 text-xs text-muted-foreground">
            <div className="w-[28px] shrink-0" />
            <div className="py-2 px-3 font-medium w-[50px] shrink-0">No</div>
            <div className="py-2 px-3 font-medium flex-1">작업</div>
            <div className="py-2 px-3 font-medium w-[90px] shrink-0">상태</div>
            <div className="py-2 px-3 font-medium w-[80px] shrink-0">담당자</div>
            <div className="py-2 px-3 font-medium w-[100px] shrink-0">마감일</div>
            <div className="py-2 px-3 font-medium w-[70px] shrink-0">우선순위</div>
            <div className="py-2 px-3 font-medium w-[110px] shrink-0">카테고리</div>
            <div className="w-[40px] shrink-0" />
          </div>
          <div ref={setNodeRef} className={cn('min-h-[40px] transition-colors rounded', isOver && 'bg-accent/50')}>
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task, idx) => (
                <SortableTableRow key={task.id} task={task} index={idx + 1} onRowClick={onRowClick} onStatusChange={onStatusChange} onDelete={onDelete} onUpdate={onUpdate} showCategory />
              ))}
              {tasks.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  여기에 드롭하여 상태 변경
                </div>
              )}
            </SortableContext>
          </div>
          <div className="text-center text-xs text-muted-foreground py-2">
            완료 {completedCount}/{tasks.length}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sortable Table Row (DnD wrapper) ────────────────────

function SortableTableRow(props: {
  task: Task;
  index: number;
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, dto: { status?: string; priority?: string; dueDate?: string | null; assignedToId?: string | null }) => void;
  showCategory?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id });
  const overdue = isOverdue(props.task);
  const sCfg = statusConfig[props.task.status as TaskStatus];
  const pCfg = priorityConfig[props.task.priority as TaskPriority];
  const cCfg = categoryConfig[props.task.category as TaskCategory] ?? categoryConfig.other;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        'group/row flex items-center border-b border-border/40 hover:bg-muted/30 transition-colors text-sm',
        overdue && 'bg-red-50/50',
        isDragging && 'bg-muted/50 shadow-md rounded-md z-10',
      )}
    >
      {/* Drag handle */}
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        className="py-2 px-1 w-[28px] shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="size-4 text-muted-foreground/40 hover:text-muted-foreground" />
      </div>
      {/* No */}
      <div className="py-2 px-3 text-muted-foreground w-[50px] shrink-0 border-r border-border/40">{props.index}</div>
      {/* 작업 */}
      <div className="py-2 px-3 flex-1 flex items-center gap-1 border-r border-border/40 min-w-0">
        <span className={cn('flex-1 truncate', props.task.status === 'completed' ? 'line-through text-muted-foreground' : '')}>{props.task.title}</span>
        <Button
          variant="ghost"
          size="sm"
          className="size-6 p-0 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0"
          onClick={() => props.onRowClick(props.task)}
        >
          <Edit className="size-3.5" />
        </Button>
      </div>
      {/* 상태 */}
      <div className="py-2 px-3 w-[90px] shrink-0 border-r border-border/40">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center rounded-md hover:ring-2 hover:ring-ring/20 transition-all">
              <Badge className={cn(sCfg?.color, 'text-xs gap-1')}>
                <span className="size-1.5 rounded-full bg-current" />
                {sCfg?.label}
              </Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[160px] p-1" align="start">
            <div className="flex flex-col">
              {Object.entries(statusConfig).map(([key, { label, icon }]) => (
                <button
                  key={key}
                  className={cn('flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors text-left', props.task.status === key && 'bg-accent')}
                  onClick={() => props.onUpdate?.(props.task.id, { status: key })}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {/* 담당자 */}
      <div className="py-2 px-3 w-[80px] shrink-0 border-r border-border/40">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center rounded-md hover:ring-2 hover:ring-ring/20 transition-all w-full">
              {props.task.assignedTo ? (
                <div className="flex items-center gap-1.5">
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[10px]">{props.task.assignedTo.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground truncate">{props.task.assignedTo.name}</span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[180px] p-2" align="start">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground px-1 mb-1">담당자</p>
              {props.task.assignedTo ? (
                <>
                  <div className="flex items-center gap-2 px-1 py-1 text-xs">
                    <Avatar className="size-5">
                      <AvatarFallback className="text-[10px]">{props.task.assignedTo.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span>{props.task.assignedTo.name}</span>
                  </div>
                  <button
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors text-left text-red-600"
                    onClick={() => props.onUpdate?.(props.task.id, { assignedToId: null })}
                  >
                    <X className="size-3" />
                    담당자 해제
                  </button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground px-1">담당자 없음</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {/* 마감일 */}
      <div className="py-2 px-3 w-[100px] shrink-0 border-r border-border/40">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center rounded-md hover:ring-2 hover:ring-ring/20 transition-all">
              {props.task.dueDate ? (
                <span className={cn('text-xs', overdue ? 'text-red-600 font-medium' : isDueSoon(props.task.dueDate) ? 'text-orange-600' : 'text-muted-foreground')}>
                  {formatDueDate(props.task.dueDate)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">마감일</p>
              <Input
                type="date"
                className="h-8 text-xs"
                defaultValue={props.task.dueDate ? props.task.dueDate.substring(0, 10) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  props.onUpdate?.(props.task.id, { dueDate: val || null });
                }}
              />
              {props.task.dueDate && (
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors text-left text-red-600"
                  onClick={() => props.onUpdate?.(props.task.id, { dueDate: null })}
                >
                  <X className="size-3" />
                  마감일 제거
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {/* 우선순위 */}
      <div className="py-2 px-3 w-[70px] shrink-0 border-r border-border/40">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center rounded-md hover:ring-2 hover:ring-ring/20 transition-all">
              <Badge className={cn(pCfg?.color, 'text-xs')}>{pCfg?.label}</Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[140px] p-1" align="start">
            <div className="flex flex-col">
              {Object.entries(priorityConfig).map(([key, { label, icon }]) => (
                <button
                  key={key}
                  className={cn('flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors text-left', props.task.priority === key && 'bg-accent')}
                  onClick={() => props.onUpdate?.(props.task.id, { priority: key })}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {/* 카테고리 */}
      {props.showCategory && (
        <div className="py-2 px-3 w-[110px] shrink-0 border-r border-border/40">
          <Badge className={cn(cCfg.color, 'text-xs gap-1')}>
            {cCfg.icon}
            {cCfg.label}
          </Badge>
        </div>
      )}
      {/* 액션 */}
      <div className="py-2 px-3 w-[40px] shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="size-6 p-0">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => props.onRowClick(props.task)}>
              <Edit className="size-4 mr-2" />수정
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onStatusChange(props.task.id, 'in_progress')}>
              <ArrowRight className="size-4 mr-2" />진행중으로 변경
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onStatusChange(props.task.id, 'completed')}>
              <CheckCircle2 className="size-4 mr-2" />완료로 변경
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={() => props.onDelete(props.task.id)}>
              <Trash2 className="size-4 mr-2" />삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Category Task Table (카테고리별 그룹) ────────────────

function CategoryTaskTable({
  categoryData,
  tasks,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
}: {
  categoryData: { label: string; icon: React.ReactNode; color: string };
  tasks: Task[];
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, dto: { status?: string; priority?: string; dueDate?: string | null; assignedToId?: string | null }) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="mb-6">
      <div
        className="flex items-center gap-2 py-2 cursor-pointer hover:bg-muted/30 rounded"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className={cn('transition-transform text-xs', !isCollapsed && 'rotate-90')}>▶</span>
        {categoryData.icon}
        <span className="font-medium">{categoryData.label}</span>
        <span className="text-muted-foreground text-sm">{tasks.length}</span>
      </div>
      {!isCollapsed && (
        <>
          <table className="w-full">
            <thead>
              <NotionTableHeader showCategory={false} />
            </thead>
            <tbody>
              {tasks.map((task, idx) => (
                <NotionTableRow key={task.id} task={task} index={idx + 1} onRowClick={onRowClick} onStatusChange={onStatusChange} onDelete={onDelete} onUpdate={onUpdate} showCategory={false} />
              ))}
            </tbody>
          </table>
          <div className="text-center text-xs text-muted-foreground py-2">
            완료 {completedCount}/{tasks.length}
          </div>
        </>
      )}
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
  onDelete: (id: string) => void;
  currentStatus: string;
}) {
  const overdue = isOverdue(task);
  const pCfg = priorityConfig[task.priority as TaskPriority];
  const cCfg = categoryConfig[task.category as TaskCategory] ?? categoryConfig.other;

  return (
    <div
      className={cn(
        'bg-white border rounded-lg p-4 cursor-pointer hover:shadow-md transition-all group',
        overdue ? 'border-red-200 bg-red-50/30' : 'border-gray-200',
      )}
      onClick={() => onEdit(task)}
    >
      {/* 카테고리 아이콘 + 제목 + 액션 */}
      <div className="flex items-start gap-2 mb-3">
        <span className="text-lg mt-0.5">{cCfg.icon}</span>
        <h4 className={cn('flex-1 font-medium text-sm leading-tight', task.status === 'completed' && 'line-through text-muted-foreground')}>
          {task.title}
        </h4>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="size-6 p-0" onClick={(e) => { e.stopPropagation(); onEdit(task); }}>
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
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'pending'); }}>
                  <Circle className="size-4 mr-2" />대기로 변경
                </DropdownMenuItem>
              )}
              {currentStatus !== 'in_progress' && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'in_progress'); }}>
                  <ArrowRight className="size-4 mr-2" />진행중으로 변경
                </DropdownMenuItem>
              )}
              {currentStatus !== 'completed' && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'completed'); }}>
                  <CheckCircle2 className="size-4 mr-2" />완료로 변경
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}>
                <Trash2 className="size-4 mr-2" />삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 날짜 */}
      {task.dueDate && (
        <p className={cn('text-xs mb-3', overdue ? 'text-red-600' : 'text-muted-foreground')}>
          {formatDateRange(task.dueDate)}
        </p>
      )}

      {/* 우선순위 배지 */}
      <div className="mb-3">
        <Badge className={cn(pCfg?.color, 'text-xs')}>{pCfg?.label}</Badge>
      </div>

      {/* 진행률 바 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {task.status === 'completed' ? '100.00' : task.status === 'in_progress' ? '50.00' : '0.00'}%
        </span>
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              task.status === 'completed' ? 'bg-green-500 w-full' :
              task.status === 'in_progress' ? 'bg-amber-400 w-1/2' :
              'bg-gray-300 w-0',
            )}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Task Form Modal ──────────────────────────────────────

function TaskFormModal({
  isOpen,
  onClose,
  task,
  onSubmit,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('other');
  const [priority, setPriority] = useState<string>('medium');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    setTitle(task?.title ?? '');
    setContent(task?.content ?? '');
    setCategory(task?.category ?? 'other');
    setPriority(task?.priority ?? 'medium');
    setDueDate(task?.dueDate ? task.dueDate.substring(0, 10) : '');
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      content: content.trim() || undefined,
      category,
      priority,
      status: task?.status ?? 'pending',
      dueDate: dueDate || undefined,
    });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{task ? '업무 수정' : '새 업무 추가'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">제목 *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="업무 제목을 입력하세요" autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="content">설명</Label>
              <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="상세 설명을 입력하세요" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>카테고리</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryConfig).map(([key, { label, icon }]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">{icon}{label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>우선순위</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityConfig).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dueDate">마감일</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={isLoading || !title.trim()}>
              {isLoading ? '저장 중...' : task ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Loading ──────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border rounded-lg px-4 py-3">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}
