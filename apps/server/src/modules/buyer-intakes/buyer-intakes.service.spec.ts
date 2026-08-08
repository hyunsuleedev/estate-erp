import { BadRequestException } from "@nestjs/common";
import { BuyerIntakesService } from "./buyer-intakes.service";

const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const INTAKE_ID = "00000000-0000-4000-8000-000000000002";
const BUYER_ID = "00000000-0000-4000-8000-000000000003";
const FATHER_ID = "00000000-0000-4000-8000-000000000004";

function participant(
  contactId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `${contactId}-participant`,
    officeId: OFFICE_ID,
    buyerIntakeId: INTAKE_ID,
    contactId,
    role: "buyer",
    isPrimary: false,
    createdAt: new Date("2026-08-07T10:00:00.000Z"),
    updatedAt: new Date("2026-08-07T10:00:00.000Z"),
    contact: {
      id: contactId,
      officeId: OFFICE_ID,
      name: contactId === BUYER_ID ? "구매자" : "아버지",
      phones: [],
    },
    ...overrides,
  };
}

function intake(contacts = [participant(BUYER_ID)]) {
  return {
    id: INTAKE_ID,
    officeId: OFFICE_ID,
    lifecycleStatus: "open",
    receivedAt: new Date("2026-08-07T10:00:00.000Z"),
    memo: null,
    createdAt: new Date("2026-08-07T10:00:00.000Z"),
    updatedAt: new Date("2026-08-07T10:00:00.000Z"),
    contacts,
    requirements: [],
  };
}

describe("BuyerIntakesService", () => {
  function createService() {
    const prisma = {
      contact: { count: jest.fn() },
      buyerIntake: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({
          _max: { casePriorityRank: null },
        }),
        update: jest.fn(),
      },
      buyerIntakeContact: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      brokerageCase: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000005",
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      brokerageCaseParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    return {
      prisma,
      service: new BuyerIntakesService(prisma as never),
    };
  }

  it("구매 의뢰 단위로 생명주기와 하위 희망조건을 함께 필터링한다", async () => {
    const { prisma, service } = createService();
    prisma.buyerIntake.findMany.mockResolvedValue([]);
    prisma.buyerIntake.count.mockResolvedValue(0);

    await service.findAll(OFFICE_ID, {
      lifecycleStatus: "open",
      status: "active,hold",
      transactionType: "sale",
      priceMin: 100_000,
      search: "아버지",
      sortBy: "createdAt",
      sortOrder: "asc",
      page: 2,
      limit: 10,
    });

    const query = prisma.buyerIntake.findMany.mock.calls[0]?.[0];
    expect(query.where).toMatchObject({
      officeId: OFFICE_ID,
      lifecycleStatus: "open",
    });
    expect(query.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirements: {
            some: expect.objectContaining({
              status: { in: ["active", "hold"] },
              transactionType: { in: ["sale"] },
            }),
          },
        }),
        expect.objectContaining({ OR: expect.any(Array) }),
      ]),
    );
    expect(query.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(query.skip).toBe(10);
    expect(query.take).toBe(10);
  });

  it("첫 연락처를 대표 연락 대상으로 기본 지정한다", async () => {
    const { prisma, service } = createService();
    prisma.contact.count.mockResolvedValue(2);
    prisma.buyerIntake.create.mockResolvedValue(
      intake([
        participant(BUYER_ID, {
          isPrimary: true,
        }),
        participant(FATHER_ID, { role: "co_buyer" }),
      ]),
    );

    await service.create(OFFICE_ID, {
      contacts: [{ contactId: BUYER_ID }, { contactId: FATHER_ID }],
    });

    expect(prisma.buyerIntake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contacts: {
            create: [
              expect.objectContaining({
                role: "buyer",
                isPrimary: true,
              }),
              expect.objectContaining({
                role: "co_buyer",
                isPrimary: false,
              }),
            ],
          },
        }),
      }),
    );
  });

  it("같은 Contact를 한 Intake에 중복 연결하지 않는다", async () => {
    const { service } = createService();

    await expect(
      service.create(OFFICE_ID, {
        contacts: [{ contactId: BUYER_ID }, { contactId: BUYER_ID }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("다른 사무소 Contact가 섞인 Intake 생성을 거부한다", async () => {
    const { prisma, service } = createService();
    prisma.contact.count.mockResolvedValue(1);

    await expect(
      service.create(OFFICE_ID, {
        contacts: [{ contactId: BUYER_ID }, { contactId: FATHER_ID }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("주 연락처 승격 시 기존 대표를 원자적으로 교체한다", async () => {
    const { prisma, service } = createService();
    prisma.buyerIntakeContact.findFirst.mockResolvedValue(
      participant(FATHER_ID),
    );
    prisma.buyerIntakeContact.findMany.mockResolvedValue([
      { id: `${BUYER_ID}-participant` },
    ]);
    prisma.buyerIntakeContact.update.mockResolvedValue({});
    prisma.buyerIntake.findUniqueOrThrow.mockResolvedValue(
      intake([
        participant(FATHER_ID, { isPrimary: true }),
        participant(BUYER_ID),
      ]),
    );

    await service.updateContact(INTAKE_ID, FATHER_ID, OFFICE_ID, {
      isPrimary: true,
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.buyerIntakeContact.update).toHaveBeenNthCalledWith(1, {
      where: { id: `${BUYER_ID}-participant` },
      data: { isPrimary: false },
    });
    expect(prisma.buyerIntakeContact.update).toHaveBeenNthCalledWith(2, {
      where: { id: `${FATHER_ID}-participant` },
      data: { isPrimary: true },
    });
  });

  it("참여 연락처 삭제는 감사 로그와 호환되는 row PK를 사용한다", async () => {
    const { prisma, service } = createService();
    prisma.buyerIntake.findFirst.mockResolvedValue(
      intake([
        participant(BUYER_ID, { isPrimary: true }),
        participant(FATHER_ID, { role: "representative" }),
      ]),
    );
    prisma.buyerIntakeContact.delete.mockResolvedValue({});
    prisma.buyerIntake.findUniqueOrThrow.mockResolvedValue(
      intake([participant(BUYER_ID, { isPrimary: true })]),
    );

    await service.removeContact(INTAKE_ID, FATHER_ID, OFFICE_ID);

    expect(prisma.buyerIntakeContact.delete).toHaveBeenCalledWith({
      where: { id: `${FATHER_ID}-participant` },
    });
  });
});
