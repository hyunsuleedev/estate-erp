import { BuyerRequirementsService } from "./buyer-requirements.service";

const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const INTAKE_ID = "00000000-0000-4000-8000-000000000002";
const CONTACT_ID = "00000000-0000-4000-8000-000000000003";
const NEW_INTAKE_ID = "00000000-0000-4000-8000-000000000004";

describe("BuyerRequirementsService", () => {
  it("구버전 contactId 등록도 열린 Intake를 재사용하고 다음 우선순위를 부여한다", async () => {
    const participant = {
      id: "participant-1",
      officeId: OFFICE_ID,
      buyerIntakeId: INTAKE_ID,
      contactId: CONTACT_ID,
      role: "buyer",
      isPrimary: true,
      createdAt: new Date("2026-08-07T10:00:00.000Z"),
      updatedAt: new Date("2026-08-07T10:00:00.000Z"),
      contact: {
        id: CONTACT_ID,
        name: "김구매",
        phones: [],
      },
    };
    const intake = {
      id: INTAKE_ID,
      officeId: OFFICE_ID,
      lifecycleStatus: "open",
      receivedAt: new Date("2026-08-07T10:00:00.000Z"),
      memo: null,
      createdAt: new Date("2026-08-07T10:00:00.000Z"),
      updatedAt: new Date("2026-08-07T10:00:00.000Z"),
      contacts: [{ ...participant, contact: undefined }],
    };
    const created = {
      id: "requirement-1",
      officeId: OFFICE_ID,
      buyerIntakeId: INTAKE_ID,
      priorityRank: 3,
      status: "active",
      urgency: "normal",
      transactionType: "sale",
      siteTypes: [],
      priceMin: null,
      priceMax: null,
      depositMin: null,
      depositMax: null,
      monthlyRentMin: null,
      monthlyRentMax: null,
      areaMin: null,
      areaMax: null,
      moveInDate: null,
      assignedToId: null,
      lastContactDate: null,
      nextContactDate: null,
      memo: null,
      createdAt: new Date("2026-08-07T10:00:00.000Z"),
      updatedAt: new Date("2026-08-07T10:00:00.000Z"),
      buyerIntake: { ...intake, contacts: [participant] },
      preferredSites: [],
      preferredRegions: [],
    };
    const tx = {
      contact: { findFirst: jest.fn().mockResolvedValue({ id: CONTACT_ID }) },
      buyerIntake: {
        findFirst: jest.fn().mockResolvedValue(intake),
        create: jest.fn(),
      },
      buyerRequirement: {
        findFirst: jest.fn().mockResolvedValue({ priorityRank: 2 }),
        create: jest.fn().mockResolvedValue(created),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BuyerRequirementsService(prisma as never);

    const result = await service.create(OFFICE_ID, {
      contactId: CONTACT_ID,
      transactionType: "sale",
      siteTypes: [],
    });

    expect(tx.buyerIntake.create).not.toHaveBeenCalled();
    expect(tx.buyerRequirement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buyerIntakeId: INTAKE_ID,
          priorityRank: 3,
        }),
      }),
    );
    expect(result).toMatchObject({
      buyerIntakeId: INTAKE_ID,
      contactId: CONTACT_ID,
      contact: { id: CONTACT_ID, name: "김구매", phone: null },
    });
  });

  it("새 구함 의뢰 등록은 기존 열린 Intake와 분리해 첫 조건을 만든다", async () => {
    const participant = {
      id: "participant-1",
      officeId: OFFICE_ID,
      buyerIntakeId: NEW_INTAKE_ID,
      contactId: CONTACT_ID,
      role: "buyer",
      isPrimary: true,
      createdAt: new Date("2026-08-20T10:00:00.000Z"),
      updatedAt: new Date("2026-08-20T10:00:00.000Z"),
      contact: {
        id: CONTACT_ID,
        name: "신규의뢰",
        phones: [],
      },
    };
    const newIntake = {
      id: NEW_INTAKE_ID,
      officeId: OFFICE_ID,
      projectId: null,
      lifecycleStatus: "open",
      receivedAt: new Date("2026-08-20T10:00:00.000Z"),
      memo: null,
      createdAt: new Date("2026-08-20T10:00:00.000Z"),
      updatedAt: new Date("2026-08-20T10:00:00.000Z"),
      contacts: [{ ...participant, contact: undefined }],
    };
    const created = {
      id: "requirement-new",
      officeId: OFFICE_ID,
      buyerIntakeId: NEW_INTAKE_ID,
      priorityRank: 1,
      status: "active",
      urgency: "normal",
      transactionType: "sale",
      siteTypes: [],
      priceMin: null,
      priceMax: null,
      depositMin: null,
      depositMax: null,
      monthlyRentMin: null,
      monthlyRentMax: null,
      areaMin: null,
      areaMax: null,
      moveInDate: null,
      assignedToId: null,
      lastContactDate: null,
      nextContactDate: null,
      memo: null,
      createdAt: new Date("2026-08-20T10:00:00.000Z"),
      updatedAt: new Date("2026-08-20T10:00:00.000Z"),
      buyerIntake: { ...newIntake, contacts: [participant] },
      preferredSites: [],
      preferredRegions: [],
    };
    const tx = {
      contact: { findFirst: jest.fn().mockResolvedValue({ id: CONTACT_ID }) },
      buyerIntake: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(newIntake),
      },
      buyerRequirement: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BuyerRequirementsService(prisma as never);

    const result = await service.create(OFFICE_ID, {
      contactId: CONTACT_ID,
      createNewIntake: true,
      transactionType: "sale",
      siteTypes: [],
    });

    expect(tx.buyerIntake.findFirst).not.toHaveBeenCalled();
    // 같은 고객의 열린 의뢰가 있어도 서버가 프로젝트로 묶지 않는다. 새 의뢰는 프로젝트 없이 생긴다.
    expect(tx.buyerIntake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          projectId: expect.anything(),
        }),
      }),
    );
    expect(tx.buyerRequirement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buyerIntakeId: NEW_INTAKE_ID,
          priorityRank: 1,
        }),
      }),
    );
    expect(result).toMatchObject({
      buyerIntakeId: NEW_INTAKE_ID,
      priorityRank: 1,
      contactId: CONTACT_ID,
    });
  });

  it("희망조건 삭제 시 상담은 Intake에 남기고 조건 연결만 해제한다", async () => {
    const requirementId = "00000000-0000-4000-8000-000000000004";
    const deleted = { id: requirementId };
    const tx = {
      consultation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
      },
      deal: { count: jest.fn().mockResolvedValue(0) },
      projectStep: { count: jest.fn().mockResolvedValue(0) },
      buyerIntake: { delete: jest.fn() },
      buyerRequirement: {
        findFirst: jest.fn().mockResolvedValue({
          id: requirementId,
          buyerIntakeId: INTAKE_ID,
          priorityRank: 2,
        }),
        delete: jest.fn().mockResolvedValue(deleted),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BuyerRequirementsService(prisma as never);

    await expect(service.remove(requirementId, OFFICE_ID)).resolves.toBe(
      deleted,
    );
    expect(tx.consultation.updateMany).toHaveBeenCalledWith({
      where: { officeId: OFFICE_ID, buyerReqId: requirementId },
      data: { buyerReqId: null },
    });
    expect(tx.buyerRequirement.delete).toHaveBeenCalledWith({
      where: { id: requirementId },
    });
    expect(tx.buyerRequirement.updateMany).toHaveBeenCalledWith({
      where: {
        officeId: OFFICE_ID,
        buyerIntakeId: INTAKE_ID,
        priorityRank: { gt: 2 },
      },
      data: { priorityRank: { decrement: 1 } },
    });
  });

  it("희망조건을 앞으로 이동하면 사이 순위를 원자적으로 한 칸씩 민다", async () => {
    const requirementId = "00000000-0000-4000-8000-000000000004";
    const reordered = {
      id: requirementId,
      officeId: OFFICE_ID,
      buyerIntakeId: INTAKE_ID,
      priorityRank: 1,
      buyerIntake: { contacts: [] },
      preferredSites: [],
      preferredRegions: [],
    };
    const tx = {
      buyerRequirement: {
        findFirst: jest.fn().mockResolvedValue({
          id: requirementId,
          buyerIntakeId: INTAKE_ID,
          priorityRank: 3,
        }),
        count: jest.fn().mockResolvedValue(3),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue(reordered),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BuyerRequirementsService(prisma as never);

    const result = await service.reorder(requirementId, OFFICE_ID, 1);

    expect(tx.buyerRequirement.updateMany).toHaveBeenCalledWith({
      where: {
        officeId: OFFICE_ID,
        buyerIntakeId: INTAKE_ID,
        priorityRank: { gte: 1, lt: 3 },
      },
      data: { priorityRank: { increment: 1 } },
    });
    expect(tx.buyerRequirement.update).toHaveBeenCalledWith({
      where: { id: requirementId },
      data: { priorityRank: 1 },
    });
    expect(result).toMatchObject({ id: requirementId, priorityRank: 1 });
  });

  it("희망조건 개수를 벗어난 순위 이동을 거부한다", async () => {
    const requirementId = "00000000-0000-4000-8000-000000000004";
    const tx = {
      buyerRequirement: {
        findFirst: jest.fn().mockResolvedValue({
          id: requirementId,
          buyerIntakeId: INTAKE_ID,
          priorityRank: 1,
        }),
        count: jest.fn().mockResolvedValue(2),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BuyerRequirementsService(prisma as never);

    await expect(
      service.reorder(requirementId, OFFICE_ID, 3),
    ).rejects.toThrow("순서는 1부터 2까지 정할 수 있습니다.");
    expect(tx.buyerRequirement.updateMany).not.toHaveBeenCalled();
    expect(tx.buyerRequirement.update).not.toHaveBeenCalled();
  });
});

describe("BuyerRequirementsService.update", () => {
  const REQUIREMENT_ID = "00000000-0000-4000-8000-000000000010";
  function setupUpdate(current: Record<string, unknown> = {}) {
    const prisma = {
      buyerRequirement: {
        findFirst: jest.fn().mockResolvedValue({
          priceMin: 80000,
          priceMax: 90000,
          depositMin: null,
          depositMax: null,
          monthlyRentMin: null,
          monthlyRentMax: null,
          areaMin: null,
          areaMax: null,
          ...current,
        }),
        update: jest.fn().mockResolvedValue({
          id: REQUIREMENT_ID,
          buyerIntake: { contacts: [] },
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "user-1" }) },
      site: { count: jest.fn() },
    };
    return { prisma, service: new BuyerRequirementsService(prisma as never) };
  }

  it("clears the move-in date, assignee and memo when null is sent", async () => {
    const { service, prisma } = setupUpdate();

    await service.update(REQUIREMENT_ID, OFFICE_ID, {
      moveInDate: null,
      assignedToId: null,
      memo: null,
    } as never);

    expect(prisma.buyerRequirement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ moveInDate: null, assignedToId: null, memo: null }),
      }),
    );
  });

  it("ignores fields that cannot be edited through this path", async () => {
    const { service, prisma } = setupUpdate();

    await service.update(REQUIREMENT_ID, OFFICE_ID, {
      status: "completed",
      officeId: "other-office",
      createdAt: "2000-01-01",
      urgency: "urgent",
    } as never);

    const { data } = prisma.buyerRequirement.update.mock.calls[0][0];
    expect(data).toMatchObject({ urgency: "urgent" });
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("officeId");
    expect(data).not.toHaveProperty("createdAt");
  });

  it("rejects a minimum above the saved maximum, negative amounts and unknown types", async () => {
    const { service, prisma } = setupUpdate();

    await expect(
      service.update(REQUIREMENT_ID, OFFICE_ID, { priceMin: 95000 }),
    ).rejects.toThrow("희망 가격의 최소값이 최대값보다 큽니다.");
    await expect(
      service.update(REQUIREMENT_ID, OFFICE_ID, { depositMin: -1 }),
    ).rejects.toThrow("보증금은 0 이상이어야 합니다.");
    await expect(
      service.update(REQUIREMENT_ID, OFFICE_ID, { monthlyRentMax: 1.5 }),
    ).rejects.toThrow("월세는 만원 단위 정수로 입력해 주세요.");
    await expect(
      service.update(REQUIREMENT_ID, OFFICE_ID, { transactionType: "rent" }),
    ).rejects.toThrow("거래유형은");
    expect(prisma.buyerRequirement.update).not.toHaveBeenCalled();
  });
});

