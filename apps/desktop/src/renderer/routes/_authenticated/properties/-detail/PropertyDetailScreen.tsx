import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ExternalLink,
  Globe,
  Handshake,
  MessageSquarePlus,
  MoreHorizontal,
  Pause,
  Pencil,
  PhoneCall,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  ApiError,
  type Consultation,
  type Listing,
  type ListingIntake,
  type PropertyPhoto,
} from '@estate-erp/api-client';
import { IntakeConfirmationState, IntakeLifecycleStatus, ListingAvailability } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/domain';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import {
  ConsultationAddDialog,
  DealAddDialog,
  ListingFormDialog,
  PropertyContactAddDialog,
  TenantAddDialog,
} from '../-property-detail-dialogs';
import { IntakeConfirmDialog } from '../-property-intake-actions';
import { PropertyInspectorProgressTab } from '../-components/property-inspector-progress-tab';
import { RetryNote } from '../-components/property-inspector-view';
import { PublicListingDialog } from './PublicListingDialog';
import {
  buildOfferRows,
  buildPastIntakes,
  buildPeople,
  buildRecords,
  buildTenants,
  collectListingIds,
  daysSince,
  formatAgo,
  formatDue,
  formatFullDate,
  formatListingPrice,
  formatShortDate,
  getConfirmSummary,
  getTransactionTypeMeta,
  getUnitIdentity,
  getUnitTitle,
  selectPropertyDeals,
  availabilityMeta,
  contactRoleLabels,
  type DetailListing,
  type DetailSite,
  type DetailUnit,
  type OfferRow,
} from './model';
import {
  buildBriefCards,
  buildBriefText,
  buildTodos,
  buildUpcomingViewings,
  coverFirstOrder,
  getHeaderSpecs,
  getHeaderTitle,
  getSupplyPyeong,
  sortPhotos,
  type BriefCard,
  type BriefTextOptions,
  type TodoItem,
} from './brief-model';
import { GuestBar, TopHeader, type ConfirmChip, type PriceChip } from './header';
import { availabilityTone, BriefCopyPopover, BriefSection, VisitSection, type BriefMemo, type Occupancy } from './brief';
import { PhotosSection } from './photos';
import { AdsSection, ConfirmSection, ContactsSection, InfoSection, TodosCallout, type InfoProp } from './rail';
import { ComposerDock, type ComposerSubmit, type ComposerWho } from './composer';
import { RecordsSection } from './records';
import { H2, nb } from './ui';

/*
 * 매물 상세 페이지 (/properties/$id) — 중개사 업무 순서로 짠 2판.
 * 고정 머리(호실 · 가격 · 확인 · 자주 쓰는 작업) 아래로
 *   본문: 브리핑(손님 전화) → 사진 → 집 보기(임장) → 손님 · 거래 → 기록, 맨 아래 상담 입력칸
 *   오른쪽: 지금 챙길 것 → 연락처 → 매물 확인 → 광고 → 호실 · 의뢰 정보
 * "손님에게 보여주기"는 창 전체를 덮고 연락처 · 내부 메모 · 다른 손님 · 기록 · 호수와 층을 가린다.
 */

type DialogState =
  | { kind: 'listing'; listing: Listing | null }
  | { kind: 'contact' }
  | { kind: 'tenant' }
  | { kind: 'consultation' }
  | { kind: 'deal' }
  | { kind: 'confirm' }
  | { kind: 'public'; listingId: string }
  | { kind: 'delete'; row: OfferRow }
  | null;

const INVALIDATE_KEYS = [['properties'], ['listings'], ['listing-intakes'], ['deals'], ['dashboard']];
const WIDE_LAYOUT = 1080;
const OWNER_SIDE_ROLES = new Set(['owner', 'co_owner', 'representative']);

function showMutationError(error: unknown, fallback = '저장하지 못했습니다.') {
  if (error instanceof ApiError && error.statusCode === 409) {
    toast.error('다른 사용자가 먼저 수정했습니다. 최신 내용으로 다시 불러옵니다.');
    return;
  }
  toast.error(error instanceof Error && error.message ? error.message : fallback);
}

/** 상담 목록의 모든 페이지를 받는다. 중간에 실패하면 받은 것까지 돌려주고 complete=false. */
async function fetchAllConsultations(
  filters: NonNullable<Parameters<typeof api.consultations.findAll>[0]>,
): Promise<{ items: Consultation[]; complete: boolean }> {
  const items: Consultation[] = [];
  for (let page = 1; page <= 10; page += 1) {
    try {
      const result = await api.consultations.findAll({ ...filters, limit: 100, page });
      items.push(...result.items);
      if (result.items.length === 0 || page >= (result.pagination.totalPages ?? 1)) {
        return { items, complete: true };
      }
    } catch {
      return { items, complete: false };
    }
  }
  return { items, complete: true };
}

/** 요소 너비를 따라간다 (창 크기·사이드바 접힘에 맞춰 오른쪽 열을 옆에 둘지 정한다). */
function useElementWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width, node] as const;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

