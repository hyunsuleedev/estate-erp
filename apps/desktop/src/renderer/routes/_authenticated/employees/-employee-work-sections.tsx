import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FolderKanban,
  Mail,
  MapPin,
  Phone,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  Employee,
  EmployeeDetail,
  EmployeePerformance,
} from '@estate-erp/api-client';
import { formatDate, formatMoney, formatPhone, formatRelativeDay } from '@/lib/format';
import { getStatusMeta, type Tone } from '@/lib/status-config';
import { timeAgo } from '@/lib/time-ago';
import { cn } from '@/lib/utils';
import { CONSULTATION_TYPE_LABELS } from '../buyer-requirements/-buyer-utils';
import {
  BUYER_STATUS_LABELS,
  PARTICIPANT_ROLE_LABELS,
  ROLE_LABELS,
  TASK_PRIORITY_LABELS,
  clockTime,
  describeActivity,
  describeActivitySource,
  getCommissionNumber,
  licenseLabel,
} from './-employee-shared';
import {
  DEFAULT_AGENT_RATE,
  avatarToneFor,
  buildEmployeeAttention,
  buildEmployeeTimeline,
  computeSplitRatio,
  daysUntilDate,
  dueLabelForDays,
  formatBuyerBudgetSummary,
  formatBuyerLocationSummary,
  formatDealNextSchedule,
  formatDealPlace,
  formatDealValueSummary,
  formatTaskContextLabel,
  isEmployeeQuiet,
  paySummaryText,
  type TimelineFilter,
} from './-employee-model';

export function toneToEmpPill(tone: Tone): string {
  switch (tone) {
    case 'success':
      return 'emp-pill-emerald';
    case 'info':
      return 'emp-pill-blue';
    case 'violet':
      return 'emp-pill-indigo';
    case 'warning':
    case 'orange':
      return 'emp-pill-amber';
    case 'destructive':
      return 'emp-pill-red';
    default:
      return 'emp-pill-gray';
  }
}

