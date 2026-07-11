/**
 * tasks 페이지 생성/수정 다이얼로그 — 담당자 배정 + 컨텍스트 연결(연락처 검색)/해제 UI 포함.
 */
import { useDeferredValue, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ClipboardList,
  FileSignature,
  FileText,
  Layers,
  Link2,
  MessageSquare,
  Search,
  User,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CreateTaskDto, Employee, Task, UpdateTaskDto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  ASSIGNEE_UNASSIGNED,
  TaskSourceBadge,
  categoryConfig,
  consultationTypeLabels,
  getListingLabel,
  getPropertyLabel,
  priorityConfig,
} from './-task-shared';

// ─── 컨텍스트 (연락처 제외 — 연락처는 검색 연결까지 지원) ──────

type UnlinkableKey =
  | 'propertyId'
  | 'listingId'
  | 'listingIntakeId'
  | 'consultationId'
  | 'buyerReqId'
  | 'matchId'
  | 'dealId'
  | 'contractId';

interface ModalContext {
  key: UnlinkableKey;
  icon: LucideIcon;
  label: string;
}

function buildModalContexts(task: Task): ModalContext[] {
  const items: ModalContext[] = [];
  if (task.propertyId || task.property) {
    items.push({ key: 'propertyId', icon: Building2, label: getPropertyLabel(task) });
  }
  if (task.listingId || task.listing) {
    items.push({ key: 'listingId', icon: FileText, label: `매물 ${getListingLabel(task.listing)}` });
  }
  if (task.listingIntakeId || task.listingIntake) {
    items.push({
      key: 'listingIntakeId',
      icon: ClipboardList,
      label: task.listingIntake?.status
        ? `의뢰 ${getStatusMeta('intakeStatus', task.listingIntake.status).label}`
        : '의뢰',
    });
  }
  if (task.consultationId || task.consultation) {
    items.push({
      key: 'consultationId',
      icon: MessageSquare,
      label: task.consultation?.type
        ? `상담 ${consultationTypeLabels[task.consultation.type] ?? task.consultation.type}`
        : '상담',
    });
  }
  if (task.buyerReqId || task.buyerRequirement) {
    items.push({
      key: 'buyerReqId',
      icon: Search,
      label: task.buyerRequirement?.contact?.name
        ? `구매고객 ${task.buyerRequirement.contact.name}`
        : '구매고객',
    });
  }
  if (task.matchId || task.match) {
    items.push({
      key: 'matchId',
      icon: Link2,
      label: task.match?.stage ? `매칭 ${getStatusMeta('matchStage', task.match.stage).label}` : '매칭',
    });
  }
  if (task.dealId || task.deal) {
    items.push({
      key: 'dealId',
      icon: Layers,
      label: task.deal?.stage ? `거래 ${getStatusMeta('dealStage', task.deal.stage).label}` : '거래',
    });
  }
  if (task.contractId || task.contract) {
    items.push({
      key: 'contractId',
      icon: FileSignature,
      label: task.contract?.status
        ? `계약 ${getStatusMeta('contractStatus', task.contract.status).label}`
        : '계약',
    });
  }
  return items;
}

// ─── 연락처 검색 연결 피커 ─────────────────────────────────

type ContactLink = { id: string; name: string; phone: string | null };

