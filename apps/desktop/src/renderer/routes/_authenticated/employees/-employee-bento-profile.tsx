import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  RotateCw,
  Settings2,
} from 'lucide-react';
import type { Employee, EmployeeDetail } from '@estate-erp/api-client';
import {
  employeeQueries,
  invalidateEmployeeSections,
  useEmployeeDetail,
} from '@/queries/employees';
import { formatDate, formatMoney, formatPhone } from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { CONSULTATION_TYPE_LABELS } from '../buyer-requirements/-buyer-utils';
import { TaskCreateDialog } from '../tasks/-task-create-dialog';
import {
  clockTime,
  describeActivity,
  describeActivitySource,
  licenseLabel,
} from './-employee-shared';
import {
  buildEmployeeTimeline,
  isEmployeeQuiet,
  workloadOfEmployee,
  type BentoTab,
} from './-employee-model';
import {
  CopyChip,
  EmployeeActivityScorecard,
  EmployeeAttentionCard,
  EmployeeAvatar,
  EmployeeBuyersCard,
  EmployeeDealsPreviewCard,
  EmployeeInspectorCard,
  EmployeeProjectsCard,
  EmployeeTasksCard,
  EmployeeTimelinePanel,
  RolePill,
} from './-employee-work-sections';
import { EmployeeDealsSettlementsTab } from './-employee-deals-tab';
import { EmployeeAccountPanel } from './-employee-account-panel';

/**
 * 우측 구성원 CRM 레코드 상세 워크스페이스.
 * - 대표·매니저: 좌측 구성원 레일에서 구성원을 고르면 우측이 이 화면으로 즉시 바뀐다.
 * - 중개사: 본인 솔로 상세 워크스페이스만 단독으로 본다.
 */