describe("BuyerRequirementsService.updateStatus", () => {
  const REQUIREMENT_ID = "00000000-0000-4000-8000-000000000020";
  function setupStatus(openMatches: Array<{ id: string; stage: string }>) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: REQUIREMENT_ID }]),
      buyerRequirement: {
        update: jest.fn().mockImplementation(({ data }) => ({
          id: REQUIREMENT_ID,
          status: data.status,
          buyerIntake: { contacts: [] },
        })),
      },
      match: {
        findMany: jest.fn().mockResolvedValue(openMatches),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    return { tx, service: new BuyerRequirementsService(prisma as never) };
  }

  it("완료하면 그 조건의 진행 중 매칭을 손님 조건 종료로 닫는다 (거래 전환 · 종료 매칭은 빼고)", async () => {
    const { tx, service } = setupStatus([
      { id: "m1", stage: "viewing" },
      { id: "m2", stage: "suggested" },
    ]);

    const result = await service.updateStatus(REQUIREMENT_ID, OFFICE_ID, "completed");

    expect(tx.match.findMany).toHaveBeenCalledWith({
      where: {
        officeId: OFFICE_ID,
        buyerReqId: REQUIREMENT_ID,
        stage: { notIn: ["closed", "dealCreated"] },
      },
      select: { id: true, stage: true },
    });
    expect(tx.match.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: {
        stage: "closed",
        closedFromStage: "viewing",
        closedReason: "buyer_closed",
        closedByDealId: null,
      },
    });
    expect(tx.match.update).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "completed", closedMatchCount: 2 });
  });

  it("보류와 다시 열기는 매칭을 건드리지 않는다", async () => {
    for (const status of ["hold", "active"]) {
      const { tx, service } = setupStatus([{ id: "m1", stage: "viewing" }]);
      const result = await service.updateStatus(REQUIREMENT_ID, OFFICE_ID, status);
      expect(tx.match.findMany).not.toHaveBeenCalled();
      expect(tx.match.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status, closedMatchCount: 0 });
    }
  });
});