function ContactLinkPicker({ onSelect }: { onSelect: (contact: ContactLink) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', 'task-form-picker', deferredSearch],
    queryFn: () => api.contacts.findAll({ search: deferredSearch.trim() || undefined }),
    enabled: open,
  });
  const results = (data?.items ?? []).slice(0, 8);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <UserPlus className="size-3.5" />
          연락처 연결
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-2" align="start">
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 전화번호 검색"
            className="h-8 text-xs"
          />
          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {isLoading && (
              <div className="grid gap-1 p-1">
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-full" />
              </div>
            )}
            {!isLoading && results.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {search.trim() ? '검색 결과가 없습니다' : '연락처가 없습니다'}
              </p>
            )}
            {!isLoading &&
              results.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                  onClick={() => {
                    onSelect({ id: contact.id, name: contact.name, phone: contact.phone });
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <User className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{contact.name}</span>
                  {contact.phone && (
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {formatPhone(contact.phone)}
                    </span>
                  )}
                </button>
              ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ContextChipRow({
  icon: Icon,
  label,
  sublabel,
  onRemove,
}: {
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-0.5 pr-1 pl-2 text-xs">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate font-medium">{label}</span>
      {sublabel && <span className="truncate text-muted-foreground">{sublabel}</span>}
      <button
        type="button"
        aria-label="연결 해제"
        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

// ─── Task Form Modal ──────────────────────────────────────

export function TaskFormModal({
  isOpen,
  onClose,
  task,
  presetStatus,
  employeeOptions,
  onSubmit,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** null이면 생성 모드 */
  task: Task | null;
  /** 칸반 컬럼에서 추가 시 status 프리셋 (생성 모드 전용) */
  presetStatus?: string | null;
  employeeOptions: Employee[];
  onSubmit: (data: CreateTaskDto | UpdateTaskDto) => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('other');
  const [priority, setPriority] = useState<string>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedToId, setAssignedToId] = useState<string>(ASSIGNEE_UNASSIGNED);
  /** 해제 표시된 컨텍스트 FK (수정 모드) */
  const [unlinked, setUnlinked] = useState<Set<UnlinkableKey>>(new Set());
  /** undefined = 변경 없음 / null = 해제 / 객체 = 새 연결 */
  const [contactLink, setContactLink] = useState<ContactLink | null | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(task?.title ?? '');
    setContent(task?.content ?? '');
    setCategory(task?.category ?? 'other');
    setPriority(task?.priority ?? 'medium');
    setDueDate(task?.dueDate ? task.dueDate.substring(0, 10) : '');
    setAssignedToId(task?.assignedToId ?? ASSIGNEE_UNASSIGNED);
    setUnlinked(new Set());
    setContactLink(undefined);
  }, [task, isOpen]);

  const contexts = task ? buildModalContexts(task).filter((c) => !unlinked.has(c.key)) : [];
  const effectiveContact: ContactLink | null =
    contactLink === undefined ? (task?.contact ?? null) : contactLink;
  const hasContextSection = task !== null || effectiveContact !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (task) {
      const dto: UpdateTaskDto = {
        title: title.trim(),
        content: content.trim() || undefined,
        category,
        priority,
        dueDate: dueDate || null,
        assignedToId: assignedToId === ASSIGNEE_UNASSIGNED ? null : assignedToId,
      };
      for (const key of unlinked) dto[key] = null;
      if (contactLink !== undefined) dto.contactId = contactLink ? contactLink.id : null;
      onSubmit(dto);
    } else {
      const dto: CreateTaskDto = {
        title: title.trim(),
        content: content.trim() || undefined,
        category,
        priority,
        status: presetStatus ?? 'pending',
        dueDate: dueDate || undefined,
        assignedToId: assignedToId === ASSIGNEE_UNASSIGNED ? undefined : assignedToId,
        contactId: contactLink ? contactLink.id : undefined,
      };
      onSubmit(dto);
    }
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
          <DialogTitle className="flex items-center gap-2">
            {task ? '업무 수정' : '새 업무 추가'}
            {task && <TaskSourceBadge source={task.source} />}
          </DialogTitle>
        </DialogHeader>
        {task && task.source !== 'manual' && (
          <p className="-mt-2 text-xs text-muted-foreground">
            {task.source === 'ai' ? 'AI가' : '시스템 규칙이'} 자동 생성한 업무입니다.
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="task-title">제목 *</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="업무 제목을 입력하세요"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-content">설명</Label>
              <Textarea
                id="task-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="상세 설명을 입력하세요"
                rows={3}
              />
            </div>

            {/* 연결 문맥 — 연락처는 검색 연결, 나머지는 해제 지원 */}
            <div className="grid gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Link2 className="size-3.5" />
                  연결 문맥
                </div>
                {!effectiveContact && <ContactLinkPicker onSelect={(c) => setContactLink(c)} />}
              </div>
              {hasContextSection && (effectiveContact || contexts.length > 0) ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {effectiveContact && (
                    <ContextChipRow
                      icon={User}
                      label={effectiveContact.name}
                      sublabel={effectiveContact.phone ? formatPhone(effectiveContact.phone) : undefined}
                      onRemove={() => setContactLink(null)}
                    />
                  )}
                  {contexts.map((ctx) => (
                    <ContextChipRow
                      key={ctx.key}
                      icon={ctx.icon}
                      label={ctx.label}
                      onRemove={() => setUnlinked((prev) => new Set(prev).add(ctx.key))}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  연결된 문맥이 없습니다. 연락처를 검색해 연결하거나, 매물·상담 화면의 ‘할 일 추가’로
                  자동 연결됩니다.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>카테고리</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
              </div>
              <div className="grid gap-2">
                <Label>우선순위</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityConfig).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>담당자</Label>
                <Select value={assignedToId} onValueChange={setAssignedToId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ASSIGNEE_UNASSIGNED}>미배정</SelectItem>
                    {employeeOptions.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-due-date">마감일</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={isLoading || !title.trim()}>
              {isLoading ? '저장 중...' : task ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
