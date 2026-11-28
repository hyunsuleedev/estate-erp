import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ExternalLink,
  Handshake,
  MessageSquarePlus,
  ListTodo,
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
  type Property,
  type Match,
  type PropertyPhoto,
} from '@estate-erp/api-client';
import {
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
  MatchStage,
  normalizeMatchStage,
} from '@estate-erp/shared';
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
import { PropertyAdActions } from '../-components/property-ad-actions';
import { RetryNote } from '../-components/property-inspector-view';
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
  getIntakeStatusLabel,
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
import { propertyErrorMessage } from '../-error-message';
import { canDeleteListing } from '../-property-permissions';
import { useAuth } from '@/providers/auth-provider';
import { useTabTitle } from '@/hooks/use-tab-title';
import { TaskCreateDialog } from '../../tasks/-task-create-dialog';
import { IntakeProjectSection } from './intake-project';
import { getMatchStageBlockReason } from '../../wanted-properties/-match-view-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getStatusMeta } from '@/lib/status-config';
import { formatPyeong } from '@/lib/format';

/*
 * 매물 상세 페이지 (/properties/$id) — 중개사 업무 순서로 짠 2판.
 * 고정 머리(호실 · 가격 · 확인 · 자주 쓰는 작업) 아래로
 *   본문: 브리핑(손님 전화) → 사진 → 집 보기(임장) → 손님 · 거래 → 기록, 맨 아래 상담 입력칸
 *   오른쪽: 지금 챙길 것 → 연락처 → 매물 확인 → 광고 → 호실 · 의뢰 정보
 * "손님에게 보여주기"는 창 전체를 덮고 연락처 · 내부 메모 · 다른 손님 · 기록 · 호수와 층을 가린다.
 */

/** 상세의 광고 단추는 고른 광고 없이 연다(새 광고 기록·등록 요청) */
const NO_SELECTED_ADS: ReadonlySet<string> = new Set();
const noop = () => {};

type DialogState =
  | { kind: 'listing'; listing: Listing | null }
  | { kind: 'contact' }
  | { kind: 'tenant' }
  | { kind: 'consultation' }
  | { kind: 'deal' }
  | { kind: 'confirm' }
  | { kind: 'delete'; row: OfferRow }
  | { kind: 'task' }
  | null;

// 매칭은 의뢰의 확인·상태로 거래 전환을 막거나 풀므로(희망매물 쪽 포함) 함께 다시 읽는다.
// 예전에는 '확인 완료'를 눌러도 새로 고치기 전까지 거래 전환이 꺼진 채였다.
const INVALIDATE_KEYS = [
  ['properties'],
  ['listings'],
  ['listing-intakes'],
  ['deals'],
  ['dashboard'],
  ['matches'],
  ['buyer-requirements'],
];
const WIDE_LAYOUT = 1080;
const OWNER_SIDE_ROLES = new Set(['owner', 'co_owner', 'representative']);

