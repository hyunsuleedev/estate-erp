/**
 * 캘린더·대시보드에 얹는 거래·계약·수금 날짜를 만드는 순수 로직 (React·API 없음 → 단위 테스트 대상).
 * 불러오기는 -calendar-overlay.ts의 useCalendarOverlays가 한다.
 */
import { formatPlaceLabel, normalizeDealStage } from '@estate-erp/shared';
import type { CommissionPayment, Contract, Deal } from '@estate-erp/api-client';

/** 거래 한 건의 대금 일정 한 줄 (가계약금·계약금·중도금·잔금) */
export type DealPayment = NonNullable<Deal['payments']>[number];

import { formatMoney } from '@/lib/format';
import { getLocalDateKey } from './-calendar-view-utils';

export type OverlayKind = 'preContractDate' | 'contractDate' | 'interimDate' | 'balanceDate' | 'commissionDue';

export type OverlayMeta = {
  label: string;
  color: string;
};

/** 거래·계약·수금에서 자동 도출되는 일정 — 시맨틱 토큰 색상 사용 (info/violet/orange/success) */
export const OVERLAY_META: Record<OverlayKind, OverlayMeta> = {
  preContractDate: { label: '가계약일', color: '#cb912f' },
  contractDate: { label: '계약일', color: '#2383e2' },
  interimDate: { label: '중도금일', color: '#6940a5' },
  balanceDate: { label: '잔금일', color: '#d9730d' },
  commissionDue: { label: '수금예정', color: '#0f7b6c' },
};

export interface OverlayItem {
  id: string;
  kind: OverlayKind;
  dateKey: string;
  title: string;
  sublabel: string | null;
  /**
   * 이미 끝난 날짜: 받은 대금, 정산 종료한 거래의 날짜, 계약서상 지난 단계.
   * 캘린더에는 흐리게 남기고(기록), 대시보드의 '다가오는 일정'처럼 앞으로 할 일을 모은 곳에서는 뺀다.
   */
  done?: boolean;
  source:
    | { type: 'contract'; contract: Contract }
    | { type: 'dealPayment'; deal: Deal; payment: DealPayment }
    | { type: 'commissionPayment'; payment: CommissionPayment };
}

type PlaceProperty =
  | {
      site?: { name?: string | null } | null;
      unit?: {
        name?: string | null;
        floor?: number | null;
        floorEnd?: number | null;
        floorLabel?: string | null;
        dong?: { name?: string | null; isPlaceholder?: boolean | null } | null;
      } | null;
    }
  | null
  | undefined;

/** "고덕그라시움 102동 2203호" — 화면 전체의 주소 기준(formatPlaceLabel) */
function placeOf(property: PlaceProperty): string {
  if (!property) return '';
  return formatPlaceLabel({
    siteName: property.site?.name,
    dongName: property.unit?.dong?.name,
    dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
    unit: property.unit,
  });
}

function contractPlaceLabel(contract: Contract) {
  const place = placeOf(contract.deal?.listing?.property as PlaceProperty);
  if (place) return place;

  const buyer = contract.buyerContact?.name;
  const seller = contract.sellerContact?.name;
  if (buyer || seller) return [seller, buyer].filter(Boolean).join(' ↔ ');
  return '계약';
}

function dealPlaceLabel(deal: Deal) {
  const place = placeOf((deal.property ?? deal.listing?.property) as PlaceProperty);
  if (place) return place;
  const buyer = deal.buyerContact?.name;
  const seller = deal.sellerContact?.name;
  if (buyer || seller) return [seller, buyer].filter(Boolean).join(' ↔ ');
  return '거래';
}

/** 정산까지 끝난 거래 — 그 거래의 날짜는 모두 지난 일이다 */
function isClosedDeal(deal: Deal | undefined): boolean {
  return Boolean(deal) && normalizeDealStage(deal!.stage) === 'closed';
}

