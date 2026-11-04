/**
 * tasks 페이지 공유 설정/헬퍼 — 타입, 상태·우선순위·카테고리 표시, 컨텍스트 칩, 마감일 표기.
 * 상태 라벨은 status-config(taskStatus)가 단일 소스다.
 */
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  Building2,
  CheckCircle2,
  ClipboardList,
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
  type LucideIcon,
} from 'lucide-react';
import type { Task, TaskListingSummary } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney, formatPhone, formatRent } from '@/lib/format';
import { getListingAvailability } from '@/lib/listing-status';
import { getStatusMeta } from '@/lib/status-config';
import { EntityChip } from '@/components/domain';
import { getPropertyLabel } from './-task-property-label';

export { getPropertyLabel } from './-task-property-label';
import { describeDue, type DueTone } from './-task-filters';
export {
  ASSIGNEE_UNASSIGNED,
  isTaskOverdue as isOverdue,
  type DueDateFilter,
} from './-task-filters';

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

/** fromDrag: 드래그로 옮긴 경우 — 사용자가 위치를 직접 정했으므로 제자리 유지(hold)를 하지 않는다 */
export type StatusChangeOptions = { fromDrag?: boolean };

export type TaskUpdatePatch = {
  status?: string;
  priority?: string;
  dueDate?: string | null;
  assignedToId?: string | null;
};

// ─── Config ───────────────────────────────────────────────

export const TASK_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];

/** 상태 라벨은 status-config(taskStatus)에서 가져온다 — 로컬 매핑 금지. */
export const taskStatusLabel = (status: string | null | undefined) =>
  getStatusMeta('taskStatus', status).label;

/*
 * 표시 원칙: 행마다 반복되는 속성(상태·우선순위·카테고리)은 배경 있는 배지를 쓰지 않는다.
 * 아이콘 + 텍스트로 두고, 색은 주의가 필요한 값(긴급·높음·진행중·지연)에만 쓴다.
 */

const STATUS_ICON_COLOR: Record<TaskStatus, string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-info',
  completed: 'text-success',
  cancelled: 'text-muted-foreground/70',
};

const STATUS_TEXT_CLASS: Record<TaskStatus, string> = {
  pending: 'text-foreground/70',
  in_progress: 'text-info font-medium',
  completed: 'text-success',
  cancelled: 'text-muted-foreground',
};

