import { useMemo, type RefObject } from 'react';
import { LayoutGrid, Plus, RotateCw, Search, X } from 'lucide-react';
import type { Employee } from '@estate-erp/api-client';
import { timeAgo } from '@/lib/time-ago';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ROLE_LABELS } from './-employee-shared';
import {
  buildTeamKpis,
  isEmployeeQuiet,
  lateCountOf,
  workloadOfEmployee,
  type StatusFilter,
} from './-employee-model';
import { EmployeeAvatar } from './-employee-work-sections';

/**
 * 좌측 고정 구성원 사이드바.
 * 맨 위 '팀 전체 관제'와 개별 구성원을 한 목록에 두어 1클릭으로 우측 화면을 전환한다.
 */
export function EmployeeSidebarRail({
  allEmployees,
  filteredEmployees,
  selectedId,
  actorId,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  searchRef,
  attentionCount,
  hasLateAttention,
  onSelectHub,
  onSelectEmployee,
  onOpenWizard,
  isLoading,
  isError,
  onRetry,
}: {
  allEmployees: Employee[];
  filteredEmployees: Employee[];
  selectedId: string | null;
  actorId: string | null;
  statusFilter: StatusFilter;
  onStatusFilterChange: (next: StatusFilter) => void;
  search: string;
  onSearchChange: (next: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  attentionCount: number;
  hasLateAttention: boolean;
  onSelectHub: () => void;
  onSelectEmployee: (employeeId: string) => void;
  onOpenWizard: () => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const kpis = useMemo(() => buildTeamKpis(allEmployees), [allEmployees]);

  return (
    <aside
      data-employee-roster
      aria-label="직원 목록"
      className="emp-rail"
    >
      {/* 상단 제목 + 추가 */}
      <div className="emp-rail-head">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-[13.5px] font-bold tracking-[-0.015em] text-[var(--emp-ink)]">
              구성원
            </span>
            <span className="emp-pill emp-pill-gray emp-num" style={{ height: 19, fontSize: 11 }}>
              {kpis.activeCount}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenWizard}
            className="emp-btn-blue emp-pressable"
            style={{ height: 28, fontSize: 12, padding: '0 9px', borderRadius: 7 }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>추가</span>
          </button>
        </div>

        {/* 고정 상단 항목: 팀 전체 관제 */}
        <button
          type="button"
          data-hub-nav
          aria-current={selectedId === null ? 'true' : undefined}
          onClick={onSelectHub}
          className={cn(
            'emp-rail-hub-btn emp-pressable',
            selectedId === null && 'is-selected',
          )}
        >
          <span className="emp-rail-hub-icon" aria-hidden="true">
            <LayoutGrid className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">
              팀 전체 관제
            </span>
            <span className="emp-num mt-0.5 block text-[11px] text-[var(--emp-ink-3)]">
              재직 {kpis.activeCount}명 · 전체 {kpis.totalCount}명
            </span>
          </span>
          {attentionCount > 0 ? (
            <span
              className={cn(
                'emp-pill emp-num',
                hasLateAttention ? 'emp-pill-red' : 'emp-pill-amber',
              )}
              style={{ height: 20, fontSize: 11, padding: '0 7px' }}
            >
              {attentionCount}
            </span>
          ) : null}
        </button>

        {/* 검색 & 재직 상태 탭 */}
        <label className="emp-search-box" style={{ maxWidth: 'none' }}>
          <Search
            className="size-3.5 shrink-0 text-[var(--emp-ink-3)]"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (search) onSearchChange('');
                else event.currentTarget.blur();
              }
              if (event.key === 'Enter' && filteredEmployees[0]) {
                onSelectEmployee(filteredEmployees[0].id);
              }
            }}
            placeholder="이름, 아이디, 연락처 ( / )"
            aria-label="직원 검색"
          />
          {search ? (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => onSearchChange('')}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--emp-ink-3)] hover:bg-[var(--emp-surface-hover)] hover:text-[var(--emp-ink)]"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </label>

        <div
          className="emp-seg-track grid w-full grid-cols-3"
          role="tablist"
          aria-label="재직 상태"
        >
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'active'}
            onClick={() => onStatusFilterChange('active')}
            className="emp-seg-btn justify-center"
          >
            재직 <span className="emp-seg-count emp-num">{kpis.activeCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'inactive'}
            onClick={() => onStatusFilterChange('inactive')}
            className="emp-seg-btn justify-center"
          >
            비활성 <span className="emp-seg-count emp-num">{kpis.inactiveCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'all'}
            onClick={() => onStatusFilterChange('all')}
            className="emp-seg-btn justify-center"
          >
            전체 <span className="emp-seg-count emp-num">{kpis.totalCount}</span>
          </button>
        </div>
      </div>

      {/* 구성원 리스트 */}
      <div className="emp-bento-nav-scroll">
        {isLoading ? (
          <div className="space-y-1.5 p-1">
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="px-3 py-8 text-center">
            <p className="text-[12.5px] text-[var(--emp-ink-2)]">
              직원 목록을 불러오지 못했습니다.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="emp-btn-soft mt-3"
              style={{ height: 30, fontSize: 12 }}
            >
              <RotateCw className="size-3.5" aria-hidden="true" />
              <span>다시 시도</span>
            </button>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <p className="px-3 py-9 text-center text-[12.5px] text-[var(--emp-ink-3)]">
            {allEmployees.length === 0
              ? '등록된 직원이 없습니다.'
              : '일치하는 구성원이 없습니다.'}
          </p>
        ) : (
          filteredEmployees.map((employee) => {
            const isSelected = selectedId === employee.id;
            const late = lateCountOf(employee);
            const quiet = isEmployeeQuiet(employee);
            const workload = workloadOfEmployee(employee);

            return (
              <button
                key={employee.id}
                type="button"
                data-employee-row
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelectEmployee(employee.id)}
                className={cn(
                  'emp-bento-member-btn',
                  isSelected && 'is-selected',
                )}
              >
                <EmployeeAvatar employee={employee} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={cn(
                        'emp-trunc text-[13.5px] font-semibold',
                        employee.isActive
                          ? 'text-[var(--emp-ink)]'
                          : 'text-[var(--emp-ink-3)]',
                      )}
                    >
                      {employee.name}
                      {employee.id === actorId ? (
                        <span className="ml-1 text-[11px] font-semibold text-[var(--emp-blue)]">
                          나
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'emp-num shrink-0 text-[11.5px] font-semibold',
                        late > 0
                          ? 'text-[var(--emp-red)]'
                          : quiet
                            ? 'text-[var(--emp-amber)]'
                            : 'text-[var(--emp-ink-3)]',
                      )}
                    >
                      {late > 0
                        ? `지연 ${late}`
                        : quiet
                          ? '무활동'
                          : `${workload}건`}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-1.5 text-[11.5px] text-[var(--emp-ink-3)]">
                    <span>{ROLE_LABELS[employee.role] ?? employee.role}</span>
                    <span className="emp-num">
                      {employee.counts.unsettledDealCount > 0
                        ? `미정산 ${employee.counts.unsettledDealCount}건`
                        : employee.latestActivityAt
                          ? timeAgo(employee.latestActivityAt)
                          : '기록 없음'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
