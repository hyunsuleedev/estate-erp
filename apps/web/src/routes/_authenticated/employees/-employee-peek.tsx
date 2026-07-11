import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AtSign,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Hash,
  KeyRound,
  MoreHorizontal,
  Percent,
  Phone,
  RotateCw,
  Shield,
  UserRound,
  UserRoundX,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { EmployeeDetail } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatMoney, formatPhone } from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { getStatusMeta } from '@/lib/status-config';
import { ConfirmDialog } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LICENSE_TYPE_LABELS,
  NONE_VALUE,
  PersonAvatar,
  TagChip,
  avatarTone,
  buyerStatusLabels,
  emptyToNull,
  getCommissionNumber,
  getErrorMessage,
  participantRoleLabels,
  participantSideLabels,
  payTypeLabels,
  roleMeta,
  settlementLabels,
  taskPriorityLabels,
} from './-employee-shared';

interface FormState {
  name: string;
  phone: string;
  email: string;
  licenseType: string;
  licenseNo: string;
  payType: string;
  baseSalary: string;
  commissionRate: string;
}

function toFormState(detail: EmployeeDetail): FormState {
  return {
    name: detail.name ?? '',
    phone: detail.phone ?? '',
    email: detail.email ?? '',
    licenseType: detail.licenseType ?? '',
    licenseNo: detail.licenseNo ?? '',
    payType: detail.payType ?? 'mixed',
    baseSalary: detail.baseSalary != null ? String(detail.baseSalary) : '',
    commissionRate: detail.commissionRate != null ? String(detail.commissionRate) : '',
  };
}