/** 상태 아이콘 — 빈 원(대기) / 반원(진행중) / 체크(완료) / X(취소). 완료 체크 토글과 같은 모양 언어. */
export function TaskStatusIcon({ status, className }: { status: string; className?: string }) {
  const key = (status in STATUS_ICON_COLOR ? status : 'pending') as TaskStatus;
  const color = STATUS_ICON_COLOR[key];
  return (
    <svg viewBox="0 0 16 16" className={cn('size-3.5 shrink-0', color, className)} aria-hidden="true">
      {key === 'pending' && <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {key === 'in_progress' && (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.25a3.75 3.75 0 0 1 0 7.5z" fill="currentColor" />
        </>
      )}
      {key === 'completed' && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.25l2 2 4-4.25" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {key === 'cancelled' && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** 상태 아이콘 (그룹 헤더/선택 팝오버용) */
export const statusIcons: Record<TaskStatus, ReactNode> = {
  pending: <TaskStatusIcon status="pending" className="size-4" />,
  in_progress: <TaskStatusIcon status="in_progress" className="size-4" />,
  completed: <TaskStatusIcon status="completed" className="size-4" />,
  cancelled: <TaskStatusIcon status="cancelled" className="size-4" />,
};

/** 표 셀용 상태 텍스트 (배경 없음) */
export function TaskStatusText({ status, className }: { status: string; className?: string }) {
  const key = (status in STATUS_TEXT_CLASS ? status : 'pending') as TaskStatus;
  return (
    <span className={cn('text-xs whitespace-nowrap', STATUS_TEXT_CLASS[key], className)}>
      {taskStatusLabel(status)}
    </span>
  );
}

/**
 * 우선순위 아이콘 — 3단 신호 막대(채운 칸 수 = 긴급·높음 3/중간 2/낮음 1).
 * 긴급은 따로 느낌표를 쓰지 않고 막대를 빨갛게 칠해 높음(주황)과 구분한다.
 */
export function PriorityIcon({ priority, className }: { priority: string; className?: string }) {
  const level = priority === 'urgent' || priority === 'high' ? 3 : priority === 'medium' ? 2 : 1;
  const color =
    priority === 'urgent'
      ? 'text-destructive'
      : priority === 'high'
        ? 'text-orange'
        : priority === 'medium'
          ? 'text-foreground/65'
          : 'text-muted-foreground';
  return (
    <svg viewBox="0 0 16 16" className={cn('size-3.5 shrink-0', color, className)} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1.5 + i * 5}
          y={10 - i * 4}
          width="3"
          height={4.5 + i * 4}
          rx="1"
          fill="currentColor"
          opacity={i < level ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}

export const priorityConfig: Record<TaskPriority, { label: string; textClass: string; icon: ReactNode }> = {
  urgent: { label: '긴급', textClass: 'text-destructive font-medium', icon: <PriorityIcon priority="urgent" /> },
  high: { label: '높음', textClass: 'text-orange font-medium', icon: <PriorityIcon priority="high" /> },
  medium: { label: '중간', textClass: 'text-foreground/70', icon: <PriorityIcon priority="medium" /> },
  low: { label: '낮음', textClass: 'text-muted-foreground', icon: <PriorityIcon priority="low" /> },
};

/** 우선순위 표시 — 아이콘 + 라벨 (배경 없음) */
export function TaskPriorityLabel({
  priority,
  showLabel = true,
  className,
}: {
  priority: string;
  showLabel?: boolean;
  className?: string;
}) {
  const cfg = priorityConfig[priority as TaskPriority];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', cfg?.textClass, className)}
      title={showLabel ? undefined : `우선순위 ${cfg?.label ?? priority}`}
    >
      <PriorityIcon priority={priority} />
      {showLabel && (cfg?.label ?? priority)}
    </span>
  );
}

/**
 * 카테고리 — 단색 아이콘 + 라벨. 목록 칩에서는 작은 색 점(dot)으로만 구분한다
 * (행마다 반복되는 값이라 배경색은 쓰지 않고, 점 하나에만 색을 둔다).
 */
export const categoryConfig: Record<TaskCategory, { label: string; icon: ReactNode; dot: string }> = {
  property: { label: '매물', icon: <Building2 className="size-3" />, dot: '#9f6b53' },
  buyer: { label: '구매고객', icon: <Search className="size-3" />, dot: '#4f7fd1' },
  match: { label: '매칭', icon: <Link2 className="size-3" />, dot: '#448361' },
  deal: { label: '거래', icon: <FileText className="size-3" />, dot: '#c14c8a' },
  contract: { label: '계약', icon: <FileSignature className="size-3" />, dot: '#9065b0' },
  consultation: { label: '상담', icon: <MessageSquare className="size-3" />, dot: '#cb912f' },
  viewing: { label: '방문', icon: <MapPin className="size-3" />, dot: '#337ea9' },
  admin: { label: '관리', icon: <Settings className="size-3" />, dot: '#b4b2ad' },
  other: { label: '기타', icon: <HelpCircle className="size-3" />, dot: '#d3d1cb' },
  advertisement: { label: '광고작업', icon: <Megaphone className="size-3" />, dot: '#d9730d' },
  call: { label: '전화작업', icon: <Phone className="size-3" />, dot: '#0f7b6c' },
  document: { label: '서류작업', icon: <ClipboardList className="size-3" />, dot: '#8c8a84' },
  verify: { label: '확인작업', icon: <CheckCircle2 className="size-3" />, dot: '#6b9b37' },
};

export function getCategoryConfig(category: string) {
  return categoryConfig[category as TaskCategory] ?? categoryConfig.other;
}

/** 카테고리 태그 — 단색 아이콘 + 중립 텍스트 */
export function TaskCategoryTag({ category, className }: { category: string; className?: string }) {
  const cfg = getCategoryConfig(category);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs text-foreground/70', className)}>
      <span className="flex shrink-0 text-muted-foreground/80 [&>svg]:size-3.5" aria-hidden="true">
        {cfg.icon}
      </span>
      <span className="truncate">{cfg.label}</span>
    </span>
  );
}

export const boardColumns: { status: TaskStatus; title: string; columnBg: string }[] = [
  { status: 'pending', title: '대기', columnBg: 'bg-muted/40' },
  { status: 'in_progress', title: '진행 중', columnBg: 'bg-info-soft/25' },
  { status: 'completed', title: '완료', columnBg: 'bg-success-soft/25' },
];

// ─── Helpers ──────────────────────────────────────────────

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: 'text-destructive font-medium',
  today: 'text-orange font-medium',
  normal: 'text-muted-foreground',
  muted: 'text-muted-foreground/70',
};

/**
 * 마감일 표기 — "3일 지남" · "어제" · "오늘" · "내일" · "11.6 (금)".
 * 기한 지남=destructive, 오늘=orange, 그 외=muted. 끝난 업무는 날짜만 흐리게.
 */
export function DueDateText({ task, className }: { task: Task; className?: string }) {
  const due = describeDue(task);
  if (!task.dueDate || !due) return <span className={cn('text-xs text-muted-foreground', className)}>-</span>;
  return (
    <span
      title={`마감 ${formatDate(task.dueDate)} (${WEEKDAYS[new Date(task.dueDate).getDay()]})`}
      className={cn('text-xs tabular-nums whitespace-nowrap', DUE_TONE_CLASS[due.tone], className)}
    >
      {due.text}
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

/** 목록 행 오른쪽 알약 칩 — 테두리 있는 둥근 칩, 글자는 보통 굵기 */
export const taskPillClassName =
  'inline-flex h-6 max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-background pr-2.5 pl-2 text-xs text-foreground/80 transition-colors';

/** EntityChip이 지원하지 않는 엔터티(매칭/구매요건/상담)용 — EntityChip과 같은 모양, 관련 목록으로 점프 */
function ListLinkChip({
  icon: Icon,
  label,
  to,
  pill = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  to: '/wanted-properties' | '/customers-table' | '/consultations';
  pill?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => void navigate({ to })}
      className={cn(
        pill
          ? cn(taskPillClassName, 'group/entity hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40')
          : 'group/entity inline-flex max-w-full items-center gap-1 rounded-sm text-xs text-foreground/65 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
    >
      <Icon
        className={cn(
          'size-3 shrink-0 transition-colors group-hover/entity:text-muted-foreground',
          pill ? 'text-muted-foreground' : 'text-muted-foreground/60',
        )}
        aria-hidden="true"
      />
      <span className={cn('truncate', !pill && 'underline-offset-2 group-hover/entity:underline')}>{label}</span>
    </button>
  );
}

type ContextChip = { key: string; label: string; node: ReactNode };

/**
 * Task 연결 문맥 — 클릭 시 관련 엔터티 화면으로 점프.
 * - inline(기본): 보드 카드 제목 아래 한 줄짜리 메타데이터 링크(테두리 없음)
 * - pill: 목록 행 오른쪽 알약 칩. limit개까지 보이고 나머지는 "+N".
 *   목록 폭이 좁으면(@container/tasklist < 56rem) 첫 칩만 남기고 나머지를 "+N"으로 줄인다.
 */
export function TaskContextChips({
  task,
  className,
  compact = false,
  variant = 'inline',
  limit = 2,
}: {
  task: Task;
  className?: string;
  compact?: boolean;
  variant?: 'inline' | 'pill';
  limit?: number;
}) {
  const pill = variant === 'pill';
  const chips: ContextChip[] = [];
  const shortWidth = pill ? undefined : compact ? 'max-w-[120px]' : 'max-w-[180px]';
  const longWidth = pill ? undefined : compact ? 'max-w-[220px]' : 'max-w-[280px]';
  const showSublabel = !compact && !pill;
  const entityVariant = pill ? 'chip' : 'inline';
  /** EntityChip(chip)은 라벨이 굵게 나오므로 목록 칩에서는 보통 굵기로 맞춘다 */
  const entityPillClass = pill ? 'h-6 max-w-[180px] shrink-0 gap-1.5 pl-2 text-foreground/80 [&_span]:font-normal' : undefined;

  if (task.contactId || task.contact) {
    const label = task.contact?.name ?? '연락처';
    chips.push({
      key: 'contact',
      label,
      node: (
        <EntityChip
          variant={entityVariant}
          kind="contact"
          id={task.contactId ?? task.contact?.id ?? ''}
          label={label}
          sublabel={showSublabel && task.contact?.phone ? formatPhone(task.contact.phone) : undefined}
          className={cn(shortWidth, entityPillClass)}
        />
      ),
    });
  }

  if (task.propertyId || task.property) {
    const label = getPropertyLabel(task);
    const address = task.property?.site?.roadAddress ?? task.property?.site?.jibunAddress;
    chips.push({
      key: 'property',
      label,
      node: (
        <span title={address ?? undefined} className="inline-flex min-w-0 max-w-full shrink-0">
          <EntityChip
            variant={entityVariant}
            kind="property"
            id={task.propertyId ?? task.property?.id ?? ''}
            label={label}
            className={cn(longWidth, entityPillClass)}
          />
        </span>
      ),
    });
  }

  if (task.listingId || task.listing) {
    const label = getListingLabel(task.listing);
    chips.push({
      key: 'listing',
      label,
      node: (
        <EntityChip
          variant={entityVariant}
          kind="listing"
          id={task.listingId ?? task.listing?.id ?? ''}
          propertyId={task.listing?.propertyId ?? task.propertyId ?? undefined}
          label={label}
          sublabel={
            showSublabel && task.listing?.intake
              ? getStatusMeta('listingAvailability', getListingAvailability(task.listing)).label
              : undefined
          }
          className={cn(longWidth, entityPillClass)}
        />
      ),
    });
  }

  if (task.buyerReqId || task.buyerRequirement) {
    const label = task.buyerRequirement?.contact?.name
      ? `구매고객 ${task.buyerRequirement.contact.name}`
      : '구매고객';
    chips.push({
      key: 'buyerRequirement',
      label,
      node: <ListLinkChip icon={Search} to="/customers-table" label={label} pill={pill} className={shortWidth} />,
    });
  }

  if (task.matchId || task.match) {
    const label = task.match?.stage ? `매칭 ${getStatusMeta('matchStage', task.match.stage).label}` : '매칭';
    chips.push({
      key: 'match',
      label,
      node: <ListLinkChip icon={Link2} to="/wanted-properties" label={label} pill={pill} className={shortWidth} />,
    });
  }

  if (task.dealId || task.deal) {
    const label = task.deal?.stage ? `거래 ${getStatusMeta('dealStage', task.deal.stage).label}` : '거래';
    chips.push({
      key: 'deal',
      label,
      node: (
        <EntityChip
          variant={entityVariant}
          kind="deal"
          id={task.dealId ?? task.deal?.id ?? ''}
          label={label}
          sublabel={
            showSublabel && task.deal?.transactionType
              ? getStatusMeta('transactionType', task.deal.transactionType).label
              : undefined
          }
          className={cn(shortWidth, entityPillClass)}
        />
      ),
    });
  }

  if (task.contractId || task.contract) {
    const label = task.contract?.status
      ? `계약 ${getStatusMeta('contractStatus', task.contract.status).label}`
      : '계약';
    chips.push({
      key: 'contract',
      label,
      node: (
        <EntityChip
          variant={entityVariant}
          kind="contract"
          id={task.contractId ?? task.contract?.id ?? ''}
          label={label}
          sublabel={showSublabel && task.contract?.contractDate ? formatDate(task.contract.contractDate) : undefined}
          className={cn(shortWidth, entityPillClass)}
        />
      ),
    });
  }

  if (task.consultationId || task.consultation) {
    const label = task.consultation?.type
      ? `상담 ${consultationTypeLabels[task.consultation.type] ?? task.consultation.type}`
      : '상담';
    chips.push({
      key: 'consultation',
      label,
      node: <ListLinkChip icon={MessageSquare} to="/consultations" label={label} pill={pill} className={shortWidth} />,
    });
  }

  if (chips.length === 0) return null;

  if (!pill) {
    return (
      <div
        className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5', className)}
        onClick={(e) => e.stopPropagation()}
      >
        {chips.map((chip) => (
          <span key={chip.key} className="contents">
            {chip.node}
          </span>
        ))}
      </div>
    );
  }

  const shown = chips.slice(0, limit);
  const hiddenWide = chips.slice(limit);
  const hiddenNarrow = chips.slice(1);
  return (
    <div className={cn('flex shrink-0 items-center gap-1.5', className)} onClick={(e) => e.stopPropagation()}>
      {shown.map((chip, index) => (
        <span key={chip.key} className={cn('contents', index > 0 && '@max-4xl/tasklist:hidden')}>
          {chip.node}
        </span>
      ))}
      {hiddenWide.length > 0 && (
        <span
          className={cn(taskPillClassName, 'px-2 text-muted-foreground @max-4xl/tasklist:hidden')}
          title={hiddenWide.map((chip) => chip.label).join(', ')}
        >
          +{hiddenWide.length}
        </span>
      )}
      {hiddenNarrow.length > 0 && (
        <span
          className={cn(taskPillClassName, 'hidden px-2 text-muted-foreground @max-4xl/tasklist:inline-flex')}
          title={hiddenNarrow.map((chip) => chip.label).join(', ')}
        >
          +{hiddenNarrow.length}
        </span>
      )}
    </div>
  );
}

/** 카테고리 알약 — 색 점 + 이름. 목록 폭이 좁으면 점만 남긴다 */
export function TaskCategoryPill({ category, className }: { category: string; className?: string }) {
  const cfg = getCategoryConfig(category);
  return (
    <span
      className={cn(taskPillClassName, '@max-4xl/tasklist:px-[8px]', className)}
      title={cfg.label}
    >
      <span className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: cfg.dot }} aria-hidden="true" />
      <span className="truncate @max-4xl/tasklist:sr-only">{cfg.label}</span>
    </span>
  );
}
