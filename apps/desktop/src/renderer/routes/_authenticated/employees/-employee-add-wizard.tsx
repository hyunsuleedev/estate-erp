import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatPhoneWhileTyping } from '@/lib/phone';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  LICENSE_TYPE_LABELS,
  PAY_TYPE_LABELS,
  ROLE_LABELS,
  getErrorMessage,
} from './-employee-shared';
import { SplitRatioMeter } from './-employee-work-sections';

interface WizardDraft {
  name: string;
  loginId: string;
  password: string;
  phone: string;
  email: string;
  role: string;
  licenseType: string;
  licenseNo: string;
  payType: string;
  baseSalary: string;
  commissionRate: string;
  employmentType: string;
  withholdTax: boolean;
}

function createInitialDraft(): WizardDraft {
  return {
    name: '',
    loginId: '',
    password: '',
    phone: '',
    email: '',
    role: 'agent',
    licenseType: 'broker_associate',
    licenseNo: '',
    payType: 'commission_only',
    baseSalary: '',
    commissionRate: '',
    employmentType: 'freelancer',
    withholdTax: true,
  };
}

/** 2단계 새 직원 추가 마법사 (1단계 계정·연락처 → 2단계 역할·자격·보상) */
export function EmployeeAddWizard({
  open,
  onOpenChange,
  actorRole,
  activeCount,
  maxUsers,
  defaultAgentRate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorRole: string;
  activeCount: number;
  maxUsers: number | null;
  defaultAgentRate: number;
  onCreated: (employeeId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<WizardDraft>(createInitialDraft);

  useEffect(() => {
    if (open) {
      setStep(1);
      setDraft(createInitialDraft());
    }
  }, [open]);

  const isOwner = actorRole === 'owner';
  const roleOptions = isOwner ? ['agent', 'manager'] : ['agent'];
  const isSeatFull = maxUsers != null && activeCount >= maxUsers;
  const step1Valid = Boolean(
    draft.name.trim() && draft.loginId.trim() && draft.password.trim(),
  );

  const patch = (next: Partial<WizardDraft>) =>
    setDraft((prev) => ({ ...prev, ...next }));

  const createMutation = useMutation({
    mutationFn: async (values: WizardDraft) => {
      const created = await api.employees.create({
        name: values.name.trim(),
        loginId: values.loginId.trim(),
        password: values.password,
        phone: values.phone.trim() || undefined,
        email: values.email.trim() || undefined,
        role: values.role,
        licenseType: values.licenseType || null,
        licenseNo: values.licenseNo.trim() || null,
      });

      if (!isOwner) {
        return { created, payError: null as unknown };
      }

      try {
        await api.employees.update(created.id, {
          payType: values.payType,
          baseSalary:
            values.baseSalary.trim() === '' ? null : Number(values.baseSalary),
          commissionRate:
            values.commissionRate.trim() === ''
              ? null
              : Number(values.commissionRate),
          employmentType: values.employmentType,
          withholdTax: values.withholdTax,
        });
        return { created, payError: null as unknown };
      } catch (payError) {
        return { created, payError };
      }
    },
    onSuccess: ({ created, payError }) => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      onOpenChange(false);
      onCreated(created.id);
      if (payError) {
        toast.warning(
          `${created.name}님 계정은 생성되었으나 급여 설정을 저장하지 못했습니다. 인사·급여 탭에서 다시 저장해 주세요.`,
        );
      } else {
        toast.success(`${created.name}님 계정이 생성되었습니다.`);
      }
    },
    onError: (error) => {
      toast.error(
        getErrorMessage(
          error,
          '직원 계정을 만들지 못했습니다. 다시 시도해 주세요.',
        ),
      );
    },
  });

  const handleFinish = () => {
    if (isSeatFull || createMutation.isPending) return;
    if (isOwner) {
      if (draft.baseSalary.trim() !== '') {
        const baseSalary = Number(draft.baseSalary);
        if (!Number.isInteger(baseSalary) || baseSalary < 0) {
          toast.error('기본급은 0 이상의 정수(만원)로 입력하세요.');
          return;
        }
      }
      if (draft.commissionRate.trim() !== '') {
        const rate = Number(draft.commissionRate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          toast.error('수수료 배분율은 0~100 사이로 입력하세요.');
          return;
        }
      }
    }
    createMutation.mutate(draft);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && createMutation.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-employees-wizard
        className="rounded-2xl border-[var(--emp-line)] bg-[var(--emp-surface)] p-6 sm:max-w-[560px]"
      >
        <DialogHeader>
          <DialogTitle className="text-[17px] font-bold tracking-[-0.015em] text-[var(--emp-ink)]">
            새 직원 추가
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[var(--emp-ink-2)]">
            계정 생성과 역할{isOwner ? '·보상' : '·자격'} 조건을 순서대로
            설정합니다 (
            <span className="emp-num">
              {maxUsers != null ? `${activeCount}/${maxUsers}석 사용 중` : `${activeCount}명 활성`}
            </span>
            ).
          </DialogDescription>
        </DialogHeader>

        {isSeatFull ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[10px] bg-[var(--emp-red-soft)] px-3 py-2.5 text-[12.5px] leading-5 text-[var(--emp-red-strong)]"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              최대 사용자 수({maxUsers}명)에 도달했습니다. 기존 직원을 비활성화하거나
              요금제를 올린 뒤 추가하세요.
            </span>
          </div>
        ) : null}

        <div className="emp-wizard-steps" aria-label="생성 단계">
          <div
            className={cn(
              'emp-wizard-step',
              step === 1 ? 'is-active' : 'is-done',
            )}
          >
            <span className="emp-wizard-num">
              {step > 1 ? <Check className="size-3" aria-hidden="true" /> : '1'}
            </span>
            <span>계정 및 연락처</span>
          </div>
          <div className={cn('emp-wizard-step', step === 2 && 'is-active')}>
            <span className="emp-wizard-num">2</span>
            <span>역할 · 자격{isOwner ? ' · 보상' : ''}</span>
          </div>
        </div>

        {step === 1 ? (
          <div className="emp-form-grid-2">
            <div className="emp-field">
              <label htmlFor="emp-wiz-name">
                이름 <span className="text-[var(--emp-red)]">*</span>
              </label>
              <input
                id="emp-wiz-name"
                className="emp-f-input"
                autoComplete="name"
                placeholder="예: 홍길동"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </div>
            <div className="emp-field">
              <label htmlFor="emp-wiz-login">
                로그인 ID <span className="text-[var(--emp-red)]">*</span>
              </label>
              <input
                id="emp-wiz-login"
                className="emp-f-input"
                autoComplete="username"
                placeholder="예: gd.hong"
                value={draft.loginId}
                onChange={(event) => patch({ loginId: event.target.value })}
              />
            </div>
            <div className="emp-field">
              <label htmlFor="emp-wiz-pw">
                초기 비밀번호 <span className="text-[var(--emp-red)]">*</span>
              </label>
              <input
                id="emp-wiz-pw"
                type="password"
                className="emp-f-input"
                autoComplete="new-password"
                placeholder="8자 이상 영문·숫자 조합"
                value={draft.password}
                onChange={(event) => patch({ password: event.target.value })}
              />
            </div>
            <div className="emp-field">
              <label htmlFor="emp-wiz-phone">휴대폰</label>
              <input
                id="emp-wiz-phone"
                type="tel"
                className="emp-f-input emp-num"
                autoComplete="tel"
                placeholder="010-0000-0000"
                value={draft.phone}
                onChange={(event) =>
                  patch({ phone: formatPhoneWhileTyping(event.target.value) })
                }
              />
            </div>
            <div className="emp-field span-2">
              <label htmlFor="emp-wiz-email">이메일</label>
              <input
                id="emp-wiz-email"
                type="email"
                className="emp-f-input"
                autoComplete="email"
                placeholder="name@office.kr"
                value={draft.email}
                onChange={(event) => patch({ email: event.target.value })}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="emp-form-grid-2">
              <div className="emp-field">
                <label htmlFor="emp-wiz-role">역할</label>
                <select
                  id="emp-wiz-role"
                  aria-label="새 직원 역할"
                  className="emp-f-select"
                  value={draft.role}
                  onChange={(event) => patch({ role: event.target.value })}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role] ?? role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="emp-field">
                <label htmlFor="emp-wiz-license-type">자격 구분</label>
                <select
                  id="emp-wiz-license-type"
                  aria-label="새 직원 자격 구분"
                  className="emp-f-select"
                  value={draft.licenseType}
                  onChange={(event) => patch({ licenseType: event.target.value })}
                >
                  <option value="">미지정</option>
                  {Object.entries(LICENSE_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {draft.licenseType === 'assistant' ? (
                  <span className="text-[11.5px] text-[var(--emp-amber)]">
                    중개보조원은 계약서에 서명할 수 없습니다.
                  </span>
                ) : null}
              </div>
              <div className="emp-field span-2">
                <label htmlFor="emp-wiz-license-no">자격증/등록 번호</label>
                <input
                  id="emp-wiz-license-no"
                  className="emp-f-input"
                  placeholder="선택 입력"
                  value={draft.licenseNo}
                  onChange={(event) => patch({ licenseNo: event.target.value })}
                />
              </div>
            </div>

            {isOwner ? (
              <>
                <SplitRatioMeter
                  payType={draft.payType}
                  commissionRateInput={draft.commissionRate}
                  defaultAgentRate={defaultAgentRate}
                />
                <div className="emp-form-grid-2">
                  <div className="emp-field">
                    <label htmlFor="emp-wiz-pay-type">급여 유형</label>
                    <select
                      id="emp-wiz-pay-type"
                      className="emp-f-select"
                      value={draft.payType}
                      onChange={(event) => patch({ payType: event.target.value })}
                    >
                      {Object.entries(PAY_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="emp-field">
                    <label htmlFor="emp-wiz-rate">개인 배분율 (%)</label>
                    <input
                      id="emp-wiz-rate"
                      type="number"
                      min={0}
                      max={100}
                      className="emp-f-input emp-num"
                      placeholder={
                        draft.payType === 'fixed'
                          ? '고정급'
                          : `비우면 사무소 기준 (${defaultAgentRate}%)`
                      }
                      value={draft.commissionRate}
                      onChange={(event) =>
                        patch({ commissionRate: event.target.value })
                      }
                      disabled={draft.payType === 'fixed'}
                    />
                  </div>
                  <div className="emp-field">
                    <label htmlFor="emp-wiz-base">월 기본급 (만원)</label>
                    <input
                      id="emp-wiz-base"
                      type="number"
                      min={0}
                      className="emp-f-input emp-num"
                      placeholder={
                        draft.payType === 'commission_only'
                          ? '수수료제'
                          : '예: 200'
                      }
                      value={draft.baseSalary}
                      onChange={(event) =>
                        patch({ baseSalary: event.target.value })
                      }
                      disabled={draft.payType === 'commission_only'}
                    />
                  </div>
                  <div className="emp-field">
                    <label htmlFor="emp-wiz-emp-type">정산 구분</label>
                    <select
                      id="emp-wiz-emp-type"
                      className="emp-f-select"
                      value={draft.employmentType}
                      onChange={(event) => {
                        const employmentType = event.target.value;
                        patch({
                          employmentType,
                          withholdTax: employmentType === 'freelancer',
                        });
                      }}
                    >
                      <option value="freelancer">프리랜서</option>
                      <option value="employee">근로자</option>
                    </select>
                  </div>

                  {draft.employmentType === 'freelancer' ? (
                    <div className="emp-field span-2">
                      <label htmlFor="emp-wiz-withhold">3.3% 원천징수 공제</label>
                      <div className="flex min-h-[34px] items-center gap-2.5">
                        <Switch
                          id="emp-wiz-withhold"
                          checked={draft.withholdTax}
                          onCheckedChange={(checked) =>
                            patch({ withholdTax: checked })
                          }
                        />
                        <span className="text-[13px] text-[var(--emp-ink)]">
                          {draft.withholdTax
                            ? '3.3%를 떼고 지급합니다'
                            : '떼지 않고 전액 지급합니다'}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={createMutation.isPending}
              className="emp-btn-soft emp-pressable"
            >
              이전 단계
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
              className="emp-btn-soft emp-pressable"
            >
              닫기
            </button>
            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!step1Valid}
                className="emp-btn-blue emp-pressable"
              >
                다음 단계
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={isSeatFull || createMutation.isPending}
                className="emp-btn-blue emp-pressable"
              >
                {createMutation.isPending ? '생성 중…' : '직원 생성'}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
