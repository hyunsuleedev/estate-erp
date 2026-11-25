/**
 * tasks 페이지 생성/수정 폼 — 담당자 배정 + 컨텍스트 연결(연락처 검색)/해제 UI 포함.
 * 새 업무는 대화창, 있는 업무는 옆 패널(서랍)에서 고친다 (2026-11-23, 사용자 요청: 줄의 "열기"로 서랍을 연다).
 * 두 모습은 같은 폼(같은 상태 · 같은 저장)을 쓴다.
 */
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatPlaceLabel } from '@estate-erp/shared';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  FolderKanban,
} from 'lucide-react';
import type { CreateTaskDto, Employee, Task, TaskContact, UpdateTaskDto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { getIntakeConfirmationState } from '@/lib/listing-status';
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
  TaskContextChips,
  TaskSourceBadge,
  categoryConfig,
  consultationTypeLabels,
  getListingLabel,
  getPropertyLabel,
  priorityConfig,
} from './-task-shared';
import { dueDateKey } from './-task-filters';
import { PropertyInspectorToolbar } from '../properties/-components/property-inspector-view';
import { useInspectorOutsideClose } from '@/hooks/use-inspector-outside-close';
import { EventLinkRow, type LinkedEntity } from '../calendar/-event-link-picker';
import { dealQueries } from '@/queries/deals';

// ─── 컨텍스트 (연락처 제외 — 연락처는 검색 연결까지 지원) ──────

type UnlinkableKey =
  | 'propertyId'
  | 'listingId'
  | 'listingIntakeId'
  | 'consultationId'
  | 'buyerReqId'
  | 'matchId'
  | 'dealId'
  | 'contractId'
  | 'projectId';

interface ModalContext {
  key: UnlinkableKey;
  icon: LucideIcon;
  label: string;
}

function buildModalContexts(task: Task): ModalContext[] {
  const items: ModalContext[] = [];
  // 프로젝트에서 적은 업무. 연결을 끊으면 그 프로젝트의 업무 목록에서 빠진다(업무는 남는다).
  if (task.projectId || task.project) {
    items.push({
      key: 'projectId',
      icon: FolderKanban,
      label: `프로젝트 · ${task.project?.title?.trim() || '제목 없음'}`,
    });
  }
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
      label: task.listingIntake
        ? `의뢰 ${getStatusMeta('intakeLifecycle', task.listingIntake.lifecycleStatus).label} · ${getStatusMeta('confirmationState', getIntakeConfirmationState(task.listingIntake)).label}`
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
        ? `희망 조건 · ${task.buyerRequirement.contact.name}`
        : '희망 조건',
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

// ─── 다른 화면에서 맥락과 함께 열기 ─────────────────────────

export interface TaskPresetLinks {
  contactId?: string | null;
  propertyId?: string | null;
  dealId?: string | null;
  listingId?: string | null;
}

/** 미리 채울 연결의 이름을 읽어 온다. 못 읽으면(지워졌거나 다른 사무소) 그 칸은 비워 둔다. */
function useResolvedPresetLinks(links: TaskPresetLinks | null | undefined) {
  const contactQuery = useQuery({
    queryKey: ['contacts', 'detail', links?.contactId],
    queryFn: () => api.contacts.findOne(links!.contactId!),
    enabled: Boolean(links?.contactId),
    staleTime: 60_000,
  });
  const propertyQuery = useQuery({
    queryKey: ['properties', 'detail', links?.propertyId],
    queryFn: () => api.properties.findOne(links!.propertyId!),
    enabled: Boolean(links?.propertyId),
    staleTime: 60_000,
  });
  const dealQuery = useQuery({
    ...dealQueries.detail(links?.dealId),
    enabled: Boolean(links?.dealId),
    staleTime: 60_000,
  });
  const listingQuery = useQuery({
    queryKey: ['listings', 'detail', links?.listingId],
    queryFn: () => api.listings.findOne(links!.listingId!),
    enabled: Boolean(links?.listingId),
    staleTime: 60_000,
  });
  const contact = links?.contactId && contactQuery.data ? contactQuery.data : null;
  const property = links?.propertyId && propertyQuery.data ? propertyQuery.data : null;
  const deal = links?.dealId && dealQuery.data ? dealQuery.data : null;
  const listing = links?.listingId && listingQuery.data ? listingQuery.data : null;
  return {
    contact: useMemoLink(contact, (c) => ({ id: c.id, name: c.name, phone: c.phone ?? null })),
    property: useMemoLink(property, (p) => ({ id: p.id, label: placeOf(p) || '매물' })),
    deal: useMemoLink(deal, (d) => ({
      id: d.id,
      label: `${placeOf(d.property ?? d.listing?.property) || '거래'} · ${getStatusMeta('dealStage', d.stage).label}`,
    })),
    listing: useMemoLink(listing, (l) => ({
      id: l.id,
      label: placeOf(l.property) || '매물 조건',
      sublabel: getStatusMeta('transactionType', l.transactionType).label,
      propertyId: l.propertyId,
    })),
  };
}

/** 같은 데이터면 같은 객체를 돌려준다 (채우기 효과가 다시 돌지 않게) */
function useMemoLink<T extends { id: string }, R>(value: T | null, map: (value: T) => R): R | null {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (value ? map(value) : null), [value]);
}

