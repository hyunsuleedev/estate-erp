import { ConflictException } from "@nestjs/common";
import {
  AgentActionBlockerReason,
  AgentActionCapability,
  AgentActionExecutionStatus,
  AgentActionReviewStatus,
  AgentActionVerificationStatus,
} from "@estate-erp/shared";
import { hashCanonicalJson } from "./agent-action-hash.util";
import { AgentActionRequestsService } from "./agent-action-requests.service";

const OFFICE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_AD_ID = "44444444-4444-4444-8444-444444444444";
const COMPARISON_GROUP_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST_ID = "66666666-6666-4666-8666-666666666666";
const ESCALATION_TASK_ID = "77777777-7777-4777-8777-777777777777";

const actor = {
  actor: "mcp:user-1",
  source: "mcp" as const,
  userId: USER_ID,
  role: "agent",
};

function officeAdvertisement(overrides: Record<string, unknown> = {}) {
  return {
    id: "office-ad-1",
    articleNo: "2412345678",
    sourceUrl: "https://fin.land.naver.com/articles/2412345678",
    isMine: true,
    isMain: true,
    isActive: true,
    articleName: "샘플아파트",
    realtorName: "샘플공인",
    price: 150000,
    deposit: null,
    monthlyRent: null,
    ranking: 3,
    sameAddrCnt: 2,
    articleConfirmYmd: "20260727",
    floorInfo: "중/25",
    floorExposureMode: "band",
    verificationTypeCode: "OWNER",
    seango: false,
    epju: false,
    lastSeenAt: new Date("2026-07-27T12:00:00.000Z"),
    ...overrides,
  };
}

function listingAdvertisement(overrides: Record<string, unknown> = {}) {
  const mainAdvertisement = officeAdvertisement();
  return {
    id: LISTING_AD_ID,
    listingId: "listing-1",
    channel: "esiljang",
    status: "active",
    advertisedPrice: 150000,
    advertisedDeposit: null,
    advertisedMonthlyRent: null,
    externalAdId: "cp-100",
    naverArticleNo: "2412345678",
    lastSyncedAt: new Date("2026-07-27T11:50:00.000Z"),
    listing: {
      property: {
        site: { name: "샘플아파트" },
        unit: {
          name: "1201호",
          floor: 12,
          dong: { name: "101동" },
          siteUnitType: { name: "84A" },
        },
      },
    },
    officeAdvertisementGroup: {
      id: COMPARISON_GROUP_ID,
      mainAdvertisementId: mainAdvertisement.id,
      ownPrice: 150000,
      ownDeposit: null,
      ownMonthlyRent: null,
      relatedPriceMin: 149000,
      relatedPriceMax: 150000,
      relatedCount: 2,
      lastSeenAt: new Date("2026-07-27T12:00:00.000Z"),
      lastSyncedAt: new Date("2026-07-27T12:00:00.000Z"),
      mainAdvertisement,
      advertisements: [
        mainAdvertisement,
        officeAdvertisement({
          id: "office-ad-2",
          articleNo: "2412345679",
          isMine: false,
          isMain: false,
          price: 149000,
          ranking: 1,
        }),
      ],
    },
    ...overrides,
  };
}

function officeAdvertisementEvidence(
  advertisement: ReturnType<typeof officeAdvertisement>,
) {
  return {
    ...advertisement,
    lastSeenAt: advertisement.lastSeenAt.toISOString(),
  };
}

function requestBaseState(advertisement: ReturnType<typeof listingAdvertisement>) {
  const group = advertisement.officeAdvertisementGroup;
  return {
    schemaVersion: 1,
    target: {
      schemaVersion: 1,
      listingAdvertisementId: advertisement.id,
      channel: advertisement.channel,
      externalAdId: advertisement.externalAdId,
      articleNo: advertisement.naverArticleNo,
      isActive: advertisement.status === "active",
      price: advertisement.advertisedPrice,
      deposit: advertisement.advertisedDeposit,
      monthlyRent: advertisement.advertisedMonthlyRent,
      lastSyncedAt: advertisement.lastSyncedAt.toISOString(),
    },
    comparison: {
      schemaVersion: 1,
      officeAdvertisementGroupId: group.id,
      mainAdvertisementId: group.mainAdvertisement.id,
      observedAt: group.lastSyncedAt.toISOString(),
      ownPrice: group.ownPrice,
      ownDeposit: group.ownDeposit,
      ownMonthlyRent: group.ownMonthlyRent,
      relatedPriceMin: group.relatedPriceMin,
      relatedPriceMax: group.relatedPriceMax,
      relatedCount: group.relatedCount,
      mainAdvertisement: officeAdvertisementEvidence(group.mainAdvertisement),
      advertisements: group.advertisements.map(officeAdvertisementEvidence),
    },
  };
}

