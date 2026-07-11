import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Globe,
  RotateCw,
  Save,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { USER_LICENSE_TYPE_LABELS } from '@estate-erp/shared';
import {
  changeLocale,
  currentLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@/i18n';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { PageHeader } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AiAgentCard } from './-ai-agent-card';
import { ExpenseSummaryCard } from './-expense-summary-card';
import { McpApiKeyCard } from './-mcp-card';
import { ContractTemplatesCard } from './-templates-card';

type CommissionConfigForm = {
  distributionType: string;
  defaultAgentRate: string;
  listingAgentRate: string;
  buyingAgentRate: string;
  dualAgentRate: string;
  managerRate: string;
  closerBonus: string;
};

type OfficeForm = {
  name: string;
  licenseNo: string;
  ceoName: string;
  phone: string;
  address: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: '대표',
  manager: '매니저',
  agent: '중개사',
};

const SUBSCRIPTION_LABELS: Record<string, string> = {
  free: '무료',
  basic: '기본',
  pro: '프로',
  premium: '프리미엄',
};

export const Route = createFileRoute('/_authenticated/settings/')({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role === 'owner' || user?.role === 'manager';
  const { t } = useTranslation('settings');
  const [locale, setLocale] = useState<SupportedLocale>(currentLocale());
  const handleLocaleChange = (next: SupportedLocale) => {
    setLocale(next);
    changeLocale(next);
  };

  const {
    data: office,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['office-profile'],
    queryFn: () => api.offices.getMe(),
  });

  const [officeForm, setOfficeForm] = useState<OfficeForm>({
    name: '',
    licenseNo: '',
    ceoName: '',
    phone: '',
    address: '',
  });
  const [commissionForm, setCommissionForm] = useState<CommissionConfigForm>({
    distributionType: 'percentage',
    defaultAgentRate: '50',
    listingAgentRate: '50',
    buyingAgentRate: '50',
    dualAgentRate: '70',
    managerRate: '10',
    closerBonus: '0',
  });

  useEffect(() => {
    if (!office) return;

    setOfficeForm({
      name: office.name ?? '',
      licenseNo: office.licenseNo ?? '',
      ceoName: office.ceoName ?? '',
      phone: office.phone ?? '',
      address: office.address ?? '',
    });

    const config = normalizeCommissionConfig(office.commissionConfig);
    setCommissionForm({
      distributionType: config.distributionType,
      defaultAgentRate: String(config.defaultAgentRate),
      listingAgentRate: String(config.listingAgentRate),
      buyingAgentRate: String(config.buyingAgentRate),
      dualAgentRate: String(config.dualAgentRate),
      managerRate: String(config.managerRate),
      closerBonus: String(config.closerBonus),
    });
  }, [office]);

  const updateOfficeMutation = useMutation({
    mutationFn: () =>
      api.offices.updateMe({
        name: officeForm.name.trim(),
        licenseNo: emptyToNull(officeForm.licenseNo),
        ceoName: emptyToNull(officeForm.ceoName),
        phone: emptyToNull(officeForm.phone),
        address: emptyToNull(officeForm.address),
      }),
    onSuccess: () => {
      toast.success('사무소 정보를 저장했습니다.');
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : '사무소 정보 저장에 실패했습니다.',
      ),
  });

  const updateCommissionMutation = useMutation({
    mutationFn: () =>
      api.offices.updateCommissionConfig({
        distributionType: commissionForm.distributionType,
        defaultAgentRate: Number(commissionForm.defaultAgentRate),
        listingAgentRate: Number(commissionForm.listingAgentRate),
        buyingAgentRate: Number(commissionForm.buyingAgentRate),
        dualAgentRate: Number(commissionForm.dualAgentRate),
        managerRate: Number(commissionForm.managerRate),
        closerBonus: Number(commissionForm.closerBonus),
      }),
    onSuccess: () => {
      toast.success('수수료 배분 규칙을 저장했습니다.');
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : '배분 규칙 저장에 실패했습니다.',
      ),
  });

  const handleCommissionSave = () => {
    const invalid = validateCommissionForm(commissionForm);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    updateCommissionMutation.mutate();
  };

  /** 내 계정 — office.users에서 현재 사용자 행을 찾아 전화/자격 구분 보강 */
  const myProfile = useMemo(
    () => office?.users.find((member) => member.id === user?.id) ?? null,
    [office, user?.id],
  );

  const metrics = useMemo(() => {
    if (!office) return [];

    return [
      { label: '활성 직원', value: `${office.counts.activeUsers}명`, icon: Users },
      { label: '매니저 수', value: `${office.counts.managers}명`, icon: ShieldCheck },
      {
        label: '플랜',
        value: SUBSCRIPTION_LABELS[office.subscription] ?? office.subscription,
        icon: Building2,
      },
    ];
  }, [office]);

  const metricCards = isLoading
    ? Array.from({ length: 3 }, (_, index) => ({
        key: `placeholder-${index}`,
        label: '불러오는 중',
        value: '-',
        icon: Building2,
      }))
    : metrics.map((metric) => ({ key: metric.label, ...metric }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="설정"
        description="사무소 기본 정보와 수수료·템플릿·AI 운영 정책을 관리합니다."
        actions={!canEdit ? <Badge variant="secondary">읽기 전용</Badge> : undefined}
        className="mb-0"
      />

      {isError ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              사무소 정보를 불러오지 못했습니다. 아직 사무소가 없다면 온보딩에서 먼저
              사무소를 생성해 주세요.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RotateCw className="size-3.5" />
              다시 시도
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {metricCards.map((metric) => (
          <Card key={metric.key} className="gap-3 py-4">
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

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>사무소 정보</CardTitle>
            <CardDescription>
              대표 정보와 기본 연락처를 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field
              label="사무소명"
              value={officeForm.name}
              onChange={(value) => setOfficeForm((prev) => ({ ...prev, name: value }))}
              disabled={!canEdit}
              required
            />
            <Field
              label="대표명"
              value={officeForm.ceoName}
              onChange={(value) => setOfficeForm((prev) => ({ ...prev, ceoName: value }))}
              disabled={!canEdit}
            />
            <Field
              label="등록번호"
              value={officeForm.licenseNo}
              onChange={(value) => setOfficeForm((prev) => ({ ...prev, licenseNo: value }))}
              disabled={!canEdit}
            />
            <Field
              label="대표 전화"
              value={officeForm.phone}
              onChange={(value) => setOfficeForm((prev) => ({ ...prev, phone: value }))}
              disabled={!canEdit}
            />
            <StaticField
              label="최대 사용자"
              value={office ? `${office.maxUsers}명` : '-'}
            />
            <div className="md:col-span-2">
              <Field
                label="주소"
                value={officeForm.address}
                onChange={(value) => setOfficeForm((prev) => ({ ...prev, address: value }))}
                disabled={!canEdit}
              />
            </div>
          </CardContent>
          <div className="flex justify-end px-6 pb-6">
            <Button
              onClick={() => updateOfficeMutation.mutate()}
              disabled={!canEdit || updateOfficeMutation.isPending || !officeForm.name.trim()}
            >
              <Save className="size-4" />
              {updateOfficeMutation.isPending ? '저장 중…' : '기본 정보 저장'}
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4" />내 계정
              </CardTitle>
              <CardDescription>현재 로그인한 계정 정보입니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <SummaryRow label="이름" value={user?.name ?? '-'} />
              <SummaryRow label="로그인 ID" value={user?.loginId ?? '-'} />
              <SummaryRow label="이메일" value={user?.email ?? '-'} />
              <SummaryRow
                label="전화"
                value={myProfile?.phone ? formatPhone(myProfile.phone) : '-'}
              />
              <SummaryRow
                label="역할"
                value={user ? (ROLE_LABELS[user.role] ?? user.role) : '-'}
              />
              <SummaryRow
                label="자격 구분"
                value={
                  myProfile?.licenseType
                    ? (USER_LICENSE_TYPE_LABELS as Record<string, string>)[
                        myProfile.licenseType
                      ] ?? myProfile.licenseType
                    : '미지정'
                }
              />
              {myProfile?.licenseType === 'assistant' ? (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                  중개보조원은 계약서에 서명할 수 없는 신분입니다. 계약 체결은
                  개업·소속공인중개사가 진행해야 합니다.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <CardTitle>운영 요약</CardTitle>
                  <CardDescription>계정 상태와 팀 구성을 확인합니다.</CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/employees">
                    직원 관리
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <SummaryRow label="대표(Owner)" value={office?.owner?.name ?? '-'} />
              <SummaryRow
                label="전체 직원"
                value={office ? `${office.counts.totalUsers}명` : '-'}
              />
              <SummaryRow
                label="활성 계정"
                value={office ? `${office.counts.activeUsers}명` : '-'}
              />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">팀 구성</p>
                <div className="space-y-2">
                  {office?.users.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.licenseType
                            ? ((USER_LICENSE_TYPE_LABELS as Record<string, string>)[
                                member.licenseType
                              ] ?? member.licenseType)
                            : (member.email ??
                              (member.phone ? formatPhone(member.phone) : '연락처 없음'))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {ROLE_LABELS[member.role] ?? member.role}
                        </Badge>
                        <Badge variant={member.isActive ? 'secondary' : 'destructive'}>
                          {member.isActive ? '활성' : '비활성'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>수수료 배분 규칙</CardTitle>
          <CardDescription>
            거래 참여자 기본 배분 기준을 사무소 정책으로 저장합니다. 각 비율은 해당 측
            수수료에서 직원이 가져가는 몫(%)이며 0~100 사이로 입력합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>배분 방식</Label>
            <Select
              value={commissionForm.distributionType}
              onValueChange={(value) =>
                setCommissionForm((prev) => ({ ...prev, distributionType: value }))
              }
              disabled={!canEdit}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="배분 방식 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">비율</SelectItem>
                <SelectItem value="fixed">고정</SelectItem>
                <SelectItem value="custom">커스텀</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumberField
            label="기본 직원 배분율"
            value={commissionForm.defaultAgentRate}
            onChange={(value) =>
              setCommissionForm((prev) => ({ ...prev, defaultAgentRate: value }))
            }
            disabled={!canEdit}
            suffix="%"
          />
          <NumberField
            label="매도측 담당"
            value={commissionForm.listingAgentRate}
            onChange={(value) =>
              setCommissionForm((prev) => ({ ...prev, listingAgentRate: value }))
            }
            disabled={!canEdit}
            suffix="%"
          />
          <NumberField
            label="매수측 담당"
            value={commissionForm.buyingAgentRate}
            onChange={(value) =>
              setCommissionForm((prev) => ({ ...prev, buyingAgentRate: value }))
            }
            disabled={!canEdit}
            suffix="%"
          />
          <NumberField
            label="단독중개 (양측 담당)"
            value={commissionForm.dualAgentRate}
            onChange={(value) =>
              setCommissionForm((prev) => ({ ...prev, dualAgentRate: value }))
            }
            disabled={!canEdit}
            suffix="%"
          />
          <NumberField
            label="매니저 배분"
            value={commissionForm.managerRate}
            onChange={(value) =>
              setCommissionForm((prev) => ({ ...prev, managerRate: value }))
            }
            disabled={!canEdit}
            suffix="%"
          />
          <NumberField
            label="마감 보너스"
            value={commissionForm.closerBonus}
            onChange={(value) =>
              setCommissionForm((prev) => ({ ...prev, closerBonus: value }))
            }
            disabled={!canEdit}
            suffix="%"
          />
        </CardContent>
        <div className="flex justify-end px-6 pb-6">
          <Button
            onClick={handleCommissionSave}
            disabled={!canEdit || updateCommissionMutation.isPending}
          >
            <Save className="size-4" />
            {updateCommissionMutation.isPending ? '저장 중…' : '배분 규칙 저장'}
          </Button>
        </div>
      </Card>

      <ContractTemplatesCard canEdit={canEdit} />

      <ExpenseSummaryCard />

      <AiAgentCard office={office} canEdit={canEdit} />

      <McpApiKeyCard canEdit={canEdit} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4" />
            {t('sections.language')}
          </CardTitle>
          <CardDescription>{t('sections.languageDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex max-w-xs items-center gap-2">
            <Select value={locale} onValueChange={(v) => handleLocaleChange(v as SupportedLocale)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {t(`languageOptions.${l}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  suffix: string;
}) {
  const parsed = Number(value);
  const invalid =
    value.trim() === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > 100;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={invalid}
          className={invalid ? 'border-destructive pr-12' : 'pr-12'}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
      {invalid ? (
        <p className="text-[11px] text-destructive">0~100 사이 숫자를 입력하세요.</p>
      ) : null}
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

const COMMISSION_RATE_FIELDS: { key: keyof CommissionConfigForm; label: string }[] = [
  { key: 'defaultAgentRate', label: '기본 직원 배분율' },
  { key: 'listingAgentRate', label: '매도측 담당' },
  { key: 'buyingAgentRate', label: '매수측 담당' },
  { key: 'dualAgentRate', label: '단독중개' },
  { key: 'managerRate', label: '매니저 배분' },
  { key: 'closerBonus', label: '마감 보너스' },
];

/** 0~100 범위 검증. 통과 시 null, 실패 시 에러 메시지 반환 */
function validateCommissionForm(form: CommissionConfigForm): string | null {
  for (const field of COMMISSION_RATE_FIELDS) {
    const raw = form[field.key].trim();
    const parsed = Number(raw);
    if (raw === '' || !Number.isFinite(parsed)) {
      return `${field.label} 값을 숫자로 입력하세요.`;
    }
    if (parsed < 0 || parsed > 100) {
      return `${field.label}은(는) 0~100 사이로 입력하세요.`;
    }
  }
  return null;
}

function normalizeCommissionConfig(raw: unknown) {
  const config =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

  return {
    distributionType: getString(config.distributionType, 'percentage'),
    defaultAgentRate: getNumber(config.defaultAgentRate, 50),
    listingAgentRate: getNumber(config.listingAgentRate, 50),
    buyingAgentRate: getNumber(config.buyingAgentRate, 50),
    dualAgentRate: getNumber(config.dualAgentRate, 70),
    managerRate: getNumber(config.managerRate, 10),
    closerBonus: getNumber(config.closerBonus, 0),
  };
}

function getString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