export function PropertyDetailScreen({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const createTab = useTabStore((state) => state.createTab);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isOpeningWindow, setIsOpeningWindow] = useState(false);
  const [guest, setGuest] = useState(false);
  const [composerSignal, setComposerSignal] = useState(0);
  const [photoPendingId, setPhotoPendingId] = useState<string | null>(null);
  const [rootRef, rootWidth, rootNode] = useElementWidth<HTMLDivElement>();
  const mainRef = useRef<HTMLDivElement | null>(null);
  const closeDialog = () => setDialog(null);

  // ── 데이터 ──
  const propertyQuery = useQuery({
    queryKey: ['properties', propertyId],
    queryFn: () => api.properties.findOne(propertyId),
  });
  // 이 호실의 의뢰 전체(진행 중 + 지난 의뢰). 메모·접수일·수정 시각은 여기서만 온다.
  const intakesQuery = useQuery({
    queryKey: ['listing-intakes', 'property-detail', propertyId],
    queryFn: () =>
      api.listingIntakes.findAll({
        propertyId,
        includeClosed: true,
        sortBy: 'receivedAt',
        sortOrder: 'desc',
        limit: 50,
      }),
  });
  const matchesQuery = useQuery({
    queryKey: ['matches', { propertyId }],
    queryFn: () => api.matches.findAll({ propertyId }),
  });
  const photosQuery = useQuery({
    queryKey: ['property-photos', 'property', propertyId],
    queryFn: () => api.propertyPhotos.listByProperty(propertyId),
  });

  const property = propertyQuery.data;
  const listings = useMemo(
    () => (property?.listings ?? []) as DetailListing[],
    [property?.listings],
  );
  const intakes = useMemo(() => intakesQuery.data?.items ?? [], [intakesQuery.data]);
  const openIntake: ListingIntake | null =
    intakes.find((intake) => intake.lifecycleStatus !== IntakeLifecycleStatus.CLOSED) ?? null;
  // 진행 중 의뢰의 조건만이 아니라 지난 의뢰(거래 완료로 자동 종료된 의뢰 포함)의 조건까지.
  const allListingIds = collectListingIds(listings, intakes);
  const intakeIds = intakes.map((intake) => intake.id);
  // 거래관리·손님 · 거래 구역과 같은 조회(캐시 공유). 완료·취소된 거래도 기록에 남긴다.
  const dealsQuery = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });
  const propertyDeals = selectPropertyDeals(dealsQuery.data ?? [], propertyId, allListingIds);

  // 상담은 매물·의뢰·거래 조건 중 어디에 연결했는지에 따라 따로 받아 합친다.
  // (서버는 의뢰나 거래 조건만 지정한 상담에 propertyId를 채우지 않는다.)
  const consultationsQuery = useQuery({
    queryKey: ['consultations', 'property-detail', propertyId, intakeIds, allListingIds],
    enabled: Boolean(property) && !intakesQuery.isPending,
    staleTime: 30_000,
    queryFn: async () => {
      const results = await Promise.all([
        fetchAllConsultations({ propertyId }),
        ...intakeIds.map((listingIntakeId) => fetchAllConsultations({ listingIntakeId })),
        ...allListingIds.map((listingId) => fetchAllConsultations({ listingId })),
      ]);
      const byId = new Map<string, Consultation>();
      for (const result of results) for (const item of result.items) byId.set(item.id, item);
      return { items: [...byId.values()], complete: results.every((result) => result.complete) };
    },
  });

  const invalidateAll = async () => {
    await Promise.all(
      INVALIDATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };
  // 거래 조건·사람·거래를 바꾸는 대화상자는 자기 목록만 새로 고친다.
  // 이 화면은 의뢰 목록·점유 거래까지 함께 보여 주므로 닫힐 때 모두 다시 받는다.
  const closeAndRefresh = () => {
    closeDialog();
    void invalidateAll();
  };
  const refreshConsultations = () =>
    queryClient.invalidateQueries({ queryKey: ['consultations', 'property-detail', propertyId] });

  // ── 동작 ──
  const confirmMutation = useMutation({
    mutationFn: (intake: ListingIntake) =>
      api.listingIntakes.confirm(intake.id, {
        result: 'alive',
        channel: 'note',
        expectedUpdatedAt: intake.updatedAt,
      }),
    onSuccess: () => {
      toast.success('매물 확인을 기록했습니다.');
      void invalidateAll();
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
    },
    onError: (error) => {
      showMutationError(error);
      void invalidateAll();
    },
  });
  const lifecycleMutation = useMutation({
    mutationFn: ({ intake, status }: { intake: ListingIntake; status: IntakeLifecycleStatus }) =>
      api.listingIntakes.updateLifecycleStatus(intake.id, status, {
        expectedUpdatedAt: intake.updatedAt,
      }),
    onSuccess: (_, { status }) => {
      toast.success(status === IntakeLifecycleStatus.HOLD ? '의뢰를 보류했습니다.' : '의뢰를 다시 진행합니다.');
      void invalidateAll();
    },
    onError: (error) => {
      showMutationError(error);
      void invalidateAll();
    },
  });
  const pauseMutation = useMutation({
    mutationFn: (listing: DetailListing) =>
      api.listings.update(listing.id, {
        isPaused: !listing.isPaused,
        expectedUpdatedAt: listing.updatedAt,
      }),
    onSuccess: (_, listing) => {
      toast.success(listing.isPaused ? '이 거래 조건을 다시 진행합니다.' : '이 거래 조건만 중단했습니다.');
      void invalidateAll();
    },
    onError: (error) => {
      showMutationError(error);
      void invalidateAll();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (listingId: string) => api.listings.remove(listingId),
    onSuccess: () => {
      toast.success('거래 조건을 삭제했습니다.');
      closeDialog();
      void invalidateAll();
    },
    onError: (error) => showMutationError(error, '거래 조건을 삭제하지 못했습니다.'),
  });

  // 사진: 서버 순서의 첫 장이 대표. 바꾼 뒤에는 사진 자료실과 함께 다시 받는다.
  const photos = useMemo(() => sortPhotos(photosQuery.data ?? []), [photosQuery.data]);
  const refreshPhotos = () => queryClient.invalidateQueries({ queryKey: ['property-photos'] });
  const runPhotoChange = async (photo: PropertyPhoto, change: () => Promise<unknown>, done: string, failed: string) => {
    setPhotoPendingId(photo.id);
    try {
      await change();
      toast.success(done);
    } catch (error) {
      showMutationError(error, failed);
      throw error;
    } finally {
      setPhotoPendingId(null);
      await refreshPhotos();
    }
  };
  const setPhotoCover = (photo: PropertyPhoto) =>
    void runPhotoChange(
      photo,
      () => api.propertyPhotos.reorder(propertyId, coverFirstOrder(photos, photo.id)),
      '대표 사진으로 정했습니다.',
      '대표 사진을 바꾸지 못했습니다.',
    ).catch(() => undefined);
  const changePhotoCategory = (photo: PropertyPhoto, category: string) =>
    void runPhotoChange(
      photo,
      () => api.propertyPhotos.update(photo.id, { category }),
      '사진 분류를 바꿨습니다.',
      '사진 분류를 바꾸지 못했습니다.',
    ).catch(() => undefined);
  const deletePhoto = (photo: PropertyPhoto) =>
    runPhotoChange(photo, () => api.propertyPhotos.remove(photo.id), '사진을 삭제했습니다.', '사진을 삭제하지 못했습니다.');

  const saveIntakeMemo = async (intake: ListingIntake, memo: string) => {
    try {
      await api.listingIntakes.update(intake.id, {
        memo: memo || null,
        expectedUpdatedAt: intake.updatedAt,
      });
    } catch (error) {
      showMutationError(error);
      void invalidateAll();
      throw error;
    }
    await invalidateAll();
  };
  const saveListingMemo = async (listing: DetailListing, memo: string) => {
    try {
      await api.listings.update(listing.id, { memo, expectedUpdatedAt: listing.updatedAt });
    } catch (error) {
      showMutationError(error);
      void invalidateAll();
      throw error;
    }
    await invalidateAll();
  };

  // 상담 입력칸: 소유주 쪽 상담을 확인으로도 남기면 확인 기록이 상담을 함께 만든다(서버).
  const submitComposer = async ({ who, type, text, alsoConfirm }: ComposerSubmit) => {
    try {
      if (alsoConfirm && openIntake) {
        await api.listingIntakes.confirm(openIntake.id, {
          result: 'alive',
          channel: type === 'online' ? 'sms' : type,
          memo: text,
          contactId: who.contactId,
          expectedUpdatedAt: openIntake.updatedAt,
        });
        toast.success('상담과 매물 확인을 기록했습니다.');
        void invalidateAll();
      } else {
        await api.consultations.create({
          contactId: who.contactId,
          type,
          content: text,
          propertyId,
          listingIntakeId: who.side === 'buyer' ? undefined : openIntake?.id,
          matchId: who.matchId,
          listingId: who.listingId,
        });
        toast.success('상담을 기록했습니다.');
      }
    } catch (error) {
      showMutationError(error, '상담을 기록하지 못했습니다.');
      if (alsoConfirm) void invalidateAll();
      throw error;
    }
    void queryClient.invalidateQueries({ queryKey: ['consultations'] });
  };

  const openRoute = useCallback(
    (route: string) => {
      const meta = getRouteMeta(route);
      createTab({ route, kind: meta.kind, title: meta.title });
    },
    [createTab],
  );
  const openComposer = useCallback(() => setComposerSignal((value) => value + 1), []);

  // ── 키보드: R = 상담 입력, Esc = 손님 보기 끄기 ──
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (guest) {
        if (event.key === 'Escape' && !document.querySelector('[data-photo-lightbox]')) {
          event.preventDefault();
          setGuest(false);
        }
        return;
      }
      if (event.code !== 'KeyR' || event.shiftKey || isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [data-photo-lightbox], [role="menu"]')) return;
      // 숨은 탭(미리보기 창의 다른 탭)에서는 받지 않는다.
      if (!rootNode || rootNode.getClientRects().length === 0) return;
      event.preventDefault();
      openComposer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guest, openComposer, rootNode]);

  // 손님에게 보여주는 동안은 맨 위부터 보이게 한다.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [guest]);

  // ── 화면 상태 ──
  if (propertyQuery.isLoading) return <PropertyDetailSkeleton />;
  if (propertyQuery.isError || !property) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
        <p className="text-[13px] text-[#787774]">
          {propertyQuery.isError ? '매물 정보를 불러오지 못했습니다.' : '매물을 찾을 수 없습니다.'}
        </p>
        {propertyQuery.isError && (
          <button type="button" className={nb.line} onClick={() => void propertyQuery.refetch()}>
            <RefreshCw />
            다시 시도
          </button>
        )}
      </div>
    );
  }

  const site = property.site as DetailSite | undefined;
  const unit = property.unit as DetailUnit | null | undefined;
  const identity = getUnitIdentity(property);
  const title = getUnitTitle(property);
  const headerTitle = getHeaderTitle(property, guest);
  const specs = getHeaderSpecs(property, guest);
  const offerRows = buildOfferRows(listings);
  const people = buildPeople(property);
  const tenantsRaw = property.tenants ?? [];
  const tenants = buildTenants(tenantsRaw);
  const supplyPyeong = getSupplyPyeong(property);
  const cards = buildBriefCards({ offerRows, tenants: tenantsRaw, deals: propertyDeals, supplyPyeong, guest });
  const consultations = consultationsQuery.data?.items ?? property.consultations ?? [];
  const records = buildRecords({ listings, consultations, intakes, deals: propertyDeals });
  const pastIntakes = buildPastIntakes(intakes);
  const matches = (matchesQuery.data ?? []).filter((match) => allListingIds.includes(match.listingId));
  const listingTypeById = new Map(
    [...listings, ...intakes.flatMap((intake) => intake.listings ?? [])].map((listing) => [
      listing.id,
      listing.transactionType,
    ]),
  );
  const viewings = buildUpcomingViewings(matches, listingTypeById);
  const todos = intakesQuery.isPending
    ? []
    : buildTodos({ intake: openIntake, offerRows, deals: propertyDeals, viewings, people, tenants });
  const activeMatchCount = matches.filter((match) => match.stage !== 'closed').length;

  const activeContacts = (property.propertyContacts ?? []).filter(
    (item) => item.status !== 'archived' && item.status !== 'transferred',
  );
  const owner =
    activeContacts.find((item) => item.isPrimary && OWNER_SIDE_ROLES.has(item.role)) ??
    activeContacts.find((item) => item.role === 'owner' || item.role === 'co_owner');
  const suggestedContacts = [
    ...activeContacts.flatMap((item) =>
      item.contact ? [{ ...item.contact, label: contactRoleLabels[item.role] ?? item.role }] : [],
    ),
    ...tenantsRaw.flatMap((tenant) => (tenant.contact ? [{ ...tenant.contact, label: '세입자' }] : [])),
  ];
  const isOnHold = openIntake?.lifecycleStatus === IntakeLifecycleStatus.HOLD;
  const tabsBridge = typeof window !== 'undefined' ? window.electronBridge?.tabs : undefined;
  const wide = rootWidth === 0 || rootWidth >= WIDE_LAYOUT;

  const openInNewWindow = async () => {
    if (!tabsBridge || isOpeningWindow) return;
    setIsOpeningWindow(true);
    try {
      const result = await tabsBridge.openPropertyWindow({ propertyId, title });
      if (!result.ok) toast.error(result.error ?? '새 창을 열지 못했습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '새 창을 열지 못했습니다.');
    } finally {
      setIsOpeningWindow(false);
    }
  };
  const editListing = (listingId: string) => {
    const listing = listings.find((item) => item.id === listingId);
    if (listing) setDialog({ kind: 'listing', listing: listing as unknown as Listing });
  };
  const scrollToBuyers = () =>
    document.getElementById('buyers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ── 머리 ──
  const prices: PriceChip[] = offerRows.map((row) => {
    const busy = row.availability === ListingAvailability.IN_CONTRACT;
    const showStatus = guest ? busy : row.availability !== ListingAvailability.AVAILABLE;
    return {
      id: row.listing.id,
      typeLabel: row.typeLabel,
      typeClassName: row.typeClassName,
      priceText: row.priceText,
      status: showStatus
        ? {
            label: guest
              ? '계약 진행 중'
              : row.listing.isPaused && row.availability === ListingAvailability.PAUSED
                ? '중단'
                : availabilityMeta[row.availability].label,
            tone: availabilityTone[row.availability] ?? 'gray',
          }
        : null,
    };
  });
  const confirmSummary = openIntake ? getConfirmSummary(openIntake) : null;
  const confirmChip: ConfirmChip | null =
    openIntake && confirmSummary
      ? confirmSummary.state === IntakeConfirmationState.VERIFIED
        ? {
            label: `확인 ${formatAgo(openIntake.lastVerifiedAt)}`,
            tone: 'green',
            sub: openIntake.nextConfirmAt ? `다음 ${formatShortDate(openIntake.nextConfirmAt)}` : null,
          }
        : confirmSummary.state === IntakeConfirmationState.OVERDUE
          ? { label: '재확인 필요', tone: 'red', sub: openIntake.nextConfirmAt ? formatDue(openIntake.nextConfirmAt) : null }
          : confirmSummary.state === IntakeConfirmationState.NO_ANSWER
            ? { label: '부재중', tone: 'orange', sub: `${formatAgo(openIntake.lastCheckedAt)} 연락` }
            : { label: '미확인', tone: 'orange', sub: `접수 ${daysSince(openIntake.receivedAt) ?? 0}일째` }
      : null;

  const headerMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger className={nb.icon} aria-label="매물 작업 메뉴">
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => setDialog({ kind: 'listing', listing: null })}>
          <Plus className="size-3.5" />
          거래 조건 추가
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDialog({ kind: 'contact' })}>
          <UserPlus className="size-3.5" />
          소유주·관련인 추가
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDialog({ kind: 'tenant' })}>
          <UserPlus className="size-3.5" />
          세입자 추가
        </DropdownMenuItem>
        <DropdownMenuItem disabled={listings.length === 0} onSelect={() => setDialog({ kind: 'deal' })}>
          <Handshake className="size-3.5" />
          거래 바로 만들기
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDialog({ kind: 'consultation' })}>
          <MessageSquarePlus className="size-3.5" />
          상담 자세히 기록…
        </DropdownMenuItem>
        {openIntake && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-normal text-[#8a8983]">
              의뢰 · 접수 {formatShortDate(openIntake.receivedAt)}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setDialog({ kind: 'confirm' })}>
              <PhoneCall className="size-3.5" />
              확인 결과 기록…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={lifecycleMutation.isPending}
              onSelect={() =>
                lifecycleMutation.mutate({
                  intake: openIntake,
                  status: isOnHold ? IntakeLifecycleStatus.OPEN : IntakeLifecycleStatus.HOLD,
                })
              }
            >
              {isOnHold ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {isOnHold ? '보류 풀기' : '의뢰 보류'}
            </DropdownMenuItem>
          </>
        )}
        {tabsBridge && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={isOpeningWindow} onSelect={() => void openInNewWindow()}>
              <ExternalLink className="size-3.5" />
              새 창으로 열기
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ── 브리핑 카드 작업 ──
  const renderCardMenu = (card: BriefCard) => {
    const { row } = card;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(nb.icon, 'size-6')} aria-label={`${row.typeLabel} 거래 조건 작업`}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setDialog({ kind: 'listing', listing: row.listing as unknown as Listing })}>
            <Pencil className="size-3.5" />
            가격·조건 수정
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pauseMutation.isPending} onSelect={() => pauseMutation.mutate(row.listing)}>
            {row.listing.isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {row.listing.isPaused ? `${row.typeLabel} 다시 진행` : `${row.typeLabel}만 중단`}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog({ kind: 'public', listingId: row.listing.id })}>
            <Globe className="size-3.5" />
            고객 공개 설정…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: 'delete', row })}>
            <Trash2 className="size-3.5" />
            거래 조건 삭제…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const memos: BriefMemo[] = offerRows.map((row) => {
    const sameType = offerRows.filter((item) => item.typeLabel === row.typeLabel);
    const label = sameType.length > 1 ? `${row.typeLabel} ${sameType.indexOf(row) + 1}` : row.typeLabel;
    return {
      key: row.listing.id,
      label: `${label} 메모`,
      value: row.listing.memo?.trim() || null,
      privateNote: row.listing.privateMemo?.trim() || null,
      onSave: (memo: string) => saveListingMemo(row.listing, memo),
    };
  });

  const buildBrief = (options: BriefTextOptions) => buildBriefText({ property, cards, options });

  // ── 집 보기 ──
  const residingTenant = tenantsRaw.find((tenant) => tenant.status === 'residing');
  const movingTenant = tenantsRaw.find((tenant) => tenant.status === 'moving_out');
  const tenantRow = tenants.find((row) => row.key === (residingTenant ?? movingTenant)?.id);
  const occupancy: Occupancy = residingTenant
    ? {
        label: '세입자 거주 중',
        tone: 'yellow',
        detail: [tenantRow?.name, tenantRow?.period].filter(Boolean).join(' · ') || null,
      }
    : movingTenant
      ? {
          label: movingTenant.moveOutDate ? `세입자 퇴거 예정 ${formatShortDate(movingTenant.moveOutDate)}` : '세입자 퇴거 예정',
          tone: 'orange',
          detail: tenantRow?.name ?? null,
        }
      : activeContacts.some((item) => item.isResident)
        ? { label: '소유주 거주 중', tone: 'brown', detail: null }
        : { label: '거주 정보 없음', tone: 'gray', detail: null };
  const tenantContact = tenantRow?.phone ? { name: tenantRow.name, phone: tenantRow.phone } : null;

  // ── 오른쪽 열 ──
  const onTodo = (todo: TodoItem) => {
    const action = todo.action;
    if (!action) return;
    switch (action.kind) {
      case 'confirm':
        if (openIntake) confirmMutation.mutate(openIntake);
        return;
      case 'edit-listing':
        editListing(action.listingId);
        return;
      case 'open-url':
        window.open(action.url, '_blank', 'noreferrer');
        return;
      case 'open-deal':
        openRoute(`/deals?dealId=${encodeURIComponent(action.dealId)}`);
        return;
      case 'open-match':
        openRoute(`/wanted-properties?matchId=${encodeURIComponent(action.matchId)}`);
        return;
      case 'add-contact':
        setDialog({ kind: 'contact' });
        return;
      case 'call':
        window.location.href = `tel:${action.phone}`;
        return;
    }
  };

  const infoProps: InfoProp[] = [
    {
      key: 'site',
      label: '단지',
      value: identity.siteName,
      hint: [site?.totalUnits ? `${site.totalUnits.toLocaleString()}세대` : null, site?.totalDongs ? `${site.totalDongs}개 동` : null]
        .filter(Boolean)
        .join(' · ') || null,
    },
    ...(identity.dong || identity.ho
      ? [{ key: 'unit', label: '동 · 호', value: [identity.dong, identity.ho].filter(Boolean).join(' ') }]
      : []),
    ...areaProps(unit),
    ...(identity.unitTypeName ? [{ key: 'type', label: '타입', value: identity.unitTypeName }] : []),
    ...(site?.builtYear
      ? [{ key: 'built', label: '준공', value: `${site.builtYear}년`, hint: `${Math.max(1, new Date().getFullYear() - site.builtYear + 1)}년차` }]
      : []),
    ...(identity.address ? [{ key: 'address', label: '주소', value: identity.address }] : []),
    ...(openIntake
      ? [
          { key: 'received', label: '접수', value: formatFullDate(openIntake.receivedAt), hint: `${daysSince(openIntake.receivedAt) ?? 0}일째` },
          {
            key: 'joint',
            label: '공동중개',
            value: openIntake.isJointBrokerageRequired
              ? ['필수', openIntake.jointBrokeragePartner?.name].filter(Boolean).join(' · ')
              : '없음',
          },
          ...(isOnHold ? [{ key: 'hold', label: '의뢰', value: '보류 중' }] : []),
        ]
      : []),
  ];

  const rail = (
    <>
      {!intakesQuery.isPending && <TodosCallout todos={todos} onAction={onTodo} />}
      <ContactsSection
        people={people}
        tenants={tenants}
        addMenu={
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(nb.icon, 'size-6')} aria-label="연락처 추가">
              <Plus className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setDialog({ kind: 'contact' })}>소유주·관련인</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog({ kind: 'tenant' })}>세입자</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      {intakesQuery.isError ? (
        <div className="border-t border-[#e9e9e7] py-2.5">
          <RetryNote onRetry={() => void intakesQuery.refetch()}>의뢰 정보를 불러오지 못했습니다.</RetryNote>
        </div>
      ) : intakesQuery.isPending ? (
        <Skeleton className="my-3 h-[96px] rounded" />
      ) : openIntake && confirmSummary ? (
        <ConfirmSection
          summary={confirmSummary}
          lines={[
            [
              openIntake.lastVerifiedAt ? `마지막 ${formatFullDate(openIntake.lastVerifiedAt)} (${formatAgo(openIntake.lastVerifiedAt)})` : '확인 기록 없음',
              openIntake.nextConfirmAt ? `다음 ${formatShortDate(openIntake.nextConfirmAt)} (${formatDue(openIntake.nextConfirmAt)})` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          ]}
          pending={confirmMutation.isPending}
          onConfirm={() => confirmMutation.mutate(openIntake)}
          onOther={() => setDialog({ kind: 'confirm' })}
        />
      ) : (
        <div className="border-t border-[#e9e9e7] py-2.5 text-[13px] text-[#37352f]/45">
          <div className="mb-0.5 font-semibold text-[#37352f]">매물 확인</div>
          진행 중인 의뢰가 없어 확인할 것이 없습니다.
        </div>
      )}
      <AdsSection rows={offerRows} onOpenMyAds={() => openRoute('/properties/my-ads')} />
      <InfoSection
        props={infoProps}
        intakeMemo={
          openIntake
            ? { value: openIntake.memo?.trim() || null, onSave: (memo) => saveIntakeMemo(openIntake, memo) }
            : null
        }
        pastIntakes={pastIntakes}
      />
    </>
  );

  const composerOptions: ComposerWho[] = [
    ...activeContacts.flatMap((item) =>
      item.contact
        ? [
            {
              key: `pc-${item.id}`,
              contactId: item.contact.id,
              name: item.contact.name,
              role: contactRoleLabels[item.role] ?? item.role,
              side: OWNER_SIDE_ROLES.has(item.role) ? ('owner' as const) : ('other' as const),
            },
          ]
        : [],
    ),
    ...tenantsRaw
      .filter((tenant) => tenant.status !== 'moved')
      .flatMap((tenant) =>
        tenant.contact
          ? [{ key: `t-${tenant.id}`, contactId: tenant.contact.id, name: tenant.contact.name, role: '세입자', side: 'tenant' as const }]
          : [],
      ),
    ...matches.flatMap((match) => {
      const buyer = match.buyerRequirement?.contact;
      if (match.stage === 'closed' || !buyer) return [];
      return [
        {
          key: `m-${match.id}`,
          contactId: buyer.id,
          name: buyer.name,
          role: `${getTransactionTypeMeta(listingTypeById.get(match.listingId) ?? '').label} 손님`,
          side: 'buyer' as const,
          matchId: match.id,
          listingId: match.listingId,
        },
      ];
    }),
  ].sort((a, b) => Number(b.key === `pc-${owner?.id}`) - Number(a.key === `pc-${owner?.id}`));

  const nextConfirmDate = new Date(Date.now() + 7 * 86_400_000).toISOString();

  return (
    <div
      ref={rootRef}
      data-property-detail-page
      data-guest={guest ? 'on' : undefined}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-white text-[#37352f]',
        guest ? 'fixed inset-0 z-50' : '-m-4 flex-1',
      )}
    >
      <TopHeader
        siteName={headerTitle.siteName}
        unit={headerTitle.unit}
        specs={specs}
        guest={guest}
        prices={prices}
        confirm={confirmChip}
        ownerCall={owner?.contact?.phone ? { phone: owner.contact.phone, name: owner.contact.name } : null}
        confirmPending={confirmMutation.isPending}
        onEditListing={editListing}
        onConfirmMenu={() => setDialog({ kind: 'confirm' })}
        onConfirm={openIntake ? () => confirmMutation.mutate(openIntake) : null}
        onFocusComposer={composerOptions.length > 0 ? openComposer : () => setDialog({ kind: 'consultation' })}
        onToggleGuest={() => setGuest((value) => !value)}
        menu={headerMenu}
      />
      {guest && <GuestBar onExit={() => setGuest(false)} />}

      <div className="flex min-h-0 flex-1">
        <div ref={mainRef} data-property-main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className={cn('mx-auto flex w-full max-w-[900px] flex-1 flex-col px-9 pt-1', guest ? 'pb-16' : 'pb-6')}>
            <BriefSection
              cards={cards}
              guest={guest}
              memos={memos}
              onEditListing={(card) => editListing(card.row.listing.id)}
              renderCardMenu={renderCardMenu}
              copyButton={<BriefCopyPopover build={buildBrief} />}
              emptyText={openIntake ? '등록된 거래 조건이 없습니다.' : '진행 중인 의뢰가 없습니다. 새로 내놓으면 거래 조건을 추가하세요.'}
              emptyAction={
                <button type="button" className={nb.line} onClick={() => setDialog({ kind: 'listing', listing: null })}>
                  <Plus />
                  거래 조건 추가
                </button>
              }
            />

            {!wide && !guest && (
              <div data-property-rail="inline" className="mt-6 grid items-start gap-x-6 sm:grid-cols-2">
                {rail}
              </div>
            )}

            <PhotosSection
              photos={photos}
              status={photosQuery.isError ? 'error' : photosQuery.isPending ? 'loading' : 'ready'}
              guest={guest}
              pendingId={photoPendingId}
              onRetry={() => void photosQuery.refetch()}
              onSetCover={setPhotoCover}
              onChangeCategory={changePhotoCategory}
              onDelete={deletePhoto}
            />

            <VisitSection
              guest={guest}
              occupancy={occupancy}
              tenantContact={tenantContact}
              viewings={viewings}
              onOpenMatch={(matchId) => openRoute(`/wanted-properties?matchId=${encodeURIComponent(matchId)}`)}
              onBook={activeMatchCount > 0 ? scrollToBuyers : null}
              onAddTenant={() => setDialog({ kind: 'tenant' })}
            />

            {!guest && (allListingIds.length > 0 || propertyDeals.length > 0) && (
              <section id="buyers">
                <H2 title="손님 · 거래" count={activeMatchCount} hint="매칭과 거래 진행" />
                <PropertyInspectorProgressTab
                  listingIds={allListingIds}
                  // 새 매칭은 진행 중 의뢰의 거래 조건에만 건다. 종료된 의뢰의 조건은 이력으로만 보인다.
                  creatableListingIds={listings.map((listing) => listing.id)}
                  propertyId={propertyId}
                  matches={matches}
                  matchesStatus={matchesQuery.isError ? 'error' : matchesQuery.data ? 'ready' : 'loading'}
                  onRetryMatches={() => void matchesQuery.refetch()}
                  onOpenMatch={(matchId) => openRoute(`/wanted-properties?matchId=${encodeURIComponent(matchId)}`)}
                  onOpenDeal={(dealId) => openRoute(`/deals?dealId=${encodeURIComponent(dealId)}`)}
                  typeMeta={getTransactionTypeMeta}
                />
              </section>
            )}

            {!guest && (
              <RecordsSection
                records={records}
                notice={
                  consultationsQuery.isError || consultationsQuery.data?.complete === false ? (
                    <RetryNote onRetry={() => void consultationsQuery.refetch()}>
                      일부 상담을 불러오지 못해 기록이 빠졌을 수 있습니다.
                    </RetryNote>
                  ) : null
                }
                action={
                  <button
                    type="button"
                    className={nb.ghost}
                    onClick={composerOptions.length > 0 ? openComposer : () => setDialog({ kind: 'consultation' })}
                  >
                    <Plus />
                    상담 기록
                  </button>
                }
              />
            )}
          </div>

          {!guest && (
            <ComposerDock
              options={composerOptions}
              canConfirm={Boolean(openIntake)}
              nextConfirmText={`다음 확인 ${formatShortDate(nextConfirmDate)}`}
              openSignal={composerSignal}
              onSubmit={submitComposer}
              onFallback={() => setDialog({ kind: 'consultation' })}
            />
          )}
        </div>

        {wide && !guest && (
          <aside
            data-property-rail="side"
            aria-label="할 일과 연락처"
            className="w-[344px] shrink-0 overflow-y-auto overflow-x-hidden border-l border-[#e9e9e7] bg-white"
          >
            <div className="px-[18px] pb-14 pt-3">{rail}</div>
          </aside>
        )}
      </div>

      {/* ── 대화상자 ── */}
      <ListingFormDialog
        open={dialog?.kind === 'listing'}
        onOpenChange={(open) => !open && closeAndRefresh()}
        propertyId={propertyId}
        siteType={property.site?.type}
        listing={dialog?.kind === 'listing' ? dialog.listing : null}
      />
      <PropertyContactAddDialog
        open={dialog?.kind === 'contact'}
        onOpenChange={(open) => !open && closeAndRefresh()}
        propertyId={propertyId}
      />
      <TenantAddDialog
        open={dialog?.kind === 'tenant'}
        onOpenChange={(open) => !open && closeAndRefresh()}
        propertyId={propertyId}
      />
      <ConsultationAddDialog
        open={dialog?.kind === 'consultation'}
        onOpenChange={(open) => {
          if (open) return;
          closeDialog();
          void refreshConsultations();
        }}
        propertyId={propertyId}
        listingIntakeId={openIntake?.id}
        suggestedContacts={suggestedContacts}
        defaultContact={owner?.contact ?? null}
      />
      <DealAddDialog
        open={dialog?.kind === 'deal'}
        onOpenChange={(open) => !open && closeAndRefresh()}
        propertyId={propertyId}
        listings={listings as unknown as Listing[]}
      />
      {openIntake && (
        <IntakeConfirmDialog
          intake={openIntake}
          open={dialog?.kind === 'confirm'}
          onOpenChange={(open) => {
            if (open) return;
            closeDialog();
            void invalidateAll();
            void queryClient.invalidateQueries({ queryKey: ['consultations'] });
          }}
        />
      )}
      <PublicListingDialog
        listingId={dialog?.kind === 'public' ? dialog.listingId : null}
        open={dialog?.kind === 'public'}
        onOpenChange={(open) => !open && closeDialog()}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && closeDialog()}
        title="거래 조건을 삭제할까요?"
        description={
          dialog?.kind === 'delete'
            ? `${dialog.row.typeLabel} ${formatListingPrice(dialog.row.listing)} 조건을 삭제합니다. 가격 이력과 광고 기록도 함께 지워지며 되돌릴 수 없습니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (dialog?.kind === 'delete') deleteMutation.mutate(dialog.row.listing.id);
        }}
      />
    </div>
  );
}

function areaProps(unit: DetailUnit | null | undefined): InfoProp[] {
  const type = unit?.siteUnitType;
  const supply = Number(unit?.supplyAreaM2 ?? type?.supplyAreaM2 ?? 0);
  const exclusive = Number(unit?.exclusiveAreaM2 ?? type?.exclusiveAreaM2 ?? 0);
  const props: InfoProp[] = [];
  if (supply > 0) props.push({ key: 'supply', label: '공급', value: `${supply.toFixed(2)}㎡`, hint: `${(supply * 0.3025).toFixed(1)}평` });
  if (exclusive > 0) {
    props.push({ key: 'exclusive', label: '전용', value: `${exclusive.toFixed(2)}㎡`, hint: `${(exclusive * 0.3025).toFixed(1)}평` });
  }
  return props;
}

function PropertyDetailSkeleton() {
  return (
    <div className="-m-4 flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-[#e9e9e7] px-7 pb-3 pt-3.5">
        <Skeleton className="h-7 w-80" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <Skeleton className="mt-3 h-7 w-[420px] max-w-full" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[900px] space-y-4 px-9 pt-8">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-36 rounded-md" />
          <Skeleton className="h-[262px] rounded-lg" />
        </div>
        <div className="w-[344px] shrink-0 space-y-3 border-l border-[#e9e9e7] px-[18px] pt-4">
          <Skeleton className="h-32 rounded" />
          <Skeleton className="h-40 rounded" />
        </div>
      </div>
    </div>
  );
}