export function EmployeePeek({
  employeeId,
  open,
  onClose,
  canManage,
  actorRole,
}: {
  employeeId: string | null;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  actorRole: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const {
    data: detail,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => api.employees.findOne(employeeId as string),
    enabled: !!employeeId && open,
  });

  const { data: performance } = useQuery({
    queryKey: ['employee-performance', employeeId],
    queryFn: () => api.employees.getPerformance(employeeId as string),
    enabled: !!employeeId && open,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (detail) setForm(toFormState(detail));
  }, [detail]);

  const isDirty = useMemo(() => {
    if (!detail || !form) return false;
    const base = toFormState(detail);
    return (Object.keys(base) as Array<keyof FormState>).some(
      (key) => base[key] !== form[key],
    );
  }, [detail, form]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
    queryClient.invalidateQueries({ queryKey: ['employee-performance', employeeId] });
  };

  const updateMutation = useMutation({
    mutationFn: (payload: FormState) =>
      api.employees.update(employeeId as string, {
        name: payload.name.trim(),
        phone: emptyToNull(payload.phone),
        email: emptyToNull(payload.email),
        licenseType: payload.licenseType || null,
        licenseNo: emptyToNull(payload.licenseNo),
        payType: payload.payType,
        baseSalary: payload.baseSalary.trim() === '' ? null : Number(payload.baseSalary),
        commissionRate:
          payload.commissionRate.trim() === '' ? null : Number(payload.commissionRate),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('직원 정보가 저장되었습니다.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const roleMutation = useMutation({
    mutationFn: (role: string) => api.employees.updateRole(employeeId as string, role),
    onSuccess: (_, role) => {
      invalidate();
      setPendingRole(null);
      toast.success(`역할이 '${roleMeta[role]?.label ?? role}'(으)로 변경되었습니다.`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      api.employees.updateStatus(employeeId as string, isActive),
    onSuccess: (_, isActive) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      setStatusConfirmOpen(false);
      toast.success(isActive ? '계정이 재활성화되었습니다.' : '계정이 비활성화되었습니다.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const passwordMutation = useMutation({
    mutationFn: (password: string) =>
      api.employees.resetPassword(employeeId as string, password),
    onSuccess: (result) => {
      setNewPassword('');
      setPasswordDialogOpen(false);
      toast.success(result.message ?? '비밀번호가 재설정되었습니다. 직원에게 전달하세요.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const isSaving =
    updateMutation.isPending ||
    roleMutation.isPending ||
    statusMutation.isPending ||
    passwordMutation.isPending;

  const handleSave = () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast.error('이름을 입력하세요.');
      return;
    }
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
    updateMutation.mutate(form);
  };

  // manager는 agent만 관리 가능. owner는 owner 승계까지 가능.
  const roleOptions = actorRole === 'owner' ? ['agent', 'manager', 'owner'] : ['agent'];
  const roleSelectDisabled =
    !canManage || (actorRole === 'manager' && detail != null && detail.role !== 'agent');

  const statusWarnings = useMemo(() => {
    if (!detail || !detail.isActive) return [];
    const warnings: string[] = [];
    if (detail.role === 'owner') {
      warnings.push(
        '대표(owner) 계정입니다. 사무소의 마지막 대표 계정은 비활성화할 수 없습니다.',
      );
    }
    const { activeTaskCount, activeDealCount } = detail.counts;
    if (activeTaskCount > 0 || activeDealCount > 0) {
      warnings.push(
        `진행 중 업무 ${activeTaskCount}건 · 거래 ${activeDealCount}건이 있습니다. 비활성화 전에 다른 직원에게 인계하세요.`,
      );
    }
    return warnings;
  }, [detail]);

  const latestActivityAt = detail?.recentActivities[0]?.createdAt ?? null;

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]"
      >
        {isLoading || !form || !detail ? (
          isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <SheetTitle className="text-sm font-normal text-muted-foreground">
                직원 상세 정보를 불러오지 못했습니다.
              </SheetTitle>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RotateCw className="size-4" />
                다시 시도
              </Button>
            </div>
          ) : (
            <div className="space-y-4 p-8">
              <SheetTitle className="sr-only">직원 상세</SheetTitle>
              <div className="flex items-center gap-4">
                <Skeleton className="size-14 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          )
        ) : (
          <>
            {/* 헤더 — Notion 페이지 헤더처럼 큰 아바타 + 제목 */}
            <div className="border-b px-8 pb-5 pt-8">
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    'flex size-14 select-none items-center justify-center rounded-lg text-2xl font-semibold',
                    avatarTone(detail.name),
                  )}
                >
                  {detail.name.charAt(0)}
                </span>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        disabled={!canManage}
                        onSelect={() => setPasswordDialogOpen(true)}
                      >
                        <KeyRound className="size-4" />
                        비밀번호 재설정
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!canManage}
                        variant={detail.isActive ? 'destructive' : 'default'}
                        onSelect={() => setStatusConfirmOpen(true)}
                      >
                        {detail.isActive ? (
                          <UserRoundX className="size-4" />
                        ) : (
                          <UserRound className="size-4" />
                        )}
                        {detail.isActive ? '계정 비활성화' : '계정 재활성화'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <SheetTitle asChild>
                <h2 className="mt-3 truncate text-2xl font-bold tracking-tight">
                  {form.name || detail.name}
                </h2>
              </SheetTitle>
              <SheetDescription asChild>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                  <TagChip tone={cn(roleMeta[detail.role]?.soft, roleMeta[detail.role]?.text)}>
                    {roleMeta[detail.role]?.label ?? detail.role}
                  </TagChip>
                  <TagChip
                    tone={
                      detail.isActive
                        ? 'bg-success-soft text-success'
                        : 'bg-neutral-soft text-muted-foreground'
                    }
                  >
                    {detail.isActive ? '활성' : '비활성'}
                  </TagChip>
                  {detail.licenseType ? (
                    <TagChip>
                      {LICENSE_TYPE_LABELS[detail.licenseType] ?? detail.licenseType}
                    </TagChip>
                  ) : null}
                  {detail.licenseType === 'assistant' ? (
                    <TagChip tone="bg-warning-soft text-warning">계약서 서명 불가</TagChip>
                  ) : null}
                </div>
              </SheetDescription>

              {/* 요약 스탯 — 문서 속 인라인 숫자처럼 */}
              <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-6">
                <PeekStat label="진행 업무" value={detail.counts.activeTaskCount} />
                <PeekStat label="진행 거래" value={detail.counts.activeDealCount} />
                <PeekStat label="담당 고객" value={detail.counts.activeBuyerRequirementCount} />
                <PeekStat
                  label="미정산"
                  value={detail.counts.unsettledDealCount}
                  emphasize={detail.counts.unsettledDealCount > 0}
                />
                <PeekStat label="누적 상담" value={performance?.consultationCount ?? '—'} />
                <PeekStat
                  label="수수료 합계"
                  value={
                    performance ? formatMoney(performance.commissionAmountTotal) : '—'
                  }
                  small
                />
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="px-8 py-5">
                {/* 속성 목록 — Notion property rows */}
                <div className="space-y-0.5">
                  <PropertyRow icon={Hash} label="로그인 ID">
                    <ReadonlyValue>{detail.loginId}</ReadonlyValue>
                  </PropertyRow>
                  <PropertyRow icon={UserRound} label="이름">
                    <GhostInput
                      value={form.name}
                      onChange={(value) => setForm({ ...form, name: value })}
                      disabled={!canManage}
                      placeholder="이름"
                    />
                  </PropertyRow>
                  <PropertyRow icon={Shield} label="역할">
                    <Select
                      value={detail.role}
                      onValueChange={(value) => {
                        if (value !== detail.role) setPendingRole(value);
                      }}
                      disabled={roleSelectDisabled}
                    >
                      <SelectTrigger size="sm" className={ghostTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(roleOptions.includes(detail.role)
                          ? roleOptions
                          : [...roleOptions, detail.role]
                        ).map((role) => (
                          <SelectItem key={role} value={role}>
                            {roleMeta[role]?.label ?? role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </PropertyRow>
                  <PropertyRow icon={Phone} label="휴대폰">
                    <GhostInput
                      value={form.phone}
                      onChange={(value) => setForm({ ...form, phone: value })}
                      disabled={!canManage}
                      placeholder="비어 있음"
                      displayValue={form.phone ? formatPhone(form.phone) : undefined}
                    />
                  </PropertyRow>
                  <PropertyRow icon={AtSign} label="이메일">
                    <GhostInput
                      value={form.email}
                      onChange={(value) => setForm({ ...form, email: value })}
                      disabled={!canManage}
                      placeholder="비어 있음"
                    />
                  </PropertyRow>
                  <PropertyRow icon={BadgeCheck} label="자격 구분">
                    <Select
                      value={form.licenseType || NONE_VALUE}
                      onValueChange={(value) =>
                        setForm({ ...form, licenseType: value === NONE_VALUE ? '' : value })
                      }
                      disabled={!canManage}
                    >
                      <SelectTrigger size="sm" className={ghostTriggerClass}>
                        <SelectValue placeholder="미지정" />
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
                  </PropertyRow>
                  <PropertyRow icon={Hash} label="자격/등록 번호">
                    <GhostInput
                      value={form.licenseNo}
                      onChange={(value) => setForm({ ...form, licenseNo: value })}
                      disabled={!canManage}
                      placeholder="비어 있음"
                    />
                  </PropertyRow>
                  <PropertyRow icon={Wallet} label="급여 유형">
                    <Select
                      value={form.payType}
                      onValueChange={(value) => setForm({ ...form, payType: value })}
                      disabled={!canManage}
                    >
                      <SelectTrigger size="sm" className={ghostTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(payTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </PropertyRow>
                  <PropertyRow icon={CircleDollarSign} label="월 기본급">
                    <GhostInput
                      type="number"
                      value={form.baseSalary}
                      onChange={(value) => setForm({ ...form, baseSalary: value })}
                      disabled={!canManage || form.payType === 'commission_only'}
                      placeholder={form.payType === 'commission_only' ? '수수료제' : '예: 250 (만원)'}
                      suffix={form.baseSalary ? '만원' : undefined}
                    />
                  </PropertyRow>
                  <PropertyRow icon={Percent} label="개인 배분율">
                    <GhostInput
                      type="number"
                      value={form.commissionRate}
                      onChange={(value) => setForm({ ...form, commissionRate: value })}
                      disabled={!canManage || form.payType === 'fixed'}
                      placeholder={form.payType === 'fixed' ? '고정급' : '비우면 사무소 기본'}
                      suffix={form.commissionRate ? '%' : undefined}
                    />
                  </PropertyRow>
                  <PropertyRow icon={CalendarDays} label="생성일">
                    <ReadonlyValue>{formatDate(detail.createdAt)}</ReadonlyValue>
                  </PropertyRow>
                  <PropertyRow icon={Activity} label="최근 활동">
                    <ReadonlyValue>
                      {latestActivityAt ? timeAgo(latestActivityAt) : '없음'}
                    </ReadonlyValue>
                  </PropertyRow>
                </div>

                <div className="my-5 border-t" />

                {/* 연결 목록 — Notion 토글 섹션 */}
                <PeekSection
                  icon={BriefcaseBusiness}
                  title="거래 참여/배분"
                  count={detail.dealParticipants.length}
                  defaultOpen
                  action={
                    <Button variant="ghost" size="xs" asChild className="text-muted-foreground">
                      <Link to="/cashflow/employee-settlements">
                        정산 현황
                        <ChevronRight className="size-3" />
                      </Link>
                    </Button>
                  }
                >
                  {detail.dealParticipants.length === 0 ? (
                    <PeekEmpty>참여 중인 거래가 없습니다.</PeekEmpty>
                  ) : (
                    detail.dealParticipants.map((participant) => (
                      <PeekListItem
                        key={participant.id}
                        title={
                          participant.deal.listing?.property?.site?.name ??
                          participant.deal.property?.site?.name ??
                          '거래'
                        }
                        meta={[
                          participantRoleLabels[participant.role] ?? participant.role,
                          participantSideLabels[participant.side] ?? participant.side,
                          settlementLabels[participant.settlementStatus] ??
                            participant.settlementStatus,
                          participant.commissionAmount
                            ? formatMoney(participant.commissionAmount)
                            : null,
                        ]}
                        highlight={participant.settlementStatus === 'unsettled'}
                        onClick={() => navigate({ to: '/deals' })}
                      />
                    ))
                  )}
                </PeekSection>

                <PeekSection
                  icon={ClipboardList}
                  title="담당 업무"
                  count={detail.assignedTasks.length}
                  defaultOpen
                >
                  {detail.assignedTasks.length === 0 ? (
                    <PeekEmpty>담당 업무가 없습니다.</PeekEmpty>
                  ) : (
                    detail.assignedTasks.map((task) => (
                      <PeekListItem
                        key={task.id}
                        title={task.title}
                        meta={[
                          getStatusMeta('taskStatus', task.status).label,
                          taskPriorityLabels[task.priority] ?? task.priority,
                          task.dueDate ? formatDate(task.dueDate) : null,
                        ]}
                        onClick={() => navigate({ to: '/tasks' })}
                      />
                    ))
                  )}
                </PeekSection>

                <PeekSection
                  icon={Users}
                  title="담당 고객"
                  count={detail.assignedBuyerRequirements.length}
                >
                  {detail.assignedBuyerRequirements.length === 0 ? (
                    <PeekEmpty>담당 고객이 없습니다.</PeekEmpty>
                  ) : (
                    detail.assignedBuyerRequirements.map((requirement) => (
                      <PeekListItem
                        key={requirement.id}
                        title={requirement.contact?.name ?? '고객'}
                        meta={[
                          buyerStatusLabels[requirement.status] ?? requirement.status,
                          requirement.nextContactDate
                            ? `다음 연락 ${formatDate(requirement.nextContactDate)}`
                            : null,
                        ]}
                        onClick={() =>
                          navigate({
                            to: '/buyer-requirements/$id',
                            params: { id: requirement.id },
                          })
                        }
                      />
                    ))
                  )}
                </PeekSection>

                <PeekSection
                  icon={CalendarDays}
                  title="최근 상담"
                  count={detail.recentConsultations.length}
                >
                  {detail.recentConsultations.length === 0 ? (
                    <PeekEmpty>최근 상담이 없습니다.</PeekEmpty>
                  ) : (
                    detail.recentConsultations.map((consultation) => (
                      <PeekListItem
                        key={consultation.id}
                        title={consultation.contact?.name ?? consultation.type}
                        meta={[
                          consultation.type,
                          formatDateTime(consultation.createdAt),
                          consultation.content,
                        ]}
                        onClick={() => navigate({ to: '/consultations' })}
                      />
                    ))
                  )}
                </PeekSection>

                <PeekSection
                  icon={Activity}
                  title="활동 로그"
                  count={detail.recentActivities.length}
                >
                  {detail.recentActivities.length === 0 ? (
                    <PeekEmpty>최근 활동 로그가 없습니다.</PeekEmpty>
                  ) : (
                    detail.recentActivities.map((activity) => (
                      <PeekListItem
                        key={activity.id}
                        title={`${activity.entityType} ${activity.action}`}
                        meta={[
                          activity.source,
                          formatDateTime(activity.createdAt),
                          activity.reason,
                        ]}
                      />
                    ))
                  )}
                </PeekSection>

                <PeekSection icon={CircleDollarSign} title="사무소 배분 정책">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 py-1">
                    {(
                      [
                        ['기본 직원 배분', 'defaultAgentRate', 50, '%'],
                        ['매도측 담당', 'listingAgentRate', 50, '%'],
                        ['매수측 담당', 'buyingAgentRate', 50, '%'],
                        ['단독중개', 'dualAgentRate', 70, '%'],
                        ['관리자 배분', 'managerRate', 10, '%'],
                        ['마감 보너스', 'closerBonus', 0, '만원'],
                      ] as const
                    ).map(([label, key, fallback, unit]) => (
                      <div
                        key={key}
                        className="flex items-baseline justify-between gap-3 py-1 text-sm"
                      >
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">
                          {getCommissionNumber(detail.office.commissionConfig, key, fallback)}
                          {unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </PeekSection>
              </div>
            </ScrollArea>

            {/* 더티 상태 저장 바 — 변경이 생기면 하단에 떠오른다 */}
            <div
              className={cn(
                'flex items-center justify-between gap-3 border-t bg-background px-8 py-3 transition-all',
                isDirty ? 'translate-y-0 opacity-100' : 'hidden',
              )}
            >
              <p className="text-xs text-muted-foreground">저장되지 않은 변경사항이 있습니다.</p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => detail && setForm(toFormState(detail))}
                >
                  되돌리기
                </Button>
                <Button size="sm" disabled={isSaving || !canManage} onClick={handleSave}>
                  저장
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>

      <ConfirmDialog
        open={pendingRole !== null}
        onOpenChange={(next) => {
          if (!next) setPendingRole(null);
        }}
        title="역할 변경"
        description={
          pendingRole && detail
            ? `${detail.name}님의 역할을 '${roleMeta[pendingRole]?.label ?? pendingRole}'(으)로 변경합니다. 접근 권한이 즉시 변경됩니다.${
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
        open={statusConfirmOpen}
        onOpenChange={setStatusConfirmOpen}
        title={detail?.isActive ? '계정 비활성화' : '계정 재활성화'}
        destructive={detail?.isActive}
        description={
          detail?.isActive ? (
            <span className="space-y-1.5">
              <span className="block">
                {detail.name}님 계정을 비활성화하면 더 이상 로그인할 수 없습니다.
              </span>
              {statusWarnings.map((warning) => (
                <span key={warning} className="block text-destructive">
                  {warning}
                </span>
              ))}
            </span>
          ) : detail ? (
            `${detail.name}님 계정을 재활성화하면 즉시 로그인과 업무 배정이 가능해집니다.`
          ) : undefined
        }
        confirmLabel={detail?.isActive ? '비활성화' : '재활성화'}
        loading={statusMutation.isPending}
        onConfirm={() => {
          if (detail) statusMutation.mutate(!detail.isActive);
        }}
      />

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>비밀번호 재설정</DialogTitle>
            <DialogDescription>
              {detail?.name}님의 초기 비밀번호를 즉시 다시 발급합니다. 새 비밀번호를 직원에게
              직접 전달하세요.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="새 비밀번호"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPasswordDialogOpen(false)}
              disabled={passwordMutation.isPending}
            >
              취소
            </Button>
            <Button
              onClick={() => passwordMutation.mutate(newPassword)}
              disabled={!newPassword.trim() || passwordMutation.isPending}
            >
              <KeyRound className="size-4" />
              재설정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

/* ---------- 내부 프리젠테이션 컴포넌트 ---------- */

const ghostTriggerClass =
  'w-full border-transparent bg-transparent px-2 shadow-none hover:bg-muted/70 focus-visible:border-input data-[state=open]:bg-muted/70';

function PropertyRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-2">
      <span className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
        <Icon className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function GhostInput({
  value,
  onChange,
  disabled,
  placeholder,
  type = 'text',
  suffix,
  displayValue,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  suffix?: string;
  displayValue?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <Input
        type={type}
        value={focused || displayValue == null ? value : displayValue}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          'h-8 border-transparent bg-transparent px-2 shadow-none',
          'hover:bg-muted/70 focus-visible:bg-background disabled:hover:bg-transparent',
          suffix && 'pr-12',
        )}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function ReadonlyValue({ children }: { children: ReactNode }) {
  return <p className="truncate px-2 py-1.5 text-sm">{children}</p>;
}

function PeekStat({
  label,
  value,
  emphasize,
  small,
}: {
  label: string;
  value: number | string;
  emphasize?: boolean;
  small?: boolean;
}) {
  return (
    <div className="bg-background px-3 py-2.5">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate font-semibold tabular-nums tracking-tight',
          small ? 'text-sm leading-6' : 'text-base',
          emphasize && 'text-warning',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PeekSection({
  icon: Icon,
  title,
  count,
  defaultOpen,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/section -mx-2">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-muted/70">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-90" />
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{title}</span>
          {count != null ? (
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
        </CollapsibleTrigger>
        {action}
      </div>
      <CollapsibleContent className="px-2 pb-2 pl-7">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function PeekListItem({
  title,
  meta,
  highlight,
  onClick,
}: {
  title: string;
  meta: Array<string | null | undefined>;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const metaText = meta.filter(Boolean).join(' · ');
  const content = (
    <>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm">{title}</span>
        {highlight ? <TagChip tone="bg-warning-soft text-warning">미정산</TagChip> : null}
      </span>
      {metaText ? (
        <span className="truncate text-xs text-muted-foreground">{metaText}</span>
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className="flex flex-col gap-0.5 rounded-md px-2 py-1.5">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/70"
    >
      {content}
    </button>
  );
}

function PeekEmpty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-2 text-sm text-muted-foreground/80">{children}</p>;
}