describe("AgentActionRequestsService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-27T12:30:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a Task-free exact-hash request from the My Ads comparison", async () => {
    const listingAd = listingAdvertisement();
    const reviewer = { id: USER_ID, name: "직원", role: "agent" };
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: USER_ID }),
      },
      listingAdvertisement: {
        findFirst: jest.fn().mockResolvedValue(listingAd),
      },
      agentActionRequest: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: REQUEST_ID,
          ...data,
          escalationTaskId: null,
          reviewer,
          escalationTask: null,
          listingAdvertisement: listingAd,
          createdByUser: null,
          decidedBy: null,
          executedBy: null,
          verifications: [],
          updatedAt: new Date(),
        })),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ officeId: OFFICE_ID }),
      },
      activityLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(reviewer) },
      listingAdvertisement: {
        findFirst: jest.fn().mockResolvedValue(listingAd),
      },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const notifications = {
      notify: jest.fn().mockResolvedValue([{ id: "notification-1" }]),
    };
    const service = new AgentActionRequestsService(
      prisma as never,
      notifications as never,
    );

    const result = await service.create(
      OFFICE_ID,
      {
        reviewerId: USER_ID,
        listingAdvertisementId: LISTING_AD_ID,
        capability: AgentActionCapability.ADVERTISEMENT_TERMS_SET,
        rationale: "ERP 확정가와 네이버 노출가가 다릅니다.",
        payload: { advertisedPrice: 158000 },
        sourceSkillKey: "naver-real-estate-reader",
        sourceSkillVersion: "0.1.0",
      },
      actor,
    );

    const createData = tx.agentActionRequest.create.mock.calls[0][0].data;
    expect(createData.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(createData.baseStateHash).toBe(
      hashCanonicalJson(requestBaseState(listingAd)),
    );
    expect(createData).toEqual(
      expect.objectContaining({
        reviewerId: USER_ID,
        executionMode: "manual",
        executorSkillKey: "esiljang-ad-manager",
      }),
    );
    expect(createData).not.toHaveProperty("sourceExternalListingId");
    expect(createData.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "office_advertisement_comparison",
          officeAdvertisementGroupId: COMPARISON_GROUP_ID,
        }),
      ]),
    );
    const comparisonEvidence = createData.evidence.find(
      (item: { kind?: string }) =>
        item.kind === "office_advertisement_comparison",
    );
    expect(comparisonEvidence.state).toEqual(
      expect.objectContaining({
        relatedPriceMin: 149000,
        relatedPriceMax: 150000,
        mainAdvertisement: expect.objectContaining({
          floorInfo: "중/25",
          floorExposureMode: "band",
        }),
      }),
    );
    expect(createData.payload).toEqual(
      expect.objectContaining({ republishAfterSave: false }),
    );
    expect(createData).not.toHaveProperty("taskId");
    expect(result.id).toBe(REQUEST_ID);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [USER_ID],
        linkId: REQUEST_ID,
      }),
    );
  });

  it("approves the exact hash without mutating any employee Task", async () => {
    const listingAd = listingAdvertisement();
    const request = {
      id: REQUEST_ID,
      officeId: OFFICE_ID,
      reviewerId: USER_ID,
      escalationTaskId: null,
      listingAdvertisementId: LISTING_AD_ID,
      reviewStatus: AgentActionReviewStatus.PENDING,
      executionStatus: AgentActionExecutionStatus.NOT_STARTED,
      verificationStatus: AgentActionVerificationStatus.PENDING,
      executionMode: "manual",
      version: 3,
      contentHash: "a".repeat(64),
      approvedContentHash: null,
      expiresAt: new Date("2026-07-27T14:00:00.000Z"),
      baseStateHash: hashCanonicalJson(requestBaseState(listingAd)),
      reviewer: { id: USER_ID },
    };
    const approved = {
      ...request,
      reviewStatus: AgentActionReviewStatus.APPROVED,
      executionStatus: AgentActionExecutionStatus.AWAITING_MANUAL,
      version: 4,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      agentActionRequest: {
        findFirst: jest.fn().mockResolvedValue(request),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: jest.fn().mockResolvedValue(approved),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ officeId: OFFICE_ID }),
      },
      listingAdvertisement: {
        findFirst: jest.fn().mockResolvedValue(listingAd),
      },
      activityLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
    };
    const service = new AgentActionRequestsService(
      { $transaction: jest.fn(async (callback) => callback(tx)) } as never,
      { notify: jest.fn() } as never,
    );

    const result = await service.approve(
      OFFICE_ID,
      REQUEST_ID,
      { contentHash: request.contentHash, version: 3 },
      { ...actor, actor: "user", source: "web" },
    );

    expect(result).toBe(approved);
    expect(tx.agentActionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: AgentActionReviewStatus.APPROVED,
          executionStatus: AgentActionExecutionStatus.AWAITING_MANUAL,
          approvedContentHash: request.contentHash,
        }),
      }),
    );
    expect(tx).not.toHaveProperty("task");
  });

  it("rejects an AI request without cancelling any employee Task", async () => {
    const request = {
      id: REQUEST_ID,
      officeId: OFFICE_ID,
      reviewerId: USER_ID,
      reviewStatus: AgentActionReviewStatus.PENDING,
      executionStatus: AgentActionExecutionStatus.NOT_STARTED,
      verificationStatus: AgentActionVerificationStatus.PENDING,
      version: 2,
      contentHash: "d".repeat(64),
      reviewer: { id: USER_ID },
    };
    const rejected = {
      ...request,
      reviewStatus: AgentActionReviewStatus.REJECTED,
      executionStatus: AgentActionExecutionStatus.CANCELLED,
      verificationStatus: AgentActionVerificationStatus.NOT_REQUIRED,
      version: 3,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      agentActionRequest: {
        findFirst: jest.fn().mockResolvedValue(request),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: jest.fn().mockResolvedValue(rejected),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ officeId: OFFICE_ID }),
      },
      activityLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
    };
    const service = new AgentActionRequestsService(
      { $transaction: jest.fn(async (callback) => callback(tx)) } as never,
      { notify: jest.fn() } as never,
    );

    const result = await service.reject(
      OFFICE_ID,
      REQUEST_ID,
      {
        contentHash: request.contentHash,
        version: request.version,
        reason: "이번에는 광고를 유지합니다.",
      },
      { ...actor, actor: "user", source: "web" },
    );

    expect(result).toBe(rejected);
    expect(tx).not.toHaveProperty("task");
  });

  it("marks a request stale when the CP state or My Ads comparison changed", async () => {
    const original = listingAdvertisement();
    const changed = listingAdvertisement({ advertisedPrice: 149000 });
    const request = {
      id: REQUEST_ID,
      officeId: OFFICE_ID,
      reviewerId: USER_ID,
      listingAdvertisementId: LISTING_AD_ID,
      reviewStatus: AgentActionReviewStatus.PENDING,
      executionStatus: AgentActionExecutionStatus.NOT_STARTED,
      version: 1,
      contentHash: "b".repeat(64),
      expiresAt: new Date("2026-07-27T14:00:00.000Z"),
      baseStateHash: hashCanonicalJson(requestBaseState(original)),
      reviewer: { id: USER_ID },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      agentActionRequest: {
        findFirst: jest.fn().mockResolvedValue(request),
        update: jest.fn().mockResolvedValue({
          ...request,
          reviewStatus: AgentActionReviewStatus.STALE,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ officeId: OFFICE_ID }),
      },
      listingAdvertisement: {
        findFirst: jest.fn().mockResolvedValue(changed),
      },
      activityLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
    };
    const service = new AgentActionRequestsService(
      { $transaction: jest.fn(async (callback) => callback(tx)) } as never,
      { notify: jest.fn() } as never,
    );

    await expect(
      service.approve(
        OFFICE_ID,
        REQUEST_ID,
        { contentHash: request.contentHash, version: 1 },
        { ...actor, actor: "user", source: "web" },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.agentActionRequest.update).toHaveBeenCalledWith({
      where: { id: REQUEST_ID },
      data: expect.objectContaining({
        reviewStatus: AgentActionReviewStatus.STALE,
        executionStatus: AgentActionExecutionStatus.CANCELLED,
      }),
    });
  });

  it("reconciles a matched Esiljang receipt without creating a Task", async () => {
    const observedAt = new Date("2026-07-27T12:29:00.000Z");
    const request = approvedRequest();
    const completed = {
      ...request,
      executionStatus: AgentActionExecutionStatus.SUCCEEDED,
      verificationStatus: AgentActionVerificationStatus.MATCHED,
      version: 6,
      executedAt: observedAt,
      reviewer: { id: USER_ID, name: "직원", role: "agent" },
      escalationTask: null,
      verifications: [],
    };
    const tx = executionTx(request, completed);
    const service = new AgentActionRequestsService(
      { $transaction: jest.fn(async (callback) => callback(tx)) } as never,
      { notify: jest.fn() } as never,
    );

    const result = await service.recordExecution(
      OFFICE_ID,
      REQUEST_ID,
      matchingReceipt(request, observedAt),
      actor,
    );

    expect(result).toBe(completed);
    expect(tx.listingAdvertisement.updateMany).toHaveBeenCalledWith({
      where: { id: LISTING_AD_ID, officeId: OFFICE_ID },
      data: expect.objectContaining({
        advertisedPrice: 158000,
        lastSyncedAt: observedAt,
      }),
    });
    expect(
      tx.listingAdvertisement.updateMany.mock.calls[0][0].data,
    ).not.toHaveProperty("lastCheckedAt");
    expect(tx).not.toHaveProperty("task");
  });

  it("requires and records a persisted Esiljang republish when it was approved", async () => {
    const observedAt = new Date("2026-07-27T12:29:00.000Z");
    const request = approvedRequest();
    request.payload.republishAfterSave = true;
    const completed = {
      ...request,
      executionStatus: AgentActionExecutionStatus.SUCCEEDED,
      verificationStatus: AgentActionVerificationStatus.MATCHED,
      version: 6,
      executedAt: observedAt,
      reviewer: { id: USER_ID, name: "직원", role: "agent" },
      escalationTask: null,
      verifications: [],
    };
    const tx = executionTx(request, completed);
    const service = new AgentActionRequestsService(
      { $transaction: jest.fn(async (callback) => callback(tx)) } as never,
      { notify: jest.fn() } as never,
    );
    const execution = matchingReceipt(request, observedAt);
    execution.receipt.observedAfter.republished = true;

    await service.recordExecution(OFFICE_ID, REQUEST_ID, execution, actor);

    expect(tx.listingAdvertisement.updateMany).toHaveBeenCalledWith({
      where: { id: LISTING_AD_ID, officeId: OFFICE_ID },
      data: expect.objectContaining({
        status: "active",
        startedAt: observedAt,
        endedAt: null,
        lastSyncedAt: observedAt,
      }),
    });
  });

  it("creates one employee Task only when persisted execution mismatches", async () => {
    const observedAt = new Date("2026-07-27T12:29:00.000Z");
    const request = approvedRequest();
    const failed = {
      ...request,
      escalationTaskId: ESCALATION_TASK_ID,
      executionStatus: AgentActionExecutionStatus.FAILED,
      verificationStatus: AgentActionVerificationStatus.MISMATCH,
      reviewer: { id: USER_ID, name: "직원", role: "agent" },
      escalationTask: { id: ESCALATION_TASK_ID },
      verifications: [],
    };
    const tx = executionTx(request, failed, true);
    const notifications = { notify: jest.fn().mockResolvedValue([]) };
    const service = new AgentActionRequestsService(
      { $transaction: jest.fn(async (callback) => callback(tx)) } as never,
      notifications as never,
    );
    const matching = matchingReceipt(request, observedAt);
    const mismatchReceipt = {
      ...matching,
      receipt: {
        ...matching.receipt,
        observedAfter: {
          isActive: true,
          price: 157000,
          deposit: null,
          monthlyRent: null,
        },
      },
    };

    await service.recordExecution(
      OFFICE_ID,
      REQUEST_ID,
      mismatchReceipt,
      actor,
    );

    const taskCreate = (tx as unknown as { task: { create: jest.Mock } }).task
      .create;
    expect(taskCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: "ai",
        status: "pending",
        category: "advertisement",
        assignedToId: USER_ID,
      }),
      select: { id: true },
    });
    expect(tx.agentActionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          escalationTaskId: ESCALATION_TASK_ID,
          executionStatus: AgentActionExecutionStatus.FAILED,
          verificationStatus: AgentActionVerificationStatus.MISMATCH,
        }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [USER_ID],
        linkType: "task",
        linkId: ESCALATION_TASK_ID,
      }),
    );
  });

  it("turns a computer-use blocker into a human Task", async () => {
    const request = approvedRequest();
    const blocked = {
      ...request,
      escalationTaskId: ESCALATION_TASK_ID,
      executionStatus: AgentActionExecutionStatus.NEEDS_INPUT,
      verificationStatus: AgentActionVerificationStatus.BLOCKED,
      reviewer: { id: USER_ID, name: "직원", role: "agent" },
      escalationTask: { id: ESCALATION_TASK_ID },
      verifications: [],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      agentActionRequest: {
        findFirst: jest.fn().mockResolvedValue(request),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: jest.fn().mockResolvedValue(blocked),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ officeId: OFFICE_ID }),
      },
      task: {
        create: jest.fn().mockResolvedValue({ id: ESCALATION_TASK_ID }),
      },
      activityLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
    };
    const notifications = { notify: jest.fn().mockResolvedValue([]) };
    const service = new AgentActionRequestsService(
      { $transaction: jest.fn(async (callback) => callback(tx)) } as never,
      notifications as never,
    );

    await service.reportBlocker(
      OFFICE_ID,
      REQUEST_ID,
      {
        contentHash: request.contentHash,
        version: request.version,
        reasonCode: AgentActionBlockerReason.CAPTCHA,
        summary: "CAPTCHA가 나타나 직원 확인이 필요합니다.",
      },
      actor,
    );

    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(tx.agentActionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionStatus: AgentActionExecutionStatus.NEEDS_INPUT,
          verificationStatus: AgentActionVerificationStatus.BLOCKED,
          escalationTaskId: ESCALATION_TASK_ID,
        }),
      }),
    );
  });
});

