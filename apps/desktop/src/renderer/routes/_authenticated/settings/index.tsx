import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Building2, Save, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
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

export const Route = createFileRoute('/_authenticated/settings/')({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role === 'owner' || user?.role === 'manager';

  const { data: office, isLoading } = useQuery({
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
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const updateCommissionMutation = useMutation({
    mutationFn: () =>
      api.offices.updateCommissionConfig({
        distributionType: commissionForm.distributionType,
        defaultAgentRate: toNumber(commissionForm.defaultAgentRate, 50),
        listingAgentRate: toNumber(commissionForm.listingAgentRate, 50),
        buyingAgentRate: toNumber(commissionForm.buyingAgentRate, 50),
        dualAgentRate: toNumber(commissionForm.dualAgentRate, 70),
        managerRate: toNumber(commissionForm.managerRate, 10),
        closerBonus: toNumber(commissionForm.closerBonus, 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
    },
  });

  const metrics = useMemo(() => {
    if (!office) return [];

    return [
      { label: '사무소 코드', value: office.code, icon: Building2 },
      { label: '활성 직원', value: `${office.counts.activeUsers}명`, icon: Users },
      { label: '매니저 수', value: `${office.counts.managers}명`, icon: ShieldCheck },
      { label: '플랜', value: office.subscription, icon: Building2 },
    ];
  }, [office]);

  const metricCards = isLoading
    ? Array.from({ length: 4 }, (_, index) => ({
        key: `placeholder-${index}`,
        label: '불러오는 중',
        value: '-',
        icon: Building2,
      }))
    : metrics.map((metric) => ({ key: metric.label, ...metric }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">설정</h1>
            {office ? <Badge variant="outline">{office.code}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            사무소 기본 정보와 수수료 배분 규칙을 관리합니다.
          </p>
        </div>
        {!canEdit ? (
          <Badge variant="secondary">읽기 전용</Badge>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              대표 정보와 운영 식별값을 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field
              label="사무소명"
              value={officeForm.name}
              onChange={(value) => setOfficeForm((prev) => ({ ...prev, name: value }))}
              disabled={!canEdit}
            />
            <StaticField label="사무소 코드" value={office?.code ?? '-'} />
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
              기본 정보 저장
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>운영 요약</CardTitle>
            <CardDescription>
              현재 계정 상태와 소유자 정보를 빠르게 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryRow label="Owner" value={office?.owner?.name ?? '-'} />
            <SummaryRow label="Owner 이메일" value={office?.owner?.email ?? '-'} />
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
                        {member.email ?? member.phone ?? '연락처 없음'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{member.role}</Badge>
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

      <Card>
        <CardHeader>
          <CardTitle>수수료 배분 규칙</CardTitle>
          <CardDescription>
            거래 참여자 기본 배분 기준을 사무소 정책으로 저장합니다.
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
            label="단독중개"
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
            suffix="만원"
          />
        </CardContent>
        <div className="flex justify-end px-6 pb-6">
          <Button
            onClick={() => updateCommissionMutation.mutate()}
            disabled={!canEdit || updateCommissionMutation.isPending}
          >
            <Save className="size-4" />
            배분 규칙 저장
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
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
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="pr-12"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
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

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
