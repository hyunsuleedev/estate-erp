import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  hashCanonicalJson,
  ListingAdvertisementSnapshotsService,
} from "./listing-advertisement-snapshots.service";

describe("ListingAdvertisementSnapshotsService", () => {
  const officeId = "11111111-1111-4111-8111-111111111111";
  const userId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "33333333-3333-4333-8333-333333333333";
  const itemId = "44444444-4444-4444-8444-444444444444";
  const listingId = "55555555-5555-4555-8555-555555555555";
  const observedAt = "2026-08-04T14:48:01.956Z";

  const rawItem = {
    provider: "esiljang",
    externalAdId: "64850265",
    naverArticleNo: "2641347513",
    naverUrl: null,
    providerUrl: "https://www.aipartner.com/offerings/verify/64850265/66535183",
    complexName: null,
    fullAddress: "교문동 미래유탑유블레스시티 1동 2810호",
    dong: null,
    floor: null,
    ho: null,
    transactionType: "월세",
    propertyType: "오피스텔",
    unitType: null,
    advertisedPrice: null,
    advertisedDeposit: 3000,
    advertisedMonthlyRent: 170,
    direction: null,
    registeredAt: "2026-08-01",
    providerStatus: "광고중",
    features: [],
    memo: null,
    observedAt,
    sourcePage: 1,
    sourceFields: { 면적: "[계]179.48 [전]73.8" },
  };

  function createPrisma() {
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      listingAdvertisementSnapshotSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      listingAdvertisementSnapshotItem: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // 연결을 확인할 때 매물 → 관리 공간 → 건물 순서로 따라간다
      listing: {
        findFirst: jest.fn().mockResolvedValue({
          id: listingId,
          propertyId: "property-1",
          intakeId: "intake-1",
          transactionType: "monthly",
        }),
      },
      property: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: "property-1", siteId: "site-1" }),
      },
      site: { findFirst: jest.fn().mockResolvedValue({ id: "site-1" }) },
      listingAdvertisement: {
        // 이번 수집에 없는(끝낼) 광고 목록. 따로 정하지 않으면 없다
        findMany: jest.fn().mockResolvedValue([]),
        // 같은 광고 찾기: 열쇠(매물 + 채널), 없으면 CP 광고 번호
        findFirst: jest.fn().mockResolvedValue(null),
        // 이제 쓰지 않는다 (끝낼 광고는 하나씩 고치며 이력을 남긴다)
        updateMany: jest.fn(),
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, officeId: "office-1", ...data })),
        create: jest.fn(async ({ data }: any) => ({ id: "ad-created", ...data })),
        delete: jest.fn(),
      },
      listingAdvertisementHistory: { create: jest.fn(), updateMany: jest.fn() },
      advertisementChangeRequest: { updateMany: jest.fn() },
      advertisementComparisonRecord: { updateMany: jest.fn() },
      advertisementComparison: { count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _max: { lastSeenAt: null }, _count: { _all: 0 } }), updateMany: jest.fn(), deleteMany: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) =>
      callback(prisma),
    );
    return prisma;
  }

  function activeSession() {
    return {
      id: sessionId,
      officeId,
      channel: "esiljang",
      scope: "active_advertisements",
      status: "processing",
      observedAt: new Date(observedAt),
      expectedTotal: 1,
      manifestHash: manifestHash(),
      activeFilter: { dataValue: "ad", selected: true, count: 1 },
      paginationComplete: true,
      visitedPages: [1],
      startedById: userId,
      receivedCount: 0,
      resolvedCount: 0,
      createdAdvertisements: null,
      updatedAdvertisements: null,
      staleAdvertisementsMarked: null,
      completedAt: null,
    };
  }

  function manifestHash(items = [rawItem]) {
    return hashCanonicalJson({
      provider: "esiljang",
      scope: "active_advertisements",
      activeFilter: { dataValue: "ad", selected: true, count: items.length },
      observedAt,
      expectedTotal: items.length,
      paginationComplete: true,
      visitedPages: [1],
      items,
    });
  }

  it("hashes objects canonically without changing array order", () => {
    expect(hashCanonicalJson({ b: 2, a: { d: 4, c: [3, 2, 1] } })).toBe(
      hashCanonicalJson({ a: { c: [3, 2, 1], d: 4 }, b: 2 }),
    );
    expect(hashCanonicalJson([1, 2])).not.toBe(hashCanonicalJson([2, 1]));
  });

  it("starts one processing session without writing advertisement rows", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.listingAdvertisementSnapshotSession.create.mockResolvedValue({
      id: sessionId,
      status: "processing",
    });
    const service = new ListingAdvertisementSnapshotsService(prisma);

    const result = await service.begin(officeId, userId, {
      channel: "esiljang",
      provider: "esiljang",
      scope: "active_advertisements",
      observedAt,
      expectedTotal: 1,
      manifestHash: manifestHash(),
      activeFilter: { dataValue: "ad", selected: true, count: 1 },
      paginationComplete: true,
      visitedPages: [1],
    });

    expect(result.reused).toBe(false);
    expect(
      prisma.listingAdvertisementSnapshotSession.create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officeId,
          startedById: userId,
          status: "processing",
        }),
      }),
    );
    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
  });

  it("submits one resolved item with raw data and final Listing evidence", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      activeSession(),
    );
    prisma.listingAdvertisementSnapshotItem.findFirst.mockResolvedValue(null);
    prisma.listing.findFirst.mockResolvedValue({
      id: listingId,
      propertyId: "property-1",
      intakeId: "intake-1",
      transactionType: "monthly",
    });
    prisma.listingAdvertisementSnapshotItem.create.mockResolvedValue({
      id: itemId,
      status: "resolved",
      listingId,
    });
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      { status: "resolved" },
    ]);
    prisma.listingAdvertisementSnapshotSession.update.mockResolvedValue({});
    const service = new ListingAdvertisementSnapshotsService(prisma);

    const result = await service.submitItem(officeId, userId, "agent", {
      sessionId,
      raw: rawItem,
      listingId,
      resolution: {
        siteId: "site-1",
        dongId: "dong-1",
        unitId: "unit-1",
      },
    });

    expect(prisma.listing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: listingId, officeId } }),
    );
    expect(prisma.listingAdvertisementSnapshotItem.create).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          officeId,
          sessionId,
          externalAdId: "64850265",
          status: "resolved",
          raw: rawItem,
          listingId,
          propertyId: "property-1",
          siteId: "site-1",
          resolution: expect.objectContaining({
            linkLevel: "listing",
            siteId: "site-1",
            propertyId: "property-1",
            intakeId: "intake-1",
            transactionType: "monthly",
          }),
          submittedById: userId,
        }),
      },
    );
    expect(result.progress).toEqual(
      expect.objectContaining({
        receivedCount: 1,
        resolvedCount: 1,
        failedCount: 0,
      }),
    );
  });

  it("submits an unresolved item with an error in the same call", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      activeSession(),
    );
    prisma.listingAdvertisementSnapshotItem.findFirst.mockResolvedValue(null);
    prisma.listingAdvertisementSnapshotItem.create.mockResolvedValue({
      id: itemId,
      status: "failed",
      error: "exact unit not found",
    });
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      { status: "failed" },
    ]);
    prisma.listingAdvertisementSnapshotSession.update.mockResolvedValue({});
    const service = new ListingAdvertisementSnapshotsService(prisma);

    const result = await service.submitItem(officeId, userId, "agent", {
      sessionId,
      raw: rawItem,
      error: "exact unit not found",
    });

    expect(prisma.listing.findFirst).not.toHaveBeenCalled();
    expect(prisma.listingAdvertisementSnapshotItem.create).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          status: "failed",
          listingId: null,
          error: "exact unit not found",
        }),
      },
    );
    expect(result.progress.failedCount).toBe(1);
  });

  // 광고는 매물 없이도 저장된다. 연결을 못 찾은 것은 오류가 아니다.
  it("accepts an item with no link at all as resolved", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      activeSession(),
    );
    prisma.listingAdvertisementSnapshotItem.findFirst.mockResolvedValue(null);
    prisma.listingAdvertisementSnapshotItem.create.mockResolvedValue({
      id: itemId,
      status: "resolved",
    });
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      { status: "resolved" },
    ]);
    prisma.listingAdvertisementSnapshotSession.update.mockResolvedValue({});
    const service = new ListingAdvertisementSnapshotsService(prisma);

    const result = await service.submitItem(officeId, userId, "agent", {
      sessionId,
      raw: rawItem,
    });

    expect(prisma.listing.findFirst).not.toHaveBeenCalled();
    expect(prisma.listingAdvertisementSnapshotItem.create).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          status: "resolved",
          listingId: null,
          propertyId: null,
          siteId: null,
          resolution: expect.objectContaining({ linkLevel: "none" }),
          error: null,
        }),
      },
    );
    expect(result.progress.failedCount).toBe(0);
  });

  it("fills the site from a property-level link and leaves the listing empty", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      activeSession(),
    );
    prisma.listingAdvertisementSnapshotItem.findFirst.mockResolvedValue(null);
    prisma.listingAdvertisementSnapshotItem.create.mockResolvedValue({ id: itemId });
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      { status: "resolved" },
    ]);
    prisma.listingAdvertisementSnapshotSession.update.mockResolvedValue({});
    const service = new ListingAdvertisementSnapshotsService(prisma);

    await service.submitItem(officeId, userId, "agent", {
      sessionId,
      raw: rawItem,
      propertyId: "property-1",
    });

    expect(prisma.listingAdvertisementSnapshotItem.create).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          listingId: null,
          propertyId: "property-1",
          siteId: "site-1",
          resolution: expect.objectContaining({ linkLevel: "property" }),
        }),
      },
    );
  });

  it("rejects a listing and a property that do not belong together", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      activeSession(),
    );
    prisma.listingAdvertisementSnapshotItem.findFirst.mockResolvedValue(null);
    const service = new ListingAdvertisementSnapshotsService(prisma);

    await expect(
      service.submitItem(officeId, userId, "agent", {
        sessionId,
        raw: rawItem,
        listingId,
        propertyId: "another-property",
        resolution: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.listingAdvertisementSnapshotItem.create).not.toHaveBeenCalled();
  });

  it("does not let an unreadable item carry a link", async () => {
    const service = new ListingAdvertisementSnapshotsService(createPrisma());

    await expect(
      service.submitItem(officeId, userId, "agent", {
        sessionId,
        raw: rawItem,
        listingId,
        resolution: {},
        error: "ambiguous",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects changed raw data for an already submitted externalAdId", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      activeSession(),
    );
    prisma.listingAdvertisementSnapshotItem.findFirst.mockResolvedValue({
      id: itemId,
      itemHash: "0".repeat(64),
    });
    const service = new ListingAdvertisementSnapshotsService(prisma);

    await expect(
      service.submitItem(officeId, userId, "agent", {
        sessionId,
        raw: rawItem,
        error: "unit missing",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      prisma.listingAdvertisementSnapshotItem.update,
    ).not.toHaveBeenCalled();
  });

  it("returns submitted item IDs so a local one-item run can resume", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      activeSession(),
    );
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      {
        id: itemId,
        externalAdId: "64850265",
        status: "resolved",
        listingId,
        attemptCount: 1,
        error: null,
        submittedAt: new Date(observedAt),
      },
    ]);
    const service = new ListingAdvertisementSnapshotsService(prisma);

    const result = await service.get(officeId, sessionId);

    expect(result.counts).toEqual({
      received: 1,
      resolved: 1,
      failed: 0,
      remaining: 0,
    });
    expect(result.submittedItems).toEqual([
      expect.objectContaining({ externalAdId: "64850265", status: "resolved" }),
    ]);
  });

  it("returns persisted receipt counts after completed items are purged", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue({
      ...activeSession(),
      status: "completed",
      receivedCount: 3,
      resolvedCount: 3,
      completedAt: new Date(observedAt),
    });
    const service = new ListingAdvertisementSnapshotsService(prisma);

    const result = await service.get(officeId, sessionId);

    expect(result.counts).toEqual({
      received: 3,
      resolved: 3,
      failed: 0,
      remaining: 0,
    });
    expect(result.failedItems).toEqual([]);
    expect(result.submittedItems).toEqual([]);
    expect(
      prisma.listingAdvertisementSnapshotItem.findMany,
    ).not.toHaveBeenCalled();
  });

  it("commits the advertisement ledger only after every submitted item resolves", async () => {
    const prisma = createPrisma();
    const session = {
      ...activeSession(),
      receivedCount: 1,
      resolvedCount: 1,
    };
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      session,
    );
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      {
        id: itemId,
        sessionId,
        externalAdId: "64850265",
        status: "resolved",
        raw: rawItem,
        listingId,
        error: null,
      },
    ]);
    prisma.listingAdvertisement.updateMany.mockResolvedValue({ count: 2 });
    prisma.listingAdvertisement.findMany.mockResolvedValue([]);
    prisma.listingAdvertisementSnapshotSession.update.mockResolvedValue({
      ...session,
      status: "completed",
      createdAdvertisements: 1,
      updatedAdvertisements: 0,
      staleAdvertisementsMarked: 2,
      completedAt: new Date(observedAt),
    });
    const service = new ListingAdvertisementSnapshotsService(prisma);

    const result = await service.complete(officeId, userId, "agent", sessionId);

    expect(prisma.listingAdvertisement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId,
        channel: "esiljang",
        listingId,
        propertyId: "property-1",
        siteId: "site-1",
        // 수집기가 읽은 글자를 광고에 남긴다 ("월세" → monthly, 한 줄 주소는 지번 칸)
        transactionType: "monthly",
        rawJibunAddress: "교문동 미래유탑유블레스시티 1동 2810호",
        rawRoadAddress: null,
        externalAdId: "64850265",
        status: "active",
        source: "cp_sync",
        advertisedDeposit: 3000,
        advertisedMonthlyRent: 170,
        providerStatus: "광고중",
        providerStatusObservedAt: new Date(observedAt),
        firstSeenAt: new Date(observedAt),
        lastSeenAt: new Date(observedAt),
        lastSyncedAt: new Date(observedAt),
      }),
    });
    // 새 광고의 첫 상태가 이력에 남는다
    expect(prisma.listingAdvertisementHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId,
        listingAdvertisementId: "ad-created",
        snapshotSessionId: sessionId,
        status: "active",
        advertisedDeposit: 3000,
        advertisedMonthlyRent: 170,
        observedAt: new Date(observedAt),
        source: "cp_sync",
      }),
    });
    // 같은 광고는 열쇠(매물 + 채널)로 먼저 찾는다. 종료된 줄도 대상이다
    expect(prisma.listingAdvertisement.findFirst).toHaveBeenCalledWith({
      where: { officeId, listingId, channel: "esiljang" },
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: "completed",
        createdAdvertisements: 1,
        staleAdvertisementsMarked: 2,
      }),
    );
    expect(
      prisma.listingAdvertisementSnapshotItem.deleteMany,
    ).toHaveBeenCalledWith({ where: { officeId, sessionId } });
  });

  it("stores an advertisement that has no listing, and reads the floor exposure from the CP text", async () => {
    const prisma = createPrisma();
    const raw = { ...rawItem, floor: "저/25", dong: "1", ho: "2810", complexName: "미래유탑유블레스시티" };
    const session = { ...activeSession(), manifestHash: manifestHash([raw as never]) };
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(session);
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      {
        id: itemId,
        sessionId,
        externalAdId: "64850265",
        status: "resolved",
        raw,
        listingId: null,
        propertyId: null,
        siteId: null,
        error: null,
      },
    ]);
    prisma.listingAdvertisement.updateMany.mockResolvedValue({ count: 0 });
    prisma.listingAdvertisement.findMany.mockResolvedValue([]);
    prisma.listingAdvertisementSnapshotSession.update.mockResolvedValue({
      ...session,
      status: "completed",
    });
    const service = new ListingAdvertisementSnapshotsService(prisma);

    await service.complete(officeId, userId, "agent", sessionId);

    expect(prisma.listing.findFirst).not.toHaveBeenCalled();
    expect(prisma.listingAdvertisement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listingId: null,
        propertyId: null,
        siteId: null,
        transactionType: "monthly",
        rawSiteName: "미래유탑유블레스시티",
        rawDong: "1",
        rawHo: "2810",
        rawFloorText: "저/25",
        floorExposure: "band",
      }),
    });
  });

  it("keeps a link a person made when this snapshot found none", async () => {
    const prisma = createPrisma();
    const session = activeSession();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(session);
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      {
        id: itemId,
        sessionId,
        externalAdId: "64850265",
        status: "resolved",
        raw: rawItem,
        listingId: null,
        propertyId: null,
        siteId: null,
        error: null,
      },
    ]);
    prisma.listingAdvertisement.updateMany.mockResolvedValue({ count: 0 });
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
        status: "active",
        naverArticleNo: null,
        id: "ad-1",
        externalAdId: "64850265",
        listingId,
        propertyId: "property-1",
        siteId: "site-1",
        transactionType: "monthly",
        advertisedPrice: null,
        advertisedDeposit: 3000,
        advertisedMonthlyRent: 170,
    });
    prisma.listingAdvertisementSnapshotSession.update.mockResolvedValue({
      ...session,
      status: "completed",
    });
    const service = new ListingAdvertisementSnapshotsService(prisma);

    await service.complete(officeId, userId, "agent", sessionId);

    const { data } = prisma.listingAdvertisement.update.mock.calls[0][0];
    expect(data).not.toHaveProperty("listingId");
    expect(data).not.toHaveProperty("propertyId");
    expect(data).not.toHaveProperty("siteId");
    expect(data.transactionType).toBe("monthly");
  });

  it("appends a CP price observation when the active publication price changes", async () => {
    const prisma = createPrisma();
    const session = {
      ...activeSession(),
      receivedCount: 1,
      resolvedCount: 1,
    };
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      session,
    );
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      {
        id: itemId,
        sessionId,
        externalAdId: "64850265",
        status: "resolved",
        raw: rawItem,
        listingId,
        error: null,
      },
    ]);
    prisma.listingAdvertisement.updateMany.mockResolvedValue({ count: 0 });
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
        status: "active",
        naverArticleNo: null,
        id: "ad-1",
        externalAdId: "64850265",
        advertisedPrice: null,
        advertisedDeposit: 3500,
        advertisedMonthlyRent: 170,
    });
    prisma.listingAdvertisementSnapshotSession.update.mockResolvedValue({
      ...session,
      status: "completed",
      createdAdvertisements: 0,
      updatedAdvertisements: 1,
      staleAdvertisementsMarked: 0,
      completedAt: new Date(observedAt),
    });
    const service = new ListingAdvertisementSnapshotsService(prisma);

    await service.complete(officeId, userId, "agent", sessionId);

    expect(prisma.listingAdvertisement.update).toHaveBeenCalledWith({
      where: { id: "ad-1" },
      data: expect.objectContaining({
        advertisedDeposit: 3000,
      }),
    });
    expect(prisma.listingAdvertisementHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listingAdvertisementId: "ad-1",
        snapshotSessionId: sessionId,
        status: "active",
        advertisedDeposit: 3000,
        advertisedMonthlyRent: 170,
        source: "cp_sync",
      }),
    });
  });

  it("purges legacy items when completion is retried for a completed session", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue({
      ...activeSession(),
      status: "completed",
      receivedCount: 1,
      resolvedCount: 1,
      createdAdvertisements: 1,
      updatedAdvertisements: 0,
      staleAdvertisementsMarked: 0,
      completedAt: new Date(observedAt),
    });
    const service = new ListingAdvertisementSnapshotsService(prisma);

    const result = await service.complete(officeId, userId, "agent", sessionId);

    expect(result.status).toBe("completed");
    expect(
      prisma.listingAdvertisementSnapshotItem.deleteMany,
    ).toHaveBeenCalledWith({ where: { officeId, sessionId } });
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
  });

  it("does not touch the advertisement ledger while a submitted item failed", async () => {
    const prisma = createPrisma();
    prisma.listingAdvertisementSnapshotSession.findFirst.mockResolvedValue(
      activeSession(),
    );
    prisma.listingAdvertisementSnapshotItem.findMany.mockResolvedValue([
      {
        id: itemId,
        externalAdId: "64850265",
        status: "failed",
        error: "unit not found",
      },
    ]);
    const service = new ListingAdvertisementSnapshotsService(prisma);

    await expect(
      service.complete(officeId, userId, "agent", sessionId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
    expect(
      prisma.listingAdvertisementSnapshotItem.deleteMany,
    ).not.toHaveBeenCalled();
  });
});
