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
      listingAdvertisementPriceHistory: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    return {
      prisma,
      service: new ListingAdvertisementsService(prisma as never),
    };
  }

  // ---- findAll ----

  it("returns advertisement rows for the office with linked listing context", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findMany.mockResolvedValue([{ id: "ad-1" }]);
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
          actionContext: {
            comparisonGroupId: null,
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
        officeAdvertisementGroup: expect.objectContaining({
          include: expect.objectContaining({
            mainAdvertisement: true,
            advertisements: expect.any(Object),
          }),
        }),
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
        id: "ad-1",
        naverArticleNo: "2412345678",
        officeAdvertisementGroup: {
          id: "comparison-1",
          lastSyncedAt: observedAt,
          lastSeenAt: observedAt,
          mainAdvertisement: {
            id: "office-ad-1",
            articleNo: "2412345678",
            isActive: true,
            price: 158000,
            deposit: null,
            monthlyRent: null,
            lastSeenAt: observedAt,
          },
          advertisements: [],
        },
      },
    ]);
    prisma.listingAdvertisement.count.mockResolvedValue(1);

    const result = await service.findAll("office-1");

    expect(prisma.externalListing.findMany).not.toHaveBeenCalled();
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        actionContext: expect.objectContaining({
          comparisonGroupId: "comparison-1",
          mainAdvertisementId: "office-ad-1",
          observedAt,
          price: 158000,
        }),
      }),
    );
  });


  // ---- create ----

  it("returns one chronological advertised-price timeline for a listing", async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue({ id: "listing-1" });
    prisma.listingAdvertisementPriceHistory.findMany.mockResolvedValue([
      { id: "price-1" },
    ]);

    const result = await service.findPriceHistory("office-1", "listing-1");

    expect(result).toEqual([{ id: "price-1" }]);
    expect(
      prisma.listingAdvertisementPriceHistory.findMany,
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

  it("creates an active advertisement when no listing-channel conflict exists", async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue({ id: "listing-1" });
    prisma.listingAdvertisement.findFirst.mockResolvedValue(null);
    prisma.listingAdvertisement.create.mockResolvedValue({ id: "ad-1" });

    const result = await service.create("office-1", {
      listingId: "listing-1",
      channel: "esiljang",
      source: "cp_sync",
      externalAdId: "cp-100",
      naverArticleNo: "2412345678",
      naverUrl: "https://fin.land.naver.com/articles/2412345678",
    });

    expect(result).toEqual({ id: "ad-1" });
    expect(prisma.listingAdvertisement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId: "office-1",
        listingId: "listing-1",
        channel: "esiljang",
        status: "active",
        source: "cp_sync",
        externalAdId: "cp-100",
        naverArticleNo: "2412345678",
        naverUrl: "https://fin.land.naver.com/articles/2412345678",
        firstSeenAt: expect.any(Date),
        lastSeenAt: expect.any(Date),
        priceHistories: {
          create: expect.objectContaining({
            officeId: "office-1",
            advertisedPrice: null,
            advertisedDeposit: null,
            advertisedMonthlyRent: null,
            source: "cp_sync",
          }),
        },
      }),
    });
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
      select: { id: true },
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

  it("rejects reactivating to active when another active ad already exists on the same channel", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst
      .mockResolvedValueOnce({
        id: "ad-1",
        officeId: "office-1",
        listingId: "listing-1",
        channel: "esiljang",
        status: "ended",
        endedAt: null,
      })
      .mockResolvedValueOnce({ id: "ad-other-active" });

    await expect(
      service.update("ad-1", "office-1", { status: "active" }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
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

  it("appends the complete advertised price only when a manual price changes", async () => {
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
      advertisedPrice: 98000,
    });

    expect(prisma.listingAdvertisement.update).toHaveBeenCalledWith({
      where: { id: "ad-1" },
      data: expect.objectContaining({
        advertisedPrice: 98000,
        priceHistories: {
          create: expect.objectContaining({
            officeId: "office-1",
            advertisedPrice: 98000,
            advertisedDeposit: null,
            advertisedMonthlyRent: null,
            source: "manual",
          }),
        },
      }),
    });
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

  it("requires a new advertisement row when the external ad ID changes", async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: "ad-1",
      officeId: "office-1",
      listingId: "listing-1",
      channel: "esiljang",
      externalAdId: "cp-100",
      status: "active",
    });

    await expect(
      service.update("ad-1", "office-1", { externalAdId: "cp-200" }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listingAdvertisement.update).not.toHaveBeenCalled();
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
});
