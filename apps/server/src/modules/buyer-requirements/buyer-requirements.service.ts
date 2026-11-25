import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../contacts/contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import { closeOpenMatchesForBuyerRequirement } from '../matches/match-lifecycle-sync';
import {
  buyerIntakeContactsInclude,
  withBuyerRequirementContact,
} from './buyer-requirement.presenter';

export interface BuyerRequirementSearchQuery {
  // Multi-value filters (comma-separated or arrays). Single string is treated
  // as a single-value legacy filter.
  status?: string | string[];
  urgency?: string | string[];
  transactionType?: string | string[];
  siteTypes?: string | string[];
  buyerIntakeId?: string;
  contactId?: string;
  assignedToId?: string | string[];
  // Preferred Site filter: list of site UUIDs. Matches buyers with any of them.
  preferredSiteIds?: string | string[];
  // Region filters at any of the three legal-dong levels. Each is CSV of codes.
  // Matching semantics (OR across buyer rows):
  //   - provinceCodes: buyer region with matching province_code
  //   - districtCodes: buyer district_code == x OR ward_code startsWith x
  //   - wardCodes: buyer ward_code == x
  provinceCodes?: string | string[];
  districtCodes?: string | string[];
  wardCodes?: string | string[];
  // Range filters. BuyerRequirement stores a range (min..max) per money/area
  // field; a filter is considered a match when the two ranges overlap.
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  // Date ranges (ISO strings)
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  // Free-text search over contact name/phone, memo
  search?: string;
  sortBy?: 'createdAt' | 'nextContactDate' | 'urgency';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

const BUYER_REQUIREMENT_STATUSES = new Set(['active', 'hold', 'completed']);
const TRANSACTION_TYPES = new Set(['sale', 'jeonse', 'monthly']);
const URGENCIES = new Set(['urgent', 'normal', 'flexible']);
/** 만원 단위 금액의 상한 (Postgres INTEGER 범위 안, 2조 원). 매칭 합의 조건과 같다. */
const MAX_MANWON = 200_000_000;
/** 면적 상한 (m², Decimal(10,2) 범위 안) */
const MAX_AREA_M2 = 10_000_000;

const MONEY_RANGES = [
  ['priceMin', 'priceMax', '희망 가격'],
  ['depositMin', 'depositMax', '보증금'],
  ['monthlyRentMin', 'monthlyRentMax', '월세'],
] as const;
type MoneyField = (typeof MONEY_RANGES)[number][0 | 1];
const MONEY_FIELDS = new Set<string>(MONEY_RANGES.flatMap(([min, max]) => [min, max]));
const DATE_FIELD_LABELS: Record<string, string> = {
  moveInDate: '입주 희망일',
  lastContactDate: '최근 연락일',
  nextContactDate: '다음 연락일',
};

/**
 * 고칠 수 있는 칸. 나머지(상태 · 사무소 · 의뢰 · 만든 때)는 받지 않는다.
 * 상태는 전용 경로(PATCH :id/status), 우선순위는 PATCH :id/priority로 바꾼다.
 */
const UPDATABLE_FIELDS = [
  'transactionType',
  'siteTypes',
  'priceMin',
  'priceMax',
  'depositMin',
  'depositMax',
  'monthlyRentMin',
  'monthlyRentMax',
  'areaMin',
  'areaMax',
  'moveInDate',
  'urgency',
  'assignedToId',
  'lastContactDate',
  'nextContactDate',
  'memo',
] as const;

type RequirementInput = Partial<Record<(typeof UPDATABLE_FIELDS)[number], unknown>>;
type PreferredSiteInput = { siteId: string; priority?: number; memo?: string };
type PreferredRegionInput = { provinceCode?: string; districtCode?: string; wardCode?: string };

type RangeValues = Partial<
  Record<MoneyField | 'areaMin' | 'areaMax', number | Prisma.Decimal | null>
>;

function bad(message: string): never {
  throw new BadRequestException(message);
}

/** 받침에 따라 조사를 고른다 ("보증금은" · "월세는") */
function withJosa(word: string, withBatchim: string, withoutBatchim: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasBatchim ? withBatchim : withoutBatchim}`;
}

function readMoney(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    bad(`${withJosa(label, '은', '는')} 만원 단위 정수로 입력해 주세요.`);
  }
  if (value < 0) bad(`${withJosa(label, '은', '는')} 0 이상이어야 합니다.`);
  if (value > MAX_MANWON) bad(`${withJosa(label, '이', '가')} 너무 큽니다.`);
  return value;
}

function readArea(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    bad('희망 면적을 숫자로 입력해 주세요.');
  }
  if (value < 0) bad('희망 면적은 0 이상이어야 합니다.');
  if (value > MAX_AREA_M2) bad('희망 면적이 너무 큽니다.');
  return Math.round(value * 100) / 100;
}

function readDate(value: unknown, label: string): Date | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' && !(value instanceof Date)) {
    bad(`${label} 형식이 올바르지 않습니다.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) bad(`${label} 형식이 올바르지 않습니다.`);
  return date;
}

