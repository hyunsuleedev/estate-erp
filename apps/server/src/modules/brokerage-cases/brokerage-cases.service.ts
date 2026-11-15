import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { contactPhonesIncludeOrdered } from "../contacts/contact-phone.utils";
import {
  BROKERAGE_CASE_LEDGER_SORT_FIELDS,
  buildBrokerageCaseLedgerCursorCondition,
  decodeBrokerageCaseLedgerCursor,
  encodeBrokerageCaseLedgerCursor,
  type BrokerageCaseLedgerCursorRow,
  type BrokerageCaseLedgerSortField,
  type BrokerageCaseLedgerSortOrder,
} from "./brokerage-case-ledger-cursor";

export type BrokerageCaseLedgerMode = "all" | "demand" | "listing" | "both";
export type { BrokerageCaseLedgerSortField } from "./brokerage-case-ledger-cursor";

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
  listingPriceMin?: number;
  listingPriceMax?: number;
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  sortBy?: BrokerageCaseLedgerSortField;
  sortOrder?: BrokerageCaseLedgerSortOrder;
  cursor?: string;
  limit?: number;
}

const CASE_MODES = new Set<BrokerageCaseLedgerMode>([
  "all",
  "demand",
  "listing",
  "both",
]);
const CASE_SORT_FIELDS = new Set<BrokerageCaseLedgerSortField>(
  BROKERAGE_CASE_LEDGER_SORT_FIELDS,
);
const TRANSACTION_TYPES = new Set(["sale", "jeonse", "monthly"]);
const BUYER_REQUIREMENT_STATUSES = new Set([
  "active",
  "matched",
  "hold",
  "inactive",
  "completed",
]);
const ACTIVE_BUYER_REQUIREMENT_STATUSES = [
  "active",
  "matched",
  "hold",
  "inactive",
] as const;
const BUYER_URGENCIES = new Set(["urgent", "normal", "flexible"]);

function parseCsvValues(value: string | undefined) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

const BUYER_REQUIREMENT_FILTER_FIELDS = [
  "status",
  "urgency",
  "transactionType",
  "assignedToId",
  "preferredSiteIds",
  "provinceCodes",
  "districtCodes",
  "wardCodes",
  "priceMin",
  "priceMax",
  "depositMin",
  "depositMax",
  "budgetMin",
  "budgetMax",
  "monthlyRentMin",
  "monthlyRentMax",
  "areaMin",
  "areaMax",
  "nextContactAfter",
  "nextContactBefore",
  "moveInAfter",
  "moveInBefore",
] as const satisfies readonly (keyof BrokerageCaseLedgerQuery)[];

export function hasBuyerRequirementLedgerFilters(
  query: BrokerageCaseLedgerQuery,
) {
  return BUYER_REQUIREMENT_FILTER_FIELDS.some((field) => {
    const value = query[field];
    return typeof value === "string"
      ? value.trim().length > 0
      : value !== undefined;
  });
}


const ledgerBuyerIntakeInclude = {
  contacts: {
    include: {
      contact: { include: { phones: contactPhonesIncludeOrdered } },
    },
    orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
  },
  requirements: {
    orderBy: [
      { priorityRank: "asc" as const },
      { createdAt: "asc" as const },
    ],
    include: {
      preferredSites: {
        include: {
          site: { select: { id: true, name: true, type: true } },
        },
        orderBy: { priority: "asc" as const },
      },
      preferredRegions: {
        include: { province: true, district: true, ward: true },
      },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { matches: true } },
    },
  },
} satisfies Prisma.BuyerIntakeInclude;

const ledgerListingIntakeInclude = {
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
      // 매물 의뢰의 당사자는 그 부동산의 활성 관련인이다. 건에 따로 복사하지 않는다.
      propertyContacts: {
        where: { status: "active" },
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
        },
        orderBy: [
          { isPrimary: "desc" as const },
          { createdAt: "asc" as const },
        ],
      },
    },
  },
  listings: {
    orderBy: [{ createdAt: "asc" as const }],
    include: { _count: { select: { matches: true } } },
  },
} satisfies Prisma.ListingIntakeInclude;

type LedgerBuyerIntake = Prisma.BuyerIntakeGetPayload<{
  include: typeof ledgerBuyerIntakeInclude;
}>;
type LedgerListingIntake = Prisma.ListingIntakeGetPayload<{
  include: typeof ledgerListingIntakeInclude;
}>;

export interface LedgerLatestConsultation {
  id: string;
  type: string;
  content: string;
  createdAt: Date;
}

/**
 * 고객 원장의 한 줄. 사용자가 묶은 중개 건이 있으면 그 건이 한 줄이고, 없으면
 * 실제 당사자(매수인·소유자) 조합이 같은 진행 중 의뢰들이 한 줄이다. 묶음은
 * 저장하지 않고 조회할 때 의뢰의 당사자에서 계산한다.
 */
