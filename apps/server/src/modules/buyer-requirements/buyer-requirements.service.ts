import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone, phoneSearchDigits } from '../contacts/contact-phone.utils';
import { closeOpenMatchesForBuyerRequirement } from '../matches/match-lifecycle-sync';
import {
  getMatchStageStorageValues,
  MATCH_ROW_SELECT,
  presentMatchRow,
} from '../matches/match-row';
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
  // ── 희망매물 목록이 쓰는 조건. 예전에는 화면이 전부 받아 놓고 걸렀다 ──
  /** 이 id의 조건만 (한 줄만 같은 꼴로 다시 받을 때) */
  ids?: string | string[];
  /** `region:<법정동 코드>` · `site:<단지 id>`. 여럿이면 하나만 맞아도 된다 */
  locations?: string | string[];
  /** 예산(만원). 월세 조건은 보증금과, 그 밖에는 매매가 · 전세가와 견준다 */
  budgetMin?: number;
  budgetMax?: number;
  /** 매칭 단계(여럿). `none`은 연결한 매물이 없는 조건 */
  matchStages?: string | string[];
  /**
   * 검색어를 희망 지역 이름과 연결한 매물(단지 · 주소 · 동 · 호 · 매칭 메모)에서도 찾는다.
   * 낱말을 띄어 쓰면 낱말마다 어딘가에 있어야 한다("그라시움 101동").
   */
  searchMatches?: boolean;
  /** `matches`: 조건마다 연결한 매물(매칭)을 가벼운 줄로 함께 싣는다 */
  expand?: string;
  /** name: 대표 고객 이름 가나다순, 같은 손님은 우선순위순 */
  sortBy?: 'createdAt' | 'nextContactDate' | 'urgency' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

