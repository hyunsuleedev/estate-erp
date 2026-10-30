import { ConsumerRequestsService } from "./consumer-requests.service";
import { CreateConsumerRequestDto } from "./consumer-requests.dto";
import { validate } from "class-validator";
const dto: CreateConsumerRequestDto = {
  requestId: "93682f1f-58c8-4ddf-a95c-187ac1118a60",
  wardCode: "1174010200",
  transactionType: "jeonse",
  propertyType: "apartment",
  budgetMax: 50000,
  requirements: "역에서 걸어서 10분 이내, 방 2개",
  contactName: "테스트",
  phone: "010-0000-0000",
  consent: true,
};
function setup() {
  const tx: any = {
    $executeRaw: jest.fn(),
    consumerRequest: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ ...data, createdAt: new Date() })),
      findMany: jest.fn(),
    },
    ward: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          name: "고덕동",
          district: { name: "강동구", province: { name: "서울특별시" } },
        }),
    },
    office: {
      findMany: jest.fn().mockResolvedValue([
        { id: "office-a", users: [{ id: "owner-a" }] },
        { id: "office-b", users: [{ id: "owner-b" }] },
      ]),
    },
    task: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: `task-${data.officeId}` })),
    },
    notification: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({
          ...data,
          id: "notification",
          isRead: false,
          createdAt: new Date(),
        })),
    },
  };
  const realtime: any = { emitNotificationCreated: jest.fn() };
  const prisma: any = { ...tx, $transaction: jest.fn((fn) => fn(tx)) };
  return {
    tx,
    realtime,
    service: new ConsumerRequestsService(prisma, realtime),
  };
}
describe("consumer request delivery", () => {
  it("creates office-scoped tasks and owner notifications, returns no contact data", async () => {
    const { service, tx, realtime } = setup();
    const result = await service.create("consumer-a", dto);
    expect(result.recipientCount).toBe(2);
    expect(result).not.toHaveProperty("phone");
    expect(
      tx.office.findMany.mock.calls[0][0].where.officeSites.some.site.wardCode,
    ).toBe(dto.wardCode);
    expect(tx.task.create).toHaveBeenCalledTimes(2);
    expect(tx.task.create.mock.calls[0][0].data.officeId).toBe("office-a");
    expect(realtime.emitNotificationCreated).toHaveBeenCalledTimes(2);
  });
  it("returns an existing receipt without delivering again", async () => {
    const { service, tx } = setup();
    tx.consumerRequest.findUnique.mockResolvedValue({
      id: dto.requestId,
      consumerId: "consumer-a",
      recipientCount: 2,
    });
    await service.create("consumer-a", dto);
    expect(tx.task.create).not.toHaveBeenCalled();
  });
  it("does not reveal another consumer receipt", async () => {
    const { service, tx } = setup();
    tx.consumerRequest.findUnique.mockResolvedValue({
      consumerId: "consumer-b",
    });
    await expect(service.create("consumer-a", dto)).rejects.toThrow("식별자");
    expect(tx.task.create).not.toHaveBeenCalled();
  });
  it("does not accept a request with no recipients", async () => {
    const { service, tx } = setup();
    tx.office.findMany.mockResolvedValue([]);
    await expect(service.create("consumer-a", dto)).rejects.toThrow(
      "중개사가 없습니다",
    );
    expect(tx.consumerRequest.create).not.toHaveBeenCalled();
  });
  it("enforces the account daily limit before delivery", async () => {
    const { service, tx } = setup();
    tx.consumerRequest.count.mockResolvedValue(5);
    await expect(service.create("consumer-a", dto)).rejects.toThrow("최대 5건");
    expect(tx.task.create).not.toHaveBeenCalled();
  });
  it("scopes history to authenticated consumer", () => {
    const { service, tx } = setup();
    service.history("consumer-a");
    expect(tx.consumerRequest.findMany.mock.calls[0][0].where).toEqual({
      consumerId: "consumer-a",
    });
  });
  it("rejects missing consent and invalid budget", async () => {
    const invalid = Object.assign(new CreateConsumerRequestDto(), dto, {
      consent: false,
      budgetMax: -1,
    });
    const errors = await validate(invalid);
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(["consent", "budgetMax"]),
    );
  });
});
