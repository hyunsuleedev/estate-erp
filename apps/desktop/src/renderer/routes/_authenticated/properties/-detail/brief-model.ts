import type {
  DealListItem as Deal,
  ListingIntake,
  Match,
  Property,
  PropertyPhoto,
  Tenant,
} from '@estate-erp/api-client';
import {
  formatPrice,
  formatFloorRange,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
  MaintenanceFeeInclude,
  MatchStage,
  findDealThatOutlivedEvent,
  normalizeMatchStage,
} from '@estate-erp/shared';
import { getIntakeConfirmationState } from '@/lib/listing-status';
import {
  availabilityMeta,
  daysSince,
  daysUntil,
  formatAgo,
  formatAmount,
  formatDue,
  formatListingPrice,
  formatShortDate,
  formatTime,
  directionLabels,
  getTransactionTypeMeta,
  getUnitIdentity,
  type DetailListing,
  type DetailSite,
  type DetailUnit,
  type OfferRow,
  type PersonRow,
  type TenantRow,
} from './model';
import { formatPyeong } from '@/lib/format';

/*
 * 매물 상세 2판(중개사 업무 순서) 표시 계산.
 * 브리핑 카드 · 지금 챙길 것 · 다가오는 임장 · 손님에게 보여주기 가림 · 카톡 브리핑 글.
 * 모두 서버 응답에서 바로 계산한다. 저장하지 않는 값(통화 가능 시간, 보여주기 조건 등)은 만들지 않는다.
 */

// ── 평 · 평당가 ─────────────────────────────────────────────────────

