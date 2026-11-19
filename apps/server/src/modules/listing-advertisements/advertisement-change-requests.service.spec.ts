import { Prisma } from "@prisma/client";
import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  AdvertisementChangeRequestsService,
  describeAdvertisementPlace,
} from "./advertisement-change-requests.service";

describe("AdvertisementChangeRequestsService", () => {
  const advertisement = {
    id: "ad-1",
    officeId: "office-1",
    channel: "esiljang",
    status: "active",
    listingId: "listing-1",
    propertyId: "property-1",
    siteId: "site-1",
    advertisedPrice: 320000,
    advertisedDeposit: null,
    advertisedMonthlyRent: null,
    floorExposure: "exact",
    rawSiteName: null,
    rawDong: null,
    rawHo: null,
    rawFloorText: null,
    rawRoadAddress: null,
    rawJibunAddress: null,
    listing: { id: "listing-1", intakeId: "intake-1" },
    property: {
      site: { name: "고덕그라시움" },
      unit: { name: "3401", floor: 34, floorEnd: null, floorLabel: null, dong: { name: "101", isPlaceholder: false } },
    },
    site: { name: "고덕그라시움" },
  };

  function setup(overrides: Record<string, unknown> = {}) {
    const prisma: any = {
      listingAdvertisement: {
        findFirst: jest.fn().mockResolvedValue({ ...advertisement, ...overrides }),
        update: jest.fn(),
      },
      advertisementChangeRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: "request-1", ...data })),
      },
      task: {
        create: jest.fn().mockResolvedValue({ id: "task-1", title: "t", status: "pending" }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "user-2" }) },
      $executeRaw: jest.fn(),
    };
    prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
    return { prisma, service: new AdvertisementChangeRequestsService(prisma) };
  }

  it("turns a price request into an advertisement task and leaves the advertisement untouched", async () => {
    const { prisma, service } = setup();

    await service.create("office-1", "user-1", "ad-1", { kind: "price", toValue: { price: 315000 }, memo: "집주인 요청" });

    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId: "office-1",
        category: "advertisement",
        status: "pending",
        title: "[광고 가격 변경] 고덕그라시움 101동 3401호 · esiljang: 32억 → 31억 5,000만",
        content: "집주인 요청",
        createdById: "user-1",
        propertyId: "property-1",
        listingId: "listing-1",
        listingIntakeId: "intake-1",
      }),
      select: { id: true, title: true, status: true },
    });
    expect(prisma.advertisementChangeRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        advertisementId: "ad-1",
        taskId: "task-1",
        kind: "price",
        fromValue: { price: 320000 },
        toValue: { price: 315000 },
        requestedById: "user-1",
      }),
    });
    // 요청은 광고의 값을 바꾸지 않는다 — 값은 CP에 실제로 걸려 있는 것이어야 한다
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
  });

  it("refuses a price that is not a change, or not a whole number", async () => {
    const { service } = setup();

    await expect(service.create("office-1", "user-1", "ad-1", { kind: "price", toValue: { price: 320000 } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create("office-1", "user-1", "ad-1", { kind: "price", toValue: { price: 31.5 } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create("office-1", "user-1", "ad-1", { kind: "price", toValue: {} })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create("office-1", "user-1", "ad-1", { kind: "discount" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("asks for a floor exposure change only when it differs", async () => {
    const { prisma, service } = setup();

    await service.create("office-1", "user-1", "ad-1", { kind: "floor_exposure", toValue: { floorExposure: "band" } });
    expect(prisma.task.create.mock.calls[0][0].data.title).toBe(
      "[광고 층 노출 변경] 고덕그라시움 101동 3401호 · esiljang: 정확한 층 → 저·중·고",
    );
    await expect(
      service.create("office-1", "user-1", "ad-1", { kind: "floor_exposure", toValue: { floorExposure: "exact" } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("takes down only a live advertisement and re-advertises a live or ended one", async () => {
    const live = setup();
    await live.service.create("office-1", "user-1", "ad-1", { kind: "takedown" });
    expect(live.prisma.task.create.mock.calls[0][0].data.priority).toBe("high");
    // 게재 중인 광고의 재광고는 다시 올려 날짜를 새로 받는 일이다
    await live.service.create("office-1", "user-1", "ad-1", { kind: "readvertise" });

    const ended = setup({ status: "ended" });
    await ended.service.create("office-1", "user-1", "ad-1", { kind: "readvertise" });
    await expect(ended.service.create("office-1", "user-1", "ad-1", { kind: "takedown" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("assigns the task to a staff member of the office, or leaves it for the agent", async () => {
    const { prisma, service } = setup();
    await service.create("office-1", "user-1", "ad-1", { kind: "takedown", assignedToId: "user-2" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-2", officeId: "office-1", isActive: true },
      select: { id: true },
    });
    expect(prisma.task.create.mock.calls[0][0].data.assignedToId).toBe("user-2");

    // 다른 사무소 사람이나 그만둔 직원에게는 맡기지 못한다
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.create("office-1", "user-1", "ad-1", { kind: "takedown", assignedToId: "stranger" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // 비우면 담당자 없이 등록된다 (에이전트가 가져간다)
    const agent = setup();
    await agent.service.create("office-1", "user-1", "ad-1", { kind: "takedown" });
    expect(agent.prisma.task.create.mock.calls[0][0].data.assignedToId).toBeUndefined();
    expect(agent.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("does not stack a second open request of the same kind", async () => {
    const { prisma, service } = setup();
    prisma.advertisementChangeRequest.findFirst.mockResolvedValue({ id: "request-0" });

    await expect(
      service.create("office-1", "user-1", "ad-1", { kind: "price", toValue: { price: 315000 } }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.task.create).not.toHaveBeenCalled();
    // 확인과 만들기는 광고 · 종류 단위 잠금 안에서 한다
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it("cancels a request by cancelling its task, once", async () => {
    const { prisma, service } = setup();
    prisma.advertisementChangeRequest.findFirst.mockResolvedValue({ id: "request-1", task: { id: "task-1", status: "pending" } });
    await service.cancel("office-1", "request-1");
    // 아직 열려 있을 때만 취소한다. 변경 기록이 남도록 updateMany가 아니라 조건을 단 update다
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "task-1", officeId: "office-1", status: { in: ["pending", "in_progress"] } },
      data: { status: "cancelled" },
    });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    // 읽은 뒤 그 사이 끝난 업무는 조건에 걸리지 않는다
    prisma.task.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "test" }),
    );
    await expect(service.cancel("office-1", "request-1")).rejects.toBeInstanceOf(ConflictException);

    prisma.advertisementChangeRequest.findFirst.mockResolvedValue({ id: "request-1", task: { id: "task-1", status: "completed" } });
    await expect(service.cancel("office-1", "request-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("names the place from our data when linked, and from the CP text when not", () => {
    expect(describeAdvertisementPlace(advertisement)).toBe("고덕그라시움 101동 3401호");
    expect(
      describeAdvertisementPlace({
        ...advertisement,
        property: { site: { name: "상가건물" }, unit: { name: null, floor: -1, floorEnd: 1, floorLabel: null, dong: { name: "-", isPlaceholder: true } } },
      }),
    ).toBe("상가건물 B1~1층");
    expect(
      describeAdvertisementPlace({ ...advertisement, property: null, site: null, rawSiteName: "고덕아르테온", rawDong: "205", rawFloorText: "저/25" }),
    ).toBe("고덕아르테온 205동 저/25");
    expect(
      describeAdvertisementPlace({ ...advertisement, property: null, site: null, rawJibunAddress: "고덕동 693" }),
    ).toBe("고덕동 693");
    expect(describeAdvertisementPlace({ ...advertisement, property: null, site: null })).toBe("자리 미확인 광고");
  });
});