describe("BuyerRequirementsService — 희망 지역 · 단지 중첩 쓰기", () => {
  const REQUIREMENT_ID = "00000000-0000-4000-8000-000000000030";
  function setupRegions(existing: { provinces?: number; districts?: number; wards?: number } = {}) {
    const prisma = {
      buyerRequirement: {
        findFirst: jest.fn().mockResolvedValue({
          priceMin: null,
          priceMax: null,
          depositMin: null,
          depositMax: null,
          monthlyRentMin: null,
          monthlyRentMax: null,
          areaMin: null,
          areaMax: null,
        }),
        update: jest.fn().mockResolvedValue({ id: REQUIREMENT_ID, buyerIntake: { contacts: [] } }),
      },
      province: { count: jest.fn().mockResolvedValue(existing.provinces ?? 0) },
      district: { count: jest.fn().mockResolvedValue(existing.districts ?? 0) },
      ward: { count: jest.fn().mockResolvedValue(existing.wards ?? 0) },
      site: { count: jest.fn().mockResolvedValue(1) },
      user: { findFirst: jest.fn() },
    };
    return { prisma, service: new BuyerRequirementsService(prisma as never) };
  }

  it("받은 객체 대신 법정동 코드만 골라 담는다 (법정동 마스터에 줄을 만들지 못하게)", async () => {
    const { prisma, service } = setupRegions({ wards: 1 });

    await service.update(REQUIREMENT_ID, OFFICE_ID, {
      preferredRegions: [
        {
          wardCode: "1174010200",
          province: { connectOrCreate: { where: { code: "98" }, create: { code: "98", name: "가짜도" } } },
        },
      ],
    } as never);

    const { data } = prisma.buyerRequirement.update.mock.calls[0][0];
    expect(data.preferredRegions).toEqual({
      deleteMany: {},
      create: [{ provinceCode: undefined, districtCode: undefined, wardCode: "1174010200" }],
    });
  });

  it("코드 없이 관계 쓰기만 보내거나 없는 코드를 보내면 400으로 막는다", async () => {
    const { prisma, service } = setupRegions();

    await expect(
      service.update(REQUIREMENT_ID, OFFICE_ID, {
        preferredRegions: [
          { province: { connectOrCreate: { where: { code: "98" }, create: { code: "98", name: "x" } } } },
        ],
      } as never),
    ).rejects.toThrow("희망 지역 형식이 올바르지 않습니다.");
    await expect(
      service.update(REQUIREMENT_ID, OFFICE_ID, { preferredRegions: [{ provinceCode: "98" }] }),
    ).rejects.toThrow("지역을 찾을 수 없습니다.");
    expect(prisma.buyerRequirement.update).not.toHaveBeenCalled();
  });

  it("희망 단지도 siteId · 순서 · 메모만 담는다", async () => {
    const { prisma, service } = setupRegions();

    await service.update(REQUIREMENT_ID, OFFICE_ID, {
      preferredSites: [{ siteId: "site-1", site: { create: { name: "가짜" } } }],
    } as never);

    const { data } = prisma.buyerRequirement.update.mock.calls[0][0];
    expect(data.preferredSites).toEqual({
      deleteMany: {},
      create: [{ siteId: "site-1", priority: 1 }],
    });
  });
});