function toNumber(value: number | Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value);
}

/**
 * 받은 값을 검사해 저장할 모양으로 바꾼다. 보내지 않은 칸(undefined)은 그대로 두고, null은 비운다.
 * 형식이 틀리면 사용자에게 보일 문장으로 400을 던진다.
 */
function normalizeRequirementInput(input: RequirementInput) {
  const data: Record<string, unknown> = {};
  for (const field of UPDATABLE_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (field === 'transactionType') {
      if (value !== null && (typeof value !== 'string' || !TRANSACTION_TYPES.has(value))) {
        bad('거래유형은 매매 · 전세 · 월세 중 하나여야 합니다.');
      }
      data[field] = value;
    } else if (field === 'urgency') {
      if (typeof value !== 'string' || !URGENCIES.has(value)) {
        bad('긴급도는 급함 · 보통 · 여유 중 하나여야 합니다.');
      }
      data[field] = value;
    } else if (field === 'siteTypes') {
      if (value === null) {
        data[field] = [];
        continue;
      }
      if (!Array.isArray(value) || value.some((type) => typeof type !== 'string' || !type)) {
        bad('매물 유형 형식이 올바르지 않습니다.');
      }
      data[field] = Array.from(new Set(value as string[]));
    } else if (MONEY_FIELDS.has(field)) {
      const label = MONEY_RANGES.find(([min, max]) => min === field || max === field)![2];
      data[field] = readMoney(value, label);
    } else if (field === 'areaMin' || field === 'areaMax') {
      data[field] = readArea(value);
    } else if (field in DATE_FIELD_LABELS) {
      data[field] = readDate(value, DATE_FIELD_LABELS[field]);
    } else if (field === 'assignedToId') {
      if (value !== null && typeof value !== 'string') bad('담당자 형식이 올바르지 않습니다.');
      data[field] = value || null;
    } else if (field === 'memo') {
      if (value !== null && typeof value !== 'string') bad('메모 형식이 올바르지 않습니다.');
      data[field] = value;
    }
  }
  return data;
}

/** 최소 ≤ 최대. 고치는 쪽만 보낸 경우 저장된 다른 쪽과 견준다. */
function assertRanges(next: RangeValues) {
  for (const [minField, maxField, label] of MONEY_RANGES) {
    const min = toNumber(next[minField]);
    const max = toNumber(next[maxField]);
    if (min !== null && max !== null && min > max) {
      bad(`${label}의 최소값이 최대값보다 큽니다.`);
    }
  }
  const areaMin = toNumber(next.areaMin);
  const areaMax = toNumber(next.areaMax);
  if (areaMin !== null && areaMax !== null && areaMin > areaMax) {
    bad('희망 면적의 최소값이 최대값보다 큽니다.');
  }
}

const buyerRequirementMutationInclude = {
  buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
  preferredSites: {
    include: { site: { select: { id: true, name: true, type: true } } },
    orderBy: { priority: 'asc' as const },
  },
  preferredRegions: {
    include: { province: true, district: true, ward: true },
  },
} satisfies Prisma.BuyerRequirementInclude;

