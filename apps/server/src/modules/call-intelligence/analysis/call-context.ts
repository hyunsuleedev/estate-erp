import { MATCH_STAGE_ORDER, MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  getIntakeConfirmationState,
  LISTING_INTAKE_STATE_SELECT,
  MARKETABLE_LISTING_WHERE,
  NON_CLOSED_INTAKE_WHERE,
} from '../../listings/listing-state';

/**
 * 통화 분석에 넘길 사무소 데이터.
 * AI에는 실제 id 대신 짧은 참조(L1, R1 …)만 보여주고, 응답의 참조를 여기서 id로 되돌린다.
 * 목록에 없는 참조는 버리므로 AI가 다른 고객·매물이나 다른 사무소 데이터를 가리킬 수 없다.
 */

export type RefKind =
  | 'property'
  | 'intake'
  | 'listing'
  | 'buyerIntake'
  | 'requirement'
  | 'match'
  | 'site';

export interface RefEntry {
  kind: RefKind;
  id: string;
  label: string;
  /** listing·intake: 소속 호실 */
  propertyId?: string;
  /** listing: 소속 의뢰 */
  intakeId?: string;
  /** requirement: 소속 구매 의뢰 */
  buyerIntakeId?: string;
  /** match */
  listingId?: string;
  buyerReqId?: string;
  /** match: 제안할 수 있는 다음 단계 */
  allowedStages?: string[];
}

export interface CallContext {
  contactId: string | null;
  contactName: string | null;
  refs: Map<string, RefEntry>;
  /** 이미 진행 중인 매칭 (listingId:buyerReqId) — 같은 매칭을 또 제안하지 않는다 */
  openMatchKeys: Set<string>;
  /** 프롬프트에 넣는 설명 */
  text: string;
}

type Db = Pick<PrismaClient, 'contact' | 'propertyContact' | 'buyerIntakeContact' | 'listing' | 'officeSite'>;

export const MATCH_STAGE_TEXT: Record<string, string> = {
  suggested: '내부 후보',
  buyerInterested: '고객 관심',
  viewingConfirmed: '임장 가능 확인',
  viewing: '임장',
  negotiating: '협상',
  dealCreated: '거래 전환',
  closed: '종료',
};

const CONFIRMATION_TEXT: Record<string, string> = {
  unverified: '미확인',
  verified: '확인됨',
  overdue: '확인 기한 지남',
  no_answer: '부재중',
};

const TRANSACTION_TEXT: Record<string, string> = { sale: '매매', jeonse: '전세', monthly: '월세' };