type PlaceSource =
  | {
      site?: { name?: string | null } | null;
      unit?: {
        name?: string | null;
        floor?: number | null;
        floorEnd?: number | null;
        floorLabel?: string | null;
        dong?: { name?: string | null; isPlaceholder?: boolean | null } | null;
      } | null;
    }
  | null
  | undefined;

function placeOf(property: PlaceSource): string {
  if (!property) return '';
  return formatPlaceLabel({
    siteName: property.site?.name,
    dongName: property.unit?.dong?.name,
    dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
    unit: property.unit,
  });
}

// ─── 업무 서랍 (옆 패널) ────────────────────────────────────

/** 업무 서랍의 id. 줄의 "열기" 단추가 aria-controls로 가리킨다. */
export const TASK_DRAWER_ID = 'task-drawer';
const TASK_DRAWER_WIDTH = 440;
/** 패널보다 위에 떠 있는 것. 이것이 열려 있을 때의 Esc는 그쪽이 먼저 닫는다 (다른 상세 패널과 같은 목록). */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

/**
 * 업무를 고치는 옆 패널. 다른 상세 패널(매물 · 프로젝트 · 희망매물)과 같은 자리 · 같은 움직임이다
 * (app.css의 [data-property-inspector] 규칙). 표를 덮는 창이 아니라서 패널을 연 채로 다른 줄을 볼 수 있다.
 *
 * 저장 단추를 눌러야 저장되는 폼이라, 고친 것이 있는 동안에는 "저장 전"으로 표시한다(dirty).
 * 패널 밖을 눌러도, Esc를 눌러도 닫히지 않는다 — 한 번의 누름으로 고친 글을 잃지 않게. 닫으려면 취소나 저장을 누른다.
 */
function TaskDrawerShell({
  dirty,
  onClose,
  children,
}: {
  dirty: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useInspectorOutsideClose(onClose, !dirty);
  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      // 글 칸에서의 Esc는 그 칸에서 나오는 것으로만 쓴다
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.blur();
        event.preventDefault();
        return;
      }
      if (dirty) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [dirty, onClose]);

  return (
    <aside
      id={TASK_DRAWER_ID}
      data-task-drawer
      data-property-inspector
      data-state="open"
      data-motion="slide"
      aria-label="업무 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)]"
      style={{ width: TASK_DRAWER_WIDTH, maxWidth: '100%' }}
    >
      {/* 고친 것이 있으면 닫기 단추도 막는다: 취소(버리기)나 저장으로만 닫는다 */}
      <PropertyInspectorToolbar
        onClose={() => onClose()}
        showExpand={false}
        closeDisabled={dirty}
        closeLabel={dirty ? '저장하지 않은 변경이 있습니다. 취소나 저장으로 닫습니다' : '업무 패널 닫기'}
      />
      {dirty && <span hidden data-native-tab-discard-blocker="true" data-native-tab-dirty="true" />}
      {children}
    </aside>
  );
}