function approvedRequest() {
  return {
    id: REQUEST_ID,
    officeId: OFFICE_ID,
    reviewerId: USER_ID,
    escalationTaskId: null,
    listingAdvertisementId: LISTING_AD_ID,
    capability: AgentActionCapability.ADVERTISEMENT_TERMS_SET,
    title: "네이버 광고 가격 조건 변경",
    summary: "150,000만원 → 158,000만원",
    payload: {
      schemaVersion: 1,
      listingAdvertisementId: LISTING_AD_ID,
      channel: "esiljang",
      articleNo: "2412345678",
      advertisedPrice: 158000,
      advertisedDeposit: null,
      advertisedMonthlyRent: null,
      republishAfterSave: false,
    },
    reviewStatus: AgentActionReviewStatus.APPROVED,
    executionStatus: AgentActionExecutionStatus.AWAITING_MANUAL,
    verificationStatus: AgentActionVerificationStatus.PENDING,
    executionMode: "manual",
    version: 5,
    contentHash: "c".repeat(64),
    approvedContentHash: "c".repeat(64),
    decidedAt: new Date("2026-07-27T12:20:00.000Z"),
    executedAt: null,
    reviewer: { id: USER_ID },
    listingAdvertisement: { listingId: "listing-1" },
  };
}

function executionTx(
  request: ReturnType<typeof approvedRequest>,
  result: Record<string, unknown>,
  withTask = false,
) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    agentActionRequest: {
      findFirst: jest.fn().mockResolvedValue(request),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue(result),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ officeId: OFFICE_ID }),
    },
    agentActionVerification: {
      create: jest.fn().mockResolvedValue({
        id: "verification-1",
        result: withTask
          ? AgentActionVerificationStatus.MISMATCH
          : AgentActionVerificationStatus.MATCHED,
      }),
    },
    listingAdvertisement: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...(withTask
      ? {
          task: {
            create: jest.fn().mockResolvedValue({ id: ESCALATION_TASK_ID }),
          },
        }
      : {}),
    activityLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
  };
}

function matchingReceipt(
  request: ReturnType<typeof approvedRequest>,
  observedAt: Date,
) {
  return {
    contentHash: request.contentHash,
    version: request.version,
    receipt: {
      operationKey: "op-1",
      articleNo: request.payload.articleNo,
      observedAt: observedAt.toISOString(),
      observedAfter: {
        isActive: true,
        price: 158000,
        deposit: null,
        monthlyRent: null,
        republished: false,
      },
      providerUrl: "https://www.aipartner.com/advertisements/2412345678",
      screenshotArtifactId: "shot-1",
    },
  };
}
