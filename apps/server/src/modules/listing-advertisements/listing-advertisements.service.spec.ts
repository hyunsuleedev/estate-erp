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
      advertisementSyncRun: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      advertisementSyncStep: {
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      agentRun: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const controlPlane = {
      getOrCreateSession: jest.fn(),
      updateSession: jest.fn(),
      createWakeup: jest.fn(),
      getSession: jest.fn(),
      listSessions: jest.fn(),
      listWakeups: jest.fn(),
    };
    return {
      prisma,
      controlPlane,
      service: new ListingAdvertisementsService(
        prisma as never,
        controlPlane as never,
      ),
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

  it("creates a durable CP-to-Naver workflow with explicit dependencies", async () => {
    const { prisma, service } = createService();
    prisma.advertisementSyncRun.findFirst.mockResolvedValue(null);
    prisma.advertisementSyncRun.create.mockResolvedValue({ id: "sync-run-1" });
    jest
      .spyOn(service as never, "advanceFullSyncRun" as never)
      .mockResolvedValue(undefined as never);
    jest.spyOn(service, "getFullSyncStatus").mockResolvedValue({
      run: { id: "sync-run-1", status: "running", steps: [] },
      session: null,
      wakeup: null,
    } as never);

    const result = await service.requestFullSync("office-1", "user-1", {
      executionTarget: "local",
      runnerDeviceId: "device-1",
      credentialProviders: ["esiljang", "budongsanbank"],
    });

    expect(prisma.advertisementSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officeId: "office-1",
          workflowKey: "full-cp-and-naver-refresh",
          requestedBy: "user-1",
          channels: ["esiljang", "budongsanbank"],
          context: expect.objectContaining({
            scope: "all_cp_advertisements",
            executionTarget: "local",
            runnerDeviceId: "device-1",
            compareEveryImportedAdvertisement: true,
          }),
          steps: {
            create: expect.arrayContaining([
              expect.objectContaining({
                stepKey: "cp_import_esiljang",
                status: "ready",
                skillKey: "esiljang-ad-reader",
                input: expect.objectContaining({
                  executionTarget: "local",
                  runnerDeviceId: "device-1",
                  credentialProvider: "esiljang",
                }),
              }),
              expect.objectContaining({
                stepKey: "cp_import_budongsanbank",
                status: "ready",
                skillKey: "budongsanbank-ad-reader",
                input: expect.objectContaining({
                  executionTarget: "local",
                  runnerDeviceId: "device-1",
                  credentialProvider: "budongsanbank",
                }),
              }),
              expect.objectContaining({
                stepKey: "resolve_exact_listing_and_unit",
                status: "blocked",
                dependsOnKeys: [
                  "cp_import_esiljang",
                  "cp_import_budongsanbank",
                ],
              }),
              expect.objectContaining({
                stepKey: "naver_compare_all",
                skillKey: "naver-real-estate-reader",
                dependsOnKeys: ["resolve_exact_listing_and_unit"],
                input: expect.objectContaining({
                  scope: "every_imported_advertisement",
                }),
              }),
            ]),
          },
        }),
        select: { id: true },
      }),
    );
    expect(
      (service as unknown as { advanceFullSyncRun: jest.Mock })
        .advanceFullSyncRun,
    ).toHaveBeenCalledWith("office-1", "sync-run-1", "user-1");
    expect(result).toEqual({
      created: true,
      run: { id: "sync-run-1", status: "running", steps: [] },
      session: null,
      wakeup: null,
    });
  });

  it("rejects a CP sync that is not bound to a credential-ready local runner", async () => {
    const { service } = createService();

    await expect(
      service.requestFullSync("office-1", "user-1"),
    ).rejects.toThrow(
      "CP 광고 동기화는 계정이 저장된 데스크톱 로컬 실행기에서 시작해야 합니다.",
    );
    await expect(
      service.requestFullSync("office-1", "user-1", {
        executionTarget: "local",
        runnerDeviceId: "device-1",
        credentialProviders: ["esiljang"],
      }),
    ).rejects.toThrow("budongsanbank");
  });

  it("advances the workflow when a linked Skill run completes", async () => {
    const { prisma, service } = createService();
    prisma.agentRun.findFirst.mockResolvedValue({
      id: "agent-run-1",
      status: "completed",
      result: {
        totalCount: 20,
        processedCount: 20,
        failedCount: 0,
      },
      error: null,
      session: {
        status: "complete",
        waitingReason: null,
        advertisementSyncStepId: "sync-step-1",
      },
    });
    prisma.advertisementSyncStep.findFirst.mockResolvedValue({
      id: "sync-step-1",
      runId: "sync-run-1",
      status: "running",
    });
    prisma.advertisementSyncStep.updateMany.mockResolvedValue({ count: 1 });
    jest
      .spyOn(service as never, "advanceFullSyncRun" as never)
      .mockResolvedValue(undefined as never);
    jest.spyOn(service, "getFullSyncStatus").mockResolvedValue({
      run: {
        id: "sync-run-1",
        status: "running",
        steps: [
          {
            id: "sync-step-1",
            status: "succeeded",
          },
        ],
      },
      session: null,
      wakeup: null,
    } as never);

    await service.handleAgentRunCompletion("office-1", "agent-run-1");

    expect(prisma.advertisementSyncStep.updateMany).toHaveBeenCalledWith({
      where: {
        id: "sync-step-1",
        officeId: "office-1",
        status: { in: ["ready", "queued", "running"] },
      },
      data: expect.objectContaining({
        status: "succeeded",
        progressTotal: 20,
        progressComplete: 20,
        progressFailed: 0,
      }),
    });
    expect(
      (service as unknown as { advanceFullSyncRun: jest.Mock })
        .advanceFullSyncRun,
    ).toHaveBeenCalledWith("office-1", "sync-run-1");
  });

  it("opens the resolve step only after both CP reader steps succeed", async () => {
    const { prisma, service } = createService();
    const baseRun = {
      id: "sync-run-1",
      officeId: "office-1",
      schemaVersion: 1,
      requestedBy: "user-1",
      status: "running",
    };
    prisma.advertisementSyncRun.findFirst
      .mockResolvedValueOnce({
        ...baseRun,
        steps: [
          {
            id: "cp-1",
            stepKey: "cp_import_esiljang",
            position: 1,
            kind: "cp_full_import",
            title: "이실장 광고 가져오기",
            status: "succeeded",
            skillKey: "esiljang-ad-reader",
            dependsOnKeys: [],
          },
          {
            id: "cp-2",
            stepKey: "cp_import_budongsanbank",
            position: 2,
            kind: "cp_full_import",
            title: "부동산뱅크 광고 가져오기",
            status: "succeeded",
            skillKey: "budongsanbank-ad-reader",
            dependsOnKeys: [],
          },
          {
            id: "resolve-1",
            stepKey: "resolve_exact_listing_and_unit",
            position: 3,
            kind: "resolve_exact_listing_and_unit",
            title: "매물·호실 확정",
            status: "blocked",
            skillKey: "my-advertisements-sync",
            dependsOnKeys: [
              "cp_import_esiljang",
              "cp_import_budongsanbank",
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        ...baseRun,
        steps: [
          {
            id: "resolve-1",
            stepKey: "resolve_exact_listing_and_unit",
            position: 3,
            kind: "resolve_exact_listing_and_unit",
            title: "매물·호실 확정",
            status: "ready",
            skillKey: "my-advertisements-sync",
            dependsOnKeys: [
              "cp_import_esiljang",
              "cp_import_budongsanbank",
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        ...baseRun,
        steps: [
          {
            id: "resolve-1",
            stepKey: "resolve_exact_listing_and_unit",
            position: 3,
            kind: "resolve_exact_listing_and_unit",
            title: "매물·호실 확정",
            status: "queued",
            skillKey: "my-advertisements-sync",
            dependsOnKeys: [
              "cp_import_esiljang",
              "cp_import_budongsanbank",
            ],
          },
        ],
      });
    prisma.advertisementSyncStep.updateMany.mockResolvedValue({ count: 1 });
    const queueSpy = jest
      .spyOn(service as never, "queueFullSyncStep" as never)
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(service as never, "updateFullSyncRunStatus" as never)
      .mockResolvedValue(undefined as never);

    await (
      service as unknown as {
        advanceFullSyncRun: (
          officeId: string,
          runId: string,
        ) => Promise<void>;
      }
    ).advanceFullSyncRun("office-1", "sync-run-1");

    expect(prisma.advertisementSyncStep.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["resolve-1"] },
        officeId: "office-1",
        status: "blocked",
      },
      data: { status: "ready" },
    });
    expect(queueSpy).toHaveBeenCalledWith(
      "office-1",
      expect.objectContaining({ id: "sync-run-1" }),
      "resolve-1",
      "user-1",
    );
  });

  it("queues each ready CP step for its matching Skill in one batch wakeup", async () => {
    const { prisma, controlPlane, service } = createService();
    prisma.advertisementSyncStep.updateMany.mockResolvedValue({ count: 1 });
    prisma.advertisementSyncStep.findFirstOrThrow.mockResolvedValue({
      id: "sync-step-1",
      stepKey: "cp_import_esiljang",
      kind: "cp_full_import",
      status: "queued",
      skillKey: "esiljang-ad-reader",
      skillVersion: "computer-use-v1",
      attemptCount: 1,
      input: {
        scope: "all_advertisements",
        channel: "esiljang",
        executionTarget: "local",
        runnerDeviceId: "device-1",
      },
    });
    prisma.advertisementSyncRun.updateMany.mockResolvedValue({ count: 1 });
    controlPlane.getOrCreateSession.mockResolvedValue({ id: "session-1" });
    controlPlane.updateSession.mockResolvedValue({ id: "session-1" });
    controlPlane.createWakeup.mockResolvedValue({
      created: true,
      wakeup: { id: "wakeup-1" },
    });

    await (
      service as unknown as {
        queueFullSyncStep: (
          officeId: string,
          run: Record<string, unknown>,
          stepId: string,
          requestedBy: string,
        ) => Promise<void>;
      }
    ).queueFullSyncStep(
      "office-1",
      {
        id: "sync-run-1",
        schemaVersion: 1,
        requestedBy: "user-1",
        steps: [
          {
            id: "sync-step-1",
            stepKey: "cp_import_esiljang",
            position: 1,
            kind: "cp_full_import",
            title: "이실장 광고 가져오기",
            status: "ready",
            skillKey: "esiljang-ad-reader",
          },
        ],
      },
      "sync-step-1",
      "user-1",
    );

    expect(controlPlane.getOrCreateSession).toHaveBeenCalledWith(
      "office-1",
      expect.objectContaining({
        agentKey: "esiljang-ad-reader",
        adapter: "local_mcp",
        advertisementSyncStepId: "sync-step-1",
      }),
    );
    expect(controlPlane.createWakeup).toHaveBeenCalledWith(
      "office-1",
      expect.objectContaining({
        source: "esiljang-ad-reader",
        requestedBy: "user-1",
        payload: expect.objectContaining({
          workflowRunId: "sync-run-1",
          workflowStepId: "sync-step-1",
          skillKey: "esiljang-ad-reader",
          runnerDeviceId: "device-1",
        }),
      }),
    );
  });

  // ---- create ----

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
