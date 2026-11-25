import type {
  OfficePostalAddress,
  OfficeProfile,
} from '@estate-erp/api-client';
import { OfficeAddressField } from '@/components/office-address-field';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Handshake,
  KeyRound,
  LockKeyhole,
  RotateCw,
  Search,
  UserRound,
  Users,
  X,
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
import { apiErrorMessage } from '@/lib/api-error';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { TeamSettings } from './-team-settings';
import { ContractTemplatesCard } from './-templates-card';
import { McpApiKeyCard } from './-mcp-card';
import { PartnerBrokersSettingsCard } from './-partner-brokers-card';

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
  postalAddress: OfficePostalAddress | null;
  naverVerificationId: string;
};

type SettingsSectionId =
  | 'account'
  | 'office'
  | 'team'
  | 'commission'
  | 'partners'
  | 'templates'
  | 'connections';

type SettingsSection = {
  id: SettingsSectionId;
  group: '개인' | '사무소 운영' | '연결';
  label: string;
  description: string;
  keywords: string;
  icon: ComponentType<{ className?: string }>;
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'account',
    group: '개인',
    label: '계정 및 언어',
    description: '내 프로필과 표시 언어',
    keywords: '내 계정 프로필 이름 로그인 아이디 이메일 전화 역할 자격 언어 한국어 영어',
    icon: UserRound,
  },
  {
    id: 'office',
    group: '사무소 운영',
    label: '사무소 정보',
    description: '대표 정보와 팀 관리',
    keywords: '사무소 상호 대표 등록번호 전화 주소 플랜 구독',
    icon: Building2,
  },
  {
    id: 'team',
    group: '사무소 운영',
    label: '직원 및 권한',
    description: '계정, 역할, 급여와 비밀번호',
    keywords: '직원 계정 추가 역할 권한 대표 매니저 중개사 자격 급여 기본급 배분율 비밀번호 재설정 비활성화 슬롯',
    icon: Users,
  },
  {
    id: 'commission',
    group: '사무소 운영',
    label: '수수료 배분',
    description: '거래 참여자 기본 배분',
    keywords: '수수료 배분 비율 매도 매수 단독중개 관리자 마감 보너스 정산',
    icon: CircleDollarSign,
  },
  {
    id: 'partners',
    group: '사무소 운영',
    label: '공동중개 파트너',
    description: '파트너 사무소 주소록',
    keywords: '파트너 공동중개 중개사무소 상대 사무소 주소록 협력 부동산 수수료 나누기',
    icon: Handshake,
  },
  {
    id: 'templates',
    group: '사무소 운영',
    label: '계약서 서식',
    description: '특약 문구와 인쇄 서식',
    keywords: '계약서 템플릿 특약 조항 확인설명 인쇄 표지 영수증 정산서',
    icon: FileText,
  },
  {
    id: 'connections',
    group: '연결',
    label: '외부 연결',
    description: '네이버와 외부 AI 연결',
    keywords: '네이버 광고 실명 인증 아이디 MCP API 키 Claude ChatGPT 커넥터 Codex AI 외부 연결 CP 자동화',
    icon: KeyRound,
  },
];

const SETTINGS_GROUPS: SettingsSection['group'][] = [
  '개인',
  '사무소 운영',
  '연결',
];
const LAST_SECTION_KEY = 'estate-erp:settings:v1:last-section';

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

const EMPTY_OFFICE_FORM: OfficeForm = {
  name: '',
  licenseNo: '',
  ceoName: '',
  phone: '',
  address: '',
  postalAddress: null,
  naverVerificationId: '',
};

const DEFAULT_COMMISSION_FORM: CommissionConfigForm = {
  distributionType: 'percentage',
  defaultAgentRate: '50',
  listingAgentRate: '50',
  buyingAgentRate: '50',
  dualAgentRate: '70',
  managerRate: '10',
  closerBonus: '0',
};

interface SettingsSearch {
  /** 열 항목. 다른 화면에서 설정의 특정 항목으로 바로 올 때 쓴다 (예: 직원관리 → 직원 및 권한) */
  section?: SettingsSectionId;
}