/** 계약서 상태로 본 '이미 지난 날짜' (계약금 이후 · 잔금 이후) */
const CONTRACT_DONE_KINDS: Record<string, OverlayKind[]> = {
  signed: ['contractDate'],
  depositPaid: ['contractDate'],
  balancePaid: ['contractDate', 'interimDate', 'balanceDate'],
  registered: ['contractDate', 'interimDate', 'balanceDate'],
};

function pushContractItem(
  items: OverlayItem[],
  contract: Contract,
  kind: OverlayKind,
  date: string | null,
  amount: number | null,
  dealClosed: boolean,
) {
  if (!date) return;
  const done = dealClosed || (CONTRACT_DONE_KINDS[contract.status] ?? []).includes(kind);
  items.push({
    id: `${contract.id}-${kind}`,
    kind,
    dateKey: getLocalDateKey(new Date(date)),
    title: `${OVERLAY_META[kind].label} · ${contractPlaceLabel(contract)}`,
    sublabel: amount ? formatMoney(amount) : null,
    done,
    source: { type: 'contract', contract },
  });
}

/** 거래 대금 일정의 종류 → 캘린더 표시 종류. 환불은 일정이 아니라 뺀다. */
const DEAL_PAYMENT_KIND: Record<string, OverlayKind | undefined> = {
  pre_contract: 'preContractDate',
  contract: 'contractDate',
  interim: 'interimDate',
  balance: 'balanceDate',
};

/**
 * 거래에 넣은 대금 일정(가계약금·계약금·중도금·잔금). 계약서를 아직 쓰지 않은 거래의 일정도 여기서 나온다.
 * 같은 거래에 계약서가 있으면 계약서의 같은 종류 날짜는 보이지 않는다(거래 것이 기준 — 서로 다르면
 * 어긋남은 거래·계약서 화면이 알린다). 예외는 계약일: 계약금 예정일은 계약일의 대신일 뿐이라,
 * 계약서에 계약일이 적혀 있으면 그 날을 계약일로 그린다(6차 검수 — 계약서에서 계약일을 고치면 둘이 달라졌다).
 * 돌려받은 돈(refund)·취소된 줄은 일정이 아니다. 받은 돈은 '받음'으로 남기고 done을 붙인다.
 */
function dealPaymentItems(deal: Deal, options: { skipContractDate?: boolean } = {}): OverlayItem[] {
  const interimCount = (deal.payments ?? []).filter((payment) => payment.kind === 'interim').length;
  const closed = isClosedDeal(deal);
  return (deal.payments ?? []).flatMap((payment) => {
    const kind = DEAL_PAYMENT_KIND[payment.kind];
    if (!kind || !payment.scheduledDate || payment.status === 'cancelled') return [];
    // 계약금 예정일은 '계약일'로 그린다. 계약서에 계약일이 있으면 그것이 계약일이다(계약서에서 따로 고칠 수 있다).
    if (kind === 'contractDate' && options.skipContractDate) return [];
    const label =
      kind === 'interimDate' && interimCount > 1
        ? `${OVERLAY_META[kind].label}(${payment.sequence}차)`
        : OVERLAY_META[kind].label;
    const amount = payment.scheduledAmount ? formatMoney(payment.scheduledAmount) : null;
    return [
      {
        id: `${payment.id}-${kind}`,
        kind,
        dateKey: getLocalDateKey(new Date(payment.scheduledDate)),
        title: `${label} · ${dealPlaceLabel(deal)}`,
        sublabel: [amount, payment.status === 'paid' ? '받음' : null].filter(Boolean).join(' · ') || null,
        done: closed || payment.status === 'paid',
        source: { type: 'dealPayment' as const, deal, payment },
      },
    ];
  });
}

/** 이 직원이 담당인 거래 — 그 거래에서 맡은 비중(sharePercent)이 있는 사람이 담당이다(직원 정산과 같은 기준). */
export function assignedDealIds(deals: Deal[], userId: string): Set<string> {
  return new Set(
    deals
      .filter((deal) =>
        (deal.participants ?? []).some(
          (participant) => participant.userId === userId && participant.sharePercent != null,
        ),
      )
      .map((deal) => deal.id),
  );
}

