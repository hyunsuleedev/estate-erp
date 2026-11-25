import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  ChevronRight,
  Plus,
  RotateCcw,
  RotateCw,
  Users,
  Wallet,
} from 'lucide-react';
import type { Employee } from '@estate-erp/api-client';
import { formatMoney } from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ROLE_LABELS, licenseLabel } from './-employee-shared';
import {
  DEFAULT_AGENT_RATE,
  buildTeamAttentionQueue,
  buildTeamKpis,
  isEmployeeQuiet,
  paySummaryText,
  quietDaysOf,
  workloadOfEmployee,
  type BentoTab,
  type EmployeeSort,
  type LeaderboardMetric,
  type QuickFilter,
  type StatusFilter,
} from './-employee-model';
import { EmployeeAvatar, RolePill } from './-employee-work-sections';

/**
 * 우측 기본 뷰 — 팀 전체 관제 허브.
 * 좌측 구성원 사이드바가 목록·검색을 맡고, 여기는 KPI · 성과 리더보드 · 긴급 대기열 · 5열 비교 현황표에 집중한다.
 */
export function EmployeeOpsHub({
  allEmployees,
  filteredEmployees,
  actorId,
  actorRole,
  activeCount,
  maxUsers,
  defaultAgentRate = DEFAULT_AGENT_RATE,
  isLoading,
  isError,
  onRetry,
  statusFilter,
  onStatusFilterChange,
  roleFilter,
  onRoleFilterChange,
  quickFilter,
  onQuickFilterChange,
  search,
  sort,
  onSortChange,
  onResetFilters,
  onSelectEmployee,
  onOpenWizard,
}: {
  allEmployees: Employee[];
  filteredEmployees: Employee[];
  actorId: string | null;
  actorRole: string;
  activeCount: number;
  maxUsers: number | null;
  defaultAgentRate?: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (next: StatusFilter) => void;
  roleFilter: string;
  onRoleFilterChange: (next: string) => void;
  quickFilter: QuickFilter;
  onQuickFilterChange: (next: QuickFilter) => void;
  search: string;
  sort: EmployeeSort;
  onSortChange: (next: EmployeeSort) => void;
  onResetFilters: () => void;
  onSelectEmployee: (employeeId: string, tab?: BentoTab) => void;
  onOpenWizard: () => void;
}) {
  const [lbMetric, setLbMetric] = useState<LeaderboardMetric>('commission');

  const isOwner = actorRole === 'owner';
  const isSeatFull = maxUsers != null && activeCount >= maxUsers;
  const seatPct =
    maxUsers && maxUsers > 0
      ? Math.min(100, Math.round((activeCount / maxUsers) * 100))
      : null;

  const kpis = useMemo(() => buildTeamKpis(allEmployees), [allEmployees]);
  const activeTeam = useMemo(
    () => allEmployees.filter((employee) => employee.isActive),
    [allEmployees],
  );
  const attentionQueue = useMemo(
    () => buildTeamAttentionQueue(allEmployees, new Date(), ROLE_LABELS),
    [allEmployees],
  );

  const lbSorted = useMemo(() => {
    const valOf = (emp: Employee) => {
      if (lbMetric === 'commission') return emp.counts.commissionAmountTotal ?? 0;
      if (lbMetric === 'consultations') return emp.counts.consultationCount ?? 0;
      return workloadOfEmployee(emp);
    };
    return [...activeTeam].sort(
      (a, b) => valOf(b) - valOf(a) || a.name.localeCompare(b.name, 'ko'),
    );
  }, [activeTeam, lbMetric]);

  const lbMax = useMemo(() => {
    const vals = lbSorted.map((emp) => {
      if (lbMetric === 'commission') return emp.counts.commissionAmountTotal ?? 0;
      if (lbMetric === 'consultations') return emp.counts.consultationCount ?? 0;
      return workloadOfEmployee(emp);
    });
    return Math.max(1, ...vals);
  }, [lbMetric, lbSorted]);

  const maxWorkload = useMemo(
    () => Math.max(1, ...allEmployees.map(workloadOfEmployee)),
    [allEmployees],
  );

  const isDirtyFilters = Boolean(
    search.trim() ||
      roleFilter ||
      quickFilter !== 'all' ||
      sort !== 'workload' ||
      statusFilter !== 'active',
  );

  return (
    <div className="emp-ops-container">
      {/* 헤더 */}
      <header className="emp-page-header">
        <div>
          <h1 className="emp-page-title">팀 전체 관제</h1>
          <p className="emp-page-sub">
            팀 성과 리더보드, 긴급 확인 대기열과 구성원별 업무·실적을 한 화면에서 비교합니다.
          </p>
        </div>

        <div className="emp-header-actions">
          <div className={cn('emp-seat-card', isSeatFull && 'is-full')}>
            <span>
              사용 중인 계정{' '}
              <strong className="emp-num">
                {maxUsers != null ? `${activeCount} / ${maxUsers}석` : `${activeCount}명`}
              </strong>
            </span>
            {seatPct != null ? (
              <span
                className="emp-seat-bar"
                aria-label="직원 계정 슬롯 사용량"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={maxUsers ?? undefined}
                aria-valuenow={activeCount}
              >
                <span
                  className="emp-seat-bar-fill block"
                  style={{ width: `${seatPct}%` }}
                />
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onOpenWizard}
            className="emp-btn-blue emp-pressable"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>직원 추가</span>
          </button>
        </div>
      </header>

      {/* 4개 KPI 필터 카드 */}
      <section className="emp-kpi-grid" aria-label="팀 현황 요약">
        <button
          type="button"
          onClick={() => onQuickFilterChange('all')}
          className={cn(
            'emp-kpi-card emp-pressable',
            quickFilter === 'all' && 'is-selected',
          )}
        >
          <div className="emp-kpi-top">
            <span className="emp-kpi-label">재직 구성원</span>
            <span className="emp-kpi-icon-box is-blue">
              <Users className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div className="emp-kpi-value emp-num">{kpis.activeCount}명</div>
          <div className="emp-kpi-hint emp-num">
            비활성 {kpis.inactiveCount}명 · 전체 {kpis.totalCount}명
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onStatusFilterChange('active');
            onQuickFilterChange(quickFilter === 'busy' ? 'all' : 'busy');
          }}
          className={cn(
            'emp-kpi-card emp-pressable',
            quickFilter === 'busy' && 'is-selected',
          )}
        >
          <div className="emp-kpi-top">
            <span className="emp-kpi-label">진행 중 총 업무</span>
            <span className="emp-kpi-icon-box">
              <Briefcase className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div className="emp-kpi-value emp-num">{kpis.workload}건</div>
          <div className="emp-kpi-hint emp-num">
            업무 {kpis.tasks} · 고객 {kpis.customers} · 거래 {kpis.deals}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onStatusFilterChange('active');
            onQuickFilterChange(
              quickFilter === 'unsettled' ? 'all' : 'unsettled',
            );
          }}
          className={cn(
            'emp-kpi-card emp-pressable',
            quickFilter === 'unsettled' && 'is-selected',
          )}
        >
          <div className="emp-kpi-top">
            <span className="emp-kpi-label">미정산 수수료</span>
            <span className="emp-kpi-icon-box is-amber">
              <Wallet className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div className="emp-kpi-value emp-num">{kpis.unsettledPeople}명</div>
          <div className="emp-kpi-hint emp-num">
            {kpis.unsettledCommissionTotal > 0
              ? `미정산 합계 ${formatMoney(kpis.unsettledCommissionTotal)}`
              : kpis.unsettledDeals > 0
                ? `미정산 거래 ${kpis.unsettledDeals}건`
                : '미정산 없음'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onStatusFilterChange('active');
            onQuickFilterChange(
              quickFilter === 'attention' ? 'all' : 'attention',
            );
          }}
          className={cn(
            'emp-kpi-card emp-pressable',
            quickFilter === 'attention' && 'is-selected',
          )}
        >
          <div className="emp-kpi-top">
            <span className="emp-kpi-label">관심 필요</span>
            <span className="emp-kpi-icon-box is-red">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div className="emp-kpi-value emp-num">{kpis.attentionPeople}명</div>
          <div className="emp-kpi-hint">기한 지연 또는 7일+ 활동 없음</div>
        </button>
      </section>

      {/* 2열 인사이트: 팀 성과 리더보드 + 지금 확인이 필요한 항목 */}
      {!isLoading && !isError ? (
        <section className="emp-ops-grid-2">
          <div className="emp-panel-card">
            <div className="emp-panel-head">
              <div>
                <h2 className="emp-panel-title">팀 성과 · 업무량 리더보드</h2>
                <div className="emp-panel-sub">
                  막대를 누르면 해당 구성원의 상세 프로필을 엽니다
                </div>
              </div>
              <div
                className="emp-seg-track"
                role="group"
                aria-label="리더보드 지표"
              >
                <button
                  type="button"
                  aria-pressed={lbMetric === 'commission'}
                  onClick={() => setLbMetric('commission')}
                  className="emp-seg-btn"
                >
                  수수료
                </button>
                <button
                  type="button"
                  aria-pressed={lbMetric === 'consultations'}
                  onClick={() => setLbMetric('consultations')}
                  className="emp-seg-btn"
                >
                  상담
                </button>
                <button
                  type="button"
                  aria-pressed={lbMetric === 'workload'}
                  onClick={() => setLbMetric('workload')}
                  className="emp-seg-btn"
                >
                  업무량
                </button>
              </div>
            </div>
            <div className="emp-lb-list max-h-[274px] overflow-y-auto">
              {lbSorted.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-[var(--emp-ink-3)]">
                  활성 구성원이 없습니다.
                </p>
              ) : (
                lbSorted.map((employee) => {
                  const rawVal =
                    lbMetric === 'commission'
                      ? employee.counts.commissionAmountTotal ?? 0
                      : lbMetric === 'consultations'
                        ? employee.counts.consultationCount ?? 0
                        : workloadOfEmployee(employee);
                  const pct =
                    rawVal === 0
                      ? 0
                      : Math.max(4, Math.round((rawVal / lbMax) * 100));
                  const fillCls =
                    lbMetric === 'commission'
                      ? 'is-emerald'
                      : lbMetric === 'consultations'
                        ? 'is-indigo'
                        : '';
                  const labelVal =
                    lbMetric === 'commission'
                      ? rawVal > 0
                        ? formatMoney(rawVal)
                        : '0원'
                      : `${rawVal}건`;

                  return (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => onSelectEmployee(employee.id, 'overview')}
                      className="emp-lb-row"
                    >
                      <span className="emp-lb-person">
                        <EmployeeAvatar employee={employee} size="xs" />
                        <span className="emp-trunc">{employee.name}</span>
                      </span>
                      <span className="emp-lb-track" aria-hidden="true">
                        <span
                          className={cn('emp-lb-fill', fillCls)}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="emp-lb-val emp-num">{labelVal}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="emp-panel-card">
            <div className="emp-panel-head">
              <div>
                <h2 className="emp-panel-title">지금 확인이 필요한 항목</h2>
                <div className="emp-panel-sub">
                  팀 전체의 기한 지연·오늘 연락·무활동 구성원 집계
                </div>
              </div>
              <span
                className={cn(
                  'emp-pill emp-num',
                  attentionQueue.some((item) => item.late)
                    ? 'emp-pill-red'
                    : attentionQueue.length > 0
                      ? 'emp-pill-amber'
                      : 'emp-pill-gray',
                )}
              >
                {attentionQueue.length}건
              </span>
            </div>
            <div className="emp-queue-scroll">
              {attentionQueue.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-[var(--emp-ink-3)]">
                  긴급하게 확인할 항목이 없습니다.
                </p>
              ) : (
                attentionQueue.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      onSelectEmployee(item.employeeId, item.targetTab)
                    }
                    className="emp-queue-item emp-pressable"
                  >
                    <span
                      aria-hidden="true"
                      className={cn('emp-queue-dot', item.late && 'is-late')}
                    />
                    <div className="emp-queue-body">
                      <div className="emp-queue-title emp-trunc">
                        {item.title}
                      </div>
                      <div className="emp-queue-meta">{item.sub}</div>
                    </div>
                    <span
                      className={cn(
                        'emp-pill emp-num',
                        item.late ? 'emp-pill-red' : 'emp-pill-amber',
                      )}
                    >
                      {item.badge}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* 컴팩트 5열 구성원 비교 현황표 */}
      <section className="emp-panel-card">
        <div className="emp-panel-head flex-wrap gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="emp-panel-title">
              구성원 비교 현황표
              <span className="emp-num ml-1.5 font-medium text-[var(--emp-ink-3)]">
                {filteredEmployees.length}명
              </span>
            </h2>
            {quickFilter !== 'all' ? (
              <span className="emp-pill emp-pill-blue">
                {quickFilter === 'busy'
                  ? '진행 업무 있음'
                  : quickFilter === 'unsettled'
                    ? '미정산 있음'
                    : '관심 필요'}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="역할 필터"
              value={roleFilter}
              onChange={(event) => onRoleFilterChange(event.target.value)}
              className="emp-filter-select"
              style={{ height: 32 }}
            >
              <option value="">모든 역할</option>
              <option value="owner">대표</option>
              <option value="manager">매니저</option>
              <option value="agent">중개사</option>
            </select>

            <select
              aria-label="정렬 기준"
              value={sort}
              onChange={(event) =>
                onSortChange(event.target.value as EmployeeSort)
              }
              className="emp-filter-select"
              style={{ height: 32 }}
            >
              <option value="workload">업무량순</option>
              <option value="commission">누적 수수료순</option>
              <option value="recent">최근 활동순</option>
              <option value="name">이름순</option>
            </select>

            {isDirtyFilters ? (
              <button
                type="button"
                onClick={onResetFilters}
                className="emp-btn-subtle emp-pressable"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                <span>초기화</span>
              </button>
            ) : null}

            <div
              className="ml-1 hidden items-center gap-2.5 text-xs text-[var(--emp-ink-3)] sm:flex"
              aria-hidden="true"
            >
              <span className="inline-flex items-center gap-1">
                <i className="inline-block size-2 rounded-[2px] bg-[var(--emp-seg-task)]" />
                업무
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="inline-block size-2 rounded-[2px] bg-[var(--emp-seg-buyer)]" />
                고객
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="inline-block size-2 rounded-[2px] bg-[var(--emp-seg-deal)]" />
                거래
              </span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2.5 p-5">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-[13.5px] text-[var(--emp-ink-2)]">
              직원 목록을 불러오지 못했습니다.
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
        ) : filteredEmployees.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-[14px] font-semibold text-[var(--emp-ink)]">
              {allEmployees.length === 0
                ? '등록된 직원이 없습니다.'
                : '조건에 맞는 구성원이 없습니다'}
            </div>
            <div className="mt-1 text-[13px] text-[var(--emp-ink-3)]">
              {allEmployees.length === 0
                ? '우측 상단 직원 추가 버튼을 눌러 첫 구성원을 등록해 보세요.'
                : '검색어나 상태·역할 필터를 초기화해 보세요.'}
            </div>
            {allEmployees.length > 0 ? (
              <div className="mt-3.5 flex items-center justify-center gap-2">
                {statusFilter === 'active' && kpis.inactiveCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => onStatusFilterChange('all')}
                    className="emp-btn-soft emp-pressable"
                  >
                    비활성 포함해서 보기
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="emp-btn-soft emp-pressable"
                >
                  필터 초기화
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="emp-clean-table-wrap">
            <table className="emp-clean-table" aria-label="구성원 비교 표">
              <thead>
                <tr>
                  <th>구성원</th>
                  <th style={{ width: 205 }}>업무 부하</th>
                  <th>누적 실적</th>
                  <th>미정산</th>
                  <th>최근 활동</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const { counts } = employee;
                  const workload = workloadOfEmployee(employee);
                  const quiet = isEmployeeQuiet(employee);
                  const quietDays = quietDaysOf(employee);
                  const isSelf = employee.id === actorId;
                  const tPct = (counts.activeTaskCount / maxWorkload) * 100;
                  const bPct =
                    (counts.activeBuyerRequirementCount / maxWorkload) * 100;
                  const dPct = (counts.activeDealCount / maxWorkload) * 100;
                  const payText = paySummaryText(employee, defaultAgentRate);
                  const unsettledMoney = counts.unsettledCommissionTotal ?? 0;
                  const totalCommission = counts.commissionAmountTotal ?? 0;

                  return (
                    <tr
                      key={employee.id}
                      data-ops-row
                      tabIndex={0}
                      aria-label={`${employee.name} 프로필 열기`}
                      onClick={() => onSelectEmployee(employee.id, 'overview')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectEmployee(employee.id, 'overview');
                        }
                      }}
                    >
                      <td>
                        <div className="flex items-center gap-2.5">
                          <EmployeeAvatar employee={employee} size="sm" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  'font-semibold',
                                  !employee.isActive &&
                                    'text-[var(--emp-ink-3)]',
                                )}
                              >
                                {employee.name}
                              </span>
                              <RolePill role={employee.role} compact />
                              {isSelf ? (
                                <span
                                  className="emp-pill emp-pill-blue"
                                  style={{ height: 18, fontSize: 10.5 }}
                                >
                                  나
                                </span>
                              ) : null}
                              {!employee.isActive ? (
                                <span
                                  className="emp-pill emp-pill-gray"
                                  style={{ height: 18, fontSize: 10.5 }}
                                >
                                  비활성
                                </span>
                              ) : null}
                            </div>
                            <div className="emp-trunc emp-num mt-0.5 text-xs text-[var(--emp-ink-3)]">
                              {licenseLabel(employee.licenseType)}
                              {isOwner && payText ? ` · ${payText}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="emp-mc-bar-wrap">
                          <div className="emp-mc-bar" aria-hidden="true">
                            {counts.activeTaskCount > 0 ? (
                              <span
                                className="emp-seg-task"
                                style={{ width: `${tPct}%` }}
                              />
                            ) : null}
                            {counts.activeBuyerRequirementCount > 0 ? (
                              <span
                                className="emp-seg-buyer"
                                style={{ width: `${bPct}%` }}
                              />
                            ) : null}
                            {counts.activeDealCount > 0 ? (
                              <span
                                className="emp-seg-deal"
                                style={{ width: `${dPct}%` }}
                              />
                            ) : null}
                          </div>
                          <span className="emp-mc-bar-meta emp-num min-w-[44px] text-right font-semibold text-[var(--emp-ink-2)]">
                            {workload}건
                          </span>
                        </div>
                        <div className="emp-num mt-0.5 text-[11.5px] text-[var(--emp-ink-3)]">
                          업무 {counts.activeTaskCount} · 고객{' '}
                          {counts.activeBuyerRequirementCount} · 거래{' '}
                          {counts.activeDealCount}
                        </div>
                      </td>
                      <td>
                        <div className="emp-num font-semibold">
                          {totalCommission > 0
                            ? formatMoney(totalCommission)
                            : '0원'}
                        </div>
                        <div className="emp-num text-[11.5px] text-[var(--emp-ink-3)]">
                          상담 {counts.consultationCount ?? 0}건
                        </div>
                      </td>
                      <td>
                        {counts.unsettledDealCount > 0 ? (
                          <span className="emp-pill emp-pill-amber emp-num">
                            {counts.unsettledDealCount}건
                            {unsettledMoney > 0
                              ? ` · ${formatMoney(unsettledMoney)}`
                              : ''}
                          </span>
                        ) : (
                          <span className="text-[var(--emp-ink-3)]">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-between gap-2">
                          {quiet ? (
                            <span className="emp-pill emp-pill-amber emp-num">
                              {quietDays === null
                                ? '활동 없음'
                                : `${quietDays}일째 무활동`}
                            </span>
                          ) : employee.latestActivityAt ? (
                            <span className="text-[var(--emp-ink-2)]">
                              {timeAgo(employee.latestActivityAt)}
                            </span>
                          ) : (
                            <span className="text-[var(--emp-ink-3)]">—</span>
                          )}
                          <ChevronRight
                            className="size-4 shrink-0 text-[var(--emp-ink-3)]"
                            aria-hidden="true"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
