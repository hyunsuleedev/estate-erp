import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Check, ChevronsUpDown, Search } from 'lucide-react';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';
import type { Property, PropertyListing } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export const Route = createFileRoute('/_authenticated/properties/new')({
  component: NewPropertyPage,
});

// Site types that have Dong/Unit hierarchy (need unit selection)
const UNIT_BEARING_TYPES = new Set([
  'apartment',
  'officetel',
  'villa',
  'commercial',
  'living_accommodation',
]);

const SITE_TYPE_LABELS: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라/다세대',
  house: '단독/다가구',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

const TX_LABELS = { sale: '매매', jeonse: '전세', monthly: '월세' } as const;

const MOVE_IN_TYPES = [
  { value: 'immediate', label: '즉시 입주' },
  { value: 'date', label: '특정 날짜' },
  { value: 'range', label: '기간 협의' },
  { value: 'negotiable', label: '날짜 협의' },
  { value: 'unknown', label: '미정' },
] as const;

type TransactionType = 'sale' | 'jeonse' | 'monthly';
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
  transactionType: TransactionType;
  price: string;
  deposit: string;
  monthlyRent: string;
  moveInAvailableType: MoveInType;
  moveInAvailableFrom: string;
  moveInAvailableTo: string;
  isJointBrokerageRequired: boolean;
  jointBrokeragePartnerId: string;

  // Step 4: Property memo
  memo: string;

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
  transactionType: 'sale',
  price: '',
  deposit: '',
  monthlyRent: '',
  moveInAvailableType: 'negotiable',
  moveInAvailableFrom: '',
  moveInAvailableTo: '',
  isJointBrokerageRequired: false,
  jointBrokeragePartnerId: '',
  memo: '',
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState('');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const needsUnit = UNIT_BEARING_TYPES.has(form.siteType);

  const { data: dongs } = useQuery({
    queryKey: ['dongs', form.siteId],
    queryFn: () => api.dongs.findAll(form.siteId),
    enabled: !!form.siteId && needsUnit,
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
    enabled: !!form.siteId && needsUnit && !!effectiveDongId,
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

  // Detect existing Property for the same Site/Unit (find-or-create)
  const siteUnitKeyReady =
    !!form.siteId && (!needsUnit || !!form.unitId);
  const { data: existingProperties } = useQuery({
    queryKey: ['properties', 'lookup', form.siteId, form.unitId, needsUnit],
    queryFn: () =>
      api.properties.findAll({
        siteId: form.siteId,
        unitId: needsUnit ? form.unitId : undefined,
        limit: 5,
      }),
    enabled: siteUnitKeyReady,
  });
  const existingProperty = useMemo<Property | null>(() => {
    const items = existingProperties?.items ?? [];
    if (!needsUnit) {
      // 토지/단독: 한 사무소 한 Site = Property 1건 가정
      return items[0] ?? null;
    }
    return items.find((p) => p.unitId === form.unitId) ?? null;
  }, [existingProperties, form.unitId, needsUnit]);

  const txConflict = useMemo<PropertyListing | null>(() => {
    if (!existingProperty) return null;
    const dup = (existingProperty.listings ?? []).find(
      (l) => l.transactionType === form.transactionType,
    );
    return dup ?? null;
  }, [existingProperty, form.transactionType]);

  const { data: activeIntakes } = useQuery({
    queryKey: ['listing-intakes', 'active', existingProperty?.id],
    queryFn: () =>
      api.listingIntakes.findAll({
        propertyId: existingProperty!.id,
        status: 'active',
        includeHidden: true,
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
      if (form.transactionType === 'sale' || form.transactionType === 'jeonse') {
        if (!form.price) throw new Error('가격을 입력하세요.');
      }
      if (form.transactionType === 'monthly') {
        if (!form.monthlyRent) throw new Error('월세를 입력하세요.');
      }
      if (txConflict) {
        throw new Error(
          `같은 호실에 이미 ${TX_LABELS[form.transactionType]} 매물이 있습니다. 매물 상세에서 수정하세요.`,
        );
      }

      // 1) Property — 이미 있으면 재사용, 없으면 생성
      const property = existingProperty
        ? existingProperty
        : await api.properties.create({
            siteId: form.siteId,
            unitId: form.unitId || undefined,
          });

      // 2) ListingIntake + Listing
      const listingPayload = {
        transactionType: form.transactionType,
        price: form.price ? Number(form.price) : undefined,
        deposit: form.deposit ? Number(form.deposit) : undefined,
        monthlyRent: form.monthlyRent ? Number(form.monthlyRent) : undefined,
        moveInAvailableType: form.moveInAvailableType,
        moveInAvailableFrom: form.moveInAvailableFrom || undefined,
        moveInAvailableTo: form.moveInAvailableTo || undefined,
      };
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
        await api.listingIntakes.addListing(activeIntake.id, listingPayload);
      } else {
        await api.listingIntakes.create({
          propertyId: property.id,
          ...intakePayload,
          listings: [listingPayload],
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
      navigate({ to: '/properties/$id', params: { id: property.id } });
    },
    onError: (e: Error) => {
      setError(e.message || '매물 등록에 실패했습니다.');
    },
  });

  const showPrice =
    form.transactionType === 'sale' || form.transactionType === 'jeonse';
  const showRent = form.transactionType === 'monthly';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-7" asChild>
          <Link to="/properties">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">매물 등록</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          mutation.mutate();
        }}
        className="flex flex-col gap-6"
      >
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Section 1: 단지/호실 */}
        <Section
          step={1}
          title="단지 / 호실"
          subtitle="관리 중인 단지에서 선택하거나, 전체 단지에서 검색해 추가하세요."
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
              {!needsUnit && (
                <>
                  {' '}— 이 유형은 호실 구분 없이 Property 한 건으로 관리합니다.
                </>
              )}
            </p>
          )}

          {form.siteId && needsUnit && !isPlaceholderOnly && (
            <FieldRow label="동" required>
              <Select
                value={form.dongId}
                onValueChange={(v) => {
                  set('dongId', v);
                  set('unitId', '');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="동 선택" />
                </SelectTrigger>
                <SelectContent>
                  {visibleDongs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          )}

          {form.siteId && needsUnit && effectiveDongId && (
            <FieldRow label="호실" required>
              <Select value={form.unitId} onValueChange={(v) => set('unitId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="호실 선택" />
                </SelectTrigger>
                <SelectContent>
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
                      전용{' '}
                      {sqmToPyeong(Number(selectedUnit.siteUnitType.exclusiveAreaM2))}평
                      (
                      {Number(selectedUnit.siteUnitType.exclusiveAreaM2).toFixed(1)}
                      m²)
                    </>
                  )}
                  {selectedUnit.siteUnitType?.roomCount != null && (
                    <> · {selectedUnit.siteUnitType.roomCount}룸</>
                  )}
                  {selectedUnit.siteUnitType?.bathRoomCount != null && (
                    <>/{selectedUnit.siteUnitType.bathRoomCount}욕실</>
                  )}
                </p>
              )}
              {units && units.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">
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
              needsUnit={needsUnit}
            />
          )}
        </Section>

        {/* Section 2: 거래 정보 */}
        <Section step={2} title="거래 정보" subtitle="가격은 만원 단위로 입력합니다.">
          <FieldRow label="거래유형" required>
            <div className="flex gap-2">
              {(['sale', 'jeonse', 'monthly'] as TransactionType[]).map((t) => {
                const hasExisting = (existingProperty?.listings ?? []).some(
                  (l) => l.transactionType === t,
                );
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('transactionType', t)}
                    className={`relative flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                      form.transactionType === t
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-muted'
                    }`}
                  >
                    {TX_LABELS[t]}
                    {hasExisting && (
                      <span
                        className="ml-1.5 text-[10px] opacity-70"
                        title="이미 등록된 거래"
                      >
                        ●
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </FieldRow>
          {txConflict && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              이 호실에 이미 <b>{TX_LABELS[form.transactionType]}</b> 매물이 있습니다.
              새로 만들 수 없어요. 다른 거래유형을 선택하거나, 기존 매물을 수정하세요.
            </div>
          )}

          {showPrice && (
            <FieldRow
              label={`${form.transactionType === 'sale' ? '매매가' : '전세가'} (만원)`}
              required
              hint={
                form.price
                  ? formatPrice(Number(form.price))
                  : '예: 158000 = 15억 8천만'
              }
            >
              <Input
                type="number"
                inputMode="numeric"
                aria-label={`${form.transactionType === 'sale' ? '매매가' : '전세가'} 만원`}
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                placeholder="158000"
              />
            </FieldRow>
          )}

          {showRent && (
            <div className="grid grid-cols-2 gap-3">
              <FieldRow
                label="보증금 (만원)"
                hint={form.deposit ? formatPrice(Number(form.deposit)) : undefined}
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label="월세 보증금 만원"
                  value={form.deposit}
                  onChange={(e) => set('deposit', e.target.value)}
                  placeholder="3000"
                />
              </FieldRow>
              <FieldRow
                label="월세 (만원)"
                required
                hint={
                  form.monthlyRent
                    ? `${Number(form.monthlyRent).toLocaleString()}만/월`
                    : undefined
                }
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

          {/* 공동중개 */}
          <Separator className="my-1" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">공동중개 필수</div>
              <p className="text-xs text-muted-foreground">
                특정 파트너 중개사와만 함께 진행해야 하는 매물일 때 켜세요.
              </p>
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

        {/* Section 3: 메모 */}
        <Section step={3} title="메모" subtitle="매물·집주인 특이사항을 자유롭게.">
          <Textarea
            value={form.memo}
            onChange={(e) => set('memo', e.target.value)}
            rows={3}
            placeholder="예) 남향, 풀옵션, 6월 이사 가능, 집주인 연락 잦음"
          />
        </Section>

        {/* Section 4: 관련인 (옵션) */}
        <Section step={4} title="관련인" subtitle="등록 안 해도 나중에 추가할 수 있어요.">
          {/* Owner */}
          <div className="rounded-lg border bg-card">
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

          {/* Tenant */}
          <div className="rounded-lg border bg-card">
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

        {/* Footer */}
        <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
          <Button variant="ghost" type="button" asChild>
            <Link to="/properties">취소</Link>
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending || !!txConflict}
          >
            {mutation.isPending
              ? '등록 중...'
              : existingProperty
                ? '기존 매물에 거래 추가'
                : '매물 등록'}
          </Button>
        </div>
      </form>
    </div>
  );
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
    <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
      <div className="font-medium">
        {needsUnit ? '이 호실' : '이 부동산'}은 이미 등록되어 있어요.
      </div>
      {listings.length > 0 ? (
        <div className="mt-1">
          현재 등록된 거래:
          <ul className="mt-1 space-y-0.5">
            {listings.map((l) => (
              <li key={l.id} className="flex items-center gap-1.5">
                <span className="inline-block min-w-9 rounded bg-white/60 px-1.5 py-px text-[10px] font-medium">
                  {TX_LABELS[l.transactionType as keyof typeof TX_LABELS] ??
                    l.transactionType}
                </span>
                <span>
                  {l.transactionType === 'monthly'
                    ? `보증금 ${l.deposit ? formatPrice(l.deposit) : '-'} / 월 ${l.monthlyRent?.toLocaleString() ?? '-'}만`
                    : l.price
                      ? formatPrice(l.price)
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
          <div className="mt-1.5 text-blue-800/80">
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

// ============================================================
// Section wrapper
// ============================================================

function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs">
      <header className="mb-4 flex items-baseline gap-2">
        <Badge variant="outline" className="rounded-md">
          {step}
        </Badge>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FieldRow({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs font-medium text-muted-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

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
                      <Badge variant="secondary" className="text-[10px]">
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
                    <Badge variant="outline" className="text-[10px]">
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
