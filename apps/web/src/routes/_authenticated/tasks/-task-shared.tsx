/**
 * tasks 페이지 공유 설정/헬퍼 — 타입, 카테고리/우선순위 설정, 컨텍스트 칩, 마감일 표기.
 * 상태 뱃지는 components/domain StatusBadge(kind="taskStatus")가 단일 소스다.
 */
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  FileSignature,
  FileText,
  HelpCircle,
  Link2,
  MapPin,
  Megaphone,
  MessageSquare,
  Phone,
  Search,
  Settings,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Task, TaskListingSummary } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatDate, formatDday, formatMoney, formatPhone, formatRent } from '@/lib/format';
import { getListingAvailability } from '@/lib/listing-status';
import { getStatusMeta } from '@/lib/status-config';
import { EntityChip } from '@/components/domain';
import { getPropertyLabel } from './-task-property-label';

export { getPropertyLabel } from './-task-property-label';

// ─── Types ────────────────────────────────────────────────

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskCategory =
  | 'property'
  | 'buyer'
  | 'match'
  | 'deal'
  | 'contract'
  | 'consultation'
  | 'viewing'
  | 'admin'
  | 'other'
  | 'advertisement'
  | 'call'
  | 'document'
  | 'verify';

export type ViewMode = 'category' | 'board' | 'list' | 'status';
export type DueDateFilter = '' | 'overdue' | 'today' | 'week' | 'none';
export type TaskUpdatePatch = {
  status?: string;
  priority?: string;
  dueDate?: string | null;
  assignedToId?: string | null;
};

export const ASSIGNEE_UNASSIGNED = 'unassigned';

// ─── Config ───────────────────────────────────────────────

export const TASK_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];

/** 상태 라벨은 status-config(taskStatus)에서 가져온다 — 로컬 매핑 금지. */
export const taskStatusLabel = (status: string | null | undefined) =>
  getStatusMeta('taskStatus', status).label;

/** 상태 아이콘 (그룹 헤더/선택 팝오버용 — 색은 StatusBadge가 담당) */
export const statusIcons: Record<TaskStatus, ReactNode> = {
  pending: <Circle className="size-4 text-muted-foreground" />,
  in_progress: <Clock className="size-4 text-info" />,
  completed: <CheckCircle2 className="size-4 text-success" />,
  cancelled: <XCircle className="size-4 text-muted-foreground" />,
};

export const priorityConfig: Record<TaskPriority, { label: string; color: string; icon: ReactNode }> = {
  urgent: { label: '긴급', color: 'bg-destructive-soft text-destructive', icon: <AlertCircle className="size-3" /> },
  high: { label: '높음', color: 'bg-orange-soft text-orange', icon: <Clock className="size-3" /> },
  medium: { label: '중간', color: 'bg-warning-soft text-warning', icon: <Circle className="size-3" /> },
  low: { label: '낮음', color: 'bg-neutral-soft text-muted-foreground', icon: <Circle className="size-3" /> },
};

export const categoryConfig: Record<TaskCategory, { label: string; icon: ReactNode; color: string }> = {
  property: { label: '매물', icon: <Building2 className="size-3" />, color: 'bg-info-soft text-info' },
  buyer: { label: '구매고객', icon: <Search className="size-3" />, color: 'bg-success-soft text-success' },
  match: { label: '매칭', icon: <Link2 className="size-3" />, color: 'bg-violet-soft text-violet' },
  deal: { label: '거래', icon: <FileText className="size-3" />, color: 'bg-warning-soft text-warning' },
  contract: { label: '계약', icon: <FileSignature className="size-3" />, color: 'bg-violet-soft text-violet' },
  consultation: { label: '상담', icon: <MessageSquare className="size-3" />, color: 'bg-info-soft text-info' },
  viewing: { label: '방문', icon: <MapPin className="size-3" />, color: 'bg-pink-soft text-pink' },
  admin: { label: '관리', icon: <Settings className="size-3" />, color: 'bg-neutral-soft text-muted-foreground' },
  other: { label: '기타', icon: <HelpCircle className="size-3" />, color: 'bg-neutral-soft text-muted-foreground' },
  advertisement: { label: '광고작업', icon: <Megaphone className="size-3" />, color: 'bg-orange-soft text-orange' },
  call: { label: '전화작업', icon: <Phone className="size-3" />, color: 'bg-info-soft text-info' },
  document: { label: '서류작업', icon: <ClipboardList className="size-3" />, color: 'bg-warning-soft text-warning' },
  verify: { label: '확인작업', icon: <CheckCircle2 className="size-3" />, color: 'bg-success-soft text-success' },
};

