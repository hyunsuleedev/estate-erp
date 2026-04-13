import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { CirclePlus, KeyRound, ShieldCheck, UserCog, Users } from 'lucide-react';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  owner: { label: 'Owner', className: 'bg-amber-50 text-amber-700' },
  manager: { label: 'Manager', className: 'bg-blue-50 text-blue-700' },
  agent: { label: 'Agent', className: 'bg-emerald-50 text-emerald-700' },
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

  const { data: office } = useQuery({
    queryKey: ['office-profile'],
    queryFn: () => api.offices.getMe(),
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
      { label: '전체 직원', value: `${employees.length}명`, icon: Users },
      { label: '활성 직원', value: `${activeEmployees.length}명`, icon: ShieldCheck },
      {
        label: '매니저',
        value: `${employees.filter((employee) => employee.role === 'manager').length}명`,
        icon: UserCog,
      },
      {
        label: '진행 거래 담당',
        value: `${employees.filter((employee) => employee.counts.activeDealCount > 0).length}명`,
        icon: Users,
      },
    ];
  }, [employees]);

  const loginPreview = useMemo(
    () => getNextLoginPreview(user?.office.code, employees),
    [employees, user?.office.code],
  );

  const roleOptions = user?.role === 'manager' ? ['agent'] : ['agent', 'manager'];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">직원관리</h1>
            <span className="text-xs text-muted-foreground">{employees.length}명</span>
          </div>
          <p className="text-sm text-muted-foreground">
            계정, 권한, 재직 상태와 담당 현황을 한 번에 관리합니다.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} disabled={!canManage}>
          <CirclePlus className="size-4" />
          직원 추가
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="gap-3 py-4">
            <CardContent className="flex items-center justify-between px-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="text-xl font-semibold tracking-tight">{metric.value}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <metric.icon className="size-4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid min-h-[720px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>직원 목록</CardTitle>
            <CardDescription>역할과 현재 작업량 기준으로 빠르게 훑습니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름, 로그인 ID, 연락처 검색"
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="역할" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 역할</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
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
            <ScrollArea className="h-[520px] rounded-lg border border-border/60">
              <div className="space-y-2 p-2">
                {filteredEmployees.map((employee) => (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => setSelectedEmployeeId(employee.id)}
                    className={cn(
                      'w-full rounded-xl border border-transparent px-3 py-3 text-left transition-colors',
                      selectedEmployeeId === employee.id
                        ? 'border-primary/30 bg-primary/5'
                        : 'hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{employee.name}</p>
                        <p className="text-xs text-muted-foreground">{employee.loginId}</p>
                      </div>
                      <Badge className={cn('border-0', roleMeta[employee.role]?.className)}>
                        {roleMeta[employee.role]?.label ?? employee.role}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>업무 {employee.counts.activeTaskCount}</span>
                      <span>거래 {employee.counts.activeDealCount}</span>
                      <span>{employee.isActive ? '활성' : '비활성'}</span>
                    </div>
                  </button>
                ))}
                {!isLoading && filteredEmployees.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    조건에 맞는 직원이 없습니다.
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

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
              로그인 ID는 사무소 코드 기준으로 자동 발급됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="이름"
              value={createForm.name ?? ''}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, name: value }))}
            />
            <StaticField label="발급 예정 ID" value={loginPreview} />
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
      <Card>
        <CardContent className="flex min-h-[540px] items-center justify-center text-sm text-muted-foreground">
          직원을 선택하면 상세 정보가 표시됩니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-h-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle>{employee.name}</CardTitle>
              <Badge className={cn('border-0', roleMeta[employee.role]?.className)}>
                {roleMeta[employee.role]?.label ?? employee.role}
              </Badge>
              <Badge variant={employee.isActive ? 'secondary' : 'destructive'}>
                {employee.isActive ? '활성' : '비활성'}
              </Badge>
            </div>
            <CardDescription>{employee.loginId}</CardDescription>
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
      </CardHeader>

      <CardContent className="grid min-h-0 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricTile label="진행 업무" value={`${employee.counts.activeTaskCount}건`} />
            <MetricTile label="진행 거래" value={`${employee.counts.activeDealCount}건`} />
            <MetricTile
              label="담당 고객"
              value={`${employee.counts.activeBuyerRequirementCount}건`}
            />
            <MetricTile
              label="미정산 참여"
              value={`${employee.counts.unsettledDealCount}건`}
            />
          </div>

          {performance ? (
            <div className="grid gap-3 md:grid-cols-2">
              <MetricTile label="누적 상담" value={`${performance.consultationCount}건`} />
              <MetricTile
                label="참여 수수료"
                value={
                  performance.commissionAmountTotal
                    ? formatPrice(performance.commissionAmountTotal)
                    : '-'
                }
              />
            </div>
          ) : null}

          <Card className="gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-base">기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 px-5 md:grid-cols-2">
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
            </CardContent>
          </Card>

          <Card className="gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-base">비밀번호 초기화</CardTitle>
              <CardDescription>초기 비밀번호를 즉시 다시 발급합니다.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-5 md:flex-row">
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
            </CardContent>
          </Card>

          <ListSection
            title="담당 업무"
            items={employee.assignedTasks.map((task) => ({
              id: task.id,
              title: task.title,
              description: `${task.status} · ${task.priority}${task.dueDate ? ` · ${formatDate(task.dueDate)}` : ''}`,
            }))}
            emptyMessage="담당 업무가 없습니다."
          />

          <ListSection
            title="담당 고객/요구조건"
            items={employee.assignedBuyerRequirements.map((requirement) => ({
              id: requirement.id,
              title: requirement.contact?.name ?? '고객',
              description: `${requirement.status}${requirement.nextContactDate ? ` · 다음 연락 ${formatDate(requirement.nextContactDate)}` : ''}`,
            }))}
            emptyMessage="담당 고객이 없습니다."
          />
        </div>

        <div className="space-y-4">
          <ListSection
            title="거래 참여/배분"
            items={employee.dealParticipants.map((participant) => ({
              id: participant.id,
              title: participant.deal.property?.site?.name ?? '거래',
              description: `${participant.role} · ${participant.side} · ${participant.settlementStatus}${participant.commissionAmount ? ` · ${formatPrice(participant.commissionAmount)}` : ''}`,
            }))}
            emptyMessage="참여 중인 거래가 없습니다."
          />

          <ListSection
            title="최근 상담"
            items={employee.recentConsultations.map((consultation) => ({
              id: consultation.id,
              title: consultation.contact?.name ?? consultation.type,
              description: `${consultation.type} · ${formatDateTime(consultation.createdAt)} · ${consultation.content}`,
            }))}
            emptyMessage="최근 상담이 없습니다."
          />

          <ListSection
            title="최근 활동"
            items={employee.recentActivities.map((activity) => ({
              id: activity.id,
              title: `${activity.entityType} ${activity.action}`,
              description: `${activity.source} · ${formatDateTime(activity.createdAt)}${activity.reason ? ` · ${activity.reason}` : ''}`,
            }))}
            emptyMessage="최근 활동 로그가 없습니다."
          />

          <Card className="gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-base">사무소 배분 정책</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-5 text-sm">
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
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

function ListSection({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: Array<{ id: string; title: string; description: string }>;
  emptyMessage: string;
}) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-5">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/60 px-3 py-3">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
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

function getNextLoginPreview(officeCode: string | undefined, employees: Employee[]) {
  if (!officeCode) return '-';

  const prefix = `${officeCode.toLowerCase()}-`;
  const maxIndex =
    employees.reduce((maxValue, employee) => {
      if (!employee.loginId.startsWith(prefix)) return maxValue;
      const nextValue = Number.parseInt(employee.loginId.slice(prefix.length), 10);
      return Number.isFinite(nextValue) ? Math.max(maxValue, nextValue) : maxValue;
    }, 0) + 1;

  return `${prefix}${String(maxIndex).padStart(4, '0')}`;
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
