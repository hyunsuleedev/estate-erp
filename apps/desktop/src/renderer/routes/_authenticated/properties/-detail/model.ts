import { formatPropertySpaceLabel } from '../-registration-space';
import type {
  Consultation,
  DealSummary as Deal,
  ListingAdvertisement,
  ListingIntake,
  Property,
  PropertyListing,
  Tenant,
} from '@estate-erp/api-client';
import {
  formatPrice,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
} from '@estate-erp/shared';
import {
  getIntakeConfirmationState,
  getListingAvailability,
} from '@/lib/listing-status';
import { getStatusMeta } from '@/lib/status-config';
import { getAdChannelLabel } from '@/lib/advertisement-channels';
import { splitConsultationTag } from '../../consultations/-consultation-list-model';
export { getAdChannelLabel } from '@/lib/advertisement-channels';

/*
 * 매물 상세 페이지 표시 계산.
 * 서버 응답(Property·ListingIntake·Consultation)을 화면이 바로 쓰는 값으로 바꾼다.
 * 화면 파일(sections.tsx)은 표시만 한다.
 */

// ── 서버가 실제로 내려주지만 api-client 타입에는 빠진 필드 ─────────────────

export type DetailSite = NonNullable<Property['site']> & {
  builtYear?: number | null;
  totalUnits?: number | null;
  totalDongs?: number | null;
  ward?: {
    name: string;
    district?: { name: string } | null;
  } | null;
};

type DetailUnitType = {
  name: string;
  exclusiveAreaM2: number | string | null;
  supplyAreaM2: number | string | null;
  roomCount?: number | null;
  bathRoomCount?: number | null;
  direction?: string | null;
};

export type DetailUnit = Omit<NonNullable<Property['unit']>, 'siteUnitType'> & {
  roomCount?: number | null;
  bathRoomCount?: number | null;
  siteUnitType?: DetailUnitType | null;
};

/** 상세 응답의 거래 조건. 비용까지 서버가 함께 준다. */
export type DetailListing = PropertyListing & {
  maintenanceFee?: number | null;
  maintenanceFeeIncludes?: string[];
  loanAmount?: number | null;
  premium?: number | null;
};

// ── 공통 표시 값 ───────────────────────────────────────────────────

export const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-[#fdebec] text-[#8f4b46]' },
  jeonse: { label: '전세', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  monthly: { label: '월세', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
};

export function getTransactionTypeMeta(transactionType: string) {
  return (
    transactionTypeMeta[transactionType] ?? {
      label: transactionType,
      className: 'bg-[#f1f0ec] text-[#5f5e5a]',
    }
  );
}

/** 매물관리 표의 매물상태 배지와 같은 색. */
export const availabilityMeta: Record<
  ListingAvailability,
  { label: string; dot: string; pill: string }
> = {
  [ListingAvailability.AVAILABLE]: {
    label: getStatusMeta('listingAvailability', ListingAvailability.AVAILABLE).label,
    dot: 'bg-[#6c9b7a]',
    pill: 'bg-[#eef3ed] text-[#44745a]',
  },
  [ListingAvailability.PAUSED]: {
    label: getStatusMeta('listingAvailability', ListingAvailability.PAUSED).label,
    dot: 'bg-[#dfab01]',
    pill: 'bg-[#fbf3db] text-[#9f6b00]',
  },
  [ListingAvailability.IN_CONTRACT]: {
    label: getStatusMeta('listingAvailability', ListingAvailability.IN_CONTRACT).label,
    dot: 'bg-[#529cca]',
    pill: 'bg-[#e7f3f8] text-[#337ea9]',
  },
  [ListingAvailability.CLOSED]: {
    label: getStatusMeta('listingAvailability', ListingAvailability.CLOSED).label,
    dot: 'bg-[#b4b4b1]',
    pill: 'bg-[#f1f1ef] text-[#787774]',
  },
};

const siteTypeLabels: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독/다가구',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

export const directionLabels: Record<string, string> = {
  E: '동향', EE: '동향', ES: '남동향', SE: '남동향', S: '남향', SS: '남향',
  SW: '남서향', WS: '남서향', W: '서향', WW: '서향', NW: '북서향', WN: '북서향',
  N: '북향', NN: '북향', NE: '북동향', EN: '북동향',
};

export const contactRoleLabels: Record<string, string> = {
  owner: '소유자',
  co_owner: '공동소유',
  representative: '대리인',
  lawyer: '법무사',
  tax_agent: '세무사',
};

const closedReasonLabels: Record<string, string> = {
  deal_completed: '거래 완료',
  external_deal_completed: '타 중개·직거래 계약',
  withdrawn: '의뢰 철회',
  unavailable: '거래 불가',
  superseded: '새 의뢰로 대체',
  other: '기타',
};

// ── 날짜·숫자 ─────────────────────────────────────────────────────

const DAY = 86_400_000;

function toDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026.10.29" */
export function formatFullDate(value?: string | null) {
  const date = toDate(value);
  if (!date) return '-';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

/** 올해면 "11.03", 아니면 "25.11.03" */
export function formatShortDate(value?: string | null) {
  const date = toDate(value);
  if (!date) return '-';
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  return date.getFullYear() === new Date().getFullYear()
    ? md
    : `${date.getFullYear()}.${md}`; // 다른 해는 "2027.03.01" (화면 표기 기준)
}

/** "14:30" */
export function formatTime(value?: string | null) {
  const date = toDate(value);
  if (!date) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function daysSince(value?: string | null) {
  const date = toDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / DAY));
}

export function daysUntil(value?: string | null) {
  const date = toDate(value);
  if (!date) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - startOfToday.getTime()) / DAY);
}

