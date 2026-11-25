import './-employees.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { ROLE_LABELS, getCommissionNumber } from './-employee-shared';
import {
  DEFAULT_AGENT_RATE,
  buildTeamAttentionQueue,
  filterAndSortEmployees,
  type BentoTab,
  type EmployeeSort,
  type QuickFilter,
  type StatusFilter,
} from './-employee-model';
import { EmployeeSidebarRail } from './-employee-sidebar-rail';
import { EmployeeOpsHub } from './-employee-ops-hub';
import { EmployeeBentoProfile } from './-employee-bento-profile';
import { EmployeeAddWizard } from './-employee-add-wizard';

/**
 * 직원관리 — 통합 마스터-디테일 워크스페이스.
 * - 대표·매니저: 좌측 구성원 사이드바('팀 전체 관제' 고정 + 구성원 목록)에서
 *   누른 항목에 따라 우측이 팀 전체 관제 허브 또는 해당 직원의 풀 벤토 프로필로 즉시 바뀐다.
 * - 중개사: 사이드바와 관제 허브 없이 본인 솔로 벤토 프로필만 본다.
 */
export function EmployeeActivityScreen() {
  const { user } = useAuth();
  const actorId = user?.id ?? null;
  const actorRole = user?.role ?? 'agent';
  const canSeeTeam = actorRole === 'owner' || actorRole === 'manager';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bentoTab, setBentoTab] = useState<BentoTab>('overview');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [roleFilter, setRoleFilter] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<EmployeeSort>('workload');
  const [wizardOpen, setWizardOpen] = useState(false);

  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });
  const officeQuery = useQuery({
    queryKey: ['office-profile'],
    queryFn: () => api.offices.getMe(),
    enabled: canSeeTeam,
  });

  const employees = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data],
  );
  // 중개사는 본인만, 대표·매니저는 팀 전체 조회
  const visible = useMemo(
    () =>
      canSeeTeam
        ? employees
        : employees.filter((employee) => employee.id === actorId),
    [actorId, canSeeTeam, employees],
  );

  // 좌측 구성원 레일은 자체 상태 탭·검색 기준으로만 좁힌다
  const sidebarEmployees = useMemo(
    () =>
      filterAndSortEmployees(visible, {
        statusFilter,
        roleFilter: '',
        quickFilter: 'all',
        search,
        sort,
      }),
    [search, sort, statusFilter, visible],
  );

  // 관제 허브 비교 표는 KPI 빠른 필터와 역할 필터까지 함께 반영한다
  const hubTableEmployees = useMemo(
    () =>
      filterAndSortEmployees(visible, {
        statusFilter,
        roleFilter,
        quickFilter,
        search,
        sort,
      }),
    [quickFilter, roleFilter, search, sort, statusFilter, visible],
  );

  const attentionQueue = useMemo(
    () =>
      canSeeTeam
        ? buildTeamAttentionQueue(visible, new Date(), ROLE_LABELS)
        : [],
    [canSeeTeam, visible],
  );

  const selectedEmployee = useMemo(() => {
    if (!canSeeTeam) return visible[0] ?? null;
    if (!selectedId) return null;
    return visible.find((employee) => employee.id === selectedId) ?? null;
  }, [canSeeTeam, selectedId, visible]);

  const activeCount =
    officeQuery.data?.counts.activeUsers ??
    employees.filter((employee) => employee.isActive).length;
  const maxUsers = officeQuery.data?.maxUsers ?? null;
  const defaultAgentRate = getCommissionNumber(
    officeQuery.data?.commissionConfig,
    'defaultAgentRate',
    DEFAULT_AGENT_RATE,
  );

  const resetFilters = () => {
    setStatusFilter('active');
    setRoleFilter('');
    setQuickFilter('all');
    setSearch('');
    setSort('workload');
  };

  const selectHub = () => {
    setSelectedId(null);
    mainScrollRef.current?.scrollTo({ top: 0 });
  };

  const selectEmployee = (employeeId: string, tab: BentoTab = 'overview') => {
    if (!canSeeTeam) return;
    setSelectedId(employeeId);
    setBentoTab(tab);
    mainScrollRef.current?.scrollTo({ top: 0 });
  };

  // 단축키: '/' 검색 포커스, '↑'/'↓' 프로필 구성원 이동
  useEffect(() => {
    if (!canSeeTeam) return;

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target?.isContentEditable ?? false);
      const hasOpenDialog = Boolean(
        document.querySelector(
          '[data-slot="dialog-content"], [data-slot="alert-dialog-content"]',
        ),
      );
      if (hasOpenDialog || isTyping) return;

      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        sidebarSearchRef.current?.focus();
        return;
      }

      if (
        (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
        selectedId !== null &&
        sidebarEmployees.length > 0
      ) {
        event.preventDefault();
        const idx = sidebarEmployees.findIndex(
          (employee) => employee.id === selectedId,
        );
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIdx =
          idx < 0
            ? 0
            : Math.max(0, Math.min(sidebarEmployees.length - 1, idx + delta));
        const nextEmployee = sidebarEmployees[nextIdx];
        if (nextEmployee && nextEmployee.id !== selectedId) {
          setSelectedId(nextEmployee.id);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canSeeTeam, selectedId, sidebarEmployees]);

  return (
    <div
      data-employees-page
      className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      {canSeeTeam ? (
        <div className="emp-workspace-shell">
          <EmployeeSidebarRail
            allEmployees={visible}
            filteredEmployees={sidebarEmployees}
            selectedId={selectedEmployee?.id ?? null}
            actorId={actorId}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            search={search}
            onSearchChange={setSearch}
            searchRef={sidebarSearchRef}
            attentionCount={attentionQueue.length}
            hasLateAttention={attentionQueue.some((item) => item.late)}
            onSelectHub={selectHub}
            onSelectEmployee={(id) =>
              selectEmployee(id, selectedId ? bentoTab : 'overview')
            }
            onOpenWizard={() => setWizardOpen(true)}
            isLoading={employeesQuery.isLoading}
            isError={employeesQuery.isError}
            onRetry={() => void employeesQuery.refetch()}
          />

          <div ref={mainScrollRef} className="emp-workspace-main">
            {selectedEmployee ? (
              <EmployeeBentoProfile
                canSeeTeam={canSeeTeam}
                employee={selectedEmployee}
                sidebarEmployees={sidebarEmployees}
                actorId={actorId}
                actorRole={actorRole}
                activeTab={bentoTab}
                onTabChange={setBentoTab}
                onBackToHub={selectHub}
                onSelectEmployee={(id) => selectEmployee(id, bentoTab)}
                isLoading={employeesQuery.isLoading}
                isError={employeesQuery.isError}
                onRetry={() => void employeesQuery.refetch()}
              />
            ) : (
              <EmployeeOpsHub
                allEmployees={visible}
                filteredEmployees={hubTableEmployees}
                actorId={actorId}
                actorRole={actorRole}
                activeCount={activeCount}
                maxUsers={maxUsers}
                defaultAgentRate={defaultAgentRate}
                isLoading={employeesQuery.isLoading}
                isError={employeesQuery.isError}
                onRetry={() => void employeesQuery.refetch()}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                roleFilter={roleFilter}
                onRoleFilterChange={setRoleFilter}
                quickFilter={quickFilter}
                onQuickFilterChange={setQuickFilter}
                search={search}
                sort={sort}
                onSortChange={setSort}
                onResetFilters={resetFilters}
                onSelectEmployee={selectEmployee}
                onOpenWizard={() => setWizardOpen(true)}
              />
            )}
          </div>

          <EmployeeAddWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            actorRole={actorRole}
            activeCount={activeCount}
            maxUsers={maxUsers}
            defaultAgentRate={defaultAgentRate}
            onCreated={(createdId) => {
              resetFilters();
              selectEmployee(createdId, 'account');
            }}
          />
        </div>
      ) : (
        <div className="emp-bento-solo-scroll">
          <EmployeeBentoProfile
            canSeeTeam={false}
            employee={selectedEmployee}
            sidebarEmployees={[]}
            actorId={actorId}
            actorRole={actorRole}
            activeTab={bentoTab}
            onTabChange={setBentoTab}
            onBackToHub={() => undefined}
            onSelectEmployee={() => undefined}
            isLoading={employeesQuery.isLoading}
            isError={employeesQuery.isError}
            onRetry={() => void employeesQuery.refetch()}
          />
        </div>
      )}
    </div>
  );
}
