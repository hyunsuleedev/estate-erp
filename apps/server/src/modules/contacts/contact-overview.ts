import { Prisma } from '@prisma/client';
import { findDealThatOutlivedEvent, formatPlaceLabel } from '@estate-erp/shared';
import { paymentScopeFor, type FinanceViewer } from '../finance/commission-payment.service';

/**
 * 연락처 상세의 "이 사람과 한 일" 한눈에 보기.
 *
 * 손님이 한 달 뒤 다시 전화했을 때 연락처를 열면, 그 사람과 한 거래 · 계약서 · 연결한 매물(매칭) ·
 * 다가오는 임장 · 열린 업무가 바로 보여야 한다. 다른 모듈의 서비스를 거치지 않고 Prisma로 읽기만 한다.
 * 모든 조회는 officeId로 좁힌다.
 *
 * 수수료는 금액을 싣지 않는다 — 직원에게는 담당 거래의 수수료만 보인다는 규칙이 수수료 화면에 있으므로
 * 여기서는 "받음 / 받는 중"만 알린다.
 */

type Client = Prisma.TransactionClient;

const PLACE_SELECT = {
  site: { select: { name: true } },
  unit: {
    select: {
      name: true,
      floor: true,
      floorEnd: true,
      floorLabel: true,
      dong: { select: { name: true, isPlaceholder: true } },
    },
  },
} satisfies Prisma.PropertySelect;

type PlaceProperty = Prisma.PropertyGetPayload<{ select: typeof PLACE_SELECT }>;

function placeOf(property: PlaceProperty | null | undefined): string | null {
  if (!property) return null;
  return (
    formatPlaceLabel({
      siteName: property.site?.name,
      dongName: property.unit?.dong?.name,
      dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
      unit: property.unit,
    }) || null
  );
}

/** 수수료 청구 상태들 → "받음 / 받는 중 / 없음". 금액은 넣지 않는다. */
export function summarizeCommission(statuses: string[]): 'collected' | 'collecting' | null {
  const live = statuses.filter((status) => !['draft', 'cancelled', 'waived'].includes(status));
  if (live.length === 0) return null;
  return live.every((status) => status === 'collected') ? 'collected' : 'collecting';
}

const OPEN_TASK_STATUSES = ['pending', 'in_progress'];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시간 기준 오늘 0시(UTC 시각으로). 서버 시계의 시간대와 상관없이 같은 날을 자른다. */
export function startOfKstDay(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS);
}
const LIST_LIMIT = 20;

export interface ContactOverview {
  deals: Array<{
    id: string;
    /** 이 사람이 거래에서 맡은 쪽. 매매면 매도인/매수인, 임대차면 임대인/임차인으로 읽는다 */
    role: 'seller' | 'buyer';
    transactionType: string;
    stage: string;
    isCancelled: boolean;
    place: string | null;
    propertyId: string | null;
    agreedPrice: number | null;
    agreedDeposit: number | null;
    agreedMonthlyRent: number | null;
    stageChangedAt: Date;
    commission: 'collected' | 'collecting' | null;
  }>;
  contracts: Array<{
    id: string;
    dealId: string | null;
    role: 'seller' | 'buyer';
    transactionType: string;
    status: string;
    place: string | null;
    totalPrice: number;
    monthlyRent: number | null;
    contractDate: Date | null;
    statedBalanceDate: Date | null;
  }>;
  matches: Array<{
    id: string;
    side?: 'buyer' | 'seller';
    stage: string;
    buyerReqId: string;
    listingId: string;
    propertyId: string;
    place: string | null;
    transactionType: string;
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
    updatedAt: Date;
  }>;
  events: Array<{
    id: string;
    title: string;
    type: string;
    start: Date;
    allDay: boolean;
    place: string | null;
    /** 이 사람이 손님으로 보러 가는지, 소유자로 집을 보여 주는지, 거주 세입자로 관련되는지, 이 사람에게 바로 걸린 일정인지 */
    relation: 'buyer' | 'owner' | 'tenant' | 'contact';
    /**
     * 걸린 매칭이 끝났는지. 끝난 매칭의 앞날 임장은 지우지 않고 캘린더처럼 "매칭 종료"로 보인다
     * (예전에는 매칭을 닫아도 연락처 상세에 "보러 가는 집"으로 그대로 남았다).
     */
    matchClosed: boolean;
    /**
     * 임장을 이미 마친 매칭의 일정인지: 매칭이 임장 다음 단계(고객 검토 · 협상 · 거래 전환)로 갔거나 거래가 만들어졌다.
     * 날짜가 앞날로 남아 있어도 "다가오는 임장"이 아니라 끝난 것으로 보인다.
     */
    viewingDone: boolean;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    assignedTo: { id: string; name: string } | null;
  }>;
}

