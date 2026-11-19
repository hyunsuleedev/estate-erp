import { Prisma } from "@prisma/client";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { ListingAdvertisementsService } from "./listing-advertisements.service";

jest.mock("@estate-erp/shared", () => ({
  ListingAdvertisementStatus: {
    ACTIVE: "active",
    ENDED: "ended",
  },
  ListingAdvertisementSource: {
    MANUAL: "manual",
    CP_SYNC: "cp_sync",
  },
  ListingAdvertisementChannel: {
    ESILJANG: "esiljang",
    BUDONGSANBANK: "budongsanbank",
  },
}));

describe("ListingAdvertisementsService", () => {
  function createService() {
    const prisma = {
      listing: {
        findFirst: jest.fn(),
      },
      property: {
        findFirst: jest.fn(),
      },
      site: {
        findFirst: jest.fn(),
      },
      externalListing: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      listingAdvertisement: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      listingAdvertisementHistory: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      advertisementChangeRequest: { updateMany: jest.fn() },
      advertisementComparisonRecord: { updateMany: jest.fn() },
      advertisementComparison: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _max: { lastSeenAt: null }, _count: { _all: 0 } }),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    // 광고 한 줄을 잠그고 하는 일은 같은 가짜 클라이언트로 그대로 실행한다
    // 따로 정하지 않으면 고치기는 "읽은 줄 + 고친 칸"을, 만들기는 넣은 값을 돌려준다
    prisma.listingAdvertisement.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...(await prisma.listingAdvertisement.findFirst.mock.results.at(-1)?.value),
      ...data,
    }));
    prisma.listingAdvertisement.create.mockImplementation(async ({ data }: { data: object }) => ({
      id: "ad-new",
      ...data,
    }));
    prisma.$transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work(prisma));
    return {
      prisma,
      service: new ListingAdvertisementsService(prisma as never),
    };
  }

  // ---- findAll ----

  it("returns advertisement rows for the office with linked listing context", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findMany.mockResolvedValue([{ id: "ad-1", changeRequests: [], comparisons: [], comparisonRecords: [] }]);
    prisma.listingAdvertisement.count.mockResolvedValue(1);

    const result = await service.findAll("office-1", {
      page: 1,
      limit: 50,
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(result).toEqual({
      items: [
        {
          id: "ad-1",
          // 연결 단계와 걸린 요청은 조회할 때 계산해 붙인다
          linkLevel: "none",
          changeRequests: [],
          // 네이버 비교를 읽은 적이 없다
          comparison: null,
          actionContext: {
            mainAdvertisementId: null,
            observedAt: null,
            isActive: null,
            price: null,
            deposit: null,
            monthlyRent: null,
          },
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    expect(prisma.listingAdvertisement.findMany).toHaveBeenCalledWith({
      where: { officeId: "office-1" },
      include: expect.objectContaining({
        listing: expect.objectContaining({
          include: expect.objectContaining({
            property: expect.any(Object),
          }),
        }),
        // 매물이 없는 광고는 광고에 직접 걸린 관리 공간 · 건물을 읽는다
        property: expect.any(Object),
        site: true,
        changeRequests: expect.any(Object),
        // 묶음 표 없이 비교 줄과 마지막으로 읽은 시각을 광고에서 바로 읽는다
        comparisons: true,
        comparisonRecords: expect.objectContaining({ take: 1 }),
      }),
      orderBy: { updatedAt: "desc" },
      skip: 0,
      take: 50,
    });
  });

  it("exposes the dedicated My Ads comparison used for a reviewed CP action", async () => {
    const { prisma, service } = createService();
    const observedAt = new Date("2026-07-29T08:00:00.000Z");
    prisma.listingAdvertisement.findMany.mockResolvedValue([
      {
        changeRequests: [],
        id: "ad-1",
        naverArticleNo: "2412345678",
        comparisons: [
          { id: "competitor-1", articleNo: "2499999999", isMine: false, isActive: true, ranking: 1, price: 157000, deposit: null, monthlyRent: null, lastSeenAt: observedAt },
          { id: "office-ad-1", articleNo: "2412345678", isMine: true, isActive: true, ranking: 2, price: 158000, deposit: null, monthlyRent: null, lastSeenAt: observedAt },
        ],
        comparisonRecords: [{ observedAt }],
      },
    ]);
    prisma.listingAdvertisement.count.mockResolvedValue(1);

    const result = await service.findAll("office-1");

    expect(prisma.externalListing.findMany).not.toHaveBeenCalled();
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        actionContext: expect.objectContaining({
          mainAdvertisementId: "office-ad-1",
          observedAt,
          price: 158000,
        }),
        // "바로 이 내 광고"는 네이버 매물번호가 같은 줄이고, 내 줄이 먼저 온다
        comparison: expect.objectContaining({
          observedAt,
          mainAdvertisement: expect.objectContaining({ id: "office-ad-1" }),
          advertisements: [
            expect.objectContaining({ id: "office-ad-1" }),
            expect.objectContaining({ id: "competitor-1" }),
          ],
        }),
      }),
    );
    expect(result.items[0]).not.toHaveProperty("comparisons");
  });


  // ---- create ----

  it("returns one chronological advertised-price timeline for a listing", async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue({ id: "listing-1" });
    prisma.listingAdvertisementHistory.findMany.mockResolvedValue([
      { id: "price-1" },
    ]);

    const result = await service.findPriceHistory("office-1", "listing-1");

    expect(result).toEqual([{ id: "price-1" }]);
    expect(
      prisma.listingAdvertisementHistory.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          officeId: "office-1",
          advertisement: { listingId: "listing-1" },
        },
        orderBy: [{ observedAt: "asc" }, { createdAt: "asc" }],
      }),
    );
  });

  it("rejects creating an advertisement on a listing from another office", async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue(null);

    await expect(
      service.create("office-1", {
        listingId: "listing-from-other-office",
        channel: "esiljang",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.listing.findFirst).toHaveBeenCalledWith({
      where: { id: "listing-from-other-office", officeId: "office-1" },
      select: { id: true, propertyId: true, transactionType: true },
    });
    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
  });

  it("rejects a second active ad on the same listing+channel with 409", async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue({ id: "listing-1" });
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: "ad-existing",
    });

    await expect(
      service.create("office-1", {
        listingId: "listing-1",
        channel: "esiljang",
        status: "active",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
  });

  it.each(["planned", "draft", "paused", "error"])(
    "rejects legacy row-level status %s",
    async (status) => {
      const { service } = createService();

      await expect(
        service.create("office-1", {
          listingId: "listing-1",
          channel: "esiljang",
          status,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it("rejects an invalid status", async () => {
    const { service } = createService();
    await expect(
      service.create("office-1", {
        listingId: "listing-1",
        channel: "esiljang",
        status: "bogus",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a channel slug that violates the shape regex", async () => {
    const { service } = createService();
    await expect(
      service.create("office-1", {
        listingId: "listing-1",
        channel: "Esiljang", // uppercase first letter — not in KNOWN, fails regex
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- update ----

  it("rejects updating an advertisement that belongs to another office", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue(null);

    await expect(
      service.update("ad-1", "office-1", { status: "ended" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.listingAdvertisement.findFirst).toHaveBeenCalledWith({
      where: { id: "ad-1", officeId: "office-1" },
    });
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
  });

  it("auto-fills endedAt when transitioning status to ended", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: "ad-1",
      officeId: "office-1",
      listingId: "listing-1",
      channel: "esiljang",
      status: "active",
      endedAt: null,
    });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: "ad-1" });

    await service.update("ad-1", "office-1", { status: "ended" });

    const updateCall = prisma.listingAdvertisement.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "ad-1" });
    expect(updateCall.data.status).toBe("ended");
    expect(updateCall.data.endedAt).toBeInstanceOf(Date);
  });

  it("does not overwrite an explicit endedAt passed alongside status=ended", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: "ad-1",
      officeId: "office-1",
      listingId: "listing-1",
      channel: "esiljang",
      status: "active",
      endedAt: null,
    });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: "ad-1" });
    const explicit = "2026-04-01T10:00:00.000Z";

    await service.update("ad-1", "office-1", {
      status: "ended",
      endedAt: explicit,
    });

    const updateCall = prisma.listingAdvertisement.update.mock.calls[0][0];
    expect(updateCall.data.endedAt).toBe(explicit);
  });

  it("allows status-update from active to active when only the channel stays the same and no conflict exists", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValueOnce({
      id: "ad-1",
      officeId: "office-1",
      listingId: "listing-1",
      channel: "esiljang",
      status: "active",
      endedAt: null,
    });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: "ad-1" });

    await service.update("ad-1", "office-1", {
      advertisedPrice: 158000,
    });

    // active→active 그대로면 충돌 검사 second findFirst 호출 없음
    expect(prisma.listingAdvertisement.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.listingAdvertisement.update).toHaveBeenCalled();
  });

  it("does not append advertised price history for an unchanged price", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: "ad-1",
      officeId: "office-1",
      listingId: "listing-1",
      channel: "esiljang",
      status: "active",
      advertisedPrice: 100000,
      advertisedDeposit: null,
      advertisedMonthlyRent: null,
    });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: "ad-1" });

    await service.update("ad-1", "office-1", {
      advertisedPrice: 100000,
    });

    const updateData = prisma.listingAdvertisement.update.mock.calls[0][0].data;
    expect(updateData.priceHistories).toBeUndefined();
  });

  // ---- remove ----

  it("rejects removing an advertisement from another office", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue(null);

    await expect(service.remove("ad-1", "office-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.listingAdvertisement.delete).not.toHaveBeenCalled();
  });

  it("deletes an advertisement that belongs to the office", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ id: "ad-1" });
    prisma.listingAdvertisement.delete.mockResolvedValue({ id: "ad-1" });

    await service.remove("ad-1", "office-1");

    expect(prisma.listingAdvertisement.delete).toHaveBeenCalledWith({
      where: { id: "ad-1" },
    });
  });

  // ---- 매물 없는 광고 ----

  it("creates an advertisement without a listing and keeps the CP text", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue(null);
    prisma.listingAdvertisement.create.mockResolvedValue({ id: "ad-9" });

    await service.create("office-1", {
      channel: "esiljang",
      externalAdId: "cp-77",
      transactionType: "sale",
      rawSiteName: "고덕아르테온",
      rawDong: "205",
      rawFloorText: "저/25",
      floorExposure: "band",
      advertisedPrice: 305000,
    });

    expect(prisma.listing.findFirst).not.toHaveBeenCalled();
    expect(prisma.listingAdvertisement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listingId: null,
        propertyId: null,
        siteId: null,
        transactionType: "sale",
        rawSiteName: "고덕아르테온",
        rawDong: "205",
        rawFloorText: "저/25",
        floorExposure: "band",
      }),
    });
  });

  it("refuses a second active advertisement with the same CP number", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ id: "ad-1" });

    await expect(
      service.create("office-1", { channel: "esiljang", externalAdId: "cp-77" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
  });

  it("fills the property and site when linking to a listing", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst
      .mockResolvedValueOnce({ id: "ad-1", officeId: "office-1", listingId: null, channel: "esiljang", status: "active" })
      .mockResolvedValueOnce(null);
    prisma.listing.findFirst.mockResolvedValue({ id: "listing-1", propertyId: "property-1", transactionType: "sale" });
    prisma.property.findFirst.mockResolvedValue({ id: "property-1", siteId: "site-1" });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: "ad-1" });

    await service.link("ad-1", "office-1", { listingId: "listing-1" });

    expect(prisma.listingAdvertisement.update).toHaveBeenCalledWith({
      where: { id: "ad-1" },
      data: { listingId: "listing-1", propertyId: "property-1", siteId: "site-1", transactionType: "sale" },
    });
  });

  it("drops the listing when relinking only to a property, and clears everything on an empty link", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ id: "ad-1", officeId: "office-1", listingId: "listing-1", channel: "esiljang", status: "active" });
    prisma.property.findFirst.mockResolvedValue({ id: "property-2", siteId: "site-2" });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: "ad-1" });

    await service.link("ad-1", "office-1", { propertyId: "property-2" });
    expect(prisma.listingAdvertisement.update).toHaveBeenLastCalledWith({
      where: { id: "ad-1" },
      data: { listingId: null, propertyId: "property-2", siteId: "site-2" },
    });

    await service.link("ad-1", "office-1", {});
    expect(prisma.listingAdvertisement.update).toHaveBeenLastCalledWith({
      where: { id: "ad-1" },
      data: { listingId: null, propertyId: null, siteId: null },
    });
  });

  it("does not link an advertisement to a listing of another transaction type", async () => {
    const { prisma, service } = createService();
    // 전세 광고를 같은 집의 매매 매물에 이으면 광고의 거래유형이 매물을 따라 바뀐다 — 잇지 않는다
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ id: "ad-1", officeId: "office-1", listingId: null, transactionType: "jeonse", channel: "esiljang", status: "active" });
    prisma.listing.findFirst.mockResolvedValue({ id: "listing-1", propertyId: "property-1", transactionType: "sale" });
    prisma.property.findFirst.mockResolvedValue({ id: "property-1", siteId: "site-1" });

    await expect(service.link("ad-1", "office-1", { listingId: "listing-1" })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
  });

  it("locks the advertisement row and refuses a direct edit made from stale prices", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: "ad-1", officeId: "office-1", listingId: "listing-1", channel: "esiljang", status: "active", source: "cp_read",
      advertisedPrice: 315000, advertisedDeposit: null, advertisedMonthlyRent: null,
    });
    prisma.listingAdvertisement.update.mockResolvedValue({ id: "ad-1" });

    // 화면은 32억을 보고 있었는데 그 사이 수집이 31.5억으로 바꿨다
    await expect(
      service.update("ad-1", "office-1", { advertisedPrice: 310000, expected: { advertisedPrice: 320000 } }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalled();

    await service.update("ad-1", "office-1", { advertisedPrice: 310000, expected: { advertisedPrice: 315000 } });
    expect(prisma.listingAdvertisement.update).toHaveBeenCalledTimes(1);
    // expected는 확인에만 쓰고 저장하지 않는다
    expect(prisma.listingAdvertisement.update.mock.calls[0][0].data).not.toHaveProperty("expected");
  });

  it("refuses a listing and a property that do not belong together", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ id: "ad-1", officeId: "office-1", listingId: null, channel: "esiljang", status: "active" });
    prisma.listing.findFirst.mockResolvedValue({ id: "listing-1", propertyId: "property-1", transactionType: "sale" });

    await expect(
      service.link("ad-1", "office-1", { listingId: "listing-1", propertyId: "property-2" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
  });

  it("does not let a site from another office be linked", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ id: "ad-1", officeId: "office-1", listingId: null, channel: "esiljang", status: "active" });
    prisma.site.findFirst.mockResolvedValue(null);

    await expect(
      service.link("ad-1", "office-1", { siteId: "private-site-of-another-office" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.site.findFirst).toHaveBeenCalledWith({
      where: { id: "private-site-of-another-office", OR: [{ isPublic: true }, { officeId: "office-1" }] },
      select: { id: true },
    });
  });

  it("filters by link level and reports the level of each row", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findMany.mockResolvedValue([
      { id: "ad-1", listingId: "l", propertyId: "p", siteId: "s", changeRequests: [], comparisons: [], comparisonRecords: [] },
      { id: "ad-2", listingId: null, propertyId: "p", siteId: "s", changeRequests: [], comparisons: [], comparisonRecords: [] },
      { id: "ad-3", listingId: null, propertyId: null, siteId: "s", changeRequests: [], comparisons: [], comparisonRecords: [] },
      { id: "ad-4", listingId: null, propertyId: null, siteId: null, changeRequests: [], comparisons: [], comparisonRecords: [] },
    ]);
    prisma.listingAdvertisement.count.mockResolvedValue(4);

    const result = await service.findAll("office-1", { link: "no_listing" });

    expect(prisma.listingAdvertisement.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ officeId: "office-1" }, { listingId: null }],
    });
    expect(result.items.map((item) => item.linkLevel)).toEqual(["listing", "property", "site", "none"]);
    await expect(service.findAll("office-1", { link: "everything" as never })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("says whether a requested change has shown up on the advertisement", async () => {
    const { prisma, service } = createService();
    const request = (kind: string, toValue: unknown) => ({ id: kind, kind, toValue, task: { status: "pending" } });
    prisma.listingAdvertisement.findMany.mockResolvedValue([
      {
        comparisons: [],
        comparisonRecords: [],
        id: "ad-1",
        status: "active",
        advertisedPrice: 315000,
        advertisedDeposit: null,
        advertisedMonthlyRent: null,
        floorExposure: "exact",
        changeRequests: [
          request("price", { price: 315000 }),
          request("price", { price: 310000 }),
          request("floor_exposure", { floorExposure: "band" }),
          request("takedown", null),
          request("readvertise", null),
        ],
      },
    ]);
    prisma.listingAdvertisement.count.mockResolvedValue(1);

    const result = await service.findAll("office-1", {});

    expect(result.items[0].changeRequests.map((item) => item.fulfilled)).toEqual([true, false, false, false, null]);
  });

  // ---- 광고 한 줄 = 한 광고 ----

  const liveAd = {
    id: "ad-1", officeId: "office-1", listingId: "listing-1", propertyId: "property-1", siteId: "site-1",
    channel: "esiljang", status: "active", source: "cp_sync", transactionType: "sale", externalAdId: "cp-1",
    naverArticleNo: "2400000001", advertisedPrice: 320000, advertisedDeposit: null, advertisedMonthlyRent: null,
    firstSeenAt: new Date("2026-11-01"), endedAt: null,
  };

  function linkedListing(prisma: ReturnType<typeof createService>["prisma"]) {
    prisma.listing.findFirst.mockResolvedValue({ id: "listing-1", propertyId: "property-1", transactionType: "sale" });
    prisma.property.findFirst.mockResolvedValue({ id: "property-1", siteId: "site-1" });
  }

  it("creates a new advertisement and writes its first history row", async () => {
    const { prisma, service } = createService();
    linkedListing(prisma);
    prisma.listingAdvertisement.findFirst.mockResolvedValue(null);

    await service.create("office-1", { listingId: "listing-1", channel: "esiljang", advertisedPrice: 320000, naverArticleNo: "2400000001" });

    expect(prisma.listingAdvertisement.create).toHaveBeenCalledTimes(1);
    expect(prisma.listingAdvertisementHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listingAdvertisementId: "ad-new", status: "active", naverArticleNo: "2400000001", advertisedPrice: 320000, source: "manual",
      }),
    });
  });

  it("brings an ended advertisement of the same listing and channel back instead of adding a row", async () => {
    const { prisma, service } = createService();
    linkedListing(prisma);
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ ...liveAd, status: "ended", endedAt: new Date("2026-11-12") });

    // 재광고: 네이버 번호가 새로 나왔다
    await service.create("office-1", { listingId: "listing-1", channel: "esiljang", source: "cp_sync", externalAdId: "cp-1", naverArticleNo: "2400000099", advertisedPrice: 320000 });

    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
    const { where, data } = prisma.listingAdvertisement.update.mock.calls[0][0];
    expect(where).toEqual({ id: "ad-1" });
    expect(data).toEqual(expect.objectContaining({ status: "active", endedAt: null, naverArticleNo: "2400000099" }));
    // 다시 게재된 것과 바뀐 네이버 번호가 이력에 남는다
    expect(prisma.listingAdvertisementHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ listingAdvertisementId: "ad-1", status: "active", naverArticleNo: "2400000099", source: "cp_sync" }),
    });
  });

  it("does not let a person register over an advertisement that is already live", async () => {
    const { prisma, service } = createService();
    linkedListing(prisma);
    prisma.listingAdvertisement.findFirst.mockResolvedValue(liveAd);

    await expect(
      service.create("office-1", { listingId: "listing-1", channel: "esiljang", advertisedPrice: 310000 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
  });

  it("updates the same row when the agent reports a live advertisement again", async () => {
    const { prisma, service } = createService();
    linkedListing(prisma);
    prisma.listingAdvertisement.findFirst.mockResolvedValue(liveAd);

    await service.create("office-1", { listingId: "listing-1", channel: "esiljang", source: "cp_sync", externalAdId: "cp-1", naverArticleNo: "2400000001", advertisedPrice: 315000 });

    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
    expect(prisma.listingAdvertisement.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ advertisedPrice: 315000 }));
    expect(prisma.listingAdvertisementHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ advertisedPrice: 315000, status: "active" }),
    });
  });

  it("writes history only when the status, Naver number or price actually changes", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue(liveAd);

    await service.update("ad-1", "office-1", { memo: "메모만 고침", advertisedPrice: 320000 });
    expect(prisma.listingAdvertisementHistory.create).not.toHaveBeenCalled();

    await service.update("ad-1", "office-1", { advertisedPrice: 315000 });
    await service.update("ad-1", "office-1", { naverArticleNo: "2400000099" });
    await service.update("ad-1", "office-1", { status: "ended" });
    expect(prisma.listingAdvertisementHistory.create.mock.calls.map(([call]: [{ data: Record<string, unknown> }]) => [call.data.status, call.data.naverArticleNo, call.data.advertisedPrice])).toEqual([
      ["active", "2400000001", 315000],
      ["active", "2400000099", 320000],
      ["ended", "2400000001", 320000],
    ]);
  });

  it("accepts a new CP number on the same advertisement and maps a key collision to a conflict", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue(liveAd);

    // 재광고로 CP 번호가 새로 나와도 같은 줄이다
    await service.update("ad-1", "office-1", { externalAdId: "cp-2" });
    expect(prisma.listingAdvertisement.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ externalAdId: "cp-2" }));

    // 채널을 바꿨더니 그 매물 · 채널의 광고가 이미 있다 (유일 인덱스)
    prisma.listingAdvertisement.findFirst.mockResolvedValue({ ...liveAd, source: "manual", externalAdId: null, naverArticleNo: null, lastSyncedAt: null, naverUrl: null });
    prisma.listingAdvertisement.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }),
    );
    await expect(service.update("ad-1", "office-1", { channel: "peterpan" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("folds an older advertisement of the same listing and channel into the one being linked", async () => {
    const { prisma, service } = createService();
    linkedListing(prisma);
    const unlinked = { ...liveAd, id: "ad-2", listingId: null, propertyId: null, siteId: null, firstSeenAt: new Date("2026-11-15") };
    const older = { ...liveAd, id: "ad-1", status: "ended" };
    prisma.listingAdvertisement.findFirst
      .mockResolvedValueOnce(unlinked) // 연결할 광고
      .mockResolvedValueOnce(older); // 그 매물 · 채널에 이미 있던 광고

    await service.link("ad-2", "office-1", { listingId: "listing-1" });

    // 지나간 이력 · 요청 · 비교 기록은 남는 줄로 옮기고 옛 줄은 지운다
    expect(prisma.listingAdvertisementHistory.updateMany).toHaveBeenCalledWith({ where: { listingAdvertisementId: "ad-1" }, data: { listingAdvertisementId: "ad-2" } });
    expect(prisma.advertisementChangeRequest.updateMany).toHaveBeenCalledWith({ where: { advertisementId: "ad-1" }, data: { advertisementId: "ad-2" } });
    expect(prisma.listingAdvertisement.delete).toHaveBeenCalledWith({ where: { id: "ad-1" } });
    expect(prisma.listingAdvertisement.update).toHaveBeenLastCalledWith({
      where: { id: "ad-2" },
      data: { listingId: "listing-1", propertyId: "property-1", siteId: "site-1", transactionType: "sale" },
    });

    // 둘 다 게재 중이고 CP 광고 번호가 서로 다르면 같은 집이 두 번 올라가 있는 것이라 합치지 않는다
    prisma.listingAdvertisement.findFirst.mockReset();
    prisma.listingAdvertisement.findFirst.mockResolvedValueOnce(unlinked).mockResolvedValueOnce({ ...older, status: "active", externalAdId: "cp-other" });
    await expect(service.link("ad-2", "office-1", { listingId: "listing-1" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("keeps the live advertisement's state when the row being linked is the ended one", async () => {
    const { prisma, service } = createService();
    linkedListing(prisma);
    // 연결하려는 줄은 종료돼 있고, 그 매물 · 채널에 이미 있던 줄이 지금 게재 중인 광고다
    const endedLoose = { ...liveAd, id: "ad-2", listingId: null, propertyId: null, siteId: null, status: "ended", endedAt: new Date("2026-11-10"), externalAdId: null, naverArticleNo: null, advertisedPrice: 330000, lastSeenAt: new Date("2026-11-10") };
    const live = { ...liveAd, id: "ad-1", lastSeenAt: new Date("2026-11-17") };
    prisma.listingAdvertisement.findFirst.mockResolvedValueOnce(endedLoose).mockResolvedValueOnce(live);

    await service.link("ad-2", "office-1", { listingId: "listing-1" });

    // 합치면서 살아 있는 광고가 종료된 것으로 바뀌지 않는다: 남는 줄이 게재 중인 쪽의 상태를 이어받는다
    expect(prisma.listingAdvertisement.delete).toHaveBeenCalledWith({ where: { id: "ad-1" } });
    expect(prisma.listingAdvertisement.update.mock.calls[0][0]).toEqual({
      where: { id: "ad-2" },
      data: expect.objectContaining({
        status: "active", endedAt: null, externalAdId: "cp-1", naverArticleNo: "2400000001", advertisedPrice: 320000,
      }),
    });
    // 지우기가 먼저다 (게재 중인 CP 광고 번호는 한 줄만 가질 수 있다)
    expect(prisma.listingAdvertisement.delete.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.listingAdvertisement.update.mock.invocationCallOrder[0],
    );
  });

  it("keeps the most recently read comparison when two rows are merged", async () => {
    const { prisma, service } = createService();
    linkedListing(prisma);
    // 연결하려는 줄이 게재 중인 "지금의 광고"지만, 최신 네이버 비교는 이미 있던 종료된 줄에 붙어 있다
    const current = { ...liveAd, id: "ad-2", listingId: null, propertyId: null, siteId: null, lastSeenAt: new Date("2026-11-17") };
    const older = { ...liveAd, id: "ad-1", status: "ended", lastSeenAt: new Date("2026-11-10") };
    prisma.listingAdvertisement.findFirst.mockResolvedValueOnce(current).mockResolvedValueOnce(older);
    const set = (readAt: string, count: number) => ({ _max: { lastSeenAt: new Date(readAt) }, _count: { _all: count } });
    prisma.advertisementComparison.aggregate.mockImplementation(async ({ where }: { where: { advertisementId: string } }) =>
      where.advertisementId === "ad-1" ? set("2026-11-16", 5) : set("2026-11-03", 4),
    );
    // 두 벌 모두 남는 줄의 네이버 번호를 가진 줄이 있다 → 더 최근에 읽은 쪽이 남는다
    prisma.advertisementComparison.count.mockResolvedValue(1);

    await service.link("ad-2", "office-1", { listingId: "listing-1" });

    expect(prisma.advertisementComparison.deleteMany).toHaveBeenCalledWith({ where: { advertisementId: "ad-2" } });
    expect(prisma.advertisementComparison.updateMany).toHaveBeenCalledWith({
      where: { advertisementId: "ad-1" },
      data: { advertisementId: "ad-2" },
    });
  });

  it("does not rewrite comparison rows when the Naver number changes", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue(liveAd);

    // 재광고든 잘못 적은 번호를 바로잡은 것이든, 어느 줄이 "바로 이 광고"인지는 저장하지 않는다.
    // 읽을 때 광고의 지금 번호로 가른다 (저장해 두면 번호가 바뀔 때 어긋난다).
    await service.update("ad-1", "office-1", { naverArticleNo: "2400000099" });
    expect(prisma.advertisementComparison.updateMany).not.toHaveBeenCalled();
  });

  it("treats a hand-entered live row and the CP-read live row as the same advertisement", async () => {
    const { prisma, service } = createService();
    linkedListing(prisma);
    // 사람이 먼저 손으로 넣어 둔 줄(CP 번호 없음)과, 연결 없이 들어온 CP 수집 줄. 둘 다 게재 중이다
    const cpRow = { ...liveAd, id: "ad-2", listingId: null, propertyId: null, siteId: null };
    const manualRow = { ...liveAd, id: "ad-1", source: "manual", externalAdId: null, naverArticleNo: null };
    prisma.listingAdvertisement.findFirst.mockResolvedValueOnce(cpRow).mockResolvedValueOnce(manualRow);

    await expect(service.link("ad-2", "office-1", { listingId: "listing-1" })).resolves.toBeDefined();
    expect(prisma.listingAdvertisement.delete).toHaveBeenCalledWith({ where: { id: "ad-1" } });
  });
});
