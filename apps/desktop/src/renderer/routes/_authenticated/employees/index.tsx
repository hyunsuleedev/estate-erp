import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Activity,
  AlertTriangle,
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
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@estate-erp/api-client';
import type { CreateEmployeeDto, EmployeeDetail } from '@estate-erp/api-client';
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
import {
  ConfirmDialog,
  EmptyState,
  FilterSearch,
  FilterSelect,
} from '@/components/domain';
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

  useEffect(() => {
    if (!selectedEmployeeId && filteredEmployees.length > 0) {
      setSelectedEmployeeId(filteredEmployees[0].id);
    }

    if (
      selectedEmployeeId &&
      filteredEmployees.length > 0 &&
      !filteredEmployees.some((employee) => employee.id === selectedEmployeeId)
    ) {
      setSelectedEmployeeId(filteredEmployees[0].id);
    }
  }, [filteredEmployees, selectedEmployeeId]);

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

    setDetailForm({
      name: employeeDetail.name ?? '',
      phone: employeeDetail.phone ?? '',
      email: employeeDetail.email ?? '',
      licenseType: employeeDetail.licenseType ?? '',
      licenseNo: employeeDetail.licenseNo ?? '',
      payType: employeeDetail.payType ?? 'mixed',
      baseSalary:
        employeeDetail.baseSalary != null
          ? String(employeeDetail.baseSalary)
          : '',
      commissionRate:
        employeeDetail.commissionRate != null
          ? String(employeeDetail.commissionRate)
          : '',
    });
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

  return (
    <div
      data-employees-page
      className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white"
    >
      <section
        data-employee-toolbar
        className="shrink-0 border-b border-border bg-white px-3 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-2">
          {canManage ? (
            <>
              <div
                ref={searchWrapRef}
                className="min-w-[240px] max-w-[380px] flex-1"
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
                label="상태"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'active', label: '활성' },
                  { value: 'inactive', label: '비활성' },
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
            </>
          ) : (
            <div className="flex min-w-0 items-center gap-2 px-1">
              <Users
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-[13px] font-semibold">내 직원 정보</span>
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 text-[11.5px] text-muted-foreground 2xl:flex">
              <span>
                활성{' '}
                <strong className="font-semibold tabular-nums text-foreground">
                  {activeUserCount}
                </strong>
              </span>
              {maxUsers != null ? (
                <>
                  <span className="h-3.5 w-px bg-border" aria-hidden="true" />
                  <span>
                    계정 슬롯{' '}
                    <strong className="font-semibold tabular-nums text-foreground">
                      {activeUserCount}/{maxUsers}
                    </strong>
                  </span>
                </>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-8 px-2.5 text-xs"
            >
              <Link to="/cashflow/employee-settlements">
                <CircleDollarSign className="size-3.5" />
                정산 현황
              </Link>
            </Button>
            {canManage ? (
              <Button
                size="sm"
                className="h-8 px-3"
                onClick={() => setIsCreateOpen(true)}
              >
                <CirclePlus className="size-3.5" />
                직원 추가
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {isSelfOnly ? (
        <Alert className="shrink-0 rounded-none border-x-0 border-t-0 bg-[#faf9f6] px-4 py-2.5">
          <Info className="size-3.5" />
          <AlertDescription className="text-xs">
            본인 정보만 조회할 수 있습니다. 다른 직원 정보나 계정 관리는 대표
            또는 매니저에게 문의하세요.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[316px_minmax(0,1fr)] overflow-hidden bg-white 2xl:grid-cols-[336px_minmax(0,1fr)]">
        <aside
          data-employee-directory
          className="flex min-h-0 flex-col border-r border-border bg-[#fbfbfa]"
        >
          <div className="flex h-[53px] shrink-0 items-center justify-between border-b border-border bg-[#faf9f6] px-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[13px] font-semibold">
                  {isSelfOnly ? '내 정보' : '직원 디렉터리'}
                </h2>
                <span className="rounded bg-[#ecebe8] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {filteredEmployees.length}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                {isSelfOnly
                  ? '본인 계정만 표시됩니다'
                  : `활성 ${activeUserCount}명${
                      maxUsers != null
                        ? ` · 계정 슬롯 ${activeUserCount}/${maxUsers}`
                        : ''
                    }`}
              </p>
            </div>
            <Users
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="border-b border-border/70 px-4 py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-9 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                    </div>
                  </div>
                ))
              ) : isError ? (
                <div className="flex flex-col items-center gap-3 px-3 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    직원 목록을 불러오지 못했습니다.
                  </p>
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
                        <CirclePlus className="size-4" />
                        직원 추가
                      </Button>
                    ) : undefined
                  }
                  className="py-12"
                />
              ) : (
                <>
                  {filteredEmployees.map((employee) => (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => setSelectedEmployeeId(employee.id)}
                      className={cn(
                        'group relative flex w-full gap-3 border-b border-border/70 px-4 py-3.5 text-left transition-colors',
                        selectedEmployeeId === employee.id
                          ? 'bg-[#f1f0ed] before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-r before:bg-foreground/75'
                          : 'hover:bg-[#f6f5f2]',
                        !employee.isActive && 'opacity-55',
                      )}
                    >
                      <Avatar className="size-9 border border-border/70 bg-white">
                        <AvatarFallback className="bg-white text-[12px] font-semibold text-slate-600">
                          {employee.name.charAt(0)}
                        </AvatarFallback>
                        <AvatarBadge
                          className={cn(
                            employee.isActive
                              ? 'bg-emerald-500'
                              : 'bg-slate-300',
                          )}
                        />
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                            {employee.name.charAt(0)}
                            {employee.name.slice(1)}
                          </p>
                          <span className="shrink-0 text-[10.5px] font-medium text-muted-foreground">
                            {roleMeta[employee.role]?.label ?? employee.role}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                          {employee.loginId}
                          {employee.licenseType
                            ? ` · ${LICENSE_TYPE_LABELS[employee.licenseType] ?? employee.licenseType}`
                            : ''}
                        </p>
                        <p className="mt-1.5 truncate text-[10.5px] tabular-nums text-muted-foreground">
                          업무 {employee.counts.activeTaskCount} · 거래{' '}
                          {employee.counts.activeDealCount} ·{' '}
                          {employee.latestActivityAt
                            ? `활동 ${timeAgo(employee.latestActivityAt)}`
                            : '최근 활동 없음'}
                        </p>
                      </div>
                    </button>
                  ))}
                  {filteredEmployees.length === 0 ? (
                    <div className="px-3 py-12 text-center text-sm text-muted-foreground">
                      조건에 맞는 직원이 없습니다.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </ScrollArea>
        </aside>

        {selectedEmployeeId && isDetailLoading ? (
          <main className="min-w-0 space-y-4 p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="size-12 rounded-md" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-64" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-md" />
              ))}
            </div>
            <Skeleton className="h-56 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </main>
        ) : selectedEmployeeId && isDetailError ? (
          <main className="flex min-h-[540px] flex-col items-center justify-center gap-3">
            <p className="text-sm text-muted-foreground">
              직원 상세 정보를 불러오지 못했습니다.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetchDetail()}>
              <RotateCw className="size-4" />
              다시 시도
            </Button>
          </main>
        ) : (
          <EmployeeDetailCard
            employee={employeeDetail}
            performance={performance}
            isPerformanceLoading={isPerformanceLoading}
            detailForm={detailForm}
            onDetailChange={setDetailForm}
            canManage={canManage}
            actorRole={user?.role ?? 'agent'}
            roleOptions={detailRoleOptions}
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
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
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
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, name: value }))
              }
            />
            <Field
              label="로그인 ID *"
              value={createForm.loginId}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, loginId: value }))
              }
            />
            <Field
              label="휴대폰"
              value={createForm.phone}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, phone: value }))
              }
            />
            <Field
              label="이메일"
              value={createForm.email}
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
                <SelectTrigger className="w-full">
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
                <SelectTrigger className="w-full">
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
              onClick={() => setIsCreateOpen(false)}
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

