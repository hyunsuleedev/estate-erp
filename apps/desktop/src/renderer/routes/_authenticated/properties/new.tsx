import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Check, ChevronsUpDown, Search } from 'lucide-react';
import { sqmToPyeong, TRANSACTION_TYPE_LABELS } from '@estate-erp/shared';
import type {
  CreateListingForIntakeDto,
  Property,
  PropertyListing,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { useTabScopedState } from '@/features/tabs/hooks/useTabScopedState';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import {
  toggleTransactionType,
  type NewPropertyTransactionType,
} from './-new-property-view-utils';
import {
  FieldRow,
  ListingCostFields,
  PrivateMemoField,
  Section,
} from './-new-form-ui';

interface NewPropertySearch {
  siteId?: string;
  dongId?: string;
  unitId?: string;
}

export const Route = createFileRoute('/_authenticated/properties/new')({
  validateSearch: (search: Record<string, unknown>): NewPropertySearch => ({
    siteId:
      typeof search.siteId === 'string' && search.siteId ? search.siteId : undefined,
    dongId:
      typeof search.dongId === 'string' && search.dongId ? search.dongId : undefined,
    unitId:
      typeof search.unitId === 'string' && search.unitId ? search.unitId : undefined,
  }),
  component: NewPropertyPage,
});

// Site types that REQUIRE Dong/Unit hierarchy (unit selection mandatory)
const UNIT_BEARING_TYPES = new Set([
  'apartment',
  'officetel',
  'villa',
  'commercial',
  'living_accommodation',
]);

// 단독/다가구(house)는 통건물·호실 둘 다 허용 — 동/호 선택은 선택사항
const OPTIONAL_UNIT_TYPES = new Set(['house']);

const SITE_TYPE_LABELS: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라/다세대',
  house: '단독/다가구',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

const TX_LABELS = TRANSACTION_TYPE_LABELS as Record<string, string>;

const MOVE_IN_TYPES = [
  { value: 'immediate', label: '즉시 입주' },
  { value: 'date', label: '특정 날짜' },
  { value: 'range', label: '기간 협의' },
  { value: 'negotiable', label: '날짜 협의' },
  { value: 'unknown', label: '미정' },
] as const;

type TransactionType = NewPropertyTransactionType;
type MoveInType = (typeof MOVE_IN_TYPES)[number]['value'];

interface FormState {
  // Step 1: Site
  siteId: string;
  siteName: string;
  siteType: string;

  // Step 2: Dong / Unit
  dongId: string;
  unitId: string;

  // Step 3: Listing
  transactionTypes: TransactionType[];
  salePrice: string;
  jeonsePrice: string;
  monthlyDeposit: string;
  monthlyRent: string;
  moveInAvailableType: MoveInType;
  moveInAvailableFrom: string;
  moveInAvailableTo: string;
  isJointBrokerageRequired: boolean;
  jointBrokeragePartnerId: string;

  // Step 3.5: 비용 정보
  maintenanceFee: string;
  maintenanceFeeIncludes: string[];
  loanAmount: string;
  premium: string;

  // Step 4: 메모
  memo: string;
  privateMemo: string;

  // Step 5: People (optional)
  addOwner: boolean;
  ownerName: string;
  ownerPhone: string;
  hasTenant: boolean;
  tenantName: string;
  tenantPhone: string;
  tenantDeposit: string;
  tenantMonthlyRent: string;
  tenantContractStart: string;
  tenantContractEnd: string;
}

const initialForm: FormState = {
  siteId: '',
  siteName: '',
  siteType: '',
  dongId: '',
  unitId: '',
  transactionTypes: ['sale'],
  salePrice: '',
  jeonsePrice: '',
  monthlyDeposit: '',
  monthlyRent: '',
  moveInAvailableType: 'negotiable',
  moveInAvailableFrom: '',
  moveInAvailableTo: '',
  isJointBrokerageRequired: false,
  jointBrokeragePartnerId: '',
  maintenanceFee: '',
  maintenanceFeeIncludes: [],
  loanAmount: '',
  premium: '',
  memo: '',
  privateMemo: '',
  addOwner: false,
  ownerName: '',
  ownerPhone: '',
  hasTenant: false,
  tenantName: '',
  tenantPhone: '',
  tenantDeposit: '',
  tenantMonthlyRent: '',
  tenantContractStart: '',
  tenantContractEnd: '',
};

function NewPropertyPage() {
  const queryClient = useQueryClient();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const replaceTabResource = useTabStore((s) => s.replaceTabResource);
  const openOrRevealResource = useTabStore((s) => s.openOrRevealResource);
  const openModule = useTabStore((s) => s.openModule);
  const closeTab = useTabStore((s) => s.closeTab);
  // 저장 요청 도중 사용자가 다른 탭으로 전환해도 이 draft의 탭만 전환한다.
  const ownerTabIdRef = useRef(activeTabId);
  const searchParams = Route.useSearch();
  const [form, setForm] = useTabScopedState<FormState>(
    'property-new:form:v1',
    initialForm,
  );
  const [error, setError] = useState('');
  const [prefillApplied, setPrefillApplied] = useTabScopedState(
    'property-new:prefill-applied:v1',
    false,
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // sites 페이지에서 ?siteId=&dongId=&unitId= 로 진입 시 해당 단계 프리필
  const { data: prefillSite } = useQuery({
    queryKey: ['sites', 'prefill', searchParams.siteId],
    queryFn: () => api.sites.findOne(searchParams.siteId as string),
    enabled: Boolean(searchParams.siteId) && !prefillApplied,
  });

  useEffect(() => {
    if (!prefillSite || prefillApplied) return;
    setForm((prev) => ({
      ...prev,
      siteId: prefillSite.id,
      siteName: prefillSite.name,
      siteType: prefillSite.type,
      dongId: searchParams.dongId ?? '',
      unitId: searchParams.unitId ?? '',
    }));
    setPrefillApplied(true);
  }, [prefillSite, prefillApplied, searchParams.dongId, searchParams.unitId]);

  const needsUnit = UNIT_BEARING_TYPES.has(form.siteType);
  const allowsUnit = needsUnit || OPTIONAL_UNIT_TYPES.has(form.siteType);
  const isHouse = OPTIONAL_UNIT_TYPES.has(form.siteType);
  const isCommercial = form.siteType === 'commercial';

  const { data: dongs } = useQuery({
    queryKey: ['dongs', form.siteId],
    queryFn: () => api.dongs.findAll(form.siteId),
    enabled: !!form.siteId && allowsUnit,
  });

  // Auto-skip placeholder Dong (single-building sites)
  const visibleDongs = useMemo(() => dongs ?? [], [dongs]);
  const isPlaceholderOnly =
    visibleDongs.length === 1 && visibleDongs[0]?.isPlaceholder === true;
  const effectiveDongId = isPlaceholderOnly
    ? visibleDongs[0].id
    : form.dongId;

  const { data: units } = useQuery({
    queryKey: ['units', form.siteId, effectiveDongId],
    queryFn: () =>
      api.units.findAll({
        siteId: form.siteId,
        dongId: effectiveDongId || undefined,
      }),
    enabled: !!form.siteId && allowsUnit && !!effectiveDongId,
  });

  const { data: partners } = useQuery({
    queryKey: ['partner-brokers', 'active'],
    queryFn: () => api.partnerBrokers.list(),
    enabled: form.isJointBrokerageRequired,
  });

  const selectedUnit = useMemo(
    () => units?.find((u) => u.id === form.unitId),
    [units, form.unitId],
  );
  const selectedUnitRoomCount =
    selectedUnit?.roomCount ?? selectedUnit?.siteUnitType?.roomCount;
  const selectedUnitBathRoomCount =
    selectedUnit?.bathRoomCount ?? selectedUnit?.siteUnitType?.bathRoomCount;
  const selectedDong = useMemo(
    () => visibleDongs.find((dong) => dong.id === effectiveDongId) ?? null,
    [effectiveDongId, visibleDongs],
  );

  // Detect existing Property for the same Site/Unit (find-or-create)
  // house는 통건물(unitId=null)·호실(unitId 지정) 둘 다 가능
  const effectiveUnitId = allowsUnit && form.unitId ? form.unitId : null;
  const siteUnitKeyReady =
    !!form.siteId && (!needsUnit || !!form.unitId);
  const { data: existingProperties } = useQuery({
    queryKey: ['properties', 'lookup', form.siteId, effectiveUnitId],
    queryFn: () =>
      api.properties.findAll({
        siteId: form.siteId,
        unitId: effectiveUnitId ?? undefined,
        limit: 20,
      }),
    enabled: siteUnitKeyReady,
  });
  const existingProperty = useMemo<Property | null>(() => {
    const items = existingProperties?.items ?? [];
    return items.find((p) => (p.unitId ?? null) === effectiveUnitId) ?? null;
  }, [existingProperties, effectiveUnitId]);

  const txConflicts = useMemo<PropertyListing[]>(() => {
    if (!existingProperty) return [];
    return (existingProperty.listings ?? []).filter(
      (l) => form.transactionTypes.includes(l.transactionType as TransactionType),
    );
  }, [existingProperty, form.transactionTypes]);

  const { data: activeIntakes } = useQuery({
    queryKey: ['listing-intakes', 'active', existingProperty?.id],
    queryFn: () =>
      api.listingIntakes.findAll({
        propertyId: existingProperty!.id,
        status: 'active',
        limit: 1,
      }),
    enabled: !!existingProperty?.id,
  });
  const activeIntake = activeIntakes?.items?.[0] ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      // Validate
      if (!form.siteId) throw new Error('단지를 선택하세요.');
      if (needsUnit && !form.unitId)
        throw new Error('호실을 선택하세요. (없으면 단지 상세에서 먼저 등록)');
      if (form.transactionTypes.includes('sale') && !form.salePrice) {
        throw new Error('매매가를 입력하세요.');
      }
      if (form.transactionTypes.includes('jeonse') && !form.jeonsePrice) {
        throw new Error('전세가를 입력하세요.');
      }
      if (form.transactionTypes.includes('monthly') && !form.monthlyRent) {
        throw new Error('월세를 입력하세요.');
      }
      if (txConflicts.length > 0) {
        throw new Error(
          `같은 호실에 이미 ${txConflicts.map((listing) => TX_LABELS[listing.transactionType] ?? listing.transactionType).join(', ')} 매물이 있습니다. 매물 상세에서 수정하세요.`,
        );
      }

      // 1) Property — 이미 있으면 재사용, 없으면 생성
      const property = existingProperty
        ? existingProperty
        : await api.properties.create({
            siteId: form.siteId,
            unitId: effectiveUnitId ?? undefined,
          });

      // 2) ListingIntake + Listing
      const listingPayloads = buildListingPayloads(form, isCommercial);
      const intakePayload = {
        memo: form.memo || undefined,
        isJointBrokerageRequired: form.isJointBrokerageRequired,
        jointBrokeragePartnerId:
          form.isJointBrokerageRequired && form.jointBrokeragePartnerId
            ? form.jointBrokeragePartnerId
            : null,
      };

      if (activeIntake) {
        await api.listingIntakes.update(activeIntake.id, intakePayload);
        for (const listingPayload of listingPayloads) {
          await api.listingIntakes.addListing(activeIntake.id, listingPayload);
        }
      } else {
        await api.listingIntakes.create({
          propertyId: property.id,
          ...intakePayload,
          listings: listingPayloads,
        });
      }

      // 3) Optional: owner
      if (form.addOwner && form.ownerName.trim()) {
        await api.propertyContacts.createWithNewContact({
          propertyId: property.id,
          role: 'owner',
          name: form.ownerName.trim(),
          phone: form.ownerPhone.trim() || undefined,
          isPrimary: true,
        });
      }

      // 4) Optional: tenant
      if (form.hasTenant && form.tenantName.trim()) {
        await api.tenants.createWithNewContact({
          propertyId: property.id,
          name: form.tenantName.trim(),
          phone: form.tenantPhone.trim() || undefined,
          deposit: form.tenantDeposit ? Number(form.tenantDeposit) : undefined,
          monthlyRent: form.tenantMonthlyRent
            ? Number(form.tenantMonthlyRent)
            : undefined,
          contractStart: form.tenantContractStart || undefined,
          contractEnd: form.tenantContractEnd || undefined,
        });
      }

      return { property };
    },
    onSuccess: ({ property }) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
      toast.success('매물이 등록되었습니다.');
      const detailRoute = `/properties/${property.id}`;
      const meta = getRouteMeta(detailRoute);
      const resourceKey = tabResourceKeys.entity('property', property.id);
      if (ownerTabIdRef.current) {
        replaceTabResource(ownerTabIdRef.current, {
          route: detailRoute,
          kind: meta.kind,
          title: meta.title,
          resourceKey,
        });
      } else {
        openOrRevealResource({
          route: detailRoute,
          kind: meta.kind,
          title: meta.title,
          resourceKey,
        });
      }
    },
    onError: (e: Error) => {
      setError(e.message || '매물 등록에 실패했습니다.');
      toast.error(e.message || '매물 등록에 실패했습니다.');
    },
  });

  const submitLabel = existingProperty ? '기존 매물에 거래 추가' : '매물 등록';
  const handleCancel = () => {
    if (ownerTabIdRef.current) {
      closeTab(ownerTabIdRef.current);
      return;
    }
    const meta = getRouteMeta('/properties');
    openModule({ route: '/properties', kind: meta.kind, title: meta.title });
  };

  return (
    <div className="-m-4 flex min-h-0 flex-1 flex-col bg-background">
      <header className="border-b px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-lg font-semibold">매물 등록</h1>
          <span className="text-xs text-muted-foreground">가격 단위: 만원</span>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          mutation.mutate();
        }}
        className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] gap-5 overflow-auto px-6 py-5"
      >
        <div className="min-w-0 space-y-5">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-strong">
              {error}
            </div>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Section
              step={1}
              title="단지 / 호실"
              subtitle="관리 중인 단지 또는 전체 단지에서 선택합니다."
            >
              <FieldRow label="단지" required>
                <SitePicker
                  value={form.siteId}
                  displayName={form.siteName}
                  onChange={(site) => {
                    set('siteId', site.id);
                    set('siteName', site.name);
                    set('siteType', site.type);
                    set('dongId', '');
                    set('unitId', '');
                  }}
                />
              </FieldRow>

              {form.siteId && (
                <p className="text-xs text-muted-foreground">
                  유형:{' '}
                  <span className="font-medium text-foreground">
                    {SITE_TYPE_LABELS[form.siteType] ?? form.siteType}
                  </span>
                  {!allowsUnit && <> — 호실 구분 없이 Property 한 건으로 관리합니다.</>}
                  {isHouse && (
                    <>
                      {' '}— 통건물·호실 단위 둘 다 등록할 수 있어요. 호실을 비워두면
                      통건물로 등록됩니다.
                    </>
                  )}
                </p>
              )}

              {form.siteId && allowsUnit && !isPlaceholderOnly && (
                <FieldRow label="동" required={needsUnit}>
                  <Select
                    value={form.dongId}
                    onValueChange={(v) => {
                      set('dongId', v);
                      set('unitId', '');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={isHouse ? '동 선택 (통건물이면 비워두세요)' : '동 선택'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleDongs.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isHouse && visibleDongs.length === 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      등록된 동이 없습니다. 호실 단위로 관리하려면{' '}
                      <Link to="/sites" className="underline">
                        단지 관리에서 동/호를 먼저 추가
                      </Link>
                      하세요. 비워두면 통건물로 등록됩니다.
                    </p>
                  )}
                </FieldRow>
              )}

              {form.siteId && allowsUnit && effectiveDongId && (
                <FieldRow label="호실" required={needsUnit}>
                  <Select
                    value={form.unitId || (isHouse ? '__whole__' : '')}
                    onValueChange={(v) => set('unitId', v === '__whole__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="호실 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {isHouse && (
                        <SelectItem value="__whole__">통건물 (호실 없음)</SelectItem>
                      )}
                      {(units ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                          {u.floor != null ? ` · ${u.floor}층` : ''}
                          {u.siteUnitType?.name ? ` · ${u.siteUnitType.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedUnit && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {selectedUnit.siteUnitType?.exclusiveAreaM2 != null && (
                        <>
                          전용 {sqmToPyeong(Number(selectedUnit.siteUnitType.exclusiveAreaM2))}평
                          ({Number(selectedUnit.siteUnitType.exclusiveAreaM2).toFixed(1)}m²)
                        </>
                      )}
                      {selectedUnitRoomCount != null && (
                        <> · {selectedUnitRoomCount}룸</>
                      )}
                      {selectedUnitBathRoomCount != null && (
                        <>/{selectedUnitBathRoomCount}욕실</>
                      )}
                    </p>
                  )}
                  {units && units.length === 0 && (
                    <p className="mt-1.5 text-xs text-warning-strong">
                      등록된 호실이 없습니다.{' '}
                      <Link to="/sites" className="underline">
                        단지 관리에서 호실을 먼저 추가하세요.
                      </Link>
                    </p>
                  )}
                </FieldRow>
              )}

              {existingProperty && (
                <ExistingPropertyNotice
                  property={existingProperty}
                  needsUnit={needsUnit || Boolean(effectiveUnitId)}
                />
              )}
            </Section>

            <Section step={2} title="거래 정보" subtitle="가격은 만원 단위입니다.">
              <FieldRow label="거래유형" required>
                <div className="flex gap-2">
                  {(['sale', 'jeonse', 'monthly'] as TransactionType[]).map((t) => {
                    const hasExisting = (existingProperty?.listings ?? []).some(
                      (l) => l.transactionType === t,
                    );
                    const selected = form.transactionTypes.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set('transactionTypes', toggleTransactionType(form.transactionTypes, t))}
                        className={`relative flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input bg-background hover:bg-muted'
                        }`}
                      >
                        {TX_LABELS[t]}
                        {hasExisting && (
                          <span className="ml-1.5 text-[11px] opacity-70" title="이미 등록된 거래">
                            ●
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </FieldRow>
              {txConflicts.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-strong">
                  이 호실에 이미 <b>{txConflicts.map((listing) => TX_LABELS[listing.transactionType] ?? listing.transactionType).join(', ')}</b> 매물이 있습니다.
                  다른 거래유형을 선택하거나 기존 매물을 수정하세요.
                </div>
              )}

              {form.transactionTypes.includes('sale') && (
                <FieldRow
                  label="매매가 (만원)"
                  required
                  hint={form.salePrice ? formatMoney(Number(form.salePrice)) : '예: 158000 = 15억 8천만'}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label="매매가 만원"
                    value={form.salePrice}
                    onChange={(e) => set('salePrice', e.target.value)}
                    placeholder="158000"
                  />
                </FieldRow>
              )}

              {form.transactionTypes.includes('jeonse') && (
                <FieldRow
                  label="전세가 (만원)"
                  required
                  hint={form.jeonsePrice ? formatMoney(Number(form.jeonsePrice)) : '예: 75000 = 7억 5천만'}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label="전세가 만원"
                    value={form.jeonsePrice}
                    onChange={(e) => set('jeonsePrice', e.target.value)}
                    placeholder="75000"
                  />
                </FieldRow>
              )}

              {form.transactionTypes.includes('monthly') && (
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow
                    label="보증금 (만원)"
                    hint={form.monthlyDeposit ? formatMoney(Number(form.monthlyDeposit)) : undefined}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      aria-label="월세 보증금 만원"
                      value={form.monthlyDeposit}
                      onChange={(e) => set('monthlyDeposit', e.target.value)}
                      placeholder="3000"
                    />
                  </FieldRow>
                  <FieldRow
                    label="월세 (만원)"
                    required
                    hint={form.monthlyRent ? `${Number(form.monthlyRent).toLocaleString()}만/월` : undefined}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      aria-label="월세 만원"
                      value={form.monthlyRent}
                      onChange={(e) => set('monthlyRent', e.target.value)}
                      placeholder="80"
                    />
                  </FieldRow>
                </div>
              )}

              <FieldRow label="입주 가능">
                <Select
                  value={form.moveInAvailableType}
                  onValueChange={(v) => set('moveInAvailableType', v as MoveInType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOVE_IN_TYPES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              {form.moveInAvailableType === 'date' && (
                <FieldRow label="입주 가능일">
                  <Input
                    type="date"
                    aria-label="입주 가능일"
                    value={form.moveInAvailableFrom}
                    onChange={(e) => set('moveInAvailableFrom', e.target.value)}
                  />
                </FieldRow>
              )}

              {form.moveInAvailableType === 'range' && (
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="시작">
                    <Input
                      type="date"
                      aria-label="입주 가능 시작일"
                      value={form.moveInAvailableFrom}
                      onChange={(e) => set('moveInAvailableFrom', e.target.value)}
                    />
                  </FieldRow>
                  <FieldRow label="종료">
                    <Input
                      type="date"
                      aria-label="입주 가능 종료일"
                      value={form.moveInAvailableTo}
                      onChange={(e) => set('moveInAvailableTo', e.target.value)}
                    />
                  </FieldRow>
                </div>
              )}

              <Separator className="my-1" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">공동중개 필수</div>
                  <p className="text-xs text-muted-foreground">특정 파트너와 진행해야 할 때 켜세요.</p>
                </div>
                <Switch
                  aria-label="공동중개 필수"
                  checked={form.isJointBrokerageRequired}
                  onCheckedChange={(v) => set('isJointBrokerageRequired', v)}
                />
              </div>
              {form.isJointBrokerageRequired && (
                <FieldRow label="파트너 중개사">
                  <Select
                    value={form.jointBrokeragePartnerId}
                    onValueChange={(v) => set('jointBrokeragePartnerId', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="선택 안 함" />
                    </SelectTrigger>
                    <SelectContent>
                      {(partners ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.phone ? ` · ${p.phone}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              )}
            </Section>
          </div>

          <Section
            step={3}
            title="비용 정보"
            subtitle="관리비·융자금은 만원 단위. 권리금은 상가 매물에서만 입력합니다."
          >
            <ListingCostFields
              value={{
                maintenanceFee: form.maintenanceFee,
                maintenanceFeeIncludes: form.maintenanceFeeIncludes,
                loanAmount: form.loanAmount,
                premium: form.premium,
              }}
              onChange={(key, fieldValue) =>
                setForm((prev) => ({ ...prev, [key]: fieldValue }))
              }
              showPremium={isCommercial}
              isJeonse={form.transactionTypes.includes('jeonse')}
            />
          </Section>

          <Section step={4} title="메모" subtitle="매물·집주인 특이사항을 자유롭게.">
            <Textarea
              value={form.memo}
              onChange={(e) => set('memo', e.target.value)}
              rows={3}
              placeholder="예) 남향, 풀옵션, 6월 이사 가능, 집주인 연락 잦음"
            />
            <PrivateMemoField
              value={form.privateMemo}
              onChange={(value) => set('privateMemo', value)}
            />
          </Section>

          <Section step={5} title="관련인" subtitle="등록 안 해도 나중에 추가할 수 있어요.">
          <div className="rounded-md border bg-card">
            <div className="flex items-center justify-between p-3">
              <div>
                <div className="text-sm font-medium">집주인 / 소유자</div>
                <p className="text-xs text-muted-foreground">
                  이름·전화번호만 입력하면 Contact가 자동 생성됩니다.
                </p>
              </div>
              <Switch
                aria-label="집주인 또는 소유자 추가"
                checked={form.addOwner}
                onCheckedChange={(v) => set('addOwner', v)}
              />
            </div>
            {form.addOwner && (
              <div className="grid grid-cols-2 gap-3 border-t p-3">
                <FieldRow label="이름" required>
                  <Input
                    aria-label="소유자 이름"
                    value={form.ownerName}
                    onChange={(e) => set('ownerName', e.target.value)}
                    placeholder="홍길동"
                  />
                </FieldRow>
                <FieldRow label="전화번호">
                  <Input
                    aria-label="소유자 전화번호"
                    value={form.ownerPhone}
                    onChange={(e) => set('ownerPhone', e.target.value)}
                    placeholder="010-1234-5678"
                  />
                </FieldRow>
              </div>
            )}
          </div>

          <div className="rounded-md border bg-card">
            <div className="flex items-center justify-between p-3">
              <div>
                <div className="text-sm font-medium">현재 임차인</div>
                <p className="text-xs text-muted-foreground">
                  현재 임차 중이라면 켜고, 계약 만료일까지 함께 기록하세요.
                </p>
              </div>
              <Switch
                aria-label="현재 임차인 추가"
                checked={form.hasTenant}
                onCheckedChange={(v) => set('hasTenant', v)}
              />
            </div>
            {form.hasTenant && (
              <div className="grid grid-cols-2 gap-3 border-t p-3">
                <FieldRow label="이름" required>
                  <Input
                    aria-label="임차인 이름"
                    value={form.tenantName}
                    onChange={(e) => set('tenantName', e.target.value)}
                    placeholder="김임차"
                  />
                </FieldRow>
                <FieldRow label="전화번호">
                  <Input
                    aria-label="임차인 전화번호"
                    value={form.tenantPhone}
                    onChange={(e) => set('tenantPhone', e.target.value)}
                    placeholder="010-2222-3333"
                  />
                </FieldRow>
                <FieldRow label="보증금 (만원)">
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label="임차인 보증금 만원"
                    value={form.tenantDeposit}
                    onChange={(e) => set('tenantDeposit', e.target.value)}
                  />
                </FieldRow>
                <FieldRow label="월세 (만원)">
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label="임차인 월세 만원"
                    value={form.tenantMonthlyRent}
                    onChange={(e) => set('tenantMonthlyRent', e.target.value)}
                  />
                </FieldRow>
                <FieldRow label="계약 시작">
                  <Input
                    type="date"
                    aria-label="임차 계약 시작일"
                    value={form.tenantContractStart}
                    onChange={(e) => set('tenantContractStart', e.target.value)}
                  />
                </FieldRow>
                <FieldRow label="계약 만료">
                  <Input
                    type="date"
                    aria-label="임차 계약 만료일"
                    value={form.tenantContractEnd}
                    onChange={(e) => set('tenantContractEnd', e.target.value)}
                  />
                </FieldRow>
              </div>
            )}
          </div>
          </Section>
        </div>

        <RegistrationSummaryPanel
          form={form}
          needsUnit={needsUnit}
          selectedDongName={selectedDong?.isPlaceholder ? '' : selectedDong?.name}
          selectedUnitName={selectedUnit?.name}
          existingProperty={existingProperty}
          activeIntakeExists={Boolean(activeIntake)}
          txConflicts={txConflicts}
          isSubmitting={mutation.isPending}
          submitLabel={submitLabel}
          onCancel={handleCancel}
        />
      </form>
    </div>
  );
}

function RegistrationSummaryPanel({
  form,
  needsUnit,
  selectedDongName,
  selectedUnitName,
  existingProperty,
  activeIntakeExists,
  txConflicts,
  isSubmitting,
  submitLabel,
  onCancel,
}: {
  form: FormState;
  needsUnit: boolean;
  selectedDongName?: string;
  selectedUnitName?: string;
  existingProperty: Property | null;
  activeIntakeExists: boolean;
  txConflicts: PropertyListing[];
  isSubmitting: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  const siteLabel = form.siteName || '단지 미선택';
  const unitLabel = needsUnit
    ? [selectedDongName, selectedUnitName].filter(Boolean).join(' ') || '호실 미선택'
    : SITE_TYPE_LABELS[form.siteType] ?? '호실 구분 없음';
  const amountLabel = getListingAmountLabel(form);
  const moveInLabel =
    MOVE_IN_TYPES.find((option) => option.value === form.moveInAvailableType)?.label ?? '미정';

  return (
    <aside className="min-w-0">
      <div className="sticky top-0 space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">등록 요약</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            저장하면 매물 상세 탭이 열리고 이 등록 탭은 닫힙니다.
          </p>
        </div>

        <Separator />

        <dl className="space-y-3 text-sm">
          <SummaryRow label="위치" value={siteLabel} muted={!form.siteId} />
          <SummaryRow label="호실" value={unitLabel} muted={needsUnit && !selectedUnitName} />
          <SummaryRow label="거래" value={form.transactionTypes.map((type) => TX_LABELS[type]).join(', ')} />
          <SummaryRow label="금액" value={amountLabel} muted={!amountLabel} />
          <SummaryRow label="입주" value={moveInLabel} />
        </dl>

        <div className="space-y-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {existingProperty ? (
            <p>기존 Property에 새 거래를 추가합니다.</p>
          ) : (
            <p>저장 시 새 Property와 거래 의뢰가 함께 생성됩니다.</p>
          )}
          {activeIntakeExists && <p>진행 중인 의뢰 묶음에 거래가 추가됩니다.</p>}
          {form.addOwner && <p>소유자 연락처가 함께 생성됩니다.</p>}
          {form.hasTenant && <p>현재 임차인 정보가 함께 생성됩니다.</p>}
        </div>

        {txConflicts.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning-soft p-3 text-xs text-warning-strong">
            같은 거래유형이 이미 있어 저장할 수 없습니다.
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button type="submit" disabled={isSubmitting || txConflicts.length > 0}>
            {isSubmitting ? '등록 중...' : submitLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
        </div>
      </div>
    </aside>
  );
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={muted ? 'truncate text-muted-foreground-strong' : 'truncate text-foreground'}>
        {value || '-'}
      </dd>
    </div>
  );
}

function getListingAmountLabel(form: FormState) {
  const parts: string[] = [];

  if (form.transactionTypes.includes('sale') && form.salePrice) {
    parts.push(`매매 ${formatMoney(Number(form.salePrice))}`);
  }

  if (form.transactionTypes.includes('jeonse') && form.jeonsePrice) {
    parts.push(`전세 ${formatMoney(Number(form.jeonsePrice))}`);
  }

  if (form.transactionTypes.includes('monthly') && (form.monthlyDeposit || form.monthlyRent)) {
    parts.push(`월세 보증금 ${form.monthlyDeposit ? formatMoney(Number(form.monthlyDeposit)) : '-'} / 월 ${
      form.monthlyRent ? `${Number(form.monthlyRent).toLocaleString()}만` : '-'
    }`);
  }

  return parts.join(' · ');
}

// api-client의 CreateListingForIntakeDto에는 아직 비용 필드 타입이 없지만
// 서버(listing-intakes.service)는 이미 지원한다 — 로컬 확장 타입으로 전달.
type IntakeListingPayload = CreateListingForIntakeDto & {
  maintenanceFee?: number;
  maintenanceFeeIncludes?: string[];
  loanAmount?: number;
  premium?: number;
  privateMemo?: string;
};

function buildListingPayloads(form: FormState, isCommercial: boolean): IntakeListingPayload[] {
  const common = {
    moveInAvailableType: form.moveInAvailableType,
    moveInAvailableFrom: form.moveInAvailableFrom || undefined,
    moveInAvailableTo: form.moveInAvailableTo || undefined,
    maintenanceFee: form.maintenanceFee ? Number(form.maintenanceFee) : undefined,
    maintenanceFeeIncludes:
      form.maintenanceFeeIncludes.length > 0 ? form.maintenanceFeeIncludes : undefined,
    loanAmount: form.loanAmount ? Number(form.loanAmount) : undefined,
    premium: isCommercial && form.premium ? Number(form.premium) : undefined,
    privateMemo: form.privateMemo.trim() || undefined,
  };

  return form.transactionTypes.map((transactionType) => {
    if (transactionType === 'sale') {
      return {
        ...common,
        transactionType,
        price: Number(form.salePrice),
      };
    }

    if (transactionType === 'jeonse') {
      return {
        ...common,
        transactionType,
        price: Number(form.jeonsePrice),
      };
    }

    return {
      ...common,
      transactionType,
      deposit: form.monthlyDeposit ? Number(form.monthlyDeposit) : undefined,
      monthlyRent: Number(form.monthlyRent),
    };
  });
}

// ============================================================
// ExistingPropertyNotice — same Site/Unit already has a Property
// ============================================================

function ExistingPropertyNotice({
  property,
  needsUnit,
}: {
  property: Property;
  needsUnit: boolean;
}) {
  const listings = property.listings ?? [];
  return (
    <div className="rounded-md border border-info/40 bg-info-soft px-3 py-2.5 text-xs text-info-strong">
      <div className="font-medium">
        {needsUnit ? '이 호실' : '이 부동산'}은 이미 등록되어 있어요.
      </div>
      {listings.length > 0 ? (
        <div className="mt-1">
          현재 등록된 거래:
          <ul className="mt-1 space-y-0.5">
            {listings.map((l) => (
              <li key={l.id} className="flex items-center gap-1.5">
                <span className="inline-block min-w-9 rounded-sm bg-background/70 px-1.5 py-px text-[11px] font-medium">
                  {TX_LABELS[l.transactionType as keyof typeof TX_LABELS] ??
                    l.transactionType}
                </span>
                <span>
                  {l.transactionType === 'monthly'
                    ? `보증금 ${l.deposit ? formatMoney(l.deposit) : '-'} / 월 ${l.monthlyRent?.toLocaleString() ?? '-'}만`
                    : l.price
                      ? formatMoney(l.price)
                      : '가격 미입력'}
                </span>
                <Link
                  to="/properties/$id"
                  params={{ id: property.id }}
                  className="ml-auto underline"
                >
                  상세
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 text-info-strong">
            아래 거래유형을 골라 새 거래를 추가하거나, 상세에서 기존 거래를 수정할 수 있어요.
          </div>
        </div>
      ) : (
        <div className="mt-1">
          등록된 거래는 아직 없어요. 새 거래를 이 부동산에 추가합니다.
        </div>
      )}
    </div>
  );
}

// Section / FieldRow는 ./-new-form-ui 에서 import.

// ============================================================
// SitePicker — OfficeSite (managed) + central search
// ============================================================

function SitePicker({
  value,
  displayName,
  onChange,
}: {
  value: string;
  displayName: string;
  onChange: (site: { id: string; name: string; type: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data: officeSites } = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  });

  const { data: centralHits, isFetching: isSearching } = useQuery({
    queryKey: ['site-search', query],
    queryFn: () => api.officeSites.searchCentral(query),
    enabled: query.trim().length >= 1,
    staleTime: 10_000,
  });

  // Filter office sites by query locally for instant feedback
  const filteredManaged = useMemo(() => {
    const q = query.trim();
    const all = officeSites ?? [];
    if (!q) return all;
    return all.filter((os) =>
      (os.site?.name ?? '').toLowerCase().includes(q.toLowerCase()),
    );
  }, [officeSites, query]);

  // Hide central hits that are already in managed list
  const managedSiteIds = useMemo(
    () => new Set((officeSites ?? []).map((os) => os.siteId)),
    [officeSites],
  );
  const filteredCentral = (centralHits ?? []).filter(
    (s) => !managedSiteIds.has(s.id),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span className="flex items-center gap-2 truncate">
              <Building2 className="size-3.5 text-muted-foreground" />
              {displayName}
            </span>
          ) : (
            <span className="text-muted-foreground">단지를 검색하거나 선택</span>
          )}
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="단지명으로 검색"
          />
          <CommandList>
            <CommandEmpty>
              {isSearching ? '검색 중…' : '일치하는 단지가 없습니다.'}
            </CommandEmpty>

            {filteredManaged.length > 0 && (
              <CommandGroup heading="관리 단지">
                {filteredManaged.map((os) => {
                  const s = os.site;
                  if (!s) return null;
                  return (
                    <CommandItem
                      key={s.id}
                      value={s.id}
                      onSelect={() => {
                        onChange({ id: s.id, name: s.name, type: s.type });
                        setOpen(false);
                      }}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        {value === s.id && <Check className="size-3.5" />}
                        <span className="truncate">{s.name}</span>
                      </span>
                      <Badge variant="secondary" className="text-[11px]">
                        {SITE_TYPE_LABELS[s.type] ?? s.type}
                      </Badge>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {filteredCentral.length > 0 && (
              <CommandGroup heading="전체 단지">
                {filteredCentral.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onSelect={async () => {
                      // Auto-add to office's managed list, then select
                      try {
                        await api.officeSites.add({ siteId: s.id });
                      } catch {
                        /* may already be managed */
                      }
                      onChange({ id: s.id, name: s.name, type: s.type });
                      setOpen(false);
                    }}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Search className="size-3.5 text-muted-foreground" />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <Badge variant="outline" className="text-[11px]">
                      {SITE_TYPE_LABELS[s.type] ?? s.type}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup>
              <CommandItem asChild value="__new__">
                <Link
                  to="/sites"
                  className="flex items-center gap-2 text-sm text-primary"
                >
                  + 새 단지 등록하기
                </Link>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
