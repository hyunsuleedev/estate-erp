import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { contactPhonesIncludeOrdered } from '../contacts/contact-phone.utils';

export type BrokerageCaseLedgerMode = 'all' | 'demand' | 'supply' | 'both';
export type BrokerageCaseLedgerSortField =
  | 'customer'
  | 'intentCount'
  | 'budgetMin'
  | 'budgetMax'
  | 'monthlyRentMin'
  | 'monthlyRentMax'
  | 'areaMin'
  | 'areaMax'
  | 'matchCount'
  | 'updatedAt';

export interface BrokerageCaseLedgerQuery {
  search?: string;
  mode?: BrokerageCaseLedgerMode;
  status?: string;
  urgency?: string;
  transactionType?: string;
  assignedToId?: string;
  preferredSiteIds?: string;
  provinceCodes?: string;
  districtCodes?: string;
  wardCodes?: string;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  budgetMin?: number;
  budgetMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  supplyPriceMin?: number;
  supplyPriceMax?: number;
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  sortBy?: BrokerageCaseLedgerSortField;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

const CASE_MODES = new Set<BrokerageCaseLedgerMode>([
  'all',
  'demand',
  'supply',
  'both',
]);
const CASE_SORT_FIELDS = new Set<BrokerageCaseLedgerSortField>([
  'customer',
  'intentCount',
  'budgetMin',
  'budgetMax',
  'monthlyRentMin',
  'monthlyRentMax',
  'areaMin',
  'areaMax',
  'matchCount',
  'updatedAt',
]);
const TRANSACTION_TYPES = new Set(['sale', 'jeonse', 'monthly']);
const BUYER_REQUIREMENT_STATUSES = new Set([
  'active',
  'matched',
  'hold',
  'inactive',
  'completed',
]);
const ACTIVE_BUYER_REQUIREMENT_STATUSES = [
  'active',
  'matched',
  'hold',
  'inactive',
] as const;
const BUYER_URGENCIES = new Set(['urgent', 'normal', 'flexible']);
const DEPENDENCY_TYPES = new Set([
  'sale_proceeds',
  'timing',
  'move_sequence',
  'other',
]);
const DEPENDENCY_STATUSES = new Set([
  'planned',
  'confirmed',
  'resolved',
  'cancelled',
]);

function parseCsvValues(value: string | undefined) {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

const BUYER_REQUIREMENT_FILTER_FIELDS = [
  'status',
  'urgency',
  'transactionType',
  'assignedToId',
  'preferredSiteIds',
  'provinceCodes',
  'districtCodes',
  'wardCodes',
  'priceMin',
  'priceMax',
  'depositMin',
  'depositMax',
  'budgetMin',
  'budgetMax',
  'monthlyRentMin',
  'monthlyRentMax',
  'areaMin',
  'areaMax',
  'nextContactAfter',
  'nextContactBefore',
  'moveInAfter',
  'moveInBefore',
] as const satisfies readonly (keyof BrokerageCaseLedgerQuery)[];

export function hasBuyerRequirementLedgerFilters(
  query: BrokerageCaseLedgerQuery,
) {
  return BUYER_REQUIREMENT_FILTER_FIELDS.some((field) => {
    const value = query[field];
    return typeof value === 'string'
      ? value.trim().length > 0
      : value !== undefined;
  });
}

const activeCaseInclude = {
  participants: {
    include: {
      contact: { include: { phones: contactPhonesIncludeOrdered } },
    },
    orderBy: [
      { isCommunicationPrimary: 'desc' as const },
      { isPrincipal: 'desc' as const },
      { createdAt: 'asc' as const },
    ],
  },
  buyerIntakes: {
    where: { lifecycleStatus: { in: ['open', 'hold'] } },
    orderBy: [
      { casePriorityRank: 'asc' as const },
      { receivedAt: 'asc' as const },
    ],
    include: {
      contacts: {
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
        },
        orderBy: [
          { isPrimary: 'desc' as const },
          { createdAt: 'asc' as const },
        ],
      },
      requirements: {
        orderBy: [
          { priorityRank: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
        include: {
          preferredSites: {
            include: { site: { select: { id: true, name: true, type: true } } },
            orderBy: { priority: 'asc' as const },
          },
          preferredRegions: {
            include: { province: true, district: true, ward: true },
          },
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { matches: true } },
        },
      },
    },
  },
  listingIntakes: {
    where: { lifecycleStatus: { in: ['open', 'hold'] } },
    orderBy: [
      { casePriorityRank: 'asc' as const },
      { receivedAt: 'asc' as const },
    ],
    include: {
      property: {
        include: {
          site: {
            include: {
              ward: {
                include: { district: { include: { province: true } } },
              },
            },
          },
          unit: { include: { dong: true, siteUnitType: true } },
        },
      },
      listings: {
        orderBy: [{ createdAt: 'asc' as const }],
        include: { _count: { select: { matches: true } } },
      },
    },
  },
  dependencies: {
    where: { status: { not: 'cancelled' } },
    orderBy: [{ isRequired: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.BrokerageCaseInclude;

type ActiveCaseWithRelations = Prisma.BrokerageCaseGetPayload<{
  include: typeof activeCaseInclude;
}>;

interface CaseIdRow {
  id: string;
  buyerRequirementIds: string[] | null;
  total: bigint;
}

@Injectable()
export class BrokerageCasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findLedger(officeId: string, query: BrokerageCaseLedgerQuery = {}) {
    this.assertLedgerQuery(query);
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));
    const offset = (page - 1) * limit;
    const mode = query.mode ?? 'all';
    const sortBy = query.sortBy ?? 'updatedAt';
    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const statusFilters = parseCsvValues(query.status);
    const urgencyFilters = parseCsvValues(query.urgency);
    const transactionTypes = parseCsvValues(query.transactionType);
    const assignedToIds = parseCsvValues(query.assignedToId);
    const preferredSiteIds = parseCsvValues(query.preferredSiteIds);
    const provinceCodes = parseCsvValues(query.provinceCodes);
    const districtCodes = parseCsvValues(query.districtCodes);
    const wardCodes = parseCsvValues(query.wardCodes);
    const buyerFiltersActive = hasBuyerRequirementLedgerFilters(query);
    const buyerStatuses = statusFilters.length
      ? statusFilters
      : [...ACTIVE_BUYER_REQUIREMENT_STATUSES];
    const visibleRequirementStatuses = new Set([
      ...ACTIVE_BUYER_REQUIREMENT_STATUSES,
      ...statusFilters,
    ]);
    const nextContactAfter = query.nextContactAfter
      ? new Date(query.nextContactAfter)
      : undefined;
    const nextContactBefore = query.nextContactBefore
      ? new Date(query.nextContactBefore)
      : undefined;
    const moveInAfter = query.moveInAfter
      ? new Date(query.moveInAfter)
      : undefined;
    const moveInBefore = query.moveInBefore
      ? new Date(query.moveInBefore)
      : undefined;

    const buyerConditions: Prisma.Sql[] = [
      Prisma.sql`bi."office_id" = ${officeId}::uuid`,
      Prisma.sql`bi."lifecycle_status" IN ('open', 'hold')`,
      Prisma.sql`br."status" IN (${Prisma.join(buyerStatuses)})`,
    ];
    const listingConditions: Prisma.Sql[] = [
      Prisma.sql`li."office_id" = ${officeId}::uuid`,
      Prisma.sql`li."lifecycle_status" IN ('open', 'hold')`,
      Prisma.sql`l."is_paused" = false`,
    ];

    if (transactionTypes.length > 0) {
      buyerConditions.push(
        Prisma.sql`br."transaction_type" IN (${Prisma.join(transactionTypes)})`,
      );
    }
    if (urgencyFilters.length > 0) {
      buyerConditions.push(
        Prisma.sql`br."urgency" IN (${Prisma.join(urgencyFilters)})`,
      );
    }
    if (assignedToIds.length > 0) {
      buyerConditions.push(
        Prisma.sql`br."assigned_to_id"::text IN (${Prisma.join(assignedToIds)})`,
      );
    }
    if (preferredSiteIds.length > 0) {
      buyerConditions.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM "buyer_requirement_sites" brs_filter
        WHERE brs_filter."buyer_req_id" = br."id"
          AND brs_filter."site_id"::text IN (${Prisma.join(preferredSiteIds)})
      )`);
    }
    const regionConditions: Prisma.Sql[] = [];
    if (provinceCodes.length > 0) {
      regionConditions.push(
        Prisma.sql`brr_filter."province_code" IN (${Prisma.join(provinceCodes)})`,
      );
    }
    if (districtCodes.length > 0) {
      regionConditions.push(Prisma.sql`(
        brr_filter."district_code" IN (${Prisma.join(districtCodes)})
        OR LEFT(brr_filter."ward_code", 5) IN (${Prisma.join(districtCodes)})
      )`);
    }
    if (wardCodes.length > 0) {
      regionConditions.push(
        Prisma.sql`brr_filter."ward_code" IN (${Prisma.join(wardCodes)})`,
      );
    }
    if (regionConditions.length > 0) {
      buyerConditions.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM "buyer_requirement_regions" brr_filter
        WHERE brr_filter."buyer_req_id" = br."id"
          AND (${Prisma.join(regionConditions, ' OR ')})
      )`);
    }
    if (query.priceMin !== undefined) {
      buyerConditions.push(
        Prisma.sql`(br."price_max" IS NULL OR br."price_max" >= ${query.priceMin})`,
      );
    }
    if (query.priceMax !== undefined) {
      buyerConditions.push(
        Prisma.sql`(br."price_min" IS NULL OR br."price_min" <= ${query.priceMax})`,
      );
    }
    if (query.depositMin !== undefined) {
      buyerConditions.push(
        Prisma.sql`(br."deposit_max" IS NULL OR br."deposit_max" >= ${query.depositMin})`,
      );
    }
    if (query.depositMax !== undefined) {
      buyerConditions.push(
        Prisma.sql`(br."deposit_min" IS NULL OR br."deposit_min" <= ${query.depositMax})`,
      );
    }
    if (query.budgetMin !== undefined) {
      buyerConditions.push(Prisma.sql`(
        CASE WHEN br."transaction_type" = 'monthly'
          THEN br."deposit_max" ELSE br."price_max" END IS NULL
        OR CASE WHEN br."transaction_type" = 'monthly'
          THEN br."deposit_max" ELSE br."price_max" END >= ${query.budgetMin}
      )`);
    }
    if (query.budgetMax !== undefined) {
      buyerConditions.push(Prisma.sql`(
        CASE WHEN br."transaction_type" = 'monthly'
          THEN br."deposit_min" ELSE br."price_min" END IS NULL
        OR CASE WHEN br."transaction_type" = 'monthly'
          THEN br."deposit_min" ELSE br."price_min" END <= ${query.budgetMax}
      )`);
    }
    if (query.monthlyRentMin !== undefined) {
      buyerConditions.push(
        Prisma.sql`(br."monthly_rent_max" IS NULL OR br."monthly_rent_max" >= ${query.monthlyRentMin})`,
      );
    }
    if (query.monthlyRentMax !== undefined) {
      buyerConditions.push(
        Prisma.sql`(br."monthly_rent_min" IS NULL OR br."monthly_rent_min" <= ${query.monthlyRentMax})`,
      );
    }
    if (query.areaMin !== undefined) {
      buyerConditions.push(
        Prisma.sql`(br."area_max" IS NULL OR br."area_max" >= ${query.areaMin})`,
      );
    }
    if (query.areaMax !== undefined) {
      buyerConditions.push(
        Prisma.sql`(br."area_min" IS NULL OR br."area_min" <= ${query.areaMax})`,
      );
    }
    if (nextContactAfter) {
      buyerConditions.push(
        Prisma.sql`br."next_contact_date" >= ${nextContactAfter}`,
      );
    }
    if (nextContactBefore) {
      buyerConditions.push(
        Prisma.sql`br."next_contact_date" <= ${nextContactBefore}`,
      );
    }
    if (moveInAfter) {
      buyerConditions.push(Prisma.sql`br."move_in_date" >= ${moveInAfter}`);
    }
    if (moveInBefore) {
      buyerConditions.push(Prisma.sql`br."move_in_date" <= ${moveInBefore}`);
    }
    if (query.supplyPriceMin !== undefined) {
      listingConditions.push(Prisma.sql`
        CASE WHEN l."transaction_type" = 'monthly'
          THEN l."deposit" ELSE l."price" END >= ${query.supplyPriceMin}
      `);
    }
    if (query.supplyPriceMax !== undefined) {
      listingConditions.push(Prisma.sql`
        CASE WHEN l."transaction_type" = 'monthly'
          THEN l."deposit" ELSE l."price" END <= ${query.supplyPriceMax}
      `);
    }

    const caseConditions: Prisma.Sql[] = [
      Prisma.sql`bc."office_id" = ${officeId}::uuid`,
      Prisma.sql`bc."archived_at" IS NULL`,
      // 고객 원장은 식별 가능한 참여자가 있는 업무철만 다룬다. 기존 데이터 중
      // 소유자/구매자 연결 없이 만들어진 의뢰는 매물 원장에는 남되 여기엔 나오지 않는다.
      Prisma.sql`EXISTS (
        SELECT 1 FROM "brokerage_case_participants" bcp_visible
        WHERE bcp_visible."brokerage_case_id" = bc."id"
          AND bcp_visible."office_id" = ${officeId}::uuid
      )`,
    ];
    // 요건 존재 여부는 buyer_totals/listing_totals LATERAL이 이미 계산하므로
    // 별도 EXISTS로 CTE를 다시 스캔하지 않는다.
    if (mode === 'demand') {
      caseConditions.push(Prisma.sql`buyer_totals.intent_count > 0`);
    } else if (mode === 'supply') {
      caseConditions.push(Prisma.sql`listing_totals.intent_count > 0`);
      if (buyerFiltersActive) {
        caseConditions.push(Prisma.sql`buyer_totals.intent_count > 0`);
      }
    } else if (mode === 'both') {
      caseConditions.push(
        Prisma.sql`buyer_totals.intent_count > 0`,
        Prisma.sql`listing_totals.intent_count > 0`,
      );
    } else if (buyerFiltersActive) {
      // 구매고객 필터가 켜진 순간부터 고객원장은 "조건에 맞는 구함이 있는 케이스"다.
      // 따라서 납품 전용 BrokerageCase는 결과에서 제외한다.
      caseConditions.push(Prisma.sql`buyer_totals.intent_count > 0`);
    } else {
      caseConditions.push(
        Prisma.sql`(buyer_totals.intent_count > 0 OR listing_totals.intent_count > 0)`,
      );
    }

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const phonePattern = `%${search.replace(/\D/g, '')}%`;
      caseConditions.push(Prisma.sql`(
        bc."title" ILIKE ${pattern}
        OR EXISTS (
          SELECT 1
          FROM "brokerage_case_participants" bcp_search
          JOIN "contacts" c_search ON c_search."id" = bcp_search."contact_id"
          LEFT JOIN "contact_phones" cp_search ON cp_search."contact_id" = c_search."id"
          WHERE bcp_search."brokerage_case_id" = bc."id"
            AND bcp_search."office_id" = ${officeId}::uuid
            AND (
              c_search."name" ILIKE ${pattern}
              OR (${phonePattern} <> '%%' AND cp_search."phone" LIKE ${phonePattern})
            )
        )
        OR EXISTS (
          SELECT 1
          FROM listing_matches lm_search
          WHERE lm_search.case_id = bc.id
            AND lm_search.context_text ILIKE ${pattern}
        )
        OR EXISTS (
          SELECT 1
          FROM buyer_matches bm_search
          WHERE bm_search.case_id = bc.id
            AND bm_search.context_text ILIKE ${pattern}
        )
      )`);
    }

    const sortExpressions: Record<BrokerageCaseLedgerSortField, Prisma.Sql> = {
      customer: Prisma.sql`eligible.customer_name`,
      intentCount: Prisma.sql`eligible.intent_count`,
      budgetMin: Prisma.sql`COALESCE(eligible.budget_min, eligible.supply_price)`,
      budgetMax: Prisma.sql`COALESCE(eligible.budget_max, eligible.supply_price)`,
      monthlyRentMin: Prisma.sql`eligible.monthly_rent_min`,
      monthlyRentMax: Prisma.sql`eligible.monthly_rent_max`,
      areaMin: Prisma.sql`eligible.area_min`,
      areaMax: Prisma.sql`eligible.area_max`,
      matchCount: Prisma.sql`eligible.match_count`,
      updatedAt: Prisma.sql`eligible.updated_at`,
    };
    const orderExpression = sortExpressions[sortBy];

    // context_text는 검색 EXISTS에서만 쓰이므로 검색이 없으면 계산을 생략한다.
    const buyerContextText = search
      ? Prisma.sql`CONCAT_WS(' ',
          (SELECT STRING_AGG(s."name", ' ' ORDER BY brs."priority" NULLS LAST)
           FROM "buyer_requirement_sites" brs
           JOIN "sites" s ON s."id" = brs."site_id"
           WHERE brs."buyer_req_id" = br."id"),
          (SELECT STRING_AGG(COALESCE(w."name", d."name", p."name"), ' ')
           FROM "buyer_requirement_regions" brr
           LEFT JOIN "wards" w ON w."code" = brr."ward_code"
           LEFT JOIN "districts" d ON d."code" = brr."district_code"
           LEFT JOIN "provinces" p ON p."code" = brr."province_code"
           WHERE brr."buyer_req_id" = br."id")
        )`
      : Prisma.sql`NULL::text`;
    const listingContextText = search
      ? Prisma.sql`CONCAT_WS(' ', s."name", d."name", u."name", w."name")`
      : Prisma.sql`NULL::text`;

    const idRows = await this.prisma.$queryRaw<CaseIdRow[]>(Prisma.sql`
      WITH buyer_matches AS (
        SELECT
          bi."brokerage_case_id" AS case_id,
          bi."case_priority_rank" AS intake_rank,
          br."id" AS intent_id,
          br."priority_rank" AS intent_rank,
          CASE WHEN br."transaction_type" = 'monthly'
            THEN br."deposit_min" ELSE br."price_min" END AS budget_min,
          CASE WHEN br."transaction_type" = 'monthly'
            THEN br."deposit_max" ELSE br."price_max" END AS budget_max,
          br."monthly_rent_min" AS monthly_rent_min,
          br."monthly_rent_max" AS monthly_rent_max,
          br."area_min" AS area_min,
          br."area_max" AS area_max,
          (SELECT COUNT(*)::int FROM "matches" m WHERE m."buyer_req_id" = br."id") AS match_count,
          ${buyerContextText} AS context_text
        FROM "buyer_intakes" bi
        JOIN "buyer_requirements" br ON br."buyer_intake_id" = bi."id"
        WHERE ${Prisma.join(buyerConditions, ' AND ')}
      ),
      listing_matches AS (
        SELECT
          li."brokerage_case_id" AS case_id,
          li."case_priority_rank" AS intake_rank,
          l."id" AS intent_id,
          1 AS intent_rank,
          CASE WHEN l."transaction_type" = 'monthly'
            THEN l."deposit" ELSE l."price" END AS supply_price,
          l."monthly_rent" AS monthly_rent,
          COALESCE(u."supply_area_m2", sut."supply_area_m2") AS area,
          (SELECT COUNT(*)::int FROM "matches" m WHERE m."listing_id" = l."id") AS match_count,
          ${listingContextText} AS context_text
        FROM "listing_intakes" li
        JOIN "listings" l ON l."intake_id" = li."id"
        JOIN "properties" ppty ON ppty."id" = li."property_id"
        JOIN "sites" s ON s."id" = ppty."site_id"
        LEFT JOIN "units" u ON u."id" = ppty."unit_id"
        LEFT JOIN "dongs" d ON d."id" = u."dong_id"
        LEFT JOIN "site_unit_types" sut ON sut."id" = u."site_unit_type_id"
        LEFT JOIN "wards" w ON w."code" = s."ward_code"
        WHERE ${Prisma.join(listingConditions, ' AND ')}
      ),
      eligible AS (
        SELECT
          bc."id",
          bc."updated_at",
          primary_contact.customer_name,
          buyer_rep.budget_min,
          buyer_rep.budget_max,
          COALESCE(buyer_rep.monthly_rent_min, listing_rep.monthly_rent) AS monthly_rent_min,
          COALESCE(buyer_rep.monthly_rent_max, listing_rep.monthly_rent) AS monthly_rent_max,
          COALESCE(buyer_rep.area_min, listing_rep.area) AS area_min,
          COALESCE(buyer_rep.area_max, listing_rep.area) AS area_max,
          listing_rep.supply_price,
          buyer_totals.intent_ids AS buyer_requirement_ids,
          COALESCE(buyer_totals.intent_count, 0) + COALESCE(listing_totals.intent_count, 0) AS intent_count,
          COALESCE(buyer_totals.match_count, 0) + COALESCE(listing_totals.match_count, 0) AS match_count
        FROM "brokerage_cases" bc
        LEFT JOIN LATERAL (
          SELECT c."name" AS customer_name
          FROM "brokerage_case_participants" bcp
          JOIN "contacts" c ON c."id" = bcp."contact_id"
          WHERE bcp."brokerage_case_id" = bc."id"
          ORDER BY bcp."is_communication_primary" DESC,
                   bcp."is_principal" DESC,
                   bcp."created_at" ASC,
                   bcp."id" ASC
          LIMIT 1
        ) primary_contact ON true
        LEFT JOIN LATERAL (
          SELECT bm.*
          FROM buyer_matches bm
          WHERE bm.case_id = bc."id"
          ORDER BY bm.intake_rank ASC, bm.intent_rank ASC, bm.intent_id ASC
          LIMIT 1
        ) buyer_rep ON true
        LEFT JOIN LATERAL (
          SELECT lm.*
          FROM listing_matches lm
          WHERE lm.case_id = bc."id"
          ORDER BY lm.intake_rank ASC, lm.intent_rank ASC, lm.intent_id ASC
          LIMIT 1
        ) listing_rep ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS intent_count,
                 COALESCE(SUM(bm.match_count), 0)::int AS match_count,
                 ARRAY_AGG(
                   bm.intent_id
                   ORDER BY bm.intake_rank ASC, bm.intent_rank ASC, bm.intent_id ASC
                 ) AS intent_ids
          FROM buyer_matches bm
          WHERE bm.case_id = bc."id"
        ) buyer_totals ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS intent_count,
                 COALESCE(SUM(lm.match_count), 0)::int AS match_count
          FROM listing_matches lm
          WHERE lm.case_id = bc."id"
        ) listing_totals ON true
        WHERE ${Prisma.join(caseConditions, ' AND ')}
      )
      SELECT
        eligible."id",
        eligible.buyer_requirement_ids AS "buyerRequirementIds",
        COUNT(*) OVER() AS total
      FROM eligible
      ORDER BY ${orderExpression} ${Prisma.raw(sortOrder)} NULLS LAST,
               eligible.customer_name ASC NULLS LAST,
               eligible.id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const ids = idRows.map((row) => row.id);
    const cases = ids.length
      ? await this.prisma.brokerageCase.findMany({
          where: { officeId, id: { in: ids }, archivedAt: null },
          include: activeCaseInclude,
        })
      : [];
    const casesById = new Map(cases.map((item) => [item.id, item]));
    const matchingRequirementIdsByCase = new Map(
      idRows.map(
        (row) => [row.id, new Set(row.buyerRequirementIds ?? [])] as const,
      ),
    );
    const items = ids.flatMap((id) => {
      const item = casesById.get(id);
      return item
        ? [
            this.present(
              item,
              visibleRequirementStatuses,
              buyerFiltersActive
                ? (matchingRequirementIdsByCase.get(id) ?? new Set<string>())
                : undefined,
            ),
          ]
        : [];
    });
    const total = Number(idRows[0]?.total ?? 0);
    const summary = await this.getSummary(officeId);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary,
    };
  }

  async findOne(id: string, officeId: string) {
    const brokerageCase = await this.prisma.brokerageCase.findFirst({
      where: { id, officeId },
      include: activeCaseInclude,
    });
    if (!brokerageCase)
      throw new NotFoundException('중개 케이스를 찾을 수 없습니다.');
    return this.present(brokerageCase);
  }

  async update(
    id: string,
    officeId: string,
    dto: { title?: string | null; memo?: string | null; archived?: boolean },
  ) {
    const existing = await this.prisma.brokerageCase.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!existing)
      throw new NotFoundException('중개 케이스를 찾을 수 없습니다.');
    await this.prisma.brokerageCase.update({
      where: { id },
      data: {
        title: dto.title,
        memo: dto.memo,
        archivedAt:
          dto.archived === undefined
            ? undefined
            : dto.archived
              ? new Date()
              : null,
      },
    });
    return this.findOne(id, officeId);
  }

  async createDependency(
    brokerageCaseId: string,
    officeId: string,
    dto: {
      fromListingIntakeId: string;
      toBuyerIntakeId: string;
      type: string;
      isRequired?: boolean;
      expectedAmount?: number | null;
      requiredBy?: string | null;
      status?: string;
      memo?: string | null;
    },
  ) {
    if (!DEPENDENCY_TYPES.has(dto.type)) {
      throw new BadRequestException(
        '유효하지 않은 케이스 의존관계 유형입니다.',
      );
    }
    const status = dto.status ?? 'planned';
    if (!DEPENDENCY_STATUSES.has(status)) {
      throw new BadRequestException(
        '유효하지 않은 케이스 의존관계 상태입니다.',
      );
    }
    if (dto.expectedAmount !== undefined && dto.expectedAmount !== null) {
      if (!Number.isInteger(dto.expectedAmount) || dto.expectedAmount < 0) {
        throw new BadRequestException(
          '예상 금액은 0 이상의 만원 단위 정수여야 합니다.',
        );
      }
    }

    const [source, target] = await Promise.all([
      this.prisma.listingIntake.findFirst({
        where: {
          id: dto.fromListingIntakeId,
          officeId,
          brokerageCaseId,
        },
        select: { id: true },
      }),
      this.prisma.buyerIntake.findFirst({
        where: { id: dto.toBuyerIntakeId, officeId, brokerageCaseId },
        select: { id: true },
      }),
    ]);
    if (!source || !target) {
      throw new BadRequestException(
        '같은 케이스 안의 매도 의뢰와 구매 의뢰만 연결할 수 있습니다.',
      );
    }

    try {
      await this.prisma.brokerageCaseDependency.create({
        data: {
          officeId,
          brokerageCaseId,
          fromListingIntakeId: dto.fromListingIntakeId,
          toBuyerIntakeId: dto.toBuyerIntakeId,
          type: dto.type,
          isRequired: dto.isRequired ?? true,
          expectedAmount: dto.expectedAmount,
          requiredBy: dto.requiredBy ? new Date(dto.requiredBy) : null,
          status,
          memo: dto.memo,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 등록된 케이스 의존관계입니다.');
      }
      throw error;
    }
    return this.findOne(brokerageCaseId, officeId);
  }

  async removeDependency(
    brokerageCaseId: string,
    dependencyId: string,
    officeId: string,
  ) {
    const dependency = await this.prisma.brokerageCaseDependency.findFirst({
      where: { id: dependencyId, brokerageCaseId, officeId },
      select: { id: true },
    });
    if (!dependency) {
      throw new NotFoundException('케이스 의존관계를 찾을 수 없습니다.');
    }
    await this.prisma.brokerageCaseDependency.delete({
      where: { id: dependency.id },
    });
    return this.findOne(brokerageCaseId, officeId);
  }

  private present(
    brokerageCase: ActiveCaseWithRelations,
    visibleRequirementStatuses = new Set<string>(
      ACTIVE_BUYER_REQUIREMENT_STATUSES,
    ),
    visibleRequirementIds?: ReadonlySet<string>,
  ) {
    const participants = brokerageCase.participants.map((participant) => ({
      id: participant.id,
      contactId: participant.contactId,
      roles: participant.roles,
      isPrincipal: participant.isPrincipal,
      isCommunicationPrimary: participant.isCommunicationPrimary,
      memo: participant.memo,
      contact: {
        id: participant.contact.id,
        name: participant.contact.name,
        email: participant.contact.email,
        phone:
          participant.contact.phones.find((phone) => phone.isPrimary)?.phone ??
          participant.contact.phones[0]?.phone ??
          null,
      },
    }));

    const demandIntents = brokerageCase.buyerIntakes.flatMap((intake) =>
      intake.requirements
        .filter(
          (requirement) =>
            visibleRequirementStatuses.has(requirement.status) &&
            (!visibleRequirementIds ||
              visibleRequirementIds.has(requirement.id)),
        )
        .map((requirement) => {
          const preferredSites = requirement.preferredSites.map((item) => ({
            id: item.site.id,
            name: item.site.name,
            type: item.site.type,
            priority: item.priority,
          }));
          const preferredRegions = requirement.preferredRegions.map((item) => ({
            provinceCode: item.provinceCode,
            provinceName: item.province?.name ?? null,
            districtCode: item.districtCode,
            districtName: item.district?.name ?? null,
            wardCode: item.wardCode,
            wardName: item.ward?.name ?? null,
          }));
          const contextParts = [
            preferredSites.map((site) => site.name).join('·'),
            preferredRegions
              .map(
                (region) =>
                  region.wardName ?? region.districtName ?? region.provinceName,
              )
              .filter(Boolean)
              .join('·'),
          ].filter(Boolean);
          return {
            kind: 'demand' as const,
            buyerIntakeId: intake.id,
            intakePriorityRank: intake.casePriorityRank,
            lifecycleStatus: intake.lifecycleStatus,
            receivedAt: intake.receivedAt,
            requirementId: requirement.id,
            priorityRank: requirement.priorityRank,
            status: requirement.status,
            urgency: requirement.urgency,
            transactionType: requirement.transactionType,
            budgetMin:
              requirement.transactionType === 'monthly'
                ? requirement.depositMin
                : requirement.priceMin,
            budgetMax:
              requirement.transactionType === 'monthly'
                ? requirement.depositMax
                : requirement.priceMax,
            priceMin: requirement.priceMin,
            priceMax: requirement.priceMax,
            depositMin: requirement.depositMin,
            depositMax: requirement.depositMax,
            monthlyRentMin: requirement.monthlyRentMin,
            monthlyRentMax: requirement.monthlyRentMax,
            areaMin: toNumber(requirement.areaMin),
            areaMax: toNumber(requirement.areaMax),
            moveInDate: requirement.moveInDate,
            lastContactDate: requirement.lastContactDate,
            nextContactDate: requirement.nextContactDate,
            memo: requirement.memo,
            assignedTo: requirement.assignedTo,
            matchCount: requirement._count.matches,
            preferredSites,
            preferredRegions,
            contextLabel: contextParts.join(' · ') || '선호 지역 미등록',
          };
        }),
    );

    const supplyIntents = brokerageCase.listingIntakes.flatMap((intake) => {
      const property = intake.property;
      const unit = property.unit;
      const area = toNumber(
        unit?.supplyAreaM2 ?? unit?.siteUnitType?.supplyAreaM2,
      );
      const locationParts = [
        property.site.name,
        unit?.dong && !unit.dong.isPlaceholder
          ? unit.dong.name.endsWith('동')
            ? unit.dong.name
            : `${unit.dong.name}동`
          : null,
        unit?.name ?? null,
      ].filter(Boolean);
      return intake.listings.map((listing) => ({
        kind: 'supply' as const,
        listingIntakeId: intake.id,
        intakePriorityRank: intake.casePriorityRank,
        lifecycleStatus: intake.lifecycleStatus,
        receivedAt: intake.receivedAt,
        listingId: listing.id,
        transactionType: listing.transactionType,
        askingPrice:
          listing.transactionType === 'monthly'
            ? listing.deposit
            : listing.price,
        price: listing.price,
        deposit: listing.deposit,
        monthlyRent: listing.monthlyRent,
        area,
        isPaused: listing.isPaused,
        matchCount: listing._count.matches,
        propertyId: property.id,
        siteId: property.site.id,
        siteName: property.site.name,
        districtName: property.site.ward.district.name,
        wardName: property.site.ward.name,
        dongName: unit?.dong?.name ?? null,
        unitName: unit?.name ?? null,
        contextLabel: locationParts.join(' '),
        memo: listing.memo ?? intake.memo,
      }));
    });

    return {
      id: brokerageCase.id,
      title: brokerageCase.title,
      memo: brokerageCase.memo,
      archivedAt: brokerageCase.archivedAt,
      createdAt: brokerageCase.createdAt,
      updatedAt: brokerageCase.updatedAt,
      participants,
      primaryParticipant:
        participants.find(
          (participant) => participant.isCommunicationPrimary,
        ) ??
        participants.find((participant) => participant.isPrincipal) ??
        participants[0] ??
        null,
      demandIntents,
      supplyIntents,
      intentCount: demandIntents.length + supplyIntents.length,
      mode:
        demandIntents.length && supplyIntents.length
          ? ('both' as const)
          : demandIntents.length
            ? ('demand' as const)
            : ('supply' as const),
      dependencies: brokerageCase.dependencies,
    };
  }

  private async getSummary(officeId: string) {
    const activeBuyer = {
      some: {
        lifecycleStatus: { in: ['open', 'hold'] },
        requirements: {
          some: { status: { in: [...ACTIVE_BUYER_REQUIREMENT_STATUSES] } },
        },
      },
    } satisfies Prisma.BuyerIntakeListRelationFilter;
    const activeListing = {
      some: {
        lifecycleStatus: { in: ['open', 'hold'] },
        listings: { some: { isPaused: false } },
      },
    } satisfies Prisma.ListingIntakeListRelationFilter;
    const base: Prisma.BrokerageCaseWhereInput = {
      officeId,
      archivedAt: null,
      participants: { some: {} },
    };
    const [cases, demand, supply, both] = await Promise.all([
      this.prisma.brokerageCase.count({
        where: {
          ...base,
          OR: [
            { buyerIntakes: activeBuyer },
            { listingIntakes: activeListing },
          ],
        },
      }),
      this.prisma.brokerageCase.count({
        where: { ...base, buyerIntakes: activeBuyer },
      }),
      this.prisma.brokerageCase.count({
        where: { ...base, listingIntakes: activeListing },
      }),
      this.prisma.brokerageCase.count({
        where: {
          ...base,
          buyerIntakes: activeBuyer,
          listingIntakes: activeListing,
        },
      }),
    ]);
    return { cases, demand, supply, both };
  }

  private assertLedgerQuery(query: BrokerageCaseLedgerQuery) {
    if (query.mode && !CASE_MODES.has(query.mode)) {
      throw new BadRequestException('유효하지 않은 고객 원장 보기 방식입니다.');
    }
    if (query.sortBy && !CASE_SORT_FIELDS.has(query.sortBy)) {
      throw new BadRequestException('유효하지 않은 고객 원장 정렬 필드입니다.');
    }
    if (query.sortOrder && !['asc', 'desc'].includes(query.sortOrder)) {
      throw new BadRequestException('유효하지 않은 정렬 방향입니다.');
    }
    if (
      parseCsvValues(query.status).some(
        (status) => !BUYER_REQUIREMENT_STATUSES.has(status),
      )
    ) {
      throw new BadRequestException('유효하지 않은 구매 요건 상태입니다.');
    }
    if (
      parseCsvValues(query.urgency).some(
        (urgency) => !BUYER_URGENCIES.has(urgency),
      )
    ) {
      throw new BadRequestException('유효하지 않은 긴급도입니다.');
    }
    if (
      parseCsvValues(query.transactionType).some(
        (transactionType) => !TRANSACTION_TYPES.has(transactionType),
      )
    ) {
      throw new BadRequestException('유효하지 않은 거래 유형입니다.');
    }
    for (const [field, value] of Object.entries(query)) {
      if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
        throw new BadRequestException(`${field} 값이 올바르지 않습니다.`);
      }
    }
    for (const field of [
      'nextContactAfter',
      'nextContactBefore',
      'moveInAfter',
      'moveInBefore',
    ] as const) {
      const value = query[field];
      if (value && Number.isNaN(new Date(value).getTime())) {
        throw new BadRequestException(`${field} 날짜가 올바르지 않습니다.`);
      }
    }
  }
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number(value);
}