export function EmployeeBentoProfile({
  canSeeTeam,
  employee,
  sidebarEmployees,
  actorId,
  actorRole,
  activeTab,
  onTabChange,
  onBackToHub,
  onSelectEmployee,
  isLoading,
  isError,
  onRetry,
}: {
  canSeeTeam: boolean;
  employee: Employee | null;
  sidebarEmployees: Employee[];
  actorId: string | null;
  actorRole: string;
  activeTab: BentoTab;
  onTabChange: (tab: BentoTab) => void;
  onBackToHub: () => void;
  onSelectEmployee: (employeeId: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  const idx = employee
    ? sidebarEmployees.findIndex((item) => item.id === employee.id)
    : -1;
  const canAssignTask = Boolean(
    employee && employee.isActive && (canSeeTeam || employee.id === actorId),
  );

  return (
    <div className="emp-bento-profile-wrap">
      {canSeeTeam || canAssignTask ? (
        <div className="emp-profile-topbar">
          {canSeeTeam ? (
            <button
              type="button"
              onClick={onBackToHub}
              className="emp-btn-soft emp-pressable"
              style={{ height: 32, padding: '0 11px', fontSize: 12.5 }}
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              <span>팀 전체 관제</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {canAssignTask ? (
              <button
                type="button"
                onClick={() => setTaskDialogOpen(true)}
                className="emp-btn-blue emp-pressable"
                style={{ height: 32, padding: '0 12px', fontSize: 12.5 }}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>업무 배정</span>
              </button>
            ) : null}

            {canSeeTeam && employee && activeTab !== 'account' ? (
              <button
                type="button"
                onClick={() => onTabChange('account')}
                className="emp-btn-soft emp-pressable"
                style={{ height: 32, padding: '0 11px', fontSize: 12.5 }}
              >
                <Settings2 className="size-3.5" aria-hidden="true" />
                <span>인사·급여</span>
              </button>
            ) : null}

            {canSeeTeam && idx >= 0 ? (
              <div className="ml-1 flex items-center gap-1">
                <span className="emp-num mr-1 text-xs text-[var(--emp-ink-3)]">
                  {idx + 1} / {sidebarEmployees.length}
                </span>
                <button
                  type="button"
                  disabled={idx <= 0}
                  onClick={() => onSelectEmployee(sidebarEmployees[idx - 1].id)}
                  aria-label="이전 구성원"
                  title="이전 (↑)"
                  className="emp-rail-icon-btn"
                >
                  <ChevronUp className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={idx >= sidebarEmployees.length - 1}
                  onClick={() => onSelectEmployee(sidebarEmployees[idx + 1].id)}
                  aria-label="다음 구성원"
                  title="다음 (↓)"
                  className="emp-rail-icon-btn"
                >
                  <ChevronDown className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <BentoSkeleton />
      ) : isError ? (
        <BentoError onRetry={onRetry} />
      ) : employee ? (
        <>
          <ProfileContent
            key={employee.id}
            employee={employee}
            actorId={actorId}
            actorRole={actorRole}
            canAssignTask={canAssignTask}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onOpenAssignTask={() => setTaskDialogOpen(true)}
          />
          {canAssignTask ? (
            <TaskCreateDialog
              open={taskDialogOpen}
              onOpenChange={setTaskDialogOpen}
              defaultAssigneeId={employee.id}
              onCreated={() => {
                // 업무가 생겼으니 담당 업무 목록과 건수만 다시 받는다
                invalidateEmployeeSections(queryClient, ['tasks'], employee.id);
              }}
            />
          ) : null}
        </>
      ) : (
        <div className="emp-card-block p-10 text-center text-[13.5px] text-[var(--emp-ink-3)]">
          {canSeeTeam
            ? '선택한 구성원을 찾을 수 없습니다.'
            : '내 프로필 정보를 불러올 수 없습니다.'}
        </div>
      )}
    </div>
  );
}

function ProfileContent({
  employee,
  actorId,
  actorRole,
  canAssignTask,
  activeTab,
  onTabChange,
  onOpenAssignTask,
}: {
  employee: Employee;
  actorId: string | null;
  actorRole: string;
  canAssignTask: boolean;
  activeTab: BentoTab;
  onTabChange: (tab: BentoTab) => void;
  onOpenAssignTask: () => void;
}) {
  const detailQuery = useEmployeeDetail(employee.id);
  const performanceQuery = useQuery(employeeQueries.performance(employee.id));

  const detail = detailQuery.detail;
  const performance = performanceQuery.data;
  const { counts } = employee;
  const workload = workloadOfEmployee(employee);
  const projectCount =
    detail?.assignedProjects?.length ?? counts.activeProjectCount ?? 0;
  const quiet = isEmployeeQuiet(employee);
  const isSelf = employee.id === actorId;
  const overdueTasks = counts.overdueTaskCount ?? 0;
  const overdueBuyers = counts.overdueBuyerCount ?? 0;
  const timelineCount = detail
    ? detail.recentConsultations.length + detail.recentActivities.length
    : null;
  const dealTabCount = detail
    ? detail.dealParticipants.length
    : counts.activeDealCount;
  const consultationTotal =
    performance?.consultationCount ?? counts.consultationCount ?? null;
  const consultation30d = performance?.consultationCount30d ?? null;
  const completedTasks30d = performance?.completedTaskCount30d ?? null;
  const closedDeals = performance?.closedDealCount ?? null;
  const commissionTotal =
    performance?.commissionAmountTotal ?? counts.commissionAmountTotal ?? null;

  return (
    <div data-employee-activity className="flex flex-col gap-4">
      {/* CRM 레코드 헤더 카드 */}
      <section className="emp-hero-card">
        <div className="emp-hero-top">
          <div className="emp-hero-identity">
            <EmployeeAvatar employee={employee} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="emp-hero-name">{employee.name}</h1>
                <RolePill role={employee.role} />
                <span className="emp-pill emp-pill-gray">
                  {licenseLabel(employee.licenseType)}
                </span>
                {isSelf ? (
                  <span className="emp-pill emp-pill-blue">나</span>
                ) : null}
                {!employee.isActive ? (
                  <span className="emp-pill emp-pill-gray">비활성</span>
                ) : null}
              </div>
              <div className="emp-hero-meta">
                <span>
                  아이디{' '}
                  <strong className="font-semibold text-[var(--emp-ink)]">
                    {employee.loginId}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="emp-num">
                  등록 {formatDate(employee.createdAt)}
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    quiet
                      ? 'text-[var(--emp-amber-strong)]'
                      : 'text-[var(--emp-ink-2)]'
                  }
                >
                  {employee.latestActivityAt
                    ? `마지막 활동 ${timeAgo(employee.latestActivityAt)}`
                    : '활동 기록 없음'}
                </span>
              </div>
              {employee.phone || employee.email ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {employee.phone ? (
                    <CopyChip
                      kind="phone"
                      value={formatPhone(employee.phone)}
                      displayText={formatPhone(employee.phone)}
                    />
                  ) : null}
                  {employee.email ? (
                    <CopyChip kind="email" value={employee.email} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* 균형 잡힌 4열 KPI 스트립 */}
        <div className="emp-profile-kpi-strip">
          <button
            type="button"
            onClick={() => onTabChange('overview')}
            className="emp-hero-metric"
          >
            <div className="emp-hm-lbl">진행 업무</div>
            <div
              className={cn(
                'emp-hm-val emp-num',
                counts.activeTaskCount === 0 && 'is-zero',
              )}
            >
              {counts.activeTaskCount}건
            </div>
            <div
              className={cn(
                'emp-num text-xs',
                overdueTasks > 0
                  ? 'font-semibold text-[var(--emp-red-strong)]'
                  : 'text-[var(--emp-ink-3)]',
              )}
            >
              {overdueTasks > 0
                ? `기한 지연 ${overdueTasks}건`
                : `30일 완료 ${completedTasks30d ?? 0}건`}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('overview')}
            className="emp-hero-metric"
          >
            <div className="emp-hm-lbl">담당 고객 · 프로젝트</div>
            <div
              className={cn(
                'emp-hm-val emp-num',
                counts.activeBuyerRequirementCount === 0 && 'is-zero',
              )}
            >
              {counts.activeBuyerRequirementCount}명
            </div>
            <div
              className={cn(
                'emp-num text-xs',
                overdueBuyers > 0
                  ? 'font-semibold text-[var(--emp-red-strong)]'
                  : 'text-[var(--emp-ink-3)]',
              )}
            >
              {overdueBuyers > 0
                ? `연락 지연 ${overdueBuyers}명`
                : `진행 프로젝트 ${projectCount}건`}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('deals')}
            className="emp-hero-metric"
          >
            <div className="emp-hm-lbl">진행 거래</div>
            <div
              className={cn(
                'emp-hm-val emp-num',
                counts.activeDealCount === 0 && 'is-zero',
              )}
            >
              {counts.activeDealCount}건
            </div>
            <div
              className={cn(
                'emp-num text-xs',
                counts.unsettledDealCount > 0
                  ? 'font-semibold text-[var(--emp-amber-strong)]'
                  : 'text-[var(--emp-ink-3)]',
              )}
            >
              {counts.unsettledDealCount > 0
                ? `미정산 ${counts.unsettledDealCount}건`
                : `성사 ${closedDeals ?? 0}건`}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('deals')}
            className="emp-hero-metric"
          >
            <div className="emp-hm-lbl">참여 수수료</div>
            <div
              className={cn(
                'emp-hm-val emp-num',
                (commissionTotal ?? 0) === 0 && 'is-zero',
              )}
            >
              {commissionTotal != null
                ? commissionTotal > 0
                  ? formatMoney(commissionTotal)
                  : '0원'
                : '—'}
            </div>
            <div className="emp-num text-xs text-[var(--emp-ink-3)]">
              {consultation30d != null
                ? `30일 상담 ${consultation30d}건`
                : consultationTotal != null
                  ? `누적 상담 ${consultationTotal}건`
                  : '집계 불러오는 중'}
            </div>
          </button>
        </div>
      </section>

      {/* 언더라인 CRM 탭 네비게이션 */}
      <nav
        className="emp-underline-tabs"
        role="tablist"
        aria-label="구성원 상세 탭"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => onTabChange('overview')}
          className="emp-underline-tab"
        >
          <span>업무 현황</span>
          <span className="emp-underline-count emp-num">
            {workload + projectCount}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'deals'}
          onClick={() => onTabChange('deals')}
          className="emp-underline-tab"
        >
          <span>거래 · 정산</span>
          <span className="emp-underline-count emp-num">{dealTabCount}</span>
          {counts.unsettledDealCount > 0 ? (
            <span
              title={`미정산 ${counts.unsettledDealCount}건`}
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[var(--emp-amber)]"
            />
          ) : null}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'timeline'}
          onClick={() => onTabChange('timeline')}
          className="emp-underline-tab"
        >
          <span>활동 타임라인</span>
          {timelineCount != null ? (
            <span className="emp-underline-count emp-num">
              {timelineCount}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'account'}
          onClick={() => onTabChange('account')}
          className="emp-underline-tab"
        >
          <span>인사 · 급여 · 보안</span>
        </button>
      </nav>

      {detailQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      ) : detailQuery.isError || !detail ? (
        <BentoError onRetry={detailQuery.refetch} />
      ) : activeTab === 'overview' ? (
        <div className="emp-detail-grid">
          {/* 왼쪽: 작업 워크스트림 */}
          <div className="emp-detail-main">
            <EmployeeAttentionCard detail={detail} actorRole={actorRole} />
            <EmployeeDealsPreviewCard
              detail={detail}
              actorRole={actorRole}
              onViewAllDeals={() => onTabChange('deals')}
            />
            <EmployeeTasksCard
              detail={detail}
              onAssignTask={canAssignTask ? onOpenAssignTask : undefined}
            />
            <EmployeeBuyersCard detail={detail} />
            <EmployeeProjectsCard detail={detail} />
          </div>

          {/* 오른쪽: CRM 컨텍스트 레일 */}
          <aside className="emp-detail-rail" aria-label="활동 요약 및 인사 정보">
            <EmployeeActivityScorecard performance={performance} />
            <EmployeeInspectorCard
              employee={employee}
              detail={detail}
              onOpenAccount={() => onTabChange('account')}
            />
            <RecentActivityPreview
              detail={detail}
              onOpenFullTimeline={() => onTabChange('timeline')}
            />
          </aside>
        </div>
      ) : activeTab === 'deals' ? (
        <EmployeeDealsSettlementsTab detail={detail} actorRole={actorRole} />
      ) : activeTab === 'timeline' ? (
        <EmployeeTimelinePanel detail={detail} performance={performance} />
      ) : (
        <EmployeeAccountPanel
          key={detail.id}
          // 기본 정보만 넘긴다 — 업무·상담 목록이 다시 와도 입력 중인 양식이 초기화되지 않는다
          detail={detailQuery.profile ?? detail}
          actorRole={actorRole}
          actorId={actorId}
        />
      )}
    </div>
  );
}

function RecentActivityPreview({
  detail,
  onOpenFullTimeline,
}: {
  detail: EmployeeDetail;
  onOpenFullTimeline: () => void;
}) {
  const days = useMemo(
    () =>
      buildEmployeeTimeline(detail, new Date(), {
        consultationTypeLabels: CONSULTATION_TYPE_LABELS,
        describeActivity,
        describeActivitySource,
      }),
    [detail],
  );

  const recentItems = useMemo(
    () =>
      days
        .flatMap((group) =>
          group.entries.map((entry) => ({ ...entry, day: group.day })),
        )
        .slice(0, 4),
    [days],
  );

  return (
    <section className="emp-card-block" aria-labelledby="emp-recent-heading">
      <div className="emp-card-block-head">
        <h3 id="emp-recent-heading" className="emp-card-block-title">
          최근 활동
        </h3>
        <button
          type="button"
          onClick={onOpenFullTimeline}
          className="emp-btn-subtle"
          style={{ height: 24, fontSize: 12 }}
        >
          전체 타임라인
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="emp-card-block-body">
        {recentItems.length === 0 ? (
          <p className="text-[13px] text-[var(--emp-ink-3)]">
            기록된 활동이 없습니다.
          </p>
        ) : (
          <div className="emp-item-list">
            {recentItems.map((item) => {
              const isConsult = item.kind === 'consultation';
              const inner = (
                <>
                  <span
                    className={cn(
                      'emp-pill mt-0.5 shrink-0',
                      isConsult ? 'emp-pill-blue' : 'emp-pill-gray',
                    )}
                  >
                    {isConsult ? '상담' : item.meta ?? '기록'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="emp-trunc text-[12.5px] font-semibold text-[var(--emp-ink)]">
                      {item.title}
                    </div>
                    {item.body ? (
                      <div className="mt-0.5 line-clamp-1 text-xs text-[var(--emp-ink-2)]">
                        {item.body}
                      </div>
                    ) : null}
                  </div>
                  <span className="emp-num shrink-0 text-[11px] text-[var(--emp-ink-3)]">
                    {item.day} {clockTime(item.at)}
                  </span>
                </>
              );

              return isConsult && item.consultationId ? (
                <Link
                  key={item.key}
                  to="/consultations"
                  search={{ consultationId: item.consultationId }}
                  className="emp-item-row flex items-start gap-2.5"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={item.key}
                  className="emp-item-row flex items-start gap-2.5"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function BentoSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-10 w-80 rounded-xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

function BentoError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="emp-card-block flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-[13.5px] text-[var(--emp-ink-2)]">
        업무와 활동을 불러오지 못했습니다.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="emp-btn-soft emp-pressable"
      >
        <RotateCw className="size-3.5" aria-hidden="true" />
        <span>다시 시도</span>
      </button>
    </div>
  );
}
