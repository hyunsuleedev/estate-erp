import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Check, ChevronsUpDown, Search } from 'lucide-react';
import { formatUnitLabel, sqmToPyeong, TRANSACTION_TYPE_LABELS, type JsonValue } from '@estate-erp/shared';
import type {
  CreateListingForIntakeDto,
  Property,
  PropertyListing,
} from '@estate-erp/api-client';
import { ApiError } from '@estate-erp/api-client';
import { normalizeHoDraft, registrationSpace, type SpaceDraft, type SpaceScope } from './-registration-space';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney, formatPhone, formatRent } from '@/lib/format';
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
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { useTabScopedState } from '@/features/tabs/hooks/useTabScopedState';
import { useTabTitle } from '@/hooks/use-tab-title';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import {
  toggleTransactionType,
  type NewPropertyTransactionType,
} from './-new-property-view-utils';
import {
  FieldRow,
  ListingCostFields,
  ManwonInput,
  manwonHint,
  PrivateMemoField,
  Section,
  choiceChipClassName,
} from './-new-form-ui';
import { parseManwonText, requireManwon } from './-manwon-input';
import { MOVE_IN_TYPES, type MoveInType } from './-move-in-options';
import { propertyErrorMessage } from './-error-message';
import { formatPhoneWhileTyping, phoneInputProblem, useExistingContactByPhone } from '@/lib/phone';

export interface PropertyRegistrationSearch {
  siteId?: string;
  dongId?: string;
  unitId?: string;
  /** 소유자 칸을 이 연락처로 채워 연다(프로젝트의 "새 매물 의뢰 등록") */
  ownerContactId?: string;
  /** 프로젝트에서 열었으면 저장·취소 뒤 이 프로젝트로 돌아간다 */
  projectId?: string;
}

export interface PropertyRegistrationResult {
  property: Property;
  intakeId: string;
}

interface PropertyRegistrationFormProps {
  searchParams?: PropertyRegistrationSearch;
  presentation?: 'page' | 'drawer';
  onClose?: (animate?: boolean) => void;
  onCreated?: (result: PropertyRegistrationResult) => void;
  onPendingChange?: (pending: boolean) => void;
  onExpanded?: () => void;
  renderToolbar?: (onOpenNewTab: (() => void) | undefined) => ReactNode;
}

// Site types that REQUIRE Dong/Unit hierarchy (unit selection mandatory)
const UNIT_BEARING_TYPES = new Set([
  'apartment',
  'officetel',
  'villa',
  'living_accommodation',
]);

// 단독·다가구와 상가는 건물 전체 또는 지정한 거래 공간을 접수한다.
const OPTIONAL_UNIT_TYPES = new Set(['house', 'commercial']);

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


type TransactionType = NewPropertyTransactionType;

interface FormState extends SpaceDraft {
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
  /** 예전 초안 호환용. 소유자 칸은 이제 늘 보인다 — 이름이 있으면 저장한다. */
  addOwner?: boolean;
  ownerName: string;
  ownerPhone: string;
  /** 연락처에서 고른 기존 소유자. 있으면 이름·전화 칸 대신 이 사람을 연결한다. */
  ownerContact?: { id: string; name: string; phone: string | null } | null;
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
  ownerName: '',
  ownerPhone: '',
  ownerContact: null,
  hasTenant: false,
  tenantName: '',
  tenantPhone: '',
  tenantDeposit: '',
  tenantMonthlyRent: '',
  tenantContractStart: '',
  tenantContractEnd: '',
};

