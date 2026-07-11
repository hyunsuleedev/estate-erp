import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleDollarSign,
  Info,
  LayoutGrid,
  Plus,
  RotateCw,
  Search,
  Table2,
  Users,
  X,
} from 'lucide-react';
import type { Employee } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/time-ago';
import { EmptyState } from '@/components/domain';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ALL_VALUE,
  LICENSE_TYPE_LABELS,
  PersonAvatar,
  RoleLabel,
  StatusLabel,
  payTypeLabels,
  roleMeta,
} from './-employee-shared';
import { EmployeePeek } from './-employee-peek';
import { EmployeeCreateDialog } from './-employee-create-dialog';

type ViewMode = 'table' | 'board';

export const Route = createFileRoute('/_authenticated/employees/')({
  validateSearch: (search: Record<string, unknown>): { emp?: string } => ({
    emp: typeof search.emp === 'string' && search.emp ? search.emp : undefined,
  }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const { user } = useAuth();
  const navigate = Route.useNavigate();
  const { emp: peekId } = Route.useSearch();

  const canManage = user?.role === 'owner' || user?.role === 'manager';
  // PRD 3절: agent는 본인 정보만 조회 (다른 직원 목록·실적·배분 금액 비노출)
  const isSelfOnly = !canManage;

  const [view, setView] = useState<ViewMode>('table');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [workloadFilter, setWorkloadFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const openPeek = (id: string) =>
    navigate({ search: (prev) => ({ ...prev, emp: id }) });
  const closePeek = () => navigate({ search: (prev) => ({ ...prev, emp: undefined }) });

  const {
    data: employees = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });

  const { data: officeProfile } = useQuery({
    queryKey: ['office-profile'],
    queryFn: () => api.offices.getMe(),
  });

  const visibleEmployees = useMemo(
    () => (isSelfOnly ? employees.filter((employee) => employee.id === user?.id) : employees),
    [employees, isSelfOnly, user?.id],
  );

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = visibleEmployees.filter((employee) => {
      if (roleFilter && employee.role !== roleFilter) return false;
      if (statusFilter === 'active' && !employee.isActive) return false;
      if (statusFilter === 'inactive' && employee.isActive) return false;
      if (workloadFilter === 'hasTasks' && employee.counts.activeTaskCount === 0) return false;
      if (workloadFilter === 'hasDeals' && employee.counts.activeDealCount === 0) return false;
      if (workloadFilter === 'hasUnsettled' && employee.counts.unsettledDealCount === 0) {
        return false;
      }
      if (!query) return true;
      return [employee.name, employee.loginId, employee.email, employee.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    // 활성 직원 우선, 그 안에서는 서버 정렬(역할 → 이름) 유지
    return [...filtered].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  }, [visibleEmployees, roleFilter, search, statusFilter, workloadFilter]);

  // 키보드 단축키: '/' 검색 포커스, Cmd/Ctrl+N 직원 추가
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        if (canManage) {
          event.preventDefault();
          setIsCreateOpen(true);
        }
        return;
      }
      if (event.key === '/' && !isTyping && canManage) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canManage]);

  const activeUserCount =
    officeProfile?.counts.activeUsers ??
    employees.filter((employee) => employee.isActive).length;
  const maxUsers = officeProfile?.maxUsers ?? null;

  const summary = useMemo(() => {
    const active = visibleEmployees.filter((employee) => employee.isActive).length;
    const managers = visibleEmployees.filter((employee) => employee.role === 'manager').length;
    const dealing = visibleEmployees.filter(
      (employee) => employee.counts.activeDealCount > 0,
    ).length;
    const parts = [
      `전체 ${visibleEmployees.length}`,
      `활성 ${active}`,
      `매니저 ${managers}`,
      `거래 담당 ${dealing}`,
    ];
    if (maxUsers != null) parts.push(`슬롯 ${activeUserCount}/${maxUsers}`);
    return parts;
  }, [visibleEmployees, maxUsers, activeUserCount]);

  const hasFilter = Boolean(roleFilter || statusFilter || workloadFilter || search.trim());
  const clearFilters = () => {
    setRoleFilter('');
    setStatusFilter('');
    setWorkloadFilter('');
    setSearch('');
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col pt-8">
      {/* 페이지 헤더 — Notion 문서 타이틀 */}
      <div className="px-1">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-neutral-soft">
            <Users className="size-5 text-muted-foreground" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            {isSelfOnly ? '내 정보' : '직원관리'}
          </h1>
        </div>
        {isSelfOnly ? null : (
          <p className="mt-2 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            {summary.map((part, index) => (
              <span key={part} className="inline-flex items-center gap-1">
                {index > 0 ? <span className="text-border">·</span> : null}
                {part}
              </span>
            ))}
          </p>
        )}
      </div>

      {isSelfOnly ? (
        <Alert className="mt-5">
          <Info className="size-4" />
          <AlertDescription>
            일반 중개사 계정은 본인 정보만 조회할 수 있습니다. 다른 직원 정보나 계정 관리는
            대표 또는 매니저에게 문의하세요.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* 툴바 — 뷰 전환 + 필터 + 액션 */}
      <div className="sticky top-0 z-10 mt-5 flex flex-wrap items-center gap-1 border-b bg-background/95 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center">
          <ViewTab
            icon={Table2}
            label="표"
            active={view === 'table'}
            onClick={() => setView('table')}
          />
          <ViewTab
            icon={LayoutGrid}
            label="보드"
            active={view === 'board'}
            onClick={() => setView('board')}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {isSelfOnly ? null : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && filteredEmployees.length > 0) {
                      openPeek(filteredEmployees[0].id);
                    }
                  }}
                  placeholder="검색"
                  className="h-7 w-40 border-transparent bg-transparent pl-7 pr-7 text-sm shadow-none transition-[width] hover:bg-muted/70 focus-visible:w-56 focus-visible:bg-background md:w-48"
                />
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  /
                </kbd>
              </div>
              <GhostFilter
                placeholder="역할"
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: 'owner', label: '대표' },
                  { value: 'manager', label: '매니저' },
                  { value: 'agent', label: '중개사' },
                ]}
              />
              <GhostFilter
                placeholder="상태"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'active', label: '활성' },
                  { value: 'inactive', label: '비활성' },
                ]}
              />
              <GhostFilter
                placeholder="담당"
                value={workloadFilter}
                onChange={setWorkloadFilter}
                options={[
                  { value: 'hasTasks', label: '진행 업무 있음' },
                  { value: 'hasDeals', label: '진행 거래 있음' },
                  { value: 'hasUnsettled', label: '미정산 있음' },
                ]}
              />
              {hasFilter ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  onClick={clearFilters}
                >
                  <X className="size-3" />
                  초기화
                </Button>
              ) : null}
              <span className="mx-1 h-4 w-px bg-border" />
            </>
          )}
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link to="/cashflow/employee-settlements">
              <CircleDollarSign className="size-3.5" />
              정산 현황
            </Link>
          </Button>
          {canManage ? (
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-3.5" />새 직원
            </Button>
          ) : null}
        </div>
      </div>

      {/* 본문 */}
      {isLoading ? (
        <div className="mt-1 divide-y divide-border/60">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 py-3">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="hidden h-4 w-24 md:block" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-24">
          <p className="text-sm text-muted-foreground">직원 목록을 불러오지 못했습니다.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RotateCw className="size-4" />
            다시 시도
          </Button>
        </div>
      ) : visibleEmployees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="등록된 직원이 없습니다"
          description="직원 계정을 만들어 업무와 거래를 배분하세요."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="size-4" />새 직원
              </Button>
            ) : undefined
          }
          className="py-24"
        />
      ) : filteredEmployees.length === 0 ? (
        <div className="py-24 text-center text-sm text-muted-foreground">
          조건에 맞는 직원이 없습니다.
          <Button variant="ghost" size="sm" className="ml-2" onClick={clearFilters}>
            필터 초기화
          </Button>
        </div>
      ) : view === 'table' ? (
        <EmployeeTable employees={filteredEmployees} onOpen={openPeek} />
      ) : (
        <EmployeeBoard employees={filteredEmployees} onOpen={openPeek} />
      )}

      <EmployeePeek
        employeeId={peekId ?? null}
        open={!!peekId}
        onClose={closePeek}
        canManage={canManage}
        actorRole={user?.role ?? 'agent'}
      />

      <EmployeeCreateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        actorRole={user?.role ?? 'agent'}
        activeUserCount={activeUserCount}
        maxUsers={maxUsers}
        onCreated={openPeek}
      />
    </div>
  );
}