/** "오늘" · "어제" · "3일 전" */
export function formatAgo(value?: string | null) {
  const days = daysSince(value);
  if (days === null) return '-';
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

/** "오늘" · "내일" · "5일 후" · "3일 지남" */
export function formatDue(value?: string | null) {
  const days = daysUntil(value);
  if (days === null) return '-';
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  if (days > 0) return `${days}일 후`;
  return `${-days}일 지남`;
}

export function formatAmount(value: number | null | undefined) {
  if (value == null) return '-';
  if (value === 0) return '없음';
  return formatPrice(value);
}

// ── 호실 ───────────────────────────────────────────────────────────

export interface UnitIdentity {
  siteName: string;
  /** "103동" (단일 동 건물이면 null) */
  dong: string | null;
  /** "3401호" */
  ho: string | null;
  /** "아파트 · 강동구 고덕동" */
  eyebrow: string[];
  address: string | null;
  unitTypeName: string | null;
}

export function getUnitIdentity(property: Property): UnitIdentity {
  const site = property.site as DetailSite | undefined;
  const unit = property.unit as DetailUnit | null | undefined;
  const dongName =
    unit?.dong && !unit.dong.isPlaceholder ? unit.dong.name.trim() : null;
  const region = [site?.ward?.district?.name, site?.ward?.name]
    .filter(Boolean)
    .join(' ');
  return {
    siteName: site?.name ?? '매물',
    dong: dongName ? (/동$/.test(dongName) ? dongName : `${dongName}동`) : null,
    ho: formatPropertySpaceLabel(unit, site?.type) || null,
    eyebrow: [
      site?.type ? (siteTypeLabels[site.type] ?? site.type) : null,
      region || null,
    ].filter((item): item is string => Boolean(item)),
    address: site?.roadAddress ?? site?.jibunAddress ?? null,
    unitTypeName: unit?.siteUnitType?.name ?? null,
  };
}

export function getUnitTitle(property: Property) {
  const identity = getUnitIdentity(property);
  return [identity.siteName, identity.dong, identity.ho].filter(Boolean).join(' ');
}

// ── 거래 조건 ──────────────────────────────────────────────────────

export function compareListing(a: PropertyListing, b: PropertyListing) {
  const order: Record<string, number> = { sale: 0, jeonse: 1, monthly: 2 };
  const typeOrder = (order[a.transactionType] ?? 9) - (order[b.transactionType] ?? 9);
  if (typeOrder !== 0) return typeOrder;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function formatListingPrice(
  listing: Pick<PropertyListing, 'transactionType' | 'price' | 'deposit' | 'monthlyRent'>,
) {
  if (listing.transactionType === 'monthly') {
    // 보증금 0원(무보증)은 금액이다. null만 미입력("-")으로 적는다.
    return `${listing.deposit != null ? formatPrice(listing.deposit) : '-'} / ${
      listing.monthlyRent ? formatPrice(listing.monthlyRent) : '-'
    }`;
  }
  const price = listing.price ?? listing.deposit;
  return price ? formatPrice(price) : '-';
}

function formatAdPrice(listing: PropertyListing, ad: ListingAdvertisement) {
  if (listing.transactionType === 'monthly') {
    return `${ad.advertisedDeposit != null ? formatPrice(ad.advertisedDeposit) : '-'} / ${
      ad.advertisedMonthlyRent ? formatPrice(ad.advertisedMonthlyRent) : '-'
    }`;
  }
  const price = ad.advertisedPrice ?? ad.advertisedDeposit;
  return price ? formatPrice(price) : '-';
}

/** 게재 중 광고의 광고가가 지금 거래 조건 가격과 다르면 true (재게재 필요). */
function isAdPriceStale(listing: PropertyListing, ad: ListingAdvertisement) {
  if (ad.status !== 'active') return false;
  if (listing.transactionType === 'monthly') {
    return (
      (ad.advertisedDeposit != null && ad.advertisedDeposit !== listing.deposit) ||
      (ad.advertisedMonthlyRent != null && ad.advertisedMonthlyRent !== listing.monthlyRent)
    );
  }
  const listingPrice = listing.price ?? listing.deposit;
  const adPrice =
    listing.transactionType === 'jeonse'
      ? (ad.advertisedDeposit ?? ad.advertisedPrice)
      : ad.advertisedPrice;
  return adPrice != null && listingPrice != null && adPrice !== listingPrice;
}

export interface OfferAd {
  id: string;
  channelLabel: string;
  priceText: string;
  stale: boolean;
  url: string | null;
}

export interface OfferRow {
  listing: DetailListing;
  typeLabel: string;
  typeClassName: string;
  priceText: string;
  availability: ListingAvailability;
  delta: { direction: 'up' | 'down'; amountText: string; dateText: string } | null;
  moveIn: string;
  moveInPending: boolean;
  loan: string;
  maintenance: string;
  premium: string | null;
  activeAds: OfferAd[];
  endedAdCount: number;
  updatedText: string;
}

/** 입주 가능 시기: "즉시" · "02.25 이후" · "02.01 ~ 03.15" · "협의". 모르면 null. */
function formatMoveIn(listing: PropertyListing) {
  switch (listing.moveInAvailableType) {
    case 'immediate':
      return '즉시';
    case 'negotiable':
      return '협의';
    case 'date':
      return listing.moveInAvailableFrom ? `${formatShortDate(listing.moveInAvailableFrom)} 이후` : null;
    case 'range':
      return listing.moveInAvailableFrom || listing.moveInAvailableTo
        ? `${formatShortDate(listing.moveInAvailableFrom)} ~ ${formatShortDate(listing.moveInAvailableTo)}`
        : null;
    default:
      return null;
  }
}

function getPriceDelta(listing: PropertyListing): OfferRow['delta'] {
  const latest = listing.priceHistories?.[0];
  if (!latest) return null;
  const usesPrice = listing.transactionType !== 'monthly' && listing.price != null;
  const before = usesPrice ? latest.priceBefore : latest.depositBefore;
  const after = usesPrice ? latest.priceAfter : latest.depositAfter;
  if (before == null || after == null || before === after) return null;
  return {
    direction: after < before ? 'down' : 'up',
    amountText: formatPrice(Math.abs(after - before)),
    dateText: formatShortDate(latest.createdAt),
  };
}

export function buildOfferRows(listings: DetailListing[]): OfferRow[] {
  return listings
    .slice()
    .sort(compareListing)
    .map((listing) => {
      const meta = getTransactionTypeMeta(listing.transactionType);
      const moveIn = formatMoveIn(listing);
      const ads = listing.advertisements ?? [];
      return {
        listing,
        typeLabel: meta.label,
        typeClassName: meta.className,
        priceText: formatListingPrice(listing),
        availability: getListingAvailability(listing),
        delta: getPriceDelta(listing),
        moveIn: moveIn ?? '확인 필요',
        moveInPending: moveIn === null,
        loan: listing.loanAmount === undefined ? '-' : formatAmount(listing.loanAmount),
        maintenance:
          listing.maintenanceFee === undefined ? '-' : formatAmount(listing.maintenanceFee),
        premium: listing.premium ? formatPrice(listing.premium) : null,
        activeAds: ads
          .filter((ad) => ad.status === 'active')
          .map((ad) => ({
            id: ad.id,
            channelLabel: getAdChannelLabel(ad.channel),
            priceText: formatAdPrice(listing, ad),
            stale: isAdPriceStale(listing, ad),
            url: ad.url ?? null,
          })),
        endedAdCount: ads.filter((ad) => ad.status !== 'active').length,
        updatedText: formatAgo(listing.updatedAt),
      };
    });
}

// ── 이 호실의 모든 거래 조건 · 거래 ───────────────────────────────────

/**
 * 이 호실의 거래 조건 id 전부. 매물 응답(property.listings)에는 진행 중 의뢰의 조건만
 * 오므로, 거래 완료로 자동 종료된 의뢰의 조건은 의뢰 목록에서 함께 모은다.
 * 그래야 거래가 끝난 뒤에도 매칭·거래 이력이 남는다.
 */
export function collectListingIds(listings: Array<{ id: string }>, intakes: ListingIntake[]) {
  const ids = new Set(listings.map((listing) => listing.id));
  for (const intake of intakes) {
    for (const listing of intake.listings ?? []) ids.add(listing.id);
  }
  return [...ids];
}

/** 사무소 전체 거래 중 이 호실 것: 호실에 직접 걸렸거나 이 호실의 거래 조건에 걸린 거래. */
export function selectPropertyDeals(deals: Deal[], propertyId: string, listingIds: string[]) {
  const listingIdSet = new Set(listingIds);
  return deals.filter(
    (deal) =>
      deal.propertyId === propertyId || (deal.listingId != null && listingIdSet.has(deal.listingId)),
  );
}

// ── 의뢰 상태 ──────────────────────────────────────────────────────

export type Tone = 'ok' | 'deal' | 'warn' | 'danger' | 'neutral';

export interface ConfirmSummary {
  state: IntakeConfirmationState;
  /** 카드 큰 글씨: "확인 완료" · "재확인 필요" (상태 이름은 공용 status-config와 같다) */
  headline: string;
  /** 카드 작은 글씨: "3일 전 · 11.09 전화 확인" */
  detail: string;
  chip: string;
  tone: Tone;
}

export function getConfirmSummary(intake: ListingIntake): ConfirmSummary {
  const state = getIntakeConfirmationState(intake);
  switch (state) {
    case IntakeConfirmationState.VERIFIED:
      return {
        state,
        headline: '확인 완료',
        detail: `${formatAgo(intake.lastVerifiedAt)} · ${formatShortDate(intake.lastVerifiedAt)}`,
        chip: `확인 ${formatAgo(intake.lastVerifiedAt)}`,
        tone: 'ok',
      };
    case IntakeConfirmationState.OVERDUE:
      return {
        state,
        headline: '재확인 필요',
        detail: `${formatShortDate(intake.nextConfirmAt)} 확인 예정이었음 · 마지막 확인 ${formatAgo(intake.lastVerifiedAt)}`,
        chip: '재확인 필요',
        tone: 'warn',
      };
    case IntakeConfirmationState.NO_ANSWER:
      return {
        state,
        headline: '부재중',
        detail: `${formatAgo(intake.lastCheckedAt)} 연락했지만 받지 않음`,
        chip: '부재중',
        tone: 'warn',
      };
    default:
      return {
        state,
        headline: '미확인',
        detail: `접수 ${daysSince(intake.receivedAt) ?? 0}일째 · 아직 소유자 확인 기록이 없음`,
        chip: `미확인 · 접수 ${daysSince(intake.receivedAt) ?? 0}일째`,
        tone: 'warn',
      };
  }
}

export function getIntakeStatusLabel(intake: ListingIntake) {
  if (intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
    return intake.closedReason
      ? `종료 · ${closedReasonLabels[intake.closedReason] ?? intake.closedReason}`
      : '종료';
  }
  if (intake.lifecycleStatus === IntakeLifecycleStatus.HOLD) return '보류';
  return '진행';
}

// ── 사람 ───────────────────────────────────────────────────────────

export interface PersonRow {
  key: string;
  contactId: string | null;
  name: string;
  role: string;
  isPrimary: boolean;
  phone: string | null;
  /** 지분 · 실거주 · 메모 */
  detail: string | null;
}

export interface TenantRow {
  key: string;
  contactId: string | null;
  name: string;
  phone: string | null;
  /** residing · moving_out */
  statusKey: string;
  status: string;
  /** "보증금 5억 · 월 120만" */
  terms: string | null;
  /** "24.03.01 ~ 26.02.28" */
  period: string | null;
  /** 만기까지 남은 날 (지났으면 음수) */
  daysToEnd: number | null;
  memo: string | null;
}

const roleOrder: Record<string, number> = {
  owner: 0,
  co_owner: 1,
  representative: 2,
  lawyer: 3,
  tax_agent: 4,
};

export function buildPeople(property: Property): PersonRow[] {
  return (property.propertyContacts ?? [])
    .filter((item) => item.status !== 'archived' && item.status !== 'transferred')
    .slice()
    .sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) ||
        (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9),
    )
    .map((item) => ({
      key: item.id,
      contactId: item.contact?.id ?? item.contactId ?? null,
      name: item.contact?.name ?? '이름 없음',
      role: contactRoleLabels[item.role] ?? item.role,
      isPrimary: item.isPrimary,
      phone: item.contact?.phone ?? null,
      detail:
        [
          item.shareRatio != null ? `지분 ${Number(item.shareRatio)}%` : null,
          item.isResident ? '실거주' : null,
          item.memo?.trim() || null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    }));
}

const tenantStatusLabels: Record<string, string> = {
  residing: '거주중',
  moving_out: '퇴거 예정',
  moved: '퇴거',
};

export function buildTenants(tenants: Tenant[]): TenantRow[] {
  return tenants
    .filter((tenant) => tenant.status !== 'moved')
    .map((tenant) => {
      const terms = [
        tenant.deposit != null ? `보증금 ${formatPrice(tenant.deposit)}` : null,
        tenant.monthlyRent ? `월 ${formatPrice(tenant.monthlyRent)}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const end = tenant.moveOutDate ?? tenant.contractEnd;
      return {
        key: tenant.id,
        contactId: tenant.contact?.id ?? tenant.contactId ?? null,
        name: tenant.contact?.name ?? '이름 없음',
        phone: tenant.contact?.phone ?? null,
        statusKey: tenant.status,
        status: tenantStatusLabels[tenant.status] ?? tenant.status,
        terms: terms || null,
        period:
          tenant.contractStart || tenant.contractEnd
            ? `${formatShortDate(tenant.contractStart)} ~ ${formatShortDate(tenant.contractEnd)}`
            : null,
        daysToEnd: daysUntil(end),
        memo: tenant.memo?.trim() || null,
      };
    });
}

// ── 기록 (상담 · 확인 · 가격 · 광고 · 거래 · 의뢰) ───────────────────

export type RecordKind = 'consultation' | 'confirm' | 'price' | 'ad' | 'deal' | 'intake';
export type RecordFilter = 'all' | 'consultation' | 'price' | 'ad' | 'deal';

export interface RecordItem {
  id: string;
  kind: RecordKind;
  at: string;
  dateText: string;
  timeText: string | null;
  title: string;
  /** 제목 옆 회색 글: 사람 이름 · 거래 종류 · 채널 */
  meta: string | null;
  /** 본문 (상담 내용 등). 인용 모양으로 보여준다. */
  body: string | null;
  /** 한 줄 설명 (가격 변화 등) */
  summary: string | null;
  /** 가격 기록: 내렸는지 올렸는지 */
  direction?: 'up' | 'down' | null;
  url: string | null;
}

export const recordFilterOf: Record<RecordKind, RecordFilter> = {
  consultation: 'consultation',
  confirm: 'consultation',
  price: 'price',
  ad: 'ad',
  deal: 'deal',
  intake: 'deal',
};

const consultationTitles: Record<string, string> = {
  phone: '전화 상담',
  visit: '방문 상담',
  online: '문자·온라인 상담',
};

const CONFIRM_PREFIX = '[매물확인]';

function priceDirection(
  transactionType: string,
  history: NonNullable<PropertyListing['priceHistories']>[number],
): 'up' | 'down' | null {
  const usesPrice = transactionType !== 'monthly' && history.priceAfter != null;
  const before = usesPrice ? history.priceBefore : history.depositBefore;
  const after = usesPrice ? history.priceAfter : history.depositAfter;
  if (before == null || after == null || before === after) return null;
  return after > before ? 'up' : 'down';
}

function formatHistoryPrice(
  transactionType: string,
  value: { price: number | null; deposit: number | null; monthlyRent: number | null },
) {
  return formatListingPrice({ transactionType, ...value });
}

export function buildRecords({
  listings,
  consultations,
  intakes,
  deals = [],
}: {
  listings: DetailListing[];
  consultations: Consultation[];
  intakes: ListingIntake[];
  /** 이 호실의 거래 (완료·취소 포함). selectPropertyDeals로 고른다. */
  deals?: Deal[];
}): RecordItem[] {
  const typeLabel = (listing: PropertyListing) =>
    getTransactionTypeMeta(listing.transactionType).label;
  const items: Array<Omit<RecordItem, 'dateText' | 'timeText'> & { withTime?: boolean }> = [];

  for (const consultation of consultations) {
    const content = consultation.content?.trim() ?? '';
    const isConfirm = consultation.purpose === 'listing_confirm';
    // "[매물확인] 살아있음\n메모" → 제목 "매물 확인 · 유효함", 본문 "메모" (저장된 글은 그대로 두고 보일 때만)
    const confirmTag = isConfirm && content.startsWith(CONFIRM_PREFIX) ? splitConsultationTag(content) : null;
    items.push({
      id: `consultation-${consultation.id}`,
      kind: isConfirm ? 'confirm' : 'consultation',
      at: consultation.createdAt,
      title: isConfirm ? (confirmTag?.tag ?? '매물 확인') : (consultationTitles[consultation.type] ?? '상담'),
      meta: consultation.contact?.name ?? null,
      body: (confirmTag ? confirmTag.body : content) || null,
      summary: null,
      url: null,
      withTime: true,
    });
  }

  for (const listing of listings) {
    for (const history of listing.priceHistories ?? []) {
      const before = formatHistoryPrice(listing.transactionType, {
        price: history.priceBefore,
        deposit: history.depositBefore,
        monthlyRent: history.monthlyRentBefore,
      });
      const after = formatHistoryPrice(listing.transactionType, {
        price: history.priceAfter,
        deposit: history.depositAfter,
        monthlyRent: history.monthlyRentAfter,
      });
      items.push({
        id: `price-${history.id}`,
        kind: 'price',
        at: history.createdAt,
        title: '가격 변경',
        meta: typeLabel(listing),
        body: history.reason?.trim() || null,
        summary: `${before} → ${after}`,
        url: null,
        direction: priceDirection(listing.transactionType, history),
      });
    }
    for (const ad of listing.advertisements ?? []) {
      items.push({
        id: `ad-start-${ad.id}`,
        kind: 'ad',
        at: ad.startedAt ?? ad.firstSeenAt,
        title: '광고 시작',
        meta: getAdChannelLabel(ad.channel),
        body: ad.memo?.trim() || null,
        summary: `${typeLabel(listing)} ${formatAdPrice(listing, ad)}`,
        url: ad.url ?? null,
      });
      if (ad.status !== 'active' && ad.endedAt) {
        items.push({
          id: `ad-end-${ad.id}`,
          kind: 'ad',
          at: ad.endedAt,
          title: '광고 종료',
          meta: getAdChannelLabel(ad.channel),
          body: null,
          summary: null,
          url: null,
        });
      }
    }
  }

  for (const deal of deals) {
    const dealType = getTransactionTypeMeta(deal.transactionType).label;
    const isLease = deal.transactionType === 'jeonse' || deal.transactionType === 'monthly';
    const party = deal.buyerContact?.name ? `${isLease ? '임차인' : '매수인'} ${deal.buyerContact.name}` : null;
    items.push({
      id: `deal-${deal.id}`,
      kind: 'deal',
      at: deal.createdAt,
      title: '거래 시작',
      meta: [dealType, party].filter(Boolean).join(' · ') || null,
      body: null,
      summary: deal.agreedPrice ?? deal.agreedDeposit
        ? formatListingPrice({
            transactionType: deal.transactionType,
            price: deal.agreedPrice,
            deposit: deal.agreedDeposit,
            monthlyRent: deal.agreedMonthlyRent,
          })
        : null,
      url: null,
    });
    if (deal.isCancelled && deal.cancelledAt) {
      items.push({
        id: `deal-cancel-${deal.id}`,
        kind: 'deal',
        at: deal.cancelledAt,
        title: '거래 취소',
        meta: dealType,
        body: deal.cancelReason?.trim() || null,
        summary: null,
        url: null,
      });
    } else if (deal.stageChangedAt && deal.stageChangedAt !== deal.createdAt) {
      items.push({
        id: `deal-stage-${deal.id}`,
        kind: 'deal',
        at: deal.stageChangedAt,
        title: `거래 ${getStatusMeta('dealStage', deal.stage).label}`,
        meta: dealType,
        body: null,
        summary: null,
        url: null,
      });
    }
  }

  for (const intake of intakes) {
    items.push({
      id: `intake-${intake.id}`,
      kind: 'intake',
      at: intake.receivedAt,
      title: '의뢰 접수',
      meta: null,
      body: null,
      summary: null,
      url: null,
    });
    if (intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
      items.push({
        id: `intake-closed-${intake.id}`,
        kind: 'intake',
        at: intake.lifecycleChangedAt,
        title: '의뢰 종료',
        meta: intake.closedReason ? (closedReasonLabels[intake.closedReason] ?? null) : null,
        body: null,
        summary: null,
        url: null,
      });
    }
  }

  return items
    .filter((item) => toDate(item.at))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map(({ withTime, ...item }) => ({
      ...item,
      dateText: formatShortDate(item.at),
      timeText: withTime ? formatTime(item.at) : null,
    }));
}

// ── 지난 의뢰 ──────────────────────────────────────────────────────

export interface PastIntakeRow {
  id: string;
  period: string;
  status: string;
  offers: string;
}

export function buildPastIntakes(intakes: ListingIntake[]): PastIntakeRow[] {
  return intakes
    .filter((intake) => intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED)
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .map((intake) => ({
      id: intake.id,
      period: `${formatFullDate(intake.receivedAt)} ~ ${formatFullDate(intake.lifecycleChangedAt)}`,
      status: getIntakeStatusLabel(intake),
      offers:
        (intake.listings ?? [])
          .map(
            (listing) =>
              `${getTransactionTypeMeta(listing.transactionType).label} ${formatListingPrice(listing)}`,
          )
          .join(' · ') || '거래 조건 없음',
    }));
}