function toPositive(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** 공급면적(평). 호실 값이 없으면 평형 타입 값. */
export function getSupplyPyeong(property: Property) {
  const unit = property.unit as DetailUnit | null | undefined;
  const supply = toPositive(unit?.supplyAreaM2) ?? toPositive(unit?.siteUnitType?.supplyAreaM2);
  return supply ? Math.round(supply * 0.3025 * 10) / 10 : null;
}

/** "평당 4,647만" — 공급평 기준. 매매·전세 가격에만 쓴다. */
export function formatPerPyeong(price: number | null | undefined, pyeong: number | null) {
  if (!price || !pyeong) return null;
  return `평당 ${formatPrice(Math.round(price / pyeong))}`;
}

// ── 세안고: 매매가 떠안는 임대 ─────────────────────────────────────────

export interface SaleLease {
  deposit: number;
  /** "현 전세 6억" · "새 전세 6억 5,000만" · "현 월세 1억 / 120만" */
  label: string;
  note: string | null;
  /** agreed: 거래 합의 금액 · asking: 합의 전이라 호가 · tenant: 지금 세입자 보증금 */
  basis: 'agreed' | 'asking' | 'tenant';
  source: 'new_lease' | 'tenant';
}

function leaseText(prefix: string, deposit: number, monthlyRent: number | null | undefined) {
  // 보증금 0원(무보증 월세)도 금액이다: "없음"으로 적는다.
  const depositText = deposit === 0 ? '보증금 없음' : formatPrice(deposit);
  return monthlyRent
    ? `${prefix} 월세 ${depositText} / ${formatPrice(monthlyRent)}`
    : `${prefix} 전세 ${depositText}`;
}

const ACTIVE_DEAL_STAGES = new Set(['preparing', 'preContract', 'contracted', 'settling']);

/**
 * 매매 손님이 떠안는 보증금. 같은 호실의 전세·월세 조건이 계약 진행 중이면 그 거래의 합의 금액
 * (거래관리와 같이 전세는 agreedPrice, 월세는 agreedDeposit·agreedMonthlyRent),
 * 아니면 지금 거주 중인 세입자의 보증금. 모르면 null (실투자금을 계산하지 않는다).
 * - 합의 금액이 아직 없으면 호가를 쓰되 "호가 기준"이라고 밝힌다.
 * - 0원은 "없음"이 아니라 금액이다 (무보증 월세면 실투자금 = 매매가). null만 미입력으로 본다.
 * - 새 임대가 계약 중이면 나갈 세입자의 보증금으로 대신하지 않는다.
 */
export function getSaleLease(
  listings: Array<DetailListing & { availability: ListingAvailability }>,
  tenants: Tenant[],
  { guest = false, deals = [] }: { guest?: boolean; deals?: Deal[] } = {},
): SaleLease | null {
  const contracted = listings.find(
    (listing) =>
      listing.transactionType !== 'sale' &&
      listing.availability === ListingAvailability.IN_CONTRACT,
  );
  if (contracted) {
    const isJeonse = contracted.transactionType === 'jeonse';
    const deal = deals.find(
      (item) => item.listingId === contracted.id && !item.isCancelled && ACTIVE_DEAL_STAGES.has(item.stage),
    );
    const agreedDeposit = deal ? (isJeonse ? (deal.agreedPrice ?? deal.agreedDeposit) : deal.agreedDeposit) : null;
    const askingDeposit = isJeonse ? (contracted.price ?? contracted.deposit) : contracted.deposit;
    const deposit = agreedDeposit ?? askingDeposit;
    if (deposit == null) return null;
    const monthlyRent = isJeonse
      ? null
      : agreedDeposit != null
        ? (deal?.agreedMonthlyRent ?? contracted.monthlyRent)
        : contracted.monthlyRent;
    return {
      deposit,
      label: leaseText('새', deposit, monthlyRent),
      note: guest ? '계약 진행 중' : agreedDeposit != null ? '계약 진행 중 · 합의 금액' : '합의 금액 미입력 · 호가 기준',
      basis: agreedDeposit != null ? 'agreed' : 'asking',
      source: 'new_lease',
    };
  }
  const tenant = tenants.find((item) => item.status === 'residing');
  if (tenant && tenant.deposit != null) {
    const end = tenant.contractEnd;
    return {
      deposit: tenant.deposit,
      label: leaseText('현', tenant.deposit, tenant.monthlyRent),
      note: end ? `${formatShortDate(end)} 만기` : null,
      basis: 'tenant',
      source: 'tenant',
    };
  }
  return null;
}

// ── 브리핑 카드 ─────────────────────────────────────────────────────

const maintenanceIncludeLabels: Record<string, string> = {
  [MaintenanceFeeInclude.WATER]: '수도',
  [MaintenanceFeeInclude.ELECTRICITY]: '전기',
  [MaintenanceFeeInclude.GAS]: '가스',
  [MaintenanceFeeInclude.INTERNET]: '인터넷',
  [MaintenanceFeeInclude.TV]: 'TV',
  [MaintenanceFeeInclude.CLEANING]: '청소',
  [MaintenanceFeeInclude.PARKING]: '주차',
  [MaintenanceFeeInclude.HEATING]: '난방',
};

export interface BriefRow {
  key: string;
  label: string;
  value: string;
  note?: string | null;
  /** 손님에게 바로 말할 값 (실투자금·전세가율) */
  highlight?: boolean;
  warn?: boolean;
  muted?: boolean;
}

export interface BriefCard {
  row: OfferRow;
  perPyeong: string | null;
  /** 계약 진행 중인 조건: 카드를 흐리게 */
  busy: boolean;
  statusLabel: string;
  rows: BriefRow[];
}

export function buildBriefCards({
  offerRows,
  tenants,
  deals = [],
  supplyPyeong,
  guest = false,
}: {
  offerRows: OfferRow[];
  tenants: Tenant[];
  /** 이 호실의 거래 (승계 보증금의 합의 금액을 읽는다) */
  deals?: Deal[];
  supplyPyeong: number | null;
  guest?: boolean;
}): BriefCard[] {
  const withAvailability = offerRows.map((row) => ({ ...row.listing, availability: row.availability }));
  const sale = offerRows.find((row) => row.listing.transactionType === 'sale' && row.listing.price);
  const lease = getSaleLease(withAvailability, tenants, { guest, deals });

  return offerRows.map((row) => {
    const { listing } = row;
    const busy = row.availability === ListingAvailability.IN_CONTRACT;
    const rows: BriefRow[] = [];

    if (listing.transactionType === 'sale' && lease) {
      rows.push({ key: 'move-in', label: '입주', value: `세안고 · ${lease.source === 'tenant' ? '임대 승계' : '새 임대 승계'}` });
      rows.push({ key: 'lease', label: '승계 임대', value: lease.label, note: lease.note });
      if (listing.price && listing.price > lease.deposit) {
        rows.push({
          key: 'cash',
          label: '실투자금',
          value: formatPrice(listing.price - lease.deposit),
          note: lease.basis === 'asking' ? '매매가 − 승계 보증금(호가)' : '매매가 − 승계 보증금',
          highlight: true,
        });
      }
    } else {
      rows.push({
        key: 'move-in',
        label: '입주',
        value: row.moveIn,
        warn: row.moveInPending && !guest,
        muted: row.moveInPending && guest,
      });
    }

    if (listing.transactionType === 'jeonse' && sale?.listing.price) {
      const jeonse = listing.price ?? listing.deposit;
      if (jeonse) {
        rows.push({
          key: 'ratio',
          label: '전세가율',
          value: `${Math.round((jeonse / sale.listing.price) * 1000) / 10}%`,
          note: `매매 ${formatPrice(sale.listing.price)} 기준`,
          highlight: true,
        });
      }
    }

    if (listing.loanAmount !== undefined) {
      rows.push({
        key: 'loan',
        label: '융자',
        value: formatAmount(listing.loanAmount),
        muted: listing.loanAmount == null,
      });
    }
    if (listing.maintenanceFee !== undefined) {
      const includes = (listing.maintenanceFeeIncludes ?? [])
        .map((item) => maintenanceIncludeLabels[item] ?? item)
        .join('·');
      rows.push({
        key: 'fee',
        label: '관리비',
        value: formatAmount(listing.maintenanceFee),
        note: includes ? `${includes} 포함` : null,
        muted: listing.maintenanceFee == null,
      });
    }
    if (row.premium) rows.push({ key: 'premium', label: '권리금', value: row.premium });

    const meta = availabilityMeta[row.availability];
    return {
      row,
      perPyeong:
        listing.transactionType === 'monthly'
          ? null
          : formatPerPyeong(listing.price ?? listing.deposit, supplyPyeong),
      busy,
      statusLabel:
        busy && guest
          ? '계약 진행 중'
          : listing.isPaused && row.availability === ListingAvailability.PAUSED
            ? '중단'
            : meta.label,
      rows,
    };
  });
}

// ── 손님에게 보여주기: 가림 ──────────────────────────────────────────

/** 머리 제목: 손님에게는 단지·동까지만 */
export function getHeaderTitle(property: Property, guest: boolean) {
  const identity = getUnitIdentity(property);
  const showSpace = !guest || identity.ho === '건물 전체';
  const unit = [identity.dong, showSpace ? identity.ho : null].filter(Boolean).join(' ');
  return { siteName: identity.siteName, unit: unit || null };
}

export interface HeaderSpec {
  key: string;
  text: string;
}

/** 머리 아래 한 줄 사양. 손님에게는 층을 뺀다. */
export function getHeaderSpecs(property: Property, guest: boolean): HeaderSpec[] {
  const site = property.site as DetailSite | undefined;
  const unit = property.unit as DetailUnit | null | undefined;
  const type = unit?.siteUnitType;
  const identity = getUnitIdentity(property);
  const supply = toPositive(unit?.supplyAreaM2) ?? toPositive(type?.supplyAreaM2);
  const exclusive = toPositive(unit?.exclusiveAreaM2) ?? toPositive(type?.exclusiveAreaM2);
  const rooms = unit?.roomCount ?? type?.roomCount ?? null;
  const baths = unit?.bathRoomCount ?? type?.bathRoomCount ?? null;
  const specs: Array<HeaderSpec | null> = [
    identity.unitTypeName || identity.eyebrow[0]
      ? {
          key: 'type',
          text: [identity.unitTypeName, identity.eyebrow[0]].filter(Boolean).join(' · '),
        }
      : null,
    supply || exclusive
      ? {
          key: 'area',
          text: [
            supply ? `공급 ${formatPyeong(supply)}` : null,
            exclusive ? `전용 ${formatPyeong(exclusive)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }
      : null,
    !guest && unit?.floor != null ? { key: 'floor', text: formatFloorRange(unit) } : null,
    rooms != null || baths != null
      ? {
          key: 'rooms',
          text: [rooms != null ? `방 ${rooms}` : null, baths != null ? `욕실 ${baths}` : null]
            .filter(Boolean)
            .join(' · '),
        }
      : null,
    type?.direction?.trim()
      ? {
          key: 'direction',
          text: directionLabels[type.direction.trim().toUpperCase()] ?? type.direction.trim(),
        }
      : null,
    site?.builtYear
      ? {
          key: 'built',
          text: [`${site.builtYear}년`, site.totalUnits ? `${site.totalUnits.toLocaleString()}세대` : null]
            .filter(Boolean)
            .join(' · '),
        }
      : null,
    identity.eyebrow[1] ? { key: 'region', text: identity.eyebrow[1] } : null,
  ];
  return specs.filter((spec): spec is HeaderSpec => Boolean(spec));
}

// ── 사진 ───────────────────────────────────────────────────────────

export const photoCategoryLabels: Record<string, string> = {
  living: '거실',
  kitchen: '주방',
  bedroom: '방',
  bathroom: '욕실',
  balcony: '발코니',
  view: '전망',
  entrance: '현관',
  exterior: '외관',
  parking: '주차장',
  floorplan: '평면도',
  other: '기타',
};

export const photoCategoryOrder = Object.keys(photoCategoryLabels);

export function getPhotoCategoryLabel(category: string) {
  return photoCategoryLabels[category] ?? '기타';
}

/** 서버 순서(sortOrder)대로. 첫 장이 대표 사진이다. */
export function sortPhotos(photos: PropertyPhoto[]) {
  return photos
    .slice()
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

/** 대표 사진을 맨 앞으로 보낸 새 순서 (reorder API에 그대로 보낸다). */
export function coverFirstOrder(photos: PropertyPhoto[], coverId: string) {
  const ids = sortPhotos(photos).map((photo) => photo.id);
  return [coverId, ...ids.filter((id) => id !== coverId)];
}

/**
 * 사진 설명. 사진 메모는 직원이 쓰는 내부 기록이라(연락처·출입 비밀번호가 들어갈 수 있다)
 * 손님에게는 분류만 보인다. 공개용 사진 설명 칸이 생기면 그것을 쓴다.
 */
export function getPhotoCaption(photo: PropertyPhoto, guest: boolean) {
  const category = getPhotoCategoryLabel(photo.category);
  if (guest) return category;
  return photo.memo?.trim() || category;
}

// ── 다가오는 임장 ───────────────────────────────────────────────────

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

/** "11.15 (토) 14:00" */
export function formatDayTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${formatShortDate(value)} (${weekdays[date.getDay()]}) ${formatTime(value)}`;
}

export function formatDday(value: string) {
  const days = daysUntil(value);
  if (days === null) return '';
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  return days > 0 ? `D-${days}` : `${-days}일 지남`;
}

export interface ViewingItem {
  id: string;
  matchId: string;
  at: string;
  whenText: string;
  ddayText: string;
  daysLeft: number;
  buyerName: string;
  typeLabel: string;
  typeClassName: string;
}

export function buildUpcomingViewings(
  matches: Match[],
  listingTypeById: Map<string, string>,
  now: Date = new Date(),
): ViewingItem[] {
  const items: ViewingItem[] = [];
  for (const match of matches) {
    // 닫힌 매칭의 일정은 없는 약속이다
    if (normalizeMatchStage(match.stage) === MatchStage.CLOSED) continue;
    for (const event of match.calendarEvents ?? []) {
      if (event.type !== 'viewing') continue;
      if (new Date(event.start).getTime() < now.getTime()) continue;
      // 거래 전환 전에 잡아 둔 임장이 그 거래가 끝난(잔금 완료 · 정산 종료) 뒤에도 남은 것은 끝난 일이다
      // (끝난 거래의 임장이 "D-4"로 남던 문제). 매칭 단계만으로는 빼지 않는다 — 고객 검토 · 협상 중의 재임장,
      // 거래 전환 뒤에 잡은 약속(잔금 전 집 확인 등)은 다가오는 임장이다.
      if (findDealThatOutlivedEvent(event.createdAt, match.deals ?? [])) continue;
      const type = getTransactionTypeMeta(listingTypeById.get(match.listingId) ?? '');
      items.push({
        id: event.id,
        matchId: match.id,
        at: event.start,
        whenText: formatDayTime(event.start),
        ddayText: formatDday(event.start),
        daysLeft: daysUntil(event.start) ?? 0,
        buyerName: match.buyerRequirement?.contact?.name ?? '이름 없는 고객',
        typeLabel: type.label,
        typeClassName: type.className,
      });
    }
  }
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

// ── 지금 챙길 것 ───────────────────────────────────────────────────

export type TodoAction =
  | { kind: 'confirm' }
  | { kind: 'open-my-ads' }
  | { kind: 'edit-listing'; listingId: string }
  | { kind: 'open-url'; url: string; label: string }
  | { kind: 'open-deal'; dealId: string }
  | { kind: 'open-match'; matchId: string }
  | { kind: 'add-contact' }
  | { kind: 'call'; phone: string; name: string };

export interface TodoItem {
  key: string;
  tone: 'warn' | 'danger' | 'info';
  text: string;
  sub: string | null;
  actionLabel: string | null;
  action: TodoAction | null;
}

const paymentKindLabels: Record<string, string> = {
  pre_contract: '가계약금',
  contract: '계약금',
  interim: '중도금',
  balance: '잔금',
  refund: '환불',
};

const OPEN_PAYMENT = new Set(['pending', 'partial', 'overdue']);
const CLOSED_DEAL_STAGES = new Set(['completed', 'closed']);

export function buildTodos({
  intake,
  offerRows,
  deals,
  viewings,
  people,
  tenants,
  leftoverAdRows = [],
}: {
  intake: ListingIntake | null;
  offerRows: OfferRow[];
  deals: Deal[];
  viewings: ViewingItem[];
  people: PersonRow[];
  tenants: TenantRow[];
  /** 끝난 의뢰의 거래 조건 가운데 아직 게재 중인 광고가 있는 것 */
  leftoverAdRows?: OfferRow[];
}): TodoItem[] {
  const items: TodoItem[] = [];

  // 의뢰를 끝냈는데 광고가 남아 있음 — 내리지 않으면 없는 매물을 광고하는 셈이 된다
  for (const row of leftoverAdRows) {
    items.push({
      key: `ad-leftover-${row.listing.id}`,
      tone: 'danger',
      text: '끝난 의뢰인데 광고가 게재 중입니다',
      sub: `${row.typeLabel} · ${row.activeAds.map((ad) => ad.channelLabel).join(', ')}`,
      actionLabel: '내광고관리에서 내리기',
      action: { kind: 'open-my-ads' },
    });
  }

  // 매물 확인
  if (intake) {
    const state = getIntakeConfirmationState(intake);
    const due = intake.nextConfirmAt ? daysUntil(intake.nextConfirmAt) : null;
    if (state === IntakeConfirmationState.OVERDUE) {
      items.push({
        key: 'confirm',
        tone: 'danger',
        text: due != null && due < 0 ? `재확인 기한 ${-due}일 지남` : '재확인 필요',
        sub: `마지막 확인 ${formatAgo(intake.lastVerifiedAt)}`,
        actionLabel: '확인 완료',
        action: { kind: 'confirm' },
      });
    } else if (state === IntakeConfirmationState.NO_ANSWER) {
      items.push({
        key: 'confirm',
        tone: 'warn',
        text: '소유자가 전화를 받지 않았습니다',
        sub: `${formatAgo(intake.lastCheckedAt)} 연락 · 다시 확인하세요`,
        actionLabel: '확인 완료',
        action: { kind: 'confirm' },
      });
    } else if (state === IntakeConfirmationState.UNVERIFIED) {
      items.push({
        key: 'confirm',
        tone: 'warn',
        text: '아직 소유자 확인 전입니다',
        sub: `접수 ${daysSince(intake.receivedAt) ?? 0}일째`,
        actionLabel: '확인 완료',
        action: { kind: 'confirm' },
      });
    } else if (due != null && due <= 7) {
      items.push({
        key: 'confirm',
        tone: 'info',
        text: `매물 확인 ${formatShortDate(intake.nextConfirmAt)} (${formatDue(intake.nextConfirmAt)})`,
        sub: `마지막 확인 ${formatAgo(intake.lastVerifiedAt)}`,
        actionLabel: '확인 완료',
        action: { kind: 'confirm' },
      });
    }
  }

  // 보류·일시 중단했는데 광고가 아직 게재 중 — 내리는 일을 잊지 않게
  const intakeOnHold = intake?.lifecycleStatus === IntakeLifecycleStatus.HOLD;
  for (const row of offerRows) {
    if (row.activeAds.length === 0) continue;
    if (!intakeOnHold && row.availability !== ListingAvailability.PAUSED) continue;
    items.push({
      key: `ad-hold-${row.listing.id}`,
      tone: 'warn',
      text: `${intakeOnHold ? '보류 중인데' : '일시 중단했는데'} 광고가 게재 중입니다`,
      sub: `${row.typeLabel} · ${row.activeAds.map((ad) => ad.channelLabel).join(', ')} · 광고에서 '광고 요청'으로 내리세요`,
      actionLabel: null,
      action: null,
    });
  }

  // 광고 가격이 지금 가격과 다름
  for (const row of offerRows) {
    for (const ad of row.activeAds) {
      if (!ad.stale) continue;
      items.push({
        key: `ad-${ad.id}`,
        tone: 'warn',
        text: `${ad.channelLabel} 광고 가격이 지금 가격과 다릅니다`,
        sub: `${row.typeLabel} · 광고 ${ad.priceText} · 지금 ${row.priceText}`,
        actionLabel: ad.url ? '광고 열기' : null,
        action: ad.url ? { kind: 'open-url', url: ad.url, label: '광고 열기' } : null,
      });
    }
  }

  // 입주 가능 시기를 모르는 진행 중 조건
  for (const row of offerRows) {
    if (!row.moveInPending || row.availability !== ListingAvailability.AVAILABLE) continue;
    if (row.listing.transactionType === 'sale' && tenants.some((tenant) => tenant.statusKey === 'residing')) continue;
    items.push({
      key: `move-in-${row.listing.id}`,
      tone: 'info',
      text: `${row.typeLabel} 입주 가능 시기를 아직 모릅니다`,
      sub: '손님이 가장 먼저 묻는 값입니다',
      actionLabel: '조건 수정',
      action: { kind: 'edit-listing', listingId: row.listing.id },
    });
  }

  // 거래 지급 일정 (14일 안 또는 지남)
  for (const deal of deals) {
    if (deal.isCancelled || CLOSED_DEAL_STAGES.has(deal.stage)) continue;
    const next = (deal.payments ?? [])
      .filter((payment) => OPEN_PAYMENT.has(payment.status) && payment.scheduledDate)
      .sort((a, b) => new Date(a.scheduledDate ?? 0).getTime() - new Date(b.scheduledDate ?? 0).getTime())[0];
    if (!next?.scheduledDate) continue;
    const days = daysUntil(next.scheduledDate);
    if (days == null || days > 14) continue;
    const amount = next.scheduledAmount - (next.paidAmount ?? 0);
    items.push({
      key: `pay-${next.id}`,
      tone: days < 0 ? 'danger' : 'warn',
      text: `${paymentKindLabels[next.kind] ?? '지급'} ${formatPrice(Math.max(amount, 0))} 입금 ${formatShortDate(next.scheduledDate)} (${formatDday(next.scheduledDate)})`,
      sub: [getTransactionTypeMeta(deal.transactionType).label, deal.buyerContact?.name].filter(Boolean).join(' · ') || null,
      actionLabel: '거래 보기',
      action: { kind: 'open-deal', dealId: deal.id },
    });
  }

  // 이틀 안 임장: 세입자가 살면 미리 알린다
  const residing = tenants.find((tenant) => tenant.statusKey === 'residing');
  for (const viewing of viewings) {
    if (viewing.daysLeft > 2) break;
    items.push({
      key: `viewing-${viewing.id}`,
      tone: 'info',
      text: `${viewing.whenText} 임장 · ${viewing.buyerName}`,
      sub: residing ? `세입자 ${residing.name}에게 미리 알리기` : null,
      actionLabel: residing?.phone ? '세입자 전화' : '매칭 보기',
      action: residing?.phone
        ? { kind: 'call', phone: residing.phone, name: residing.name }
        : { kind: 'open-match', matchId: viewing.matchId },
    });
  }

  // 임대 만기 90일 안
  for (const tenant of tenants) {
    if (tenant.daysToEnd == null || tenant.daysToEnd > 90 || tenant.daysToEnd < -30) continue;
    items.push({
      key: `tenant-${tenant.key}`,
      tone: tenant.daysToEnd < 0 ? 'danger' : 'info',
      text:
        tenant.daysToEnd >= 0
          ? `세입자 만기 D-${tenant.daysToEnd} · ${tenant.name}`
          : `세입자 만기 ${-tenant.daysToEnd}일 지남 · ${tenant.name}`,
      sub: '재계약·퇴거 여부를 확인하세요',
      actionLabel: tenant.phone ? '전화' : null,
      action: tenant.phone ? { kind: 'call', phone: tenant.phone, name: tenant.name } : null,
    });
  }

  // 소유자 연락처 없음
  if (intake && people.length === 0) {
    items.push({
      key: 'no-owner',
      tone: 'warn',
      text: '소유자 연락처가 없습니다',
      sub: '확인 전화를 하려면 소유자나 대리인 번호가 필요합니다',
      actionLabel: '연락처 추가',
      action: { kind: 'add-contact' },
    });
  }

  const order = { danger: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]);
}

// ── 카톡 브리핑 글 ─────────────────────────────────────────────────

export interface BriefTextOptions {
  /** 호수까지 적는다 (기본: 동까지만) */
  includeUnit: boolean;
  /** 계약 진행 중인 조건도 적는다 */
  includeBusy: boolean;
  /** 평당가를 적는다 */
  includePerPyeong: boolean;
}

export function buildBriefText({
  property,
  cards,
  options,
}: {
  property: Property;
  cards: BriefCard[];
  options: BriefTextOptions;
}) {
  const title = getHeaderTitle(property, !options.includeUnit);
  const specs = getHeaderSpecs(property, !options.includeUnit)
    .filter((spec) => spec.key !== 'region')
    .map((spec) => spec.text);
  const lines = [`[${[title.siteName, title.unit].filter(Boolean).join(' ')}]`];
  if (specs.length) lines.push(specs.join(' / '));
  lines.push('');
  for (const card of cards) {
    if (card.busy && !options.includeBusy) continue;
    if (card.row.availability === ListingAvailability.CLOSED) continue;
    const { listing } = card.row;
    const head = [
      `${card.row.typeLabel} ${formatListingPrice(listing)}`,
      options.includePerPyeong ? card.perPyeong : null,
      card.busy ? '계약 진행 중' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    lines.push(`■ ${head}`);
    for (const row of card.rows) {
      if (row.muted || row.warn) continue;
      lines.push(`  - ${row.label} ${row.value}${row.note && row.key !== 'cash' ? ` (${row.note})` : ''}`);
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
