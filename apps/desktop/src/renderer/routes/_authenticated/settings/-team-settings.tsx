import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  KeyRound,
  Plus,
  RotateCw,
  Save,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CreateEmployeeDto, Employee, EmployeeDetail } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatDate, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { ConfirmDialog } from '@/components/domain';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  LICENSE_TYPE_LABELS,
  PAY_TYPE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  getCommissionNumber,
  getErrorMessage,
  licenseLabel,
  matchesEmployeeSearch,
} from '../employees/-employee-shared';

/**
 * 설정 › 직원 및 권한 — 직원 계정을 만들고, 역할·자격·급여·비밀번호·활성 여부를 정한다.
 *
 * 대표와 매니저만 들어온다. 매니저는 중개사 계정만 다루고, 급여와 배분율은 대표만 본다
 * (서버가 매니저에게는 그 값을 보내지 않는다 — payVisible).
 * 직원이 무슨 일을 하고 있는지는 여기가 아니라 직원관리 화면에서 본다.
 */

const NONE_VALUE = '__none__';

/** 설정 화면의 카드와 같은 모양 (settings/index.tsx의 SettingsSurface) */
const surfaceClassName =
  'overflow-hidden rounded-lg border border-border/80 bg-card shadow-[0_1px_2px_rgba(55,53,47,0.035)]';

interface AccountForm {
  name: string;
  phone: string;
  email: string;
  licenseType: string;
  licenseNo: string;
  payType: string;
  baseSalary: string;
  commissionRate: string;
  /** 직원 정산에서의 구분: freelancer | employee */
  employmentType: string;
  /** 프리랜서에게 줄 때 3.3%를 떼는지 */
  withholdTax: boolean;
}

interface CreateForm {
  name: string;
  loginId: string;
  phone: string;
  email: string;
  role: string;
  password: string;
  licenseType: string;
  licenseNo: string;
}

const EMPTY_CREATE_FORM: CreateForm = {
  name: '',
  loginId: '',
  phone: '',
  email: '',
  role: 'agent',
  password: '',
  licenseType: '',
  licenseNo: '',
};

