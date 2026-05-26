import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Activity,
  BriefcaseBusiness,
  CalendarClock,
  CircleDollarSign,
  CirclePlus,
  ClipboardList,
  KeyRound,
  ListFilter,
  Mail,
  Phone,
  Search,
  UserCheck,
  UserCog,
  Users,
  UserX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  CreateEmployeeDto,
  Employee,
  EmployeeDetail,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
import { ScrollArea } from '@/components/ui/scroll-area';

const roleMeta: Record<string, { label: string; className: string }> = {
  owner: { label: '대표', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  manager: { label: '매니저', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  agent: { label: '중개사', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
};

export const Route = createFileRoute('/_authenticated/employees/')({
  component: EmployeesPage,
});

function EmployeesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === 'owner' || user?.role === 'manager';

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [createForm, setCreateForm] = useState<CreateEmployeeDto>({
    name: '',
    loginId: '',
    phone: '',
    email: '',
    role: 'agent',
    password: '',
  });
  const [detailForm, setDetailForm] = useState({
    name: '',
    phone: '',
    email: '',
  });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });

  const { data: performance } = useQuery({
    queryKey: ['employee-performance', selectedEmployeeId],
    queryFn: () => api.employees.getPerformance(selectedEmployeeId as string),
    enabled: !!selectedEmployeeId,
  });

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();

    return employees.filter((employee) => {
      if (roleFilter !== 'all' && employee.role !== roleFilter) return false;
      if (statusFilter === 'active' && !employee.isActive) return false;
      if (statusFilter === 'inactive' && employee.isActive) return false;

      if (!query) return true;

      return [
        employee.name,
        employee.loginId,
        employee.email,
        employee.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [employees, roleFilter, search, statusFilter]);

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

  const { data: employeeDetail } = useQuery({
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
    });
  }, [employeeDetail]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateEmployeeDto) => api.employees.create(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      setSelectedEmployeeId(created.id);
      setIsCreateOpen(false);
      setCreateForm({
        name: '',
        loginId: '',
        phone: '',
        email: '',
        role: user?.role === 'manager' ? 'agent' : 'agent',
        password: '',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.employees.update(selectedEmployeeId as string, {
        name: detailForm.name.trim(),
        phone: emptyToNull(detailForm.phone),
        email: emptyToNull(detailForm.email),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee', selectedEmployeeId] });
    },
  });

  const roleMutation = useMutation({
    mutationFn: (role: string) =>
      api.employees.updateRole(selectedEmployeeId as string, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee', selectedEmployeeId] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      api.employees.updateStatus(selectedEmployeeId as string, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee', selectedEmployeeId] });
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (nextPassword: string) =>
      api.employees.resetPassword(selectedEmployeeId as string, nextPassword),
    onSuccess: () => {
      setResetPassword('');
    },
  });

  const metrics = useMemo(() => {
    const activeEmployees = employees.filter((employee) => employee.isActive);

    return [
      { label: '전체', value: `${employees.length}명`, icon: Users },
      { label: '활성', value: `${activeEmployees.length}명`, icon: UserCheck },
      { label: '비활성', value: `${employees.length - activeEmployees.length}명`, icon: UserX },
      {
        label: '매니저',
        value: `${employees.filter((employee) => employee.role === 'manager').length}명`,
        icon: UserCog,
      },
      {
        label: '거래 담당',
        value: `${employees.filter((employee) => employee.counts.activeDealCount > 0).length}명`,
        icon: BriefcaseBusiness,
      },
    ];
  }, [employees]);

  const roleOptions = user?.role === 'manager' ? ['agent'] : ['agent', 'manager'];

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="rounded-lg border border-border/70 bg-background">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">직원관리</h1>
              <Badge variant="outline" className="h-6 rounded-md px-2 text-xs">
                {employees.length}명
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              계정, 권한, 재직 상태와 담당 현황을 한 화면에서 관리합니다.
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} disabled={!canManage}>
            <CirclePlus className="size-4" />
            직원 추가
          </Button>
        </div>

        <div className="grid divide-y divide-border/70 md:grid-cols-5 md:divide-x md:divide-y-0">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-center gap-3 px-5 py-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <metric.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="text-lg font-semibold tracking-tight">{metric.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid min-h-[720px] overflow-hidden rounded-lg border border-border/70 bg-background xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border/70 xl:border-b-0 xl:border-r">
          <div className="border-b border-border/70 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">직원 디렉터리</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {filteredEmployees.length}명 표시 중
                </p>
              </div>
              <ListFilter className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="이름, 로그인 ID, 연락처 검색"
                  className="pl-9"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="역할" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 역할</SelectItem>
                    <SelectItem value="owner">대표</SelectItem>
                    <SelectItem value="manager">매니저</SelectItem>
                    <SelectItem value="agent">중개사</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="상태" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 상태</SelectItem>
                    <SelectItem value="active">활성</SelectItem>
                    <SelectItem value="inactive">비활성</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-2">
              {filteredEmployees.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => setSelectedEmployeeId(employee.id)}
                  className={cn(
                    'group w-full rounded-md border px-3 py-3 text-left transition-colors',
                    selectedEmployeeId === employee.id
                      ? 'border-primary/30 bg-primary/5 shadow-sm'
                      : 'border-transparent hover:border-border/70 hover:bg-muted/35',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground group-hover:bg-background">
                        {employee.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{employee.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {employee.loginId}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('rounded-md', roleMeta[employee.role]?.className)}
                    >
                      {roleMeta[employee.role]?.label ?? employee.role}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <DirectoryStat label="업무" value={employee.counts.activeTaskCount} />
                    <DirectoryStat label="거래" value={employee.counts.activeDealCount} />
                    <span
                      className={cn(
                        'flex h-7 items-center justify-center rounded-md border text-xs',
                        employee.isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-rose-200 bg-rose-50 text-rose-700',
                      )}
                    >
                      {employee.isActive ? '활성' : '비활성'}
                    </span>
                  </div>
                </button>
              ))}
              {!isLoading && filteredEmployees.length === 0 ? (
                <div className="px-3 py-12 text-center text-sm text-muted-foreground">
                  조건에 맞는 직원이 없습니다.
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </aside>

        <EmployeeDetailCard
          employee={employeeDetail}
          performance={performance}
          detailForm={detailForm}
          onDetailChange={setDetailForm}
          canManage={canManage}
          roleOptions={roleOptions}
          onSave={() => updateMutation.mutate()}
          onRoleChange={(role) => roleMutation.mutate(role)}
          onStatusToggle={() =>
            employeeDetail ? statusMutation.mutate(!employeeDetail.isActive) : undefined
          }
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
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>새 직원 추가</DialogTitle>
            <DialogDescription>
              직원이 사용할 로그인 ID와 초기 비밀번호를 입력합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="이름"
              value={createForm.name ?? ''}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, name: value }))}
            />
            <Field
              label="로그인 ID"
              value={createForm.loginId ?? ''}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, loginId: value }))}
            />
            <Field
              label="휴대폰"
              value={createForm.phone ?? ''}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, phone: value }))}
            />
            <Field
              label="이메일"
              value={createForm.email ?? ''}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, email: value }))}
            />
            <div className="space-y-2">
              <Label>역할</Label>
              <Select
                value={createForm.role ?? 'agent'}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, role: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="역할 선택" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleMeta[role]?.label ?? role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              label="초기 비밀번호"
              value={createForm.password ?? ''}
              type="password"
              onChange={(value) => setCreateForm((prev) => ({ ...prev, password: value }))}
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
              onClick={() => createMutation.mutate(createForm)}
              disabled={
                createMutation.isPending ||
                !createForm.name?.trim() ||
                !createForm.loginId?.trim() ||
                !createForm.password?.trim()
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

function EmployeeDetailCard({
  employee,
  performance,
  detailForm,
  onDetailChange,
  canManage,
  roleOptions,
  onSave,
  onRoleChange,
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
  detailForm: { name: string; phone: string; email: string };
  onDetailChange: Dispatch<
    SetStateAction<{ name: string; phone: string; email: string }>
  >;
  canManage: boolean;
  roleOptions: string[];
  onSave: () => void;
  onRoleChange: (role: string) => void;
  onStatusToggle: () => void;
  resetPassword: string;
  onResetPasswordChange: (value: string) => void;
  onResetPassword: () => void;
  isSaving: boolean;
}) {
  if (!employee) {
    return (
      <main className="flex min-h-[540px] items-center justify-center text-sm text-muted-foreground">
          직원을 선택하면 상세 정보가 표시됩니다.
      </main>
    );
  }

  return (
    <main className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-foreground text-lg font-semibold text-background">
            {employee.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight">{employee.name}</h2>
              <Badge
                variant="outline"
                className={cn('rounded-md', roleMeta[employee.role]?.className)}
              >
                {roleMeta[employee.role]?.label ?? employee.role}
              </Badge>
              <StatusBadge isActive={employee.isActive} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{employee.loginId}</span>
              {employee.phone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" />
                  {employee.phone}
                </span>
              ) : null}
              {employee.email ? (
                <span className="inline-flex items-center gap-1">
                  <Mail className="size-3" />
                  {employee.email}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!canManage || isSaving} onClick={onStatusToggle}>
            {employee.isActive ? '비활성화' : '재활성화'}
          </Button>
          <Button disabled={!canManage || isSaving} onClick={onSave}>
            저장
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-5 p-5">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <MetricTile
              icon={ClipboardList}
              label="진행 업무"
              value={`${employee.counts.activeTaskCount}건`}
            />
            <MetricTile
              icon={BriefcaseBusiness}
              label="진행 거래"
              value={`${employee.counts.activeDealCount}건`}
            />
            <MetricTile
              icon={Users}
              label="담당 고객"
              value={`${employee.counts.activeBuyerRequirementCount}건`}
            />
            <MetricTile
              icon={CircleDollarSign}
              label="미정산 참여"
              value={`${employee.counts.unsettledDealCount}건`}
            />
          </div>

          {performance ? (
            <div className="grid gap-3 md:grid-cols-2">
              <MetricTile
                icon={Activity}
                label="누적 상담"
                value={`${performance.consultationCount}건`}
              />
              <MetricTile
                icon={CircleDollarSign}
                label="참여 수수료"
                value={
                  performance.commissionAmountTotal
                    ? formatPrice(performance.commissionAmountTotal)
                    : '-'
                }
              />
            </div>
          ) : null}

          <SectionPanel title="기본 정보">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="이름"
                value={detailForm.name}
                onChange={(value) => onDetailChange((prev) => ({ ...prev, name: value }))}
                disabled={!canManage}
              />
              <StaticField label="로그인 ID" value={employee.loginId} />
              <Field
                label="휴대폰"
                value={detailForm.phone}
                onChange={(value) => onDetailChange((prev) => ({ ...prev, phone: value }))}
                disabled={!canManage}
              />
              <Field
                label="이메일"
                value={detailForm.email}
                onChange={(value) => onDetailChange((prev) => ({ ...prev, email: value }))}
                disabled={!canManage}
              />
              <div className="space-y-2">
                <Label>역할</Label>
                <Select
                  value={employee.role}
                  onValueChange={onRoleChange}
                  disabled={!canManage || !roleOptions.includes(employee.role)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="역할 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleMeta[role]?.label ?? role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <StaticField label="생성일" value={formatDate(employee.createdAt)} />
            </div>
          </SectionPanel>

          <SectionPanel
            title="보안"
            description="초기 비밀번호를 즉시 다시 발급합니다."
          >
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                type="password"
                value={resetPassword}
                onChange={(event) => onResetPasswordChange(event.target.value)}
                placeholder="새 비밀번호"
                disabled={!canManage}
              />
              <Button
                variant="outline"
                onClick={onResetPassword}
                disabled={!canManage || !resetPassword.trim()}
              >
                <KeyRound className="size-4" />
                재설정
              </Button>
            </div>
          </SectionPanel>

          <ListSection
            title="담당 업무"
            icon={ClipboardList}
            items={employee.assignedTasks.map((task) => ({
              id: task.id,
              title: task.title,
              description: `${task.status} · ${task.priority}${task.dueDate ? ` · ${formatDate(task.dueDate)}` : ''}`,
            }))}
            emptyMessage="담당 업무가 없습니다."
          />

          <ListSection
            title="담당 고객/요구조건"
            icon={Users}
            items={employee.assignedBuyerRequirements.map((requirement) => ({
              id: requirement.id,
              title: requirement.contact?.name ?? '고객',
              description: `${requirement.status}${requirement.nextContactDate ? ` · 다음 연락 ${formatDate(requirement.nextContactDate)}` : ''}`,
            }))}
            emptyMessage="담당 고객이 없습니다."
          />
        </section>

        <aside className="space-y-5 border-t border-border/70 bg-muted/20 p-5 xl:border-l xl:border-t-0">
          <ListSection
            title="거래 참여/배분"
            icon={BriefcaseBusiness}
            items={employee.dealParticipants.map((participant) => ({
              id: participant.id,
              title: participant.deal.property?.site?.name ?? '거래',
              description: `${participant.role} · ${participant.side} · ${participant.settlementStatus}${participant.commissionAmount ? ` · ${formatPrice(participant.commissionAmount)}` : ''}`,
            }))}
            emptyMessage="참여 중인 거래가 없습니다."
          />

          <ListSection
            title="최근 상담"
            icon={CalendarClock}
            items={employee.recentConsultations.map((consultation) => ({
              id: consultation.id,
              title: consultation.contact?.name ?? consultation.type,
              description: `${consultation.type} · ${formatDateTime(consultation.createdAt)} · ${consultation.content}`,
            }))}
            emptyMessage="최근 상담이 없습니다."
          />

          <ListSection
            title="최근 활동"
            icon={Activity}
            items={employee.recentActivities.map((activity) => ({
              id: activity.id,
              title: `${activity.entityType} ${activity.action}`,
              description: `${activity.source} · ${formatDateTime(activity.createdAt)}${activity.reason ? ` · ${activity.reason}` : ''}`,
            }))}
            emptyMessage="최근 활동 로그가 없습니다."
          />

          <SectionPanel title="사무소 배분 정책" compact>
            <div className="space-y-2 text-sm">
              <SummaryRow
                label="기본 직원 배분"
                value={`${getCommissionNumber(employee.office.commissionConfig, 'defaultAgentRate', 50)}%`}
              />
              <SummaryRow
                label="매도측 담당"
                value={`${getCommissionNumber(employee.office.commissionConfig, 'listingAgentRate', 50)}%`}
              />
              <SummaryRow
                label="매수측 담당"
                value={`${getCommissionNumber(employee.office.commissionConfig, 'buyingAgentRate', 50)}%`}
              />
              <SummaryRow
                label="단독중개"
                value={`${getCommissionNumber(employee.office.commissionConfig, 'dualAgentRate', 70)}%`}
              />
            </div>
          </SectionPanel>
        </aside>
      </div>
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
  items: Array<{ id: string; title: string; description: string }>;
  emptyMessage: string;
}) {
  return (
    <SectionPanel title={title} icon={Icon} compact>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/80 px-3 py-5 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-md border border-border/70 bg-background px-3 py-3">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))
        )}
      </div>
    </SectionPanel>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SectionPanel({
  title,
  description,
  icon: Icon,
  compact,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-background">
      <div className={cn('border-b border-border/70', compact ? 'px-4 py-3' : 'px-5 py-4')}>
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className={compact ? 'p-4' : 'p-5'}>{children}</div>
    </section>
  );
}

function DirectoryStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex h-7 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground">
      {label} <span className="ml-1 font-medium text-foreground">{value}</span>
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md',
        isActive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-rose-200 bg-rose-50 text-rose-700',
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex h-9 items-center rounded-md border border-border/60 bg-muted/30 px-3 text-sm">
        {value}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getCommissionNumber(
  config: unknown,
  key: string,
  fallback: number,
) {
  if (typeof config !== 'object' || config === null) return fallback;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