function showMutationError(error: unknown, fallback = '저장하지 못했습니다.') {
  if (error instanceof ApiError && error.statusCode === 409) {
    toast.error('다른 사용자가 먼저 수정했습니다. 최신 내용으로 다시 불러옵니다.');
    return;
  }
  toast.error(propertyErrorMessage(error, fallback));
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

/**
 * 관리호수(Property)가 아직 없는 호실로 연 화면.
 * 호실에서 읽은 값으로 빈 상세를 보여 주고, 처음 입력을 시작할 때 `ensure`로 관리호수를 만든다.
 */
/** 주소(?dialog=)로 열어 달라고 할 수 있는 입력 창. 빈 상세에서 누른 창을 매물 상세에서 이어 여는 데 쓴다. */
export const REQUESTABLE_DIALOGS = ['listing', 'contact', 'tenant', 'consultation', 'task'] as const;
export type RequestableDialog = (typeof REQUESTABLE_DIALOGS)[number];

function isRequestableDialog(value: unknown): value is RequestableDialog {
  return (REQUESTABLE_DIALOGS as readonly unknown[]).includes(value);
}

function dialogStateFor(kind: RequestableDialog): DialogState {
  return kind === 'listing' ? { kind, listing: null } : { kind };
}

export interface PropertyDetailDraft {
  property: Property;
  /**
   * 관리호수를 만들고 이 탭을 그 매물 상세로 바꾼 뒤 입력 창을 연다.
   * 열 창은 주소에 실려 가므로 탭이 바뀌거나 이미 열린 탭으로 넘어가도 사라지지 않는다.
   */
  start: (dialog: RequestableDialog) => void;
}

const EMPTY_INTAKES = { items: [] as ListingIntake[] };

export function PropertyDetailScreen({
  propertyId,
  draft,
}: {
  /** null이면 아직 관리호수가 없는 호실이다(`draft`가 있어야 한다) */
  propertyId: string | null;
  draft?: PropertyDetailDraft;
}) {
  const queryClient = useQueryClient();
  // 거래 조건 지우기는 대표·매니저만(서버와 같은 기준)
  const mayDeleteListing = canDeleteListing(useAuth().user?.role);
  const createTab = useTabStore((state) => state.createTab);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isOpeningWindow, setIsOpeningWindow] = useState(false);
  const [guest, setGuest] = useState(false);
  const [composerSignal, setComposerSignal] = useState(0);
  const [bookingDialog, setBookingDialog] = useState<
    null | { step: 'pick' } | { step: 'blocked'; match: Match; reason: string }
  >(null);
  const [photoPendingId, setPhotoPendingId] = useState<string | null>(null);
  const [rootRef, rootWidth, rootNode] = useElementWidth<HTMLDivElement>();
  const mainRef = useRef<HTMLDivElement | null>(null);
  const closeDialog = () => setDialog(null);
  // 입력을 시작하는 창은 관리호수가 있어야 저장할 곳이 있다. 없으면 먼저 만들고 연다.
  const openDialog = (next: DialogState) => {
    if (propertyId || !draft) {
      setDialog(next);
      return;
    }
    if (next && isRequestableDialog(next.kind)) draft.start(next.kind);
  };

  // 주소로 온 "이 창을 열어 달라"는 요청(?dialog=). 열고 나면 주소에서 지워 다시 열리지 않게 한다.
  const navigate = useNavigate();
  const requestedDialog = useLocation({
    select: (location) => (location.search as { dialog?: unknown }).dialog,
  });
  useEffect(() => {
    if (propertyId === null || !isRequestableDialog(requestedDialog)) return;
    setDialog(dialogStateFor(requestedDialog));
    void navigate({ to: '/properties/$id', params: { id: propertyId }, search: {}, replace: true });
  }, [navigate, propertyId, requestedDialog]);

  // ── 데이터 ──
  const propertyQuery = useQuery({
    queryKey: ['properties', propertyId],
    queryFn: () => api.properties.findOne(propertyId as string),
    enabled: propertyId !== null,
  });
  // 방금 만든 관리호수를 받는 동안에도 호실에서 읽은 값으로 화면을 그대로 둔다
  const property = propertyQuery.data ?? draft?.property;
  // 탭 제목을 "매물 상세" 대신 "고덕그라시움 101동 3501호"로
  useTabTitle(property ? getUnitTitle(property) : null);
  // 이 호실의 의뢰 전체(진행 중 + 지난 의뢰). 메모·접수일·수정 시각은 여기서만 온다.
  const intakesQuery = useQuery({
    queryKey: ['listing-intakes', 'property-detail', propertyId],
    queryFn: () =>
      // 관리호수가 없으면 의뢰·매칭·사진도 없다 (받으러 가지 않고 빈 값으로 둔다)
      propertyId === null
        ? EMPTY_INTAKES
        : api.listingIntakes.findAll({
        propertyId,
        includeClosed: true,
        sortBy: 'receivedAt',
        sortOrder: 'desc',
        limit: 50,
      }),
  });
  const matchesQuery = useQuery({
    queryKey: ['matches', { propertyId }],
    queryFn: async () =>
      propertyId === null ? [] : (await api.matches.findAll({ propertyId, limit: 100 })).items,
  });
  const photosQuery = useQuery({
    queryKey: ['property-photos', 'property', propertyId],
    queryFn: () => (propertyId === null ? [] : api.propertyPhotos.listByProperty(propertyId)),
  });

  const listings = useMemo(
    () => (property?.listings ?? []) as DetailListing[],
    [property?.listings],
  );
  const intakes = useMemo(() => intakesQuery.data?.items ?? [], [intakesQuery.data]);
  const openIntake: ListingIntake | null =
    intakes.find((intake) => intake.lifecycleStatus !== IntakeLifecycleStatus.CLOSED) ?? null;
  // 진행 중 의뢰의 조건만이 아니라 지난 의뢰(거래 완료로 자동 종료된 의뢰 포함)의 조건까지.
  const allListingIds = collectListingIds(listings, intakes);
  // 이 집의 거래는 집 상세에 실려 온다(지난 의뢰의 거래까지, 완료·취소 포함). 따로 요청하지 않는다.
  const propertyDeals = propertyId === null ? [] : selectPropertyDeals(propertyQuery.data?.deals ?? [], propertyId, allListingIds);

  // 의뢰에 연결된 상담도 모두 같은 propertyId를 가지므로 호실 기준으로 한 번에 병렬 조회한다.
  const consultationsQuery = useQuery({
    queryKey: ['consultations', 'property-detail', propertyId],
    enabled: propertyId !== null,
    staleTime: 30_000,
    queryFn: () => fetchAllConsultations({ propertyId: propertyId as string }),
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
    // 관리단지의 호수 표·호실 패널도 거래 조건과 사람을 보여 준다
    if (property?.siteId) void queryClient.invalidateQueries({ queryKey: ['sites', property.siteId] });
  };
  const refreshConsultations = () =>
    queryClient.invalidateQueries({ queryKey: ['consultations', 'property-detail', propertyId] });

  // ── 동작 ──
  const confirmMutation = useMutation({
    mutationFn: (intake: ListingIntake) =>
      api.listingIntakes.confirm(intake.id, {
        result: 'alive',
        // 빠른 확인(확인 완료)은 전화로 확인한 것으로 남긴다. 다른 방법과 메모는 '메모와 함께…'에서 적는다
        channel: 'phone',
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
    onSuccess: (result) => {
      toast.success(
        result?.intakeRemoved
          ? '매물을 삭제했습니다. 매물관리 목록에서 빠졌고, 연락처와 상담 기록은 이 화면에 남습니다.'
          : '거래 조건을 삭제했습니다.',
      );
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
      () => api.propertyPhotos.reorder(propertyId as string, coverFirstOrder(photos, photo.id)),
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

  // 상담 입력칸: 소유자 쪽 상담을 확인으로도 남기면 확인 기록이 상담을 함께 만든다(서버).
  const submitComposer = async ({ who, type, text, alsoConfirm }: ComposerSubmit) => {
    // 관리호수가 없으면 고를 연락처도 없어 여기로 오지 않는다 (상담은 입력 창으로 적는다)
    if (propertyId === null) return;
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
          propertyId: propertyId ?? undefined,
          listingIntakeId: who.side === 'buyer' ? who.listingIntakeId : openIntake?.id,
          buyerIntakeId: who.buyerIntakeId,
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

  const openModule = useTabStore((s) => s.openModule);
  // 위 얇은 줄의 "매물관리": 열린 매물관리 탭을 보던 거르기·스크롤 그대로 앞으로 꺼낸다(없으면 연다)
  const openPropertyList = useCallback(() => {
    const meta = getRouteMeta('/properties');
    openModule({ route: '/properties', kind: meta.kind, title: meta.title });
  }, [openModule]);
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
  if (!property && propertyQuery.isLoading) return <PropertyDetailSkeleton />;
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
  // 내광고관리를 이 호실의 광고만 거른 채 연다(예전에는 전체 목록이 열려 호실을 다시 찾아야 했다)
  const openMyAdsForUnit = () => {
    const params = new URLSearchParams();
    if (property.siteId) params.set('siteId', property.siteId);
    const dongName = unit?.dong && !unit.dong.isPlaceholder ? unit.dong.name : null;
    if (dongName) params.set('dong', dongName);
    if (unit?.name) params.set('ho', unit.name);
    const query = params.toString();
    openRoute(`/properties/naver-my-ads${query ? `?${query}` : ''}`);
  };
  const specs = getHeaderSpecs(property, guest);
  const offerRows = buildOfferRows(listings);
  const people = buildPeople(property);
  const tenantsRaw = property.tenants ?? [];
  const tenants = buildTenants(tenantsRaw);
  const supplyPyeong = getSupplyPyeong(property);
  const cards = buildBriefCards({ offerRows, tenants: tenantsRaw, deals: propertyDeals, supplyPyeong, guest });
  const consultations = consultationsQuery.data?.items ?? property.consultations ?? [];
  // 끝난 의뢰의 조건도 기록에 넣는다(의뢰를 끝내면 가격 변경·광고 기록이 사라지던 문제)
  const pastListings = (property.pastListings ?? []) as unknown as DetailListing[];
  const records = buildRecords({ listings: [...listings, ...pastListings], consultations, intakes, deals: propertyDeals });
  // 끝난 의뢰인데 아직 게재 중인 광고 (진행 중 의뢰가 없을 때 광고 구역에 대신 보인다)
  const leftoverAdRows = buildOfferRows(pastListings).filter((row) => row.activeAds.length > 0);
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
    : buildTodos({ intake: openIntake, offerRows, deals: propertyDeals, viewings, people, tenants, leftoverAdRows });
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
    if (!tabsBridge || isOpeningWindow || propertyId === null) return;
    setIsOpeningWindow(true);
    try {
      const result = await tabsBridge.openPropertyWindow({ propertyId, title });
      if (!result.ok) toast.error(result.error ?? '새 창을 열지 못했습니다.');
    } catch (error) {
      toast.error(propertyErrorMessage(error, '새 창을 열지 못했습니다.'));
    } finally {
      setIsOpeningWindow(false);
    }
  };
  const editListing = (listingId: string) => {
    const listing = listings.find((item) => item.id === listingId);
    if (listing) openDialog({ kind: 'listing', listing: listing as unknown as Listing });
  };
  const scrollToBuyers = () =>
    document.getElementById('buyers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // ── "임장 잡기" ──
  // 일정은 매칭마다 잡는다. 공용 진행 트랙의 "임장" 단계 창(일시 고르기·일정 잡기)을 그대로 연다.
  // 매칭이 여럿이면 누구와의 임장인지 먼저 고르고, 매물 확인이 먼저 필요하면 그 자리에서 알린다.
  const bookableMatches = matches.filter((match) => {
    const stage = normalizeMatchStage(match.stage);
    return stage !== MatchStage.CLOSED && stage !== MatchStage.DEAL_CREATED;
  });
  const openViewingScheduler = (match: Match) => {
    document
      .querySelector(`[data-match-card="${match.id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      const trigger = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          `[data-match-card="${match.id}"] [data-inspector-match-track] button`,
        ),
      ).find((button) => button.textContent?.trim() === '임장');
      trigger?.click();
    }, 350);
  };
  const startViewingBooking = (match: Match) => {
    const reason = getMatchStageBlockReason(match, MatchStage.VIEWING);
    if (reason) {
      setBookingDialog({ step: 'blocked', match, reason });
      return;
    }
    setBookingDialog(null);
    openViewingScheduler(match);
  };
  const goToViewingBooking = () => {
    if (bookableMatches.length === 0) {
      scrollToBuyers();
      return;
    }
    if (bookableMatches.length === 1) {
      startViewingBooking(bookableMatches[0]);
      return;
    }
    setBookingDialog({ step: 'pick' });
  };
  const confirmThenBook = async (match: Match) => {
    if (!openIntake) return;
    try {
      await confirmMutation.mutateAsync(openIntake);
      // 확인 상태가 바뀐 매칭을 다시 받아 그것으로 일정 창을 연다(옛 값이면 창이 계속 막힌다)
      const refreshed = await matchesQuery.refetch();
      const fresh = (refreshed.data ?? []).find((candidate) => candidate.id === match.id) ?? match;
      startViewingBooking(fresh);
    } catch {
      // confirmMutation의 onError가 안내한다
    }
  };

  // ── 머리 ──
  // 계약한 거래가 있으면 내놓은 가격 옆에 계약한 가격을 함께 보인다(끝난 매물이 내놓은 가격으로만 보이던 문제)
  const contractedPriceText = (listingId: string) => {
    const deal = propertyDeals.find(
      (candidate) =>
        candidate.listingId === listingId &&
        !candidate.isCancelled &&
        ['contracted', 'settling', 'completed', 'closed'].includes(candidate.stage),
    );
    if (!deal || (deal.agreedPrice == null && deal.agreedDeposit == null && deal.agreedMonthlyRent == null)) return null;
    return formatListingPrice({
      transactionType: deal.transactionType,
      price: deal.agreedPrice ?? null,
      deposit: deal.agreedDeposit ?? null,
      monthlyRent: deal.agreedMonthlyRent ?? null,
    });
  };
  // 진행 중인 조건이 없고 끝낸 거래가 있으면 머리에 거래가·완료일을 보인다
  const completedDeal = propertyDeals
    .filter((deal) => !deal.isCancelled && (deal.stage === 'completed' || deal.stage === 'closed'))
    .sort((left, right) => new Date(right.stageChangedAt).getTime() - new Date(left.stageChangedAt).getTime())[0];
  const completedDealPrice = completedDeal
    ? formatListingPrice({
        transactionType: completedDeal.transactionType,
        price: completedDeal.agreedPrice ?? null,
        deposit: completedDeal.agreedDeposit ?? null,
        monthlyRent: completedDeal.agreedMonthlyRent ?? null,
      })
    : null;
  const closedSummary =
    completedDeal && completedDealPrice && completedDealPrice !== '-' && !guest
      ? `${getTransactionTypeMeta(completedDeal.transactionType).label} ${completedDealPrice}에 거래 완료 · ${formatFullDate(completedDeal.stageChangedAt)}`
      : // 거래 없이 끝난 의뢰(철회·타 중개 계약 등)는 "거래 조건 없음" 대신 끝난 사유와 날을 보인다
        !openIntake && intakes[0]?.lifecycleStatus === IntakeLifecycleStatus.CLOSED && !guest
        ? `의뢰 ${getIntakeStatusLabel(intakes[0])} · ${formatFullDate(intakes[0].lifecycleChangedAt)}`
        : null;
  const prices: PriceChip[] = offerRows.map((row) => {
    const busy = row.availability === ListingAvailability.IN_CONTRACT;
    const showStatus = guest ? busy : row.availability !== ListingAvailability.AVAILABLE;
    const dealPrice = guest ? null : contractedPriceText(row.listing.id);
    return {
      id: row.listing.id,
      typeLabel: row.typeLabel,
      typeClassName: row.typeClassName,
      priceText: dealPrice && dealPrice !== row.priceText ? `${row.priceText} → 계약 ${dealPrice}` : row.priceText,
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
          : { label: '미확인', tone: 'orange', sub: `접수 ${daysSince(openIntake.receivedAt) ?? 0}일째` }
      : null;

  const headerMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger className={nb.icon} aria-label="매물 작업 메뉴">
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => openDialog({ kind: 'listing', listing: null })}>
          <Plus className="size-3.5" />
          거래 조건 추가
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ kind: 'contact' })}>
          <UserPlus className="size-3.5" />
          소유자·관련인 추가
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ kind: 'tenant' })}>
          <UserPlus className="size-3.5" />
          세입자 추가
        </DropdownMenuItem>
        <DropdownMenuItem disabled={listings.length === 0} onSelect={() => openDialog({ kind: 'deal' })}>
          <Handshake className="size-3.5" />
          거래 바로 만들기
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ kind: 'consultation' })}>
          <MessageSquarePlus className="size-3.5" />
          상담 적기…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ kind: 'task' })}>
          <ListTodo className="size-3.5" />
          업무 추가
        </DropdownMenuItem>
        {openIntake && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-normal text-[#8a8983]">
              의뢰 · 접수 {formatShortDate(openIntake.receivedAt)}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => openDialog({ kind: 'confirm' })}>
              <PhoneCall className="size-3.5" />
              확인 기록…
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
            <DropdownMenuItem disabled={isOpeningWindow || propertyId === null} onSelect={() => void openInNewWindow()}>
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
          <DropdownMenuItem onSelect={() => openDialog({ kind: 'listing', listing: row.listing as unknown as Listing })}>
            <Pencil className="size-3.5" />
            가격·조건 수정
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pauseMutation.isPending} onSelect={() => pauseMutation.mutate(row.listing)}>
            {row.listing.isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {row.listing.isPaused ? `${row.typeLabel} 다시 진행` : `${row.typeLabel}만 중단`}
          </DropdownMenuItem>
          {mayDeleteListing && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => openDialog({ kind: 'delete', row })}>
                <Trash2 className="size-3.5" />
                거래 조건 삭제…
              </DropdownMenuItem>
            </>
          )}
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
      : // 세입자 기록이 없으면 의뢰에 적어 둔 거주 상태를 쓴다(등록·목록에서 고른 값)
        openIntake?.occupancyStatus === 'tenant'
        ? { label: '세입자 거주 중', tone: 'yellow', detail: null }
        : openIntake?.occupancyStatus === 'vacant'
          ? { label: '공실', tone: 'green', detail: null }
          : openIntake?.occupancyStatus === 'owner_occupied' || activeContacts.some((item) => item.isResident)
            ? { label: '소유자 거주 중', tone: 'brown', detail: null }
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
      case 'open-my-ads':
        openMyAdsForUnit();
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
        openDialog({ kind: 'contact' });
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
              <DropdownMenuItem onSelect={() => openDialog({ kind: 'contact' })}>소유자·관련인</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openDialog({ kind: 'tenant' })}>세입자</DropdownMenuItem>
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
          onOther={() => openDialog({ kind: 'confirm' })}
        />
      ) : (
        <div className="border-t border-[#e9e9e7] py-2.5 text-[13px] text-[#37352f]/45">
          <div className="mb-0.5 font-semibold text-[#37352f]">매물 확인</div>
          진행 중인 의뢰가 없어 확인할 것이 없습니다.
        </div>
      )}
      <IntakeProjectSection intakeId={openIntake?.id ?? intakes[0]?.id} />
      <AdsSection
        rows={offerRows.length > 0 ? offerRows : leftoverAdRows}
        onOpenMyAds={openMyAdsForUnit}
        actions={
          openIntake && listings.length > 0 && propertyId !== null ? (
            <PropertyAdActions
              group={{
                propertyId,
                intakeId: openIntake.id,
                listings: listings.map((listing) => ({
                  id: listing.id,
                  transactionType: listing.transactionType,
                  price: listing.price ?? null,
                  deposit: listing.deposit ?? null,
                  monthlyRent: listing.monthlyRent ?? null,
                  activeAdvertisements: (listing.advertisements ?? []).filter((ad) => ad.status === 'active'),
                })),
              }}
              location={title}
              selectedIds={NO_SELECTED_ADS}
              onClearSelection={noop}
            />
          ) : null
        }
      />
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
          buyerIntakeId: match.buyerRequirement?.buyerIntakeId,
          listingIntakeId: match.listing?.intakeId,
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
        closedSummary={closedSummary}
        confirm={confirmChip}
        ownerCall={owner?.contact?.phone ? { phone: owner.contact.phone, name: owner.contact.name } : null}
        confirmPending={confirmMutation.isPending}
        onEditListing={editListing}
        onConfirmMenu={() => openDialog({ kind: 'confirm' })}
        onConfirm={openIntake ? () => confirmMutation.mutate(openIntake) : null}
        onFocusComposer={composerOptions.length > 0 ? openComposer : () => openDialog({ kind: 'consultation' })}
        onToggleGuest={() => setGuest((value) => !value)}
        menu={headerMenu}
        onOpenList={openPropertyList}
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
                <button type="button" className={nb.line} onClick={() => openDialog({ kind: 'listing', listing: null })}>
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
              onBook={activeMatchCount > 0 ? goToViewingBooking : null}
              onAddTenant={() => openDialog({ kind: 'tenant' })}
            />

            {!guest && (allListingIds.length > 0 || propertyDeals.length > 0) && (
              <section id="buyers">
                <H2 title="손님 · 거래" count={activeMatchCount} hint="매칭과 거래 진행" />
                <PropertyInspectorProgressTab
                  listingIds={allListingIds}
                  // 새 매칭은 진행 중 의뢰의 거래 조건에만 건다. 종료된 의뢰의 조건은 이력으로만 보인다.
                  creatableListingIds={listings.map((listing) => listing.id)}
                  connectTarget={{ property, listings }}
                  // 거래 조건이나 거래가 있으면 관리호수도 있다
                  propertyId={propertyId ?? ''}
                  deals={propertyDeals}
                  dealsStatus={propertyQuery.isError ? 'error' : propertyQuery.data ? 'ready' : 'loading'}
                  onRetryDeals={() => void propertyQuery.refetch()}
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
                    onClick={composerOptions.length > 0 ? openComposer : () => openDialog({ kind: 'consultation' })}
                  >
                    <Plus />
                    상담 적기
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
              onFallback={() => openDialog({ kind: 'consultation' })}
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

      {/* ── 대화상자 ── (관리호수가 생긴 뒤에만 열린다: openDialog) */}
      {propertyId !== null && (
        <>
      <ListingFormDialog
        open={dialog?.kind === 'listing'}
        onOpenChange={(open) => !open && closeAndRefresh()}
        propertyId={propertyId}
        siteType={property.site?.type}
        listing={dialog?.kind === 'listing' ? dialog.listing : null}
        existingTypes={listings.map((listing) => listing.transactionType)}
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
        </>
      )}
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
      <Dialog open={bookingDialog !== null} onOpenChange={(open) => !open && setBookingDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{bookingDialog?.step === 'blocked' ? '먼저 매물 확인을 완료하세요' : '누구와의 임장인가요?'}</DialogTitle>
            <DialogDescription>
              {bookingDialog?.step === 'blocked'
                ? bookingDialog.reason
                : '임장 일정은 매칭된 고객마다 잡습니다. 고객을 고르면 일정 잡는 창이 열립니다.'}
            </DialogDescription>
          </DialogHeader>
          {bookingDialog?.step === 'pick' && (
            <ul className="divide-y divide-border rounded-md border">
              {bookableMatches.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60"
                    onClick={() => startViewingBooking(match)}
                  >
                    <span className="min-w-0 truncate font-medium">
                      {match.buyerRequirement?.contact?.name ?? '고객'}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {getStatusMeta('matchStage', normalizeMatchStage(match.stage)).label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {bookingDialog?.step === 'blocked' && (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBookingDialog(null)}>
                닫기
              </Button>
              {openIntake && /확인/.test(bookingDialog.reason) && (
                <Button
                  type="button"
                  disabled={confirmMutation.isPending}
                  onClick={() => void confirmThenBook(bookingDialog.match)}
                >
                  확인 완료
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <TaskCreateDialog
        open={dialog?.kind === 'task' && propertyId !== null}
        onOpenChange={(open) => !open && closeDialog()}
        propertyId={propertyId ?? undefined}
        listingId={listings.length === 1 ? listings[0].id : undefined}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && closeDialog()}
        title="거래 조건을 삭제할까요?"
        description={
          dialog?.kind === 'delete'
            ? `${dialog.row.typeLabel} ${formatListingPrice(dialog.row.listing)} 조건을 삭제합니다. 가격 이력도 함께 지워지며 되돌릴 수 없습니다.${offerRows.length <= 1 ? ' 마지막 조건이라 매물관리 목록에서도 사라지고, 접수일과 확인 이력도 함께 사라집니다. 거래가 끝난 것이면 지우지 말고 의뢰 종료를 쓰세요.' : ''}`
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
  if (supply > 0) props.push({ key: 'supply', label: '공급', value: `${supply.toFixed(2)}㎡`, hint: formatPyeong(supply) });
  if (exclusive > 0) {
    props.push({ key: 'exclusive', label: '전용', value: `${exclusive.toFixed(2)}㎡`, hint: formatPyeong(exclusive) });
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
