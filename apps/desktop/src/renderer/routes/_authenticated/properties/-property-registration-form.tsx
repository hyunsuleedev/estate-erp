import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2, CalendarDays, Check, Coins, House, Landmark, Layers, Link2, Plus, Ruler, Search, Tag, UserRound, UsersRound, X,
} from 'lucide-react';
import {
  formatDongLabel, formatPlaceLabel, formatUnitLabel, MAINTENANCE_FEE_INCLUDE_LABELS, OCCUPANCY_STATUSES, OCCUPANCY_STATUS_LABELS, sqmToPyeong, TRANSACTION_TYPE_LABELS, type JsonValue, type OccupancyStatus,
} from '@estate-erp/shared';
import type {
  CreateListingForIntakeDto,
  Property,
  PropertyListing,
  Unit,
} from '@estate-erp/api-client';
import { ApiError } from '@estate-erp/api-client';
import { normalizeHoDraft, registrationSpace, type SpaceDraft, type SpaceScope } from './-registration-space';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatArea, formatDate, formatMoney, formatPhone, formatRent } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { useTabScopedState } from '@/features/tabs/hooks/useTabScopedState';
import { useTabTitle } from '@/hooks/use-tab-title';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import {
  toggleTransactionType,
  type NewPropertyTransactionType,
} from './-new-property-view-utils';
import { manwonHint } from './-new-form-ui';
import {
  DocCard, DocProp, DocProps, DocRead, InlineCombo, PickMenu,
  docCardClassName, docCellClassName, docTitleTokenClassName,
  type ComboItem, type PickOption,
} from './-registration-doc-ui';
import {
  checkItem, dealProblem, moneyProblem,
  type RegistrationCheckItem, type RegistrationProblem,
} from './-registration-check';
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
  /** 거주 상태. null = 아직 고르지 않음(보내지 않는다), '' = 미확인을 골랐음(비운다) */
  occupancyStatus: OccupancyStatus | '' | null;

  // Step 3.5: 비용 정보
  maintenanceFee: string;
  maintenanceFeeIncludes: string[];
  loanAmount: string;
  premium: string;

  // Step 4: 메모
  memo: string;

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
  occupancyStatus: null,
  maintenanceFee: '',
  maintenanceFeeIncludes: [],
  loanAmount: '',
  premium: '',
  memo: '',
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
        // 고르지 않았으면 보내지 않는다 — 이미 받은 의뢰에 거래 조건을 더할 때 적어 둔 값을 지우지 않게.
        // '미확인'을 골랐으면 null을 보내 적어 둔 값을 비운다.
        occupancyStatus: form.occupancyStatus === null ? undefined : form.occupancyStatus || null,
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
      form.maintenanceFee, form.loanAmount, form.premium, form.memo,
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

  // ── 화면 ──────────────────────────────────────────────────────
  const formRef = useRef<HTMLFormElement>(null);
  // 저장을 한 번 눌러 본 뒤에야 빠진 칸을 빨갛게 알린다
  const [attempted, setAttempted] = useState(false);
  // 고른 뒤 넘어갈 칸의 후보. 동·호 목록이 아직 오지 않았으면 올 때까지 기다린다.
  const [pendingFocus, setPendingFocus] = useState<string[] | null>(null);
  const focusField = (field: string) => {
    const element = formRef.current?.querySelector<HTMLElement>(`[data-reg-field="${field}"]`);
    if (!element || (element as HTMLInputElement).disabled) return false;
    element.focus();
    if (element instanceof HTMLInputElement && element.type !== 'date') element.select();
    element.scrollIntoView({ block: 'nearest' });
    return true;
  };
  const waitingForPlace = Boolean(form.siteId) && allowsUnit && !dongs;
  useEffect(() => {
    if (!pendingFocus || waitingForPlace) return;
    pendingFocus.some(focusField);
    setPendingFocus(null);
  });

  const firstPriceField =
    form.transactionTypes[0] === 'monthly' ? 'monthly-deposit' : `${form.transactionTypes[0] ?? 'sale'}-price`;
  const clearedSpace = { startFloor: '', endFloor: '', partName: '', partArea: '' };
  const showDong = Boolean(form.siteId) && allowsUnit && !isPlaceholderOnly && visibleDongs.length > 0;
  const showUnit = Boolean(form.siteId) && allowsUnit && scope === 'unit' && Boolean(effectiveDongId);
  const newPartLabel = form.partName?.trim()
    ? formatUnitLabel({ name: normalizeHoDraft({ partName: form.partName }).partName ?? '', floor: null, floorEnd: null })
    : '';
  const unitText = newPart ? newPartLabel || (flexible ? '새 호실·구획' : '새 호실') : formatUnitLabel(selectedUnit);
  const spaceText = scope === 'whole'
    ? flexible ? '건물 전체' : ''
    : formatUnitLabel(space ?? selectedUnit);
  const placeLabel = [
    formatPlaceLabel({
      siteName: form.siteName,
      dongName: showDong ? selectedDong?.name : undefined,
      dongIsPlaceholder: selectedDong?.isPlaceholder,
    }),
    spaceText,
  ].filter(Boolean).join(' ');
  const selectedUnitArea = selectedUnit?.siteUnitType?.exclusiveAreaM2 ?? selectedUnit?.exclusiveAreaM2;

  // 등록 전 확인: 저장할 때의 검사와 같은 순서
  const spaceTyped = Boolean(form.partName?.trim() || form.startFloor?.trim() || form.endFloor?.trim() || form.partArea?.trim());
  const placeProblem: RegistrationProblem | null = !form.siteId
    ? { field: 'site', kind: 'missing', text: '단지를 고르세요' }
    : waitingForPlace
      ? null
      : (draftSpace || needsUnit) && !effectiveDongId
        ? { field: 'dong', kind: 'missing', text: dongs && dongs.length === 0 ? '이 단지에는 동·호 정보가 없습니다' : '동을 고르세요' }
        : spaceError
          ? { field: newPart ? 'part-name' : 'start-floor', kind: spaceTyped ? 'invalid' : 'missing', text: spaceError.replace(/\.$/, '') }
          : needsUnit && !draftSpace && !selectedUnit
            ? { field: 'unit', kind: 'missing', text: '호실을 고르세요' }
            : null;
  const conflictLabels = txConflicts.map((listing) => TX_LABELS[listing.transactionType] ?? listing.transactionType);
  const dealIssue = dealProblem({ ...form, conflictLabels });
  const termsIssue = moneyProblem([
    { field: 'maintenance-fee', label: '관리비', value: form.maintenanceFee, shown: true },
    { field: 'loan-amount', label: '융자금', value: form.loanAmount, shown: true },
    { field: 'premium', label: '권리금', value: form.premium, shown: isCommercial },
  ]);
  const ownerPhoneProblem = form.ownerContact ? null : phoneInputProblem(form.ownerPhone);
  const ownerIssue: RegistrationProblem | null = form.ownerContact
    ? null
    : !form.ownerName.trim() && form.ownerPhone.trim()
      ? { field: 'owner-name', kind: 'missing', text: '소유자 이름을 적으세요' }
      : ownerPhoneProblem
        ? { field: 'owner-phone', kind: 'invalid', text: `소유자 ${ownerPhoneProblem}` }
        : null;
  const tenantPhoneProblem = form.hasTenant ? phoneInputProblem(form.tenantPhone) : null;
  const tenantIssue: RegistrationProblem | null = !form.hasTenant
    ? null
    : !form.tenantName.trim()
      ? { field: 'tenant-name', kind: 'missing', text: '임차인 이름을 적으세요' }
      : tenantPhoneProblem
        ? { field: 'tenant-phone', kind: 'invalid', text: `임차인 ${tenantPhoneProblem}` }
        : moneyProblem([
            { field: 'tenant-deposit', label: '임차인 보증금', value: form.tenantDeposit, shown: true },
            { field: 'tenant-rent', label: '임차인 월세', value: form.tenantMonthlyRent, shown: true },
          ]);
  const firstProblem = placeProblem ?? dealIssue ?? termsIssue ?? ownerIssue ?? tenantIssue;
  const existingOwnerNote = existingProperty ? '이미 연결된 소유자가 있으면 비워 두어도 됩니다' : '나중에 추가해도 됩니다';
  const checkItems: RegistrationCheckItem[] = [
    checkItem({
      key: 'place', title: '단지 · 거래 공간', required: true, summary: placeProblem ? '' : placeLabel,
      problem: placeProblem, idle: '단지를 고르세요', field: 'site', attempted,
    }),
    checkItem({
      key: 'deal', title: '거래 조건과 금액', required: true, summary: dealIssue ? '' : getListingAmountLabel(form),
      problem: dealIssue, idle: '금액을 적으세요', field: firstPriceField, attempted,
    }),
    ...(termsIssue
      ? [checkItem({ key: 'terms' as const, title: '조건', required: false, summary: '', problem: termsIssue, idle: '', field: termsIssue.field, attempted })]
      : []),
    checkItem({
      key: 'owner', title: '소유자', required: false,
      summary: form.ownerContact?.name ?? form.ownerName.trim(),
      problem: ownerIssue, idle: existingOwnerNote, field: form.ownerContact ? 'owner-clear' : 'owner-name', attempted,
    }),
    ...(form.hasTenant
      ? [checkItem({ key: 'tenant' as const, title: '현재 임차인', required: false, summary: form.tenantName.trim(), problem: tenantIssue, idle: '', field: 'tenant-name', attempted })]
      : []),
  ];

  const submitShortcut = /mac/i.test(navigator.platform) ? '⌘ Enter' : 'Ctrl Enter';
  const handleSubmit = () => {
    if (mutation.isPending) return;
    setAttempted(true);
    setError('');
    if (firstProblem) {
      // 무엇이 빠졌는지 알려 주고 그 칸으로 간다. 서버에 보내기 전에 걸러지는 것만 여기서 막는다.
      toast.error(`${firstProblem.text}.`);
      focusField(firstProblem.field);
      return;
    }
    mutation.mutate();
  };
  const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      handleSubmit();
      return;
    }
    // Enter는 등록이 아니라 다음 칸이다(통화하며 받아 적는 동안 실수로 저장되지 않게)
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !formRef.current) return;
    event.preventDefault();
    const stops = Array.from(formRef.current.querySelectorAll<HTMLElement>('[data-nav]'))
      .filter((element) => !(element as HTMLInputElement).disabled && element.offsetParent !== null);
    const next = stops[stops.indexOf(target) + 1];
    if (!next) return;
    next.focus();
    if (next instanceof HTMLInputElement && next.type !== 'date') next.select();
  };

  const tokenClassName = cn(docTitleTokenClassName, isDrawer ? 'text-[22px] leading-8' : 'text-[30px] leading-10');
  const selectedTypes = form.transactionTypes;
  const existingTypes = new Set((existingProperty?.listings ?? []).map((listing) => listing.transactionType));
  const typeOptions = (own: TransactionType | null): PickOption<TransactionType>[] =>
    TX_ORDER.map((type) => {
      const registered = existingTypes.has(type);
      const used = type !== own && selectedTypes.includes(type);
      return {
        value: type,
        label: TX_LABELS[type],
        disabled: registered || used,
        sub: registered ? '이미 등록됨' : used ? '아래 줄에 있음' : undefined,
      };
    });
  const clearedPrices = (type: TransactionType): Partial<FormState> =>
    type === 'sale' ? { salePrice: '' } : type === 'jeonse' ? { jeonsePrice: '' } : { monthlyDeposit: '', monthlyRent: '' };
  const replaceType = (from: TransactionType, to: TransactionType) => {
    if (from === to) return;
    setForm((prev) => ({
      ...prev,
      ...clearedPrices(from),
      transactionTypes: TX_ORDER.filter((type) => type === to || (type !== from && prev.transactionTypes.includes(type))),
    }));
    setPendingFocus([to === 'monthly' ? 'monthly-deposit' : `${to}-price`]);
  };
  const removeType = (type: TransactionType) => {
    if (selectedTypes.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      ...clearedPrices(type),
      transactionTypes: prev.transactionTypes.filter((item) => item !== type),
    }));
  };
  const addableTypes = typeOptions(null).filter((option) => !selectedTypes.includes(option.value));
  const moneyCell = (
    field: string,
    key: 'salePrice' | 'jeonsePrice' | 'monthlyDeposit' | 'monthlyRent' | 'maintenanceFee' | 'loanAmount' | 'premium' | 'tenantDeposit' | 'tenantMonthlyRent',
    label: string,
    placeholder: string,
    className?: string,
  ) => (
    <input
      data-nav=""
      data-reg-field={field}
      aria-label={label}
      aria-invalid={!parseManwonText(form[key]).valid || undefined}
      autoComplete="off"
      value={form[key]}
      onChange={(event) => set(key, event.target.value)}
      placeholder={placeholder}
      className={cn(docCellClassName, className)}
    />
  );
  const monthlyRead = () => {
    const deposit = parseManwonText(form.monthlyDeposit);
    const rent = parseManwonText(form.monthlyRent);
    if (!deposit.valid || !rent.valid) return { text: '읽을 수 없습니다', invalid: true };
    if (deposit.value == null && rent.value == null) return { text: '월세는 꼭 적습니다', empty: true };
    return { text: formatRent(deposit.value, rent.value) };
  };
  const tenantMoneyRead = () => {
    const deposit = parseManwonText(form.tenantDeposit);
    const rent = parseManwonText(form.tenantMonthlyRent);
    if (!deposit.valid || !rent.valid) return { text: '읽을 수 없습니다', invalid: true };
    if (deposit.value == null && rent.value == null) return { text: '' };
    return { text: rent.value == null ? `전세 ${formatMoney(deposit.value)}` : formatRent(deposit.value, rent.value) };
  };
  // 아직 고르지 않았으면 이미 받은 의뢰에 적힌 값을 보여 준다
  const shownOccupancy: OccupancyStatus | '' =
    form.occupancyStatus ?? activeIntake?.occupancyStatus ?? '';
  const moveInLabel = MOVE_IN_TYPES.find((option) => option.value === form.moveInAvailableType)?.label ?? '';
  const selectedPartner = (partners ?? []).find((partner) => partner.id === form.jointBrokeragePartnerId);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col bg-background', !isDrawer && '-m-4')}>
      {renderToolbar?.(mutation.isPending ? undefined : openInNewTab)}
      {isDirty && <span hidden data-native-tab-discard-blocker="true" data-native-tab-dirty="true" />}

      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        onKeyDown={handleFormKeyDown}
        // 넘어갈 칸을 기다리는 동안 사용자가 다른 곳을 누르거나 치면 포커스를 끌어오지 않는다
        onPointerDownCapture={() => { if (pendingFocus) setPendingFocus(null); }}
        onKeyDownCapture={() => { if (pendingFocus) setPendingFocus(null); }}
        className={isDrawer ? 'flex min-h-0 flex-1 flex-col' : 'min-h-0 flex-1 overflow-auto'}
      >
        {/* 탭으로 연 등록 문서: 위 얇은 줄 + 가운데 문서 + 오른쪽 확인 열 */}
        {!isDrawer && (
          <div className="sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-border/70 bg-background px-4">
            <span className="shrink-0 text-sm text-muted-foreground">매물관리</span>
            <span aria-hidden className="text-sm text-muted-foreground">›</span>
            <b className="min-w-0 truncate text-sm font-medium">{placeLabel || '새 매물'}</b>
            {isDirty && <span className="ml-1 shrink-0 text-xs text-muted-foreground/70">이 탭에 임시 저장됨</span>}
            <span className="flex-1" />
            <span aria-hidden className="hidden shrink-0 text-xs text-muted-foreground/70 lg:inline">
              <DocKey>Enter</DocKey> 다음 칸 <DocKey>{submitShortcut}</DocKey> 등록
            </span>
            <Button type="button" variant="ghost" size="sm" disabled={mutation.isPending} onClick={handleCancel}>
              취소
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? '등록 중...' : submitLabel}
            </Button>
          </div>
        )}

        <div className={isDrawer
          ? 'contents'
          : 'mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-6 px-6 pb-24 pt-9 lg:grid-cols-[minmax(0,1fr)_288px] lg:px-8'}>
          <fieldset
            disabled={mutation.isPending}
            className={cn('@container/doc min-w-0 space-y-3', isDrawer && 'min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-1')}
          >
            {error && (
              <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-strong outline-none">
                {error}
              </div>
            )}

            {/* 제목 = 주소. 단지·동·호를 제목 줄에서 글로 쳐서 고른다. */}
            <header className="px-1 pb-3">
              <div className="mb-1.5 text-xs text-muted-foreground">
                {form.siteId
                  ? `${isDrawer ? '새 매물 등록' : '새 매물'} · ${SITE_TYPE_LABELS[form.siteType] ?? form.siteType}`
                  : isDrawer ? '새 매물 등록' : '새 매물'}
              </div>
              <div role="group" aria-label="단지와 거래 공간" className="-mx-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <SiteCombo
                  value={form.siteId}
                  displayName={form.siteName}
                  className={tokenClassName}
                  onChange={(site) => {
                    setForm((prev) => ({
                      ...prev, ...clearedSpace, scope: undefined, siteId: site.id, siteName: site.name, siteType: site.type,
                      dongId: '', unitId: '', ...(site.type === 'commercial' ? {} : { premium: '' }),
                    }));
                    setPendingFocus(['scope', 'dong', 'unit', firstPriceField]);
                  }}
                />
                {flexible && form.siteId && (
                  <PickMenu<SpaceScope>
                    heading="거래 공간"
                    ariaLabel="거래 공간"
                    field="scope"
                    showChevron={false}
                    className={cn(tokenClassName, 'cursor-pointer')}
                    options={SCOPE_OPTIONS}
                    onPick={(value) => {
                      setForm((prev) => ({ ...prev, ...clearedSpace, scope: value, unitId: '' }));
                      setPendingFocus(value === 'floors' ? ['start-floor'] : ['dong', 'unit', firstPriceField]);
                    }}
                  >
                    {scope === 'floors' && space ? formatUnitLabel(space) : SCOPE_OPTIONS.find((option) => option.value === scope)?.label}
                  </PickMenu>
                )}
                {showDong && (
                  <DongCombo
                    dongs={visibleDongs}
                    value={formatDongLabel(selectedDong?.name, selectedDong?.isPlaceholder)}
                    className={tokenClassName}
                    invalid={attempted && placeProblem?.field === 'dong'}
                    onPick={(dongId) => {
                      setForm((prev) => ({ ...prev, ...clearedSpace, dongId, unitId: '' }));
                      setPendingFocus(['unit', firstPriceField]);
                    }}
                  />
                )}
                {showUnit && (
                  <UnitCombo
                    units={units ?? []}
                    value={unitText}
                    flexible={flexible}
                    className={tokenClassName}
                    invalid={attempted && placeProblem?.field === 'unit'}
                    onPick={(unitId) => {
                      setForm((prev) => ({ ...prev, ...clearedSpace, unitId }));
                      setPendingFocus([firstPriceField]);
                    }}
                    onNew={(typedName) => {
                      setForm((prev) => ({ ...prev, ...clearedSpace, unitId: NEW_SPACE, partName: typedName }));
                      setPendingFocus([typedName ? 'start-floor' : 'part-name']);
                    }}
                  />
                )}
              </div>
              <p className="mt-2 flex min-h-[21px] flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {!form.siteId ? (
                  <span>단지를 고르면 동·호를 이어서 고릅니다. 금액은 “15억 8천”처럼 적어도 됩니다.</span>
                ) : selectedUnit ? (
                  <>
                    {selectedUnit.siteUnitType?.name && <span>{selectedUnit.siteUnitType.name}</span>}
                    {selectedUnitArea != null && <span>전용 {formatArea(selectedUnitArea)}</span>}
                    {selectedUnitRoomCount != null && (
                      <span>
                        {selectedUnitBathRoomCount != null
                          ? `${selectedUnitRoomCount}룸/${selectedUnitBathRoomCount}욕실`
                          : `${selectedUnitRoomCount}룸`}
                      </span>
                    )}
                  </>
                ) : newPart ? (
                  <>
                    <span>{flexible ? '목록에 없는 호실·구획을 새로 적습니다.' : '목록에 없는 호실을 새로 적습니다.'}</span>
                    <button
                      type="button"
                      className="rounded-sm underline decoration-input underline-offset-[3px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, ...clearedSpace, unitId: '' }));
                        setPendingFocus(['unit']);
                      }}
                    >
                      목록에서 고르기
                    </button>
                  </>
                ) : !allowsUnit ? (
                  <span>호실 구분 없이 매물 한 건으로 관리합니다.</span>
                ) : scope === 'whole' ? (
                  <span>건물 전체를 한 건으로 접수합니다.</span>
                ) : dongs?.length === 0 && needsUnit ? (
                  <span><Link to="/sites" className="underline">단지 관리</Link>에서 건물을 먼저 등록하세요.</span>
                ) : showUnit && units && units.length === 0 ? (
                  <span className="text-warning-strong">등록된 호실이 없습니다. 호 칸에서 “목록에 없는 호실 입력”을 고르세요.</span>
                ) : null}
              </p>
            </header>

            {existingProperty && (
              <ExistingPropertyNotice
                property={existingProperty}
                needsUnit={needsUnit || Boolean(effectiveUnitId)}
              />
            )}

            {(scope === 'floors' || newPart) && (
              <DocCard
                title="거래 공간"
                help={scope === 'floors'
                  ? '여러 층이면 시작과 끝을 적습니다'
                  : flexible ? '저장할 때 이 단지에 새 공간으로 등록됩니다' : '저장할 때 이 동에 새 호로 등록됩니다'}
              >
                <DocProps>
                  {newPart && (
                    <DocProp icon={<Tag />} label={flexible ? '호실·구획 이름' : '호'}>
                      <input
                        data-nav=""
                        data-reg-field="part-name"
                        aria-label="호실·구획 이름"
                        autoComplete="off"
                        placeholder={flexible ? '예: 201호, 도로변 점포' : '예: 1203'}
                        value={form.partName ?? ''}
                        onChange={(e) => set('partName', e.target.value)}
                        className={cn(docCellClassName, 'w-44')}
                      />
                    </DocProp>
                  )}
                  <DocProp icon={<Layers />} label={newPart ? '층' : '층 범위'}>
                    <input
                      data-nav=""
                      data-reg-field="start-floor"
                      aria-label="시작층"
                      autoComplete="off"
                      placeholder={newPart && !flexible ? '비우면 호에서' : '예: B1, 2'}
                      value={form.startFloor ?? ''}
                      onChange={(e) => set('startFloor', e.target.value)}
                      className={cn(docCellClassName, 'w-32')}
                    />
                    {!newPart && (
                      <>
                        <span aria-hidden className="text-muted-foreground/70">~</span>
                        <input
                          data-nav=""
                          data-reg-field="end-floor"
                          aria-label="끝층"
                          autoComplete="off"
                          placeholder="한 층이면 비움"
                          value={form.endFloor ?? ''}
                          onChange={(e) => set('endFloor', e.target.value)}
                          className={cn(docCellClassName, 'w-32')}
                        />
                      </>
                    )}
                    {space?.floor != null && newPart && !form.startFloor?.trim() && (
                      <DocRead>{`${space.floor}층으로 읽습니다`}</DocRead>
                    )}
                  </DocProp>
                  {newPart && (
                    <DocProp icon={<Ruler />} label="전용면적">
                      <input
                        data-nav=""
                        data-reg-field="part-area"
                        aria-label="전용면적 (㎡)"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="비어 있음"
                        value={form.partArea ?? ''}
                        onChange={(e) => set('partArea', e.target.value)}
                        className={cn(docCellClassName, 'w-32')}
                      />
                      <span className="text-xs text-muted-foreground/70">㎡</span>
                      {form.partArea?.trim() && Number(form.partArea) > 0 && (
                        <DocRead>{`${sqmToPyeong(Number(form.partArea))}평`}</DocRead>
                      )}
                    </DocProp>
                  )}
                </DocProps>
                {spaceError && (spaceTyped || attempted) && (
                  <p className="mt-1 px-1 text-xs text-destructive-strong">{spaceError}</p>
                )}
              </DocCard>
            )}

            <DocCard title="거래 조건" help="한 호실에 매매·전세·월세를 함께 받을 수 있습니다">
              <div className="-mx-[18px] border-t border-border/70 text-sm">
                <div className="grid min-h-[30px] grid-cols-[88px_minmax(0,1fr)_minmax(96px,150px)_30px] items-center gap-1 border-b border-border/70 px-2.5 text-xs text-muted-foreground">
                  <div className="px-2">거래유형</div>
                  <div className="px-2">금액</div>
                  <div className="px-2 text-right">읽은 값</div>
                  <div />
                </div>
                {(existingProperty?.listings ?? []).map((listing) => (
                  <div key={listing.id} className="grid min-h-10 grid-cols-[88px_minmax(0,1fr)_minmax(96px,150px)_30px] items-center gap-1 border-b border-border/70 px-2.5 text-muted-foreground">
                    <div className="px-2"><DealTag>{TX_LABELS[listing.transactionType] ?? listing.transactionType}</DealTag></div>
                    <div className="px-2"><span className="rounded-[4px] bg-secondary px-1.5 py-px text-xs">이미 등록됨</span></div>
                    <div className="truncate px-2 text-right tabular-nums">
                      {listing.transactionType === 'monthly'
                        ? formatRent(listing.deposit, listing.monthlyRent)
                        : listing.price ? formatMoney(listing.price) : '가격 미입력'}
                    </div>
                    <div />
                  </div>
                ))}
                {selectedTypes.map((type) => {
                  const conflict = existingTypes.has(type);
                  const read = conflict
                    ? { text: '이미 등록된 거래유형', invalid: true }
                    : type === 'monthly'
                      ? monthlyRead()
                      : (() => {
                          const hint = manwonHint(
                            type === 'sale' ? form.salePrice : form.jeonsePrice,
                            type === 'sale' ? '15억 · 15억 8천 · 158000' : '9억 · 7억 5천 · 75000',
                          );
                          const raw = type === 'sale' ? form.salePrice : form.jeonsePrice;
                          return { text: hint.hint ?? '', invalid: hint.hintInvalid, empty: !raw.trim() };
                        })();
                  return (
                    <div key={type} className="group/deal grid min-h-10 grid-cols-[88px_minmax(0,1fr)_minmax(96px,150px)_30px] items-center gap-1 border-b border-border/70 px-2.5">
                      <div>
                        <PickMenu<TransactionType>
                          heading="거래유형"
                          ariaLabel={`거래유형 ${TX_LABELS[type]}`}
                          field={selectedTypes[0] === type ? 'deal-type' : undefined}
                          nav={false}
                          className="rounded-[4px] px-2 py-[5px] hover:bg-foreground/[0.055]"
                          options={typeOptions(type)}
                          onPick={(next) => replaceType(type, next)}
                        >
                          <DealTag>{TX_LABELS[type]}</DealTag>
                        </PickMenu>
                      </div>
                      <div className="flex min-w-0 items-center gap-0.5">
                        {type === 'monthly' ? (
                          <>
                            <span className="shrink-0 whitespace-nowrap pl-2 text-xs text-muted-foreground">보증금</span>
                            {moneyCell('monthly-deposit', 'monthlyDeposit', '월세 보증금 만원', '예: 3천', 'w-full')}
                            <span aria-hidden className="text-muted-foreground/70">/</span>
                            <span className="shrink-0 whitespace-nowrap pl-2 text-xs text-muted-foreground">월</span>
                            {moneyCell('monthly-rent', 'monthlyRent', '월세 만원', '예: 80', 'w-full')}
                          </>
                        ) : type === 'sale' ? (
                          moneyCell('sale-price', 'salePrice', '매매가 만원', '예: 15억 8천', 'w-full')
                        ) : (
                          moneyCell('jeonse-price', 'jeonsePrice', '전세가 만원', '예: 7억 5천', 'w-full')
                        )}
                      </div>
                      <div
                        aria-live="polite"
                        className={cn(
                          'truncate px-2 text-right tabular-nums',
                          read.invalid ? 'text-xs text-destructive-strong' : 'empty' in read && read.empty ? 'text-xs text-muted-foreground/70' : 'text-muted-foreground-strong',
                        )}
                      >
                        {read.text}
                      </div>
                      <div>
                        {selectedTypes.length > 1 && (
                          <button
                            type="button"
                            aria-label={`${TX_LABELS[type]} 조건 지우기`}
                            onClick={() => removeType(type)}
                            className="grid size-[26px] place-items-center rounded-[4px] text-muted-foreground/70 opacity-0 outline-none hover:bg-foreground/[0.09] hover:text-foreground focus-visible:opacity-100 focus-visible:shadow-[inset_0_0_0_2px_var(--color-ring)] group-focus-within/deal:opacity-100 group-hover/deal:opacity-100"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {addableTypes.length > 0 && (
                <PickMenu<TransactionType>
                  heading="추가할 거래유형"
                  ariaLabel="거래 조건 추가"
                  field="deal-add"
                  showChevron={false}
                  className="-mb-1 -ml-2 mt-1 h-[34px] rounded-[4px] px-2 text-sm text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground"
                  options={addableTypes}
                  onPick={(type) => {
                    set('transactionTypes', toggleTransactionType(selectedTypes, type));
                    setPendingFocus([type === 'monthly' ? 'monthly-deposit' : `${type}-price`]);
                  }}
                >
                  <Plus className="size-4" />
                  거래 조건 추가
                </PickMenu>
              )}
            </DocCard>

            <DocCard title="조건">
              <DocProps>
                <DocProp icon={<CalendarDays />} label="입주 가능">
                  <PickMenu<MoveInType>
                    heading="입주 가능"
                    ariaLabel="입주 가능"
                    field="move-in"
                    className={cn(docCellClassName, 'cursor-pointer')}
                    options={MOVE_IN_TYPES.map((option) => ({ value: option.value, label: option.label }))}
                    onPick={(value) => {
                      // 보이지 않게 되는 날짜는 함께 비운다(숨은 날짜가 저장되지 않게)
                      setForm((prev) => ({
                        ...prev,
                        moveInAvailableType: value,
                        moveInAvailableFrom: value === 'date' || value === 'range' ? prev.moveInAvailableFrom : '',
                        moveInAvailableTo: value === 'range' ? prev.moveInAvailableTo : '',
                      }));
                      if (value === 'date' || value === 'range') setPendingFocus(['move-in-from']);
                    }}
                  >
                    {moveInLabel}
                  </PickMenu>
                  {(form.moveInAvailableType === 'date' || form.moveInAvailableType === 'range') && (
                    <input
                      type="date"
                      data-nav=""
                      data-reg-field="move-in-from"
                      aria-label={form.moveInAvailableType === 'range' ? '입주 가능 시작일' : '입주 가능일'}
                      value={form.moveInAvailableFrom}
                      onChange={(e) => set('moveInAvailableFrom', e.target.value)}
                      className={cn(docCellClassName, 'w-[150px] tabular-nums', !form.moveInAvailableFrom && 'text-muted-foreground/70')}
                    />
                  )}
                  {form.moveInAvailableType === 'range' && (
                    <>
                      <span aria-hidden className="text-muted-foreground/70">~</span>
                      <input
                        type="date"
                        data-nav=""
                        aria-label="입주 가능 종료일"
                        value={form.moveInAvailableTo}
                        onChange={(e) => set('moveInAvailableTo', e.target.value)}
                        className={cn(docCellClassName, 'w-[150px] tabular-nums', !form.moveInAvailableTo && 'text-muted-foreground/70')}
                      />
                    </>
                  )}
                </DocProp>
                {/* 의뢰를 받을 때 바로 아는 값이다 — 세입자 연락처를 몰라도 "누가 사는지"는 적어 둔다 */}
                <DocProp icon={<House />} label="거주">
                  <PickMenu<OccupancyStatus | typeof OCCUPANCY_UNSET>
                    heading="거주"
                    ariaLabel="거주"
                    field="occupancy"
                    className={cn(docCellClassName, 'cursor-pointer', !shownOccupancy && 'text-muted-foreground/70')}
                    options={[
                      ...OCCUPANCY_STATUSES.map((value) => ({ value, label: OCCUPANCY_STATUS_LABELS[value] })),
                      { value: OCCUPANCY_UNSET, label: '미확인', separated: true },
                    ]}
                    onPick={(value) => set('occupancyStatus', value === OCCUPANCY_UNSET ? '' : value)}
                  >
                    {shownOccupancy ? OCCUPANCY_STATUS_LABELS[shownOccupancy] : '미확인'}
                  </PickMenu>
                </DocProp>

                <DocProp icon={<Coins />} label="관리비">
                  {moneyCell('maintenance-fee', 'maintenanceFee', '관리비 만원', '비어 있음', 'w-28')}
                  <span className="mr-1.5 text-xs text-muted-foreground/70">만원 / 월</span>
                  <MoneyRead value={form.maintenanceFee} />
                </DocProp>
                <DocProp icon={<Tag />} label="관리비 포함">
                  <div role="group" aria-label="관리비 포함 항목" className="flex flex-wrap gap-1 px-2 py-[5px]">
                    {Object.entries(MAINTENANCE_FEE_INCLUDE_LABELS).map(([slug, label]) => {
                      const active = form.maintenanceFeeIncludes.includes(slug);
                      return (
                        <button
                          key={slug}
                          type="button"
                          aria-pressed={active}
                          onClick={() => set(
                            'maintenanceFeeIncludes',
                            active ? form.maintenanceFeeIncludes.filter((item) => item !== slug) : [...form.maintenanceFeeIncludes, slug],
                          )}
                          className={cn(
                            'h-6 rounded-[4px] border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active
                              ? 'border-transparent bg-secondary text-foreground'
                              : 'border-dashed border-input text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </DocProp>
                <DocProp icon={<Landmark />} label="융자금">
                  {moneyCell('loan-amount', 'loanAmount', '융자금 만원', '없으면 비워 둡니다', 'w-44')}
                  <MoneyRead value={form.loanAmount} />
                </DocProp>
                {selectedTypes.includes('jeonse') && (
                  <p className="col-start-2 px-2 pb-1 text-xs text-warning-strong">
                    전세 매물은 융자금(근저당) 확인이 중요합니다 — 보증금 보호(깡통 위험) 판단 기준이 됩니다.
                  </p>
                )}
                {isCommercial && (
                  <DocProp icon={<Coins />} label="권리금">
                    {moneyCell('premium', 'premium', '권리금 만원', '예: 5천', 'w-44')}
                    <MoneyRead value={form.premium} />
                  </DocProp>
                )}
                <DocProp icon={<Link2 />} label="공동중개 필수">
                  <Switch
                    size="sm"
                    data-nav=""
                    aria-label="공동중개 필수"
                    className="mx-2"
                    checked={form.isJointBrokerageRequired}
                    onCheckedChange={(v) => set('isJointBrokerageRequired', v)}
                  />
                  {form.isJointBrokerageRequired ? (
                    <PickMenu<string>
                      heading="파트너 중개사"
                      ariaLabel="파트너 중개사"
                      className={cn(docCellClassName, 'cursor-pointer', !selectedPartner && 'text-muted-foreground/70')}
                      contentClassName="min-w-[280px]"
                      options={[
                        ...(partners ?? []).map((partner) => ({ value: partner.id, label: partner.name, sub: partner.phone ?? undefined })),
                        { value: NO_PARTNER, label: '정하지 않음', separated: (partners ?? []).length > 0 },
                      ]}
                      onPick={(value) => set('jointBrokeragePartnerId', value === NO_PARTNER ? '' : value)}
                    >
                      {selectedPartner?.name ?? '파트너 고르기'}
                    </PickMenu>
                  ) : (
                    <DocRead>특정 파트너와 진행해야 할 때 켜세요.</DocRead>
                  )}
                </DocProp>
              </DocProps>
            </DocCard>

            <DocCard title="사람" help="모르면 비워 두고 나중에 추가해도 됩니다">
              <DocProps>
                <DocProp icon={<UserRound />} label="소유자">
                  <OwnerInline
                    name={form.ownerName}
                    phone={form.ownerPhone}
                    contact={form.ownerContact ?? null}
                    onNameChange={(value) => set('ownerName', value)}
                    onPhoneChange={(value) => set('ownerPhone', value)}
                    onContactChange={(contact) => {
                      setForm((prev) => ({
                        ...prev,
                        ownerContact: contact,
                        ...(contact ? { ownerName: '', ownerPhone: '' } : {}),
                      }));
                      setPendingFocus([contact ? 'owner-clear' : 'owner-name']);
                    }}
                  />
                </DocProp>

                <DocProp icon={<UsersRound />} label="현재 임차인">
                  {!form.hasTenant ? (
                    <button
                      type="button"
                      data-nav=""
                      data-reg-field="tenant-add"
                      onClick={() => {
                        set('hasTenant', true);
                        setPendingFocus(['tenant-name']);
                      }}
                      className="inline-flex h-[30px] items-center gap-1.5 rounded-[4px] px-2 text-sm text-muted-foreground outline-none hover:bg-foreground/[0.055] hover:text-foreground focus-visible:shadow-[inset_0_0_0_2px_var(--color-ring)]"
                    >
                      <Plus className="size-4" />
                      임차인 적기
                    </button>
                  ) : (
                    <>
                      <input
                        data-nav=""
                        data-reg-field="tenant-name"
                        aria-label="임차인 이름"
                        autoComplete="off"
                        placeholder="이름"
                        value={form.tenantName}
                        onChange={(e) => set('tenantName', e.target.value)}
                        className={cn(docCellClassName, 'w-28')}
                      />
                      <input
                        data-nav=""
                        data-reg-field="tenant-phone"
                        aria-label="임차인 전화번호"
                        inputMode="tel"
                        autoComplete="off"
                        placeholder="전화번호"
                        aria-invalid={tenantPhoneProblem ? true : undefined}
                        value={form.tenantPhone}
                        onChange={(e) => set('tenantPhone', formatPhoneWhileTyping(e.target.value))}
                        className={cn(docCellClassName, 'w-40')}
                      />
                      <DocRead invalid={Boolean(tenantPhoneProblem)}>
                        {tenantPhoneProblem ?? (!form.tenantName.trim() ? '임차인 이름을 적으세요' : '')}
                      </DocRead>
                    </>
                  )}
                </DocProp>
                {form.hasTenant && (
                  <div className="col-start-2 mb-1.5 grid grid-cols-[84px_minmax(0,1fr)] items-start gap-y-0.5 border-l border-border pl-2">
                    <div className="flex h-8 items-center pl-2 text-xs text-muted-foreground">보증금 / 월세</div>
                    <div className="flex min-h-8 flex-wrap items-center gap-x-1">
                      {moneyCell('tenant-deposit', 'tenantDeposit', '임차인 보증금 만원', '예: 5억', 'w-32')}
                      <span aria-hidden className="text-muted-foreground/70">/</span>
                      {moneyCell('tenant-rent', 'tenantMonthlyRent', '임차인 월세 만원', '월세 없으면 비움', 'w-36')}
                      <DocRead invalid={tenantMoneyRead().invalid}>{tenantMoneyRead().text}</DocRead>
                    </div>
                    <div className="flex h-8 items-center pl-2 text-xs text-muted-foreground">계약 기간</div>
                    <div className="flex min-h-8 flex-wrap items-center gap-x-1">
                      <input
                        type="date"
                        data-nav=""
                        aria-label="임차 계약 시작일"
                        value={form.tenantContractStart}
                        onChange={(e) => set('tenantContractStart', e.target.value)}
                        className={cn(docCellClassName, 'w-[150px] tabular-nums', !form.tenantContractStart && 'text-muted-foreground/70')}
                      />
                      <span aria-hidden className="text-muted-foreground/70">~</span>
                      <input
                        type="date"
                        data-nav=""
                        aria-label="임차 계약 만료일"
                        value={form.tenantContractEnd}
                        onChange={(e) => set('tenantContractEnd', e.target.value)}
                        className={cn(docCellClassName, 'w-[150px] tabular-nums', !form.tenantContractEnd && 'text-muted-foreground/70')}
                      />
                    </div>
                    <div />
                    <div className="pl-2">
                      <button
                        type="button"
                        className="rounded-sm text-xs text-muted-foreground underline decoration-input underline-offset-[3px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          // 적은 내용은 남겨 둔다. 다시 켜면 그대로 보인다. 꺼 둔 동안에는 저장하지 않는다.
                          set('hasTenant', false);
                          setPendingFocus(['tenant-add']);
                        }}
                      >
                        임차인 없음으로 되돌리기
                      </button>
                    </div>
                  </div>
                )}
              </DocProps>
            </DocCard>

            <DocCard title="메모">
              <textarea
                aria-label="메모"
                rows={2}
                value={form.memo}
                onChange={(e) => set('memo', e.target.value)}
                placeholder="매물·소유자 특이사항을 적으세요. 예) 남향, 풀옵션, 6월 이사 가능"
                className="-mx-2 block min-h-[66px] w-[calc(100%+16px)] resize-none rounded-[4px] border-0 bg-transparent px-2 py-1.5 text-sm leading-6 outline-none [field-sizing:content] placeholder:text-muted-foreground/70 hover:bg-foreground/[0.055] focus:bg-background focus:shadow-[inset_0_0_0_2px_var(--color-ring)]"
              />
            </DocCard>
          </fieldset>

          {isDrawer ? (
            <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-6 py-3">
              <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={handleCancel}>닫기</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? '등록 중...' : submitLabel}
              </Button>
            </footer>
          ) : (
            <RegistrationCheckPanel
              items={checkItems}
              onGo={focusField}
              submitShortcut={submitShortcut}
              notes={[
                existingProperty
                  ? activeIntake ? '진행 중인 의뢰에 거래 조건이 추가됩니다.' : '이미 있는 매물에 새 거래 조건을 추가합니다.'
                  : '새 매물과 거래 조건이 함께 등록됩니다.',
                draftSpace && !matchingUnit && space ? '적은 거래 공간이 단지에 새로 등록됩니다.' : '',
                form.ownerContact
                  ? `${form.ownerContact.name}님을 소유자로 연결합니다.`
                  : form.ownerName.trim() ? '소유자 연락처가 함께 저장됩니다.' : '',
                form.hasTenant ? '현재 임차인 정보가 함께 생성됩니다.' : '',
                returnProjectId
                  ? '저장하거나 취소하면 프로젝트로 돌아갑니다. 방금 등록한 의뢰를 그곳에서 담으세요.'
                  : '매물 상세 탭이 열리고 이 등록 탭은 닫힙니다.',
              ].filter(Boolean)}
            />
          )}
        </div>
      </form>
    </div>
  );
}

const TX_ORDER: TransactionType[] = ['sale', 'jeonse', 'monthly'];
const NEW_SPACE = '__new_space__';
/** 고르는 창에서 '미확인'을 가리키는 값 (저장하지 않는다) */
const OCCUPANCY_UNSET = '__unset__';
const NO_PARTNER = '__none__';
const SCOPE_OPTIONS: PickOption<SpaceScope>[] = [
  { value: 'whole', label: '건물 전체' },
  { value: 'floors', label: '층 선택' },
  { value: 'unit', label: '호실·일부 공간' },
];

function DocKey({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[4px] bg-secondary px-1 font-sans text-xs text-muted-foreground-strong">{children}</kbd>;
}

function DealTag({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-5 items-center rounded-[4px] bg-secondary px-1.5 text-sm">{children}</span>;
}

function MoneyRead({ value }: { value: string }) {
  const { hint, hintInvalid } = manwonHint(value);
  return <DocRead invalid={hintInvalid}>{hint}</DocRead>;
}

/** 오른쪽 열: 무엇이 채워졌고 무엇이 빠졌는지. 누르면 그 칸으로 간다. */
function RegistrationCheckPanel({
  items,
  notes,
  onGo,
  submitShortcut,
}: {
  items: RegistrationCheckItem[];
  notes: string[];
  onGo: (field: string) => void;
  submitShortcut: string;
}) {
  return (
    <aside aria-label="등록 전 확인" className="min-w-0">
      <div className="sticky top-16 flex flex-col gap-3">
        <div className={cn(docCardClassName, 'px-4 pb-3 pt-3.5')}>
          <h2 className="mb-1.5 text-xs font-medium text-muted-foreground">등록 전 확인</h2>
          <ul className="-mx-2">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onGo(item.field)}
                  className="grid w-full grid-cols-[18px_minmax(0,1fr)] items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-foreground/[0.055] focus-visible:shadow-[inset_0_0_0_2px_var(--color-ring)]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 grid size-4 place-items-center rounded-full border-[1.5px]',
                      item.state === 'done' ? 'border-success bg-success text-white' : item.state === 'problem' ? 'border-destructive' : 'border-input',
                    )}
                  >
                    {item.state === 'done' && <Check className="size-2.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-sm', !item.required && item.state !== 'done' && 'text-muted-foreground-strong')}>
                      {item.title}
                      {!item.required && <span className="ml-1 text-xs text-muted-foreground/70">선택</span>}
                    </span>
                    <span className={cn('block truncate text-xs', item.state === 'problem' ? 'text-destructive-strong' : 'text-muted-foreground')}>
                      {item.detail}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn(docCardClassName, 'px-4 pb-3 pt-3.5')}>
          <h2 className="mb-1.5 text-xs font-medium text-muted-foreground">저장하면</h2>
          <ul className="space-y-1 text-xs leading-[19px] text-muted-foreground">
            {notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>

        <dl aria-hidden className="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 px-4 pt-1 text-xs text-muted-foreground">
          <dt><DocKey>Enter</DocKey></dt><dd>다음 칸으로</dd>
          <dt><DocKey>↑ ↓</DocKey></dt><dd>목록에서 고르기</dd>
          <dt><DocKey>Esc</DocKey></dt><dd>고르기 취소</dd>
          <dt><DocKey>{submitShortcut}</DocKey></dt><dd>등록</dd>
        </dl>
      </div>
    </aside>
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
    <div className={cn(docCardClassName, 'border-l-[3px] border-l-info px-4 py-3 text-xs leading-5 text-muted-foreground-strong focus-within:border-l-info')}>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
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
                <span className="inline-block min-w-9 rounded-sm bg-secondary px-1.5 py-px text-[11px] font-medium">
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

// ============================================================
// SiteCombo — 제목 줄의 단지 칸. 관리 단지 + 전체 단지 검색
// ============================================================

function SiteCombo({
  value,
  displayName,
  onChange,
  className,
}: {
  value: string;
  displayName: string;
  onChange: (site: { id: string; name: string; type: string }) => void;
  className?: string;
}) {
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

  // 관리 단지는 받아 둔 목록에서 바로 거른다
  const filteredManaged = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (officeSites ?? []).flatMap((os) => (os.site ? [os.site] : []));
    if (!q || query === displayName) return all;
    return all.filter((site) => site.name.toLowerCase().includes(q));
  }, [officeSites, query, displayName]);

  // 이미 관리 중인 단지는 전체 단지 묶음에서 뺀다
  const managedSiteIds = useMemo(
    () => new Set((officeSites ?? []).map((os) => os.siteId)),
    [officeSites],
  );
  const filteredCentral = (centralHits ?? []).filter((site) => !managedSiteIds.has(site.id));
  const sites = [
    ...filteredManaged.map((site) => ({ site, managed: true })),
    ...filteredCentral.map((site) => ({ site, managed: false })),
  ];

  return (
    <InlineCombo
      field="site"
      ariaLabel="단지"
      placeholder="단지 이름으로 검색"
      className={className}
      contentClassName="w-[380px]"
      value={value ? displayName : ''}
      onQueryChange={setQuery}
      loading={isSearching}
      emptyText="일치하는 단지가 없습니다."
      items={sites.map(({ site, managed }) => ({
        key: site.id,
        label: site.name,
        sub: SITE_TYPE_LABELS[site.type] ?? site.type,
        group: managed ? '관리 단지' : '전체 단지',
        icon: managed ? <Building2 /> : <Search />,
      }))}
      onPick={(item) => {
        const picked = sites.find((entry) => entry.site.id === item.key);
        if (!picked) return;
        // 전체 단지에서 고르면 우리 관리 단지에 올린다(이미 있으면 그대로 둔다)
        if (!picked.managed) void api.officeSites.add({ siteId: picked.site.id }).catch(() => undefined);
        onChange({ id: picked.site.id, name: picked.site.name, type: picked.site.type });
      }}
      footer={
        <Link
          to="/sites"
          className="flex min-h-[30px] items-center gap-2 rounded-[4px] px-2 text-sm text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground"
        >
          <Plus className="size-4" />
          새 단지 등록하기
        </Link>
      }
    />
  );
}

function DongCombo({
  dongs,
  value,
  onPick,
  className,
  invalid,
}: {
  dongs: Array<{ id: string; name: string; isPlaceholder?: boolean | null }>;
  value: string;
  onPick: (dongId: string) => void;
  className?: string;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const labeled = dongs.map((dong) => ({ id: dong.id, label: formatDongLabel(dong.name, dong.isPlaceholder) || dong.name }));
  const shown = !q || query === value ? labeled : labeled.filter((dong) => dong.label.includes(q));
  return (
    <InlineCombo
      field="dong"
      ariaLabel="동"
      placeholder="동"
      className={className}
      contentClassName="w-[200px]"
      invalid={invalid}
      value={value}
      onQueryChange={setQuery}
      emptyText="맞는 동이 없습니다."
      items={shown.map((dong) => ({ key: dong.id, label: dong.label }))}
      onPick={(item) => onPick(item.key)}
    />
  );
}

/** 한 번에 보이는 호실 수. 더 많으면 글을 쳐서 좁힌다. */
const UNIT_OPTION_LIMIT = 80;

function UnitCombo({
  units,
  value,
  flexible,
  onPick,
  onNew,
  className,
  invalid,
}: {
  units: Unit[];
  value: string;
  flexible: boolean;
  onPick: (unitId: string) => void;
  /** 목록에 없는 호실을 새로 적는다. 치던 글이 호 번호면 함께 넘긴다 */
  onNew: (typedName: string) => void;
  className?: string;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState('');
  // 사용자가 친 글에서 끝의 "호"를 떼고 견준다
  const q = query === value ? '' : query.trim().replace(/호$/, ''); // i18n-ignore
  const labeled = units.map((unit) => ({ unit, label: formatUnitLabel(unit) }));
  const matched = q
    ? labeled.filter(({ label }) => label.startsWith(q) || (flexible && label.includes(q)))
    : labeled;
  const exact = labeled.some(({ unit, label }) => unit.name === q || label === q);
  const typedNew = Boolean(q) && !exact && !flexible && /^\d{1,5}$/.test(q) ? q : '';
  const items: ComboItem[] = matched.slice(0, UNIT_OPTION_LIMIT).map(({ unit, label }) => {
    const unitArea = unit.siteUnitType?.exclusiveAreaM2 ?? unit.exclusiveAreaM2;
    return {
      key: unit.id,
      label,
      sub: [unit.siteUnitType?.name, unitArea != null ? `${Number(unitArea)}㎡` : ''].filter(Boolean).join(' · '),
    };
  });
  items.push({
    key: NEW_SPACE,
    label: typedNew ? `“${typedNew}호” 새로 적기` : flexible ? '새 호실·구획 입력' : '목록에 없는 호실 입력',
    icon: <Plus />,
  });
  return (
    <InlineCombo
      field="unit"
      ariaLabel="호실"
      placeholder={flexible ? '호실·구획' : '호'}
      className={className}
      contentClassName="w-[340px]"
      invalid={invalid}
      value={value}
      onQueryChange={setQuery}
      items={items}
      onPick={(item) => (item.key === NEW_SPACE ? onNew(typedNew) : onPick(item.key))}
    />
  );
}

// ============================================================
// OwnerInline — 전화한 집주인을 새로 적거나, 이름을 치면 이미 있는 연락처에서 고른다
// ============================================================

function OwnerInline({
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
  const search = name.trim();
  const { data: found, isFetching } = useQuery({
    queryKey: ['contacts', 'owner-picker', search],
    queryFn: () => api.contacts.findAll({ search, limit: 8 }),
    enabled: !contact && search.length >= 1,
    staleTime: 10_000,
  });
  // 서버는 같은 전화번호의 연락처가 있으면 새로 만들지 않고 그 사람을 연결한다 — 미리 알려 준다.
  // (공용 규칙: 7자리부터 정확히 같은 번호만 본다)
  const { contact: phoneMatch } = useExistingContactByPhone(phone, { enabled: !contact });
  const phoneProblem = phoneInputProblem(phone);

  if (contact) {
    return (
      <>
        <span className="ml-1 inline-flex h-[26px] max-w-full items-center gap-1.5 rounded-[4px] bg-secondary pl-2 pr-1 text-sm">
          <span className="truncate">{contact.name}</span>
          {contact.phone && <span className="shrink-0 tabular-nums text-muted-foreground">{formatPhone(contact.phone)}</span>}
          <button
            type="button"
            data-nav=""
            data-reg-field="owner-clear"
            aria-label={`소유자 ${contact.name} 연결 풀기`}
            onClick={() => onContactChange(null)}
            className="grid size-5 place-items-center rounded-[3px] text-muted-foreground outline-none hover:bg-foreground/[0.09] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        </span>
        <DocRead>연락처의 고객을 소유자로 연결합니다</DocRead>
      </>
    );
  }

  const people = found?.items ?? [];
  return (
    <>
      <InlineCombo
        free
        field="owner-name"
        ariaLabel="소유자 이름"
        placeholder="이름으로 찾기"
        className={cn(docCellClassName, 'w-28')}
        contentClassName="w-[340px]"
        value={name}
        onFreeChange={onNameChange}
        loading={isFetching && people.length === 0}
        items={search ? people.map((item) => ({
          key: item.id,
          label: item.name,
          sub: formatPhone(item.phone),
          group: '연락처에서 고르기',
          icon: <UserRound />,
        })) : []}
        onPick={(item) => {
          const picked = people.find((person) => person.id === item.key);
          if (picked) onContactChange({ id: picked.id, name: picked.name, phone: picked.phone ?? null });
        }}
      />
      <input
        data-nav=""
        data-reg-field="owner-phone"
        aria-label="소유자 전화번호"
        inputMode="tel"
        autoComplete="off"
        placeholder="전화번호"
        aria-invalid={phoneProblem ? true : undefined}
        value={phone}
        onChange={(e) => onPhoneChange(formatPhoneWhileTyping(e.target.value))}
        className={cn(docCellClassName, 'w-40')}
      />
      <DocRead invalid={Boolean(phoneProblem) || (!search && Boolean(phone.trim()))}>
        {phoneProblem ?? (!search && phone.trim() ? '이름 없이 전화번호만 저장할 수는 없습니다' : search ? '새 고객으로 등록합니다' : '')}
      </DocRead>
      {phoneMatch && (
        <p className="basis-full px-2 pb-1 text-xs text-info-strong">
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
    </>
  );
}