export function PropertyRegistrationForm({
  searchParams = {},
  presentation = 'page',
  onClose,
  onCreated,
  onPendingChange,
  onExpanded,
  renderToolbar,
}: PropertyRegistrationFormProps) {
  const isDrawer = presentation === 'drawer';
  const queryClient = useQueryClient();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const replaceTabResource = useTabStore((s) => s.replaceTabResource);
  const openOrRevealResource = useTabStore((s) => s.openOrRevealResource);
  const openModule = useTabStore((s) => s.openModule);
  const closeTab = useTabStore((s) => s.closeTab);
  const createTab = useTabStore((s) => s.createTab);
  // 저장 요청 도중 사용자가 다른 탭으로 전환해도 이 draft의 탭만 전환한다.
  const ownerTabIdRef = useRef(activeTabId);
  // Tab arguments stay in memory/IPC, never in the URL. Each expansion owns a
  // distinct tab, so it cannot overwrite another registration already in progress.
  const [expandedDraft] = useState(() => {
    if (isDrawer) return undefined;
    const owner = useTabStore.getState().tabs.find((tab) => tab.id === ownerTabIdRef.current);
    return owner?.routeParams?.propertyRegistrationDraft as unknown as FormState | undefined;
  });
  const formDraftKey = isDrawer ? 'property-registration-drawer:form:v1' : 'property-new:form:v1';
  const prefillDraftKey = isDrawer ? 'property-registration-drawer:prefill:v1' : 'property-new:prefill-applied:v1';
  const [form, setForm] = useTabScopedState<FormState>(
    formDraftKey,
    expandedDraft ?? initialForm,
  );
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const [prefillApplied, setPrefillApplied] = useTabScopedState(
    prefillDraftKey,
    false,
  );
  useEffect(() => {
    if (!expandedDraft) return;
    const owner = useTabStore.getState().tabs.find((tab) => tab.id === ownerTabIdRef.current);
    if (owner?.uiState?.formDraft?.[formDraftKey] === undefined) setForm(expandedDraft);
  }, [expandedDraft, formDraftKey, setForm]);

  const resetDraft = () => {
    setForm(initialForm);
    setPrefillApplied(false);
    const store = useTabStore.getState();
    const ownerId = ownerTabIdRef.current;
    const drafts = store.tabs.find((tab) => tab.id === ownerId)?.uiState?.formDraft;
    // Preserve unrelated drafts owned by the list tab.
    if (ownerId && drafts && Object.keys(drafts).every((key) => key === formDraftKey || key === prefillDraftKey)) {
      store.clearTabFormDraft(ownerId);
    }
  };
  // 탭 제목은 "매물 등록"(프로젝트에서 열어도 프로젝트 이름이 붙지 않게)
  useTabTitle(isDrawer ? null : '매물 등록');
  const returnProjectId = isDrawer ? undefined : searchParams.projectId;
  /** 프로젝트에서 온 등록이면 이 탭을 그 프로젝트로 되돌린다. 되돌렸으면 true */
  const returnToProject = () => {
    if (!returnProjectId || !ownerTabIdRef.current) return false;
    const route = `/projects/${returnProjectId}`;
    const meta = getRouteMeta(route);
    replaceTabResource(ownerTabIdRef.current, {
      route,
      kind: meta.kind,
      title: meta.title,
      resourceKey: tabResourceKeys.entity('project', returnProjectId),
    });
    return true;
  };

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ block: 'nearest' });
    errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // sites 페이지에서 ?siteId=&dongId=&unitId= 로 진입 시 해당 단계 프리필
  const { data: prefillSite } = useQuery({
    queryKey: ['sites', 'prefill', searchParams.siteId],
    queryFn: () => api.sites.findOne(searchParams.siteId as string),
    enabled: Boolean(searchParams.siteId) && !prefillApplied,
  });

  // 소유자 미리 채우기 — 한 번만(사용자가 "바꾸기"로 지운 뒤 다시 채우지 않게)
  const [ownerPrefillApplied, setOwnerPrefillApplied] = useTabScopedState(
    isDrawer ? 'property-registration-drawer:owner-prefill:v1' : 'property-new:owner-prefill:v1',
    false,
  );
  const { data: prefillOwner } = useQuery({
    queryKey: ['contacts', searchParams.ownerContactId],
    queryFn: () => api.contacts.findOne(searchParams.ownerContactId as string),
    enabled: Boolean(searchParams.ownerContactId) && !ownerPrefillApplied,
  });
  useEffect(() => {
    if (!prefillOwner || ownerPrefillApplied) return;
    setForm((prev) => ({
      ...prev,
      ownerContact: { id: prefillOwner.id, name: prefillOwner.name, phone: prefillOwner.phone ?? null },
      ownerName: '',
      ownerPhone: '',
    }));
    setOwnerPrefillApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillOwner, ownerPrefillApplied]);

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

  const flexible = OPTIONAL_UNIT_TYPES.has(form.siteType);
  const scope = flexible ? form.scope ?? (form.siteType === 'house' && !form.unitId ? 'whole' : 'unit') : 'unit';
  const allowsUnit = flexible || UNIT_BEARING_TYPES.has(form.siteType);
  const needsUnit = allowsUnit && scope !== 'whole';
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
  const effectiveDongId = visibleDongs.length === 1
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

  const wholeDong = scope === 'whole' && visibleDongs.length > 1;
  // 목록에 없는 호실·구획을 그 자리에서 적는다. 상가·단독뿐 아니라 아파트·오피스텔도
  // (대장에 빠진 호가 있을 때 단지 관리 화면으로 돌아가지 않게)
  const newPart = allowsUnit && scope === 'unit' && form.unitId === '__new_space__';
  const draftSpace = scope === 'floors' || newPart || wholeDong;
  let space: ReturnType<typeof registrationSpace> = null;
  let spaceError = '';
  if (draftSpace) {
    try {
      space = registrationSpace(
        newPart && !flexible ? normalizeHoDraft({ ...form, scope }) : { ...form, scope },
        wholeDong,
      );
    } catch (cause) {
      spaceError = cause instanceof Error ? cause.message : '공간 정보를 확인하세요.';
    }
  }
  const matchingUnit = space && units?.find((unit) =>
    unit.name === space.name && unit.floor === space.floor && (unit.floorEnd ?? null) === space.floorEnd);
  const effectiveUnitId = draftSpace ? matchingUnit?.id : scope === 'unit' ? form.unitId || null : null;
  const siteUnitKeyReady = !!form.siteId && (!!effectiveUnitId || (!needsUnit && !wholeDong && (!flexible || !!dongs)));
  const { data: existingProperties } = useQuery({
    queryKey: ['properties', 'lookup', form.siteId, effectiveUnitId],
    queryFn: () =>
      api.properties.findAll({
        siteId: form.siteId,
        unitId: effectiveUnitId ?? undefined,
        withoutUnit: effectiveUnitId ? undefined : true,
        limit: 1,
      }),
    enabled: Boolean(siteUnitKeyReady),
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
    queryKey: ['listing-intakes', 'non-closed', existingProperty?.id],
    queryFn: () =>
      api.listingIntakes.findAll({
        propertyId: existingProperty!.id,
        limit: 1,
      }),
    enabled: !!existingProperty?.id,
  });
  const activeIntake = activeIntakes?.items?.[0] ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      // Validate
      if (!form.siteId) throw new Error('단지를 선택하세요.');
      if (flexible && !dongs) throw new Error('건물 목록을 확인한 뒤 등록하세요.');
      if ((draftSpace || needsUnit) && !effectiveDongId) {
        throw new Error(dongs && dongs.length === 0
          ? flexible
            ? '이 단지에는 건물(동) 정보가 없습니다. 거래 공간을 "건물 전체"로 고르거나 단지 관리에서 건물을 먼저 등록하세요.'
            : '이 단지에는 동·호 정보가 없습니다. 단지 관리에서 동과 호를 먼저 등록하세요.'
          : '동을 선택하세요.');
      }
      if (spaceError) throw new Error(spaceError);
      if (newPart && matchingUnit && form.partArea?.trim() &&
        Number(matchingUnit.exclusiveAreaM2) !== Number(form.partArea)) {
        throw new Error('같은 이름과 층에 면적이 다른 공간이 있습니다. 기존 공간을 확인하세요.');
      }
      if (needsUnit && !draftSpace && !selectedUnit)
        throw new Error('호실을 선택하세요. 목록에 없으면 "목록에 없는 호실 입력"을 고르세요.');
      if (form.transactionTypes.includes('sale') && requireManwon(form.salePrice, '매매가를') === undefined) {
        throw new Error('매매가를 입력하세요.');
      }
      if (form.transactionTypes.includes('jeonse') && requireManwon(form.jeonsePrice, '전세가를') === undefined) {
        throw new Error('전세가를 입력하세요.');
      }
      if (form.transactionTypes.includes('monthly')) {
        requireManwon(form.monthlyDeposit, '보증금을');
        if (requireManwon(form.monthlyRent, '월세를') === undefined) throw new Error('월세를 입력하세요.');
      }
      requireManwon(form.maintenanceFee, '관리비를');
      requireManwon(form.loanAmount, '융자금을');
      if (isCommercial) requireManwon(form.premium, '권리금을');
      if (form.hasTenant) {
        requireManwon(form.tenantDeposit, '임차인 보증금을');
        requireManwon(form.tenantMonthlyRent, '임차인 월세를');
      }
      if (!form.ownerContact && form.ownerPhone.trim() && phoneInputProblem(form.ownerPhone)) {
        throw new Error(`소유자 ${phoneInputProblem(form.ownerPhone)}`);
      }
      if (form.hasTenant && form.tenantPhone.trim() && phoneInputProblem(form.tenantPhone)) {
        throw new Error(`임차인 ${phoneInputProblem(form.tenantPhone)}`);
      }
      if (!form.ownerContact && !form.ownerName.trim() && form.ownerPhone.trim()) {
        throw new Error('소유자 이름을 입력하세요. 이름 없이 전화번호만 저장할 수는 없습니다.');
      }
      if (form.hasTenant && !form.tenantName.trim()) {
        throw new Error('임차인 이름을 입력하세요. 임차인이 없으면 "현재 임차인"을 끄세요.');
      }
      if (txConflicts.length > 0) {
        throw new Error(
          `같은 호실에 이미 ${txConflicts.map((listing) => TX_LABELS[listing.transactionType] ?? listing.transactionType).join(', ')} 매물이 있습니다. 매물 상세에서 수정하세요.`,
        );
      }

      let unitId = effectiveUnitId || undefined;
      if (space && !unitId) {
        try {
          const unit = await api.units.create({ ...space, siteId: form.siteId, dongId: effectiveDongId });
          unitId = unit.id;
          void queryClient.invalidateQueries({ queryKey: ['units'] });
        } catch (cause) {
          // A concurrent submission can have registered the same space.
          if (!(cause instanceof ApiError) || cause.statusCode !== 409) throw cause;
          const refreshed = await api.units.findAll({ siteId: form.siteId, dongId: effectiveDongId });
          const existing = refreshed.find(unit => unit.name === space.name && unit.floor === space.floor &&
            (unit.floorEnd ?? null) === space.floorEnd);
          if (!existing) throw cause;
          unitId = existing.id;
        }
      }
      const property = existingProperty ?? await api.properties.findOne(
        (await api.properties.ensure({ siteId: form.siteId, unitId })).id,
      );

      if (property !== existingProperty && property.listings?.some(listing =>
        form.transactionTypes.includes(listing.transactionType as TransactionType))) {
        throw new Error('이미 접수된 거래유형입니다. 매물 상세에서 확인하세요.');
      }

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

      const currentIntake = activeIntake ?? (await api.listingIntakes.findAll({
        propertyId: property.id, limit: 1,
      })).items[0];
      let intakeId = currentIntake?.id;
      if (currentIntake) {
        await api.listingIntakes.update(currentIntake.id, intakePayload);
        for (const listingPayload of listingPayloads) {
          await api.listingIntakes.addListing(currentIntake.id, listingPayload);
        }
      } else {
        const intake = await api.listingIntakes.create({
          propertyId: property.id,
          ...intakePayload,
          listings: listingPayloads,
        });
        intakeId = intake.id;
      }

      // 매물은 이미 저장됐다. 여기서 실패하면 등록 전체를 실패로 보이지 않고(다시 누르면
      // "이미 접수된 거래유형"으로 막힌다) 무엇이 빠졌는지만 알린다.
      const missed: string[] = [];
      // 3) Optional: owner
      try {
        if (form.ownerContact) {
          await api.propertyContacts.create({
            propertyId: property.id,
            contactId: form.ownerContact.id,
            role: 'owner',
            isPrimary: true,
          });
        } else if (form.ownerName.trim()) {
          await api.propertyContacts.createWithNewContact({
            propertyId: property.id,
            role: 'owner',
            name: form.ownerName.trim(),
            phone: form.ownerPhone.trim() || undefined,
            isPrimary: true,
          });
        }
      } catch {
        missed.push('소유자');
      }

      // 4) Optional: tenant
      if (form.hasTenant && form.tenantName.trim()) {
        try {
          await api.tenants.createWithNewContact({
            propertyId: property.id,
            name: form.tenantName.trim(),
            phone: form.tenantPhone.trim() || undefined,
            deposit: requireManwon(form.tenantDeposit, '임차인 보증금을'),
            monthlyRent: requireManwon(form.tenantMonthlyRent, '임차인 월세를'),
            contractStart: form.tenantContractStart || undefined,
            contractEnd: form.tenantContractEnd || undefined,
          });
        } catch {
          missed.push('임차인');
        }
      }

      return { property, intakeId: intakeId!, missed };
    },
    onSuccess: ({ property, intakeId, missed }) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
      // 새 관리호수가 생겼으니 관리단지 사이드바의 단지별 관리호수 수도 갱신
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      if (missed.length > 0) {
        toast.warning(`매물은 등록했지만 ${missed.join('·')} 정보를 저장하지 못했습니다. 매물 상세의 연락처에서 다시 추가하세요.`);
      } else {
        toast.success('매물이 등록되었습니다.');
      }
      if (onCreated) {
        resetDraft();
        onCreated({ property, intakeId });
        return;
      }
      if (returnProjectId) {
        // 프로젝트의 담을 후보 맨 위에 방금 등록한 의뢰가 보이도록 프로젝트 쪽 목록도 다시 읽는다
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        if (returnToProject()) return;
      }
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
      const message = propertyErrorMessage(e, '매물을 등록하지 못했습니다. 다시 시도해 주세요.');
      setError(message);
      toast.error(message);
    },
  });

  useEffect(() => {
    onPendingChange?.(mutation.isPending);
  }, [mutation.isPending, onPendingChange]);

  const submitLabel = existingProperty ? '기존 매물에 거래 추가' : '매물 등록';
  // 적다 만 등록: 탭을 닫거나 버리기 전에 셸이 묻게 표시한다(업무 폼과 같은 표식)
  const hasTypedInput =
    [
      form.salePrice, form.jeonsePrice, form.monthlyDeposit, form.monthlyRent, form.moveInAvailableFrom,
      form.maintenanceFee, form.loanAmount, form.premium, form.memo, form.privateMemo,
      form.ownerName, form.ownerPhone, form.tenantName, form.tenantPhone, form.tenantDeposit,
      form.tenantMonthlyRent, form.partName ?? '',
    ].some((value) => value.trim() !== '') ||
    Boolean(form.siteId && form.siteId !== searchParams.siteId);
  const isDirty = hasTypedInput && !mutation.isPending && !mutation.isSuccess;
  const expandingRef = useRef(false);
  const openInNewTab = () => {
    if (mutation.isPending || expandingRef.current) return;
    expandingRef.current = true;
    createTab({
      route: '/properties/new',
      kind: 'property',
      title: '매물 등록',
      routeParams: { propertyRegistrationDraft: JSON.parse(JSON.stringify(form)) as JsonValue },
    });
    resetDraft();
    if (onExpanded) onExpanded();
    else onClose?.(false);
  };
  const handleCancel = () => {
    if (mutation.isPending) return;
    if (onClose) {
      onClose();
      return;
    }
    if (returnToProject()) return;
    if (ownerTabIdRef.current) {
      closeTab(ownerTabIdRef.current);
      return;
    }
    const meta = getRouteMeta('/properties');
    openModule({ route: '/properties', kind: meta.kind, title: meta.title });
  };

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col bg-background', !isDrawer && '-m-4')}>
      {renderToolbar?.(mutation.isPending ? undefined : openInNewTab)}
      {isDirty && <span hidden data-native-tab-discard-blocker="true" data-native-tab-dirty="true" />}
      {isDrawer ? (
        <header className="shrink-0 px-6 pb-6 pt-3">
          <h1 className="text-2xl font-semibold tracking-tight">새 매물 등록</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">금액은 만원 단위로 적습니다.</p>
        </header>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (mutation.isPending) return;
          setError('');
          mutation.mutate();
        }}
        className={isDrawer
          ? 'flex min-h-0 flex-1 flex-col'
          : 'min-h-0 flex-1 overflow-auto'}
      >
        {/* 탭으로 연 등록 문서: 가운데 한 단 + 오른쪽 요약 열 (설정·상세 화면과 같은 짜임) */}
        <div className={isDrawer
          ? 'contents'
          : 'mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-x-12 gap-y-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_288px] lg:px-8'}>
          {!isDrawer ? (
            <header className="border-b border-border/70 pb-6 lg:col-span-2">
              <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.02em]">매물 등록</h1>
              <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
                단지와 호실을 고르고 거래 조건을 적습니다. 금액은 만원 단위입니다.
              </p>
            </header>
          ) : null}
        <fieldset disabled={mutation.isPending} className={isDrawer
          ? 'min-h-0 min-w-0 flex-1 space-y-7 overflow-y-auto px-6 pb-6'
          : 'min-w-0 space-y-7'}>
          {error && (
            <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-strong outline-none">
              {error}
            </div>
          )}

            <Section
              title="단지 · 거래 공간"
              subtitle="관리 중인 단지 또는 전체 단지에서 선택합니다."
            >
              <FieldRow label="단지" required>
                <SitePicker
                  value={form.siteId}
                  displayName={form.siteName}
                  onChange={(site) => {
                    setForm(prev => ({
                      ...prev, scope: undefined, siteId: site.id, siteName: site.name, siteType: site.type,
                      dongId: '', unitId: '', startFloor: '', endFloor: '', partName: '', partArea: '',
                    }));
                  }}
                />
              </FieldRow>

              {form.siteId && (
                <p className="text-xs text-muted-foreground">
                  유형:{' '}
                  <span className="font-medium text-foreground">
                    {SITE_TYPE_LABELS[form.siteType] ?? form.siteType}
                  </span>
                  {!allowsUnit && <> — 호실 구분 없이 매물 한 건으로 관리합니다.</>}
                </p>
              )}

              {flexible && form.siteId && (
                <FieldRow label="거래 공간" required>
                  <Select value={scope} onValueChange={(value: SpaceScope) =>
                    setForm(prev => ({ ...prev, scope: value, unitId: '', startFloor: '', endFloor: '', partName: '', partArea: '' }))}>
                    <SelectTrigger aria-label="거래 공간"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whole">건물 전체</SelectItem>
                      <SelectItem value="floors">층 선택</SelectItem>
                      <SelectItem value="unit">호실·일부 공간</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
              )}

              {form.siteId && allowsUnit && !isPlaceholderOnly && visibleDongs.length > 0 && (
                <FieldRow label="동" required>
                  <Select
                    value={effectiveDongId}
                    onValueChange={(v) => {
                      set('dongId', v);
                      set('unitId', '');
                    }}
                  >
                    <SelectTrigger aria-label="동">
                      <SelectValue
                        placeholder="동 선택"
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
                </FieldRow>
              )}

              {form.siteId && allowsUnit && scope === 'unit' && effectiveDongId && (
                <FieldRow label="호실" required={needsUnit}>
                  <Select
                    value={form.unitId}
                    onValueChange={(v) => set('unitId', v)}
                  >
                    <SelectTrigger aria-label="호실">
                      <SelectValue placeholder="호실 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new_space__">{flexible ? '새 호실·구획 입력' : '목록에 없는 호실 입력'}</SelectItem>
                      {(units ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {formatUnitLabel(u)}
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
                  {!flexible && units && units.length === 0 && !newPart && (
                    <p className="mt-1.5 text-xs text-warning-strong">
                      등록된 호실이 없습니다. 목록에서 "목록에 없는 호실 입력"을 골라 바로 적으세요.
                    </p>
                  )}
                </FieldRow>
              )}

              {newPart && (
                <FieldRow label={flexible ? '호실·구획 이름' : '호'} required>
                  <Input aria-label="호실·구획 이름" placeholder={flexible ? '예: 201호, 도로변 점포' : '예: 1203'} value={form.partName ?? ''}
                    onChange={e => set('partName', e.target.value)} />
                </FieldRow>
              )}
              {(scope === 'floors' || newPart) && (
                <FieldRow label={newPart ? '층' : '층 범위'} required={!newPart}>
                  <div className="flex gap-2">
                    <Input aria-label="시작층" placeholder={newPart && !flexible ? '비우면 호 번호에서 읽습니다' : newPart ? '예: B1, 2' : '시작층 (예: B1, 2)'} value={form.startFloor ?? ''}
                      onChange={e => set('startFloor', e.target.value)} />
                    {!newPart && <Input aria-label="끝층" placeholder="끝층 (한 층이면 생략)" value={form.endFloor ?? ''}
                      onChange={e => set('endFloor', e.target.value)} />}
                  </div>
                </FieldRow>
              )}
              {newPart && (
                <FieldRow label="전용면적">
                  <Input aria-label="전용면적 (㎡)" type="number" min="0" step="any" placeholder="㎡" value={form.partArea ?? ''}
                    onChange={e => set('partArea', e.target.value)} />
                </FieldRow>
              )}
              {dongs?.length === 0 && needsUnit && (
                <p className="text-xs text-muted-foreground"><Link to="/sites" className="underline">단지 관리</Link>에서 건물을 먼저 등록하세요.</p>
              )}

              {existingProperty && (
                <ExistingPropertyNotice
                  property={existingProperty}
                  needsUnit={needsUnit || Boolean(effectiveUnitId)}
                />
              )}
            </Section>

            <Section title="거래 조건" subtitle="거래유형은 여러 개를 함께 고를 수 있습니다.">
              <FieldRow label="거래유형" required>
                <div className="flex flex-wrap gap-1.5">
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
                        aria-pressed={selected}
                        className={choiceChipClassName(selected)}
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
                <FieldRow label="매매가" required {...manwonHint(form.salePrice, '15억 · 15억 8천 · 158000')}>
                  <ManwonInput
                    aria-label="매매가 만원"
                    value={form.salePrice}
                    onChange={(value) => set('salePrice', value)}
                    placeholder="예: 15억 8천"
                  />
                </FieldRow>
              )}

              {form.transactionTypes.includes('jeonse') && (
                <FieldRow label="전세가" required {...manwonHint(form.jeonsePrice, '9억 · 7억 5천 · 75000')}>
                  <ManwonInput
                    aria-label="전세가 만원"
                    value={form.jeonsePrice}
                    onChange={(value) => set('jeonsePrice', value)}
                    placeholder="예: 7억 5천"
                  />
                </FieldRow>
              )}

              {form.transactionTypes.includes('monthly') && (
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="보증금" {...manwonHint(form.monthlyDeposit)}>
                    <ManwonInput
                      aria-label="월세 보증금 만원"
                      value={form.monthlyDeposit}
                      onChange={(value) => set('monthlyDeposit', value)}
                      placeholder="예: 3천"
                    />
                  </FieldRow>
                  <FieldRow label="월세 (만원)" required {...manwonHint(form.monthlyRent)}>
                    <ManwonInput
                      aria-label="월세 만원"
                      value={form.monthlyRent}
                      onChange={(value) => set('monthlyRent', value)}
                      placeholder="예: 80"
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

              <div className="flex items-start justify-between gap-3 border-t border-border/70 pt-4">
                <div>
                  <div className="text-[13px] font-medium">공동중개 필수</div>
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

          <Section title="소유자 · 임차인" subtitle="모르면 비워 두고 나중에 추가해도 됩니다.">
            <OwnerContactField
              name={form.ownerName}
              phone={form.ownerPhone}
              contact={form.ownerContact ?? null}
              onNameChange={(value) => set('ownerName', value)}
              onPhoneChange={(value) => set('ownerPhone', value)}
              onContactChange={(contact) => setForm((prev) => ({
                ...prev,
                ownerContact: contact,
                ...(contact ? { ownerName: '', ownerPhone: '' } : {}),
              }))}
            />

          <div className="border-t border-border/70">
            <div className="flex items-center justify-between gap-3 pt-4">
              <div>
                <div className="text-[13px] font-medium">현재 임차인</div>
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
              <div className="grid grid-cols-2 gap-x-3 gap-y-4 pt-4">
                <FieldRow label="이름" required>
                  <Input
                    aria-label="임차인 이름"
                    value={form.tenantName}
                    onChange={(e) => set('tenantName', e.target.value)}
                    placeholder="김임차"
                  />
                </FieldRow>
                <FieldRow
                  label="전화번호"
                  hint={phoneInputProblem(form.tenantPhone) ?? undefined}
                  hintInvalid={Boolean(phoneInputProblem(form.tenantPhone))}
                >
                  <Input
                    aria-label="임차인 전화번호"
                    inputMode="tel"
                    value={form.tenantPhone}
                    onChange={(e) => set('tenantPhone', formatPhoneWhileTyping(e.target.value))}
                    placeholder="010-2222-3333"
                  />
                </FieldRow>
                <FieldRow label="보증금" {...manwonHint(form.tenantDeposit)}>
                  <ManwonInput
                    aria-label="임차인 보증금 만원"
                    value={form.tenantDeposit}
                    onChange={(value) => set('tenantDeposit', value)}
                    placeholder="예: 5억"
                  />
                </FieldRow>
                <FieldRow label="월세 (만원)" {...manwonHint(form.tenantMonthlyRent)}>
                  <ManwonInput
                    aria-label="임차인 월세 만원"
                    value={form.tenantMonthlyRent}
                    onChange={(value) => set('tenantMonthlyRent', value)}
                    placeholder="없으면 비워 두세요"
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

          <Section
            title="비용"
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

          <Section title="메모" subtitle="매물·집주인 특이사항을 자유롭게.">
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

        </fieldset>

        {isDrawer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-6 py-3">
            <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={handleCancel}>닫기</Button>
            <Button type="submit" disabled={mutation.isPending || txConflicts.length > 0}>
              {mutation.isPending ? '등록 중...' : submitLabel}
            </Button>
          </footer>
        ) : <RegistrationSummaryPanel
          form={form}
          needsUnit={needsUnit || flexible}
          selectedDongName={selectedDong?.isPlaceholder ? '' : selectedDong?.name}
          selectedUnitName={scope === 'whole' ? '건물 전체' : formatUnitLabel(space ?? selectedUnit) || undefined}
          existingProperty={existingProperty}
          activeIntakeExists={Boolean(activeIntake)}
          txConflicts={txConflicts}
          isSubmitting={mutation.isPending}
          submitLabel={submitLabel}
          onCancel={handleCancel}
          returnsToProject={Boolean(returnProjectId)}
        />}
        </div>
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
  returnsToProject = false,
}: {
  returnsToProject?: boolean;
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
    <aside className="min-w-0 lg:border-l lg:border-border/70 lg:pl-8">
      <div className="sticky top-6 space-y-5">
        <h2 className="text-[13px] font-medium text-muted-foreground">등록 요약</h2>

        <dl className="space-y-2.5 text-[13px]">
          <SummaryRow label="위치" value={siteLabel} muted={!form.siteId} />
          <SummaryRow label="거래 공간" value={unitLabel} muted={needsUnit && !selectedUnitName} />
          <SummaryRow label="거래" value={form.transactionTypes.map((type) => TX_LABELS[type]).join(', ')} />
          <SummaryRow label="금액" value={amountLabel} muted={!amountLabel} />
          <SummaryRow label="입주" value={moveInLabel} />
        </dl>

        <div className="space-y-1.5 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
          {existingProperty ? (
            <p>이미 있는 매물에 새 거래 조건을 추가합니다.</p>
          ) : (
            <p>저장하면 새 매물과 거래 조건이 함께 등록됩니다.</p>
          )}
          {activeIntakeExists && <p>진행 중인 의뢰에 거래 조건이 추가됩니다.</p>}
          {form.ownerContact
            ? <p>{form.ownerContact.name}님을 소유자로 연결합니다.</p>
            : form.ownerName.trim() && <p>소유자 연락처가 함께 저장됩니다.</p>}
          {form.hasTenant && <p>현재 임차인 정보가 함께 생성됩니다.</p>}
          <p>
            {returnsToProject
              ? '저장하거나 취소하면 프로젝트로 돌아갑니다. 방금 등록한 의뢰를 그곳에서 담으세요.'
              : '저장하면 매물 상세 탭이 열리고 이 등록 탭은 닫힙니다.'}
          </p>
        </div>

        {txConflicts.length > 0 && (
          <p role="alert" className="text-xs leading-5 text-warning-strong">
            같은 거래유형이 이미 있어 저장할 수 없습니다.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={isSubmitting || txConflicts.length > 0}>
            {isSubmitting ? '등록 중...' : submitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
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
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={muted ? 'truncate text-muted-foreground-strong' : 'truncate text-foreground'}>
        {value || '-'}
      </dd>
    </div>
  );
}

function getListingAmountLabel(form: FormState) {
  const parts: string[] = [];
  const amount = (raw: string) => {
    const parsed = parseManwonText(raw);
    return parsed.valid && parsed.value ? parsed.value : null;
  };
  const sale = amount(form.salePrice);
  const jeonse = amount(form.jeonsePrice);
  const deposit = amount(form.monthlyDeposit);
  const rent = amount(form.monthlyRent);

  if (form.transactionTypes.includes('sale') && sale) {
    parts.push(`매매 ${formatMoney(sale)}`);
  }

  if (form.transactionTypes.includes('jeonse') && jeonse) {
    parts.push(`전세 ${formatMoney(jeonse)}`);
  }

  if (form.transactionTypes.includes('monthly') && (deposit || rent)) {
    parts.push(`월세 ${formatRent(deposit, rent)}`);
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
    maintenanceFee: requireManwon(form.maintenanceFee, '관리비를'),
    maintenanceFeeIncludes:
      form.maintenanceFeeIncludes.length > 0 ? form.maintenanceFeeIncludes : undefined,
    loanAmount: requireManwon(form.loanAmount, '융자금을'),
    premium: isCommercial ? requireManwon(form.premium, '권리금을') : undefined,
    privateMemo: form.privateMemo.trim() || undefined,
  };

  return form.transactionTypes.map((transactionType) => {
    if (transactionType === 'sale') {
      return {
        ...common,
        transactionType,
        price: requireManwon(form.salePrice, '매매가를'),
      };
    }

    if (transactionType === 'jeonse') {
      return {
        ...common,
        transactionType,
        price: requireManwon(form.jeonsePrice, '전세가를'),
      };
    }

    return {
      ...common,
      transactionType,
      deposit: requireManwon(form.monthlyDeposit, '보증금을'),
      monthlyRent: requireManwon(form.monthlyRent, '월세를'),
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
  const subject = needsUnit ? '이 호실' : '이 부동산';
  // 같은 호실에 다시 들어온 의뢰: 지난 의뢰가 어떻게 끝났는지와 이미 연결된 소유자를 알려 준다
  const { data: detail } = useQuery({
    queryKey: ['properties', property.id],
    queryFn: () => api.properties.findOne(property.id),
    staleTime: 30_000,
  });
  const { data: lastIntakes } = useQuery({
    queryKey: ['listing-intakes', 'registration-last', property.id],
    queryFn: () =>
      api.listingIntakes.findAll({
        propertyId: property.id,
        includeClosed: true,
        sortBy: 'receivedAt',
        sortOrder: 'desc',
        limit: 1,
      }),
    enabled: listings.length === 0,
    staleTime: 30_000,
  });
  const lastIntake = lastIntakes?.items?.[0];
  const owners = (detail?.propertyContacts ?? []).filter(
    (item) => (item.role === 'owner' || item.role === 'co_owner') && item.status !== 'archived' && item.status !== 'transferred',
  );
  const ownerNames = owners.map((item) => item.contact?.name).filter(Boolean).join(', ');
  return (
    <div className="rounded-md border border-info/40 bg-info-soft px-3 py-2.5 text-xs text-info-strong">
      <div className="flex items-center gap-2 font-medium">
        <span>{subject}은 이미 매물로 관리하고 있습니다.</span>
        <Link to="/properties/$id" params={{ id: property.id }} className="ml-auto font-normal underline">
          매물 상세
        </Link>
      </div>
      {listings.length > 0 ? (
        <div className="mt-1">
          진행 중인 거래:
          <ul className="mt-1 space-y-0.5">
            {listings.map((l) => (
              <li key={l.id} className="flex items-center gap-1.5">
                <span className="inline-block min-w-9 rounded-sm bg-background/70 px-1.5 py-px text-[11px] font-medium">
                  {TX_LABELS[l.transactionType as keyof typeof TX_LABELS] ??
                    l.transactionType}
                </span>
                <span>
                  {l.transactionType === 'monthly'
                    ? formatRent(l.deposit, l.monthlyRent)
                    : l.price
                      ? formatMoney(l.price)
                      : '가격 미입력'}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1.5">
            다른 거래유형을 고르면 지금 의뢰에 거래 조건이 더해집니다. 있는 조건의 가격은 매물 상세에서 고치세요.
          </div>
        </div>
      ) : lastIntake ? (
        <div className="mt-1">
          지난 의뢰는 {getIntakeEndLabel(lastIntake)}
          {lastIntake.lifecycleChangedAt ? `(${formatDate(lastIntake.lifecycleChangedAt)})` : ''}. 이번 의뢰를 새로 접수합니다.
        </div>
      ) : (
        <div className="mt-1">진행 중인 거래가 없습니다. 이번 의뢰를 새로 접수합니다.</div>
      )}
      {ownerNames && (
        <div className="mt-1">소유자 {ownerNames}님이 이미 연결되어 있어 소유자 칸은 비워 두어도 됩니다.</div>
      )}
    </div>
  );
}

const INTAKE_END_LABELS: Record<string, string> = {
  deal_completed: '거래 완료로 끝났습니다',
  external_deal_completed: '다른 중개사·직거래 계약으로 끝났습니다',
  withdrawn: '의뢰 철회로 끝났습니다',
  unavailable: '거래 불가로 끝났습니다',
  superseded: '새 의뢰로 대체되었습니다',
  other: '기타 사유로 끝났습니다',
};

function getIntakeEndLabel(intake: { lifecycleStatus: string; closedReason?: string | null }) {
  if (intake.lifecycleStatus !== 'closed') return '아직 진행 중입니다';
  return INTAKE_END_LABELS[intake.closedReason ?? ''] ?? '끝났습니다';
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

// ============================================================
// OwnerContactField — 전화한 집주인을 새로 적거나, 이미 있는 연락처에서 고른다
// ============================================================

function OwnerContactField({
  name,
  phone,
  contact,
  onNameChange,
  onPhoneChange,
  onContactChange,
}: {
  name: string;
  phone: string;
  contact: { id: string; name: string; phone: string | null } | null;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onContactChange: (contact: { id: string; name: string; phone: string | null } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: found, isFetching } = useQuery({
    queryKey: ['contacts', 'owner-picker', query.trim()],
    queryFn: () => api.contacts.findAll({ search: query.trim() || undefined, limit: 8 }),
    enabled: open,
    staleTime: 10_000,
  });
  // 서버는 같은 전화번호의 연락처가 있으면 새로 만들지 않고 그 사람을 연결한다 — 미리 알려 준다.
  // (공용 규칙: 7자리부터 정확히 같은 번호만 본다)
  const { contact: phoneMatch } = useExistingContactByPhone(phone, { enabled: !contact });
  const phoneProblem = phoneInputProblem(phone);

  if (contact) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-muted-foreground">소유자</div>
          <div className="mt-1 truncate text-sm font-medium">
            {contact.name}
            {contact.phone && (
              <span className="ml-2 font-normal text-muted-foreground">{formatPhone(contact.phone)}</span>
            )}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onContactChange(null)}>
          바꾸기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium">소유자</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
              <Search className="size-3.5" />
              연락처에서 찾기
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <Command shouldFilter={false}>
              <CommandInput value={query} onValueChange={setQuery} placeholder="이름·전화번호로 찾기" />
              <CommandList>
                <CommandEmpty>
                  {isFetching ? '찾는 중…' : '맞는 연락처가 없습니다. 이름과 전화번호를 새로 적으세요.'}
                </CommandEmpty>
                {(found?.items ?? []).map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      onContactChange({ id: item.id, name: item.name, phone: item.phone ?? null });
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatPhone(item.phone)}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="이름">
          <Input
            aria-label="소유자 이름"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="홍길동"
          />
        </FieldRow>
        <FieldRow label="전화번호" hint={phoneProblem ?? undefined} hintInvalid={Boolean(phoneProblem)}>
          <Input
            aria-label="소유자 전화번호"
            inputMode="tel"
            value={phone}
            aria-invalid={phoneProblem ? true : undefined}
            onChange={(e) => onPhoneChange(formatPhoneWhileTyping(e.target.value))}
            placeholder="010-1234-5678"
          />
        </FieldRow>
      </div>
      {phoneMatch && (
        <p className="text-xs text-info-strong">
          같은 번호로 저장된 <b>{phoneMatch.name}</b>님이 있어 저장하면 이분을 소유자로 연결합니다.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => onContactChange({ id: phoneMatch.id, name: phoneMatch.name, phone: phoneMatch.phone ?? null })}
          >
            이분으로 고르기
          </button>
        </p>
      )}
    </div>
  );
}