export async function readContactOverview(
  client: Client,
  officeId: string,
  contactId: string,
  now: Date = new Date(),
  /**
   * 보는 사람. 중개사(agent)에게는 담당으로 배정된 거래의 수수료 상태만 보인다 — 수수료 조회 · 거래 응답과 같은 기준
   * (finance/commission-payment.service.ts의 paymentScopeFor). 넘기지 않으면 좁히지 않는다.
   */
  viewer?: FinanceViewer,
): Promise<ContactOverview> {
  // 서버는 UTC로 돈다. 한국 시간 09시 전후로 오늘의 종일 일정(잔금일 등)이 빠지거나 어제 일정이 섞이지 않게
  // 한국 시간의 날로 자른다.
  const startOfToday = startOfKstDay(now);

  // 이 사람이 손님으로 참여한 구매 의뢰 · 소유한(공동 포함) 집 · 거주 중인 임대차 집
  const [buyerIntakes, ownerships, tenancies] = await Promise.all([
    client.buyerIntakeContact.findMany({
      where: { officeId, contactId },
      select: { buyerIntakeId: true },
    }),
    client.propertyContact.findMany({
      where: { officeId, contactId, role: { in: ['owner', 'co_owner'] }, status: 'active' },
      select: { propertyId: true },
    }),
    client.propertyLeaseTenant.findMany({
      where: { officeId, contactId, lease: { status: { in: ['residing', 'moving_out'] } } },
      select: { lease: { select: { propertyId: true } } },
    }),
  ]);
  const buyerIntakeIds = buyerIntakes.map((row) => row.buyerIntakeId);
  const ownedPropertyIds = ownerships.map((row) => row.propertyId);
  const leasedPropertyIds = tenancies.map((row) => row.lease.propertyId);

  const matchOr: Prisma.MatchWhereInput[] = [];
  if (buyerIntakeIds.length) {
    matchOr.push({ buyerRequirement: { buyerIntakeId: { in: buyerIntakeIds } } });
  }
  if (ownedPropertyIds.length) {
    matchOr.push({ listing: { propertyId: { in: ownedPropertyIds } } });
  }

  const [deals, contracts, matches, tasks] = await Promise.all([
    client.deal.findMany({
      where: {
        officeId,
        OR: [
          { buyerContactId: contactId },
          { sellerContactId: contactId },
          { contract: { parties: { some: { contactId, side: { in: ['one', 'two'] } } } } },
        ],
      },
      orderBy: [{ isCancelled: 'asc' }, { stageChangedAt: 'desc' }],
      take: LIST_LIMIT,
      select: {
        id: true,
        buyerContactId: true,
        sellerContactId: true,
        transactionType: true,
        stage: true,
        isCancelled: true,
        agreedPrice: true,
        agreedDeposit: true,
        agreedMonthlyRent: true,
        stageChangedAt: true,
        listing: { select: { propertyId: true, property: { select: PLACE_SELECT } } },
        contract: { select: { parties: { where: { contactId }, select: { side: true } } } },
        commissionPayments: { where: paymentScopeFor(viewer), select: { status: true } },
      },
    }),
    client.contract.findMany({
      where: {
        officeId,
        status: { not: 'cancelled' },
        parties: { some: { contactId, side: { in: ['one', 'two'] } } },
      },
      orderBy: [{ contractDate: 'desc' }, { createdAt: 'desc' }],
      take: LIST_LIMIT,
      select: {
        id: true,
        dealId: true,
        transactionType: true,
        status: true,
        totalPrice: true,
        monthlyRent: true,
        contractDate: true,
        statedBalanceDate: true,
        parties: { where: { contactId }, select: { side: true } },
        deal: { select: { listing: { select: { property: { select: PLACE_SELECT } } } } },
      },
    }),
    matchOr.length
      ? client.match.findMany({
          where: {
            officeId,
            stage: { notIn: ['closed', 'dealCreated'] },
            OR: matchOr,
          },
          orderBy: { updatedAt: 'desc' },
          take: LIST_LIMIT,
          select: {
            id: true,
            stage: true,
            buyerReqId: true,
            listingId: true,
            updatedAt: true,
            buyerRequirement: { select: { buyerIntakeId: true } },
            listing: {
              select: {
                propertyId: true,
                transactionType: true,
                price: true,
                deposit: true,
                monthlyRent: true,
                property: { select: PLACE_SELECT },
              },
            },
          },
        })
      : [],
    client.task.findMany({
      where: { officeId, contactId, status: { in: OPEN_TASK_STATUSES } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: LIST_LIMIT,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        assignedTo: { select: { id: true, name: true } },
      },
    }),
  ]);

  // 다가오는 일정: 이 사람에게 바로 걸린 것 + 손님으로 보러 가는 임장 + 소유자·세입자 호실 임장
  const eventLinks: Prisma.CalendarEventWhereInput[] = [{ contactId }];
  if (buyerIntakeIds.length) {
    eventLinks.push({ match: { buyerRequirement: { buyerIntakeId: { in: buyerIntakeIds } } } });
  }
  const propertyIdsForEvents = [...new Set([...ownedPropertyIds, ...leasedPropertyIds])];
  if (propertyIdsForEvents.length) {
    eventLinks.push(
      { propertyId: { in: propertyIdsForEvents } },
      { listing: { propertyId: { in: propertyIdsForEvents } } },
      { match: { listing: { propertyId: { in: propertyIdsForEvents } } } },
    );
  }
  const events = await client.calendarEvent.findMany({
    where: { officeId, start: { gte: startOfToday }, OR: eventLinks },
    orderBy: { start: 'asc' },
    take: LIST_LIMIT,
    select: {
      id: true,
      title: true,
      type: true,
      start: true,
      allDay: true,
      createdAt: true,
      contactId: true,
      propertyId: true,
      property: { select: PLACE_SELECT },
      listing: { select: { propertyId: true, property: { select: PLACE_SELECT } } },
      match: {
        select: {
          stage: true,
          deals: {
            where: { isCancelled: false },
            select: { id: true, stage: true, createdAt: true, isCancelled: true },
          },
          buyerRequirement: { select: { buyerIntakeId: true } },
          listing: { select: { propertyId: true, property: { select: PLACE_SELECT } } },
        },
      },
    },
  });

  return {
    deals: deals.map((deal) => {
      const partySide = deal.contract?.parties?.[0]?.side;
      const role: 'seller' | 'buyer' =
        deal.buyerContactId === contactId || partySide === 'two' ? 'buyer' : 'seller';
      return {
        id: deal.id,
        role,
        transactionType: deal.transactionType,
        stage: deal.stage,
        isCancelled: deal.isCancelled,
        place: placeOf(deal.listing?.property),
        propertyId: deal.listing?.propertyId ?? null,
        agreedPrice: deal.agreedPrice,
        agreedDeposit: deal.agreedDeposit,
        agreedMonthlyRent: deal.agreedMonthlyRent,
        stageChangedAt: deal.stageChangedAt,
        commission: summarizeCommission(deal.commissionPayments.map((payment) => payment.status)),
      };
    }),
    contracts: contracts.map((contract) => {
      const partySide = contract.parties[0]?.side;
      const role: 'seller' | 'buyer' = partySide === 'one' ? 'seller' : 'buyer';
      return {
        id: contract.id,
        dealId: contract.dealId,
        role,
        transactionType: contract.transactionType,
        status: contract.status,
        place: placeOf(contract.deal?.listing?.property),
        totalPrice: contract.totalPrice,
        monthlyRent: contract.monthlyRent,
        contractDate: contract.contractDate,
        statedBalanceDate: contract.statedBalanceDate,
      };
    }),
    matches: matches.map((match) => ({
      id: match.id,
      side: buyerIntakeIds.includes(match.buyerRequirement.buyerIntakeId) ? 'buyer' : 'seller',
      stage: match.stage,
      buyerReqId: match.buyerReqId,
      listingId: match.listingId,
      propertyId: match.listing.propertyId,
      place: placeOf(match.listing.property),
      transactionType: match.listing.transactionType,
      price: match.listing.price,
      deposit: match.listing.deposit,
      monthlyRent: match.listing.monthlyRent,
      updatedAt: match.updatedAt,
    })),
    events: events.map((event) => {
      const buyerSide = Boolean(
        event.match?.buyerRequirement && buyerIntakeIds.includes(event.match.buyerRequirement.buyerIntakeId),
      );
      const ownerSide =
        !buyerSide &&
        [event.propertyId, event.listing?.propertyId, event.match?.listing?.propertyId].some(
          (id) => id && ownedPropertyIds.includes(id),
        );
      const tenantSide =
        !buyerSide &&
        !ownerSide &&
        [event.propertyId, event.listing?.propertyId, event.match?.listing?.propertyId].some(
          (id) => id && leasedPropertyIds.includes(id),
        );
      return {
        id: event.id,
        title: event.title,
        type: event.type,
        start: event.start,
        allDay: event.allDay,
        place:
          placeOf(event.match?.listing?.property) ??
          placeOf(event.listing?.property) ??
          placeOf(event.property),
        relation: buyerSide ? 'buyer' : ownerSide ? 'owner' : tenantSide ? 'tenant' : 'contact',
        matchClosed: event.match?.stage === 'closed',
        // 거래 전환 전에 잡아 둔 임장이, 그 거래가 끝난(잔금 완료 · 정산 종료) 뒤에도 앞날로 남은 것만 끝난 일로 본다.
        // 매칭 단계만으로는 가리지 않는다 — 고객 검토 · 협상 중의 재임장, 거래 전환 뒤에 잡은 약속은 유효하다.
        viewingDone:
          event.type === 'viewing' &&
          event.match != null &&
          event.match.stage !== 'closed' &&
          findDealThatOutlivedEvent(event.createdAt, event.match.deals ?? []) != null,
      };
    }),
    tasks,
  };
}