export const Route = createFileRoute('/_authenticated/settings/')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    section: SETTINGS_SECTIONS.some((item) => item.id === search.section)
      ? (search.section as SettingsSectionId)
      : undefined,
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, refresh: refreshAuthUser } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation('settings');
  const canEditOffice = user?.role === 'owner' || user?.role === 'manager';
  const hydratedOfficeVersion = useRef<string | null>(null);
  const contentScrollRef = useRef<HTMLElement | null>(null);

  const { section: requestedSection } = Route.useSearch();
  const navigateSettings = Route.useNavigate();
  // 직원 계정은 대표와 매니저만 관리한다. 중개사에게는 항목 자체를 보이지 않는다.
  const canManageTeam = user?.role === 'owner' || user?.role === 'manager';
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => {
    if (requestedSection) return requestedSection;
    const saved = localStorage.getItem(LAST_SECTION_KEY);
    return SETTINGS_SECTIONS.some((section) => section.id === saved)
      ? (saved as SettingsSectionId)
      : 'account';
  });
  // 설정이 이미 열린 채로 다른 화면에서 특정 항목을 가리키며 들어온 경우
  useEffect(() => {
    if (requestedSection) setActiveSection(requestedSection);
  }, [requestedSection]);
  // 권한이 없는 사람이 저장된 값이나 주소로 직원 항목에 들어오면 내 계정으로 돌린다
  useEffect(() => {
    if (activeSection === 'team' && user && !canManageTeam) setActiveSection('account');
  }, [activeSection, canManageTeam, user]);
  const [searchQuery, setSearchQuery] = useState('');
  const [locale, setLocale] = useState<SupportedLocale>(currentLocale());
  const [officeForm, setOfficeForm] = useState<OfficeForm>(EMPTY_OFFICE_FORM);
  const [commissionForm, setCommissionForm] = useState<CommissionConfigForm>(
    DEFAULT_COMMISSION_FORM,
  );

  const {
    data: office,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['office-profile'],
    queryFn: () => api.offices.getMe(),
  });

  useEffect(() => {
    if (!office || hydratedOfficeVersion.current === office.updatedAt) return;

    hydratedOfficeVersion.current = office.updatedAt;
    setOfficeForm({
      name: office.name ?? '',
      licenseNo: office.licenseNo ?? '',
      ceoName: office.ceoName ?? '',
      phone: office.phone ?? '',
      address: office.address ?? '',
      postalAddress: office.postalAddress ?? null,
      naverVerificationId: office.naverVerificationId ?? '',
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

  const officeBaseline = useMemo<OfficeForm | null>(
    () =>
      office
        ? {
            name: office.name ?? '',
            licenseNo: office.licenseNo ?? '',
            ceoName: office.ceoName ?? '',
            phone: office.phone ?? '',
            address: office.address ?? '',
            postalAddress: office.postalAddress ?? null,
            naverVerificationId: office.naverVerificationId ?? '',
          }
        : null,
    [office],
  );

  const commissionBaseline = useMemo<CommissionConfigForm | null>(() => {
    if (!office) return null;
    const config = normalizeCommissionConfig(office.commissionConfig);
    return {
      distributionType: config.distributionType,
      defaultAgentRate: String(config.defaultAgentRate),
      listingAgentRate: String(config.listingAgentRate),
      buyingAgentRate: String(config.buyingAgentRate),
      dualAgentRate: String(config.dualAgentRate),
      managerRate: String(config.managerRate),
      closerBonus: String(config.closerBonus),
    };
  }, [office]);

  const addressDirty = Boolean(
    officeBaseline &&
    (officeForm.address !== officeBaseline.address ||
      JSON.stringify(officeForm.postalAddress) !==
        JSON.stringify(officeBaseline.postalAddress)),
  );

  const officeInfoDirty = Boolean(
    officeBaseline &&
    (officeForm.name !== officeBaseline.name ||
      officeForm.licenseNo !== officeBaseline.licenseNo ||
      officeForm.ceoName !== officeBaseline.ceoName ||
      officeForm.phone !== officeBaseline.phone ||
      addressDirty),
  );
  const connectionDirty = Boolean(
    officeBaseline &&
      officeForm.naverVerificationId !== officeBaseline.naverVerificationId,
  );
  const commissionDirty = Boolean(
    commissionBaseline && !sameCommissionForm(commissionForm, commissionBaseline),
  );

  const updateOfficeMutation = useMutation({
    mutationFn: () =>
      api.offices.updateMe({
        name: officeForm.name.trim(),
        licenseNo: emptyToNull(officeForm.licenseNo),
        ceoName: emptyToNull(officeForm.ceoName),
        phone: emptyToNull(officeForm.phone),
        ...(addressDirty ? { postalAddress: officeForm.postalAddress } : {}),
        naverVerificationId: emptyToNull(officeForm.naverVerificationId),
      }),
    onSuccess: (updatedOffice) => {
      queryClient.setQueryData(['office-profile'], updatedOffice);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      // 대시보드 인사말·사이드바처럼 로그인 정보의 사무소명을 쓰는 곳도 새 이름으로 바꾼다
      if (updatedOffice.name !== user?.office?.name) {
        void refreshAuthUser().catch(() => undefined);
      }
      toast.success('사무소 설정을 저장했습니다.');
    },
    onError: (error) =>
      toast.error(
        apiErrorMessage(error, '사무소 설정을 저장하지 못했습니다. 다시 시도해 주세요.'),
      ),
  });

  const retryGeocodingMutation = useMutation({
    mutationFn: () => api.offices.retryGeocoding(),
    onSuccess: (updatedOffice) => {
      queryClient.setQueryData(['office-profile'], updatedOffice);
      if (updatedOffice.geocodingStatus === 'ready')
        toast.success('사무소 위치를 확인했습니다.');
      else
        toast.info(
          '아직 위치를 확인하지 못했습니다. 저장한 주소는 유지됩니다.',
        );
    },
    onError: () => toast.error('위치 확인을 다시 시도하지 못했습니다.'),
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
    onSuccess: (updatedOffice) => {
      queryClient.setQueryData(['office-profile'], updatedOffice);
      toast.success('수수료 배분 기준을 저장했습니다.');
    },
    onError: (error) =>
      toast.error(
        apiErrorMessage(error, '수수료 배분 기준을 저장하지 못했습니다. 다시 시도해 주세요.'),
      ),
  });

  const handleLocaleChange = (next: SupportedLocale) => {
    setLocale(next);
    changeLocale(next);
  };

  const handleSectionChange = (sectionId: SettingsSectionId) => {
    setActiveSection(sectionId);
    localStorage.setItem(LAST_SECTION_KEY, sectionId);
    contentScrollRef.current?.scrollTo({ top: 0 });
    // 주소도 지금 항목으로 맞춘다. 그대로 두면 주소에 처음 들어온 항목(?section=commission)이 남아,
    // 다른 화면의 같은 링크로 다시 들어와도 값이 바뀌지 않아 그 항목으로 옮겨 가지 않았다(탭을 다시 열 때도 엉뚱한 항목).
    if (requestedSection !== sectionId) void navigateSettings({ search: { section: sectionId }, replace: true });
  };

  const handleCommissionSave = () => {
    const invalid = validateCommissionForm(commissionForm);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    updateCommissionMutation.mutate();
  };

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase('ko-KR');
  const filteredSections = useMemo(
    () =>
      SETTINGS_SECTIONS.filter((section) => {
        if (section.id === 'team' && !canManageTeam) return false;
        if (!normalizedSearch) return true;
        return `${section.label} ${section.description} ${section.keywords}`
          .toLocaleLowerCase('ko-KR')
          .includes(normalizedSearch);
      }),
    [canManageTeam, normalizedSearch],
  );

  useEffect(() => {
    if (
      normalizedSearch &&
      filteredSections.length > 0 &&
      !filteredSections.some((section) => section.id === activeSection)
    ) {
      handleSectionChange(filteredSections[0].id);
    }
  }, [activeSection, filteredSections, normalizedSearch]);

  const activeSectionMeta =
    SETTINGS_SECTIONS.find((section) => section.id === activeSection) ??
    SETTINGS_SECTIONS[0];
  const myProfile = useMemo(
    () => office?.users.find((member) => member.id === user?.id) ?? null,
    [office, user?.id],
  );
  const dirtySections = useMemo(
    () =>
      new Set<SettingsSectionId>([
        ...(officeInfoDirty ? (['office'] as const) : []),
        ...(commissionDirty ? (['commission'] as const) : []),
        ...(connectionDirty ? (['connections'] as const) : []),
      ]),
    [commissionDirty, connectionDirty, officeInfoDirty],
  );

  const hasSearchResults = filteredSections.length > 0;

  return (
    <div
      data-settings-page
      className="-m-4 flex min-h-0 flex-1 overflow-hidden bg-background"
    >
      <SettingsNavigation
        activeSection={activeSection}
        dirtySections={dirtySections}
        filteredSections={filteredSections}
        officeName={office?.name ?? user?.office?.name ?? '사무소'}
        plan={
          office
            ? (SUBSCRIPTION_LABELS[office.subscription] ?? office.subscription)
            : null
        }
        seatLabel={
          office ? `${office.counts.activeUsers}/${office.maxUsers}명 사용 중` : null
        }
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSectionChange={handleSectionChange}
      />

      <main
        ref={contentScrollRef}
        className="min-w-0 flex-1 overflow-y-auto bg-background"
      >
        <div className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-5 py-3 backdrop-blur lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-[-0.02em]">설정</h1>
              <p className="text-xs text-muted-foreground">업무 환경을 관리합니다.</p>
            </div>
            {!canEditOffice ? (
              <Badge variant="secondary">일부 읽기 전용</Badge>
            ) : null}
          </div>
          <SettingsSearch
            value={searchQuery}
            resultCount={filteredSections.length}
            onChange={setSearchQuery}
          />
          {hasSearchResults ? (
            <Select
              value={activeSection}
              onValueChange={(value) =>
                handleSectionChange(value as SettingsSectionId)
              }
            >
              <SelectTrigger className="mt-2 w-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filteredSections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <div className="mx-auto w-full max-w-[720px] px-5 py-8 lg:px-8 lg:py-12">
          {isError ? (
            <div
              role="alert"
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive-soft/40 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">사무소 정보를 불러오지 못했습니다</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  연결 상태를 확인한 뒤 다시 시도해 주세요.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RotateCw className="size-3.5" />
                다시 시도
              </Button>
            </div>
          ) : null}

          {!hasSearchResults ? (
            <SearchEmptyState
              query={searchQuery}
              onClear={() => setSearchQuery('')}
            />
          ) : (
            <>
              <SettingsPaneHeader
                section={activeSectionMeta}
                readOnly={
                  !canEditOffice &&
                  activeSection !== 'account' &&
                  activeSection !== 'partners'
                }
              />

              {activeSection === 'account' ? (
                <AccountSettings
                  isLoading={isLoading}
                  canManageTeam={canManageTeam}
                  onOpenTeam={() => handleSectionChange('team')}
                  locale={locale}
                  myProfile={myProfile}
                  user={user}
                  languageLabel={(value) => t(`languageOptions.${value}`)}
                  onLocaleChange={handleLocaleChange}
                />
              ) : null}

              {activeSection === 'office' ? (
                <OfficeSettings
                  canEdit={canEditOffice}
                  form={officeForm}
                  isDirty={officeInfoDirty}
                  isLoading={isLoading}
                  isSaving={updateOfficeMutation.isPending}
                  office={office}
                  isGeocoding={retryGeocodingMutation.isPending}
                  onRetryGeocoding={() => retryGeocodingMutation.mutate()}
                  onChange={setOfficeForm}
                  onSave={() => updateOfficeMutation.mutate()}
                />
              ) : null}

              {activeSection === 'team' && canManageTeam ? (
                <TeamSettings />
              ) : null}

              {activeSection === 'commission' ? (
                <CommissionSettings
                  canEdit={canEditOffice}
                  form={commissionForm}
                  isDirty={commissionDirty}
                  isLoading={isLoading}
                  isSaving={updateCommissionMutation.isPending}
                  onChange={setCommissionForm}
                  onSave={handleCommissionSave}
                />
              ) : null}

              {activeSection === 'partners' ? <PartnerBrokersSettingsCard /> : null}

              {activeSection === 'templates' ? (
                <ContractTemplatesCard canEdit={canEditOffice} />
              ) : null}

              {activeSection === 'connections' ? (
                <ConnectionSettings
                  canEditOffice={canEditOffice}
                  form={officeForm}
                  isDirty={connectionDirty}
                  isLoading={isLoading}
                  isSaving={updateOfficeMutation.isPending}
                  onChange={setOfficeForm}
                  onSave={() => updateOfficeMutation.mutate()}
                />
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function SettingsNavigation({
  activeSection,
  dirtySections,
  filteredSections,
  officeName,
  plan,
  seatLabel,
  searchQuery,
  onSearchChange,
  onSectionChange,
}: {
  activeSection: SettingsSectionId;
  dirtySections: Set<SettingsSectionId>;
  filteredSections: SettingsSection[];
  officeName: string;
  plan: string | null;
  seatLabel: string | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSectionChange: (sectionId: SettingsSectionId) => void;
}) {
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-border/70 bg-sidebar lg:flex">
      <div className="px-3 pb-3 pt-5">
        <h1 className="mb-3 px-2 text-[15px] font-semibold tracking-[-0.01em]">설정</h1>
        <SettingsSearch
          value={searchQuery}
          resultCount={filteredSections.length}
          onChange={onSearchChange}
        />
      </div>

      <nav aria-label="설정 범주" className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
        {filteredSections.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs leading-5 text-muted-foreground">
            일치하는 설정 범주가 없습니다.
          </p>
        ) : (
          SETTINGS_GROUPS.map((group) => {
            const items = filteredSections.filter(
              (section) => section.group === group,
            );
            if (items.length === 0) return null;

            return (
              <div key={group} className="mb-4 last:mb-0">
                <p className="px-2 pb-1 pt-2 text-xs text-muted-foreground">{group}</p>
                <div className="space-y-px">
                  {items.map((section) => {
                    const Icon = section.icon;
                    const active = activeSection === section.id;
                    const dirty = dirtySections.has(section.id);

                    return (
                      <button
                        key={section.id}
                        type="button"
                        data-settings-nav-item
                        aria-current={active ? 'page' : undefined}
                        title={section.description}
                        onClick={() => onSectionChange(section.id)}
                        className={cn(
                          'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                          active
                            ? 'bg-sidebar-accent font-medium text-foreground'
                            : 'text-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground',
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{section.label}</span>
                        {dirty ? (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-info"
                            aria-label="저장하지 않은 변경사항"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </nav>

      <div className="border-t border-border/70 px-5 py-3">
        <p className="truncate text-xs font-medium">{officeName}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {plan ? `${plan} 플랜` : '사무소 범위'}
          {seatLabel ? ` · ${seatLabel}` : ''}
        </p>
      </div>
    </aside>
  );
}

function SettingsSearch({
  value,
  resultCount,
  onChange,
}: {
  value: string;
  resultCount: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        aria-label="설정 검색"
        placeholder="설정 검색"
        onChange={(event) => onChange(event.target.value)}
        className="h-8 bg-background pl-8 pr-8 text-xs shadow-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="검색어 지우기"
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {resultCount}개의 설정 범주
      </span>
    </div>
  );
}

function SettingsPaneHeader({
  section,
  readOnly,
}: {
  section: SettingsSection;
  readOnly: boolean;
}) {
  return (
    <header className="mb-9 flex items-start justify-between gap-4 border-b border-border/70 pb-6">
      <div className="min-w-0">
        <h2 className="text-[24px] font-semibold leading-8 tracking-[-0.02em]">
          {section.label}
        </h2>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
          {paneDescription(section.id)}
        </p>
      </div>
      {readOnly ? (
        <Badge variant="secondary" className="mt-1.5 shrink-0 gap-1 font-normal">
          <LockKeyhole className="size-3" />
          읽기 전용
        </Badge>
      ) : null}
    </header>
  );
}

function AccountSettings({
  isLoading,
  canManageTeam,
  onOpenTeam,
  locale,
  myProfile,
  user,
  languageLabel,
  onLocaleChange,
}: {
  isLoading: boolean;
  canManageTeam: boolean;
  onOpenTeam: () => void;
  locale: SupportedLocale;
  myProfile: {
    phone: string | null;
    licenseType: string | null;
  } | null;
  user: {
    name: string;
    loginId: string;
    email: string | null;
    role: string;
  } | null;
  languageLabel: (value: SupportedLocale) => string;
  onLocaleChange: (locale: SupportedLocale) => void;
}) {
  const licenseLabel = myProfile?.licenseType
    ? ((USER_LICENSE_TYPE_LABELS as Record<string, string>)[myProfile.licenseType] ??
      myProfile.licenseType)
    : '미지정';

  return (
    <div>
      <SettingsSectionHeading
        title="프로필"
        description="현재 로그인한 계정의 식별 정보입니다."
      />
      <SettingsSurface>
        <div className="flex flex-wrap items-center gap-3.5 py-4">
          {isLoading ? (
            <>
              <Skeleton className="size-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </>
          ) : (
            <>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-[15px] font-semibold text-neutral-strong">
                {user?.name?.charAt(0) ?? 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold">{user?.name ?? '-'}</p>
                  <Badge variant="outline" className="font-normal">
                    {user ? (ROLE_LABELS[user.role] ?? user.role) : '-'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {user?.email ?? user?.loginId ?? '-'}
                </p>
              </div>
            </>
          )}
        </div>
        <dl className="divide-y divide-border/70">
          <InfoItem label="로그인 ID" value={user?.loginId ?? '-'} />
          <InfoItem label="이메일" value={user?.email ?? '등록되지 않음'} />
          <InfoItem
            label="전화번호"
            value={myProfile?.phone ? formatPhone(myProfile.phone) : '등록되지 않음'}
          />
          <InfoItem label="자격 구분" value={licenseLabel} />
        </dl>
        {myProfile?.licenseType === 'assistant' ? (
          <div className="border-t border-border/70 py-3 text-xs leading-5 text-warning-strong">
            중개보조원 계정은 계약서에 서명할 수 없습니다. 계약 체결은 개업·소속
            공인중개사가 진행해야 합니다.
          </div>
        ) : null}
      </SettingsSurface>

      <SettingsSectionHeading
        title="이름과 비밀번호 바꾸기"
        description="계정 정보는 이 화면에서 바로 고치지 않습니다. 아래에서 바꾸는 곳을 확인하세요."
      />
      <SettingsSurface>
        <SettingsRow
          title="이름 · 전화번호 · 자격"
          description={
            canManageTeam
              ? '설정 › 직원 및 권한에서 내 계정을 열어 고칩니다.'
              : '대표나 매니저에게 고쳐 달라고 요청하세요. 설정 › 직원 및 권한에서 고칩니다.'
          }
          control={
            canManageTeam ? (
              <Button size="sm" variant="outline" onClick={onOpenTeam}>
                직원 및 권한 열기
              </Button>
            ) : null
          }
        />
        <SettingsRow
          title="비밀번호"
          description={
            user?.email
              ? `로그아웃한 뒤 로그인 화면의 '비밀번호를 잊으셨나요?'에서 ${user.email}로 재설정 메일을 받아 바꿉니다.`
              : '직원 계정의 비밀번호는 대표나 매니저가 설정 › 직원 및 권한에서 새로 정해 줍니다.'
          }
          control={null}
        />
      </SettingsSurface>

      <SettingsSectionHeading
        title="인터페이스"
        description="이 기기에서 사용할 표시 방식을 선택합니다."
      />
      <SettingsSurface>
        <SettingsRow
          title="표시 언어"
          description="화면의 언어를 바꿉니다. 열려 있는 화면을 모두 다시 불러오며, 작성 중인 화면은 저장하거나 닫은 뒤에 바뀝니다."
          control={
            <Select
              value={locale}
              onValueChange={(value) => onLocaleChange(value as SupportedLocale)}
            >
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {languageLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsSurface>
    </div>
  );
}

function OfficeSettings({
  canEdit,
  form,
  isDirty,
  isLoading,
  isSaving,
  office,
  isGeocoding,
  onChange,
  onSave,
  onRetryGeocoding,
}: {
  canEdit: boolean;
  form: OfficeForm;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  office: OfficeProfile | undefined;
  isGeocoding: boolean;
  onChange: (form: OfficeForm) => void;
  onSave: () => void;
  onRetryGeocoding: () => void;
}) {
  return (
    <div>
      <SettingsSectionHeading
        title="운영 상태"
        description="현재 플랜과 팀 사용 현황을 한눈에 확인합니다."
      />
      <SettingsSurface>
        <dl className="divide-y divide-border/70">
          <InfoItem
            label="사무소"
            value={
              isLoading
                ? '불러오는 중…'
                : `${office?.name ?? '-'} · ${office?.isActive === false ? '이용 정지' : '정상 운영 중'}`
            }
          />
          <InfoItem
            label="플랜"
            value={
              office
                ? (SUBSCRIPTION_LABELS[office.subscription] ?? office.subscription)
                : '-'
            }
          />
          <InfoItem
            label="활성 계정"
            value={office ? `${office.counts.activeUsers}/${office.maxUsers}명` : '-'}
          />
          <InfoItem label="매니저" value={office ? `${office.counts.managers}명` : '-'} />
        </dl>
      </SettingsSurface>

      <SettingsSectionHeading
        title="기본 정보"
        description="계약서와 사무소 안내에 사용하는 공식 정보입니다."
      />
      <SettingsSurface className="border-b-0 pt-5">
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className={index === 4 ? 'sm:col-span-2' : undefined}>
                <Skeleton className="mb-2 h-3 w-20" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
            <Field
              id="office-name"
              label="사무소명"
              value={form.name}
              placeholder="예: 강남공인중개사사무소"
              onChange={(value) => onChange({ ...form, name: value })}
              disabled={!canEdit}
              required
            />
            <Field
              id="office-ceo-name"
              label="대표자명"
              value={form.ceoName}
              placeholder="예: 홍길동"
              onChange={(value) => onChange({ ...form, ceoName: value })}
              disabled={!canEdit}
            />
            <Field
              id="office-license-no"
              label="중개업 등록번호"
              value={form.licenseNo}
              placeholder="예: 11680-2026-00001"
              onChange={(value) => onChange({ ...form, licenseNo: value })}
              disabled={!canEdit}
            />
            <Field
              id="office-phone"
              label="대표 전화번호"
              value={form.phone}
              placeholder="예: 02-1234-5678"
              onChange={(value) => onChange({ ...form, phone: value })}
              disabled={!canEdit}
            />
            <div className="sm:col-span-2">
              <OfficeAddressField
                value={form.postalAddress}
                legacyAddress={form.postalAddress ? null : form.address}
                onChange={(postalAddress) =>
                  onChange({
                    ...form,
                    postalAddress,
                    address: postalAddress
                      ? [
                          postalAddress.roadAddress ||
                            postalAddress.jibunAddress,
                          postalAddress.detailAddress,
                        ]
                          .filter(Boolean)
                          .join(' ')
                      : '',
                  })
                }
                disabled={!canEdit || isSaving}
              />
              {office?.postalAddress &&
                office.geocodingStatus !== 'ready' &&
                !isDirty && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground-strong">
                    <p>
                      주소는 저장됐지만 위치 확인은 아직 완료되지 않았습니다.
                    </p>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isGeocoding || isSaving}
                        onClick={onRetryGeocoding}
                      >
                        {isGeocoding ? '위치 확인 중…' : '위치 다시 확인'}
                      </Button>
                    )}
                  </div>
                )}
            </div>
          </div>
        )}
      </SettingsSurface>

      <SaveStrip
        canEdit={canEdit}
        isDirty={isDirty}
        isSaving={isSaving}
        disabled={!form.name.trim()}
        label="사무소 정보 저장"
        onSave={onSave}
      />

      {canEdit ? (
        <>
          <SettingsSectionHeading
            title="관련 관리 화면"
            description="자주 바뀌는 운영 정보는 해당 업무 화면에서 관리합니다."
          />
          <SettingsSurface>
            <SettingsLinkRow
              to="/employees"
              title="직원 업무 현황"
              description={
                office
                  ? `전체 ${office.counts.totalUsers}명 · 활성 ${office.counts.activeUsers}명 · 담당 업무와 활동 기록`
                  : '직원별 담당 업무와 활동 기록을 봅니다.'
              }
              actionLabel="직원 관리 열기"
            />
          </SettingsSurface>
        </>
      ) : null}
    </div>
  );
}

function CommissionSettings({
  canEdit,
  form,
  isDirty,
  isLoading,
  isSaving,
  onChange,
  onSave,
}: {
  canEdit: boolean;
  form: CommissionConfigForm;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onChange: (form: CommissionConfigForm) => void;
  onSave: () => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-[320px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div>
      <SettingsSectionHeading
        title="배분 방식"
        description="거래를 만들 때 직원 배분의 기본값으로 적용됩니다."
      />
      <SettingsSurface>
        <SettingsRow
          title="기본 계산 방식"
          description="개별 거래나 직원에게 별도 비율이 있으면 그 값을 우선합니다."
          control={
            <Select
              value={form.distributionType}
              onValueChange={(value) => onChange({ ...form, distributionType: value })}
              disabled={!canEdit}
            >
              <SelectTrigger className="w-[190px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">비율 기준</SelectItem>
                <SelectItem value="fixed">고정액 기준</SelectItem>
                <SelectItem value="custom">거래별 직접 설정</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsSurface>

      <SettingsSectionHeading
        title="담당자 기본 비율"
        description="각 수수료에서 담당 직원에게 배분할 몫을 0~100%로 입력합니다."
      />
      <SettingsSurface>
        <NumberSettingRow
          id="commission-default-agent"
          label="기본 직원"
          description="역할별 기준이 없을 때 적용하는 기본 배분율"
          value={form.defaultAgentRate}
          onChange={(value) => onChange({ ...form, defaultAgentRate: value })}
          disabled={!canEdit}
          kind="rate"
        />
        <NumberSettingRow
          id="commission-listing-agent"
          label="매도측 담당"
          description="매도인 또는 임대인 측을 맡은 직원의 배분율"
          value={form.listingAgentRate}
          onChange={(value) => onChange({ ...form, listingAgentRate: value })}
          disabled={!canEdit}
          kind="rate"
        />
        <NumberSettingRow
          id="commission-buying-agent"
          label="매수측 담당"
          description="매수인 또는 임차인 측을 맡은 직원의 배분율"
          value={form.buyingAgentRate}
          onChange={(value) => onChange({ ...form, buyingAgentRate: value })}
          disabled={!canEdit}
          kind="rate"
        />
        <NumberSettingRow
          id="commission-dual-agent"
          label="단독중개 담당"
          description="한 직원이 양측을 모두 담당한 거래의 배분율"
          value={form.dualAgentRate}
          onChange={(value) => onChange({ ...form, dualAgentRate: value })}
          disabled={!canEdit}
          kind="rate"
        />
        <NumberSettingRow
          id="commission-manager"
          label="관리자"
          description="거래에 참여한 매니저의 기본 배분율"
          value={form.managerRate}
          onChange={(value) => onChange({ ...form, managerRate: value })}
          disabled={!canEdit}
          kind="rate"
        />
      </SettingsSurface>

      <SettingsSectionHeading
        title="추가 지급"
        description="비율 배분과 별도로 더하는 고정 금액입니다."
      />
      <SettingsSurface>
        <NumberSettingRow
          id="commission-closer-bonus"
          label="마감 담당 보너스"
          description="잔금·등기 등 거래 마감을 담당한 직원에게 지급하는 금액"
          value={form.closerBonus}
          onChange={(value) => onChange({ ...form, closerBonus: value })}
          disabled={!canEdit}
          kind="money"
        />
      </SettingsSurface>

      <SaveStrip
        canEdit={canEdit}
        isDirty={isDirty}
        isSaving={isSaving}
        disabled={Boolean(validateCommissionForm(form))}
        label="배분 기준 저장"
        onSave={onSave}
      />
    </div>
  );
}

function ConnectionSettings({
  canEditOffice,
  form,
  isDirty,
  isLoading,
  isSaving,
  onChange,
  onSave,
}: {
  canEditOffice: boolean;
  form: OfficeForm;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onChange: (form: OfficeForm) => void;
  onSave: () => void;
}) {
  return (
    <div>
      <SettingsSectionHeading
        title="광고 등록"
        description="사무소 공통으로 사용하는 외부 플랫폼 식별 정보입니다."
      />
      <SettingsSurface>
        <div className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center">
            <div className="min-w-0">
              <Label htmlFor="naver-verification-id" className="text-[13px] font-medium">
                네이버 매물등록 인증 아이디
              </Label>
              <p
                id="naver-verification-id-description"
                className="mt-1 text-xs leading-5 text-muted-foreground"
              >
                네이버 부동산 광고 등록 시 실명 인증에 사용하는 사무소 공통 아이디입니다.
              </p>
            </div>
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Input
              id="naver-verification-id"
              value={form.naverVerificationId}
              aria-describedby="naver-verification-id-description"
              placeholder="인증 아이디 입력"
              onChange={(event) =>
                onChange({ ...form, naverVerificationId: event.target.value })
              }
              disabled={!canEditOffice}
              className="bg-background"
            />
          )}
        </div>
      </SettingsSurface>
      <SaveStrip
        canEdit={canEditOffice}
        isDirty={isDirty}
        isSaving={isSaving}
        label="광고 연결 정보 저장"
        onSave={onSave}
      />

      <SettingsSectionHeading
        title="AI 도구"
        description="내 Claude·ChatGPT 같은 외부 AI가 내 계정 권한으로 에스테잇플로우의 자료를 읽고 쓰게 연결합니다."
      />
      <McpApiKeyCard />

      <div className="mt-6 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <LockKeyhole className="mt-[3px] size-3.5 shrink-0" />
        <p>
          광고 플랫폼 로그인 정보는 이 앱에 저장하지 않습니다. 이실장 등 CP 계정은
          로컬 자동화 도구의 전용 설정에서 관리됩니다.
        </p>
      </div>
    </div>
  );
}

function SettingsSectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3 mt-10 first:mt-0">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * 한 구역의 줄 묶음. 상자·그림자 없이 위아래 선과 줄 사이 선만 쓴다
 * (앱 톤: 상자와 띠보다 선과 여백). 모양은 settingsSurfaceClassName과 같다.
 */
function SettingsSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('divide-y divide-border/70 border-y border-border/70', className)}>
      {children}
    </section>
  );
}

function SettingsRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {control ? <div className="justify-self-start sm:justify-self-end">{control}</div> : null}
    </div>
  );
}

function SettingsLinkRow({
  to,
  title,
  description,
  actionLabel,
}: {
  to: '/employees';
  title: string;
  description: string;
  actionLabel: string;
}) {
  return (
    <Link
      to={to}
      aria-label={actionLabel}
      className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-4 outline-none hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/35"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="hidden text-xs text-muted-foreground sm:block">{actionLabel}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Field({
  id,
  label,
  value,
  placeholder,
  onChange,
  disabled,
  required,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
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
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
        className="bg-background"
      />
    </div>
  );
}

function NumberSettingRow({
  id,
  label,
  description,
  value,
  onChange,
  disabled,
  kind,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  kind: 'rate' | 'money';
}) {
  const parsed = Number(value);
  const invalid =
    value.trim() === '' ||
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    (kind === 'rate' && parsed > 100);
  const suffix = kind === 'rate' ? '%' : '만원';
  const errorMessage =
    kind === 'rate'
      ? '0~100 사이 숫자를 입력하세요.'
      : '0 이상의 금액을 입력하세요.';
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-x-6 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-start">
      <div>
        <Label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div>
        <div className="relative">
          <Input
            id={id}
            inputMode="decimal"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className="bg-background pr-14 text-right tabular-nums"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        </div>
        {invalid ? (
          <p id={errorId} className="mt-1.5 text-[11px] text-destructive-strong">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SaveStrip({
  canEdit,
  isDirty,
  isSaving,
  disabled,
  label,
  onSave,
}: {
  canEdit: boolean;
  isDirty: boolean;
  isSaving: boolean;
  disabled?: boolean;
  label: string;
  onSave: () => void;
}) {
  if (!canEdit) {
    return (
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <LockKeyhole className="size-3.5" />
        대표 또는 매니저만 이 설정을 변경할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs" aria-live="polite">
        {isDirty ? (
          <span className="size-1.5 rounded-full bg-info" />
        ) : (
          <Check className="size-3.5 text-muted-foreground" />
        )}
        <span className={isDirty ? 'text-foreground' : 'text-muted-foreground'}>
          {isSaving
            ? '변경사항을 저장하는 중입니다…'
            : isDirty
              ? '저장하지 않은 변경사항이 있습니다.'
              : '모든 변경사항이 저장되었습니다.'}
        </span>
      </div>
      <Button
        size="sm"
        onClick={onSave}
        disabled={!isDirty || isSaving || disabled}
      >
        {isSaving ? '저장 중…' : label}
      </Button>
    </div>
  );
}

/** 속성 한 줄: 왼쪽에 이름, 오른쪽에 값 (연락처·프로젝트 상세의 속성 줄과 같은 짜임) */
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2.5">
      <dt className="w-28 shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-[13px]">{value}</dd>
    </div>
  );
}

function SearchEmptyState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[420px] max-w-md flex-col items-center justify-center text-center">
      <Search className="size-5 text-muted-foreground" />
      <h2 className="mt-4 text-base font-semibold">
        ‘{query}’과 일치하는 설정이 없습니다
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        사무소명, 수수료, 계약서, MCP처럼 설정 이름이나 관련 단어로 검색해 보세요.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
        검색 지우기
      </Button>
    </div>
  );
}

const PERCENTAGE_FIELDS: {
  key: keyof CommissionConfigForm;
  label: string;
}[] = [
  { key: 'defaultAgentRate', label: '기본 직원 배분율' },
  { key: 'listingAgentRate', label: '매도측 담당 배분율' },
  { key: 'buyingAgentRate', label: '매수측 담당 배분율' },
  { key: 'dualAgentRate', label: '단독중개 담당 배분율' },
  { key: 'managerRate', label: '관리자 배분율' },
];

function validateCommissionForm(form: CommissionConfigForm): string | null {
  for (const field of PERCENTAGE_FIELDS) {
    const raw = form[field.key].trim();
    const parsed = Number(raw);
    if (raw === '' || !Number.isFinite(parsed)) {
      return `${field.label}을 숫자로 입력하세요.`;
    }
    if (parsed < 0 || parsed > 100) {
      return `${field.label}은 0~100 사이로 입력하세요.`;
    }
  }

  const closerBonus = Number(form.closerBonus);
  if (
    form.closerBonus.trim() === '' ||
    !Number.isFinite(closerBonus) ||
    closerBonus < 0
  ) {
    return '마감 담당 보너스는 0 이상의 금액으로 입력하세요.';
  }

  return null;
}

function sameCommissionForm(
  left: CommissionConfigForm,
  right: CommissionConfigForm,
): boolean {
  return (Object.keys(left) as (keyof CommissionConfigForm)[]).every(
    (key) => left[key] === right[key],
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
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function paneDescription(sectionId: SettingsSectionId): string {
  switch (sectionId) {
    case 'account':
      return '내 로그인 정보와 이 기기에서 사용할 표시 언어를 확인합니다.';
    case 'office':
      return '사무소의 공식 정보와 팀 운영 현황을 관리합니다.';
    case 'team':
      return '직원 계정을 만들고 역할, 자격, 급여와 배분율, 비밀번호를 관리합니다. 급여와 배분율은 대표만 정합니다.';
    case 'commission':
      return '거래 생성 시 적용할 직원 수수료 배분의 기본값을 정합니다.';
    case 'partners':
      return '공동중개하는 다른 중개사무소를 올려 둡니다. 거래를 만들 때 상대 사무소로 고르고, 수수료를 나눌 때 받을 곳으로 씁니다.';
    case 'templates':
      return '계약서 작성과 출력에 반복해서 사용하는 문구와 서식을 관리합니다.';
    case 'connections':
      return '광고 플랫폼 식별 정보와 외부 AI 도구의 접근 권한을 관리합니다.';
  }
}
