import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  CirclePlus,
  ClipboardList,
  Info,
  KeyRound,
  Mail,
  Phone,
  RotateCw,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@estate-erp/api-client';
import type {
  CreateEmployeeDto,
  Employee,
  EmployeeDetail,
} from '@estate-erp/api-client';
import { USER_LICENSE_TYPE_LABELS } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPhone,
} from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { getStatusMeta } from '@/lib/status-config';
import { ConfirmDialog, FilterSearch, FilterSelect } from '@/components/domain';
import { Avatar, AvatarBadge, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const roleMeta: Record<string, { label: string; className: string }> = {
  owner: {
    label: '대표',
    className: 'border-transparent bg-violet-soft text-violet',
  },
  manager: {
    label: '매니저',
    className: 'border-transparent bg-info-soft text-info',
  },
  agent: {
    label: '중개사',
    className: 'border-transparent bg-success-soft text-success',
  },
};

const LICENSE_TYPE_LABELS: Record<string, string> = USER_LICENSE_TYPE_LABELS;
const NONE_VALUE = '__none__';

const payTypeLabels: Record<string, string> = {
  fixed: '고정급',
  mixed: '고정급+수수료',
  commission_only: '수수료제',
};

const participantRoleLabels: Record<string, string> = {
  listing_agent: '매도측 담당',
  buying_agent: '매수측 담당',
  dual_agent: '단독중개',
  manager: '관리자',
  assistant: '보조',
  closer: '마감 담당',
};

const participantSideLabels: Record<string, string> = {
  seller: '매도측',
  buyer: '매수측',
  both: '양측',
};

const settlementLabels: Record<string, string> = {
  settled: '정산완료',
  unsettled: '미정산',
};

const taskPriorityLabels: Record<string, string> = {
  urgent: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
};

const buyerStatusLabels: Record<string, string> = {
  active: '활성',
  matched: '활성',
  hold: '보류',
  inactive: '보류',
  completed: '완료',
};

interface DetailFormState {
  name: string;
  phone: string;
  email: string;
  licenseType: string;
  licenseNo: string;
  payType: string;
  baseSalary: string;
  commissionRate: string;
}

interface CreateFormState {
  name: string;
  loginId: string;
  phone: string;
  email: string;
  role: string;
  password: string;
  licenseType: string;
  licenseNo: string;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  name: '',
  loginId: '',
  phone: '',
  email: '',
  role: 'agent',
  password: '',
  licenseType: '',
  licenseNo: '',
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return '요청 처리에 실패했습니다.';
}

function toDetailForm(employee: EmployeeDetail): DetailFormState {
  return {
    name: employee.name ?? '',
    phone: employee.phone ?? '',
    email: employee.email ?? '',
    licenseType: employee.licenseType ?? '',
    licenseNo: employee.licenseNo ?? '',
    payType: employee.payType ?? 'mixed',
    baseSalary: employee.baseSalary != null ? String(employee.baseSalary) : '',
    commissionRate:
      employee.commissionRate != null ? String(employee.commissionRate) : '',
  };
}

export const Route = createFileRoute('/_authenticated/employees/')({
  component: EmployeesPage,
});

function EmployeesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === 'owner' || user?.role === 'manager';
  // PRD 3절: agent는 본인 정보만 조회 (다른 직원 목록·실적·배분 금액 비노출)
  const isSelfOnly = !canManage;

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [workloadFilter, setWorkloadFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [detailForm, setDetailForm] = useState<DetailFormState>({
    name: '',
    phone: '',
    email: '',
    licenseType: '',
    licenseNo: '',
    payType: 'mixed',
    baseSalary: '',
    commissionRate: '',
  });
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const rosterRef = useRef<HTMLDivElement>(null);

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

  const { data: performance, isLoading: isPerformanceLoading } = useQuery({
    queryKey: ['employee-performance', selectedEmployeeId],
    queryFn: () => api.employees.getPerformance(selectedEmployeeId as string),
    enabled: !!selectedEmployeeId,
  });

  const visibleEmployees = useMemo(
    () =>
      isSelfOnly
        ? employees.filter((employee) => employee.id === user?.id)
        : employees,
    [employees, isSelfOnly, user?.id],
  );

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = visibleEmployees.filter((employee) => {
      if (roleFilter && employee.role !== roleFilter) return false;
      if (statusFilter === 'active' && !employee.isActive) return false;
      if (statusFilter === 'inactive' && employee.isActive) return false;
      if (
        workloadFilter === 'hasTasks' &&
        employee.counts.activeTaskCount === 0
      ) {
        return false;
      }
      if (
        workloadFilter === 'hasDeals' &&
        employee.counts.activeDealCount === 0
      ) {
        return false;
      }
      if (
        workloadFilter === 'hasUnsettled' &&
        employee.counts.unsettledDealCount === 0
      ) {
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
    return [...filtered].sort(
      (a, b) => Number(b.isActive) - Number(a.isActive),
    );
  }, [visibleEmployees, roleFilter, search, statusFilter, workloadFilter]);

  const {
    data: employeeDetail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['employee', selectedEmployeeId],
    queryFn: () => api.employees.findOne(selectedEmployeeId as string),
    enabled: !!selectedEmployeeId,
  });

  useEffect(() => {
    if (!employeeDetail) return;

    setDetailForm(toDetailForm(employeeDetail));
  }, [employeeDetail]);

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

      // agent(본인 정보만)는 검색 UI가 숨겨져 있으므로 포커스 제외
      if (event.key === '/' && !isTyping && canManage) {
        event.preventDefault();
        searchWrapRef.current?.querySelector('input')?.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canManage]);

  const closeEmployeeWorkspace = useCallback(() => {
    if (employeeDetail) setDetailForm(toDetailForm(employeeDetail));
    setResetPassword('');
    const employeeId = selectedEmployeeId;
    setSelectedEmployeeId(null);
    window.setTimeout(() => {
      const employeeRows = Array.from(
        rosterRef.current?.querySelectorAll<HTMLElement>(
          '[data-employee-row]',
        ) ?? [],
      );
      const target =
        employeeRows.find(
          (employeeRow) => employeeRow.dataset.employeeId === employeeId,
        ) ?? employeeRows[0];
      target?.focus();
    }, 0);
  }, [employeeDetail, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployeeId) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        isCreateOpen ||
        isStatusConfirmOpen ||
        pendingRole !== null
      ) {
        return;
      }

      event.preventDefault();
      closeEmployeeWorkspace();
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [
    closeEmployeeWorkspace,
    isCreateOpen,
    isStatusConfirmOpen,
    pendingRole,
    selectedEmployeeId,
  ]);

  const invalidateEmployee = () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    queryClient.invalidateQueries({
      queryKey: ['employee', selectedEmployeeId],
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateEmployeeDto) => api.employees.create(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      setSelectedEmployeeId(created.id);
      setIsCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      toast.success(`${created.name}님 계정이 생성되었습니다.`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.employees.update(selectedEmployeeId as string, {
        name: detailForm.name.trim(),
        phone: emptyToNull(detailForm.phone),
        email: emptyToNull(detailForm.email),
        licenseType: detailForm.licenseType || null,
        licenseNo: emptyToNull(detailForm.licenseNo),
        payType: detailForm.payType,
        baseSalary:
          detailForm.baseSalary.trim() === ''
            ? null
            : Number(detailForm.baseSalary),
        commissionRate:
          detailForm.commissionRate.trim() === ''
            ? null
            : Number(detailForm.commissionRate),
      }),
    onSuccess: () => {
      invalidateEmployee();
      toast.success('직원 정보가 저장되었습니다.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const roleMutation = useMutation({
    mutationFn: (role: string) =>
      api.employees.updateRole(selectedEmployeeId as string, role),
    onSuccess: (_, role) => {
      invalidateEmployee();
      setPendingRole(null);
      toast.success(
        `역할이 '${roleMeta[role]?.label ?? role}'(으)로 변경되었습니다.`,
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      api.employees.updateStatus(selectedEmployeeId as string, isActive),
    onSuccess: (_, isActive) => {
      invalidateEmployee();
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      setIsStatusConfirmOpen(false);
      toast.success(
        isActive ? '계정이 재활성화되었습니다.' : '계정이 비활성화되었습니다.',
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const passwordMutation = useMutation({
    mutationFn: (nextPassword: string) =>
      api.employees.resetPassword(selectedEmployeeId as string, nextPassword),
    onSuccess: (result) => {
      setResetPassword('');
      toast.success(
        result.message ?? '비밀번호가 재설정되었습니다. 직원에게 전달하세요.',
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const handleSave = () => {
    if (!detailForm.name.trim()) {
      toast.error('이름을 입력하세요.');
      return;
    }
    if (detailForm.baseSalary.trim() !== '') {
      const baseSalary = Number(detailForm.baseSalary);
      if (!Number.isInteger(baseSalary) || baseSalary < 0) {
        toast.error('기본급은 0 이상의 정수(만원)로 입력하세요.');
        return;
      }
    }
    if (detailForm.commissionRate.trim() !== '') {
      const rate = Number(detailForm.commissionRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        toast.error('수수료 배분율은 0~100 사이로 입력하세요.');
        return;
      }
    }
    updateMutation.mutate();
  };

  const handleCreate = () => {
    createMutation.mutate({
      name: createForm.name.trim(),
      loginId: createForm.loginId.trim(),
      phone: createForm.phone.trim() || undefined,
      email: createForm.email.trim() || undefined,
      role: createForm.role,
      password: createForm.password,
      licenseType: createForm.licenseType || null,
      licenseNo: createForm.licenseNo.trim() || null,
    });
  };

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateForm(EMPTY_CREATE_FORM);
  };

  // 생성: manager는 agent만, owner는 agent/manager. 역할 변경: owner는 owner 승계까지 가능.
  const createRoleOptions =
    user?.role === 'owner' ? ['agent', 'manager'] : ['agent'];
  const detailRoleOptions =
    user?.role === 'owner' ? ['agent', 'manager', 'owner'] : ['agent'];

  const activeUserCount =
    officeProfile?.counts.activeUsers ??
    employees.filter((employee) => employee.isActive).length;
  const maxUsers = officeProfile?.maxUsers ?? null;
  const isSlotFull = maxUsers != null && activeUserCount >= maxUsers;

  const statusWarnings = useMemo(() => {
    if (!employeeDetail || !employeeDetail.isActive) return [];
    const warnings: string[] = [];
    if (employeeDetail.role === 'owner') {
      warnings.push(
        '대표(owner) 계정입니다. 사무소의 마지막 대표 계정은 비활성화할 수 없습니다.',
      );
    }
    const { activeTaskCount, activeDealCount } = employeeDetail.counts;
    if (activeTaskCount > 0 || activeDealCount > 0) {
      warnings.push(
        `진행 중 업무 ${activeTaskCount}건 · 거래 ${activeDealCount}건이 있습니다. 비활성화 전에 다른 직원에게 인계하세요.`,
      );
    }
    return warnings;
  }, [employeeDetail]);

  const activeFilterCount = [roleFilter, statusFilter, workloadFilter].filter(
    Boolean,
  ).length;
  const slotUsage =
    maxUsers && maxUsers > 0
      ? Math.min(100, Math.round((activeUserCount / maxUsers) * 100))
      : null;
  const activeFilteredEmployees = filteredEmployees.filter(
    (employee) => employee.isActive,
  );
  const inactiveFilteredEmployees = filteredEmployees.filter(
    (employee) => !employee.isActive,
  );
  const teamTotals = visibleEmployees.reduce(
    (totals, employee) => ({
      tasks: totals.tasks + employee.counts.activeTaskCount,
      customers: totals.customers + employee.counts.activeBuyerRequirementCount,
      deals: totals.deals + employee.counts.activeDealCount,
      unsettled: totals.unsettled + employee.counts.unsettledDealCount,
    }),
    { tasks: 0, customers: 0, deals: 0, unsettled: 0 },
  );

  return (
    <div
      data-employees-page
      className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f6f3]"
    >
      {!selectedEmployeeId ? (
        <header
          data-employee-header
          className="flex min-h-[80px] shrink-0 items-center gap-5 border-b border-border bg-white px-6 py-4"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-[20px] font-semibold tracking-[-0.02em]">
                {isSelfOnly ? '내 직원 정보' : '직원 관리'}
              </h1>
              <span className="rounded bg-[#ecebe8] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {visibleEmployees.length}
              </span>
            </div>
            <p className="mt-1 truncate text-[12px] text-muted-foreground">
              {isSelfOnly
                ? '내 계정과 업무 현황을 확인합니다.'
                : '팀의 계정, 자격, 담당 업무와 정산 상태를 한곳에서 관리합니다.'}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            <div className="hidden min-w-[154px] 2xl:block">
              <div className="flex items-center justify-between gap-3 text-[10.5px] text-muted-foreground">
                <span>활성 계정</span>
                <strong className="font-semibold tabular-nums text-foreground">
                  {maxUsers != null
                    ? `${activeUserCount} / ${maxUsers}`
                    : `${activeUserCount}명`}
                </strong>
              </div>
              {slotUsage != null ? (
                <div
                  className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#e9e8e4]"
                  role="progressbar"
                  aria-label="직원 계정 슬롯 사용량"
                  aria-valuemin={0}
                  aria-valuemax={maxUsers ?? undefined}
                  aria-valuenow={activeUserCount}
                >
                  <div
                    className={cn(
                      'h-full rounded-full',
                      slotUsage >= 90 ? 'bg-warning' : 'bg-foreground/65',
                    )}
                    style={{ width: `${slotUsage}%` }}
                  />
                </div>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 px-2.5 text-xs"
            >
              <Link to="/cashflow/employee-settlements">
                <CircleDollarSign className="size-3.5" aria-hidden="true" />
                정산 현황
              </Link>
            </Button>
            {canManage ? (
              <Button
                size="sm"
                className="h-8 px-3 active:scale-[0.97]"
                onClick={() => setIsCreateOpen(true)}
              >
                <CirclePlus className="size-3.5" aria-hidden="true" />
                직원 추가
              </Button>
            ) : null}
          </div>
        </header>
      ) : null}

      {!selectedEmployeeId && isSelfOnly ? (
        <Alert className="shrink-0 rounded-none border-x-0 border-t-0 bg-[#faf9f6] px-4 py-2.5">
          <Info className="size-3.5" />
          <AlertDescription className="text-xs">
            본인 정보만 조회할 수 있습니다. 다른 직원 정보나 계정 관리는 대표
            또는 매니저에게 문의하세요.
          </AlertDescription>
        </Alert>
      ) : null}

      {!selectedEmployeeId && canManage ? (
        <section
          data-employee-toolbar
          className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-white px-6 py-3"
          aria-label="직원 명부 필터"
        >
          <div
            ref={searchWrapRef}
            className="min-w-[260px] max-w-[480px] flex-1"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && filteredEmployees.length > 0) {
                setSelectedEmployeeId(filteredEmployees[0].id);
              }
            }}
          >
            <FilterSearch
              value={search}
              onChange={setSearch}
              placeholder="이름, 로그인 ID, 연락처 검색 ( / )"
              className="w-full"
            />
          </div>

          <div
            className="flex h-8 items-center rounded-md border border-border bg-white p-0.5"
            role="group"
            aria-label="계정 상태"
          >
            {[
              { value: '', label: '전체' },
              { value: 'active', label: '활성' },
              { value: 'inactive', label: '비활성' },
            ].map((option) => (
              <button
                key={option.value || 'all'}
                type="button"
                aria-pressed={statusFilter === option.value}
                onClick={() => setStatusFilter(option.value)}
                className={cn(
                  'h-6 rounded-[4px] px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
                  statusFilter === option.value
                    ? 'bg-[#ecebe8] text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <FilterSelect
            label="역할"
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: 'owner', label: '대표' },
              { value: 'manager', label: '매니저' },
              { value: 'agent', label: '중개사' },
            ]}
          />
          <FilterSelect
            label="담당"
            value={workloadFilter}
            onChange={setWorkloadFilter}
            options={[
              { value: 'hasTasks', label: '진행 업무 있음' },
              { value: 'hasDeals', label: '진행 거래 있음' },
              { value: 'hasUnsettled', label: '미정산 있음' },
            ]}
          />

          {activeFilterCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[11px] text-muted-foreground"
              onClick={() => {
                setRoleFilter('');
                setStatusFilter('');
                setWorkloadFilter('');
              }}
            >
              <X className="size-3.5" aria-hidden="true" />
              필터 {activeFilterCount}개 해제
            </Button>
          ) : null}

          <span
            className="ml-auto pr-1 text-[10.5px] tabular-nums text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {filteredEmployees.length}명 표시
          </span>
        </section>
      ) : null}

      <section className="relative min-h-0 flex-1 overflow-hidden">
        {selectedEmployeeId ? (
          isDetailLoading ? (
            <div
              data-employee-workspace-loading
              className="flex h-full min-h-0 flex-col bg-[#f7f6f3]"
            >
              <div className="border-b border-border bg-white px-6 py-4">
                <Skeleton className="mb-5 h-8 w-24 rounded-md" />
                <div className="flex items-center gap-4">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-8 w-28 rounded-md" />
                </div>
              </div>
              <div className="mx-auto grid w-full max-w-[1180px] flex-1 gap-5 p-6 min-[1180px]:grid-cols-[minmax(0,1fr)_320px]">
                <Skeleton className="min-h-80 rounded-lg" />
                <Skeleton className="min-h-64 rounded-lg" />
              </div>
            </div>
          ) : isDetailError ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#f7f6f3] px-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-white">
                <AlertTriangle
                  className="size-5 text-warning-strong"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 className="text-sm font-semibold">
                  직원 정보를 불러오지 못했습니다
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  목록으로 돌아가거나 다시 불러와 주세요.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeEmployeeWorkspace}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  직원 목록
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchDetail()}
                >
                  <RotateCw className="size-4" aria-hidden="true" />
                  다시 시도
                </Button>
              </div>
            </div>
          ) : (
            <EmployeeWorkspace
              employee={employeeDetail}
              performance={performance}
              isPerformanceLoading={isPerformanceLoading}
              detailForm={detailForm}
              onDetailChange={setDetailForm}
              canManage={canManage}
              actorRole={user?.role ?? 'agent'}
              roleOptions={detailRoleOptions}
              onBack={closeEmployeeWorkspace}
              onSave={handleSave}
              onRoleSelect={(role) => setPendingRole(role)}
              onStatusToggle={() => setIsStatusConfirmOpen(true)}
              resetPassword={resetPassword}
              onResetPasswordChange={setResetPassword}
              onResetPassword={() => passwordMutation.mutate(resetPassword)}
              isSaving={
                updateMutation.isPending ||
                roleMutation.isPending ||
                statusMutation.isPending ||
                passwordMutation.isPending
              }
            />
          )
        ) : (
          <ScrollArea data-team-overview className="h-full">
            <div className="mx-auto grid w-full max-w-[1200px] items-start gap-5 px-6 py-6 min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
              <section
                ref={rosterRef}
                data-employee-roster
                className="min-w-0 overflow-hidden rounded-lg border border-border bg-white"
                aria-labelledby="employee-roster-title"
              >
                <div className="flex min-h-14 items-center justify-between gap-4 border-b border-border px-5 py-3.5">
                  <div>
                    <h2
                      id="employee-roster-title"
                      className="text-[14px] font-semibold"
                    >
                      팀 멤버
                    </h2>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      직원을 선택하면 계정과 담당 현황을 관리할 수 있습니다.
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    활성 {activeFilteredEmployees.length}명
                  </span>
                </div>

                {isLoading ? (
                  <div className="divide-y divide-border/70">
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        className="flex h-[84px] items-center gap-4 px-5"
                      >
                        <Skeleton className="size-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-8 w-40 rounded-md" />
                      </div>
                    ))}
                  </div>
                ) : isError ? (
                  <RosterMessage
                    icon={AlertTriangle}
                    title="직원 목록을 불러오지 못했습니다"
                    description="잠시 후 다시 시도해 주세요."
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                      >
                        <RotateCw className="size-4" aria-hidden="true" />
                        다시 시도
                      </Button>
                    }
                  />
                ) : filteredEmployees.length === 0 ? (
                  <RosterMessage
                    icon={Users}
                    title={
                      visibleEmployees.length === 0
                        ? '아직 등록된 직원이 없습니다'
                        : '조건에 맞는 직원이 없습니다'
                    }
                    description={
                      visibleEmployees.length === 0
                        ? '첫 직원을 추가해 계정과 업무를 함께 관리하세요.'
                        : '검색어나 필터를 바꾸면 다른 직원을 찾을 수 있습니다.'
                    }
                    action={
                      visibleEmployees.length === 0 && canManage ? (
                        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                          <CirclePlus className="size-4" aria-hidden="true" />
                          직원 추가
                        </Button>
                      ) : activeFilterCount > 0 || search ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearch('');
                            setRoleFilter('');
                            setStatusFilter('');
                            setWorkloadFilter('');
                          }}
                        >
                          검색과 필터 초기화
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div>
                    {activeFilteredEmployees.length > 0 ? (
                      <EmployeeGroup
                        label="활성 직원"
                        employees={activeFilteredEmployees}
                        onSelect={(employee) =>
                          setSelectedEmployeeId(employee.id)
                        }
                      />
                    ) : null}
                    {inactiveFilteredEmployees.length > 0 ? (
                      <EmployeeGroup
                        label="비활성 직원"
                        employees={inactiveFilteredEmployees}
                        onSelect={(employee) =>
                          setSelectedEmployeeId(employee.id)
                        }
                      />
                    ) : null}
                  </div>
                )}
              </section>

              <TeamOperationsSummary
                employees={visibleEmployees}
                activeUserCount={activeUserCount}
                maxUsers={maxUsers}
                slotUsage={slotUsage}
                totals={teamTotals}
              />
            </div>
          </ScrollArea>
        )}
      </section>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (open) setIsCreateOpen(true);
          else closeCreateDialog();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>새 직원 추가</DialogTitle>
            <DialogDescription>
              직원이 사용할 로그인 ID와 초기 비밀번호를 입력합니다.
              {maxUsers != null
                ? ` 직원 슬롯 ${activeUserCount}/${maxUsers} 사용 중입니다.`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {isSlotFull ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                최대 사용자 수({maxUsers}명)에 도달했습니다. 직원을
                비활성화하거나 플랜을 업그레이드한 후 추가하세요.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="이름 *"
              value={createForm.name}
              autoComplete="name"
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, name: value }))
              }
            />
            <Field
              label="로그인 ID *"
              value={createForm.loginId}
              autoComplete="username"
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, loginId: value }))
              }
            />
            <Field
              label="휴대폰"
              value={createForm.phone}
              type="tel"
              autoComplete="tel"
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, phone: value }))
              }
            />
            <Field
              label="이메일"
              value={createForm.email}
              type="email"
              autoComplete="email"
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, email: value }))
              }
            />
            <div className="space-y-2">
              <Label>역할</Label>
              <Select
                value={createForm.role}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({ ...prev, role: value }))
                }
              >
                <SelectTrigger className="w-full" aria-label="새 직원 역할">
                  <SelectValue placeholder="역할 선택" />
                </SelectTrigger>
                <SelectContent>
                  {createRoleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleMeta[role]?.label ?? role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              label="초기 비밀번호 *"
              value={createForm.password}
              type="password"
              autoComplete="new-password"
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, password: value }))
              }
            />
            <div className="space-y-2">
              <Label>자격 구분</Label>
              <Select
                value={createForm.licenseType || NONE_VALUE}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    licenseType: value === NONE_VALUE ? '' : value,
                  }))
                }
              >
                <SelectTrigger
                  className="w-full"
                  aria-label="새 직원 자격 구분"
                >
                  <SelectValue placeholder="자격 구분" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>미지정</SelectItem>
                  {Object.entries(LICENSE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createForm.licenseType === 'assistant' ? (
                <p className="text-xs text-warning">
                  중개보조원은 계약서에 서명할 수 없습니다.
                </p>
              ) : null}
            </div>
            <Field
              label="자격증/등록 번호"
              value={createForm.licenseNo}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, licenseNo: value }))
              }
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeCreateDialog}
              disabled={createMutation.isPending}
            >
              닫기
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                createMutation.isPending ||
                isSlotFull ||
                !createForm.name.trim() ||
                !createForm.loginId.trim() ||
                !createForm.password.trim()
              }
            >
              생성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingRole !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRole(null);
        }}
        title="역할 변경"
        description={
          pendingRole && employeeDetail
            ? `${employeeDetail.name}님의 역할을 '${roleMeta[pendingRole]?.label ?? pendingRole}'(으)로 변경합니다. 접근 권한이 즉시 변경됩니다.${
                pendingRole === 'owner'
                  ? ' 대표 권한을 부여하면 사무소 핵심 설정까지 변경할 수 있습니다.'
                  : ''
              }`
            : undefined
        }
        confirmLabel="변경"
        loading={roleMutation.isPending}
        onConfirm={() => {
          if (pendingRole) roleMutation.mutate(pendingRole);
        }}
      />

      <ConfirmDialog
        open={isStatusConfirmOpen}
        onOpenChange={setIsStatusConfirmOpen}
        title={employeeDetail?.isActive ? '계정 비활성화' : '계정 재활성화'}
        destructive={employeeDetail?.isActive}
        description={
          employeeDetail?.isActive ? (
            <span className="space-y-1.5">
              <span className="block">
                {employeeDetail.name}님 계정을 비활성화하면 더 이상 로그인할 수
                없습니다.
              </span>
              {statusWarnings.map((warning) => (
                <span key={warning} className="block text-destructive">
                  {warning}
                </span>
              ))}
            </span>
          ) : employeeDetail ? (
            `${employeeDetail.name}님 계정을 재활성화하면 즉시 로그인과 업무 배정이 가능해집니다.`
          ) : undefined
        }
        confirmLabel={employeeDetail?.isActive ? '비활성화' : '재활성화'}
        loading={statusMutation.isPending}
        onConfirm={() => {
          if (employeeDetail) statusMutation.mutate(!employeeDetail.isActive);
        }}
      />
    </div>
  );
}