// ─── Task Form Modal ──────────────────────────────────────

export function TaskFormModal({
  isOpen,
  onClose,
  task,
  presetStatus,
  presetCategory,
  employeeOptions,
  onSubmit,
  isLoading,
  currentUserId = null,
  presetLinks,
  defaultTitle,
  editIn = 'dialog',
}: {
  isOpen: boolean;
  onClose: () => void;
  /** 있는 업무를 고칠 때의 모습. drawer면 옆 패널에서 연다 (새 업무는 늘 대화창) */
  editIn?: 'dialog' | 'drawer';
  /** null이면 생성 모드 */
  task: Task | null;
  /** 칸반 컬럼에서 추가 시 status 프리셋 (생성 모드 전용) */
  presetStatus?: string | null;
  /** 작업별 그룹에서 추가 시 카테고리 프리셋 (생성 모드 전용) */
  presetCategory?: string | null;
  employeeOptions: Employee[];
  /** meta.contact: 새로 연결한 연락처 (화면 즉시 반영용) */
  onSubmit: (data: CreateTaskDto | UpdateTaskDto, meta?: { contact?: TaskContact | null }) => void;
  isLoading: boolean;
  /**
   * 새 업무의 기본 담당자. 비워 두면 '미배정'으로 만들어져 '내 담당' 탭에서 사라진 것처럼 보인다
   * (저장했다는 말은 나오는데 목록에 없다). 남에게 시킬 때만 바꾸면 된다.
   */
  currentUserId?: string | null;
  /** 새 업무에 미리 채울 연결 — 연락처·매물·거래 화면에서 '업무 추가'로 열 때 (생성 모드 전용) */
  presetLinks?: TaskPresetLinks | null;
  /** 새 업무의 제목 초안 (생성 모드 전용) */
  defaultTitle?: string | null;
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
  /** 새로 고른 매물·거래 (없으면 연결하지 않음) */
  const [propertyLink, setPropertyLink] = useState<LinkedEntity | null>(null);
  const [dealLink, setDealLink] = useState<LinkedEntity | null>(null);
  const [listingLink, setListingLink] = useState<LinkedEntity | null>(null);
  /**
   * 폼의 값이 어느 업무(그 시점의 값)로 채워졌는지. 서랍은 이것이 지금 받은 업무와 같아진 뒤에 폼을 그린다.
   * 같은 업무라도 값이 새로 오면(표에서 바로 고친 담당 · 마감 등) 폼을 새로 그린다.
   * 값을 채우기 전에 고르는 칸(Select)을 먼저 그리면, 채워지는 순간 그 칸들이 빈 값("")으로 바뀐다
   * (카테고리 · 우선순위 · 담당이 비어 저장이 실패한다). 대화창은 열린 뒤에야 내용을 그려서 이 문제가 없다.
   */
  const [filledFor, setFilledFor] = useState<Task | 'new' | null>(null);
  const preset = useResolvedPresetLinks(isOpen && !task ? presetLinks : null);

  const initialDueKey = task ? dueDateKey(task.dueDate) : '';
  const defaultAssignee =
    currentUserId && employeeOptions.some((employee) => employee.id === currentUserId)
      ? currentUserId
      : ASSIGNEE_UNASSIGNED;

  useEffect(() => {
    if (!isOpen) {
      setFilledFor(null);
      return;
    }
    setFilledFor(task ?? 'new');
    setTitle(task?.title ?? defaultTitle ?? '');
    setContent(task?.content ?? '');
    setCategory(task?.category ?? presetCategory ?? 'other');
    setPriority(task?.priority ?? 'medium');
    // 목록이 보여 주는 날짜(내 달력의 날짜)로 채운다. 저장값 앞 10글자는 UTC 날짜라 하루 어긋날 수 있다.
    setDueDate(task ? dueDateKey(task.dueDate) : '');
    setAssignedToId(task ? (task.assignedToId ?? ASSIGNEE_UNASSIGNED) : defaultAssignee);
    setUnlinked(new Set());
    setContactLink(undefined);
    setPropertyLink(null);
    setDealLink(null);
    setListingLink(null);
    // 직원 목록이 늦게 와도 열려 있는 새 업무 창의 담당자를 덮지 않도록 defaultAssignee는 빼 둔다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, isOpen, presetCategory, defaultTitle]);

  // 다른 화면에서 맥락과 함께 열면, 이름을 읽어 온 연결을 채운다(아직 사람이 바꾸지 않은 칸만)
  useEffect(() => {
    if (!isOpen || task) return;
    if (preset.contact) setContactLink((current) => (current === undefined ? preset.contact : current));
    if (preset.property) setPropertyLink((current) => current ?? preset.property);
    if (preset.deal) setDealLink((current) => current ?? preset.deal);
    if (preset.listing) setListingLink((current) => current ?? preset.listing);
  }, [isOpen, task, preset.contact, preset.property, preset.deal, preset.listing]);

  // 창을 연 뒤 직원 목록이 도착하면, 아직 아무도 고르지 않은 새 업무의 담당자를 나로 채운다
  useEffect(() => {
    if (!isOpen || task || defaultAssignee === ASSIGNEE_UNASSIGNED) return;
    setAssignedToId((current) => (current === ASSIGNEE_UNASSIGNED ? defaultAssignee : current));
  }, [isOpen, task, defaultAssignee]);

  const contexts = task ? buildModalContexts(task).filter((c) => !unlinked.has(c.key)) : [];
  const effectiveContact: ContactLink | null =
    contactLink === undefined ? (task?.contact ?? null) : contactLink;
  const hasContextSection = task !== null || effectiveContact !== null;
  const hasProperty = contexts.some((c) => c.key === 'propertyId');
  const hasDeal = contexts.some((c) => c.key === 'dealId');

  const asDrawer = editIn === 'drawer' && task !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isLoading) return;

    if (task) {
      const nextAssignee = assignedToId === ASSIGNEE_UNASSIGNED ? null : assignedToId;
      const dto: UpdateTaskDto = asDrawer
        ? // 서랍은 표를 덮지 않는다. 서랍을 연 채 표에서 담당 · 우선순위 등을 바로 고칠 수 있으므로,
          // 여기서 고친 칸만 보낸다 — 다 보내면 서랍이 들고 있던 옛 값이 표에서 고친 값을 덮는다.
          {
            ...(title.trim() !== task.title ? { title: title.trim() } : {}),
            // 빈 글을 보내야 지운 설명이 지워진다 (undefined는 '그대로'로 읽힌다)
            ...(content.trim() !== (task.content ?? '').trim() ? { content: content.trim() } : {}),
            ...(category !== task.category ? { category } : {}),
            ...(priority !== task.priority ? { priority } : {}),
            ...(nextAssignee !== (task.assignedToId ?? null) ? { assignedToId: nextAssignee } : {}),
          }
        : {
            title: title.trim(),
            // 빈 글을 보내야 지운 설명이 지워진다 (undefined는 '그대로'로 읽힌다)
            content: content.trim(),
            category,
            priority,
            assignedToId: nextAssignee,
          };
      // 마감일은 바꿨을 때만 보낸다. 그대로 보내면 원래 시각(통화 분석·독촉 업무의 시각)이 지워진다.
      if (dueDate !== initialDueKey) dto.dueDate = dueDate || null;
      for (const key of unlinked) dto[key] = null;
      if (contactLink !== undefined) dto.contactId = contactLink ? contactLink.id : null;
      if (propertyLink) dto.propertyId = propertyLink.id;
      if (dealLink) dto.dealId = dealLink.id;
      onSubmit(dto, contactLink !== undefined ? { contact: contactLink } : undefined);
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
        propertyId: propertyLink?.id,
        dealId: dealLink?.id,
        listingId: listingLink?.id,
      };
      onSubmit(dto);
    }
  };

  // 고친 것이 있는지 (있는 업무를 서랍에서 고칠 때): 저장 단추를 눌러야 저장되므로, 닫기를 막는 데 쓴다
  const dirty =
    task !== null &&
    (title !== task.title ||
      content !== (task.content ?? '') ||
      category !== task.category ||
      priority !== task.priority ||
      dueDate !== initialDueKey ||
      assignedToId !== (task.assignedToId ?? ASSIGNEE_UNASSIGNED) ||
      unlinked.size > 0 ||
      contactLink !== undefined ||
      propertyLink !== null ||
      dealLink !== null);
  // 두 모습(대화창 · 서랍)이 함께 쓰는 폼 본문
  const fields = (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="task-title">제목 *</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="업무 제목을 입력하세요"
                // 서랍에서는 열자마자 커서를 두지 않는다: 표를 보다가 연 것이고, 밖을 한 번 눌러 닫을 수 있어야 한다
                autoFocus={!asDrawer}
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
                  연결
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
              ) : propertyLink || dealLink || listingLink ? null : (
                <p className="text-xs text-muted-foreground">
                  연결된 것이 없습니다. 연락처·매물·거래를 검색해 연결하면 업무에서 바로 열 수 있습니다.
                </p>
              )}
              {(!hasProperty || !hasDeal || listingLink) && (
                <div className="grid gap-0.5 px-2">
                  {!hasProperty && <EventLinkRow kind="property" value={propertyLink} onChange={setPropertyLink} />}
                  {listingLink && <EventLinkRow kind="listing" value={listingLink} onChange={setListingLink} />}
                  {!hasDeal && <EventLinkRow kind="deal" value={dealLink} onChange={setDealLink} />}
                </div>
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
                          <span className="flex text-muted-foreground [&_svg]:size-3.5">{icon}</span>
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
                    {Object.entries(priorityConfig).map(([key, { label, icon }]) => (
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
  );

  if (asDrawer) {
    if (!isOpen) return null;
    // 이 업무의 값이 채워지기 전에는 패널의 틀만 그린다 (한 번 그리는 사이의 일이라 눈에 보이지 않는다)
    const filled = filledFor === task;
    return (
      <TaskDrawerShell dirty={filled && dirty} onClose={onClose}>
        {filled && (
        // 값을 채운 뒤에 그리므로, 업무나 그 값이 바뀌면 폼은 저절로 새로 그려진다(고르는 칸이 앞 값을 붙들지 않는다)
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
              업무 수정
              <TaskSourceBadge source={task.source} />
            </h2>
            {task.source !== 'manual' && (
              <p className="mt-1 text-xs text-muted-foreground">
                {task.source === 'ai' ? 'AI가' : '시스템 규칙이'} 자동 생성한 업무입니다.
              </p>
            )}
            {/* 걸린 고객 · 매물 · 프로젝트 · 거래로 바로 간다. 대시보드 · 알림에서 이 서랍으로 들어온 사람이
                서랍을 닫고 표의 칩을 다시 찾지 않아도 되게 한다(아래 '연결'은 붙이고 떼는 곳이라 누르면 이동하지 않는다).
                고치던 것이 있으면 말없이 사라지지 않게 이동을 막고 알린다. */}
            <div
              className="mt-2"
              onClickCapture={(event) => {
                if (!dirty) return;
                event.preventDefault();
                event.stopPropagation();
                toast.info('저장하지 않은 변경이 있습니다', { description: '저장하거나 변경을 버린 뒤 이동해 주세요.' });
              }}
            >
              <TaskContextChips task={task} />
            </div>
            {fields}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-6 py-3">
            {dirty && <span className="mr-auto text-xs text-muted-foreground">저장하지 않은 변경이 있습니다</span>}
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {dirty ? '변경 버리기' : '닫기'}
            </Button>
            <Button type="submit" size="sm" disabled={isLoading || !title.trim() || !dirty}>
              {isLoading ? '저장 중...' : '저장'}
            </Button>
          </div>
        </form>
        )}
      </TaskDrawerShell>
    );
  }

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
          {fields}
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