/** 아바타 + 활동 상태 점 (활성=초록, 7일+ 무활동/기록없음=황색, 비활성=회색) */
export function EmployeeAvatar({
  employee,
  size = 'md',
}: {
  employee: Pick<
    Employee,
    'id' | 'name' | 'role' | 'isActive' | 'latestActivityAt'
  >;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const tone = avatarToneFor(employee);
  const quiet = isEmployeeQuiet(employee);
  const dotState = !employee.isActive
    ? 'is-inactive'
    : quiet
      ? 'is-quiet'
      : '';
  const dotTitle = !employee.isActive
    ? '비활성 계정'
    : quiet
      ? '7일 이상 활동 없음'
      : '정상 활동';

  return (
    <span className="emp-av-wrap">
      <span
        aria-hidden="true"
        className={cn('emp-av-circle', `emp-av-${size}`, `emp-av-${tone}`)}
      >
        {employee.name.charAt(0)}
      </span>
      {size !== 'xs' ? (
        <span
          title={dotTitle}
          aria-hidden="true"
          className={cn('emp-av-dot', size === 'sm' && 'is-sm', dotState)}
        />
      ) : null}
    </span>
  );
}

/** 역할 뱃지 (대표=인디고, 매니저=블루, 중개사=그레이) */
export function RolePill({ role, compact }: { role: string; compact?: boolean }) {
  const cls =
    role === 'owner'
      ? 'emp-pill-indigo'
      : role === 'manager'
        ? 'emp-pill-blue'
        : 'emp-pill-gray';
  return (
    <span
      className={cn('emp-pill', cls)}
      style={compact ? { height: 19, fontSize: 11 } : undefined}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

/** 클립보드 복사 칩 (전화번호·이메일) */
export function CopyChip({
  kind,
  value,
  displayText,
}: {
  kind: 'phone' | 'email';
  value: string;
  displayText?: string;
}) {
  const label = kind === 'phone' ? '전화번호' : '이메일';
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}를 복사했습니다.`);
    } catch {
      toast.error(`${label}를 복사하지 못했습니다.`);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={`${label} 복사`}
      className={cn(
        'emp-copy-chip emp-pressable',
        kind === 'phone' && 'emp-num',
      )}
    >
      {kind === 'phone' ? (
        <Phone className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Mail className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{displayText ?? value}</span>
    </button>
  );
}

/** 실시간 2색 수수료 배분율 시각화 막대 (직원 몫 % : 사무소 몫 %) */
export function SplitRatioMeter({
  payType,
  commissionRateInput,
  defaultAgentRate = DEFAULT_AGENT_RATE,
}: {
  payType: string;
  commissionRateInput: string | number | null | undefined;
  defaultAgentRate?: number;
}) {
  const ratio = computeSplitRatio(payType, commissionRateInput, defaultAgentRate);

  if (ratio.isFixed) {
    return (
      <div className="emp-split-meter-box">
        <div className="emp-split-meter-head">
          <span>고정급 구성원 (수수료 배분 없음)</span>
          <span className="emp-num text-[var(--emp-ink-2)]">사무소 100%</span>
        </div>
        <div className="emp-split-meter-bar" aria-label="수수료 배분 비율">
          <div className="emp-split-office-fill flex-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="emp-split-meter-box">
      <div className="emp-split-meter-head">
        <span className="emp-num text-[var(--emp-blue-hover)]">
          직원 몫 {ratio.agentPct}%{ratio.usingDefault ? ' (사무소 기본)' : ''}
        </span>
        <span className="emp-num text-[var(--emp-ink-2)]">
          사무소 몫 {ratio.officePct}%
        </span>
      </div>
      <div className="emp-split-meter-bar" aria-label="수수료 배분 비율">
        <div
          className="emp-split-agent-fill"
          style={{ width: `${ratio.agentPct}%` }}
        />
        <div className="emp-split-office-fill flex-1" />
      </div>
    </div>
  );
}

/** 지금 챙길 것 카드 (긴급 항목 없으면 1줄 상태 스트립으로 압축) */
export function EmployeeAttentionCard({
  detail,
  actorRole,
}: {
  detail: EmployeeDetail;
  actorRole: string;
}) {
  const attention = useMemo(
    () => buildEmployeeAttention(detail, actorRole),
    [actorRole, detail],
  );
  const hasLate = attention.some((item) => item.tone === 'late');

  if (attention.length === 0) {
    return (
      <div className="emp-attention-clear" aria-label="긴급 확인 상태">
        <CheckCircle2
          className="size-4 shrink-0 text-[var(--emp-emerald)]"
          aria-hidden="true"
        />
        <span>기한이 지났거나 곧 닥치는 일정이 없습니다.</span>
      </div>
    );
  }

  return (
    <section
      className="emp-card-block"
      aria-labelledby="emp-attention-heading"
    >
      <div className="emp-card-block-head">
        <h3 id="emp-attention-heading" className="emp-card-block-title flex items-center gap-2">
          <span>지금 챙길 것</span>
          <span
            className={cn(
              'emp-pill emp-num',
              hasLate ? 'emp-pill-red' : 'emp-pill-amber',
            )}
          >
            {attention.length}
          </span>
        </h3>
      </div>
      <div className="emp-card-block-body">
        <div className="emp-item-list">
          {attention.map((item) => {
            const whenLabel =
              item.amountManwon != null
                ? formatMoney(item.amountManwon)
                : item.when;
            const content = (
              <>
                <span
                  className={cn(
                    'emp-pill shrink-0',
                    item.tone === 'late' ? 'emp-pill-red' : 'emp-pill-amber',
                  )}
                >
                  {item.label}
                </span>
                <span className="emp-trunc flex-1 text-[13px] font-medium text-[var(--emp-ink)]">
                  {item.text}
                </span>
                {whenLabel ? (
                  <span
                    className={cn(
                      'emp-num shrink-0 text-xs font-semibold',
                      item.tone === 'late'
                        ? 'text-[var(--emp-red-strong)]'
                        : 'text-[var(--emp-amber-strong)]',
                    )}
                  >
                    {whenLabel}
                  </span>
                ) : null}
              </>
            );
            const rowClass = cn(
              'emp-item-row flex items-center gap-2.5',
              item.tone === 'late' ? 'is-late' : 'is-soon',
            );

            if (item.kind === 'task' && item.taskId) {
              return (
                <Link
                  key={item.key}
                  to="/tasks"
                  search={{ task: item.taskId }}
                  className={rowClass}
                >
                  {content}
                </Link>
              );
            }
            if (item.kind === 'buyer' && item.requirementId) {
              return (
                <Link
                  key={item.key}
                  to="/buyer-requirements/$id"
                  params={{ id: item.requirementId }}
                  className={rowClass}
                >
                  {content}
                </Link>
              );
            }
            return (
              <Link
                key={item.key}
                to={
                  item.settlementRoute ??
                  (actorRole === 'owner'
                    ? '/cashflow/employee-settlements'
                    : '/cashflow/my-settlement')
                }
                className={rowClass}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** 업무 현황 탭 내 거래 파이프라인 프리뷰 카드 (상위 4건, 전체는 '거래 · 정산' 탭) */
export function EmployeeDealsPreviewCard({
  detail,
  actorRole,
  onViewAllDeals,
}: {
  detail: EmployeeDetail;
  actorRole: string;
  onViewAllDeals: () => void;
}) {
  const deals = detail.dealParticipants;
  const previewDeals = deals.slice(0, 4);
  const hideAmountsForOtherAgent =
    actorRole === 'agent' && !detail.payVisible;

  return (
    <section className="emp-card-block" aria-labelledby="emp-deals-heading">
      <div className="emp-card-block-head">
        <h3 id="emp-deals-heading" className="emp-card-block-title flex items-center gap-2">
          <span>참여 거래</span>
          <span className="emp-num text-xs font-semibold text-[var(--emp-ink-3)]">
            {deals.length}
          </span>
        </h3>
        <button
          type="button"
          onClick={onViewAllDeals}
          className="emp-btn-subtle"
          style={{ height: 26, fontSize: 12 }}
        >
          <span>거래 · 정산 전체</span>
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="emp-card-block-body">
        {previewDeals.length === 0 ? (
          <p className="text-[13px] text-[var(--emp-ink-3)]">
            참여 중인 거래가 없습니다.
          </p>
        ) : (
          <div className="emp-item-list">
            {previewDeals.map((participant) => {
              const settled = participant.settlementStatus === 'settled';
              const stageMeta = getStatusMeta(
                'dealStage',
                participant.deal.stage,
              );
              const schedule = formatDealNextSchedule(participant.deal);
              const parties = [
                participant.deal.sellerContact?.name,
                participant.deal.buyerContact?.name,
              ]
                .filter(Boolean)
                .join(' · ');
              const roleText =
                PARTICIPANT_ROLE_LABELS[participant.role] ?? participant.role;

              return (
                <Link
                  key={participant.id}
                  to="/deals"
                  search={{ dealId: participant.deal.id }}
                  className="emp-crm-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="emp-trunc text-[13px] font-semibold text-[var(--emp-ink)]">
                        {formatDealPlace(participant)}
                      </span>
                      <span
                        className={cn(
                          'emp-pill',
                          toneToEmpPill(stageMeta.tone),
                        )}
                      >
                        {stageMeta.label}
                      </span>
                      {schedule ? (
                        <span className="emp-num inline-flex items-center gap-1 text-[11px] text-[var(--emp-ink-3)]">
                          <CalendarClock className="size-3" aria-hidden="true" />
                          {schedule.label}{' '}
                          {formatRelativeDay(schedule.date, new Date(), {
                            withWeekday: false,
                          })}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--emp-ink-3)]">
                      <span className="emp-num font-medium text-[var(--emp-ink-2)]">
                        {formatDealValueSummary(participant.deal)}
                      </span>
                      {parties ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{parties}</span>
                        </>
                      ) : null}
                      <span aria-hidden="true">·</span>
                      <span>
                        {roleText}
                        {participant.sharePercent != null
                          ? ` ${participant.sharePercent}%`
                          : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={cn(
                        'emp-pill',
                        settled ? 'emp-pill-emerald' : 'emp-pill-amber',
                      )}
                    >
                      {settled ? '정산 완료' : '미정산'}
                    </span>
                    <span className="emp-num min-w-[66px] text-right text-[13px] font-bold text-[var(--emp-ink)]">
                      {hideAmountsForOtherAgent
                        ? '—'
                        : participant.commissionAmount
                          ? formatMoney(participant.commissionAmount)
                          : '—'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** 담당 업무 카드 (전체/지연 필터 + 문맥 요약 + 빠른 업무 배정) */
export function EmployeeTasksCard({
  detail,
  onAssignTask,
}: {
  detail: EmployeeDetail;
  onAssignTask?: () => void;
}) {
  const [taskFilter, setTaskFilter] = useState<'all' | 'overdue'>('all');

  const tasks = useMemo(
    () =>
      [...detail.assignedTasks].sort(
        (a, b) =>
          new Date(a.dueDate ?? '9999-12-31').getTime() -
          new Date(b.dueDate ?? '9999-12-31').getTime(),
      ),
    [detail.assignedTasks],
  );

  const overdueCount = useMemo(
    () =>
      tasks.filter((task) => {
        const done = ['completed', 'cancelled'].includes(task.status);
        return !done && task.dueDate != null && daysUntilDate(task.dueDate) < 0;
      }).length,
    [tasks],
  );

  const visibleTasks = useMemo(
    () =>
      taskFilter === 'overdue'
        ? tasks.filter((task) => {
            const done = ['completed', 'cancelled'].includes(task.status);
            return (
              !done && task.dueDate != null && daysUntilDate(task.dueDate) < 0
            );
          })
        : tasks,
    [taskFilter, tasks],
  );

  return (
    <section className="emp-card-block" aria-labelledby="emp-tasks-heading">
      <div className="emp-card-block-head flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            id="emp-tasks-heading"
            className="emp-card-block-title flex items-center gap-2"
          >
            <span>담당 업무</span>
            <span className="emp-num text-xs font-semibold text-[var(--emp-ink-3)]">
              {tasks.length}
            </span>
          </h3>
          {tasks.length > 0 ? (
            <div className="emp-seg-track" role="group" aria-label="업무 필터">
              <button
                type="button"
                aria-pressed={taskFilter === 'all'}
                onClick={() => setTaskFilter('all')}
                className="emp-seg-btn"
                style={{ height: 22, padding: '0 8px', fontSize: 11.5 }}
              >
                전체
              </button>
              <button
                type="button"
                aria-pressed={taskFilter === 'overdue'}
                onClick={() => setTaskFilter('overdue')}
                className="emp-seg-btn"
                style={{ height: 22, padding: '0 8px', fontSize: 11.5 }}
              >
                <span>지연</span>
                {overdueCount > 0 ? (
                  <span className="emp-seg-count emp-num">{overdueCount}</span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {onAssignTask ? (
            <button
              type="button"
              onClick={onAssignTask}
              className="emp-btn-subtle"
              style={{ height: 24, fontSize: 12 }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>배정</span>
            </button>
          ) : null}
          <Link
            to="/tasks"
            className="emp-btn-subtle"
            style={{ height: 24, fontSize: 12 }}
          >
            업무
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="emp-card-block-body">
        {visibleTasks.length === 0 ? (
          <p className="text-[13px] text-[var(--emp-ink-3)]">
            {taskFilter === 'overdue'
              ? '기한이 지난 업무가 없습니다.'
              : '담당 업무가 없습니다.'}
          </p>
        ) : (
          <div className="emp-item-list">
            {visibleTasks.map((task) => {
              const done = ['completed', 'cancelled'].includes(task.status);
              const days =
                task.dueDate && !done ? daysUntilDate(task.dueDate) : null;
              const pillCls =
                days === null
                  ? 'emp-pill-gray'
                  : days < 0
                    ? 'emp-pill-red'
                    : days <= 3
                      ? 'emp-pill-amber'
                      : 'emp-pill-gray';
              const contextLabel = formatTaskContextLabel(task);
              const priorityCls =
                task.priority === 'urgent'
                  ? 'bg-[var(--emp-red)]'
                  : task.priority === 'high'
                    ? 'bg-[var(--emp-amber)]'
                    : 'bg-[var(--emp-ink-4)]';

              return (
                <Link
                  key={task.id}
                  to="/tasks"
                  search={{ task: task.id }}
                  className="emp-crm-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        title={TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
                        aria-hidden="true"
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          priorityCls,
                        )}
                      />
                      <span
                        className={cn(
                          'emp-trunc text-[13px] font-medium text-[var(--emp-ink)]',
                          done && 'text-[var(--emp-ink-3)] line-through',
                        )}
                      >
                        {task.title}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-4 text-xs text-[var(--emp-ink-3)]">
                      <span>{getStatusMeta('taskStatus', task.status).label}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
                      </span>
                      {contextLabel ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="emp-trunc text-[var(--emp-ink-2)]">
                            {contextLabel}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span className={cn('emp-pill emp-num shrink-0', pillCls)}>
                    {days === null ? '기한 없음' : dueLabelForDays(days)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** 담당 고객(희망 조건) 카드 — 예산·희망지역·긴급도·매칭수 표시 */
export function EmployeeBuyersCard({ detail }: { detail: EmployeeDetail }) {
  const buyers = detail.assignedBuyerRequirements;

  return (
    <section className="emp-card-block" aria-labelledby="emp-buyers-heading">
      <div className="emp-card-block-head">
        <h3
          id="emp-buyers-heading"
          className="emp-card-block-title flex items-center gap-2"
        >
          <span>담당 고객</span>
          <span className="emp-num text-xs font-semibold text-[var(--emp-ink-3)]">
            {buyers.length}
          </span>
        </h3>
        <Link
          to="/wanted-properties"
          className="emp-btn-subtle"
          style={{ height: 24, fontSize: 12 }}
        >
          희망매물
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="emp-card-block-body">
        {buyers.length === 0 ? (
          <p className="text-[13px] text-[var(--emp-ink-3)]">
            담당 고객이 없습니다.
          </p>
        ) : (
          <div className="emp-item-list">
            {buyers.map((requirement) => {
              const days =
                requirement.nextContactDate && requirement.status === 'active'
                  ? daysUntilDate(requirement.nextContactDate)
                  : null;
              const pillCls =
                days === null
                  ? 'emp-pill-gray'
                  : days < 0
                    ? 'emp-pill-red'
                    : days <= 3
                      ? 'emp-pill-amber'
                      : 'emp-pill-gray';
              const locationSummary = formatBuyerLocationSummary(requirement);
              const matchCount = requirement._count?.matches ?? 0;

              return (
                <Link
                  key={requirement.id}
                  to="/buyer-requirements/$id"
                  params={{ id: requirement.id }}
                  className="emp-crm-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="emp-trunc text-[13px] font-semibold text-[var(--emp-ink)]">
                        {requirement.contact?.name ?? '고객'}
                      </span>
                      {requirement.urgency === 'urgent' ? (
                        <span className="emp-pill emp-pill-red">급함</span>
                      ) : null}
                      <span className="emp-num text-xs font-medium text-[var(--emp-ink-2)]">
                        {formatBuyerBudgetSummary(requirement)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--emp-ink-3)]">
                      <span>
                        {BUYER_STATUS_LABELS[requirement.status] ??
                          requirement.status}
                      </span>
                      {locationSummary ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[var(--emp-ink-2)]">
                            <MapPin className="size-3 shrink-0" aria-hidden="true" />
                            {locationSummary}
                          </span>
                        </>
                      ) : null}
                      {matchCount > 0 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="emp-num">매칭 {matchCount}건</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span className={cn('emp-pill emp-num shrink-0', pillCls)}>
                    {days === null ? '연락일 미정' : `연락 ${dueLabelForDays(days)}`}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** 담당 프로젝트 카드 */
export function EmployeeProjectsCard({ detail }: { detail: EmployeeDetail }) {
  const projects = detail.assignedProjects ?? [];

  return (
    <section
      className="emp-card-block"
      aria-labelledby="emp-projects-heading"
    >
      <div className="emp-card-block-head">
        <h3
          id="emp-projects-heading"
          className="emp-card-block-title flex items-center gap-2"
        >
          <span>담당 프로젝트</span>
          <span className="emp-num text-xs font-semibold text-[var(--emp-ink-3)]">
            {projects.length}
          </span>
        </h3>
        <Link
          to="/projects"
          className="emp-btn-subtle"
          style={{ height: 24, fontSize: 12 }}
        >
          프로젝트
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="emp-card-block-body">
        {projects.length === 0 ? (
          <p className="text-[13px] text-[var(--emp-ink-3)]">
            담당 중인 프로젝트가 없습니다.
          </p>
        ) : (
          <div className="emp-item-list">
            {projects.map((project) => {
              const title =
                project.title?.trim() ||
                (project.primaryContact?.name
                  ? `${project.primaryContact.name} 프로젝트`
                  : '제목 없는 프로젝트');
              const intakeSummary = `매물 ${project._count.listingIntakes} · 구매 ${project._count.buyerIntakes}`;

              return (
                <Link
                  key={project.id}
                  to="/projects/$id"
                  params={{ id: project.id }}
                  className="emp-crm-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <FolderKanban
                        className="size-3.5 shrink-0 text-[var(--emp-ink-3)]"
                        aria-hidden="true"
                      />
                      <span className="emp-trunc text-[13px] font-semibold text-[var(--emp-ink)]">
                        {title}
                      </span>
                      {project.primaryContact ? (
                        <span className="emp-pill emp-pill-gray shrink-0">
                          {project.primaryContact.name}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-xs text-[var(--emp-ink-3)]">
                      <span className="emp-num">{intakeSummary}</span>
                      {project.totalStepCount > 0 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="emp-num text-[var(--emp-ink-2)]">
                            진행 {project.completedStepCount}/
                            {project.totalStepCount}단계
                          </span>
                        </>
                      ) : null}
                      {project._count.comments > 0 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="emp-num">
                            코멘트 {project._count.comments}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span className="emp-num shrink-0 text-[11.5px] text-[var(--emp-ink-3)]">
                    {formatRelativeDay(project.updatedAt, new Date(), {
                      withWeekday: false,
                    })}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** 우측 컨텍스트 레일 1: 최근 30일 활동 스코어카드 + 채널 비율 + 4주 주간 리듬 */
export function EmployeeActivityScorecard({
  performance,
}: {
  performance: EmployeePerformance | undefined;
}) {
  const byType = performance?.consultationByType30d ?? {
    phone: 0,
    visit: 0,
    online: 0,
  };
  const channelTotal = byType.phone + byType.visit + byType.online;
  const weekly = performance?.weeklyActivity ?? [];
  const maxWeekly = Math.max(
    1,
    ...weekly.map((bucket) => bucket.consultations + bucket.activities),
  );

  return (
    <section className="emp-card-block" aria-labelledby="emp-scorecard-heading">
      <div className="emp-card-block-head">
        <h3 id="emp-scorecard-heading" className="emp-card-block-title">
          최근 30일 활동
        </h3>
        <span className="text-[11.5px] text-[var(--emp-ink-3)]">
          KST 기준
        </span>
      </div>
      <div className="emp-card-block-body flex flex-col gap-3.5">
        <div className="emp-scorecard-grid">
          <div className="emp-scorecard-stat">
            <span className="text-[11px] text-[var(--emp-ink-3)]">상담</span>
            <strong className="emp-num text-base font-bold text-[var(--emp-ink)]">
              {performance?.consultationCount30d ?? 0}건
            </strong>
          </div>
          <div className="emp-scorecard-stat">
            <span className="text-[11px] text-[var(--emp-ink-3)]">완료 업무</span>
            <strong className="emp-num text-base font-bold text-[var(--emp-ink)]">
              {performance?.completedTaskCount30d ?? 0}건
            </strong>
          </div>
          <div className="emp-scorecard-stat">
            <span className="text-[11px] text-[var(--emp-ink-3)]">성사 거래</span>
            <strong className="emp-num text-base font-bold text-[var(--emp-ink)]">
              {performance?.closedDealCount ?? 0}건
            </strong>
          </div>
        </div>

        {/* 상담 채널 비율 */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-[var(--emp-ink-3)]">
            <span>상담 채널</span>
            <span className="emp-num">
              전화 {byType.phone} · 방문 {byType.visit} · 온라인 {byType.online}
            </span>
          </div>
          <div className="emp-channel-bar" aria-label="30일 상담 채널 비율">
            {channelTotal > 0 ? (
              <>
                {byType.phone > 0 ? (
                  <div
                    className="emp-seg-task"
                    style={{ width: `${(byType.phone / channelTotal) * 100}%` }}
                  />
                ) : null}
                {byType.visit > 0 ? (
                  <div
                    className="emp-seg-deal"
                    style={{ width: `${(byType.visit / channelTotal) * 100}%` }}
                  />
                ) : null}
                {byType.online > 0 ? (
                  <div
                    className="emp-seg-buyer"
                    style={{ width: `${(byType.online / channelTotal) * 100}%` }}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {/* 4주 주간 활동 리듬 */}
        {weekly.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-[11.5px] text-[var(--emp-ink-3)]">
              <span>주간 활동 추이</span>
              <span>상담 + 기록</span>
            </div>
            <div className="emp-pulse-chart" role="list" aria-label="주간 활동 추이">
              {weekly.map((bucket) => {
                const total = bucket.consultations + bucket.activities;
                const heightPct =
                  total === 0 ? 6 : Math.max(14, Math.round((total / maxWeekly) * 100));
                return (
                  <div
                    key={bucket.label}
                    role="listitem"
                    className="emp-pulse-col"
                    title={`${bucket.label}: 상담 ${bucket.consultations}건 · 기록 ${bucket.activities}건`}
                  >
                    <span className="emp-num text-[11px] font-semibold text-[var(--emp-ink-2)]">
                      {total}
                    </span>
                    <div className="emp-pulse-bar-track">
                      <div
                        className={cn(
                          'emp-pulse-bar',
                          total === 0 && 'is-empty',
                        )}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[var(--emp-ink-3)]">
                      {bucket.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** 우측 컨텍스트 레일 2: CRM 속성 인스펙터 + 급여/배분 요약(열람 권한 시) */
export function EmployeeInspectorCard({
  employee,
  detail,
  onOpenAccount,
}: {
  employee: Employee;
  detail: EmployeeDetail;
  onOpenAccount: () => void;
}) {
  const showPaySummary = Boolean(
    detail.payVisible && detail.role !== 'owner',
  );
  const payText = paySummaryText(employee);
  const defaultAgentRate = getCommissionNumber(
    detail.office.commissionConfig,
    'defaultAgentRate',
    DEFAULT_AGENT_RATE,
  );

  return (
    <section className="emp-card-block" aria-labelledby="emp-inspector-heading">
      <div className="emp-card-block-head">
        <h3 id="emp-inspector-heading" className="emp-card-block-title">
          인사 · 계정 정보
        </h3>
      </div>
      <div className="emp-card-block-body flex flex-col gap-3">
        <dl className="emp-kv-list">
          <div className="emp-kv-row">
            <dt className="emp-kv-label">역할</dt>
            <dd className="emp-kv-value">
              <RolePill role={detail.role} compact />
            </dd>
          </div>
          <div className="emp-kv-row">
            <dt className="emp-kv-label">자격 구분</dt>
            <dd className="emp-kv-value">{licenseLabel(detail.licenseType)}</dd>
          </div>
          {detail.licenseNo ? (
            <div className="emp-kv-row">
              <dt className="emp-kv-label">자격·등록번호</dt>
              <dd className="emp-kv-value">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(detail.licenseNo!)
                      .then(() =>
                        toast.success('자격·등록번호를 복사했습니다.'),
                      )
                      .catch(() =>
                        toast.error('자격·등록번호를 복사하지 못했습니다.'),
                      );
                  }}
                  title="자격·등록번호 복사"
                  className="emp-copy-chip emp-pressable emp-num"
                >
                  {detail.licenseNo}
                </button>
              </dd>
            </div>
          ) : null}
          <div className="emp-kv-row">
            <dt className="emp-kv-label">로그인 ID</dt>
            <dd className="emp-kv-value font-mono text-xs">{detail.loginId}</dd>
          </div>
          <div className="emp-kv-row">
            <dt className="emp-kv-label">등록일</dt>
            <dd className="emp-kv-value emp-num">
              {formatDate(detail.createdAt)}
            </dd>
          </div>
          <div className="emp-kv-row">
            <dt className="emp-kv-label">최근 로그인</dt>
            <dd className="emp-kv-value">
              {detail.lastLoginAt ? timeAgo(detail.lastLoginAt) : '기록 없음'}
            </dd>
          </div>
          <div className="emp-kv-row">
            <dt className="emp-kv-label">마지막 활동</dt>
            <dd className="emp-kv-value">
              {employee.latestActivityAt
                ? timeAgo(employee.latestActivityAt)
                : '기록 없음'}
            </dd>
          </div>
        </dl>

        {showPaySummary ? (
          <div className="border-t border-[var(--emp-line-soft)] pt-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--emp-ink-2)]">
                보상 · 정산 조건
              </span>
              <button
                type="button"
                onClick={onOpenAccount}
                className="font-medium text-[var(--emp-blue-hover)] hover:underline"
              >
                설정 보기 →
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--emp-ink-2)]">
              <span className="emp-pill emp-pill-gray">
                {detail.employmentType === 'employee'
                  ? '근로자'
                  : detail.withholdTax
                    ? '프리랜서 · 3.3% 공제'
                    : '프리랜서 · 공제 안 함'}
              </span>
              {payText ? (
                <span className="emp-num font-semibold text-[var(--emp-ink)]">
                  {payText}
                </span>
              ) : null}
            </div>
            <SplitRatioMeter
              payType={detail.payType ?? 'mixed'}
              commissionRateInput={detail.commissionRate}
              defaultAgentRate={defaultAgentRate}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** 통합 타임라인 (전체 | 상담 | 시스템 기록 필터) */
export function EmployeeTimelinePanel({
  detail,
  performance,
}: {
  detail: EmployeeDetail;
  performance?: EmployeePerformance;
}) {
  const [filter, setFilter] = useState<TimelineFilter>('all');

  const allDays = useMemo(
    () =>
      buildEmployeeTimeline(detail, new Date(), {
        consultationTypeLabels: CONSULTATION_TYPE_LABELS,
        describeActivity,
        describeActivitySource,
      }),
    [detail],
  );

  const counts = useMemo(() => {
    let total = 0;
    let consultations = 0;
    for (const day of allDays) {
      for (const entry of day.entries) {
        total += 1;
        if (entry.kind === 'consultation') consultations += 1;
      }
    }
    return { total, consultations, activities: total - consultations };
  }, [allDays]);

  const filteredDays = useMemo(
    () =>
      allDays
        .map((day) => ({
          day: day.day,
          entries: day.entries.filter(
            (entry) => filter === 'all' || entry.kind === filter,
          ),
        }))
        .filter((day) => day.entries.length > 0),
    [allDays, filter],
  );

  const byType = performance?.consultationByType30d;

  return (
    <div aria-label="활동 타임라인">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="emp-seg-track" role="group" aria-label="타임라인 필터">
            <FilterTab
              active={filter === 'all'}
              count={counts.total}
              onClick={() => setFilter('all')}
            >
              전체
            </FilterTab>
            <FilterTab
              active={filter === 'consultation'}
              count={counts.consultations}
              onClick={() => setFilter('consultation')}
            >
              상담
            </FilterTab>
            <FilterTab
              active={filter === 'activity'}
              count={counts.activities}
              onClick={() => setFilter('activity')}
            >
              시스템 기록
            </FilterTab>
          </div>
          {byType ? (
            <span className="emp-num hidden text-xs text-[var(--emp-ink-3)] sm:inline">
              최근 30일: 전화 {byType.phone} · 방문 {byType.visit} · 온라인{' '}
              {byType.online}
            </span>
          ) : null}
        </div>

        <Link
          to="/consultations"
          className="emp-btn-subtle"
          style={{ height: 28, fontSize: 12 }}
        >
          상담분석
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {filteredDays.length === 0 ? (
        <div className="emp-card-block p-7 text-center text-[13px] text-[var(--emp-ink-3)]">
          표시할 상담 및 활동 기록이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredDays.map(({ day, entries }) => (
            <div key={day} className="emp-tl-day-card">
              <div className="emp-tl-day-lbl">{day}</div>
              <ol className="emp-tl-list">
                {entries.map((entry) => {
                  const isConsult = entry.kind === 'consultation';
                  const body = (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn('emp-tl-node', !isConsult && 'is-act')}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="emp-trunc flex-1 text-[13px] font-semibold text-[var(--emp-ink)]">
                            {entry.title}
                          </span>
                          {!isConsult && entry.meta ? (
                            <span
                              className="emp-pill emp-pill-gray"
                              style={{ height: 18, fontSize: 11 }}
                            >
                              {entry.meta}
                            </span>
                          ) : null}
                          <time
                            dateTime={entry.at}
                            className="emp-num shrink-0 text-[11.5px] text-[var(--emp-ink-3)]"
                          >
                            {clockTime(entry.at)}
                          </time>
                        </div>
                        {entry.body ? (
                          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--emp-ink-2)]">
                            {entry.body}
                          </p>
                        ) : null}
                      </div>
                    </>
                  );

                  return (
                    <li key={entry.key}>
                      {isConsult && entry.consultationId ? (
                        <Link
                          to="/consultations"
                          search={{ consultationId: entry.consultationId }}
                          className="emp-tl-entry"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="emp-tl-entry">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="emp-seg-btn"
    >
      {children}
      <span className="emp-seg-count emp-num">{count}</span>
    </button>
  );
}