function EmployeeGroup({
  label,
  employees,
  onSelect,
}: {
  label: string;
  employees: Employee[];
  onSelect: (employee: Employee) => void;
}) {
  return (
    <section data-employee-group aria-label={label}>
      <div className="flex h-8 items-center justify-between border-b border-border/70 bg-[#faf9f6] px-5">
        <h3 className="text-[10.5px] font-semibold text-muted-foreground">
          {label}
        </h3>
        <span className="text-[10.5px] tabular-nums text-muted-foreground">
          {employees.length}명
        </span>
      </div>
      <div className="divide-y divide-border/70">
        {employees.map((employee) => (
          <button
            key={employee.id}
            type="button"
            data-employee-row
            data-employee-id={employee.id}
            className="group flex min-h-[88px] w-full items-center gap-4 px-5 py-3 text-left transition-colors duration-150 hover:bg-[#faf9f6] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 motion-reduce:transition-none"
            onClick={() => onSelect(employee)}
            aria-label={`${employee.name} 직원 상세 열기`}
          >
            <Avatar className="size-10 shrink-0 border border-border bg-[#f5f4f1]">
              <AvatarFallback className="bg-[#f5f4f1] text-[13px] font-semibold text-slate-600">
                {employee.name.charAt(0)}
              </AvatarFallback>
              <AvatarBadge
                className={cn(
                  'size-2.5 ring-2 ring-white',
                  employee.isActive ? 'bg-emerald-500' : 'bg-slate-300',
                )}
              />
            </Avatar>

            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="truncate text-[13.5px] font-semibold text-foreground">
                  {employee.name}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'h-5 rounded px-1.5 text-[10px] font-medium',
                    roleMeta[employee.role]?.className,
                  )}
                >
                  {roleMeta[employee.role]?.label ?? employee.role}
                </Badge>
                {employee.counts.unsettledDealCount > 0 ? (
                  <span className="inline-flex h-5 items-center rounded bg-warning-soft px-1.5 text-[10px] font-semibold tabular-nums text-warning-strong">
                    미정산 {employee.counts.unsettledDealCount}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block truncate text-[11.5px] text-muted-foreground">
                {employee.loginId}
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                {employee.licenseType
                  ? (LICENSE_TYPE_LABELS[employee.licenseType] ??
                    employee.licenseType)
                  : '자격 미지정'}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {employee.phone
                  ? formatPhone(employee.phone)
                  : employee.email || '연락처 미등록'}
              </span>
            </span>

            <span className="hidden w-[174px] shrink-0 grid-cols-3 gap-2 md:grid">
              <RosterMetric
                label="업무"
                value={employee.counts.activeTaskCount}
              />
              <RosterMetric
                label="고객"
                value={employee.counts.activeBuyerRequirementCount}
              />
              <RosterMetric
                label="거래"
                value={employee.counts.activeDealCount}
              />
            </span>

            <span className="hidden w-16 shrink-0 text-right min-[1380px]:block">
              <span className="block text-[10.5px] text-muted-foreground">
                최근 활동
              </span>
              <span className="mt-1 block text-[11px] text-foreground">
                {employee.latestActivityAt
                  ? timeAgo(employee.latestActivityAt)
                  : '기록 없음'}
              </span>
            </span>

            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground/55 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function RosterMetric({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-center">
      <span className="block text-[10.5px] text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-[13px] font-semibold tabular-nums text-foreground">
        {value}
      </strong>
    </span>
  );
}

function RosterMessage({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-[#faf9f6]">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-[13px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[11.5px] leading-5 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function TeamOperationsSummary({
  employees,
  activeUserCount,
  maxUsers,
  slotUsage,
  totals,
}: {
  employees: Employee[];
  activeUserCount: number;
  maxUsers: number | null;
  slotUsage: number | null;
  totals: {
    tasks: number;
    customers: number;
    deals: number;
    unsettled: number;
  };
}) {
  const inactiveCount = employees.filter(
    (employee) => !employee.isActive,
  ).length;

  return (
    <aside
      data-team-operations
      className="overflow-hidden rounded-lg border border-border bg-white"
      aria-label="팀 운영 요약"
    >
      <section className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold">운영 요약</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              계정과 현재 담당량을 확인합니다.
            </p>
          </div>
          <Users
            className="mt-0.5 size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <span className="text-[11.5px] text-muted-foreground">
              활성 계정
            </span>
            <strong className="text-[14px] font-semibold tabular-nums">
              {maxUsers != null
                ? `${activeUserCount} / ${maxUsers}`
                : `${activeUserCount}명`}
            </strong>
          </div>
          {slotUsage != null ? (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9e8e4]"
              role="progressbar"
              aria-label="직원 계정 슬롯 사용량"
              aria-valuemin={0}
              aria-valuemax={maxUsers ?? undefined}
              aria-valuenow={activeUserCount}
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  slotUsage >= 90 ? 'bg-warning' : 'bg-foreground/70',
                )}
                style={{ width: `${slotUsage}%` }}
              />
            </div>
          ) : null}
          <p className="mt-2 text-[10.5px] text-muted-foreground">
            비활성 계정 {inactiveCount}명
          </p>
        </div>
      </section>

      <section className="border-t border-border px-5 py-4">
        <h3 className="text-[12px] font-semibold">현재 업무</h3>
        <dl className="mt-2 divide-y divide-border/70">
          <OperationRow label="진행 업무" value={`${totals.tasks}건`} />
          <OperationRow label="담당 고객" value={`${totals.customers}명`} />
          <OperationRow label="진행 거래" value={`${totals.deals}건`} />
        </dl>
      </section>

      <Link
        to="/cashflow/employee-settlements"
        className="group flex min-h-14 items-center gap-3 border-t border-border px-5 py-3.5 outline-none transition-colors duration-150 hover:bg-[#faf9f6] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 motion-reduce:transition-none"
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md',
            totals.unsettled > 0
              ? 'bg-warning-soft text-warning-strong'
              : 'bg-[#f1f1ef] text-muted-foreground',
          )}
        >
          <CircleDollarSign className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold">직원 정산</span>
          <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
            미정산 참여 {totals.unsettled}건
          </span>
        </span>
        <ChevronRight
          className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </Link>

      <section className="border-t border-border bg-[#faf9f6] px-5 py-4">
        <div className="flex gap-3">
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <h3 className="text-[11.5px] font-semibold">권한 안내</h3>
            <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">
              대표는 전체 설정, 매니저는 직원 운영, 중개사는 본인 정보만 관리할
              수 있습니다.
            </p>
          </div>
        </div>
      </section>
    </aside>
  );
}

function OperationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="text-[12px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function EmployeeWorkspace({
  employee,
  performance,
  isPerformanceLoading,
  detailForm,
  onDetailChange,
  canManage,
  actorRole,
  roleOptions,
  onBack,
  onSave,
  onRoleSelect,
  onStatusToggle,
  resetPassword,
  onResetPasswordChange,
  onResetPassword,
  isSaving,
}: {
  employee?: EmployeeDetail;
  performance?: {
    activeTaskCount: number;
    activeBuyerRequirementCount: number;
    activeDealCount: number;
    unsettledDealCount: number;
    consultationCount: number;
    commissionAmountTotal: number;
  };
  isPerformanceLoading: boolean;
  detailForm: DetailFormState;
  onDetailChange: Dispatch<SetStateAction<DetailFormState>>;
  canManage: boolean;
  actorRole: string;
  roleOptions: string[];
  onBack: () => void;
  onSave: () => void;
  onRoleSelect: (role: string) => void;
  onStatusToggle: () => void;
  resetPassword: string;
  onResetPasswordChange: (value: string) => void;
  onResetPassword: () => void;
  isSaving: boolean;
}) {
  const navigate = useNavigate();

  if (!employee) {
    return (
      <main
        data-employee-workspace
        className="flex min-h-0 min-w-0 items-center justify-center bg-[#f7f6f3] text-[12px] text-muted-foreground"
      >
        직원을 선택하면 상세 정보가 표시됩니다.
      </main>
    );
  }

  const roleSelectDisabled =
    !canManage || (actorRole === 'manager' && employee.role !== 'agent');
  const selectableRoles = roleOptions.includes(employee.role)
    ? roleOptions
    : [...roleOptions, employee.role];
  const latestActivityAt = employee.recentActivities[0]?.createdAt ?? null;

  return (
    <main
      data-employee-workspace
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#f7f6f3]"
    >
      <header className="shrink-0 border-b border-border bg-white">
        <div className="mx-auto w-full max-w-[1180px] px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            직원 목록
          </Button>

          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-4">
            <Avatar className="size-12 shrink-0 border border-border bg-[#f5f4f1]">
              <AvatarFallback className="bg-[#f5f4f1] text-[16px] font-semibold text-slate-600">
                {employee.name.charAt(0)}
              </AvatarFallback>
              <AvatarBadge
                className={cn(
                  'ring-2 ring-white',
                  employee.isActive ? 'bg-emerald-500' : 'bg-slate-300',
                )}
              />
            </Avatar>
            <div className="min-w-[220px] flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-[20px] font-semibold tracking-[-0.02em]">
                  {employee.name}
                </h2>
                <Badge
                  variant="outline"
                  className={cn(
                    'h-5 rounded px-1.5 text-[10px] font-medium',
                    roleMeta[employee.role]?.className,
                  )}
                >
                  {roleMeta[employee.role]?.label ?? employee.role}
                </Badge>
                <ActiveBadge isActive={employee.isActive} />
              </div>
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted-foreground">
                <span>{employee.loginId}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {employee.licenseType
                    ? (LICENSE_TYPE_LABELS[employee.licenseType] ??
                      employee.licenseType)
                    : '자격 미지정'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  최근 활동{' '}
                  {latestActivityAt ? timeAgo(latestActivityAt) : '없음'}
                </span>
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {employee.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" aria-hidden="true" />
                    {formatPhone(employee.phone)}
                  </span>
                ) : null}
                {employee.email ? (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Mail className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{employee.email}</span>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-[11.5px]"
                disabled={!canManage || isSaving}
                onClick={onStatusToggle}
              >
                {employee.isActive ? '계정 비활성화' : '계정 재활성화'}
              </Button>
              <Button
                size="sm"
                className="h-8 min-w-20 px-3 active:scale-[0.97]"
                disabled={!canManage || isSaving}
                onClick={onSave}
              >
                {isSaving ? '저장 중' : '변경 저장'}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-[#faf9f6] sm:grid-cols-4 sm:divide-x sm:divide-border">
            <DetailStat
              icon={ClipboardList}
              label="진행 업무"
              value={employee.counts.activeTaskCount + '건'}
            />
            <DetailStat
              icon={Users}
              label="담당 고객"
              value={employee.counts.activeBuyerRequirementCount + '건'}
            />
            <DetailStat
              icon={BriefcaseBusiness}
              label="진행 거래"
              value={employee.counts.activeDealCount + '건'}
            />
            <DetailStat
              icon={CircleDollarSign}
              label="미정산 참여"
              value={employee.counts.unsettledDealCount + '건'}
            />
          </div>
        </div>
      </header>

      <Tabs
        defaultValue="profile"
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <div className="shrink-0 border-b border-border bg-white">
          <TabsList
            variant="line"
            className="mx-auto h-11 w-full max-w-[1180px] justify-start gap-1 rounded-none px-6"
            aria-label="직원 상세 구역"
          >
            <TabsTrigger value="profile" className="flex-none px-3 text-[12px]">
              계정 정보
            </TabsTrigger>
            <TabsTrigger value="work" className="flex-none px-3 text-[12px]">
              업무 현황
              <span className="rounded bg-muted px-1 text-[9.5px] tabular-nums text-muted-foreground">
                {employee.counts.activeTaskCount +
                  employee.counts.activeDealCount}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="flex-none px-3 text-[12px]"
            >
              활동 기록
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="profile"
          className="min-h-0 data-[state=active]:flex data-[state=active]:flex-1 data-[state=active]:flex-col"
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-[1180px] px-6 pb-16 pt-6">
              {employee.licenseType === 'assistant' ? (
                <Alert className="mb-5 border-amber-200 bg-amber-50/70">
                  <Info className="size-3.5 text-amber-700" />
                  <AlertDescription className="text-[11.5px] text-amber-900">
                    중개보조원 계정은 계약서에 서명할 수 없습니다.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="rounded-lg border border-border bg-white px-6">
                <DocumentSection
                  title="기본 정보"
                  description={
                    employee.role === 'owner'
                      ? '대표 계정과 중개 자격 정보를 관리합니다.'
                      : '직원의 계정과 중개 자격 정보를 관리합니다.'
                  }
                >
                  <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                    <Field
                      label="이름 *"
                      value={detailForm.name}
                      autoComplete="name"
                      onChange={(value) =>
                        onDetailChange((prev) => ({ ...prev, name: value }))
                      }
                      disabled={!canManage}
                    />
                    <StaticField label="로그인 ID" value={employee.loginId} />
                    <Field
                      label="휴대폰"
                      value={detailForm.phone}
                      type="tel"
                      autoComplete="tel"
                      onChange={(value) =>
                        onDetailChange((prev) => ({ ...prev, phone: value }))
                      }
                      disabled={!canManage}
                    />
                    <Field
                      label="이메일"
                      value={detailForm.email}
                      type="email"
                      autoComplete="email"
                      onChange={(value) =>
                        onDetailChange((prev) => ({ ...prev, email: value }))
                      }
                      disabled={!canManage}
                    />
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        자격 구분
                      </Label>
                      <Select
                        value={detailForm.licenseType || NONE_VALUE}
                        onValueChange={(value) =>
                          onDetailChange((prev) => ({
                            ...prev,
                            licenseType: value === NONE_VALUE ? '' : value,
                          }))
                        }
                        disabled={!canManage}
                      >
                        <SelectTrigger
                          className="h-8 w-full text-[12px]"
                          aria-label="자격 구분"
                        >
                          <SelectValue placeholder="자격 구분" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>미지정</SelectItem>
                          {Object.entries(LICENSE_TYPE_LABELS).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <Field
                      label="자격증/등록 번호"
                      value={detailForm.licenseNo}
                      onChange={(value) =>
                        onDetailChange((prev) => ({
                          ...prev,
                          licenseNo: value,
                        }))
                      }
                      disabled={!canManage}
                    />
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        역할
                      </Label>
                      <Select
                        value={employee.role}
                        onValueChange={(value) => {
                          if (value !== employee.role) onRoleSelect(value);
                        }}
                        disabled={roleSelectDisabled}
                      >
                        <SelectTrigger
                          className="h-8 w-full text-[12px]"
                          aria-label="직원 역할"
                        >
                          <SelectValue placeholder="역할 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectableRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {roleMeta[role]?.label ?? role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <StaticField
                      label="계정 생성일"
                      value={formatDate(employee.createdAt)}
                    />
                  </div>
                </DocumentSection>

                {employee.role !== 'owner' ? (
                  <DocumentSection
                    title="급여와 배분"
                    description="개인 배분율을 비우면 사무소 기본 정책이 적용됩니다."
                  >
                    <div className="grid gap-5 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          급여 유형
                        </Label>
                        <Select
                          value={detailForm.payType}
                          onValueChange={(value) =>
                            onDetailChange((prev) => ({
                              ...prev,
                              payType: value,
                            }))
                          }
                          disabled={!canManage}
                        >
                          <SelectTrigger
                            className="h-8 w-full text-[12px]"
                            aria-label="급여 유형"
                          >
                            <SelectValue placeholder="급여 유형" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(payTypeLabels).map(
                              ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          월 기본급 (만원)
                        </Label>
                        <Input
                          className="h-8 text-[12px]"
                          aria-label="월 기본급 만원"
                          type="number"
                          min={0}
                          value={detailForm.baseSalary}
                          onChange={(event) =>
                            onDetailChange((prev) => ({
                              ...prev,
                              baseSalary: event.target.value,
                            }))
                          }
                          placeholder={
                            detailForm.payType === 'commission_only'
                              ? '수수료제'
                              : '예: 250'
                          }
                          disabled={
                            !canManage ||
                            detailForm.payType === 'commission_only'
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          개인 배분율 (%)
                        </Label>
                        <Input
                          className="h-8 text-[12px]"
                          aria-label="개인 수수료 배분율"
                          type="number"
                          min={0}
                          max={100}
                          value={detailForm.commissionRate}
                          onChange={(event) =>
                            onDetailChange((prev) => ({
                              ...prev,
                              commissionRate: event.target.value,
                            }))
                          }
                          placeholder={
                            detailForm.payType === 'fixed'
                              ? '고정급'
                              : '비우면 사무소 기본'
                          }
                          disabled={
                            !canManage || detailForm.payType === 'fixed'
                          }
                        />
                      </div>
                    </div>
                  </DocumentSection>
                ) : null}

                <DocumentSection
                  title="계정 보안"
                  description={
                    employee.role === 'owner'
                      ? '대표 계정의 비밀번호를 새로 발급합니다.'
                      : '직원이 잊어버린 비밀번호를 새로 발급합니다.'
                  }
                >
                  <div className="flex max-w-xl items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        새 비밀번호
                      </Label>
                      <Input
                        className="h-8 text-[12px]"
                        aria-label="새 비밀번호"
                        type="password"
                        value={resetPassword}
                        onChange={(event) =>
                          onResetPasswordChange(event.target.value)
                        }
                        placeholder="새 비밀번호 입력"
                        disabled={!canManage}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2.5 text-xs"
                      onClick={onResetPassword}
                      disabled={!canManage || !resetPassword.trim() || isSaving}
                    >
                      <KeyRound className="size-3.5" />
                      재설정
                    </Button>
                  </div>
                </DocumentSection>

                <DocumentSection
                  title="사무소 배분 기준"
                  description="직원 개인 배분율이 없을 때 적용하는 사무소 공통 기준입니다."
                  last
                >
                  <div className="grid overflow-hidden rounded-md border border-border md:grid-cols-2">
                    <SummaryRow
                      label="기본 직원 배분"
                      value={
                        getCommissionNumber(
                          employee.office.commissionConfig,
                          'defaultAgentRate',
                          50,
                        ) + '%'
                      }
                    />
                    <SummaryRow
                      label="매도측 담당"
                      value={
                        getCommissionNumber(
                          employee.office.commissionConfig,
                          'listingAgentRate',
                          50,
                        ) + '%'
                      }
                    />
                    <SummaryRow
                      label="매수측 담당"
                      value={
                        getCommissionNumber(
                          employee.office.commissionConfig,
                          'buyingAgentRate',
                          50,
                        ) + '%'
                      }
                    />
                    <SummaryRow
                      label="단독중개"
                      value={
                        getCommissionNumber(
                          employee.office.commissionConfig,
                          'dualAgentRate',
                          70,
                        ) + '%'
                      }
                    />
                    <SummaryRow
                      label="관리자 배분"
                      value={
                        getCommissionNumber(
                          employee.office.commissionConfig,
                          'managerRate',
                          10,
                        ) + '%'
                      }
                    />
                    <SummaryRow
                      label="마감 보너스"
                      value={
                        getCommissionNumber(
                          employee.office.commissionConfig,
                          'closerBonus',
                          0,
                        ) + '만원'
                      }
                    />
                  </div>
                </DocumentSection>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="work"
          className="min-h-0 data-[state=active]:flex data-[state=active]:flex-1 data-[state=active]:flex-col"
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-[1180px] space-y-6 px-6 py-6 pb-16">
              <section className="rounded-lg border border-border bg-white p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[13px] font-semibold">누적 실적</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      상담과 거래 참여 기준으로 집계됩니다.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="h-7 px-2 text-[11px]"
                  >
                    <Link to="/cashflow/employee-settlements">
                      정산 현황
                      <ChevronRight className="size-3" />
                    </Link>
                  </Button>
                </div>
                <div className="grid overflow-hidden rounded-md border border-border bg-[#faf9f6] md:grid-cols-2 md:divide-x md:divide-border">
                  {isPerformanceLoading ? (
                    <>
                      <Skeleton className="m-4 h-11 rounded" />
                      <Skeleton className="m-4 h-11 rounded" />
                    </>
                  ) : performance ? (
                    <>
                      <InlineMetric
                        label="누적 상담"
                        value={performance.consultationCount + '건'}
                      />
                      <InlineMetric
                        label="참여 수수료 합계"
                        value={formatMoney(performance.commissionAmountTotal)}
                      />
                    </>
                  ) : (
                    <p className="col-span-2 px-4 py-6 text-center text-[12px] text-muted-foreground">
                      실적 정보를 불러오지 못했습니다.
                    </p>
                  )}
                </div>
              </section>

              <div className="grid items-start gap-6 min-[1180px]:grid-cols-2">
                <ListSection
                  title="담당 업무"
                  icon={ClipboardList}
                  items={employee.assignedTasks.map((task) => ({
                    id: task.id,
                    title: task.title,
                    description:
                      getStatusMeta('taskStatus', task.status).label +
                      ' · ' +
                      (taskPriorityLabels[task.priority] ?? task.priority) +
                      (task.dueDate ? ' · ' + formatDate(task.dueDate) : ''),
                    onNavigate: () => navigate({ to: '/tasks' }),
                  }))}
                  emptyMessage="담당 업무가 없습니다."
                />

                <ListSection
                  title="담당 고객"
                  icon={Users}
                  items={employee.assignedBuyerRequirements.map(
                    (requirement) => ({
                      id: requirement.id,
                      title: requirement.contact?.name ?? '고객',
                      description:
                        (buyerStatusLabels[requirement.status] ??
                          requirement.status) +
                        (requirement.nextContactDate
                          ? ' · 다음 연락 ' +
                            formatDate(requirement.nextContactDate)
                          : ''),
                      onNavigate: () =>
                        navigate({
                          to: '/buyer-requirements/$id',
                          params: { id: requirement.id },
                        }),
                    }),
                  )}
                  emptyMessage="담당 고객이 없습니다."
                />
              </div>

              <ListSection
                title="거래 참여와 배분"
                icon={BriefcaseBusiness}
                items={employee.dealParticipants.map((participant) => ({
                  id: participant.id,
                  title:
                    participant.deal.listing?.property?.site?.name ??
                    participant.deal.property?.site?.name ??
                    '거래',
                  description:
                    (participantRoleLabels[participant.role] ??
                      participant.role) +
                    ' · ' +
                    (participantSideLabels[participant.side] ??
                      participant.side) +
                    ' · ' +
                    (settlementLabels[participant.settlementStatus] ??
                      participant.settlementStatus) +
                    (participant.commissionAmount
                      ? ' · ' + formatMoney(participant.commissionAmount)
                      : ''),
                  onNavigate: () => navigate({ to: '/deals' }),
                }))}
                emptyMessage="참여 중인 거래가 없습니다."
              />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="activity"
          className="min-h-0 data-[state=active]:flex data-[state=active]:flex-1 data-[state=active]:flex-col"
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto grid w-full max-w-[1180px] items-start gap-6 px-6 py-6 pb-16 min-[1180px]:grid-cols-2">
              <ListSection
                title="최근 상담"
                icon={CalendarClock}
                items={employee.recentConsultations.map((consultation) => ({
                  id: consultation.id,
                  title: consultation.contact?.name ?? consultation.type,
                  description:
                    consultation.type +
                    ' · ' +
                    formatDateTime(consultation.createdAt) +
                    ' · ' +
                    consultation.content,
                  onNavigate: () => navigate({ to: '/consultations' }),
                }))}
                emptyMessage="최근 상담이 없습니다."
              />

              <ListSection
                title="최근 활동"
                icon={Activity}
                items={employee.recentActivities.map((activity) => ({
                  id: activity.id,
                  title: activity.entityType + ' ' + activity.action,
                  description:
                    activity.source +
                    ' · ' +
                    formatDateTime(activity.createdAt) +
                    (activity.reason ? ' · ' + activity.reason : ''),
                }))}
                emptyMessage="최근 활동 로그가 없습니다."
              />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </main>
  );
}
function ListSection({
  title,
  icon: Icon,
  items,
  emptyMessage,
}: {
  title: string;
  icon?: LucideIcon;
  items: Array<{
    id: string;
    title: string;
    description: string;
    onNavigate?: () => void;
  }>;
  emptyMessage: string;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2.5 flex items-center gap-2">
        {Icon ? (
          <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        ) : null}
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-white">
        {items.length === 0 ? (
          <p className="px-4 py-9 text-center text-[11.5px] text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          items.map((item) =>
            item.onNavigate ? (
              <button
                key={item.id}
                type="button"
                onClick={item.onNavigate}
                className="group flex w-full items-center gap-3 border-b border-border/70 px-3.5 py-3 text-left last:border-b-0 hover:bg-[#faf9f6]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground motion-reduce:transition-none" />
              </button>
            ) : (
              <div
                key={item.id}
                className="border-b border-border/70 px-3.5 py-3 last:border-b-0"
              >
                <p className="truncate text-[12px] font-medium">{item.title}</p>
                <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ),
          )
        )}
      </div>
    </section>
  );
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className="size-3" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-0.5 truncate text-[12px] font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <strong className="text-[14px] font-semibold tabular-nums">
        {value}
      </strong>
    </div>
  );
}

function DocumentSection({
  title,
  description,
  last,
  children,
}: {
  title: string;
  description?: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'space-y-4 border-b border-border/70 py-6',
        last && 'border-b-0',
      )}
    >
      <div>
        <h3 className="text-[12.5px] font-semibold tracking-[-0.005em]">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 rounded border-transparent px-1.5 text-[10px] font-medium',
        isActive
          ? 'bg-success-soft text-success'
          : 'bg-destructive-soft text-destructive',
      )}
    >
      {isActive ? '활성' : '비활성'}
    </Badge>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = 'text',
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  const inputId = useId();

  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={inputId}
        className="text-[11px] font-medium text-muted-foreground"
      >
        {label}
      </Label>
      <Input
        id={inputId}
        className="h-8 text-[12px]"
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="flex h-8 items-center rounded-md border border-border/70 bg-[#faf9f6] px-3 text-[12px] text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3.5 py-2.5 md:odd:border-r md:[&:nth-last-child(-n+2)]:border-b-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getCommissionNumber(config: unknown, key: string, fallback: number) {
  if (typeof config !== 'object' || config === null) return fallback;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