export const boardColumns: { status: TaskStatus; title: string; dotColor: string; bgColor: string; columnBg: string }[] = [
  { status: 'pending', title: '대기', dotColor: 'bg-muted-foreground/50', bgColor: 'bg-neutral-soft text-muted-foreground', columnBg: 'bg-muted/40' },
  { status: 'in_progress', title: '진행 중', dotColor: 'bg-info', bgColor: 'bg-info-soft text-info', columnBg: 'bg-info-soft/30' },
  { status: 'completed', title: '완료', dotColor: 'bg-success', bgColor: 'bg-success-soft text-success', columnBg: 'bg-success-soft/30' },
];

// ─── Helpers ──────────────────────────────────────────────

export function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'completed' || task.status === 'cancelled') return false;
  return new Date(task.dueDate) < new Date(new Date().toDateString());
}

function dueDiffDays(date: string): number {
  const d = new Date(date);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(d) - start(today)) / 86_400_000);
}

/**
 * 마감일 표기 — 임박(±7일)은 formatDday(D-7/D-Day/D+3)로 강조, 그 외는 formatDate.
 * 지남=destructive, 오늘·내일=orange.
 */
export function DueDateText({ task, className }: { task: Task; className?: string }) {
  if (!task.dueDate) return <span className={cn('text-xs text-muted-foreground', className)}>-</span>;
  const done = task.status === 'completed' || task.status === 'cancelled';
  const diff = dueDiffDays(task.dueDate);
  let text = formatDate(task.dueDate);
  let color = 'text-muted-foreground';
  if (!done) {
    if (diff < 0) {
      text = formatDday(task.dueDate);
      color = 'text-destructive font-medium';
    } else if (diff <= 1) {
      text = formatDday(task.dueDate);
      color = 'text-orange font-medium';
    } else if (diff <= 7) {
      text = formatDday(task.dueDate);
      color = 'text-foreground';
    }
  }
  return (
    <span title={formatDate(task.dueDate)} className={cn('text-xs whitespace-nowrap', color, className)}>
      {text}
    </span>
  );
}

/** source=system/ai 업무 구분 뱃지 (manual은 표시 없음) */
export function TaskSourceBadge({ source, className }: { source: string; className?: string }) {
  if (source === 'ai') {
    return (
      <span className={cn('inline-flex shrink-0 items-center rounded-md bg-violet-soft px-1.5 py-px text-[10px] font-medium text-violet', className)}>
        AI
      </span>
    );
  }
  if (source === 'system') {
    return (
      <span className={cn('inline-flex shrink-0 items-center rounded-md bg-neutral-soft px-1.5 py-px text-[10px] font-medium text-muted-foreground', className)}>
        시스템
      </span>
    );
  }
  return null;
}

export function getListingLabel(listing: TaskListingSummary | null): string {
  if (!listing) return '매물';
  const typeLabel = getStatusMeta('transactionType', listing.transactionType).label;
  const amount =
    listing.transactionType === 'monthly'
      ? formatRent(listing.deposit, listing.monthlyRent)
      : formatMoney(listing.price);
  return amount !== '—' ? `${typeLabel} ${amount}` : typeLabel;
}

export const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

// ─── Context Chips (관련 엔터티 점프) ──────────────────────

/** EntityChip이 지원하지 않는 엔터티(매칭/구매고객/상담)용 — 동일 스타일, 목록 페이지로 점프 */
function ListLinkChip({
  icon: Icon,
  label,
  sublabel,
  to,
  className,
}: {
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  to: '/matches' | '/buyer-requirements' | '/consultations';
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => void navigate({ to })}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-1.5 text-xs transition-colors hover:bg-accent',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate font-medium text-foreground">{label}</span>
      {sublabel && <span className="truncate text-muted-foreground">{sublabel}</span>}
    </button>
  );
}