/* ---------- 표 뷰 — Notion 데이터베이스 테이블 ---------- */

function EmployeeTable({
  employees,
  onOpen,
}: {
  employees: Employee[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-normal text-muted-foreground">
            <th className="w-[30%] min-w-52 py-2 pl-1 pr-3 font-normal">이름</th>
            <th className="py-2 pr-3 font-normal">역할</th>
            <th className="py-2 pr-3 font-normal">상태</th>
            <th className="hidden py-2 pr-3 font-normal lg:table-cell">자격</th>
            <th className="hidden py-2 pr-3 font-normal xl:table-cell">급여</th>
            <th className="py-2 pr-3 text-right font-normal">업무</th>
            <th className="py-2 pr-3 text-right font-normal">거래</th>
            <th className="py-2 pr-3 text-right font-normal">미정산</th>
            <th className="hidden py-2 pr-1 text-right font-normal md:table-cell">
              최근 활동
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr
              key={employee.id}
              onClick={() => onOpen(employee.id)}
              className={cn(
                'group cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50',
                !employee.isActive && 'opacity-55',
              )}
            >
              <td className="py-2 pl-1 pr-3">
                <div className="flex items-center gap-2.5">
                  <PersonAvatar name={employee.name} muted={!employee.isActive} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{employee.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {employee.loginId}
                    </span>
                  </span>
                  <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-xs">
                      열기
                    </span>
                  </span>
                </div>
              </td>
              <td className="whitespace-nowrap py-2 pr-3">
                <RoleLabel role={employee.role} />
              </td>
              <td className="whitespace-nowrap py-2 pr-3">
                <StatusLabel isActive={employee.isActive} />
              </td>
              <td className="hidden whitespace-nowrap py-2 pr-3 text-muted-foreground lg:table-cell">
                {employee.licenseType
                  ? (LICENSE_TYPE_LABELS[employee.licenseType] ?? employee.licenseType)
                  : '—'}
              </td>
              <td className="hidden whitespace-nowrap py-2 pr-3 text-muted-foreground xl:table-cell">
                {payTypeLabels[employee.payType] ?? employee.payType}
              </td>
              <CountCell value={employee.counts.activeTaskCount} />
              <CountCell value={employee.counts.activeDealCount} />
              <CountCell value={employee.counts.unsettledDealCount} warn />
              <td className="hidden whitespace-nowrap py-2 pr-1 text-right text-xs text-muted-foreground md:table-cell">
                {employee.latestActivityAt ? timeAgo(employee.latestActivityAt) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="py-2 pl-1 text-xs text-muted-foreground/70">{employees.length}명</p>
    </div>
  );
}

function CountCell({ value, warn }: { value: number; warn?: boolean }) {
  return (
    <td
      className={cn(
        'whitespace-nowrap py-2 pr-3 text-right tabular-nums',
        value === 0 ? 'text-muted-foreground/50' : warn ? 'font-medium text-warning' : '',
      )}
    >
      {value}
    </td>
  );
}

/* ---------- 보드 뷰 — 역할별 그룹 ---------- */

const BOARD_ORDER = ['owner', 'manager', 'agent'];

function EmployeeBoard({
  employees,
  onOpen,
}: {
  employees: Employee[];
  onOpen: (id: string) => void;
}) {
  const groups = BOARD_ORDER.map((role) => ({
    role,
    items: employees.filter((employee) => employee.role === role),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mt-4 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <div key={group.role} className="rounded-lg bg-muted/50 p-2">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <RoleLabel role={group.role} className="text-xs font-medium" />
            <span className="text-xs tabular-nums text-muted-foreground">
              {group.items.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {group.items.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => onOpen(employee.id)}
                className={cn(
                  'w-full rounded-md border border-border/60 bg-background p-3 text-left shadow-xs transition-all hover:shadow-sm',
                  !employee.isActive && 'opacity-55',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <PersonAvatar name={employee.name} muted={!employee.isActive} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {employee.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {employee.loginId}
                      {employee.licenseType
                        ? ` · ${LICENSE_TYPE_LABELS[employee.licenseType] ?? employee.licenseType}`
                        : ''}
                    </span>
                  </span>
                  <StatusLabel isActive={employee.isActive} className="text-xs" />
                </div>
                <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    업무{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {employee.counts.activeTaskCount}
                    </span>
                  </span>
                  <span>
                    거래{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {employee.counts.activeDealCount}
                    </span>
                  </span>
                  {employee.counts.unsettledDealCount > 0 ? (
                    <span className="text-warning">
                      미정산{' '}
                      <span className="font-medium tabular-nums">
                        {employee.counts.unsettledDealCount}
                      </span>
                    </span>
                  ) : null}
                  <span className="ml-auto">
                    {employee.latestActivityAt ? timeAgo(employee.latestActivityAt) : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- 툴바 부품 ---------- */

function ViewTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Table2;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md px-2 text-sm transition-colors',
        active
          ? 'bg-neutral-soft font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function GhostFilter({
  placeholder,
  value,
  onChange,
  options,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select
      value={value || ALL_VALUE}
      onValueChange={(next) => onChange(next === ALL_VALUE ? '' : next)}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          'h-7 gap-1 border-transparent bg-transparent px-2 text-sm shadow-none hover:bg-muted/70 data-[state=open]:bg-muted/70',
          value ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>
          <span className="text-muted-foreground">{placeholder}: 전체</span>
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
