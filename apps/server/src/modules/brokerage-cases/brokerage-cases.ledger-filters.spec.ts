import {
  BrokerageCasesService,
  hasBuyerRequirementLedgerFilters,
  type BrokerageCaseLedgerQuery,
} from "./brokerage-cases.service";

const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const CASE_ID = "00000000-0000-4000-8000-000000000002";
const MATCHING_REQUIREMENT_ID = "00000000-0000-4000-8000-000000000003";
const OTHER_REQUIREMENT_ID = "00000000-0000-4000-8000-000000000004";
const CURSOR_CASE_IDS = [
  "00000000-0000-4000-8000-000000000010",
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
] as const;

/**
 * $queryRaw는 묶음 id 조회와 요약 집계에 함께 쓰인다. 요약은 숫자 칸이 없는 행을
 * 받으면 0으로 읽으므로 같은 행을 돌려줘도 된다.
 */
function createPrismaMock(
  idRows: unknown[] = [],
  related: {
    buyerIntakes?: unknown[];
    listingIntakes?: unknown[];
    cases?: unknown[];
    consultations?: unknown[];
  } = {},
) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(idRows),
    buyerIntake: {
      findMany: jest.fn().mockResolvedValue(related.buyerIntakes ?? []),
    },
    listingIntake: {
      findMany: jest.fn().mockResolvedValue(related.listingIntakes ?? []),
    },
    brokerageCase: {
      findMany: jest.fn().mockResolvedValue(related.cases ?? []),
    },
    consultation: {
      findMany: jest.fn().mockResolvedValue(related.consultations ?? []),
    },
  };
}

/** 묶음 id 조회가 돌려주는 한 줄. */
function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CASE_ID,
    caseId: null,
    primaryContactId: null,
    createdAt: new Date("2026-08-08T10:00:00.000Z"),
    buyerIntakeIds: null,
    listingIntakeIds: null,
    buyerRequirementIds: null,
    total: 1n,
    ...overrides,
  };
}

function renderSql(value: unknown): string {
  if (
    !value ||
    typeof value !== "object" ||
    !("strings" in value) ||
    !Array.isArray(value.strings)
  ) {
    return "?";
  }

  const sql = value as { strings: readonly string[]; values?: unknown[] };
  return sql.strings
    .map((part, index) => `${part}${renderSql(sql.values?.[index])}`)
    .join("");
}

