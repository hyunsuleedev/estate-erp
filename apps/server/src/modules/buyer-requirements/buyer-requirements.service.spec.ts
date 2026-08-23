import { BuyerRequirementsService } from "./buyer-requirements.service";

const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const INTAKE_ID = "00000000-0000-4000-8000-000000000002";
const CONTACT_ID = "00000000-0000-4000-8000-000000000003";
const NEW_INTAKE_ID = "00000000-0000-4000-8000-000000000004";
const CASE_ID = "00000000-0000-4000-8000-000000000005";

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
      brokerageCaseId: CASE_ID,
      casePriorityRank: 2,
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
      brokerageCase: {
        findMany: jest.fn().mockResolvedValue([
          { id: CASE_ID, participants: [{ contactId: CONTACT_ID }] },
        ]),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      brokerageCaseParticipant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "case-participant-1",
            contactId: CONTACT_ID,
            roles: ["buyer"],
            isPrincipal: true,
            isCommunicationPrimary: true,
          },
        ]),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      buyerIntake: {
        findFirst: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({
          _max: { casePriorityRank: 1 },
        }),
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
    expect(tx.buyerIntake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brokerageCaseId: CASE_ID,
          casePriorityRank: 2,
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
      consultation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      buyerRequirement: {
        findFirst: jest.fn().mockResolvedValue({
          id: requirementId,
          buyerIntakeId: INTAKE_ID,
          priorityRank: 2,
        }),
        delete: jest.fn().mockResolvedValue(deleted),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    ).rejects.toThrow("priorityRank는 1부터 2까지 지정할 수 있습니다.");
    expect(tx.buyerRequirement.updateMany).not.toHaveBeenCalled();
    expect(tx.buyerRequirement.update).not.toHaveBeenCalled();
  });
});
