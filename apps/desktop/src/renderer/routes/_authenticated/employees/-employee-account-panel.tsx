import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { EmployeeDetail } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatPhoneWhileTyping } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/domain';
import { Switch } from '@/components/ui/switch';
import {
  LICENSE_TYPE_LABELS,
  PAY_TYPE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  getCommissionNumber,
  getErrorMessage,
} from './-employee-shared';
import { SplitRatioMeter } from './-employee-work-sections';

interface AccountForm {
  name: string;
  phone: string;
  email: string;
  licenseType: string;
  licenseNo: string;
  payType: string;
  baseSalary: string;
  commissionRate: string;
  employmentType: string;
  withholdTax: boolean;
}

function toAccountForm(detail: EmployeeDetail): AccountForm {
  return {
    name: detail.name ?? '',
    phone: detail.phone ? formatPhoneWhileTyping(detail.phone) : '',
    email: detail.email ?? '',
    licenseType: detail.licenseType ?? '',
    licenseNo: detail.licenseNo ?? '',
    payType: detail.payType ?? 'mixed',
    baseSalary: detail.baseSalary != null ? String(detail.baseSalary) : '',
    commissionRate:
      detail.commissionRate != null ? String(detail.commissionRate) : '',
    employmentType: detail.employmentType ?? 'freelancer',
    withholdTax: detail.withholdTax ?? true,
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** 직원관리 통합 인사·급여·권한/보안 편집 패널 */
export function EmployeeAccountPanel({
  detail,
  actorRole,
  actorId,
}: {
  detail: EmployeeDetail;
  actorRole: string;
  actorId: string | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AccountForm>(() => toAccountForm(detail));
  const [newPassword, setNewPassword] = useState('');
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);

  useEffect(() => {
    setForm(toAccountForm(detail));
  }, [detail]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
    void queryClient.invalidateQueries({ queryKey: ['employee', detail.id] });
    void queryClient.invalidateQueries({
      queryKey: ['employee-performance', detail.id],
    });
  };

  // 매니저는 중개사 계정만 수정 가능, 급여와 배분율은 대표만 조회/수정 가능
  const canEdit =
    actorRole === 'owner' ||
    (actorRole === 'manager' && detail.role === 'agent');
  const canEditPay = actorRole === 'owner';
  const showPay = Boolean(detail.payVisible && detail.role !== 'owner');
  const canChangeRole = actorRole === 'owner' && detail.id !== actorId;
  const canSeeSecurity = actorRole === 'owner' || actorRole === 'manager';

  const defaultAgentRate = getCommissionNumber(
    detail.office.commissionConfig,
    'defaultAgentRate',
    50,
  );
  const listingAgentRate = getCommissionNumber(
    detail.office.commissionConfig,
    'listingAgentRate',
    50,
  );
  const buyingAgentRate = getCommissionNumber(
    detail.office.commissionConfig,
    'buyingAgentRate',
    50,
  );
  const dualAgentRate = getCommissionNumber(
    detail.office.commissionConfig,
    'dualAgentRate',
    70,
  );

  const updateMutation = useMutation({
    mutationFn: (values: AccountForm) =>
      api.employees.update(detail.id, {
        name: values.name.trim(),
        phone: emptyToNull(values.phone),
        email: emptyToNull(values.email),
        licenseType: values.licenseType || null,
        licenseNo: emptyToNull(values.licenseNo),
        // 급여·배분 필드는 대표가 저장할 때만 전송한다(서버도 매니저·중개사 요청 차단)
        ...(canEditPay && showPay
          ? {
              payType: values.payType,
              baseSalary:
                values.baseSalary.trim() === '' ? null : Number(values.baseSalary),
              commissionRate:
                values.commissionRate.trim() === ''
                  ? null
                  : Number(values.commissionRate),
              employmentType: values.employmentType,
              withholdTax: values.withholdTax,
            }
          : {}),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('직원 정보가 저장되었습니다.');
    },
    onError: (error) =>
      toast.error(
        getErrorMessage(error, '직원 정보를 저장하지 못했습니다. 다시 시도해 주세요.'),
      ),
  });

  const roleMutation = useMutation({
    mutationFn: (role: string) => api.employees.updateRole(detail.id, role),
    onSuccess: (_, role) => {
      invalidate();
      setPendingRole(null);
      toast.success(
        `역할이 '${ROLE_LABELS[role] ?? role}'(으)로 변경되었습니다.`,
      );
    },
    onError: (error) =>
      toast.error(
        getErrorMessage(error, '역할을 바꾸지 못했습니다. 다시 시도해 주세요.'),
      ),
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      api.employees.updateStatus(detail.id, isActive),
    onSuccess: (_, isActive) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      setIsStatusConfirmOpen(false);
      toast.success(
        isActive ? '계정이 재활성화되었습니다.' : '계정이 비활성화되었습니다.',
      );
    },
    onError: (error) =>
      toast.error(
        getErrorMessage(
          error,
          '계정 상태를 바꾸지 못했습니다. 다시 시도해 주세요.',
        ),
      ),
  });

  const passwordMutation = useMutation({
    mutationFn: (password: string) =>
      api.employees.resetPassword(detail.id, password),
    onSuccess: (result) => {
      setNewPassword('');
      toast.success(
        result.message ?? '비밀번호가 재설정되었습니다. 직원에게 전달하세요.',
      );
    },
    onError: (error) =>
      toast.error(
        getErrorMessage(
          error,
          '비밀번호를 재설정하지 못했습니다. 다시 시도해 주세요.',
        ),
      ),
  });

  const saved = toAccountForm(detail);
  const isDirty = (Object.keys(saved) as Array<keyof AccountForm>).some(
    (key) => saved[key] !== form[key],
  );
  const patchForm = (patch: Partial<AccountForm>) =>
    setForm((prev) => ({ ...prev, ...patch }));

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

  const roleOptions =
    actorRole === 'owner' ? ['agent', 'manager', 'owner'] : [detail.role];

  const statusWarnings: string[] = [];
  if (detail.isActive) {
    if (detail.role === 'owner') {
      statusWarnings.push(
        '대표 계정입니다. 사무소의 마지막 대표 계정은 비활성화할 수 없습니다.',
      );
    }
    const { activeTaskCount, activeDealCount } = detail.counts;
    if (activeTaskCount > 0 || activeDealCount > 0) {
      statusWarnings.push(
        `진행 중 업무 ${activeTaskCount}건 · 거래 ${activeDealCount}건이 있습니다. 비활성화 전에 다른 구성원에게 인계하세요.`,
      );
    }
  }

  return (
    <div data-employee-account className="flex flex-col gap-3.5">
      {!canEdit ? (
        <div className="rounded-[11px] border border-[var(--emp-line)] bg-[var(--emp-surface)] px-3.5 py-3 text-[12.5px] text-[var(--emp-ink-2)]">
          {actorRole === 'agent'
            ? '본인 계정 정보는 읽기 전용입니다. 정보 수정이 필요하면 대표나 매니저에게 요청하세요.'
            : '매니저는 중개사 계정만 수정할 수 있습니다. 이 계정은 대표가 관리합니다.'}
        </div>
      ) : null}

      {/* 기본 · 중개 자격 */}
      <section className="emp-card-block">
        <div className="emp-card-block-head">
          <h3 className="emp-card-block-title">기본 · 중개 자격</h3>
          <span className="text-xs text-[var(--emp-ink-3)]">
            로그인 ID는 변경할 수 없습니다
          </span>
        </div>
        <div className="emp-card-block-body">
          <div className="emp-form-grid-2">
            <div className="emp-field">
              <label htmlFor={`emp-name-${detail.id}`}>
                이름 <span className="text-[var(--emp-red)]">*</span>
              </label>
              <input
                id={`emp-name-${detail.id}`}
                className="emp-f-input"
                autoComplete="name"
                value={form.name}
                onChange={(event) => patchForm({ name: event.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="emp-field">
              <label>로그인 ID</label>
              <div className="emp-f-readonly">{detail.loginId}</div>
            </div>
            <div className="emp-field">
              <label htmlFor={`emp-phone-${detail.id}`}>휴대폰</label>
              <input
                id={`emp-phone-${detail.id}`}
                type="tel"
                className="emp-f-input emp-num"
                autoComplete="tel"
                placeholder="010-0000-0000"
                value={form.phone}
                onChange={(event) =>
                  patchForm({ phone: formatPhoneWhileTyping(event.target.value) })
                }
                disabled={!canEdit}
              />
            </div>
            <div className="emp-field">
              <label htmlFor={`emp-email-${detail.id}`}>이메일</label>
              <input
                id={`emp-email-${detail.id}`}
                type="email"
                className="emp-f-input"
                autoComplete="email"
                value={form.email}
                onChange={(event) => patchForm({ email: event.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="emp-field">
              <label htmlFor={`emp-license-type-${detail.id}`}>자격 구분</label>
              <select
                id={`emp-license-type-${detail.id}`}
                aria-label="자격 구분"
                className="emp-f-select"
                value={form.licenseType}
                onChange={(event) =>
                  patchForm({ licenseType: event.target.value })
                }
                disabled={!canEdit}
              >
                <option value="">미지정</option>
                {Object.entries(LICENSE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {form.licenseType === 'assistant' ? (
                <span className="text-[11.5px] text-[var(--emp-amber)]">
                  중개보조원은 계약서에 서명할 수 없습니다.
                </span>
              ) : null}
            </div>
            <div className="emp-field">
              <label htmlFor={`emp-license-no-${detail.id}`}>
                자격증/등록 번호
              </label>
              <input
                id={`emp-license-no-${detail.id}`}
                className="emp-f-input"
                value={form.licenseNo}
                onChange={(event) => patchForm({ licenseNo: event.target.value })}
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 급여 · 수수료 배분 (대표 또는 본인, 대표 계정 제외) */}
      {showPay ? (
        <section className="emp-card-block" aria-label="급여와 배분">
          <div className="emp-card-block-head">
            <h3 className="emp-card-block-title">급여 · 수수료 배분</h3>
            <span className="text-xs text-[var(--emp-ink-3)]">
              {canEditPay ? '대표만 열람 및 변경 가능' : '본인 열람 전용'}
            </span>
          </div>
          <div className="emp-card-block-body flex flex-col gap-3.5">
            <SplitRatioMeter
              payType={form.payType}
              commissionRateInput={form.commissionRate}
              defaultAgentRate={defaultAgentRate}
            />

            <div className="emp-form-grid-2">
              <div className="emp-field">
                <label htmlFor={`emp-pay-type-${detail.id}`}>급여 유형</label>
                <select
                  id={`emp-pay-type-${detail.id}`}
                  aria-label="급여 유형"
                  className="emp-f-select"
                  value={form.payType}
                  onChange={(event) => patchForm({ payType: event.target.value })}
                  disabled={!canEditPay}
                >
                  {Object.entries(PAY_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="emp-field">
                <label htmlFor={`emp-base-salary-${detail.id}`}>
                  월 기본급 (만원)
                </label>
                <input
                  id={`emp-base-salary-${detail.id}`}
                  type="number"
                  min={0}
                  className="emp-f-input emp-num"
                  placeholder={
                    form.payType === 'commission_only' ? '수수료제' : '예: 250'
                  }
                  value={form.baseSalary}
                  onChange={(event) =>
                    patchForm({ baseSalary: event.target.value })
                  }
                  disabled={!canEditPay || form.payType === 'commission_only'}
                />
              </div>
              <div className="emp-field">
                <label htmlFor={`emp-rate-${detail.id}`}>개인 배분율 (%)</label>
                <input
                  id={`emp-rate-${detail.id}`}
                  type="number"
                  min={0}
                  max={100}
                  className="emp-f-input emp-num"
                  placeholder={
                    form.payType === 'fixed' ? '고정급' : '비우면 사무소 기준'
                  }
                  value={form.commissionRate}
                  onChange={(event) =>
                    patchForm({ commissionRate: event.target.value })
                  }
                  disabled={!canEditPay || form.payType === 'fixed'}
                />
              </div>
              <div className="emp-field">
                <label htmlFor={`emp-employment-type-${detail.id}`}>
                  정산 구분
                </label>
                <select
                  id={`emp-employment-type-${detail.id}`}
                  aria-label="정산 구분"
                  className="emp-f-select"
                  value={form.employmentType}
                  onChange={(event) =>
                    patchForm({ employmentType: event.target.value })
                  }
                  disabled={!canEditPay}
                >
                  <option value="freelancer">프리랜서</option>
                  <option value="employee">근로자</option>
                </select>
              </div>

              <div className="emp-field span-2">
                <label htmlFor={`emp-withhold-${detail.id}`}>
                  3.3% 원천징수 공제
                </label>
                {form.employmentType === 'employee' ? (
                  <p className="py-1 text-[12.5px] text-[var(--emp-ink-2)]">
                    근로자는 성과급까지만 계산하고, 기본급과 세금·4대보험은 급여에서 처리합니다.
                  </p>
                ) : (
                  <>
                    <div className="flex min-h-[34px] items-center gap-2.5">
                      <Switch
                        id={`emp-withhold-${detail.id}`}
                        checked={form.withholdTax}
                        onCheckedChange={(checked) =>
                          patchForm({ withholdTax: checked })
                        }
                        disabled={!canEditPay}
                      />
                      <span className="text-[13px] text-[var(--emp-ink)]">
                        {form.withholdTax
                          ? '3.3%를 떼고 지급합니다'
                          : '떼지 않고 전액 지급합니다'}
                      </span>
                    </div>
                    {!form.withholdTax ? (
                      <span className="text-[11.5px] text-[var(--emp-amber)]">
                        세무사용 목록에는 공제 안 함으로 표시되고, 원천징수 신고는 사무소가 따로 챙겨야 합니다.
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <div className="emp-num flex flex-wrap items-center justify-between gap-2 border-t border-[var(--emp-line-soft)] pt-2.5 text-xs text-[var(--emp-ink-3)]">
              <span>
                사무소 기준: 기본 {defaultAgentRate}% · 매도측 {listingAgentRate}% ·
                매수측 {buyingAgentRate}% · 단독중개 {dualAgentRate}%
              </span>
              {canEditPay ? (
                <Link
                  to="/settings"
                  search={{ section: 'commission' }}
                  className="font-medium text-[var(--emp-blue-hover)] hover:underline"
                >
                  사무소 기준 설정
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* 변경사항 저장 바 */}
      {canEdit ? (
        <div className="emp-save-bar">
          <div
            aria-live="polite"
            className="flex items-center gap-2 text-[13px]"
          >
            <span
              className={cn(
                'emp-pill',
                isDirty ? 'emp-pill-blue' : 'emp-pill-emerald',
              )}
            >
              {isDirty ? '수정됨' : '저장됨'}
            </span>
            <span
              className={
                isDirty
                  ? 'font-semibold text-[var(--emp-ink)]'
                  : 'text-[var(--emp-ink-3)]'
              }
            >
              {updateMutation.isPending
                ? '변경사항을 저장하는 중입니다…'
                : isDirty
                  ? '저장하지 않은 변경사항이 있습니다.'
                  : '모든 변경사항이 저장되었습니다.'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || updateMutation.isPending}
            className="emp-btn-blue emp-pressable"
            style={{ height: 34 }}
          >
            <Save className="size-3.5" aria-hidden="true" />
            <span>{updateMutation.isPending ? '저장 중…' : '변경사항 저장'}</span>
          </button>
        </div>
      ) : null}

      {/* 권한 · 보안 (대표·매니저 전용) */}
      {canSeeSecurity ? (
        <section className="emp-card-block" aria-label="권한과 보안">
          <div className="emp-card-block-head">
            <h3 className="emp-card-block-title">권한 · 보안</h3>
            <span className="text-xs text-[var(--emp-ink-3)]">
              변경 시 즉시 적용됩니다
            </span>
          </div>
          <div className="emp-card-block-body">
            <div className="emp-ctrl-row">
              <div className="min-w-[190px] flex-1">
                <div className="text-[13px] font-semibold">역할</div>
                <div className="mt-0.5 text-xs text-[var(--emp-ink-3)]">
                  {ROLE_DESCRIPTIONS[detail.role] ?? '이 계정의 권한 범위입니다.'}
                </div>
              </div>
              <select
                aria-label="직원 역할"
                className="emp-f-select"
                style={{ width: 130 }}
                value={detail.role}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next !== detail.role) setPendingRole(next);
                }}
                disabled={!canChangeRole || roleMutation.isPending}
              >
                {(roleOptions.includes(detail.role)
                  ? roleOptions
                  : [...roleOptions, detail.role]
                ).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role] ?? role}
                  </option>
                ))}
              </select>
            </div>

            <div className="emp-ctrl-row">
              <div className="min-w-[190px] flex-1">
                <div className="text-[13px] font-semibold">비밀번호 재설정</div>
                <div className="mt-0.5 text-xs text-[var(--emp-ink-3)]">
                  새 비밀번호를 발급하면 기존 로그인 세션은 모두 끊깁니다.
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  autoComplete="new-password"
                  aria-label="새 비밀번호"
                  placeholder="새 비밀번호"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={!canEdit || passwordMutation.isPending}
                  className="emp-f-input"
                  style={{ width: 155, height: 33 }}
                />
                <button
                  type="button"
                  onClick={() => passwordMutation.mutate(newPassword)}
                  disabled={
                    !canEdit || !newPassword.trim() || passwordMutation.isPending
                  }
                  className="emp-btn-soft emp-pressable"
                  style={{ height: 33 }}
                >
                  <KeyRound className="size-3.5" aria-hidden="true" />
                  <span>재설정</span>
                </button>
              </div>
            </div>

            <div className="emp-ctrl-row">
              <div className="min-w-[190px] flex-1">
                <div className="text-[13px] font-semibold">
                  {detail.isActive ? '계정 비활성화' : '계정 재활성화'}
                </div>
                <div className="mt-0.5 text-xs text-[var(--emp-ink-3)]">
                  {detail.isActive
                    ? '비활성화하면 로그인할 수 없고 계정 수에서 빠집니다. 기록은 남습니다.'
                    : '다시 로그인하고 업무를 맡을 수 있게 됩니다.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStatusConfirmOpen(true)}
                disabled={!canEdit || statusMutation.isPending}
                className={cn(
                  'emp-btn-soft emp-pressable',
                  detail.isActive && 'is-danger',
                )}
                style={{ height: 33 }}
              >
                {detail.isActive ? '비활성화' : '재활성화'}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={pendingRole !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRole(null);
        }}
        title="역할 변경"
        description={
          pendingRole
            ? `${detail.name}님의 역할을 '${
                ROLE_LABELS[pendingRole] ?? pendingRole
              }'(으)로 변경합니다. 접근 권한이 즉시 변경됩니다.${
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
        title={detail.isActive ? '계정 비활성화' : '계정 재활성화'}
        destructive={detail.isActive}
        description={
          detail.isActive ? (
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
          ) : (
            `${detail.name}님 계정을 재활성화하면 즉시 로그인과 업무 배정이 가능해집니다.`
          )
        }
        confirmLabel={detail.isActive ? '비활성화' : '재활성화'}
        loading={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate(!detail.isActive)}
      />
    </div>
  );
}