function toAccountForm(employee: EmployeeDetail): AccountForm {
  return {
    name: employee.name ?? '',
    phone: employee.phone ?? '',
    email: employee.email ?? '',
    licenseType: employee.licenseType ?? '',
    licenseNo: employee.licenseNo ?? '',
    payType: employee.payType ?? 'mixed',
    baseSalary: employee.baseSalary != null ? String(employee.baseSalary) : '',
    commissionRate: employee.commissionRate != null ? String(employee.commissionRate) : '',
    employmentType: employee.employmentType ?? 'freelancer',
    withholdTax: employee.withholdTax ?? true,
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function TeamSettings() {
  const { user } = useAuth();
  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null);

  return openEmployeeId ? (
    <EmployeeAccount
      key={openEmployeeId}
      employeeId={openEmployeeId}
      actorRole={user?.role ?? 'agent'}
      actorId={user?.id ?? null}
      onBack={() => setOpenEmployeeId(null)}
    />
  ) : (
    <TeamList
      actorRole={user?.role ?? 'agent'}
      actorId={user?.id ?? null}
      onOpen={setOpenEmployeeId}
    />
  );
}

// ── 목록 ────────────────────────────────────────────────────────

function TeamList({
  actorRole,
  actorId,
  onOpen,
}: {
  actorRole: string;
  actorId: string | null;
  onOpen: (employeeId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });
  const { data: office } = useQuery({
    queryKey: ['office-profile'],
    queryFn: () => api.offices.getMe(),
  });
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
  // 활성 직원 먼저, 그 안에서는 서버 순서(역할 → 이름)
  const matching = useMemo(
    () =>
      employees
        .filter((employee) => matchesEmployeeSearch(employee, search))
        .sort((a, b) => Number(b.isActive) - Number(a.isActive)),
    [employees, search],
  );

  const activeCount =
    office?.counts.activeUsers ?? employees.filter((employee) => employee.isActive).length;
  const maxUsers = office?.maxUsers ?? null;
  const isSeatFull = maxUsers != null && activeCount >= maxUsers;
  const seatUsage =
    maxUsers && maxUsers > 0 ? Math.min(100, Math.round((activeCount / maxUsers) * 100)) : null;

  // 만들 수 있는 역할: 매니저는 중개사만, 대표는 중개사와 매니저
  const createRoleOptions = actorRole === 'owner' ? ['agent', 'manager'] : ['agent'];

  const createMutation = useMutation({
    mutationFn: (payload: CreateEmployeeDto) => api.employees.create(payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      setIsCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      toast.success(`${created.name}님 계정이 생성되었습니다.`);
      onOpen(created.id);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const closeCreate = () => {
    setIsCreateOpen(false);
    setCreateForm(EMPTY_CREATE_FORM);
  };

  return (
    <div data-team-settings className="space-y-7">
      <div>
        <div className="mb-3 flex items-end justify-between gap-4">
          <SectionHeading
            title="직원 계정"
            description="직원을 선택하면 계정 정보, 역할, 급여와 비밀번호를 관리할 수 있습니다."
          />
          <Button size="sm" className="shrink-0" onClick={() => setIsCreateOpen(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            직원 추가
          </Button>
        </div>

        <section className={surfaceClassName} aria-label="직원 계정 목록">
          {/* 요금제의 계정 수 */}
          <div className="flex items-center gap-4 border-b border-border/70 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">
                활성 계정{' '}
                <span className="tabular-nums">
                  {maxUsers != null ? `${activeCount} / ${maxUsers}` : `${activeCount}명`}
                </span>
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {isSeatFull
                  ? '요금제의 계정을 모두 쓰고 있습니다. 직원을 비활성화하거나 요금제를 올려야 추가할 수 있습니다.'
                  : '비활성화한 계정은 수에 들어가지 않습니다.'}
              </p>
            </div>
            {seatUsage != null ? (
              <div
                className="h-1.5 w-[160px] shrink-0 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="직원 계정 슬롯 사용량"
                aria-valuemin={0}
                aria-valuemax={maxUsers ?? undefined}
                aria-valuenow={activeCount}
              >
                <div
                  className={cn(
                    'h-full rounded-full',
                    seatUsage >= 100 ? 'bg-warning' : 'bg-foreground/70',
                  )}
                  style={{ width: `${seatUsage}%` }}
                />
              </div>
            ) : null}
          </div>

          {employees.length > 6 ? (
            <div className="border-b border-border/70 px-4 py-2.5">
              <div className="relative max-w-[320px]">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="이름, 아이디, 연락처"
                  aria-label="직원 검색"
                  className="h-8 bg-background pl-8 text-xs shadow-none"
                />
              </div>
            </div>
          ) : null}

          {employeesQuery.isLoading ? (
            <div className="divide-y divide-border/70">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-3 px-5 py-4">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
              ))}
            </div>
          ) : employeesQuery.isError ? (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="text-[13px] text-muted-foreground">직원 목록을 불러오지 못했습니다.</p>
              <Button variant="outline" size="sm" onClick={() => void employeesQuery.refetch()}>
                <RotateCw className="size-3.5" aria-hidden="true" />
                다시 시도
              </Button>
            </div>
          ) : matching.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
              {employees.length === 0 ? '아직 등록된 직원이 없습니다.' : '찾는 직원이 없습니다.'}
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {matching.map((employee) => (
                <MemberRow
                  key={employee.id}
                  employee={employee}
                  isSelf={employee.id === actorId}
                  onOpen={() => onOpen(employee.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <div>
        <SectionHeading title="역할별 권한" description="역할은 직원 계정을 열어 바꿉니다." className="mb-3" />
        <section className={cn(surfaceClassName, 'divide-y divide-border/70')}>
          {(['owner', 'manager', 'agent'] as const).map((role) => (
            <div key={role} className="flex items-baseline gap-4 px-5 py-3.5">
              <p className="w-16 shrink-0 text-[13px] font-medium">{ROLE_LABELS[role]}</p>
              <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>
          ))}
        </section>
      </div>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (open) setIsCreateOpen(true);
          else closeCreate();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>새 직원 추가</DialogTitle>
            <DialogDescription>
              직원이 사용할 로그인 ID와 초기 비밀번호를 입력합니다.
              {maxUsers != null ? ` 직원 계정 ${activeCount}/${maxUsers} 사용 중입니다.` : ''}
            </DialogDescription>
          </DialogHeader>

          {isSeatFull ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-destructive-soft/50 px-3 py-2.5 text-xs leading-5 text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              최대 사용자 수({maxUsers}명)에 도달했습니다. 직원을 비활성화하거나 요금제를 올린 뒤
              추가하세요.
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="new-employee-name"
              label="이름"
              required
              autoComplete="name"
              value={createForm.name}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, name: value }))}
            />
            <TextField
              id="new-employee-login"
              label="로그인 ID"
              required
              autoComplete="username"
              value={createForm.loginId}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, loginId: value }))}
            />
            <TextField
              id="new-employee-phone"
              label="휴대폰"
              type="tel"
              autoComplete="tel"
              value={createForm.phone}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, phone: value }))}
            />
            <TextField
              id="new-employee-email"
              label="이메일"
              type="email"
              autoComplete="email"
              value={createForm.email}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, email: value }))}
            />
            <div className="space-y-2">
              <Label className="text-xs">역할</Label>
              <Select
                value={createForm.role}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, role: value }))}
              >
                <SelectTrigger className="w-full bg-background" aria-label="새 직원 역할">
                  <SelectValue placeholder="역할 선택" />
                </SelectTrigger>
                <SelectContent>
                  {createRoleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role] ?? role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TextField
              id="new-employee-password"
              label="초기 비밀번호"
              required
              type="password"
              autoComplete="new-password"
              value={createForm.password}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, password: value }))}
            />
            <LicenseTypeField
              ariaLabel="새 직원 자격 구분"
              value={createForm.licenseType}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, licenseType: value }))}
            />
            <TextField
              id="new-employee-license-no"
              label="자격증/등록 번호"
              value={createForm.licenseNo}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, licenseNo: value }))}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeCreate} disabled={createMutation.isPending}>
              닫기
            </Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  name: createForm.name.trim(),
                  loginId: createForm.loginId.trim(),
                  phone: createForm.phone.trim() || undefined,
                  email: createForm.email.trim() || undefined,
                  role: createForm.role,
                  password: createForm.password,
                  licenseType: createForm.licenseType || null,
                  licenseNo: createForm.licenseNo.trim() || null,
                })
              }
              disabled={
                createMutation.isPending ||
                isSeatFull ||
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
    </div>
  );
}