describe("BrokerageCasesService buyer ledger filters", () => {
  it("등록일 내림차순을 고객원장의 기본 정렬로 사용한다", async () => {
    const prisma = createPrismaMock();
    const service = new BrokerageCasesService(prisma as never);

    await service.findLedger(OFFICE_ID);

    const queryText = renderSql(prisma.$queryRaw.mock.calls[0][0]);
    // 등록일은 건이 아니라 담긴 의뢰의 가장 이른 접수일이다(묶거나 풀어도 자리가 안 바뀐다).
    expect(queryText).toContain("MIN(ig.received_at) AS created_at");
    expect(queryText).toContain("lg.created_at AS created_at");
    expect(queryText).toContain("eligible.created_at DESC");
    expect(queryText).not.toContain("eligible.updated_at");
    expect(queryText).not.toContain("OFFSET");
  });

  it("중개 건 없이도 당사자 조합이 같은 의뢰를 한 줄로 묶는다", async () => {
    const prisma = createPrismaMock();
    const service = new BrokerageCasesService(prisma as never);

    await service.findLedger(OFFICE_ID);

    const queryText = renderSql(prisma.$queryRaw.mock.calls[0][0]);
    // 묶음 id: 건에 담긴 의뢰는 건 id, 아니면 실제 당사자 조합에서 계산한다.
    expect(queryText).toContain("COALESCE(\n          scope.case_id,");
    expect(queryText).toContain("MD5(ARRAY_TO_STRING(scope.principal_ids, ','))");
    // 당사자는 저장된 건 참여자가 아니라 의뢰에서 읽는다.
    expect(queryText).toContain('"buyer_intake_contacts"');
    expect(queryText).toContain('"property_contacts"');
    expect(queryText).not.toContain("brokerage_case_participants");
    expect(queryText).not.toContain("case_priority_rank");
    // 보관한 건의 의뢰를 원장에서 숨기지 않는다. 건 없는 의뢰처럼 당사자 기준으로 묶인다.
    expect(queryText).toContain('CASE WHEN bc_scope."archived_at" IS NULL');
    expect(queryText).not.toContain(
      '"brokerage_case_id" IS NULL OR bc_scope."archived_at" IS NULL',
    );
  });

  it("대표 연락 고객의 최근 상담을 원장 응답에 함께 싣는다", async () => {
    const primaryConsultation = {
      id: "consultation-primary",
      type: "phone",
      content: "가격 조정 내용을 확인했습니다.",
      createdAt: new Date("2026-08-10T09:30:00.000Z"),
    };
    const contact = (id: string) => ({
      id,
      name: id,
      email: null,
      phones: [],
    });
    const buyerIntake = {
      id: "buyer-intake-1",
      lifecycleStatus: "open",
      receivedAt: new Date("2026-08-08T10:00:00.000Z"),
      updatedAt: new Date("2026-08-08T10:00:00.000Z"),
      // 조회 순서와 무관하게 대표 연락 고객(primaryContactId)이 맨 앞에 온다.
      contacts: [
        { role: "co_buyer", isPrimary: false, contact: contact("secondary") },
        { role: "buyer", isPrimary: true, contact: contact("primary") },
        { role: "advisor", isPrimary: false, contact: contact("advisor") },
      ],
      requirements: [],
    };
    const prisma = createPrismaMock(
      [
        groupRow({
          primaryContactId: "primary",
          buyerIntakeIds: ["buyer-intake-1"],
        }),
      ],
      {
        buyerIntakes: [buyerIntake],
        consultations: [{ ...primaryConsultation, contactId: "primary" }],
      },
    );
    const service = new BrokerageCasesService(prisma as never);

    const result = await service.findLedger(OFFICE_ID);

    expect(result.items[0].latestConsultation).toEqual(primaryConsultation);
    expect(result.items[0].brokerageCaseId).toBeNull();
    expect(
      result.items[0].participants.map((item) => [
        item.contact.id,
        item.isCommunicationPrimary,
        item.isPrincipal,
      ]),
    ).toEqual([
      ["primary", true, true],
      ["secondary", false, true],
      ["advisor", false, false],
    ]);
    expect(result.items[0].primaryParticipant?.contact.id).toBe("primary");
    expect(prisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { officeId: OFFICE_ID, contactId: { in: ["primary"] } },
        distinct: ["contactId"],
      }),
    );
  });

  it("opaque cursor로 다음 묶음을 조회하고 반복 전체 집계를 생략한다", async () => {
    const firstRows = CURSOR_CASE_IDS.slice(0, 3).map((id, index) =>
      groupRow({
        id,
        sortValue: new Date(`2026-08-0${8 - index}T10:00:00.000Z`),
        customerName: `고객 ${index + 1}`,
        total: 4n,
      }),
    );
    const prisma = createPrismaMock(firstRows);
    const service = new BrokerageCasesService(prisma as never);

    const firstPage = await service.findLedger(OFFICE_ID, { limit: 2 });

    expect(firstPage.pagination).toMatchObject({
      limit: 2,
      total: 4,
      nextCursor: expect.any(String),
    });
    expect(firstPage.summary).toEqual({
      cases: 0,
      demand: 0,
      listing: 0,
      both: 0,
    });
    // 첫 쪽은 묶음 조회와 요약 집계, 두 번 조회한다.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(renderSql(prisma.$queryRaw.mock.calls[1][0])).toContain(
      "FROM group_flags",
    );

    prisma.$queryRaw.mockClear();
    prisma.$queryRaw.mockResolvedValueOnce([
      groupRow({
        id: CURSOR_CASE_IDS[3],
        sortValue: new Date("2026-08-05T10:00:00.000Z"),
        customerName: "고객 4",
        total: null,
      }),
    ]);

    const secondPage = await service.findLedger(OFFICE_ID, {
      limit: 2,
      cursor: firstPage.pagination.nextCursor!,
    });

    expect(secondPage.pagination).toEqual({
      limit: 2,
      total: 4,
      nextCursor: null,
    });
    expect(secondPage.summary).toBeNull();
    // 다음 쪽에서는 요약 집계를 다시 하지 않는다.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    const queryText = renderSql(prisma.$queryRaw.mock.calls[0][0]);
    expect(queryText).toContain("eligible.created_at <");
    expect(queryText).toContain("eligible.id >");
    expect(queryText).not.toContain("eligible.customer_name >");
    expect(queryText).toContain("NULL::bigint");
    expect(queryText).not.toContain("COUNT(*) OVER()");
    expect(queryText).not.toContain("OFFSET");
  });

  it("NULL 정렬값 뒤에서도 고객명과 ID cursor 경계를 유지한다", async () => {
    const prisma = createPrismaMock([
      {
        id: CURSOR_CASE_IDS[0],
        buyerRequirementIds: null,
        sortValue: null,
        customerName: "가 고객",
        total: 2n,
      },
      {
        id: CURSOR_CASE_IDS[1],
        buyerRequirementIds: null,
        sortValue: null,
        customerName: "나 고객",
        total: 2n,
      },
    ]);
    const service = new BrokerageCasesService(prisma as never);
    const firstPage = await service.findLedger(OFFICE_ID, {
      sortBy: "budgetMin",
      sortOrder: "asc",
      limit: 1,
    });

    prisma.$queryRaw.mockResolvedValueOnce([]);
    await service.findLedger(OFFICE_ID, {
      sortBy: "budgetMin",
      sortOrder: "asc",
      limit: 1,
      cursor: firstPage.pagination.nextCursor!,
    });

    // 첫 쪽이 묶음 조회와 요약 집계를 했으므로 다음 쪽 조회는 세 번째 호출이다.
    const queryText = renderSql(prisma.$queryRaw.mock.calls[2][0]);
    expect(queryText).toContain(
      "COALESCE(eligible.budget_min, eligible.listing_price) IS NULL",
    );
    expect(queryText).toContain("eligible.customer_name >");
    expect(queryText).not.toContain("OFFSET");
  });

  it("손상되었거나 다른 정렬에 속한 cursor를 거부한다", async () => {
    const prisma = createPrismaMock([
      {
        id: CURSOR_CASE_IDS[0],
        buyerRequirementIds: null,
        sortValue: new Date("2026-08-08T10:00:00.000Z"),
        customerName: "고객 1",
        total: 2n,
      },
      {
        id: CURSOR_CASE_IDS[1],
        buyerRequirementIds: null,
        sortValue: new Date("2026-08-07T10:00:00.000Z"),
        customerName: "고객 2",
        total: 2n,
      },
    ]);
    const service = new BrokerageCasesService(prisma as never);

    await expect(
      service.findLedger(OFFICE_ID, { cursor: "not-a-cursor" }),
    ).rejects.toThrow("유효하지 않은 고객 원장 cursor입니다.");

    const firstPage = await service.findLedger(OFFICE_ID, { limit: 1 });
    await expect(
      service.findLedger(OFFICE_ID, {
        sortBy: "customer",
        cursor: firstPage.pagination.nextCursor!,
      }),
    ).rejects.toThrow("유효하지 않은 고객 원장 cursor입니다.");
  });

  it("구매고객 필터만 BuyerRequirement 필터 활성화로 판정한다", () => {
    expect(hasBuyerRequirementLedgerFilters({})).toBe(false);
    expect(hasBuyerRequirementLedgerFilters({ status: "   " })).toBe(false);
    expect(
      hasBuyerRequirementLedgerFilters({
        search: "김고객",
        mode: "listing",
        listingPriceMin: 50000,
      }),
    ).toBe(false);

    const buyerFilterQueries: BrokerageCaseLedgerQuery[] = [
      { status: "active" },
      { urgency: "urgent" },
      { transactionType: "sale" },
      { assignedToId: "employee-1" },
      { preferredSiteIds: "site-1" },
      { provinceCodes: "11" },
      { districtCodes: "11740" },
      { wardCodes: "1174010100" },
      { priceMin: 50000 },
      { priceMax: 120000 },
      { depositMin: 10000 },
      { depositMax: 30000 },
      { monthlyRentMin: 100 },
      { monthlyRentMax: 250 },
      { areaMin: 66 },
      { areaMax: 132 },
      { nextContactAfter: "2026-08-10" },
      { nextContactBefore: "2026-08-20" },
      { moveInAfter: "2026-09-01" },
      { moveInBefore: "2026-09-30" },
    ];

    for (const query of buyerFilterQueries) {
      expect(hasBuyerRequirementLedgerFilters(query)).toBe(true);
    }
  });

  it("전체 구매고객 조건을 buyer_matches에 적용하고 내놓음 보기에도 구매요건 존재를 요구한다", async () => {
    const prisma = createPrismaMock();
    const service = new BrokerageCasesService(prisma as never);

    await service.findLedger(OFFICE_ID, {
      mode: "listing",
      status: "active,matched",
      urgency: "urgent,normal",
      transactionType: "sale,monthly",
      assignedToId: "00000000-0000-4000-8000-000000000005",
      preferredSiteIds: "00000000-0000-4000-8000-000000000006",
      provinceCodes: "11",
      districtCodes: "11740",
      wardCodes: "1174010100",
      priceMin: 50000,
      priceMax: 120000,
      depositMin: 10000,
      depositMax: 30000,
      monthlyRentMin: 100,
      monthlyRentMax: 250,
      areaMin: 66,
      areaMax: 132,
      nextContactAfter: "2026-08-10",
      nextContactBefore: "2026-08-20",
      moveInAfter: "2026-09-01",
      moveInBefore: "2026-09-30",
    });

    const sql = prisma.$queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
    };
    const queryText = sql.strings.join("?");

    expect(queryText).toContain('br."status" IN');
    expect(queryText).toContain('br."urgency" IN');
    expect(queryText).toContain('br."transaction_type" IN');
    expect(queryText).toContain('br."assigned_to_id"::text IN');
    expect(queryText).toContain('FROM "buyer_requirement_sites"');
    expect(queryText).toContain('FROM "buyer_requirement_regions"');
    expect(queryText).toContain('br."price_max"');
    expect(queryText).toContain('br."price_min"');
    expect(queryText).toContain('br."deposit_max"');
    expect(queryText).toContain('br."deposit_min"');
    expect(queryText).toContain('br."monthly_rent_max"');
    expect(queryText).toContain('br."monthly_rent_min"');
    expect(queryText).toContain('br."area_max"');
    expect(queryText).toContain('br."area_min"');
    expect(queryText).toContain('br."next_contact_date"');
    expect(queryText).toContain('br."move_in_date"');
    expect(queryText).toContain("listing_totals.intent_count > 0");
    expect(queryText).toContain("buyer_totals.intent_count > 0");
    expect(queryText).toContain(
      'eligible.buyer_requirement_ids AS "buyerRequirementIds"',
    );
  });

  it("구매고객 필터가 없으면 매물 의뢰 전용 케이스를 계속 허용한다", async () => {
    const prisma = createPrismaMock();
    const service = new BrokerageCasesService(prisma as never);

    await service.findLedger(OFFICE_ID, { mode: "listing" });

    const sql = prisma.$queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
    };
    const queryText = sql.strings.join("?");
    expect(queryText).toContain("listing_totals.intent_count > 0");
    expect(queryText).not.toContain("buyer_totals.intent_count > 0");
  });

  it("필터와 일치한 구매요건 행만 남기고 같은 케이스의 매물 의뢰 행은 유지한다", async () => {
    const requirement = (id: string) => ({
      id,
      priorityRank: 1,
      status: "active",
      urgency: "normal",
      transactionType: "sale",
      priceMin: 50000,
      priceMax: 120000,
      depositMin: null,
      depositMax: null,
      monthlyRentMin: null,
      monthlyRentMax: null,
      areaMin: null,
      areaMax: null,
      moveInDate: null,
      lastContactDate: null,
      nextContactDate: null,
      memo: null,
      assignedTo: null,
      preferredSites: [],
      preferredRegions: [],
      _count: { matches: 0 },
    });
    const buyerIntake = {
      id: "buyer-intake-1",
      lifecycleStatus: "open",
      receivedAt: new Date("2026-08-08T10:00:00.000Z"),
      updatedAt: new Date("2026-08-08T10:00:00.000Z"),
      contacts: [],
      requirements: [
        requirement(MATCHING_REQUIREMENT_ID),
        requirement(OTHER_REQUIREMENT_ID),
      ],
    };
    const listingIntake = {
      id: "listing-intake-1",
      lifecycleStatus: "open",
      receivedAt: new Date("2026-08-08T10:30:00.000Z"),
      updatedAt: new Date("2026-08-08T11:00:00.000Z"),
      memo: "의뢰 공유 메모",
      property: {
        id: "property-1",
        site: {
          id: "site-1",
          name: "테스트 단지",
          ward: {
            name: "성내동",
            district: { name: "강동구" },
          },
        },
        unit: null,
        propertyContacts: [],
      },
      listings: [
        {
          id: "listing-1",
          transactionType: "sale",
          price: 90000,
          deposit: null,
          monthlyRent: null,
          moveInAvailableType: "immediate",
          moveInAvailableFrom: null,
          moveInAvailableTo: null,
          isPaused: false,
          memo: "거래 옵션 메모",
          updatedAt: new Date("2026-08-08T12:00:00.000Z"),
          _count: { matches: 0 },
        },
      ],
    };
    const prisma = createPrismaMock(
      [
        groupRow({
          buyerIntakeIds: ["buyer-intake-1"],
          listingIntakeIds: ["listing-intake-1"],
          buyerRequirementIds: [MATCHING_REQUIREMENT_ID],
        }),
      ],
      { buyerIntakes: [buyerIntake], listingIntakes: [listingIntake] },
    );
    const service = new BrokerageCasesService(prisma as never);

    const result = await service.findLedger(OFFICE_ID, { priceMin: 50000 });

    expect(result.items).toHaveLength(1);
    expect(
      result.items[0].demandIntents.map((item) => item.requirementId),
    ).toEqual([MATCHING_REQUIREMENT_ID]);
    expect(result.items[0].demandIntents[0]).toMatchObject({
      priorityRank: 1,
      intakeRequirementCount: 2,
    });
    expect(
      result.items[0].listingIntents.map((item) => item.listingId),
    ).toEqual(["listing-1"]);
    // 묶음 안 순서는 저장된 순위가 아니라 접수 순이다.
    expect(result.items[0].demandIntents[0].intakePriorityRank).toBe(1);
    expect(result.items[0].listingIntents[0].intakePriorityRank).toBe(2);
    expect(result.items[0].mode).toBe("both");
    // 필터에 걸러진 요건이 있어도 묶을 의뢰 목록에는 그 줄의 의뢰가 모두 들어 있다.
    expect(result.items[0].buyerIntakeIds).toEqual(["buyer-intake-1"]);
    expect(result.items[0].listingIntakeIds).toEqual(["listing-intake-1"]);
    expect(result.items[0].listingIntents[0]).toMatchObject({
      intakeMemo: "의뢰 공유 메모",
      memo: "거래 옵션 메모",
      intakeUpdatedAt: new Date("2026-08-08T11:00:00.000Z"),
      listingUpdatedAt: new Date("2026-08-08T12:00:00.000Z"),
      moveInAvailableType: "immediate",
      moveInAvailableFrom: null,
      moveInAvailableTo: null,
    });
  });

  it("listing 보기만 허용하고 이전 supply API 값은 거부한다", async () => {
    const prisma = createPrismaMock();
    const service = new BrokerageCasesService(prisma as never);

    await expect(
      service.findLedger(OFFICE_ID, { mode: "supply" as never }),
    ).rejects.toThrow("유효하지 않은 고객 원장 보기 방식입니다.");
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