const BUYER_REQUIREMENT_STATUSES = new Set(['active', 'hold', 'completed']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 담당자 조건의 "담당자 없음" */
const NO_ASSIGNEE = 'none';
/** 매칭 단계 조건의 "매칭 없음" */
const NO_MATCH_STAGE = 'none';
const KOREAN_COLLATOR = new Intl.Collator('ko');

/**
 * `region:<법정동 코드>` · `site:<단지 id>` 하나의 조건.
 * 법정동 코드는 앞자리가 상위 지역이다. 고른 지역과 **그 아래**를 원하는 손님만 걸린다:
 * 강동구를 고르면 강동구 · 고덕동을 원하는 손님이 걸리고, 서울 전체를 원하는 손님은 걸리지 않는다
 * (사용자 결정 2026-11-26 — 예전 화면은 위쪽 지역을 원하는 손님도 함께 보였다).
 * 희망 지역 한 줄의 지역은 가장 좁은 단위다 (동 > 구 > 시도).
 */
function locationWhere(value: string): Prisma.BuyerRequirementWhereInput {
  if (value.startsWith('site:')) {
    const siteId = value.slice('site:'.length);
    if (!UUID_PATTERN.test(siteId)) bad('단지를 찾을 수 없습니다.');
    return { preferredSites: { some: { siteId } } };
  }
  const code = value.startsWith('region:') ? value.slice('region:'.length) : '';
  if (!/^\d{2,10}$/.test(code)) bad('지역을 찾을 수 없습니다.');
  return {
    preferredRegions: {
      some: {
        OR: [
          { wardCode: { startsWith: code } },
          { wardCode: null, districtCode: { startsWith: code } },
          { wardCode: null, districtCode: null, provinceCode: { startsWith: code } },
        ],
      },
    },
  };
}

/** 낱말 하나를 찾을 곳: 손님(이름 · 번호) · 메모 · 희망 단지와 지역 · 연결한 매물 */
function wideSearchWhere(
  word: string,
  /**
   * 단계 조건을 함께 건 경우의 그 단계들. 매물에서 찾을 때는 그 단계의 매칭에서만 찾는다 —
   * 종료한 래미안과 임장 중인 힐스테이트를 연결한 손님이 "래미안 + 임장"에 걸리면 안 된다.
   */
  matchStages?: string[],
): Prisma.BuyerRequirementWhereInput[] {
  const contains = { contains: word, mode: 'insensitive' as const };
  // 번호를 찾는 말일 때만 번호로 찾는다 — "101동"의 101이 든 번호의 손님이 딸려 나오지 않게
  const phone = phoneSearchDigits(word);
  // "101동" · "3301호"로 쳐도 이름을 "101" · "3301"로 적어 둔 동 · 호를 찾는다
  const bare = word.replace(/[동호]$/, '');
  const placeName = { contains: bare || word, mode: 'insensitive' as const };
  return [
    { buyerIntake: { contacts: { some: { contact: { name: contains } } } } },
    ...(phone
      ? [
          {
            buyerIntake: {
              contacts: {
                some: { contact: { phones: { some: { phone: { contains: phone } } } } },
              },
            },
          },
        ]
      : []),
    { memo: contains },
    { preferredSites: { some: { site: { name: contains } } } },
    {
      preferredRegions: {
        some: {
          OR: [
            { ward: { name: contains } },
            { district: { name: contains } },
            { province: { name: contains } },
          ],
        },
      },
    },
    {
      matches: {
        some: {
          ...(matchStages ? { stage: { in: matchStages } } : {}),
          OR: [
            { memo: contains },
            {
              listing: {
                property: {
                  OR: [
                    { site: { name: contains } },
                    { site: { roadAddress: contains } },
                    { site: { jibunAddress: contains } },
                    { unit: { name: placeName } },
                    { unit: { dong: { name: placeName } } },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  ];
}
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
      if (!user) bad('담당 직원을 찾을 수 없습니다.');
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

  private buildListWhere(
    officeId: string,
    query: BuyerRequirementSearchQuery,
  ): Prisma.BuyerRequirementWhereInput {
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
    if (assigneeList) {
      // `none`: 담당자가 없는 조건
      const ids = assigneeList.filter((value) => value !== NO_ASSIGNEE);
      for (const id of ids) if (!UUID_PATTERN.test(id)) bad('담당 직원을 찾을 수 없습니다.');
      if (ids.length === assigneeList.length) where.assignedToId = { in: ids };
      else AND.push({ OR: [{ assignedToId: null }, { assignedToId: { in: ids } }] });
    }

    const idList = toArray(query.ids);
    if (idList) {
      // 꼴이 틀린 id는 DB 오류(500) 대신 "없는 조건"으로 본다
      where.id = { in: idList.filter((id) => UUID_PATTERN.test(id)) };
    }

    const locations = toArray(query.locations);
    if (locations) AND.push({ OR: locations.map(locationWhere) });

    const matchStages = toArray(query.matchStages);
    if (matchStages) {
      const stages = Array.from(
        new Set(
          matchStages
            .filter((stage) => stage !== NO_MATCH_STAGE)
            .flatMap(getMatchStageStorageValues),
        ),
      );
      const stageOR: Prisma.BuyerRequirementWhereInput[] = [];
      if (stages.length > 0) stageOR.push({ matches: { some: { stage: { in: stages } } } });
      if (matchStages.includes(NO_MATCH_STAGE)) stageOR.push({ matches: { none: {} } });
      AND.push({ OR: stageOR });
    }

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

    // 예산: 월세 조건은 보증금이, 그 밖에는 매매가 · 전세가가 그 손님의 예산이다
    const monthly: Prisma.BuyerRequirementWhereInput = { transactionType: 'monthly' };
    const notMonthly: Prisma.BuyerRequirementWhereInput = {
      OR: [{ transactionType: null }, { transactionType: { not: 'monthly' } }],
    };
    if (query.budgetMin !== undefined) {
      const gte = query.budgetMin;
      AND.push({
        OR: [
          { AND: [monthly, { OR: [{ depositMax: null }, { depositMax: { gte } }] }] },
          { AND: [notMonthly, { OR: [{ priceMax: null }, { priceMax: { gte } }] }] },
        ],
      });
    }
    if (query.budgetMax !== undefined) {
      const lte = query.budgetMax;
      AND.push({
        OR: [
          { AND: [monthly, { OR: [{ depositMin: null }, { depositMin: { lte } }] }] },
          { AND: [notMonthly, { OR: [{ priceMin: null }, { priceMin: { lte } }] }] },
        ],
      });
    }

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
    if (query.search && query.search.trim() && query.searchMatches) {
      const stageList = toArray(query.matchStages);
      const searchStages = stageList
        ? Array.from(
            new Set(
              stageList
                .filter((stage) => stage !== NO_MATCH_STAGE)
                .flatMap(getMatchStageStorageValues),
            ),
          )
        : undefined;
      for (const word of query.search.trim().split(/\s+/).slice(0, 8)) {
        AND.push({ OR: wideSearchWhere(word, searchStages) });
      }
    } else if (query.search && query.search.trim()) {
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
    return where;
  }

  async findAll(officeId: string, query: BuyerRequirementSearchQuery = {}) {
    for (const value of Object.values(query)) {
      if (typeof value === 'number' && !Number.isFinite(value)) bad('숫자 조건이 잘못되었습니다.');
    }
    const where = this.buildListWhere(officeId, query);

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const include = {
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
      _count: { select: { matches: true } },
    } satisfies Prisma.BuyerRequirementInclude;

    let rows: Prisma.BuyerRequirementGetPayload<{ include: typeof include }>[];
    let total: number;
    if (sortBy === 'name') {
      // 이름은 다른 표(대표 연락처)에 있고 가나다순은 DB 정렬과 다르다. 조건에 맞는 것의 이름만 먼저 받아
      // 차례를 정한 뒤, 이 쪽에 해당하는 줄만 온전히 받는다.
      const named = await this.prisma.buyerRequirement.findMany({
        where,
        select: {
          id: true,
          priorityRank: true,
          createdAt: true,
          buyerIntake: {
            select: {
              contacts: {
                select: { contact: { select: { name: true } } },
                orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                take: 1,
              },
            },
          },
        },
      });
      const direction = sortOrder === 'desc' && query.sortOrder ? -1 : 1;
      const nameOf = (row: (typeof named)[number]) =>
        row.buyerIntake.contacts[0]?.contact.name ?? '';
      named.sort(
        (left, right) =>
          direction * KOREAN_COLLATOR.compare(nameOf(left), nameOf(right)) ||
          left.priorityRank - right.priorityRank ||
          right.createdAt.getTime() - left.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );
      total = named.length;
      const pageIds = named.slice(skip, skip + limit).map((row) => row.id);
      const found = await this.prisma.buyerRequirement.findMany({
        where: { officeId, id: { in: pageIds } },
        include,
      });
      const byId = new Map(found.map((row) => [row.id, row]));
      rows = pageIds.flatMap((id) => byId.get(id) ?? []);
    } else {
      [rows, total] = await Promise.all([
        this.prisma.buyerRequirement.findMany({
          where,
          include,
          orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
          skip,
          take: limit,
        }),
        this.prisma.buyerRequirement.count({ where }),
      ]);
    }

    const pagination = { page, limit, total, totalPages: Math.ceil(total / limit) };
    const items = rows.map(withBuyerRequirementContact);
    if (!toArray(query.expand)?.includes('matches')) return { items, pagination };

    // 연결한 매물(매칭)을 조건마다 싣는다. 단계 조건으로 손님을 골랐어도 그 손님의 매칭은 모두 싣는다
    // (옆 패널과 "진행 중 N건"이 전부를 센다). 어느 것을 보일지는 화면이 정한다.
    const matches =
      rows.length === 0
        ? []
        : await this.prisma.match.findMany({
            where: { officeId, buyerReqId: { in: rows.map((row) => row.id) } },
            select: MATCH_ROW_SELECT,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          });
    const byRequirement = new Map<string, ReturnType<typeof presentMatchRow>[]>();
    for (const match of matches) {
      const row = presentMatchRow(match);
      const siblings = byRequirement.get(match.buyerReqId);
      if (siblings) siblings.push(row);
      else byRequirement.set(match.buyerReqId, [row]);
    }
    return {
      items: items.map((item) => ({ ...item, matches: byRequirement.get(item.id) ?? [] })),
      pagination,
    };
  }

  /**
   * 희망매물 필터의 선택지: 지금 조건들에 실제로 있는 지역 · 단지 · 담당자.
   * 목록을 쪽 단위로 받으므로 화면이 받아 둔 줄에서 선택지를 모을 수 없다.
   */
  async findFilterOptions(officeId: string, status?: string | string[]) {
    const statuses = (toArray(status) ?? ['active', 'hold']).filter((value) =>
      BUYER_REQUIREMENT_STATUSES.has(value),
    );
    const scope: Prisma.BuyerRequirementWhereInput = { officeId, status: { in: statuses } };
    const [regions, sites, assignees, unassigned] = await Promise.all([
      this.prisma.buyerRequirementRegion.findMany({
        where: { buyerRequirement: scope },
        distinct: ['provinceCode', 'districtCode', 'wardCode'],
        select: {
          provinceCode: true,
          districtCode: true,
          wardCode: true,
          province: { select: { name: true } },
          district: { select: { name: true } },
          ward: { select: { name: true } },
        },
      }),
      this.prisma.buyerRequirementSite.findMany({
        where: { buyerRequirement: scope },
        distinct: ['siteId'],
        select: { siteId: true, site: { select: { name: true } } },
      }),
      this.prisma.buyerRequirement.findMany({
        where: { ...scope, assignedToId: { not: null } },
        distinct: ['assignedToId'],
        select: { assignedTo: { select: { id: true, name: true } } },
      }),
      this.prisma.buyerRequirement.count({ where: { ...scope, assignedToId: null } }),
    ]);

    const regionNames = new Map<string, string>();
    for (const region of regions) {
      // 가장 좁은 단위가 그 줄의 지역이다 (동 > 구 > 시도)
      const code = region.wardCode ?? region.districtCode ?? region.provinceCode;
      const name = region.ward?.name ?? region.district?.name ?? region.province?.name;
      if (code && name) regionNames.set(code, name);
    }
    return {
      regions: Array.from(regionNames, ([code, name]) => ({ code, name })),
      sites: sites.map((row) => ({ id: row.siteId, name: row.site.name })),
      assignees: assignees.flatMap((row) => (row.assignedTo ? [row.assignedTo] : [])),
      hasUnassigned: unassigned > 0,
    };
  }

  async findOne(id: string, officeId: string) {
    const req = await this.prisma.buyerRequirement.findFirst({
      where: { id, officeId },
      include: {
        buyerIntake: {
          include: {
            contacts: buyerIntakeContactsInclude,
            consultations: { orderBy: { createdAt: 'desc' }, take: 10 },
          },
        },
        assignedTo: { select: { id: true, name: true } },
        // 목록의 줄 안에 싣는 것(expand=matches)과 같은 가벼운 줄. 손님 쪽에서 매칭을 보는 화면
        // (희망 조건 상세 · 프로젝트 · 연락처)은 이것을 쓰고 매칭 목록을 따로 부르지 않는다.
        matches: { select: MATCH_ROW_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] },
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
    return {
      ...withBuyerRequirementContact(req),
      matches: req.matches.map(presentMatchRow),
      consultations: req.buyerIntake.consultations,
    };
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