/**
 * Task 연결 문맥 칩 — 클릭 시 관련 엔터티 화면으로 점프.
 * contact/property/listing/deal/contract는 공유 EntityChip 사용.
 */
export function TaskContextChips({
  task,
  className,
  compact = false,
}: {
  task: Task;
  className?: string;
  compact?: boolean;
}) {
  const chips: ReactNode[] = [];
  const chipWidth = compact ? 'max-w-[160px]' : 'max-w-[240px]';
  const propertyChipWidth = compact ? 'max-w-48' : chipWidth;

  if (task.contactId || task.contact) {
    chips.push(
      <EntityChip
        key="contact"
        kind="contact"
        id={task.contactId ?? task.contact!.id}
        label={task.contact?.name ?? '연락처'}
        sublabel={!compact && task.contact?.phone ? formatPhone(task.contact.phone) : undefined}
        className={chipWidth}
      />,
    );
  }

  if (task.propertyId || task.property) {
    const address = task.property?.site?.roadAddress ?? task.property?.site?.jibunAddress;
    chips.push(
      <span key="property" title={address ?? undefined} className="inline-flex max-w-full">
        <EntityChip
          kind="property"
          id={task.propertyId ?? task.property!.id}
          label={getPropertyLabel(task)}
          className={propertyChipWidth}
        />
      </span>,
    );
  }

  if (task.listingId || task.listing) {
    chips.push(
      <EntityChip
        key="listing"
        kind="listing"
        id={task.listingId ?? task.listing!.id}
        propertyId={task.listing?.propertyId ?? task.propertyId ?? undefined}
        label={getListingLabel(task.listing)}
        sublabel={
          !compact && task.listing?.intake
            ? getStatusMeta(
                'listingAvailability',
                getListingAvailability(task.listing),
              ).label
            : undefined
        }
        className={chipWidth}
      />,
    );
  }

  if (task.buyerReqId || task.buyerRequirement) {
    chips.push(
      <ListLinkChip
        key="buyerRequirement"
        icon={Search}
        to="/buyer-requirements"
        label={
          task.buyerRequirement?.contact?.name
            ? `구매고객 ${task.buyerRequirement.contact.name}`
            : '구매고객'
        }
        className={chipWidth}
      />,
    );
  }

  if (task.matchId || task.match) {
    chips.push(
      <ListLinkChip
        key="match"
        icon={Link2}
        to="/matches"
        label={task.match?.stage ? `매칭 ${getStatusMeta('matchStage', task.match.stage).label}` : '매칭'}
        className={chipWidth}
      />,
    );
  }

  if (task.dealId || task.deal) {
    chips.push(
      <EntityChip
        key="deal"
        kind="deal"
        id={task.dealId ?? task.deal!.id}
        label={task.deal?.stage ? `거래 ${getStatusMeta('dealStage', task.deal.stage).label}` : '거래'}
        sublabel={
          !compact && task.deal?.transactionType
            ? getStatusMeta('transactionType', task.deal.transactionType).label
            : undefined
        }
        className={chipWidth}
      />,
    );
  }

  if (task.contractId || task.contract) {
    chips.push(
      <EntityChip
        key="contract"
        kind="contract"
        id={task.contractId ?? task.contract!.id}
        label={
          task.contract?.status ? `계약 ${getStatusMeta('contractStatus', task.contract.status).label}` : '계약'
        }
        sublabel={!compact && task.contract?.contractDate ? formatDate(task.contract.contractDate) : undefined}
        className={chipWidth}
      />,
    );
  }

  if (task.consultationId || task.consultation) {
    chips.push(
      <ListLinkChip
        key="consultation"
        icon={MessageSquare}
        to="/consultations"
        label={
          task.consultation?.type
            ? `상담 ${consultationTypeLabels[task.consultation.type] ?? task.consultation.type}`
            : '상담'
        }
        className={chipWidth}
      />,
    );
  }

  if (chips.length === 0) return null;

  return (
    <div
      className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {chips}
    </div>
  );
}