interface LedgerGroup {
  id: string;
  brokerageCase: {
    id: string;
    title: string | null;
    memo: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { steps: number };
  } | null;
  primaryContactId: string | null;
  createdAt: Date;
  buyerIntakes: LedgerBuyerIntake[];
  listingIntakes: LedgerListingIntake[];
  latestConsultation: LedgerLatestConsultation | null;
}

interface LedgerParticipant {
  contactId: string;
  roles: string[];
  isPrincipal: boolean;
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

interface GroupIdRow extends BrokerageCaseLedgerCursorRow {
  id: string;
  caseId: string | null;
  primaryContactId: string | null;
  createdAt: Date;
  buyerIntakeIds: string[] | null;
  listingIntakeIds: string[] | null;
  buyerRequirementIds: string[] | null;
  total: bigint | null;
}

const BUYER_PRINCIPAL_ROLES = ["buyer", "co_buyer"];
const OWNER_PRINCIPAL_ROLES = ["owner", "co_owner"];

/**
 * 고객 원장의 묶음을 계산하는 CTE들 (WITH 뒤에 그대로 붙인다).
 *
 * - buyer_scope / listing_scope: 진행 중(open·hold) 의뢰와 그 실제 당사자.
 *   구매 의뢰는 buyer·co_buyer, 매물 의뢰는 활성 owner·co_owner가 당사자다.
 *   그런 역할이 하나도 없으면 연결된 사람 전원을 당사자로 본다. 연결된 사람이
 *   없는 의뢰는 고객 원장에 나오지 않는다.
 * - intake_groups: 의뢰마다 묶음 id. 중개 건에 담긴 의뢰는 건 id, 아니면 당사자
 *   조합에서 만든 id(같은 조합이면 같은 값). 보관한 건의 의뢰도 건 없는 의뢰와
 *   똑같이 당사자 조합으로 묶는다(원장에서 사라지면 다시 꺼낼 화면이 없다).
 * - ledger_groups: 묶음마다 한 줄.
 */
function ledgerGroupCtes(officeId: string) {
  return Prisma.sql`
    buyer_scope AS (
      SELECT
        bi."id" AS intake_id,
        -- 보관한 건의 의뢰는 건 없는 의뢰처럼 당사자 기준으로 묶는다(원장에서 숨기지 않는다).
        CASE WHEN bc_scope."archived_at" IS NULL
          THEN bi."brokerage_case_id" END AS case_id,
        bi."received_at" AS received_at,
        people.principal_ids,
        people.primary_contact_id
      FROM "buyer_intakes" bi
      JOIN LATERAL (
        SELECT
          COALESCE(
            ARRAY_AGG(bic."contact_id" ORDER BY bic."contact_id")
              FILTER (WHERE bic."role" IN (${Prisma.join(BUYER_PRINCIPAL_ROLES)})),
            ARRAY_AGG(bic."contact_id" ORDER BY bic."contact_id")
          ) AS principal_ids,
          (ARRAY_AGG(
            bic."contact_id"
            ORDER BY bic."is_primary" DESC,
                     (bic."role" IN (${Prisma.join(BUYER_PRINCIPAL_ROLES)})) DESC,
                     bic."created_at" ASC,
                     bic."id" ASC
          ))[1] AS primary_contact_id
        FROM "buyer_intake_contacts" bic
        WHERE bic."buyer_intake_id" = bi."id"
          AND bic."office_id" = ${officeId}::uuid
      ) people ON people.principal_ids IS NOT NULL
      LEFT JOIN "brokerage_cases" bc_scope ON bc_scope."id" = bi."brokerage_case_id"
      WHERE bi."office_id" = ${officeId}::uuid
        AND bi."lifecycle_status" IN ('open', 'hold')
    ),
    listing_scope AS (
      SELECT
        li."id" AS intake_id,
        -- 보관한 건의 의뢰는 건 없는 의뢰처럼 당사자 기준으로 묶는다(원장에서 숨기지 않는다).
        CASE WHEN bc_scope."archived_at" IS NULL
          THEN li."brokerage_case_id" END AS case_id,
        li."received_at" AS received_at,
        people.principal_ids,
        people.primary_contact_id
      FROM "listing_intakes" li
      JOIN LATERAL (
        SELECT
          COALESCE(
            ARRAY_AGG(pc."contact_id" ORDER BY pc."contact_id")
              FILTER (WHERE pc."role" IN (${Prisma.join(OWNER_PRINCIPAL_ROLES)})),
            ARRAY_AGG(pc."contact_id" ORDER BY pc."contact_id")
          ) AS principal_ids,
          (ARRAY_AGG(
            pc."contact_id"
            ORDER BY pc."is_primary" DESC,
                     (pc."role" IN (${Prisma.join(OWNER_PRINCIPAL_ROLES)})) DESC,
                     pc."created_at" ASC,
                     pc."id" ASC
          ))[1] AS primary_contact_id
        FROM (
          -- 같은 사람이 여러 역할로 연결돼 있어도 한 번만 센다.
          SELECT DISTINCT ON (pc_all."contact_id") pc_all.*
          FROM "property_contacts" pc_all
          WHERE pc_all."property_id" = li."property_id"
            AND pc_all."office_id" = ${officeId}::uuid
            AND pc_all."status" = 'active'
          ORDER BY pc_all."contact_id",
                   (pc_all."role" IN (${Prisma.join(OWNER_PRINCIPAL_ROLES)})) DESC,
                   pc_all."is_primary" DESC,
                   pc_all."created_at" ASC
        ) pc
      ) people ON people.principal_ids IS NOT NULL
      LEFT JOIN "brokerage_cases" bc_scope ON bc_scope."id" = li."brokerage_case_id"
      WHERE li."office_id" = ${officeId}::uuid
        AND li."lifecycle_status" IN ('open', 'hold')
    ),
    intake_groups AS (
      SELECT
        'buyer' AS kind,
        scope.intake_id,
        scope.case_id,
        scope.received_at,
        scope.primary_contact_id,
        COALESCE(
          scope.case_id,
          OVERLAY(OVERLAY(
            MD5(ARRAY_TO_STRING(scope.principal_ids, ','))
            PLACING '4' FROM 13) PLACING '8' FROM 17)::uuid
        ) AS group_id
      FROM buyer_scope scope
      UNION ALL
      SELECT
        'listing' AS kind,
        scope.intake_id,
        scope.case_id,
        scope.received_at,
        scope.primary_contact_id,
        COALESCE(
          scope.case_id,
          OVERLAY(OVERLAY(
            MD5(ARRAY_TO_STRING(scope.principal_ids, ','))
            PLACING '4' FROM 13) PLACING '8' FROM 17)::uuid
        ) AS group_id
      FROM listing_scope scope
    ),
    ledger_groups AS (
      SELECT
        ig.group_id,
        (ARRAY_AGG(ig.case_id))[1] AS case_id,
        MIN(ig.received_at) AS created_at,
        (ARRAY_AGG(
          ig.primary_contact_id
          ORDER BY ig.received_at ASC, ig.intake_id ASC
        ))[1] AS primary_contact_id,
        ARRAY_AGG(ig.intake_id ORDER BY ig.received_at ASC, ig.intake_id ASC)
          FILTER (WHERE ig.kind = 'buyer') AS buyer_intake_ids,
        ARRAY_AGG(ig.intake_id ORDER BY ig.received_at ASC, ig.intake_id ASC)
          FILTER (WHERE ig.kind = 'listing') AS listing_intake_ids
      FROM intake_groups ig
      GROUP BY ig.group_id
    )`;
}

@Injectable()
export class BrokerageCasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findLedger(officeId: string, query: BrokerageCaseLedgerQuery = {}) {
    this.assertLedgerQuery(query);
    const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));
    const mode = query.mode ?? "all";
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder: BrokerageCaseLedgerSortOrder =
      query.sortOrder === "asc" ? "asc" : "desc";
    const sqlSortOrder = sortOrder === "asc" ? "ASC" : "DESC";
    const cursor = query.cursor
      ? decodeBrokerageCaseLedgerCursor(query.cursor, sortBy, sortOrder)
      : null;
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
          AND (${Prisma.join(regionConditions, " OR ")})
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
    if (query.listingPriceMin !== undefined) {
      listingConditions.push(Prisma.sql`
        CASE WHEN l."transaction_type" = 'monthly'
          THEN l."deposit" ELSE l."price" END >= ${query.listingPriceMin}
      `);
    }
    if (query.listingPriceMax !== undefined) {
      listingConditions.push(Prisma.sql`
        CASE WHEN l."transaction_type" = 'monthly'
          THEN l."deposit" ELSE l."price" END <= ${query.listingPriceMax}
      `);
    }


    const groupConditions: Prisma.Sql[] = [];
    // 요건 존재 여부는 buyer_totals/listing_totals LATERAL이 이미 계산하므로
    // 별도 EXISTS로 CTE를 다시 스캔하지 않는다.
    if (mode === "demand") {
      groupConditions.push(Prisma.sql`buyer_totals.intent_count > 0`);
    } else if (mode === "listing") {
      groupConditions.push(Prisma.sql`listing_totals.intent_count > 0`);
      if (buyerFiltersActive) {
        groupConditions.push(Prisma.sql`buyer_totals.intent_count > 0`);
      }
    } else if (mode === "both") {
      groupConditions.push(
        Prisma.sql`buyer_totals.intent_count > 0`,
        Prisma.sql`listing_totals.intent_count > 0`,
      );
    } else if (buyerFiltersActive) {
      // 구매고객 필터가 켜진 순간부터 고객원장은 "조건에 맞는 구함이 있는 고객"이다.
      // 따라서 매물 의뢰만 있는 줄은 결과에서 제외한다.
      groupConditions.push(Prisma.sql`buyer_totals.intent_count > 0`);
    } else {
      groupConditions.push(
        Prisma.sql`(buyer_totals.intent_count > 0 OR listing_totals.intent_count > 0)`,
      );
    }

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const phonePattern = `%${search.replace(/\D/g, "")}%`;
      groupConditions.push(Prisma.sql`(
        bc."title" ILIKE ${pattern}
        OR EXISTS (
          SELECT 1
          FROM group_contacts gc_search
          JOIN "contacts" c_search ON c_search."id" = gc_search.contact_id
          LEFT JOIN "contact_phones" cp_search ON cp_search."contact_id" = c_search."id"
          WHERE gc_search.group_id = lg.group_id
            AND (
              c_search."name" ILIKE ${pattern}
              OR (${phonePattern} <> '%%' AND cp_search."phone" LIKE ${phonePattern})
            )
        )
        OR EXISTS (
          SELECT 1
          FROM listing_matches lm_search
          WHERE lm_search.group_id = lg.group_id
            AND lm_search.context_text ILIKE ${pattern}
        )
        OR EXISTS (
          SELECT 1
          FROM buyer_matches bm_search
          WHERE bm_search.group_id = lg.group_id
            AND bm_search.context_text ILIKE ${pattern}
        )
      )`);
    }

    const sortExpressions: Record<BrokerageCaseLedgerSortField, Prisma.Sql> = {
      customer: Prisma.sql`eligible.customer_name`,
      intentCount: Prisma.sql`eligible.intent_count`,
      budgetMin: Prisma.sql`COALESCE(eligible.budget_min, eligible.listing_price)`,
      budgetMax: Prisma.sql`COALESCE(eligible.budget_max, eligible.listing_price)`,
      monthlyRentMin: Prisma.sql`eligible.monthly_rent_min`,
      monthlyRentMax: Prisma.sql`eligible.monthly_rent_max`,
      areaMin: Prisma.sql`eligible.area_min`,
      areaMax: Prisma.sql`eligible.area_max`,
      matchCount: Prisma.sql`eligible.match_count`,
      createdAt: Prisma.sql`eligible.created_at`,
    };
    const orderExpression = sortExpressions[sortBy];
    const cursorCondition = cursor
      ? buildBrokerageCaseLedgerCursorCondition({ cursor, orderExpression })
      : null;
    const tieBreakerOrder =
      sortBy === "createdAt"
        ? Prisma.sql`eligible.id ASC`
        : Prisma.sql`eligible.customer_name ASC NULLS LAST, eligible.id ASC`;
    const totalExpression = cursor
      ? Prisma.sql`NULL::bigint`
      : Prisma.sql`COUNT(*) OVER()`;

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
    // 이름·전화 검색에서만 쓰는 묶음별 관련 연락처. 당사자가 아닌 대리인도 포함한다.
    const groupContactsCte = search
      ? Prisma.sql`,
      group_contacts AS (
        SELECT ig.group_id, bic."contact_id" AS contact_id
        FROM intake_groups ig
        JOIN "buyer_intake_contacts" bic ON bic."buyer_intake_id" = ig.intake_id
        WHERE ig.kind = 'buyer'
        UNION
        SELECT ig.group_id, pc."contact_id" AS contact_id
        FROM intake_groups ig
        JOIN "listing_intakes" li_gc ON li_gc."id" = ig.intake_id
        JOIN "property_contacts" pc
          ON pc."property_id" = li_gc."property_id"
         AND pc."office_id" = ${officeId}::uuid
         AND pc."status" = 'active'
        WHERE ig.kind = 'listing'
      )`
      : Prisma.sql``;

    const idRows = await this.prisma.$queryRaw<GroupIdRow[]>(Prisma.sql`
      WITH ${ledgerGroupCtes(officeId)},
      buyer_matches AS (
        SELECT
          ig.group_id AS group_id,
          ig.received_at AS intake_received_at,
          ig.intake_id AS intake_id,
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
        FROM intake_groups ig
        JOIN "buyer_intakes" bi ON bi."id" = ig.intake_id
        JOIN "buyer_requirements" br ON br."buyer_intake_id" = bi."id"
        WHERE ig.kind = 'buyer'
          AND ${Prisma.join(buyerConditions, " AND ")}
      ),
      listing_matches AS (
        SELECT
          ig.group_id AS group_id,
          ig.received_at AS intake_received_at,
          ig.intake_id AS intake_id,
          l."id" AS intent_id,
          1 AS intent_rank,
          CASE WHEN l."transaction_type" = 'monthly'
            THEN l."deposit" ELSE l."price" END AS listing_price,
          l."monthly_rent" AS monthly_rent,
          COALESCE(u."supply_area_m2", sut."supply_area_m2") AS area,
          (SELECT COUNT(*)::int FROM "matches" m WHERE m."listing_id" = l."id") AS match_count,
          ${listingContextText} AS context_text
        FROM intake_groups ig
        JOIN "listing_intakes" li ON li."id" = ig.intake_id
        JOIN "listings" l ON l."intake_id" = li."id"
        JOIN "properties" ppty ON ppty."id" = li."property_id"
        JOIN "sites" s ON s."id" = ppty."site_id"
        LEFT JOIN "units" u ON u."id" = ppty."unit_id"
        LEFT JOIN "dongs" d ON d."id" = u."dong_id"
        LEFT JOIN "site_unit_types" sut ON sut."id" = u."site_unit_type_id"
        LEFT JOIN "wards" w ON w."code" = s."ward_code"
        WHERE ig.kind = 'listing'
          AND ${Prisma.join(listingConditions, " AND ")}
      )${groupContactsCte},
      eligible AS (
        SELECT
          lg.group_id AS "id",
          lg.case_id,
          lg.primary_contact_id,
          lg.buyer_intake_ids,
          lg.listing_intake_ids,
          -- 줄의 등록일은 담긴 의뢰 중 가장 먼저 접수된 날이다. 건으로 묶거나 풀어도
          -- 바뀌지 않아 줄이 목록에서 자리를 옮기지 않는다.
          lg.created_at AS created_at,
          primary_contact."name" AS customer_name,
          buyer_rep.budget_min,
          buyer_rep.budget_max,
          COALESCE(buyer_rep.monthly_rent_min, listing_rep.monthly_rent) AS monthly_rent_min,
          COALESCE(buyer_rep.monthly_rent_max, listing_rep.monthly_rent) AS monthly_rent_max,
          COALESCE(buyer_rep.area_min, listing_rep.area) AS area_min,
          COALESCE(buyer_rep.area_max, listing_rep.area) AS area_max,
          listing_rep.listing_price,
          buyer_totals.intent_ids AS buyer_requirement_ids,
          COALESCE(buyer_totals.intent_count, 0) + COALESCE(listing_totals.intent_count, 0) AS intent_count,
          COALESCE(buyer_totals.match_count, 0) + COALESCE(listing_totals.match_count, 0) AS match_count
        FROM ledger_groups lg
        LEFT JOIN "brokerage_cases" bc ON bc."id" = lg.case_id
        LEFT JOIN "contacts" primary_contact ON primary_contact."id" = lg.primary_contact_id
        LEFT JOIN LATERAL (
          SELECT bm.*
          FROM buyer_matches bm
          WHERE bm.group_id = lg.group_id
          ORDER BY bm.intake_received_at ASC, bm.intake_id ASC, bm.intent_rank ASC, bm.intent_id ASC
          LIMIT 1
        ) buyer_rep ON true
        LEFT JOIN LATERAL (
          SELECT lm.*
          FROM listing_matches lm
          WHERE lm.group_id = lg.group_id
          ORDER BY lm.intake_received_at ASC, lm.intake_id ASC, lm.intent_rank ASC, lm.intent_id ASC
          LIMIT 1
        ) listing_rep ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS intent_count,
                 COALESCE(SUM(bm.match_count), 0)::int AS match_count,
                 ARRAY_AGG(
                   bm.intent_id
                   ORDER BY bm.intake_received_at ASC, bm.intake_id ASC, bm.intent_rank ASC, bm.intent_id ASC
                 ) AS intent_ids
          FROM buyer_matches bm
          WHERE bm.group_id = lg.group_id
        ) buyer_totals ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS intent_count,
                 COALESCE(SUM(lm.match_count), 0)::int AS match_count
          FROM listing_matches lm
          WHERE lm.group_id = lg.group_id
        ) listing_totals ON true
        WHERE ${Prisma.join(groupConditions, " AND ")}
      )
      SELECT
        eligible."id",
        eligible.case_id AS "caseId",
        eligible.primary_contact_id AS "primaryContactId",
        eligible.created_at AS "createdAt",
        eligible.buyer_intake_ids AS "buyerIntakeIds",
        eligible.listing_intake_ids AS "listingIntakeIds",
        eligible.buyer_requirement_ids AS "buyerRequirementIds",
        ${orderExpression} AS "sortValue",
        eligible.customer_name AS "customerName",
        ${totalExpression} AS total
      FROM eligible
      ${cursorCondition ? Prisma.sql`WHERE ${cursorCondition}` : Prisma.sql``}
      ORDER BY ${orderExpression} ${Prisma.raw(sqlSortOrder)} NULLS LAST,
               ${tieBreakerOrder}
      LIMIT ${limit + 1}
    `);

    const hasNextPage = idRows.length > limit;
    const pageRows = hasNextPage ? idRows.slice(0, limit) : idRows;
    const groups = await this.loadLedgerGroups(officeId, pageRows);
    const items = groups.map((group, index) =>
      this.present(
        group,
        visibleRequirementStatuses,
        buyerFiltersActive
          ? new Set(pageRows[index]?.buyerRequirementIds ?? [])
          : undefined,
      ),
    );
    const total = cursor?.total ?? Number(pageRows[0]?.total ?? 0);
    const lastRow = hasNextPage ? pageRows.at(-1) : undefined;
    const nextCursor = lastRow
      ? encodeBrokerageCaseLedgerCursor({
          sortBy,
          sortOrder,
          row: lastRow,
          total,
        })
      : null;
    const summary = cursor ? null : await this.getSummary(officeId);

    return {
      items,
      pagination: {
        limit,
        total,
        nextCursor,
      },
      summary,
    };
  }

  /** 이 쪽에 나올 묶음들의 의뢰·건·최근 상담을 한꺼번에 읽어 줄 순서대로 맞춘다. */
  private async loadLedgerGroups(
    officeId: string,
    rows: GroupIdRow[],
  ): Promise<LedgerGroup[]> {
    if (rows.length === 0) return [];
    const buyerIntakeIds = rows.flatMap((row) => row.buyerIntakeIds ?? []);
    const listingIntakeIds = rows.flatMap((row) => row.listingIntakeIds ?? []);
    const caseIds = rows.flatMap((row) => (row.caseId ? [row.caseId] : []));
    const primaryContactIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.primaryContactId ? [row.primaryContactId] : [],
        ),
      ),
    ];

    const [buyerIntakes, listingIntakes, cases, consultations] =
      await Promise.all([
        buyerIntakeIds.length
          ? this.prisma.buyerIntake.findMany({
              where: { officeId, id: { in: buyerIntakeIds } },
              include: ledgerBuyerIntakeInclude,
            })
          : [],
        listingIntakeIds.length
          ? this.prisma.listingIntake.findMany({
              where: { officeId, id: { in: listingIntakeIds } },
              include: ledgerListingIntakeInclude,
            })
          : [],
        caseIds.length
          ? this.prisma.brokerageCase.findMany({
              where: { officeId, id: { in: caseIds } },
              select: {
                id: true,
                title: true,
                memo: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { steps: true } },
              },
            })
          : [],
        // 대표 연락 고객마다 가장 최근 상담 하나.
        primaryContactIds.length
          ? this.prisma.consultation.findMany({
              where: { officeId, contactId: { in: primaryContactIds } },
              orderBy: [
                { contactId: "asc" },
                { createdAt: "desc" },
                { id: "desc" },
              ],
              distinct: ["contactId"],
              select: {
                id: true,
                contactId: true,
                type: true,
                content: true,
                createdAt: true,
              },
            })
          : [],
      ]);

    const buyerById = new Map(buyerIntakes.map((item) => [item.id, item]));
    const listingById = new Map(listingIntakes.map((item) => [item.id, item]));
    const caseById = new Map(cases.map((item) => [item.id, item]));
    const consultationByContact = new Map(
      consultations.map((item) => [item.contactId, item]),
    );

    return rows.map((row) => {
      const consultation = row.primaryContactId
        ? consultationByContact.get(row.primaryContactId)
        : undefined;
      return {
        id: row.id,
        brokerageCase: row.caseId ? (caseById.get(row.caseId) ?? null) : null,
        primaryContactId: row.primaryContactId,
        createdAt: row.createdAt,
        buyerIntakes: (row.buyerIntakeIds ?? []).flatMap((id) => {
          const intake = buyerById.get(id);
          return intake ? [intake] : [];
        }),
        listingIntakes: (row.listingIntakeIds ?? []).flatMap((id) => {
          const intake = listingById.get(id);
          return intake ? [intake] : [];
        }),
        latestConsultation: consultation
          ? {
              id: consultation.id,
              type: consultation.type,
              content: consultation.content,
              createdAt: consultation.createdAt,
            }
          : null,
      };
    });
  }

  /**
   * 묶음의 관련 연락처. 구매 의뢰의 참여자와 매물 의뢰 부동산의 활성 관련인을
   * 사람 기준으로 합친다. 대표 연락 고객이 맨 앞, 그다음 실제 당사자 순이다.
   */
  private collectParticipants(group: LedgerGroup) {
    const byContact = new Map<string, LedgerParticipant>();
    const add = (
      contact: {
        id: string;
        name: string;
        email: string | null;
        phones: Array<{ phone: string; isPrimary: boolean }>;
      },
      role: string,
      isPrincipal: boolean,
    ) => {
      const current = byContact.get(contact.id);
      if (current) {
        if (!current.roles.includes(role)) current.roles.push(role);
        current.isPrincipal = current.isPrincipal || isPrincipal;
        return;
      }
      byContact.set(contact.id, {
        contactId: contact.id,
        roles: [role],
        isPrincipal,
        contact: {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          phone:
            contact.phones.find((phone) => phone.isPrimary)?.phone ??
            contact.phones[0]?.phone ??
            null,
        },
      });
    };

    for (const intake of group.buyerIntakes) {
      const hasBuyer = intake.contacts.some((item) =>
        BUYER_PRINCIPAL_ROLES.includes(item.role),
      );
      for (const item of intake.contacts) {
        add(
          item.contact,
          item.role,
          !hasBuyer || BUYER_PRINCIPAL_ROLES.includes(item.role),
        );
      }
    }
    for (const intake of group.listingIntakes) {
      const propertyContacts = intake.property.propertyContacts;
      const hasOwner = propertyContacts.some((item) =>
        OWNER_PRINCIPAL_ROLES.includes(item.role),
      );
      for (const item of propertyContacts) {
        add(
          item.contact,
          item.role === "owner"
            ? "seller"
            : item.role === "co_owner"
              ? "co_seller"
              : item.role,
          !hasOwner || OWNER_PRINCIPAL_ROLES.includes(item.role),
        );
      }
    }

    return [...byContact.values()]
      .map((participant, index) => ({
        participant,
        index,
        isCommunicationPrimary:
          participant.contactId === group.primaryContactId,
      }))
      .sort(
        (left, right) =>
          Number(right.isCommunicationPrimary) -
            Number(left.isCommunicationPrimary) ||
          Number(right.participant.isPrincipal) -
            Number(left.participant.isPrincipal) ||
          left.index - right.index,
      )
      .map(({ participant, isCommunicationPrimary }) => ({
        // 저장된 행이 없으므로 연락처 id가 곧 이 줄 안에서의 식별자다.
        id: participant.contactId,
        contactId: participant.contactId,
        roles: participant.roles,
        isPrincipal: participant.isPrincipal,
        isCommunicationPrimary,
        memo: null,
        contact: participant.contact,
      }));
  }

  private present(
    group: LedgerGroup,
    visibleRequirementStatuses = new Set<string>(
      ACTIVE_BUYER_REQUIREMENT_STATUSES,
    ),
    visibleRequirementIds?: ReadonlySet<string>,
  ) {
    const participants = this.collectParticipants(group);
    // 묶음 안에서 의뢰가 접수된 순서 (구매·매물을 합쳐 1부터).
    const intakeOrder = new Map(
      [
        ...group.buyerIntakes.map((intake) => ({
          id: intake.id,
          receivedAt: intake.receivedAt,
        })),
        ...group.listingIntakes.map((intake) => ({
          id: intake.id,
          receivedAt: intake.receivedAt,
        })),
      ]
        .sort(
          (left, right) =>
            left.receivedAt.getTime() - right.receivedAt.getTime() ||
            left.id.localeCompare(right.id),
        )
        .map((intake, index) => [intake.id, index + 1] as const),
    );

    const demandIntents = group.buyerIntakes.flatMap((intake) =>
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
            preferredSites.map((site) => site.name).join("·"),
            preferredRegions
              .map(
                (region) =>
                  region.wardName ?? region.districtName ?? region.provinceName,
              )
              .filter(Boolean)
              .join("·"),
          ].filter(Boolean);
          return {
            kind: "demand" as const,
            buyerIntakeId: intake.id,
            intakePriorityRank: intakeOrder.get(intake.id) ?? 1,
            intakeRequirementCount: intake.requirements.length,
            lifecycleStatus: intake.lifecycleStatus,
            receivedAt: intake.receivedAt,
            requirementId: requirement.id,
            priorityRank: requirement.priorityRank,
            status: requirement.status,
            urgency: requirement.urgency,
            transactionType: requirement.transactionType,
            budgetMin:
              requirement.transactionType === "monthly"
                ? requirement.depositMin
                : requirement.priceMin,
            budgetMax:
              requirement.transactionType === "monthly"
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
            contextLabel: contextParts.join(" · ") || "선호 지역 미등록",
          };
        }),
    );

    const listingIntents = group.listingIntakes.flatMap((intake) => {
      const property = intake.property;
      const unit = property.unit;
      const area = toNumber(
        unit?.supplyAreaM2 ?? unit?.siteUnitType?.supplyAreaM2,
      );
      const locationParts = [
        property.site.name,
        unit?.dong && !unit.dong.isPlaceholder
          ? unit.dong.name.endsWith("동")
            ? unit.dong.name
            : `${unit.dong.name}동`
          : null,
        unit?.name ?? null,
      ].filter(Boolean);
      return intake.listings.map((listing) => ({
        kind: "listing" as const,
        listingIntakeId: intake.id,
        intakeUpdatedAt: intake.updatedAt,
        intakeMemo: intake.memo,
        intakePriorityRank: intakeOrder.get(intake.id) ?? 1,
        lifecycleStatus: intake.lifecycleStatus,
        receivedAt: intake.receivedAt,
        listingId: listing.id,
        listingUpdatedAt: listing.updatedAt,
        transactionType: listing.transactionType,
        askingPrice:
          listing.transactionType === "monthly"
            ? listing.deposit
            : listing.price,
        price: listing.price,
        deposit: listing.deposit,
        monthlyRent: listing.monthlyRent,
        moveInAvailableType: listing.moveInAvailableType,
        moveInAvailableFrom: listing.moveInAvailableFrom,
        moveInAvailableTo: listing.moveInAvailableTo,
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
        contextLabel: locationParts.join(" "),
        memo: listing.memo ?? intake.memo,
      }));
    });

    const updatedAt = [
      ...group.buyerIntakes.map((intake) => intake.updatedAt),
      ...group.listingIntakes.map((intake) => intake.updatedAt),
      ...(group.brokerageCase ? [group.brokerageCase.updatedAt] : []),
    ].reduce(
      (latest, value) => (value.getTime() > latest.getTime() ? value : latest),
      group.createdAt,
    );

    return {
      // 묶음 id. 중개 건이 있으면 건 id, 없으면 당사자 조합에서 계산한 값이다.
      id: group.id,
      /** 사용자가 중개 건으로 묶었을 때만 있다. */
      brokerageCaseId: group.brokerageCase?.id ?? null,
      title: group.brokerageCase?.title ?? null,
      memo: group.brokerageCase?.memo ?? null,
      archivedAt: null,
      createdAt: group.createdAt,
      updatedAt,
      stepCount: group.brokerageCase?._count.steps ?? 0,
      participants,
      primaryParticipant: participants[0] ?? null,
      latestConsultation: group.latestConsultation,
      demandIntents,
      listingIntents,
      // 필터와 상관없이 이 줄의 진행 중 의뢰 전부. 건으로 묶을 때 쓴다.
      listingIntakeIds: group.listingIntakes.map((intake) => intake.id),
      buyerIntakeIds: group.buyerIntakes.map((intake) => intake.id),
      intentCount: demandIntents.length + listingIntents.length,
      mode:
        demandIntents.length && listingIntents.length
          ? ("both" as const)
          : demandIntents.length
            ? ("demand" as const)
            : ("listing" as const),
    };
  }

  private async getSummary(officeId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ cases: bigint; demand: bigint; listing: bigint; both: bigint }>
    >(Prisma.sql`
      WITH ${ledgerGroupCtes(officeId)},
      group_flags AS (
        SELECT
          ig.group_id,
          BOOL_OR(ig.kind = 'buyer' AND EXISTS (
            SELECT 1 FROM "buyer_requirements" br
            WHERE br."buyer_intake_id" = ig.intake_id
              AND br."status" IN (${Prisma.join([...ACTIVE_BUYER_REQUIREMENT_STATUSES])})
          )) AS has_demand,
          BOOL_OR(ig.kind = 'listing' AND EXISTS (
            SELECT 1 FROM "listings" l
            WHERE l."intake_id" = ig.intake_id
              AND l."is_paused" = false
          )) AS has_listing
        FROM intake_groups ig
        GROUP BY ig.group_id
      )
      SELECT
        COUNT(*) FILTER (WHERE has_demand OR has_listing) AS cases,
        COUNT(*) FILTER (WHERE has_demand) AS demand,
        COUNT(*) FILTER (WHERE has_listing) AS listing,
        COUNT(*) FILTER (WHERE has_demand AND has_listing) AS "both"
      FROM group_flags
    `);
    const row = rows[0];
    return {
      cases: Number(row?.cases ?? 0),
      demand: Number(row?.demand ?? 0),
      listing: Number(row?.listing ?? 0),
      both: Number(row?.both ?? 0),
    };
  }


  private assertLedgerQuery(query: BrokerageCaseLedgerQuery) {
    if (query.mode && !CASE_MODES.has(query.mode)) {
      throw new BadRequestException("유효하지 않은 고객 원장 보기 방식입니다.");
    }
    if (query.sortBy && !CASE_SORT_FIELDS.has(query.sortBy)) {
      throw new BadRequestException("유효하지 않은 고객 원장 정렬 필드입니다.");
    }
    if (query.sortOrder && !["asc", "desc"].includes(query.sortOrder)) {
      throw new BadRequestException("유효하지 않은 정렬 방향입니다.");
    }
    if (
      parseCsvValues(query.status).some(
        (status) => !BUYER_REQUIREMENT_STATUSES.has(status),
      )
    ) {
      throw new BadRequestException("유효하지 않은 구매 요건 상태입니다.");
    }
    if (
      parseCsvValues(query.urgency).some(
        (urgency) => !BUYER_URGENCIES.has(urgency),
      )
    ) {
      throw new BadRequestException("유효하지 않은 긴급도입니다.");
    }
    if (
      parseCsvValues(query.transactionType).some(
        (transactionType) => !TRANSACTION_TYPES.has(transactionType),
      )
    ) {
      throw new BadRequestException("유효하지 않은 거래 유형입니다.");
    }
    for (const [field, value] of Object.entries(query)) {
      if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
        throw new BadRequestException(`${field} 값이 올바르지 않습니다.`);
      }
    }
    for (const field of [
      "nextContactAfter",
      "nextContactBefore",
      "moveInAfter",
      "moveInBefore",
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