function MemberRow({
  employee,
  isSelf,
  onOpen,
}: {
  employee: Employee;
  isSelf: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-team-member
        onClick={onOpen}
        aria-label={`${employee.name} 계정 설정 열기`}
        className="group flex w-full items-center gap-3 px-5 py-3.5 text-left outline-none hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/35"
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-[13px] font-semibold',
            employee.isActive ? 'text-neutral-strong' : 'text-muted-foreground',
          )}
        >
          {employee.name.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'truncate text-[13px] font-medium',
                !employee.isActive && 'text-muted-foreground',
              )}
            >
              {employee.name}
            </span>
            {isSelf ? <span className="shrink-0 text-xs text-muted-foreground">나</span> : null}
            {!employee.isActive ? (
              <span className="inline-flex h-5 shrink-0 items-center rounded-[4px] bg-[#f1f1ef] px-1.5 text-[11px] text-[#787774]">
                비활성
              </span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {employee.loginId}
            <span className="mx-1.5" aria-hidden="true">
              ·
            </span>
            {licenseLabel(employee.licenseType)}
            {employee.phone ? (
              <>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                {formatPhone(employee.phone)}
              </>
            ) : null}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {ROLE_LABELS[employee.role] ?? employee.role}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

// ── 직원 한 명의 계정 ───────────────────────────────────────────

function EmployeeAccount({
  employeeId,
  actorRole,
  actorId,
  onBack,
}: {
  employeeId: string;
  actorRole: string;
  actorId: string | null;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => api.employees.findOne(employeeId),
  });
  const employee = detailQuery.data;

  const [form, setForm] = useState<AccountForm | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);

  // 서버 값이 바뀌면(저장 뒤 포함) 입력칸을 그 값으로 맞춘다
  useEffect(() => {
    if (employee) setForm(toAccountForm(employee));
  }, [employee]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
    void queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
  };

  // 매니저는 중개사 계정만 다룬다. 급여와 배분율은 대표만 정한다.
  const canEdit = employee
    ? actorRole === 'owner' || (actorRole === 'manager' && employee.role === 'agent')
    : false;
  const canEditPay = actorRole === 'owner';
  const showPay = Boolean(employee && employee.payVisible && employee.role !== 'owner');

  const updateMutation = useMutation({
    mutationFn: (values: AccountForm) =>
      api.employees.update(employeeId, {
        name: values.name.trim(),
        phone: emptyToNull(values.phone),
        email: emptyToNull(values.email),
        licenseType: values.licenseType || null,
        licenseNo: emptyToNull(values.licenseNo),
        // 급여 값은 대표가 저장할 때만 보낸다 (서버도 매니저의 요청은 막는다)
        ...(canEditPay && showPay
          ? {
              payType: values.payType,
              baseSalary: values.baseSalary.trim() === '' ? null : Number(values.baseSalary),
              commissionRate:
                values.commissionRate.trim() === '' ? null : Number(values.commissionRate),
              employmentType: values.employmentType,
              withholdTax: values.withholdTax,
            }
          : {}),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('직원 정보가 저장되었습니다.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const roleMutation = useMutation({
    mutationFn: (role: string) => api.employees.updateRole(employeeId, role),
    onSuccess: (_, role) => {
      invalidate();
      setPendingRole(null);
      toast.success(`역할이 '${ROLE_LABELS[role] ?? role}'(으)로 변경되었습니다.`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) => api.employees.updateStatus(employeeId, isActive),
    onSuccess: (_, isActive) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      setIsStatusConfirmOpen(false);
      toast.success(isActive ? '계정이 재활성화되었습니다.' : '계정이 비활성화되었습니다.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const passwordMutation = useMutation({
    mutationFn: (password: string) => api.employees.resetPassword(employeeId, password),
    onSuccess: (result) => {
      setNewPassword('');
      toast.success(result.message ?? '비밀번호가 재설정되었습니다. 직원에게 전달하세요.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const backLink = (
    <button
      type="button"
      onClick={onBack}
      className="-ml-1.5 mb-5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
    >
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      직원 계정
    </button>
  );

  if (detailQuery.isLoading || (employee && !form)) {
    return (
      <div>
        {backLink}
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </div>
    );
  }
  if (detailQuery.isError || !employee || !form) {
    return (
      <div>
        {backLink}
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-[13px] text-muted-foreground">직원 정보를 불러오지 못했습니다.</p>
          <Button variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>
            <RotateCw className="size-3.5" aria-hidden="true" />
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  const saved = toAccountForm(employee);
  const isDirty = (Object.keys(saved) as Array<keyof AccountForm>).some(
    (key) => saved[key] !== form[key],
  );
  const update = (patch: Partial<AccountForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('이름을 입력하세요.');
      return;
    }
    if (canEditPay && showPay) {
      if (form.baseSalary.trim() !== '') {
        const baseSalary = Number(form.baseSalary);
        if (!Number.isInteger(baseSalary) || baseSalary < 0) {
          toast.error('기본급은 0 이상의 정수(만원)로 입력하세요.');
          return;
        }
      }
      if (form.commissionRate.trim() !== '') {
        const rate = Number(form.commissionRate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          toast.error('수수료 배분율은 0~100 사이로 입력하세요.');
          return;
        }
      }
    }
    updateMutation.mutate(form);
  };

  // 바꿀 수 있는 역할: 대표는 셋 다(대표 승계 포함), 매니저는 바꾸지 못한다
  const roleOptions = actorRole === 'owner' ? ['agent', 'manager', 'owner'] : [employee.role];
  const canChangeRole = actorRole === 'owner' && employee.id !== actorId;

  const statusWarnings: string[] = [];
  if (employee.isActive) {
    if (employee.role === 'owner') {
      statusWarnings.push('대표 계정입니다. 사무소의 마지막 대표 계정은 비활성화할 수 없습니다.');
    }
    const { activeTaskCount, activeDealCount } = employee.counts;
    if (activeTaskCount > 0 || activeDealCount > 0) {
      statusWarnings.push(
        `진행 중 업무 ${activeTaskCount}건 · 거래 ${activeDealCount}건이 있습니다. 비활성화 전에 다른 직원에게 인계하세요.`,
      );
    }
  }

  return (
    <div data-employee-account>
      {backLink}

      <header className="mb-7 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-[15px] font-semibold text-neutral-strong"
        >
          {employee.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
            <span className="truncate">{employee.name}</span>
            {!employee.isActive ? (
              <span className="inline-flex h-5 shrink-0 items-center rounded-[4px] bg-[#f1f1ef] px-1.5 text-[11px] font-normal text-[#787774]">
                비활성
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ROLE_LABELS[employee.role] ?? employee.role} · {employee.loginId} · 계정 생성{' '}
            {formatDate(employee.createdAt)}
          </p>
        </div>
      </header>

      <div className="space-y-7">
        {!canEdit ? (
          <p className="rounded-lg border border-border/70 bg-background px-4 py-3 text-xs text-muted-foreground">
            매니저는 중개사 계정만 변경할 수 있습니다. 이 계정은 대표가 관리합니다.
          </p>
        ) : null}

        <div>
          <SectionHeading
            title="기본 정보"
            description="이름, 연락처와 중개 자격입니다. 로그인 ID는 바꿀 수 없습니다."
            className="mb-3"
          />
          <section className={cn(surfaceClassName, 'p-5')}>
            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <TextField
                id="employee-name"
                label="이름"
                required
                autoComplete="name"
                value={form.name}
                onChange={(value) => update({ name: value })}
                disabled={!canEdit}
              />
              <div className="space-y-2">
                <p className="text-xs font-medium">로그인 ID</p>
                <p className="flex h-9 items-center text-[13px] text-muted-foreground">
                  {employee.loginId}
                </p>
              </div>
              <TextField
                id="employee-phone"
                label="휴대폰"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(value) => update({ phone: value })}
                disabled={!canEdit}
              />
              <TextField
                id="employee-email"
                label="이메일"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(value) => update({ email: value })}
                disabled={!canEdit}
              />
              <LicenseTypeField
                ariaLabel="자격 구분"
                value={form.licenseType}
                onChange={(value) => update({ licenseType: value })}
                disabled={!canEdit}
              />
              <TextField
                id="employee-license-no"
                label="자격증/등록 번호"
                value={form.licenseNo}
                onChange={(value) => update({ licenseNo: value })}
                disabled={!canEdit}
              />
            </div>
          </section>
        </div>

        {showPay ? (
          <div>
            <SectionHeading
              title="급여와 배분"
              description={
                canEditPay
                  ? '대표만 정하고 볼 수 있습니다. 개인 배분율을 비우면 사무소 기준이 적용됩니다.'
                  : '대표가 정한 값입니다. 본인만 볼 수 있습니다.'
              }
              className="mb-3"
            />
            <section className={cn(surfaceClassName, 'p-5')}>
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs">급여 유형</Label>
                  <Select
                    value={form.payType}
                    onValueChange={(value) => update({ payType: value })}
                    disabled={!canEditPay}
                  >
                    <SelectTrigger className="w-full bg-background" aria-label="급여 유형">
                      <SelectValue placeholder="급여 유형" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAY_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <TextField
                  id="employee-base-salary"
                  label="월 기본급 (만원)"
                  type="number"
                  value={form.baseSalary}
                  placeholder={form.payType === 'commission_only' ? '수수료제' : '예: 250'}
                  onChange={(value) => update({ baseSalary: value })}
                  disabled={!canEditPay || form.payType === 'commission_only'}
                />
                <TextField
                  id="employee-commission-rate"
                  label="개인 배분율 (%)"
                  type="number"
                  value={form.commissionRate}
                  placeholder={form.payType === 'fixed' ? '고정급' : '비우면 사무소 기준'}
                  onChange={(value) => update({ commissionRate: value })}
                  disabled={!canEditPay || form.payType === 'fixed'}
                />
                <div className="space-y-2">
                  <Label className="text-xs">정산 구분</Label>
                  <Select
                    value={form.employmentType}
                    onValueChange={(value) => update({ employmentType: value })}
                    disabled={!canEditPay}
                  >
                    <SelectTrigger className="w-full bg-background" aria-label="정산 구분">
                      <SelectValue placeholder="정산 구분" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="freelancer">프리랜서</SelectItem>
                      <SelectItem value="employee">근로자</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs" htmlFor="employee-withhold-tax">
                    3.3% 공제
                  </Label>
                  {form.employmentType === 'employee' ? (
                    <p className="flex min-h-9 items-center text-sm text-muted-foreground">
                      근로자는 성과급까지만 계산하고, 기본급과 세금·4대보험은 급여에서 처리합니다.
                    </p>
                  ) : (
                    <div className="flex min-h-9 items-center gap-2.5">
                      <Switch
                        id="employee-withhold-tax"
                        checked={form.withholdTax}
                        onCheckedChange={(checked) => update({ withholdTax: checked })}
                        disabled={!canEditPay}
                      />
                      <span className="text-sm">
                        {form.withholdTax ? '3.3%를 떼고 지급합니다' : '떼지 않고 전액 지급합니다'}
                      </span>
                    </div>
                  )}
                  {form.employmentType !== 'employee' && !form.withholdTax ? (
                    <p className="text-xs leading-5 text-warning-strong">
                      세무사용 목록에는 공제 안 함으로 표시되고, 원천징수 신고는 사무소가 따로 챙겨야 합니다.
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="mt-4 border-t border-border/70 pt-3 text-xs leading-5 text-muted-foreground">
                사무소 기준: 기본{' '}
                {getCommissionNumber(employee.office.commissionConfig, 'defaultAgentRate', 50)}% · 매도측{' '}
                {getCommissionNumber(employee.office.commissionConfig, 'listingAgentRate', 50)}% · 매수측{' '}
                {getCommissionNumber(employee.office.commissionConfig, 'buyingAgentRate', 50)}% · 단독중개{' '}
                {getCommissionNumber(employee.office.commissionConfig, 'dualAgentRate', 70)}%. 설정의
                수수료 배분에서 바꿉니다.
              </p>
            </section>
          </div>
        ) : null}

        {canEdit ? (
          <SaveBar isDirty={isDirty} isSaving={updateMutation.isPending} onSave={handleSave} />
        ) : null}

        <div>
          <SectionHeading
            title="권한과 보안"
            description="바꾸면 바로 적용됩니다. 저장 버튼과는 따로 동작합니다."
            className="mb-3"
          />
          <section className={cn(surfaceClassName, 'divide-y divide-border/70')}>
            <ControlRow
              title="역할"
              description={ROLE_DESCRIPTIONS[employee.role] ?? '이 계정의 권한 범위입니다.'}
            >
              <Select
                value={employee.role}
                onValueChange={(value) => {
                  if (value !== employee.role) setPendingRole(value);
                }}
                disabled={!canChangeRole || roleMutation.isPending}
              >
                <SelectTrigger className="w-[140px] bg-background" aria-label="직원 역할">
                  <SelectValue placeholder="역할 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(roleOptions.includes(employee.role)
                    ? roleOptions
                    : [...roleOptions, employee.role]
                  ).map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role] ?? role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ControlRow>

            <ControlRow
              title="비밀번호 재설정"
              description="새 비밀번호를 정해 직원에게 전달합니다. 기존 로그인은 모두 끊깁니다."
            >
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="새 비밀번호"
                  aria-label="새 비밀번호"
                  autoComplete="new-password"
                  className="w-[180px] bg-background"
                  disabled={!canEdit}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => passwordMutation.mutate(newPassword)}
                  disabled={!canEdit || !newPassword.trim() || passwordMutation.isPending}
                >
                  <KeyRound className="size-3.5" aria-hidden="true" />
                  재설정
                </Button>
              </div>
            </ControlRow>

            <ControlRow
              title={employee.isActive ? '계정 비활성화' : '계정 재활성화'}
              description={
                employee.isActive
                  ? '비활성화하면 로그인할 수 없고 계정 수에서 빠집니다. 기록은 남습니다.'
                  : '다시 로그인하고 업무를 맡을 수 있게 됩니다.'
              }
            >
              <Button
                variant="outline"
                size="sm"
                className={cn(employee.isActive && 'text-destructive hover:text-destructive')}
                onClick={() => setIsStatusConfirmOpen(true)}
                disabled={!canEdit || statusMutation.isPending}
              >
                {employee.isActive ? '비활성화' : '재활성화'}
              </Button>
            </ControlRow>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={pendingRole !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRole(null);
        }}
        title="역할 변경"
        description={
          pendingRole
            ? `${employee.name}님의 역할을 '${ROLE_LABELS[pendingRole] ?? pendingRole}'(으)로 변경합니다. 접근 권한이 즉시 변경됩니다.${
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
        title={employee.isActive ? '계정 비활성화' : '계정 재활성화'}
        destructive={employee.isActive}
        description={
          employee.isActive ? (
            <span className="space-y-1.5">
              <span className="block">
                {employee.name}님 계정을 비활성화하면 더 이상 로그인할 수 없습니다.
              </span>
              {statusWarnings.map((warning) => (
                <span key={warning} className="block text-destructive">
                  {warning}
                </span>
              ))}
            </span>
          ) : (
            `${employee.name}님 계정을 재활성화하면 즉시 로그인과 업무 배정이 가능해집니다.`
          )
        }
        confirmLabel={employee.isActive ? '비활성화' : '재활성화'}
        loading={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate(!employee.isActive)}
      />
    </div>
  );
}

// ── 작은 부품 ───────────────────────────────────────────────────

function SectionHeading({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

/** 설정 화면의 줄: 왼쪽에 이름과 설명, 오른쪽에 조작 */
function ControlRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="justify-self-start sm:justify-self-end">{children}</div>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  disabled,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={id}
        type={type}
        min={type === 'number' ? 0 : undefined}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
        className="bg-background"
      />
    </div>
  );
}

function LicenseTypeField({
  ariaLabel,
  value,
  onChange,
  disabled,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">자격 구분</Label>
      <Select
        value={value || NONE_VALUE}
        onValueChange={(next) => onChange(next === NONE_VALUE ? '' : next)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full bg-background" aria-label={ariaLabel}>
          <SelectValue placeholder="자격 구분" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>미지정</SelectItem>
          {Object.entries(LICENSE_TYPE_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === 'assistant' ? (
        <p className="text-xs text-warning-strong">중개보조원은 계약서에 서명할 수 없습니다.</p>
      ) : null}
    </div>
  );
}

/** 설정 화면의 저장 띠(SaveStrip)와 같은 모양 */
function SaveBar({
  isDirty,
  isSaving,
  onSave,
}: {
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/90 bg-background px-4 py-3 shadow-[0_8px_24px_rgba(55,53,47,0.07)]">
      <div className="flex items-center gap-2 text-xs" aria-live="polite">
        <span
          className={cn(
            'flex size-5 items-center justify-center rounded-full',
            isDirty ? 'bg-info-soft text-info-strong' : 'bg-success-soft text-success',
          )}
        >
          {isDirty ? <span className="size-1.5 rounded-full bg-current" /> : <Check className="size-3" />}
        </span>
        <span className={isDirty ? 'text-foreground' : 'text-muted-foreground'}>
          {isSaving
            ? '변경사항을 저장하는 중입니다…'
            : isDirty
              ? '저장하지 않은 변경사항이 있습니다.'
              : '모든 변경사항이 저장되었습니다.'}
        </span>
      </div>
      <Button size="sm" onClick={onSave} disabled={!isDirty || isSaving}>
        <Save className="size-3.5" aria-hidden="true" />
        {isSaving ? '저장 중…' : '직원 정보 저장'}
      </Button>
    </div>
  );
}