function EmployeeDetailCard({
  employee,
  performance,
  isPerformanceLoading,
  detailForm,
  onDetailChange,
  canManage,
  actorRole,
  roleOptions,
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
        data-employee-detail
        className="flex min-h-0 min-w-0 items-center justify-center bg-white text-[12px] text-muted-foreground"
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
      data-employee-detail
      className="flex min-h-0 min-w-0 flex-col bg-white"
    >
      <header className="flex shrink-0 items-center justify-between gap-5 border-b border-border px-7 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar className="size-11 border border-border bg-[#f5f4f1]">
            <AvatarFallback className="bg-[#f5f4f1] text-[15px] font-semibold text-slate-600">
              {employee.name.charAt(0)}
            </AvatarFallback>
            <AvatarBadge
              className={cn(
                employee.isActive ? 'bg-emerald-500' : 'bg-slate-300',
              )}
            />
          </Avatar>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-[18px] font-semibold tracking-[-0.015em]">
                {employee.name}
              </h1>
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
              {employee.licenseType ? (
                <span className="text-[10.5px] text-muted-foreground">
                  {LICENSE_TYPE_LABELS[employee.licenseType] ??
                    employee.licenseType}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
              <span>{employee.loginId}</span>
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
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs"
            disabled={!canManage || isSaving}
            onClick={onStatusToggle}
          >
            {employee.isActive ? '비활성화' : '재활성화'}
          </Button>
          <Button
            size="sm"
            className="h-8 min-w-16 px-3"
            disabled={!canManage || isSaving}
            onClick={onSave}
          >
            저장
          </Button>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-5 divide-x divide-border border-b border-border bg-[#faf9f6]">
        <DetailStat
          icon={ClipboardList}
          label="진행 업무"
          value={employee.counts.activeTaskCount + '건'}
        />
        <DetailStat
          icon={BriefcaseBusiness}
          label="진행 거래"
          value={employee.counts.activeDealCount + '건'}
        />
        <DetailStat
          icon={Users}
          label="담당 고객"
          value={employee.counts.activeBuyerRequirementCount + '건'}
        />
        <DetailStat
          icon={CircleDollarSign}
          label="미정산 참여"
          value={employee.counts.unsettledDealCount + '건'}
        />
        <DetailStat
          icon={Activity}
          label="최근 활동"
          value={latestActivityAt ? timeAgo(latestActivityAt) : '없음'}
        />
      </div>

      <Tabs
        defaultValue="profile"
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <TabsList
          variant="line"
          className="h-10 w-full shrink-0 justify-start gap-1 rounded-none border-b border-border px-6"
        >
          <TabsTrigger value="profile" className="flex-none px-3 text-[12px]">
            프로필
          </TabsTrigger>
          <TabsTrigger value="work" className="flex-none px-3 text-[12px]">
            업무·거래
            <span className="rounded bg-muted px-1 text-[9.5px] tabular-nums text-muted-foreground">
              {employee.counts.activeTaskCount +
                employee.counts.activeDealCount}
            </span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-none px-3 text-[12px]">
            상담·활동
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="profile"
          className="min-h-0 data-[state=active]:flex data-[state=active]:flex-1 data-[state=active]:flex-col"
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-[1040px] px-8 pb-16">
              {employee.licenseType === 'assistant' ? (
                <Alert className="mt-6 border-amber-200 bg-amber-50/70">
                  <Info className="size-3.5 text-amber-700" />
                  <AlertDescription className="text-[11.5px] text-amber-900">
                    중개보조원 계정은 계약서에 서명할 수 없습니다.
                  </AlertDescription>
                </Alert>
              ) : null}

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
                    onChange={(value) =>
                      onDetailChange((prev) => ({ ...prev, name: value }))
                    }
                    disabled={!canManage}
                  />
                  <StaticField label="로그인 ID" value={employee.loginId} />
                  <Field
                    label="휴대폰"
                    value={detailForm.phone}
                    onChange={(value) =>
                      onDetailChange((prev) => ({ ...prev, phone: value }))
                    }
                    disabled={!canManage}
                  />
                  <Field
                    label="이메일"
                    value={detailForm.email}
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
                      <SelectTrigger className="h-8 w-full text-[12px]">
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
                      onDetailChange((prev) => ({ ...prev, licenseNo: value }))
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
                      <SelectTrigger className="h-8 w-full text-[12px]">
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
                        <SelectTrigger className="h-8 w-full text-[12px]">
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
                          !canManage || detailForm.payType === 'commission_only'
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        개인 배분율 (%)
                      </Label>
                      <Input
                        className="h-8 text-[12px]"
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
                        disabled={!canManage || detailForm.payType === 'fixed'}
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
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="work"
          className="min-h-0 data-[state=active]:flex data-[state=active]:flex-1 data-[state=active]:flex-col"
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-[1100px] space-y-9 px-8 py-7 pb-16">
              <section>
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

              <div className="grid items-start gap-8 xl:grid-cols-2">
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
            <div className="mx-auto grid w-full max-w-[1100px] items-start gap-8 px-8 py-7 pb-16 xl:grid-cols-2">
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
    <div className="min-w-0 px-4 py-2.5 first:pl-7">
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
        'grid gap-6 border-b border-border/80 py-7 lg:grid-cols-[168px_minmax(0,1fr)]',
        last && 'border-b-0',
      )}
    >
      <div>
        <h3 className="text-[12.5px] font-semibold">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-[10.5px] leading-4 text-muted-foreground">
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        className="h-8 text-[12px]"
        type={type}
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
      <Label className="text-[11px] font-medium text-muted-foreground">
        {label}
      </Label>
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