function assertPositivePriorityRank(priorityRank: number) {
  if (!Number.isInteger(priorityRank) || priorityRank < 1) {
    throw new BadRequestException('순서는 1 이상의 정수여야 합니다.');
  }
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const arr = Array.isArray(value)
    ? value
    : value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

@Injectable()
export class BuyerRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 담당자 · 희망 단지가 이 사무소에서 고를 수 있는 것인지 본다 (FK는 id만 가리킨다) */
  private async assertReferences(
    officeId: string,
    input: {
      assignedToId?: unknown;
      preferredSites?: { siteId: string }[];
    },
  ) {
    if (typeof input.assignedToId === 'string' && input.assignedToId) {
      const user = await this.prisma.user.findFirst({
        where: { id: input.assignedToId, officeId },
        select: { id: true },
      });
      if (!user) bad('담당자를 찾을 수 없습니다.');
    }
    if (input.preferredSites !== undefined) {
      if (
        !Array.isArray(input.preferredSites) ||
        input.preferredSites.some(
          (site) => !site || typeof site.siteId !== 'string' || !site.siteId,
        )
      ) {
        bad('희망 단지 형식이 올바르지 않습니다.');
      }
      const siteIds = Array.from(new Set(input.preferredSites.map((site) => site.siteId)));
      if (siteIds.length > 0) {
        // 공공 단지(officeId 없음)와 우리 사무소의 비공개 단지만 고를 수 있다
        const found = await this.prisma.site.count({
          where: {
            id: { in: siteIds },
            OR: [{ officeId: null }, { officeId }],
          },
        });
        if (found !== siteIds.length) bad('희망 단지를 찾을 수 없습니다.');
      }
    }
  }

  /**
   * 희망 단지 목록을 저장할 모양으로만 골라 담는다(siteId · priority · memo).
   * 받은 객체를 그대로 중첩 create에 넘기면 다른 칸(관계 쓰기)까지 함께 실려 간다.
   */
  private normalizeSites(input: unknown): PreferredSiteInput[] | undefined {
    if (input === undefined) return undefined;
    if (input === null) return [];
    if (!Array.isArray(input)) bad('희망 단지 형식이 올바르지 않습니다.');
    return input.map((item, index) => {
      if (!item || typeof item !== 'object') bad('희망 단지 형식이 올바르지 않습니다.');
      const { siteId, priority, memo } = item as Record<string, unknown>;
      if (typeof siteId !== 'string' || !siteId) bad('희망 단지 형식이 올바르지 않습니다.');
      if (priority !== undefined && priority !== null && !Number.isInteger(priority)) {
        bad('희망 단지 순서 형식이 올바르지 않습니다.');
      }
      if (memo !== undefined && memo !== null && typeof memo !== 'string') {
        bad('희망 단지 메모 형식이 올바르지 않습니다.');
      }
      return {
        siteId,
        priority: typeof priority === 'number' ? priority : index + 1,
        ...(typeof memo === 'string' ? { memo } : {}),
      };
    });
  }

  /**
   * 희망 지역 목록을 법정동 코드 문자열만 골라 담고, 그 코드가 법정동 마스터에 있는지 확인한다.
   * 받은 객체를 그대로 넘기면 province: { connectOrCreate } 같은 중첩 쓰기로 모든 사무소가 함께 쓰는
   * 법정동 마스터에 줄이 생긴다(2026-11-22 코드 검토). 없는 코드는 400 "지역을 찾을 수 없습니다.".
   */
  private async normalizeRegions(input: unknown): Promise<PreferredRegionInput[] | undefined> {
    if (input === undefined) return undefined;
    if (input === null) return [];
    if (!Array.isArray(input)) bad('희망 지역 형식이 올바르지 않습니다.');
    const regions = input.map((item) => {
      if (!item || typeof item !== 'object') bad('희망 지역 형식이 올바르지 않습니다.');
      const raw = item as Record<string, unknown>;
      const pick = (key: 'provinceCode' | 'districtCode' | 'wardCode', length: number) => {
        const value = raw[key];
        if (value === undefined || value === null || value === '') return undefined;
        if (typeof value !== 'string' || !new RegExp(`^\\d{${length}}$`).test(value)) {
          bad('지역을 찾을 수 없습니다.');
        }
        return value;
      };
      const region: PreferredRegionInput = {
        provinceCode: pick('provinceCode', 2),
        districtCode: pick('districtCode', 5),
        wardCode: pick('wardCode', 10),
      };
      if (!region.provinceCode && !region.districtCode && !region.wardCode) {
        bad('희망 지역 형식이 올바르지 않습니다.');
      }
      return region;
    });
    const unique = <T,>(values: (T | undefined)[]) =>
      Array.from(new Set(values.filter((value): value is T => value !== undefined)));
    const provinceCodes = unique(regions.map((region) => region.provinceCode));
    const districtCodes = unique(regions.map((region) => region.districtCode));
    const wardCodes = unique(regions.map((region) => region.wardCode));
    const [provinces, districts, wards] = await Promise.all([
      provinceCodes.length
        ? this.prisma.province.count({ where: { code: { in: provinceCodes } } })
        : 0,
      districtCodes.length
        ? this.prisma.district.count({ where: { code: { in: districtCodes } } })
        : 0,
      wardCodes.length ? this.prisma.ward.count({ where: { code: { in: wardCodes } } }) : 0,
    ]);
    if (
      provinces !== provinceCodes.length ||
      districts !== districtCodes.length ||
      wards !== wardCodes.length
    ) {
      bad('지역을 찾을 수 없습니다.');
    }
    return regions;
  }

  async findAll(officeId: string, query: BuyerRequirementSearchQuery = {}) {
    const where: Prisma.BuyerRequirementWhereInput = { officeId };
    const AND: Prisma.BuyerRequirementWhereInput[] = [];

    // ── Multi-value filters ─────────────────────────────────────
    const statusList = toArray(query.status);
    if (statusList) where.status = { in: statusList };

    const urgencyList = toArray(query.urgency);
    if (urgencyList) where.urgency = { in: urgencyList };

    const txList = toArray(query.transactionType);
    if (txList) where.transactionType = { in: txList };

    const assigneeList = toArray(query.assignedToId);
    if (assigneeList) where.assignedToId = { in: assigneeList };

    const siteTypesList = toArray(query.siteTypes);
    if (siteTypesList) where.siteTypes = { hasSome: siteTypesList };

    const preferredSiteIds = toArray(query.preferredSiteIds);
    if (preferredSiteIds) {
      AND.push({
        preferredSites: { some: { siteId: { in: preferredSiteIds } } },
      });
    }

    const provinceCodes = toArray(query.provinceCodes);
    const districtCodes = toArray(query.districtCodes);
    const wardCodes = toArray(query.wardCodes);
    if (provinceCodes || districtCodes || wardCodes) {
      const regionOR: Prisma.BuyerRequirementRegionWhereInput[] = [];
      if (provinceCodes) regionOR.push({ provinceCode: { in: provinceCodes } });
      // districtCode filter matches either buyer.districtCode OR buyer.wardCode
      // starting with that district (ward codes are 10 digits, first 5 = district)
      if (districtCodes) {
        regionOR.push({ districtCode: { in: districtCodes } });
        for (const dc of districtCodes) {
          regionOR.push({ wardCode: { startsWith: dc } });
        }
      }
      if (wardCodes) regionOR.push({ wardCode: { in: wardCodes } });
      AND.push({
        preferredRegions: { some: { OR: regionOR } },
      });
    }

    if (query.buyerIntakeId) where.buyerIntakeId = query.buyerIntakeId;
    if (query.contactId) {
      where.buyerIntake = {
        contacts: { some: { contactId: query.contactId } },
      };
    }

    // ── Range filters: overlap semantics ────────────────────────
    // Filter [F.min, F.max] overlaps Buyer [priceMin, priceMax] when:
    //   (F.min == null OR priceMax == null OR priceMax >= F.min)
    //   AND (F.max == null OR priceMin == null OR priceMin <= F.max)
    const addOverlap = (
      fieldMin: keyof Prisma.BuyerRequirementWhereInput,
      fieldMax: keyof Prisma.BuyerRequirementWhereInput,
      filterMin: number | undefined,
      filterMax: number | undefined,
    ) => {
      if (filterMin === undefined && filterMax === undefined) return;
      if (filterMin !== undefined) {
        AND.push({
          OR: [{ [fieldMax]: null }, { [fieldMax]: { gte: filterMin } }] as any,
        });
      }
      if (filterMax !== undefined) {
        AND.push({
          OR: [{ [fieldMin]: null }, { [fieldMin]: { lte: filterMax } }] as any,
        });
      }
    };

    addOverlap('priceMin', 'priceMax', query.priceMin, query.priceMax);
    addOverlap('depositMin', 'depositMax', query.depositMin, query.depositMax);
    addOverlap(
      'monthlyRentMin',
      'monthlyRentMax',
      query.monthlyRentMin,
      query.monthlyRentMax,
    );
    addOverlap('areaMin', 'areaMax', query.areaMin, query.areaMax);

    // ── Date ranges ─────────────────────────────────────────────
    if (query.nextContactAfter || query.nextContactBefore) {
      const cond: Prisma.DateTimeNullableFilter = {};
      if (query.nextContactAfter) cond.gte = new Date(query.nextContactAfter);
      if (query.nextContactBefore) cond.lte = new Date(query.nextContactBefore);
      where.nextContactDate = cond;
    }
    if (query.moveInAfter || query.moveInBefore) {
      const cond: Prisma.DateTimeNullableFilter = {};
      if (query.moveInAfter) cond.gte = new Date(query.moveInAfter);
      if (query.moveInBefore) cond.lte = new Date(query.moveInBefore);
      where.moveInDate = cond;
    }

    // ── Free-text search ────────────────────────────────────────
    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      const canonicalPhone = normalizePhone(q);
      AND.push({
        OR: [
          {
            buyerIntake: {
              contacts: {
                some: {
                  contact: { name: { contains: q, mode: 'insensitive' } },
                },
              },
            },
          },
          ...(canonicalPhone
            ? [{
                buyerIntake: {
                  contacts: {
                    some: {
                      contact: {
                        phones: {
                          some: {
                            phone: { contains: canonicalPhone },
                          },
                        },
                      },
                    },
                  },
                },
              }]
            : []),
          { memo: { contains: q, mode: 'insensitive' } },
          {
            preferredSites: {
              some: { site: { name: { contains: q, mode: 'insensitive' } } },
            },
          },
        ],
      });
    }

    if (AND.length > 0) where.AND = AND;

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.buyerRequirement.findMany({
        where,
        include: {
          buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
          assignedTo: { select: { id: true, name: true } },
          preferredSites: {
            include: {
              site: { select: { id: true, name: true, type: true } },
            },
            orderBy: { priority: 'asc' },
          },
          preferredRegions: {
            include: {
              province: true,
              district: true,
              ward: true,
            },
          },
          _count: { select: { matches: true, consultations: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.buyerRequirement.count({ where }),
    ]);

    return {
      items: items.map(withBuyerRequirementContact),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, officeId: string) {
    const req = await this.prisma.buyerRequirement.findFirst({
      where: { id, officeId },
      include: {
        buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
        assignedTo: { select: { id: true, name: true } },
        matches: {
          include: {
            listing: {
              include: {
                intake: { select: LISTING_INTAKE_STATE_SELECT },
                deals: OCCUPYING_DEALS_SELECT,
                // 화면이 "고덕그라시움 101동 3301호"처럼 어느 집인지 적을 수 있게 동 · 호까지 싣는다
                property: {
                  include: { site: true, unit: { include: { dong: true } } },
                },
              },
            },
          },
        },
        consultations: { orderBy: { createdAt: 'desc' }, take: 10 },
        preferredSites: {
          include: { site: { select: { id: true, name: true, type: true } } },
          orderBy: { priority: 'asc' },
        },
        preferredRegions: {
          include: { province: true, district: true, ward: true },
        },
      },
    });
    if (!req) throw new NotFoundException('희망 조건을 찾을 수 없습니다.');
    return withBuyerRequirementContact(req);
  }

  async create(
    officeId: string,
    dto: {
      buyerIntakeId?: string;
      contactId?: string;
      createNewIntake?: boolean;
      priorityRank?: number;
      transactionType?: string;
      siteTypes?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMin?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      nextContactDate?: string;
      memo?: string;
      preferredSites?: { siteId: string; priority?: number; memo?: string }[];
      preferredRegions?: {
        provinceCode?: string;
        districtCode?: string;
        wardCode?: string;
      }[];
    },
    /** id: 같은 요청을 다시 보내도 한 건만 생기게 할 때 (통화 분석 제안 반영) */
    options: { id?: string } = {},
  ) {
    const {
      buyerIntakeId,
      contactId,
      createNewIntake,
      priorityRank,
      moveInDate,
      nextContactDate,
      preferredSites,
      preferredRegions,
      ...rest
    } = dto;
    if (!buyerIntakeId && !contactId) {
      throw new BadRequestException('고객을 선택해 주세요.');
    }
    if (buyerIntakeId && createNewIntake) {
      throw new BadRequestException(
        '새 구매 의뢰는 고객을 골라 만들 때만 열 수 있습니다.',
      );
    }
    if (priorityRank !== undefined) assertPositivePriorityRank(priorityRank);
    // 형식 검사 (보내지 않은 칸은 넘어간다). 저장할 때는 아래에서 검사한 값을 쓴다.
    const normalized = normalizeRequirementInput({
      ...rest,
      moveInDate,
      nextContactDate,
    });
    assertRanges(normalized as RangeValues);
    const sites = this.normalizeSites(preferredSites);
    const regions = await this.normalizeRegions(preferredRegions);
    await this.assertReferences(officeId, {
      assignedToId: normalized.assignedToId,
      preferredSites: sites,
    });

    return this.prisma.$transaction(async (tx) => {
      let intake = buyerIntakeId
        ? await tx.buyerIntake.findFirst({
            where: { id: buyerIntakeId, officeId },
            include: { contacts: true },
          })
        : null;

      if (buyerIntakeId && !intake) {
        throw new NotFoundException('구매 의뢰를 찾을 수 없습니다.');
      }
      if (
        intake &&
        contactId &&
        !intake.contacts.some((contact) => contact.contactId === contactId)
      ) {
        throw new BadRequestException(
          '선택한 연락처가 해당 구매 의뢰에 참여하고 있지 않습니다.',
        );
      }

      if (!intake && contactId) {
        const contact = await tx.contact.findFirst({
          where: { id: contactId, officeId },
          select: { id: true },
        });
        if (!contact) throw new NotFoundException('고객을 찾을 수 없습니다.');

        // contactId 기반 조건 추가는 가장 최근 열린 Intake를 재사용한다.
        // 새 의뢰 접수 화면은 createNewIntake로 재사용을 명시적으로 건너뛴다.
        if (!createNewIntake) {
          intake = await tx.buyerIntake.findFirst({
            where: {
              officeId,
              lifecycleStatus: 'open',
              contacts: {
                some: {
                  contactId,
                  role: { in: ['buyer', 'co_buyer'] },
                },
              },
            },
            include: { contacts: true },
            orderBy: { updatedAt: 'desc' },
          });
        }

        if (!intake) {
          intake = await tx.buyerIntake.create({
            data: {
              officeId,
              contacts: {
                create: {
                  role: 'buyer',
                  isPrimary: true,
                  office: { connect: { id: officeId } },
                  contact: {
                    connect: {
                      officeId_id: { officeId, id: contactId },
                    },
                  },
                },
              },
            },
            include: { contacts: true },
          });
        }
      }

      if (!intake) {
        throw new BadRequestException('구매 의뢰를 확인할 수 없습니다.');
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`buyer-intake:${intake.id}`}::text, 0))`;
      const lastRequirement = await tx.buyerRequirement.findFirst({
        where: { buyerIntakeId: intake.id },
        orderBy: [{ priorityRank: 'desc' }, { createdAt: 'desc' }],
        select: { priorityRank: true },
      });
      const appendPriorityRank = (lastRequirement?.priorityRank ?? 0) + 1;
      if (priorityRank !== undefined && priorityRank > appendPriorityRank) {
        throw new BadRequestException(
          `순서는 1부터 ${appendPriorityRank}까지 정할 수 있습니다.`,
        );
      }
      const resolvedPriorityRank = priorityRank ?? appendPriorityRank;

      if (resolvedPriorityRank < appendPriorityRank) {
        await tx.buyerRequirement.updateMany({
          where: {
            officeId,
            buyerIntakeId: intake.id,
            priorityRank: { gte: resolvedPriorityRank },
          },
          data: { priorityRank: { increment: 1 } },
        });
      }

      const requirement = await tx.buyerRequirement.create({
        data: {
          ...(options.id ? { id: options.id } : {}),
          officeId,
          buyerIntakeId: intake.id,
          priorityRank: resolvedPriorityRank,
          ...(normalized as Partial<Prisma.BuyerRequirementUncheckedCreateInput>),
          // 고른 칸만 담은 목록을 쓴다 (받은 객체를 그대로 중첩 create에 넘기지 않는다)
          preferredSites: sites?.length ? { create: sites } : undefined,
          preferredRegions: regions?.length ? { create: regions } : undefined,
        },
        include: buyerRequirementMutationInclude,
      });
      return withBuyerRequirementContact(requirement);
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      priorityRank?: number;
      transactionType?: string;
      siteTypes?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMin?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      lastContactDate?: string;
      nextContactDate?: string;
      memo?: string;
      preferredSites?: { siteId: string; priority?: number; memo?: string }[];
      preferredRegions?: {
        provinceCode?: string;
        districtCode?: string;
        wardCode?: string;
      }[];
    },
  ) {
    const { priorityRank, preferredSites, preferredRegions, ...rest } = dto;
    if (priorityRank !== undefined) {
      const hasOtherChanges =
        preferredSites !== undefined ||
        preferredRegions !== undefined ||
        Object.keys(rest).length > 0;
      if (hasOtherChanges) {
        throw new BadRequestException(
          '순서 바꾸기는 다른 희망 조건 수정과 따로 해 주세요.',
        );
      }
      return this.reorder(id, officeId, priorityRank);
    }

    // 고칠 수 있는 칸만 받는다 (상태 · 사무소 · 의뢰 · 만든 때 같은 칸은 이 경로로 바꾸지 못한다).
    // null은 비우기다: 입주 희망일 · 연락일 · 담당 · 메모 · 금액을 지울 수 있다.
    const data = normalizeRequirementInput(rest as RequirementInput);
    const current = await this.prisma.buyerRequirement.findFirst({
      where: { id, officeId },
      select: {
        priceMin: true,
        priceMax: true,
        depositMin: true,
        depositMax: true,
        monthlyRentMin: true,
        monthlyRentMax: true,
        areaMin: true,
        areaMax: true,
      },
    });
    if (!current) throw new NotFoundException('희망 조건을 찾을 수 없습니다.');
    assertRanges({ ...current, ...(data as RangeValues) });
    const sites = this.normalizeSites(preferredSites);
    const regions = await this.normalizeRegions(preferredRegions);
    await this.assertReferences(officeId, {
      assignedToId: data.assignedToId,
      preferredSites: sites,
    });

    const requirement = await this.prisma.buyerRequirement.update({
      where: { id },
      data: {
        ...(data as Prisma.BuyerRequirementUncheckedUpdateInput),
        // 보낸 목록으로 통째로 바꾼다. 보내지 않은 목록은 칸 자체를 넣지 않는다 —
        // undefined라도 칸이 있으면 변경 기록(ActivityLog)이 고치지 않은 지역 · 단지를 "바뀜"으로 남긴다.
        ...(sites ? { preferredSites: { deleteMany: {}, create: sites } } : {}),
        ...(regions ? { preferredRegions: { deleteMany: {}, create: regions } } : {}),
      },
      include: buyerRequirementMutationInclude,
    });
    return withBuyerRequirementContact(requirement);
  }

  async reorder(id: string, officeId: string, priorityRank: number) {
    assertPositivePriorityRank(priorityRank);

    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.buyerRequirement.findFirst({
        where: { id, officeId },
        select: { id: true, buyerIntakeId: true },
      });
      if (!identity) throw new NotFoundException('희망 조건을 찾을 수 없습니다.');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`buyer-intake:${identity.buyerIntakeId}`}::text, 0))`;
      const current = await tx.buyerRequirement.findFirst({
        where: { id, officeId, buyerIntakeId: identity.buyerIntakeId },
        select: { id: true, buyerIntakeId: true, priorityRank: true },
      });
      if (!current) throw new NotFoundException('희망 조건을 찾을 수 없습니다.');

      const requirementCount = await tx.buyerRequirement.count({
        where: { officeId, buyerIntakeId: current.buyerIntakeId },
      });
      if (priorityRank > requirementCount) {
        throw new BadRequestException(
          `순서는 1부터 ${requirementCount}까지 정할 수 있습니다.`,
        );
      }

      if (priorityRank < current.priorityRank) {
        await tx.buyerRequirement.updateMany({
          where: {
            officeId,
            buyerIntakeId: current.buyerIntakeId,
            priorityRank: { gte: priorityRank, lt: current.priorityRank },
          },
          data: { priorityRank: { increment: 1 } },
        });
      } else if (priorityRank > current.priorityRank) {
        await tx.buyerRequirement.updateMany({
          where: {
            officeId,
            buyerIntakeId: current.buyerIntakeId,
            priorityRank: { gt: current.priorityRank, lte: priorityRank },
          },
          data: { priorityRank: { decrement: 1 } },
        });
      }

      if (priorityRank !== current.priorityRank) {
        await tx.buyerRequirement.update({
          where: { id },
          data: { priorityRank },
        });
      }

      const requirement = await tx.buyerRequirement.findUniqueOrThrow({
        where: { id },
        include: buyerRequirementMutationInclude,
      });
      return withBuyerRequirementContact(requirement);
    });
  }

  async updateStatus(id: string, officeId: string, status: string) {
    if (!BUYER_REQUIREMENT_STATUSES.has(status)) {
      throw new BadRequestException(
        '상태는 활성 · 보류 · 완료 중 하나여야 합니다.',
      );
    }
    // 완료하면(다른 곳에서 구함 등) 그 조건의 진행 중 매칭도 같은 트랜잭션에서 닫는다 (buyer_closed).
    // 매물 의뢰를 닫을 때 매칭을 닫는 것과 짝이다. 보류는 잠시 쉬는 것이라 닫지 않는다.
    // 다시 활성으로 열어도 닫힌 매칭은 되살리지 않는다(매물 의뢰를 다시 열 때와 같다).
    const { requirement, closedMatchCount } = await this.prisma.$transaction(async (tx) => {
      // 같은 조건의 상태 변경이 겹치지 않게 줄을 잠근다
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "buyer_requirements" WHERE "id" = ${id}::uuid AND "office_id" = ${officeId}::uuid FOR UPDATE`;
      if (locked.length === 0) {
        throw new NotFoundException('희망 조건을 찾을 수 없습니다.');
      }
      const updated = await tx.buyerRequirement.update({
        where: { id },
        data: { status },
        include: {
          buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
        },
      });
      const closed =
        status === 'completed'
          ? await closeOpenMatchesForBuyerRequirement(tx, { officeId, buyerReqId: id })
          : 0;
      return { requirement: updated, closedMatchCount: closed };
    });
    return { ...withBuyerRequirementContact(requirement), closedMatchCount };
  }

  async remove(id: string, officeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.buyerRequirement.findFirst({
        where: { id, officeId },
        select: { id: true, buyerIntakeId: true },
      });
      if (!identity) throw new NotFoundException('희망 조건을 찾을 수 없습니다.');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`buyer-intake:${identity.buyerIntakeId}`}::text, 0))`;
      const current = await tx.buyerRequirement.findFirst({
        where: { id, officeId, buyerIntakeId: identity.buyerIntakeId },
        select: { id: true, buyerIntakeId: true, priorityRank: true },
      });
      if (!current) throw new NotFoundException('희망 조건을 찾을 수 없습니다.');

      // A consultation belongs to the buyer project even when one detailed
      // requirement is removed. Keep the intake context and detach only the
      // requirement-level context before deleting it.
      await tx.consultation.updateMany({
        where: { officeId, buyerReqId: id },
        data: { buyerReqId: null },
      });

      const deleted = await tx.buyerRequirement.delete({ where: { id } });
      await tx.buyerRequirement.updateMany({
        where: {
          officeId,
          buyerIntakeId: current.buyerIntakeId,
          priorityRank: { gt: current.priorityRank },
        },
        data: { priorityRank: { decrement: 1 } },
      });

      const [remainingReqs, remainingDeals, remainingConsults, remainingSteps] = await Promise.all([
        tx.buyerRequirement.count({ where: { officeId, buyerIntakeId: current.buyerIntakeId } }),
        tx.deal.count({ where: { officeId, buyerIntakeId: current.buyerIntakeId } }),
        tx.consultation.count({ where: { officeId, buyerIntakeId: current.buyerIntakeId } }),
        tx.projectStep.count({ where: { officeId, buyerIntakeId: current.buyerIntakeId } }),
      ]);
      if (remainingReqs === 0 && remainingDeals === 0 && remainingConsults === 0 && remainingSteps === 0) {
        await tx.buyerIntake.delete({ where: { id: current.buyerIntakeId } });
      }
      return deleted;
    });
  }

  async findDueContacts(officeId: string) {
    const now = new Date();
    const items = await this.prisma.buyerRequirement.findMany({
      where: {
        officeId,
        status: 'active',
        nextContactDate: { lte: now },
        buyerIntake: {
          lifecycleStatus: { in: ['open', 'hold'] },
        },
      },
      include: {
        buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { nextContactDate: 'asc' },
    });
    return items.map(withBuyerRequirementContact);
  }
}