function withCommas(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 만원 → "15억 8,000만" */
export function formatManwon(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const eok = Math.floor(value / 10_000);
  const man = value % 10_000;
  if (eok && man) return `${eok}억 ${withCommas(man)}만`;
  if (eok) return `${eok}억`;
  return `${withCommas(man)}만`;
}

function rangeText(min: number | null, max: number | null, format: (value: number) => string) {
  if (min === null && max === null) return '';
  return `${min !== null ? format(min) : ''}~${max !== null ? format(max) : ''}`;
}

const LISTING_SUMMARY_SELECT = {
  id: true,
  intakeId: true,
  propertyId: true,
  transactionType: true,
  price: true,
  deposit: true,
  monthlyRent: true,
  isPaused: true,
  property: {
    select: {
      site: { select: { name: true } },
      unit: { select: { name: true, dong: { select: { name: true, isPlaceholder: true } } } },
    },
  },
} satisfies Prisma.ListingSelect;

type ListingSummary = Prisma.ListingGetPayload<{ select: typeof LISTING_SUMMARY_SELECT }>;
type PropertyPlace = ListingSummary['property'];

function placeText(property: PropertyPlace) {
  const dong = property.unit?.dong;
  return [property.site.name, dong && !dong.isPlaceholder ? dong.name : null, property.unit?.name]
    .filter(Boolean)
    .join(' ');
}

export function listingPriceText(listing: {
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}) {
  if (listing.transactionType === 'monthly') {
    return `월세 ${formatManwon(listing.deposit)}/${formatManwon(listing.monthlyRent)}`;
  }
  if (listing.transactionType === 'jeonse') {
    return `전세 ${formatManwon(listing.price ?? listing.deposit)}`;
  }
  return `매매 ${formatManwon(listing.price)}`;
}

/** 다음 단계 하나와 종료만 제안할 수 있다 (거래 전환은 거래 생성 화면에서만). */
export function allowedNextMatchStages(stage: string): string[] {
  const current = normalizeMatchStage(stage);
  if (current === MatchStage.CLOSED || current === MatchStage.DEAL_CREATED) return [];
  const index = MATCH_STAGE_ORDER.indexOf(current as (typeof MATCH_STAGE_ORDER)[number]);
  const next = index >= 0 ? MATCH_STAGE_ORDER[index + 1] : undefined;
  return [
    ...(next && next !== MatchStage.DEAL_CREATED && next !== MatchStage.CLOSED ? [next] : []),
    MatchStage.CLOSED,
  ];
}

class RefRegistry {
  readonly refs = new Map<string, RefEntry>();
  private readonly byId = new Map<string, string>();
  private readonly counters: Record<string, number> = {};

  add(prefix: string, entry: RefEntry): string {
    const existing = this.byId.get(`${entry.kind}:${entry.id}`);
    if (existing) return existing;
    this.counters[prefix] = (this.counters[prefix] ?? 0) + 1;
    const ref = `${prefix}${this.counters[prefix]}`;
    this.refs.set(ref, entry);
    this.byId.set(`${entry.kind}:${entry.id}`, ref);
    return ref;
  }

  addListing(listing: ListingSummary): string {
    return this.add('L', {
      kind: 'listing',
      id: listing.id,
      label: `${placeText(listing.property)} ${listingPriceText(listing)}`,
      intakeId: listing.intakeId,
      propertyId: listing.propertyId,
    });
  }
}

export async function buildCallContext(
  db: Db,
  input: { officeId: string; contactId: string | null; now?: Date },
): Promise<CallContext> {
  const { officeId, contactId } = input;
  const registry = new RefRegistry();
  const openMatchKeys = new Set<string>();
  const lines: string[] = [];

  const contact = contactId
    ? await db.contact.findFirst({ where: { id: contactId, officeId }, select: { id: true, name: true } })
    : null;

  const preferredSiteIds = new Set<string>();

  if (contact) {
    const ownerships = await db.propertyContact.findMany({
      where: { officeId, contactId: contact.id, status: 'active' },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      take: 10,
      select: {
        role: true,
        property: {
          select: {
            id: true,
            site: { select: { name: true } },
            unit: { select: { name: true, dong: { select: { name: true, isPlaceholder: true } } } },
            listingIntakes: {
              where: NON_CLOSED_INTAKE_WHERE,
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                ...LISTING_INTAKE_STATE_SELECT,
                listings: { orderBy: { createdAt: 'asc' }, select: LISTING_SUMMARY_SELECT },
              },
            },
          },
        },
      },
    });

    if (ownerships.length > 0) {
      lines.push('', '[상대방이 소유·관리하는 호실과 매물]');
      for (const ownership of ownerships) {
        const property = ownership.property;
        const propertyRef = registry.add('P', {
          kind: 'property',
          id: property.id,
          label: placeText(property),
        });
        lines.push(`- ${propertyRef} ${placeText(property)} (${ownership.role})`);
        const intake = property.listingIntakes[0];
        if (!intake) {
          lines.push('  - 진행 중인 의뢰 없음');
          continue;
        }
        const intakeRef = registry.add('I', {
          kind: 'intake',
          id: intake.id,
          label: `${placeText(property)} 의뢰`,
          propertyId: property.id,
        });
        const confirmation = getIntakeConfirmationState(intake, input.now);
        const lastVerified = intake.lastVerifiedAt
          ? ` · 마지막 확인 ${intake.lastVerifiedAt.toISOString().slice(0, 10)}`
          : '';
        lines.push(
          `  - ${intakeRef} 의뢰 ${intake.lifecycleStatus === 'hold' ? '보류' : '진행'} · ${CONFIRMATION_TEXT[confirmation] ?? confirmation}${lastVerified}`,
        );
        for (const listing of intake.listings) {
          const listingRef = registry.addListing(listing);
          lines.push(`    - ${listingRef} ${listingPriceText(listing)}${listing.isPaused ? ' (중단)' : ''}`);
        }
      }
    }

    const buyerLinks = await db.buyerIntakeContact.findMany({
      where: { officeId, contactId: contact.id, buyerIntake: { lifecycleStatus: { in: ['open', 'hold'] } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        role: true,
        buyerIntake: {
          select: {
            id: true,
            lifecycleStatus: true,
            requirements: {
              where: { status: { in: ['active', 'hold'] } },
              orderBy: { priorityRank: 'asc' },
              take: 5,
              select: {
                id: true,
                status: true,
                transactionType: true,
                priceMin: true,
                priceMax: true,
                depositMin: true,
                depositMax: true,
                monthlyRentMin: true,
                monthlyRentMax: true,
                areaMin: true,
                areaMax: true,
                moveInDate: true,
                urgency: true,
                memo: true,
                preferredSites: { select: { siteId: true, site: { select: { name: true } } } },
                matches: {
                  where: { stage: { not: MatchStage.CLOSED } },
                  orderBy: { updatedAt: 'desc' },
                  take: 10,
                  select: { id: true, stage: true, listing: { select: LISTING_SUMMARY_SELECT } },
                },
              },
            },
          },
        },
      },
    });

    if (buyerLinks.length > 0) {
      lines.push('', '[상대방의 구매 의뢰와 요청 조건]');
      for (const link of buyerLinks) {
        const intake = link.buyerIntake;
        const buyerIntakeRef = registry.add('B', {
          kind: 'buyerIntake',
          id: intake.id,
          label: '구매 의뢰',
        });
        lines.push(`- ${buyerIntakeRef} 구매 의뢰 (${intake.lifecycleStatus === 'hold' ? '보류' : '진행'})`);
        if (intake.requirements.length === 0) lines.push('  - 요청 조건 없음');
        for (const requirement of intake.requirements) {
          const parts = [
            requirement.transactionType ? TRANSACTION_TEXT[requirement.transactionType] : '거래 유형 미정',
            requirement.transactionType === 'monthly'
              ? [
                  rangeText(requirement.depositMin, requirement.depositMax, formatManwon) &&
                    `보증금 ${rangeText(requirement.depositMin, requirement.depositMax, formatManwon)}`,
                  rangeText(requirement.monthlyRentMin, requirement.monthlyRentMax, formatManwon) &&
                    `월세 ${rangeText(requirement.monthlyRentMin, requirement.monthlyRentMax, formatManwon)}`,
                ]
                  .filter(Boolean)
                  .join(' ')
              : requirement.transactionType === 'jeonse'
                ? rangeText(requirement.depositMin ?? requirement.priceMin, requirement.depositMax ?? requirement.priceMax, formatManwon)
                : rangeText(requirement.priceMin, requirement.priceMax, formatManwon),
            rangeText(
              requirement.areaMin !== null ? Number(requirement.areaMin) : null,
              requirement.areaMax !== null ? Number(requirement.areaMax) : null,
              (area) => `${Math.round(area * 0.3025)}평`,
            ),
            requirement.preferredSites.length > 0
              ? `희망 단지 ${requirement.preferredSites.map((site) => site.site.name).join(', ')}`
              : '',
            requirement.moveInDate ? `입주 ${requirement.moveInDate.toISOString().slice(0, 10)}` : '',
            requirement.status === 'hold' ? '보류' : '',
            requirement.memo ? `메모: ${requirement.memo.replace(/\s+/g, ' ').slice(0, 120)}` : '',
          ].filter(Boolean);
          const requirementRef = registry.add('R', {
            kind: 'requirement',
            id: requirement.id,
            label: parts.slice(0, 2).join(' '),
            buyerIntakeId: intake.id,
          });
          lines.push(`  - ${requirementRef} ${parts.join(' · ')}`);
          requirement.preferredSites.forEach((site) => preferredSiteIds.add(site.siteId));

          for (const match of requirement.matches) {
            const listingRef = registry.addListing(match.listing);
            const allowedStages = allowedNextMatchStages(match.stage);
            const matchRef = registry.add('M', {
              kind: 'match',
              id: match.id,
              label: `${registry.refs.get(listingRef)?.label ?? ''} 매칭`,
              listingId: match.listing.id,
              buyerReqId: requirement.id,
              allowedStages,
            });
            openMatchKeys.add(`${match.listing.id}:${requirement.id}`);
            const stage = normalizeMatchStage(match.stage);
            const nextText = allowedStages
              .filter((next) => next !== MatchStage.CLOSED)
              .map((next) => `${next}(${MATCH_STAGE_TEXT[next]})`)
              .join(', ');
            lines.push(
              `    - ${matchRef} 매칭: ${listingRef} ${registry.refs.get(listingRef)?.label ?? ''} · 단계 ${MATCH_STAGE_TEXT[stage] ?? stage}${nextText ? ` · 다음 단계 ${nextText}` : ''}`,
            );
          }
        }
      }
    }
  }

  if (preferredSiteIds.size > 0) {
    const candidates = await db.listing.findMany({
      where: {
        officeId,
        ...MARKETABLE_LISTING_WHERE,
        property: { siteId: { in: [...preferredSiteIds] } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: LISTING_SUMMARY_SELECT,
    });
    if (candidates.length > 0) {
      lines.push('', '[손님 희망 단지에서 지금 거래 가능한 우리 매물]');
      for (const listing of candidates) {
        const listingRef = registry.addListing(listing);
        lines.push(`- ${listingRef} ${registry.refs.get(listingRef)?.label}`);
      }
    }
  }

  const managedSites = await db.officeSite.findMany({
    where: { officeId },
    orderBy: [{ isFavorite: 'desc' }, { createdAt: 'asc' }],
    take: 150,
    select: { site: { select: { id: true, name: true } } },
  });
  if (managedSites.length > 0) {
    lines.push('', '[사무소 관리 단지 — 단지명 받아쓰기 보정과 희망 단지 지정에 사용]');
    lines.push(
      managedSites
        .map(({ site }) => `${registry.add('S', { kind: 'site', id: site.id, label: site.name })} ${site.name}`)
        .join(', '),
    );
  }

  return {
    contactId: contact?.id ?? null,
    contactName: contact?.name ?? null,
    refs: registry.refs,
    openMatchKeys,
    text: lines.join('\n').trim(),
  };
}

/**
 * 제안 화면에 보여줄 대상 이름 (id → "래미안 101동 3501호 매매 15억").
 * 이름은 저장하지 않고 조회할 때 만들어 항상 현재 값을 보여준다.
 */
export async function describeSuggestionTargets(
  db: Pick<PrismaClient, 'listing' | 'property' | 'listingIntake' | 'buyerRequirement' | 'match' | 'site'>,
  officeId: string,
  payloads: unknown[],
): Promise<Record<string, string>> {
  const ids = { listing: new Set<string>(), property: new Set<string>(), intake: new Set<string>(), requirement: new Set<string>(), match: new Set<string>(), site: new Set<string>() };
  const add = (set: Set<string>, value: unknown) => {
    if (typeof value === 'string' && value) set.add(value);
  };
  for (const raw of payloads) {
    if (!raw || typeof raw !== 'object') continue;
    const payload = raw as Record<string, unknown>;
    const changes = (payload.changes ?? {}) as Record<string, unknown>;
    add(ids.listing, payload.listingId);
    add(ids.property, payload.propertyId);
    add(ids.intake, payload.intakeId);
    add(ids.requirement, payload.buyerReqId);
    add(ids.match, payload.matchId);
    for (const change of (payload.priceChanges as Array<{ listingId?: unknown }> | undefined) ?? []) {
      add(ids.listing, change.listingId);
    }
    for (const siteId of [...((payload.siteIds as unknown[]) ?? []), ...((changes.siteIds as unknown[]) ?? [])]) {
      add(ids.site, siteId);
    }
  }

  const labels: Record<string, string> = {};
  const placeSelect = {
    site: { select: { name: true } },
    unit: { select: { name: true, dong: { select: { name: true, isPlaceholder: true } } } },
  } as const;
  const [listings, properties, intakes, requirements, matches, sites] = await Promise.all([
    ids.listing.size
      ? db.listing.findMany({ where: { officeId, id: { in: [...ids.listing] } }, select: LISTING_SUMMARY_SELECT })
      : [],
    ids.property.size
      ? db.property.findMany({ where: { officeId, id: { in: [...ids.property] } }, select: { id: true, ...placeSelect } })
      : [],
    ids.intake.size
      ? db.listingIntake.findMany({
          where: { officeId, id: { in: [...ids.intake] } },
          select: { id: true, property: { select: placeSelect } },
        })
      : [],
    ids.requirement.size
      ? db.buyerRequirement.findMany({
          where: { officeId, id: { in: [...ids.requirement] } },
          select: { id: true, transactionType: true, priceMax: true, depositMax: true, monthlyRentMax: true },
        })
      : [],
    ids.match.size
      ? db.match.findMany({
          where: { officeId, id: { in: [...ids.match] } },
          select: { id: true, stage: true, listing: { select: LISTING_SUMMARY_SELECT } },
        })
      : [],
    ids.site.size ? db.site.findMany({ where: { id: { in: [...ids.site] } }, select: { id: true, name: true } }) : [],
  ]);

  for (const listing of listings) labels[listing.id] = `${placeText(listing.property)} · ${listingPriceText(listing)}`;
  for (const property of properties) labels[property.id] = placeText(property);
  for (const intake of intakes) labels[intake.id] = `${placeText(intake.property)} 의뢰`;
  for (const requirement of requirements) {
    const type = requirement.transactionType ? TRANSACTION_TEXT[requirement.transactionType] : '구매';
    const budget =
      requirement.transactionType === 'monthly'
        ? requirement.depositMax !== null
          ? ` ~${formatManwon(requirement.depositMax)}/${formatManwon(requirement.monthlyRentMax)}`
          : ''
        : requirement.transactionType === 'jeonse'
          ? requirement.depositMax !== null || requirement.priceMax !== null
            ? ` ~${formatManwon(requirement.depositMax ?? requirement.priceMax)}`
            : ''
          : requirement.priceMax !== null
            ? ` ~${formatManwon(requirement.priceMax)}`
            : '';
    labels[requirement.id] = `${type} 요청${budget}`;
  }
  for (const match of matches) {
    const stage = normalizeMatchStage(match.stage);
    labels[match.id] = `${placeText(match.listing.property)} 매칭 (${MATCH_STAGE_TEXT[stage] ?? stage})`;
  }
  for (const site of sites) labels[site.id] = site.name;
  return labels;
}