/** 날짜가 걸린 거래. 거래 없이 쓴 계약서·수금은 null */
export function overlayDealId(item: OverlayItem): string | null {
  if (item.source.type === 'contract') return item.source.contract.dealId ?? null;
  if (item.source.type === 'dealPayment') return item.source.deal.id;
  return item.source.payment.dealId ?? null;
}

/**
 * @param options.assigneeId 이 직원이 담당인 거래의 날짜만 (대시보드 '내 담당'·캘린더 '내 일정만').
 *   담당이 정해지지 않은 옛 거래·거래 없는 계약서는 빠지고 '사무소 전체'에서만 보인다.
 */
export function buildOverlayItems(
  contracts: Contract[],
  payments: CommissionPayment[],
  deals: Deal[] = [],
  options: { assigneeId?: string | null } = {},
): OverlayItem[] {
  const items: OverlayItem[] = [];
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
  /** 거래 대금 일정이 이미 보여 주는 종류 (거래 id → 종류) */
  const coveredByDeal = new Map<string, Set<OverlayKind>>();

  // 계약일이 적힌 계약서가 있는 거래. 이런 거래의 '계약일'은 계약금 예정일이 아니라 계약서의 계약일로 그린다.
  const dealsWithContractDate = new Set(
    contracts
      .filter((contract) => contract.status !== 'cancelled' && contract.contractDate && contract.dealId)
      .map((contract) => contract.dealId as string),
  );

  for (const deal of deals) {
    // 취소된 거래의 일정은 없는 약속이다
    if (deal.isCancelled) continue;
    const dealItems = dealPaymentItems(deal, { skipContractDate: dealsWithContractDate.has(deal.id) });
    items.push(...dealItems);
    coveredByDeal.set(deal.id, new Set(dealItems.map((item) => item.kind)));
  }

  for (const contract of contracts) {
    if (contract.status === 'cancelled') continue;
    const deal = contract.dealId ? dealsById.get(contract.dealId) : undefined;
    if (deal?.isCancelled) continue;
    const covered = (contract.dealId && coveredByDeal.get(contract.dealId)) || new Set<OverlayKind>();
    const dealClosed = isClosedDeal(deal);
    if (!covered.has('contractDate'))
      pushContractItem(items, contract, 'contractDate', contract.contractDate, contract.totalPrice, dealClosed);
    if (!covered.has('interimDate'))
      pushContractItem(items, contract, 'interimDate', contract.statedInterimDate, contract.statedInterimPayment, dealClosed);
    if (!covered.has('balanceDate'))
      pushContractItem(items, contract, 'balanceDate', contract.statedBalanceDate, contract.statedBalance, dealClosed);
  }

  for (const payment of payments) {
    if (!payment.dueDate) continue;
    if (!['draft', 'pending', 'partial', 'overdue'].includes(payment.status)) continue;
    if (payment.dealId && dealsById.get(payment.dealId)?.isCancelled) continue;
    items.push({
      id: `${payment.id}-commissionDue`,
      kind: 'commissionDue',
      dateKey: getLocalDateKey(new Date(payment.dueDate)),
      title: `수금예정 · ${payment.payerContact?.name ?? (payment.clientSide === 'seller' ? '매도측' : '매수측')}`,
      sublabel: formatMoney(payment.expectedAmount),
      source: { type: 'commissionPayment', payment },
    });
  }

  if (!options.assigneeId) return items;
  const mine = assignedDealIds(deals, options.assigneeId);
  return items.filter((item) => {
    const dealId = overlayDealId(item);
    return dealId != null && mine.has(dealId);
  });
}

export function groupOverlaysByDate(items: OverlayItem[]) {
  const grouped = new Map<string, OverlayItem[]>();
  for (const item of items) {
    const dayItems = grouped.get(item.dateKey) ?? [];
    dayItems.push(item);
    grouped.set(item.dateKey, dayItems);
  }
  return grouped;
}

