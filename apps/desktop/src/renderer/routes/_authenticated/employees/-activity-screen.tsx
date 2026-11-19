import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChevronRight, RotateCw, Search, Settings2, X } from 'lucide-react';
import type { Employee, EmployeeDetail } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatMoney, formatPhone } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { timeAgo } from '@/lib/time-ago';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CONSULTATION_TYPE_LABELS } from '../buyer-requirements/-buyer-utils';
import {
  BUYER_STATUS_LABELS,
  PARTICIPANT_ROLE_LABELS,
  QUIET_DAYS,
  ROLE_LABELS,
  TASK_PRIORITY_LABELS,
  clockTime,
  dayHeading,
  daysUntil,
  describeActivity,
  describeActivitySource,
  dueLabel,
  licenseLabel,
  matchesEmployeeSearch,
  quietDays,
  workloadOf,
} from './-employee-shared';

/**
 * 직원관리 — 누가 지금 무엇을 맡고 있고 최근에 무엇을 했는지 본다.
 *
 * 화면은 세 단이다.
 *  1. 사람 목록: 맡은 양을 막대로 그려 누가 몰렸고 누가 비었는지 열지 않고 견준다.
 *  2. 고른 사람의 일: 지금 챙길 것(기한 지난 업무·연락할 고객·미정산)이 먼저, 그다음 업무·고객·거래.
 *  3. 타임라인: 상담과 활동 기록을 날짜별 한 줄기로.
 *
 * 이 화면에서는 아무것도 고치지 않는다. 계정·역할·급여·비밀번호는 설정 › 직원 및 권한에 있다.
 * 중개사는 본인 것만 본다(사람 목록이 없다).
 */

type RosterSort = 'workload' | 'recent' | 'name';

const ROSTER_SORTS: Array<{ value: RosterSort; label: string }> = [
  { value: 'workload', label: '맡은 양' },
  { value: 'recent', label: '최근 활동' },
  { value: 'name', label: '이름' },
];

/** 막대의 세 구간. 색 대신 같은 잉크의 농도로만 나눈다. */
const LOAD_SEGMENTS = [
  { key: 'tasks', label: '업무', className: 'bg-foreground/80' },
  { key: 'customers', label: '고객', className: 'bg-foreground/45' },
  { key: 'deals', label: '거래', className: 'bg-foreground/20' },
] as const;

function loadParts(employee: Employee) {
  const { counts } = employee;
  return {
    tasks: counts.activeTaskCount,
    customers: counts.activeBuyerRequirementCount,
    deals: counts.activeDealCount,
  };
}

