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
    cpAccountId: "acct-1",
    status: "active",
    listingId: "listing-1",
    propertyId: "property-1",
    siteId: "site-1",
    advertisedPrice: 320000,
    advertisedDeposit: null,
    advertisedMonthlyRent: null,
    floorExposure: "exact",
    externalAdId: "cp-1",
    naverArticleNo: "2400000001",
    startedAt: new Date("2026-11-01T00:00:00.000Z"),
    rawSiteName: null,
    rawDong: null,
    rawHo: null,
    rawFloorText: null,
    rawRoadAddress: null,
    rawJibunAddress: null,
    cpAccount: { id: "acct-1", accountKey: "userA", accountName: "본점" },
    listing: {
      id: "listing-1",
      intakeId: "intake-1",
      transactionType: "sale",
      price: 320000,
      deposit: null,
      monthlyRent: null,
      property: {
        site: { name: "고덕그라시움" },
        unit: { name: "3401", floor: 34, floorEnd: null, floorLabel: null, dong: { name: "101", isPlaceholder: false } },
      },
    },
    property: {
      site: { name: "고덕그라시움" },
      unit: { name: "3401", floor: 34, floorEnd: null, floorLabel: null, dong: { name: "101", isPlaceholder: false } },
    },
    site: { name: "고덕그라시움" },
    comparisons: [],
  };

  function setup(overrides: Record<string, unknown> = {}) {
    const prisma: any = {
      listingAdvertisement: {
        findFirst: jest.fn().mockResolvedValue({ ...advertisement, ...overrides }),
        update: jest.fn(),
      },
      listing: {
        findFirst: jest.fn().mockResolvedValue({
          id: "listing-1",
          intakeId: "intake-1",
          propertyId: "property-1",
          transactionType: "sale",
          price: 320000,
          deposit: null,
          monthlyRent: null,
          property: advertisement.property,
        }),
      },
      officeCpAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: "acct-1", channel: "esiljang" }),
      },
      advertisementChangeRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "request-1",
          ...data,
          task: { id: "task-1", title: "t", status: "pending", assignedToId: null, dueDate: null },
        })),
        update: jest.fn().mockImplementation(({ data }) => ({ id: "request-1", ...data })),
      },
      task: {
        create: jest.fn().mockResolvedValue({ id: "task-1", title: "t", status: "pending", assignedToId: null }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "user-2" }) },
      $executeRaw: jest.fn(),
    };
    prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
    const tasks = {
      create: jest.fn().mockResolvedValue({
        id: "task-1",
        title: "t",
        status: "pending",
        assignedToId: null,
      }),
      notifyAssigneeIfNeeded: jest.fn().mockResolvedValue(undefined),
    };
    const cpAccounts = {
      resolveAccountForChannel: jest.fn().mockResolvedValue("acct-1"),
    };
    return {
      prisma,
      tasks,
      cpAccounts,
      service: new AdvertisementChangeRequestsService(
        prisma,
        tasks as never,
        cpAccounts as never,
      ),
    };
  }

  it("turns an update request into a unified request + advertisement task via TasksService without touching the advertisement", async () => {
    const { prisma, tasks, service } = setup();

    await service.create("office-1", "user-1", "ad-1", {
      action: "update",
      targetValue: { price: 315000, floorExposure: "band" },
      memo: "집주인 요청",
      assignedToId: "user-2",
    });

    expect(tasks.create).toHaveBeenCalledWith(
      "office-1",
      expect.objectContaining({
        category: "advertisement",
        status: "pending",
        assignedToId: "user-2",
        title: "[광고 조건 변경] 고덕그라시움 101동 3401호 · esiljang: 32억 → 31억 5,000만, 정확한 층 → 저·중·고",
        propertyId: "property-1",
        listingId: "listing-1",
        listingIntakeId: "intake-1",
      }),
      "user-1",
      expect.objectContaining({ tx: prisma, skipNotification: true }),
    );
    expect(tasks.notifyAssigneeIfNeeded).toHaveBeenCalled();
    expect(prisma.advertisementChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          advertisementId: "ad-1",
          channel: "esiljang",
          cpAccountId: "acct-1",
          taskId: "task-1",
          action: "update",
          status: "requested",
          baseSnapshot: expect.objectContaining({ price: 320000, naverArticleNo: "2400000001" }),
          targetValue: { price: 315000, floorExposure: "band" },
          requestedById: "user-1",
          assignedToId: "user-2",
        }),
      }),
    );
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
  });

  it("supports batch requests across multiple ads linked to one shared Task (N:1) including publish", async () => {
    const { prisma, tasks, service } = setup();
    prisma.listingAdvertisement.findFirst
      .mockResolvedValueOnce({ ...advertisement, id: "ad-1" })
      .mockResolvedValueOnce(null); // publish has no existing active ad

    const result = await service.createBatch("office-1", "user-1", {
      items: [
        { action: "update", advertisementId: "ad-1", targetValue: { price: 310000 } },
        { action: "publish", listingId: "listing-1", channel: "budongsanbank", targetValue: { price: 310000, floorExposure: "exact" } },
      ],
      memo: "일괄 요청",
    });

    expect(tasks.create).toHaveBeenCalledTimes(1);
    expect(prisma.advertisementChangeRequest.create).toHaveBeenCalledTimes(2);
    expect(result.requests).toHaveLength(2);
    expect(prisma.advertisementChangeRequest.create.mock.calls[1][0].data).toEqual(
      expect.objectContaining({
        action: "publish",
        advertisementId: null,
        listingId: "listing-1",
        channel: "budongsanbank",
        taskId: "task-1",
      }),
    );
  });

  it("refuses an invalid update payload or unknown action", async () => {
    const { service } = setup();

    await expect(service.create("office-1", "user-1", "ad-1", { action: "update", targetValue: { price: 320000 } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create("office-1", "user-1", "ad-1", { action: "update", targetValue: { price: 31.5 } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create("office-1", "user-1", "ad-1", { action: "update", targetValue: {} })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create("office-1", "user-1", "ad-1", { action: "discount" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("takes down only a live advertisement and re-advertises a live or ended one", async () => {
    const live = setup();
    await live.service.create("office-1", "user-1", "ad-1", { action: "takedown" });
    expect(live.tasks.create.mock.calls[0][1].priority).toBe("high");
    await live.service.create("office-1", "user-1", "ad-1", { action: "readvertise" });

    const ended = setup({ status: "ended" });
    await ended.service.create("office-1", "user-1", "ad-1", { action: "readvertise" });
    await expect(ended.service.create("office-1", "user-1", "ad-1", { action: "takedown" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("validates staff assignment and leaves unassigned when omitted", async () => {
    const { prisma, tasks, service } = setup();
    await service.create("office-1", "user-1", "ad-1", { action: "takedown", assignedToId: "user-2" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-2", officeId: "office-1", isActive: true },
      select: { id: true },
    });
    expect(tasks.create.mock.calls[0][1].assignedToId).toBe("user-2");

    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.create("office-1", "user-1", "ad-1", { action: "takedown", assignedToId: "stranger" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const agent = setup();
    await agent.service.create("office-1", "user-1", "ad-1", { action: "takedown" });
    expect(agent.tasks.create.mock.calls[0][1].assignedToId).toBeUndefined();
  });

  it("does not stack a second open request on the same advertisement", async () => {
    const { prisma, tasks, service } = setup();
    prisma.advertisementChangeRequest.findFirst.mockResolvedValue({ id: "request-0", action: "readvertise" });

    await expect(
      service.create("office-1", "user-1", "ad-1", { action: "update", targetValue: { price: 315000 } }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tasks.create).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it("cancels a request and cancels the parent Task when no non-cancelled siblings remain", async () => {
    const { prisma, service } = setup();
    prisma.advertisementChangeRequest.findFirst.mockResolvedValue({
      id: "request-1",
      status: "requested",
      taskId: "task-1",
    });
    prisma.advertisementChangeRequest.findMany.mockResolvedValue([{ status: "cancelled" }]);

    const res = await service.cancel("office-1", "request-1");
    expect(res.status).toBe("cancelled");
    expect(prisma.advertisementChangeRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { status: "cancelled" },
    });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: "task-1", officeId: "office-1", status: { in: ["pending", "in_progress"] } },
      data: { status: "cancelled" },
    });

    prisma.advertisementChangeRequest.findFirst.mockResolvedValue({
      id: "request-1",
      status: "verified",
      taskId: "task-1",
    });
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