export function EmployeeActivityScreen() {
  const { user } = useAuth();
  const canSeeTeam = user?.role === 'owner' || user?.role === 'manager';
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<RosterSort>('workload');
  const [showInactive, setShowInactive] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);

  // 중개사는 본인만. 대표·매니저는 팀 전체.
  const visible = useMemo(
    () => (canSeeTeam ? employees : employees.filter((employee) => employee.id === user?.id)),
    [canSeeTeam, employees, user?.id],
  );
  const matching = useMemo(() => {
    const filtered = visible.filter((employee) => matchesEmployeeSearch(employee, search));
    return filtered.sort((a, b) => {
      if (sort === 'workload') return workloadOf(b) - workloadOf(a) || a.name.localeCompare(b.name, 'ko');
      if (sort === 'recent') {
        return (
          new Date(b.latestActivityAt ?? 0).getTime() - new Date(a.latestActivityAt ?? 0).getTime()
        );
      }
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [search, sort, visible]);
  const active = matching.filter((employee) => employee.isActive);
  const inactive = matching.filter((employee) => !employee.isActive);
  // 막대의 기준: 팀에서 가장 많이 맡은 사람이 꽉 찬 막대다
  const maxWorkload = Math.max(1, ...visible.map(workloadOf));

  // 고른 사람이 없으면 본인 → 첫 활성 직원 순으로 보여 준다
  const selected =
    visible.find((employee) => employee.id === pickedId) ??
    visible.find((employee) => employee.id === user?.id) ??
    visible.find((employee) => employee.isActive) ??
    visible[0] ??
    null;

  // "/" 로 검색
  useEffect(() => {
    if (!canSeeTeam) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false);
      if (event.key !== '/' || isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canSeeTeam]);

  return (
    <div data-employees-page className="-m-4 flex min-h-0 min-w-0 flex-1 bg-white">
      {canSeeTeam ? (
        <aside
          data-employee-roster
          aria-label="직원 목록"
          className="flex w-[304px] shrink-0 flex-col border-r border-border bg-[#fbfbfa]"
        >
          <div className="shrink-0 px-3 pb-2 pt-3">
            <label className="flex h-[30px] cursor-text items-center gap-2 rounded-[8px] bg-white pl-2.5 pr-1.5 shadow-[inset_0_0_0_1px_rgba(42,28,0,0.1)] focus-within:shadow-[inset_0_0_0_1px_rgba(55,53,47,0.45)]">
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    if (search) setSearch('');
                    else event.currentTarget.blur();
                  }
                  if (event.key === 'Enter' && matching[0]) setPickedId(matching[0].id);
                }}
                placeholder="이름, 아이디, 연락처"
                aria-label="직원 검색"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => setSearch('')}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </label>

            <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
              <div role="group" aria-label="정렬" className="flex items-center gap-0.5">
                {ROSTER_SORTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={sort === option.value}
                    onClick={() => setSort(option.value)}
                    className={cn(
                      'h-6 rounded-[5px] px-1.5 text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/45',
                      sort === option.value
                        ? 'bg-[rgba(55,53,47,0.08)] font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {/* 막대 읽는 법 */}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-hidden="true">
                {LOAD_SEGMENTS.map((segment) => (
                  <span key={segment.key} className="inline-flex items-center gap-1">
                    <span className={cn('size-1.5 rounded-[2px]', segment.className)} />
                    {segment.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/70 py-1.5">
            {employeesQuery.isLoading ? (
              <div className="space-y-1 px-2">
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-[58px] w-full rounded-md" />
                ))}
              </div>
            ) : employeesQuery.isError ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[12.5px] text-muted-foreground">직원 목록을 불러오지 못했습니다.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void employeesQuery.refetch()}
                >
                  <RotateCw className="size-3.5" aria-hidden="true" />
                  다시 시도
                </Button>
              </div>
            ) : matching.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                {visible.length === 0 ? '등록된 직원이 없습니다.' : '찾는 직원이 없습니다.'}
              </p>
            ) : (
              <>
                <ul className="px-1.5">
                  {active.map((employee) => (
                    <RosterItem
                      key={employee.id}
                      employee={employee}
                      maxWorkload={maxWorkload}
                      selected={selected?.id === employee.id}
                      onSelect={() => setPickedId(employee.id)}
                    />
                  ))}
                </ul>
                {inactive.length > 0 ? (
                  <div className="mt-2 border-t border-border/70 px-1.5 pt-1.5">
                    <button
                      type="button"
                      aria-expanded={showInactive}
                      onClick={() => setShowInactive((open) => !open)}
                      className="flex h-7 w-full items-center gap-1 rounded-md px-2.5 text-[12px] text-muted-foreground outline-none hover:bg-[rgba(55,53,47,0.05)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
                    >
                      <ChevronRight
                        className={cn('size-3 transition-transform', showInactive && 'rotate-90')}
                        aria-hidden="true"
                      />
                      비활성 {inactive.length}명
                    </button>
                    {/* 검색 중에는 접어 두지 않는다. 찾던 사람이 비활성일 수 있다. */}
                    {showInactive || search.trim() ? (
                      <ul>
                        {inactive.map((employee) => (
                          <RosterItem
                            key={employee.id}
                            employee={employee}
                            maxWorkload={maxWorkload}
                            selected={selected?.id === employee.id}
                            onSelect={() => setPickedId(employee.id)}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </aside>
      ) : null}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected ? (
          <EmployeeActivity
            key={selected.id}
            employee={selected}
            canOpenSettings={canSeeTeam}
            isSelf={selected.id === user?.id}
          />
        ) : employeesQuery.isLoading ? (
          <div className="space-y-4 px-9 py-8">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-16 w-full max-w-[720px]" />
            <Skeleton className="h-40 w-full max-w-[720px]" />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-8 text-[13px] text-muted-foreground">
            {employeesQuery.isError ? '직원 정보를 불러오지 못했습니다.' : '볼 수 있는 직원이 없습니다.'}
          </div>
        )}
      </main>
    </div>
  );
}

/** 목록의 한 사람: 이름·역할, 맡은 양 막대, 마지막 활동 */
function RosterItem({
  employee,
  maxWorkload,
  selected,
  onSelect,
}: {
  employee: Employee;
  maxWorkload: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const parts = loadParts(employee);
  const workload = workloadOf(employee);
  const quiet = quietDays(employee);
  const isQuiet = employee.isActive && (quiet === null || quiet >= QUIET_DAYS);

  return (
    <li>
      <button
        type="button"
        data-employee-row
        aria-current={selected ? 'true' : undefined}
        aria-label={`${employee.name} 업무 현황 보기. 업무 ${parts.tasks}건, 고객 ${parts.customers}명, 거래 ${parts.deals}건`}
        onClick={onSelect}
        className={cn(
          'relative flex w-full flex-col gap-1.5 rounded-md px-2.5 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/45',
          selected
            ? 'bg-white shadow-[0_0_0_1px_rgba(42,28,0,0.1),0_1px_2px_rgba(25,25,25,0.04)]'
            : 'hover:bg-[rgba(55,53,47,0.045)]',
        )}
      >
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span
            className={cn(
              'truncate text-[14px] font-medium',
              employee.isActive ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {employee.name}
          </span>
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {ROLE_LABELS[employee.role] ?? employee.role}
          </span>
          <span
            className={cn(
              'ml-auto shrink-0 text-[11.5px] tabular-nums',
              isQuiet ? 'text-warning-strong' : 'text-muted-foreground',
            )}
          >
            {quiet === null
              ? '활동 없음'
              : isQuiet
                ? `${quiet}일째 조용`
                : timeAgo(employee.latestActivityAt as string)}
          </span>
        </span>

        {/* 맡은 양: 팀에서 가장 많이 맡은 사람이 꽉 찬 막대 */}
        <span className="flex items-center gap-2" aria-hidden="true">
          <span className="flex h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[rgba(55,53,47,0.07)]">
            {LOAD_SEGMENTS.map((segment) =>
              parts[segment.key] > 0 ? (
                <span
                  key={segment.key}
                  className={segment.className}
                  style={{ width: `${(parts[segment.key] / maxWorkload) * 100}%` }}
                />
              ) : null,
            )}
          </span>
          <span
            className={cn(
              'w-5 shrink-0 text-right text-[12px] tabular-nums',
              workload > 0 ? 'font-medium text-foreground' : 'text-muted-foreground/60',
            )}
          >
            {workload}
          </span>
        </span>

        {employee.counts.unsettledDealCount > 0 ? (
          <span className="text-[11.5px] tabular-nums text-warning-strong">
            미정산 {employee.counts.unsettledDealCount}건
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** 한 사람의 업무와 활동 */
function EmployeeActivity({
  employee,
  canOpenSettings,
  isSelf,
}: {
  employee: Employee;
  canOpenSettings: boolean;
  isSelf: boolean;
}) {
  const detailQuery = useQuery({
    queryKey: ['employee', employee.id],
    queryFn: () => api.employees.findOne(employee.id),
  });
  const performanceQuery = useQuery({
    queryKey: ['employee-performance', employee.id],
    queryFn: () => api.employees.getPerformance(employee.id),
  });
  const detail = detailQuery.data;
  const performance = performanceQuery.data;
  const { counts } = employee;

  return (
    <div data-employee-activity className="flex min-h-0 flex-1 flex-col">
      {/* 머리: 누구인지, 그리고 숫자 한 줄 */}
      <header className="shrink-0 border-b border-border px-9 pb-5 pt-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h1 className="truncate text-[26px] font-bold leading-[1.2] tracking-[-0.03em] text-foreground">
                {employee.name}
              </h1>
              <span className="text-[13px] text-muted-foreground">
                {ROLE_LABELS[employee.role] ?? employee.role}
                {isSelf ? ' · 나' : ''}
              </span>
              {!employee.isActive ? (
                <span className="inline-flex h-5 items-center rounded-[4px] bg-[#f1f1ef] px-1.5 text-[12px] text-[#787774]">
                  비활성
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
              <span>{licenseLabel(employee.licenseType)}</span>
              {employee.phone ? (
                <>
                  <Dot />
                  <span className="tabular-nums">{formatPhone(employee.phone)}</span>
                </>
              ) : null}
              <Dot />
              <span>
                {employee.latestActivityAt
                  ? `마지막 활동 ${timeAgo(employee.latestActivityAt)}`
                  : '활동 기록 없음'}
              </span>
            </p>
          </div>
          {canOpenSettings ? (
            <Link
              to="/settings"
              search={{ section: 'team' }}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] text-muted-foreground outline-none transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
            >
              <Settings2 className="size-3.5" aria-hidden="true" />
              계정·권한 설정
            </Link>
          ) : null}
        </div>

        {/* 지금 맡은 것 │ 지금까지 */}
        <dl className="mt-5 flex flex-wrap items-end gap-x-9 gap-y-3">
          <Figure label="진행 업무" value={counts.activeTaskCount} unit="건" />
          <Figure label="담당 고객" value={counts.activeBuyerRequirementCount} unit="명" />
          <Figure label="진행 거래" value={counts.activeDealCount} unit="건" />
          <Figure
            label="미정산"
            value={counts.unsettledDealCount}
            unit="건"
            tone={counts.unsettledDealCount > 0 ? 'warning' : undefined}
          />
          <span aria-hidden="true" className="hidden h-9 w-px self-center bg-border sm:block" />
          <Figure
            label="누적 상담"
            value={performance ? performance.consultationCount : null}
            unit="건"
            quiet
          />
          <Figure
            label="참여 수수료"
            text={performance ? formatMoney(performance.commissionAmountTotal) : null}
            quiet
          />
        </dl>
      </header>

      {detailQuery.isLoading ? (
        <div className="space-y-3 px-9 py-7">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-full max-w-[640px]" />
          <Skeleton className="h-10 w-full max-w-[640px]" />
          <Skeleton className="h-10 w-full max-w-[640px]" />
        </div>
      ) : detailQuery.isError || !detail ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[13px] text-muted-foreground">업무와 활동을 불러오지 못했습니다.</p>
          <Button variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>
            <RotateCw className="size-3.5" aria-hidden="true" />
            다시 시도
          </Button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_372px]">
          <div className="min-h-0 overflow-y-auto px-9 pb-14 pt-7">
            <WorkColumn detail={detail} />
          </div>
          <aside
            aria-label="활동 타임라인"
            className="min-h-0 overflow-y-auto border-t border-border bg-[#fbfbfa] px-7 pb-14 pt-7 xl:border-l xl:border-t-0"
          >
            <Timeline detail={detail} />
          </aside>
        </div>
      )}
    </div>
  );
}

// ── 가운데: 지금 챙길 것 → 업무 · 고객 · 거래 ───────────────────

interface AttentionItem {
  key: string;
  tone: 'late' | 'soon';
  label: string;
  text: string;
  when: string;
}

/** 기한이 지났거나 오늘·내일인 업무, 연락할 때가 된 고객, 미정산 거래 */
function buildAttention(detail: EmployeeDetail): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const task of detail.assignedTasks) {
    if (!task.dueDate || ['completed', 'cancelled'].includes(task.status)) continue;
    const days = daysUntil(task.dueDate);
    // 지났거나 오늘·내일인 것만. 그보다 먼 기한은 아래 업무 목록에서 본다.
    if (days > 1) continue;
    items.push({
      key: `task-${task.id}`,
      tone: days < 0 ? 'late' : 'soon',
      label: '업무',
      text: task.title,
      when: dueLabel(days),
    });
  }
  for (const requirement of detail.assignedBuyerRequirements) {
    if (!requirement.nextContactDate || requirement.status !== 'active') continue;
    const days = daysUntil(requirement.nextContactDate);
    if (days > 0) continue;
    items.push({
      key: `buyer-${requirement.id}`,
      tone: days < 0 ? 'late' : 'soon',
      label: '고객 연락',
      text: requirement.contact?.name ?? '고객',
      when: dueLabel(days),
    });
  }
  const unsettled = detail.dealParticipants.filter(
    (participant) => participant.settlementStatus !== 'settled',
  );
  if (unsettled.length > 0) {
    const total = unsettled.reduce((sum, participant) => sum + (participant.commissionAmount ?? 0), 0);
    items.push({
      key: 'unsettled',
      tone: 'soon',
      label: '정산',
      text: `미정산 거래 ${unsettled.length}건`,
      when: total > 0 ? formatMoney(total) : '',
    });
  }

  // 늦은 것부터
  return items.sort((a, b) => Number(b.tone === 'late') - Number(a.tone === 'late'));
}

function WorkColumn({ detail }: { detail: EmployeeDetail }) {
  const attention = useMemo(() => buildAttention(detail), [detail]);
  const tasks = useMemo(
    () =>
      [...detail.assignedTasks].sort(
        (a, b) =>
          new Date(a.dueDate ?? '9999-12-31').getTime() - new Date(b.dueDate ?? '9999-12-31').getTime(),
      ),
    [detail.assignedTasks],
  );

  return (
    <div className="max-w-[760px] space-y-9">
      <section aria-labelledby="attention-title">
        <h2 id="attention-title" className="text-[13px] font-semibold text-foreground">
          지금 챙길 것
          {attention.length > 0 ? (
            <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
              {attention.length}
            </span>
          ) : null}
        </h2>
        {attention.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            기한이 지났거나 곧 닥치는 일이 없습니다.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-1">
            {attention.map((item) => (
              <li
                key={item.key}
                className={cn(
                  'flex min-h-9 items-center gap-3 rounded-[6px] border-l-2 py-1.5 pl-3 pr-3 text-[13px]',
                  item.tone === 'late'
                    ? 'border-destructive bg-destructive-soft/35'
                    : 'border-warning bg-warning-soft/40',
                )}
              >
                <span className="w-[58px] shrink-0 text-[12px] text-muted-foreground">{item.label}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{item.text}</span>
                <span
                  className={cn(
                    'shrink-0 text-[12.5px] font-medium tabular-nums',
                    item.tone === 'late' ? 'text-destructive' : 'text-warning-strong',
                  )}
                >
                  {item.when}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Section title="담당 업무" count={tasks.length} more={{ to: '/tasks', label: '업무' }}>
        {tasks.length === 0 ? (
          <Empty>담당 업무가 없습니다.</Empty>
        ) : (
          tasks.map((task) => {
            const done = ['completed', 'cancelled'].includes(task.status);
            const days = task.dueDate ? daysUntil(task.dueDate) : null;
            return (
              <Row key={task.id}>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    done ? 'text-muted-foreground line-through' : 'text-foreground',
                  )}
                >
                  {task.title}
                </span>
                <span className="shrink-0 text-[12.5px] text-muted-foreground">
                  {getStatusMeta('taskStatus', task.status).label}
                  {' · '}
                  {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
                </span>
                <Due days={done ? null : days} emptyText={task.dueDate ? '' : '기한 없음'} />
              </Row>
            );
          })
        )}
      </Section>

      <Section
        title="담당 고객"
        count={detail.assignedBuyerRequirements.length}
        more={{ to: '/customers-table', label: '고객 원장' }}
      >
        {detail.assignedBuyerRequirements.length === 0 ? (
          <Empty>담당 고객이 없습니다.</Empty>
        ) : (
          detail.assignedBuyerRequirements.map((requirement) => (
            <Row key={requirement.id}>
              <Link
                to="/buyer-requirements/$id"
                params={{ id: requirement.id }}
                className="min-w-0 flex-1 truncate text-foreground underline-offset-2 outline-none hover:underline focus-visible:underline"
              >
                {requirement.contact?.name ?? '고객'}
              </Link>
              <span className="shrink-0 text-[12.5px] text-muted-foreground">
                {BUYER_STATUS_LABELS[requirement.status] ?? requirement.status}
              </span>
              <Due
                days={
                  requirement.nextContactDate && requirement.status === 'active'
                    ? daysUntil(requirement.nextContactDate)
                    : null
                }
                prefix="연락 "
                emptyText="연락일 미정"
              />
            </Row>
          ))
        )}
      </Section>

      <Section
        title="거래 참여와 정산"
        count={detail.dealParticipants.length}
        more={{ to: '/cashflow/employee-settlements', label: '정산 현황' }}
      >
        {detail.dealParticipants.length === 0 ? (
          <Empty>참여 중인 거래가 없습니다.</Empty>
        ) : (
          detail.dealParticipants.map((participant) => (
            <Row key={participant.id}>
              <Link
                to="/deals"
                search={{ dealId: participant.deal.id }}
                className="min-w-0 flex-1 truncate text-foreground underline-offset-2 outline-none hover:underline focus-visible:underline"
              >
                {participant.deal.listing?.property?.site?.name ??
                  participant.deal.property?.site?.name ??
                  '거래'}
              </Link>
              <span className="shrink-0 text-[12.5px] text-muted-foreground">
                {PARTICIPANT_ROLE_LABELS[participant.role] ?? participant.role}
              </span>
              <span
                className={cn(
                  'w-[60px] shrink-0 text-right text-[12.5px]',
                  participant.settlementStatus === 'settled'
                    ? 'text-muted-foreground'
                    : 'font-medium text-warning-strong',
                )}
              >
                {participant.settlementStatus === 'settled' ? '정산완료' : '미정산'}
              </span>
              <span className="w-[76px] shrink-0 text-right font-medium tabular-nums text-foreground">
                {participant.commissionAmount ? formatMoney(participant.commissionAmount) : '—'}
              </span>
            </Row>
          ))
        )}
      </Section>
    </div>
  );
}

// ── 오른쪽: 상담과 활동 기록을 한 줄기로 ────────────────────────

interface TimelineEntry {
  key: string;
  at: string;
  kind: 'consultation' | 'activity';
  title: string;
  body?: string;
  meta?: string;
}

function buildTimeline(detail: EmployeeDetail): Array<{ day: string; entries: TimelineEntry[] }> {
  const entries: TimelineEntry[] = [
    ...detail.recentConsultations.map<TimelineEntry>((consultation) => ({
      key: `c-${consultation.id}`,
      at: consultation.createdAt,
      kind: 'consultation',
      title: `${consultation.contact?.name ?? '고객'} ${
        CONSULTATION_TYPE_LABELS[consultation.type] ?? consultation.type
      } 상담`,
      body: consultation.content.replace(/\s+/g, ' ').trim(),
    })),
    ...detail.recentActivities.map<TimelineEntry>((activity) => ({
      key: `a-${activity.id}`,
      at: activity.createdAt,
      kind: 'activity',
      title: describeActivity(activity),
      body: activity.reason ?? undefined,
      // 앱에서 직접 한 일은 굳이 적지 않는다. AI 연결·시스템이 한 일만 밝힌다.
      meta: activity.source === 'web' ? undefined : describeActivitySource(activity.source),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const days: Array<{ day: string; entries: TimelineEntry[] }> = [];
  for (const entry of entries) {
    const day = dayHeading(entry.at);
    const last = days.at(-1);
    if (last && last.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
}

function Timeline({ detail }: { detail: EmployeeDetail }) {
  const days = useMemo(() => buildTimeline(detail), [detail]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-foreground">최근 활동</h2>
        <Link
          to="/consultations"
          className="inline-flex items-center gap-0.5 text-[12px] text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
        >
          상담분석
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
      </div>

      {days.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">기록된 상담과 활동이 없습니다.</p>
      ) : (
        <ol className="mt-4 space-y-6">
          {days.map(({ day, entries }) => (
            <li key={day}>
              <p className="text-[12px] font-medium text-muted-foreground">{day}</p>
              {/* 세로선 하나에 점을 찍는다. 상담은 찬 점, 그 밖의 기록은 빈 점. */}
              <ol className="relative mt-2.5 space-y-3.5 before:absolute before:bottom-1 before:left-[3.5px] before:top-1.5 before:w-px before:bg-[rgba(42,28,0,0.12)]">
                {entries.map((entry) => (
                  <li key={entry.key} className="relative pl-5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-0 top-[6px] size-2 rounded-full',
                        entry.kind === 'consultation'
                          ? 'bg-foreground/75'
                          : 'bg-[#fbfbfa] shadow-[inset_0_0_0_1.5px_rgba(55,53,47,0.35)]',
                      )}
                    />
                    <p className="flex items-baseline gap-2 text-[13px] leading-5">
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {entry.title}
                      </span>
                      {entry.meta ? (
                        <span className="shrink-0 text-[11.5px] text-muted-foreground">{entry.meta}</span>
                      ) : null}
                      <time
                        dateTime={entry.at}
                        className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground"
                      >
                        {clockTime(entry.at)}
                      </time>
                    </p>
                    {entry.body ? (
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-[1.55] text-muted-foreground">
                        {entry.body}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── 작은 부품 ───────────────────────────────────────────────────

function Dot() {
  return (
    <span aria-hidden="true" className="text-[#c9c7c1]">
      ·
    </span>
  );
}

/** 큰 숫자 하나와 그 이름. 0이면 흐리게 해서 있는 숫자만 눈에 들어오게 한다. */
function Figure({
  label,
  value,
  text,
  unit,
  tone,
  quiet = false,
}: {
  label: string;
  /** 숫자. 아직 못 받았으면 null */
  value?: number | null;
  /** 숫자 대신 그대로 적을 글 (금액처럼 이미 단위가 붙은 값) */
  text?: string | null;
  unit?: string;
  tone?: 'warning';
  /** 누적 값처럼 한 걸음 뒤에 두는 숫자 */
  quiet?: boolean;
}) {
  const missing = text === undefined ? value == null : text == null;
  const isZero = text === undefined && value === 0;

  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 flex items-baseline gap-0.5 font-semibold tabular-nums tracking-[-0.02em]',
          quiet ? 'text-[17px]' : 'text-[22px]',
          missing || isZero
            ? 'text-muted-foreground/55'
            : tone === 'warning'
              ? 'text-warning-strong'
              : 'text-foreground',
        )}
      >
        {missing ? '—' : (text ?? value)}
        {!missing && unit ? (
          <span className="text-[12.5px] font-normal tracking-normal text-muted-foreground">{unit}</span>
        ) : null}
      </dd>
    </div>
  );
}

/** 기한을 "3일 지남 · 오늘 · D-5"로. 지난 것은 빨갛게, 사흘 안은 주황으로. */
function Due({
  days,
  prefix = '',
  emptyText,
}: {
  days: number | null;
  prefix?: string;
  emptyText: string;
}) {
  return (
    <span
      className={cn(
        'w-[92px] shrink-0 text-right text-[12.5px] tabular-nums',
        days === null
          ? 'text-muted-foreground/70'
          : days < 0
            ? 'font-medium text-destructive'
            : days <= 3
              ? 'font-medium text-warning-strong'
              : 'text-muted-foreground',
      )}
    >
      {days === null ? emptyText : `${prefix}${dueLabel(days)}`}
    </span>
  );
}

function Section({
  title,
  count,
  more,
  children,
}: {
  title: string;
  count: number;
  /** 이 내용을 다루는 화면으로 가는 길 */
  more?: {
    to: '/tasks' | '/customers-table' | '/cashflow/employee-settlements';
    label: string;
  };
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        {count > 0 ? (
          <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>
        ) : null}
        {more ? (
          <Link
            to={more.to}
            className="ml-auto inline-flex items-center gap-0.5 text-[12px] text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
          >
            {more.label}
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <div className="divide-y divide-border/70 border-y border-border/70">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[38px] items-center gap-3 py-2 text-[13px] leading-5">{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-[12.5px] text-muted-foreground">{children}</p>;
}
