import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  AdvertisementChangeAction,
  AdvertisementChangeRequestStatus,
  formatPlaceLabel,
  formatPrice,
  ListingAdvertisementChannel,
  ListingAdvertisementStatus,
} from "@estate-erp/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { ADVERTISEMENT_FLOOR_EXPOSURES } from "./advertisement-link";
import { OfficeCpAccountsService } from "./office-cp-accounts.service";

export const ADVERTISEMENT_CHANGE_ACTIONS = Object.values(
  AdvertisementChangeAction,
) as readonly AdvertisementChangeAction[];

export const OPEN_CHANGE_REQUEST_STATUSES: ReadonlySet<string> = new Set([
  AdvertisementChangeRequestStatus.REQUESTED,
  AdvertisementChangeRequestStatus.IN_PROGRESS,
  AdvertisementChangeRequestStatus.EXECUTED,
]);
const OPEN_STATUS_ARRAY = [...OPEN_CHANGE_REQUEST_STATUSES];

export interface CreateAdvertisementChangeRequestItemDto {
  action: string;
  advertisementId?: string | null;
  /** action='publish'일 때 필수 */
  listingId?: string | null;
  /** action='publish'일 때 필수 */
  channel?: string | null;
  cpAccountId?: string | null;
  accountKey?: string | null;
  /**
   * update / publish: { price?, deposit?, monthlyRent?, floorExposure? } (만원 · exact|band)
   */
  targetValue?: Record<string, unknown> | null;
  /** 단건 호출 시 함께 적을 메모·기한·담당자 */
  memo?: string | null;
  dueDate?: string | null;
  assignedToId?: string | null;
  /** 단건 업무 제목 (없으면 서버가 생성) */
  taskTitle?: string | null;
}

export interface CreateAdvertisementChangeRequestsBatchDto {
  items: CreateAdvertisementChangeRequestItemDto[];
  title?: string | null;
  memo?: string | null;
  dueDate?: string | null;
  assignedToId?: string | null;
}

export interface UpdateAdvertisementChangeRequestStatusDto {
  status: "requested" | "in_progress" | "executed" | "failed" | "cancelled";
  failureReason?: string | null;
}

const ACTION_LABELS: Record<AdvertisementChangeAction, string> = {
  publish: "신규 게재",
  update: "조건 변경",
  readvertise: "재광고",
  takedown: "광고 내리기",
};

const FLOOR_EXPOSURE_LABELS: Record<string, string> = {
  exact: "정확한 층",
  band: "저·중·고",
};

const KNOWN_CHANNELS: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementChannel),
);

const advertisementForRequest = {
  cpAccount: { select: { id: true, accountKey: true, accountName: true } },
  listing: {
    select: {
      id: true,
      intakeId: true,
      transactionType: true,
      price: true,
      deposit: true,
      monthlyRent: true,
      property: {
        include: { site: true, unit: { include: { dong: true } } },
      },
    },
  },
  property: {
    include: { site: true, unit: { include: { dong: true } } },
  },
  site: true,
  comparisons: {
    where: { isActive: true },
    select: {
      articleNo: true,
      floorExposureMode: true,
    },
  },
} satisfies Prisma.ListingAdvertisementInclude;

type AdvertisementForRequest = Prisma.ListingAdvertisementGetPayload<{
  include: typeof advertisementForRequest;
}>;

const requestListInclude = {
  cpAccount: { select: { id: true, accountKey: true, accountName: true } },
  assignedTo: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      assignedToId: true,
      dueDate: true,
    },
  },
  listing: {
    select: {
      id: true,
      transactionType: true,
      price: true,
      deposit: true,
      monthlyRent: true,
      property: {
        include: { site: true, unit: { include: { dong: true } } },
      },
    },
  },
  advertisement: {
    select: {
      id: true,
      channel: true,
      cpAccountId: true,
      status: true,
      externalAdId: true,
      naverArticleNo: true,
      url: true,
      advertisedPrice: true,
      advertisedDeposit: true,
      advertisedMonthlyRent: true,
      floorExposure: true,
      rawFloorText: true,
      listingId: true,
      propertyId: true,
      siteId: true,
    },
  },
} satisfies Prisma.AdvertisementChangeRequestInclude;

type PreparedRequestItem = {
  action: AdvertisementChangeAction;
  advertisementId: string | null;
  listingId: string | null;
  propertyId: string | null;
  listingIntakeId: string | null;
  channel: string;
  cpAccountId: string | null;
  baseSnapshot: Record<string, unknown> | null;
  targetValue: Record<string, unknown> | null;
  place: string;
  summary: string;
  lockKeyA: string;
  lockKeyB: string;
};

/**
 * 광고 변경 "요청" 통합 서비스.
 * - publish(신규 게재) · update(가격/층노출 통합 수정) · readvertise(재광고) · takedown(내리기)을
 *   단일 `AdvertisementChangeRequest` 모델로 다룬다.
 * - 여러 광고를 한꺼번에 요청하면 각 광고당 1건의 요청 행을 만들고, 하나의 묶음 `Task`에 N:1로 연결한다.
 * - 요청 생성 시 광고 원장 값은 수정하지 않으며, CP 작업 후 다음 스냅샷에서 자동 검증(`verified`)된다.
 */
@Injectable()
export class AdvertisementChangeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tasks?: TasksService,
    @Optional() private readonly cpAccounts?: OfficeCpAccountsService,
  ) {}

  async create(
    officeId: string,
    userId: string | null,
    advertisementId: string,
    dto: CreateAdvertisementChangeRequestItemDto,
  ) {
    const [request] = await this.createBatchInternal(officeId, userId, {
      items: [{ ...dto, advertisementId }],
      title: dto.taskTitle,
      memo: dto.memo,
      dueDate: dto.dueDate,
      assignedToId: dto.assignedToId,
    });
    return request;
  }

  async createSingle(
    officeId: string,
    userId: string | null,
    dto: CreateAdvertisementChangeRequestItemDto,
  ) {
    const [request] = await this.createBatchInternal(officeId, userId, {
      items: [dto],
      title: dto.taskTitle,
      memo: dto.memo,
      dueDate: dto.dueDate,
      assignedToId: dto.assignedToId,
    });
    return request;
  }

  async createBatch(
    officeId: string,
    userId: string | null,
    dto: CreateAdvertisementChangeRequestsBatchDto,
  ) {
    const requests = await this.createBatchInternal(officeId, userId, dto);
    return {
      requests,
      task: requests[0]?.task ?? null,
    };
  }

  private async createBatchInternal(
    officeId: string,
    userId: string | null,
    dto: CreateAdvertisementChangeRequestsBatchDto,
  ) {
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException("요청할 광고를 하나 이상 선택해 주세요.");
    }
    if (dto.items.length > 100) {
      throw new BadRequestException("한 번에 최대 100건까지 요청할 수 있습니다.");
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException("기한 날짜를 확인해 주세요.");
    }
    const assignedToId = dto.assignedToId?.trim() || null;
    if (assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: assignedToId, officeId, isActive: true },
        select: { id: true },
      });
      if (!assignee) {
        throw new BadRequestException("맡길 직원을 찾을 수 없습니다.");
      }
    }

    const prepared: PreparedRequestItem[] = [];
    const seenAdIds = new Set<string>();
    const seenPublishKeys = new Set<string>();

    for (const rawItem of dto.items) {
      const item = await this.prepareItem(officeId, rawItem);
      if (item.advertisementId) {
        if (seenAdIds.has(item.advertisementId)) {
          throw new BadRequestException(
            "같은 광고에 대한 요청을 한 묶음에 중복으로 넣을 수 없습니다.",
          );
        }
        seenAdIds.add(item.advertisementId);
      } else if (item.action === AdvertisementChangeAction.PUBLISH) {
        const key = `${item.listingId}:${item.channel}:${item.cpAccountId ?? ""}`;
        if (seenPublishKeys.has(key)) {
          throw new BadRequestException(
            "같은 매물·채널(계정)의 신규 게재 요청을 중복으로 넣을 수 없습니다.",
          );
        }
        seenPublishKeys.add(key);
      }
      prepared.push(item);
    }

    const memo = dto.memo?.trim() || null;
    const taskTitle = this.buildBatchTaskTitle(dto.title, prepared);
    const taskContent = this.buildBatchTaskContent(memo, prepared);
    const hasHighPriority = prepared.some(
      (item) => item.action === AdvertisementChangeAction.TAKEDOWN,
    );
    const singleListingIds = new Set(
      prepared.map((item) => item.listingId).filter((id): id is string => Boolean(id)),
    );
    const singlePropertyIds = new Set(
      prepared.map((item) => item.propertyId).filter((id): id is string => Boolean(id)),
    );
    const singleIntakeIds = new Set(
      prepared.map((item) => item.listingIntakeId).filter((id): id is string => Boolean(id)),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      for (const item of prepared) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${item.lockKeyA}), hashtext(${item.lockKeyB}))`;
        const open = await tx.advertisementChangeRequest.findFirst({
          where: item.advertisementId
            ? {
                officeId,
                advertisementId: item.advertisementId,
                status: { in: OPEN_STATUS_ARRAY },
              }
            : {
                officeId,
                action: AdvertisementChangeAction.PUBLISH,
                listingId: item.listingId,
                channel: item.channel,
                cpAccountId: item.cpAccountId,
                status: { in: OPEN_STATUS_ARRAY },
              },
          select: { id: true, action: true },
        });
        if (open) {
          throw new ConflictException(
            item.advertisementId
              ? `‘${item.place}’ 광고에 이미 처리 중인 요청(${ACTION_LABELS[open.action as AdvertisementChangeAction] ?? open.action})이 있습니다.`
              : `‘${item.place}’ (${item.channel})에 이미 처리 중인 신규 게재 요청이 있습니다.`,
          );
        }
      }

      const taskInput = {
        title: taskTitle,
        content: taskContent ?? undefined,
        source: "manual",
        status: "pending",
        priority: hasHighPriority ? "high" : "medium",
        category: "advertisement",
        dueDate: dueDate?.toISOString(),
        assignedToId: assignedToId ?? undefined,
        propertyId: singlePropertyIds.size === 1 ? [...singlePropertyIds][0] : undefined,
        listingId: singleListingIds.size === 1 ? [...singleListingIds][0] : undefined,
        listingIntakeId: singleIntakeIds.size === 1 ? [...singleIntakeIds][0] : undefined,
      };

      const task = this.tasks
        ? await this.tasks.create(officeId, taskInput, userId ?? undefined, {
            tx,
            skipNotification: true,
          })
        : await tx.task.create({
            data: {
              officeId,
              title: taskInput.title,
              content: taskContent,
              source: "manual",
              status: "pending",
              priority: taskInput.priority,
              category: "advertisement",
              dueDate,
              createdById: userId ?? undefined,
              assignedToId: assignedToId ?? undefined,
              assignedById: assignedToId ? (userId ?? undefined) : undefined,
              assignedAt: assignedToId ? new Date() : undefined,
              propertyId: taskInput.propertyId,
              listingId: taskInput.listingId,
              listingIntakeId: taskInput.listingIntakeId,
            },
            select: { id: true, title: true, status: true, assignedToId: true, dueDate: true },
          });

      const created = [];
      for (const item of prepared) {
        const request = await tx.advertisementChangeRequest.create({
          data: {
            officeId,
            advertisementId: item.advertisementId,
            listingId: item.listingId,
            channel: item.channel,
            cpAccountId: item.cpAccountId,
            taskId: task.id,
            action: item.action,
            status: AdvertisementChangeRequestStatus.REQUESTED,
            ...(item.baseSnapshot
              ? { baseSnapshot: item.baseSnapshot as Prisma.InputJsonValue }
              : {}),
            ...(item.targetValue
              ? { targetValue: item.targetValue as Prisma.InputJsonValue }
              : {}),
            memo,
            dueDate,
            requestedById: userId,
            assignedToId,
          },
          include: requestListInclude,
        });
        created.push(request);
      }
      return { created, task };
    });

    if (this.tasks) {
      await this.tasks.notifyAssigneeIfNeeded(
        officeId,
        result.task.id,
        result.task.title,
        result.task.assignedToId,
        userId ?? undefined,
      );
    }

    return result.created;
  }

  /** 걸려 있는(또는 전체) 변경 요청 조회. 에이전트와 화면이 함께 읽는다. */
  async findOpen(
    officeId: string,
    query: {
      advertisementId?: string;
      listingId?: string;
      channel?: string;
      cpAccountId?: string;
      accountKey?: string;
      status?: string;
      includeClosed?: boolean;
    } = {},
  ) {
    let cpAccountId = query.cpAccountId?.trim() || undefined;
    if (!cpAccountId && query.accountKey?.trim() && query.channel?.trim()) {
      const account = await this.prisma.officeCpAccount.findFirst({
        where: {
          officeId,
          channel: query.channel.trim().toLowerCase(),
          accountKey: query.accountKey.trim(),
        },
        select: { id: true },
      });
      if (!account) return [];
      cpAccountId = account.id;
    }

    const statusFilter: Prisma.AdvertisementChangeRequestWhereInput = query.status
      ? { status: query.status }
      : query.includeClosed
        ? {}
        : { status: { in: OPEN_STATUS_ARRAY } };

    return this.prisma.advertisementChangeRequest.findMany({
      where: {
        officeId,
        ...statusFilter,
        ...(query.advertisementId ? { advertisementId: query.advertisementId } : {}),
        ...(query.listingId ? { listingId: query.listingId } : {}),
        ...(query.channel ? { channel: query.channel.trim().toLowerCase() } : {}),
        ...(cpAccountId ? { cpAccountId } : {}),
      },
      include: requestListInclude,
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * 에이전트·담당자가 요청의 실행 상태를 보고한다.
   * verified 전이는 스냅샷 검증에서 일어나는 것이 원칙이지만,
   * 수동으로 취소하거나 실패(failureReason)를 기록할 때 사용한다.
   */
  async updateStatus(
    officeId: string,
    id: string,
    dto: UpdateAdvertisementChangeRequestStatusDto,
  ) {
    const allowedTargetStatuses = new Set([
      "requested",
      "in_progress",
      "executed",
      "failed",
      "cancelled",
    ]);
    if (!allowedTargetStatuses.has(dto.status)) {
      throw new BadRequestException("올바르지 않은 요청 상태입니다.");
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.advertisementChangeRequest.findFirst({
        where: { id, officeId },
        include: { task: { select: { id: true, status: true } } },
      });
      if (!request) {
        throw new NotFoundException("변경 요청을 찾을 수 없습니다.");
      }
      if (request.status === "verified" || request.status === "cancelled") {
        throw new ConflictException("이미 완료되었거나 취소된 요청입니다.");
      }
      if (dto.status === "failed" && !dto.failureReason?.trim()) {
        throw new BadRequestException("실패 사유를 입력해 주세요.");
      }

      const updated = await tx.advertisementChangeRequest.update({
        where: { id: request.id },
        data: {
          status: dto.status,
          failureReason:
            dto.status === "failed"
              ? dto.failureReason?.trim() || "실행 실패"
              : dto.status === "requested" || dto.status === "in_progress"
                ? null
                : undefined,
          ...(dto.status === "executed" && !request.executedAt
            ? { executedAt: new Date() }
            : {}),
        },
        include: requestListInclude,
      });

      if (request.taskId) {
        await this.syncTaskStatusFromRequests(tx, officeId, request.taskId);
      }

      return updated;
    });
  }

  /** 요청을 거둔다. 묶음 업무의 다른 요청이 모두 끝났거나 취소되면 업무도 함께 취소한다. */
  async cancel(officeId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.advertisementChangeRequest.findFirst({
        where: { id, officeId },
        select: { id: true, status: true, taskId: true },
      });
      if (!request) {
        throw new NotFoundException(
          "변경 요청을 찾을 수 없습니다. 이미 처리되었거나 거둔 요청일 수 있습니다.",
        );
      }
      if (request.status === "verified" || request.status === "cancelled") {
        throw new ConflictException("이미 끝났거나 취소된 요청입니다.");
      }

      await tx.advertisementChangeRequest.update({
        where: { id: request.id },
        data: { status: AdvertisementChangeRequestStatus.CANCELLED },
      });

      if (request.taskId) {
        await this.syncTaskStatusFromRequests(tx, officeId, request.taskId);
      }

      return {
        id: request.id,
        taskId: request.taskId,
        status: AdvertisementChangeRequestStatus.CANCELLED,
      };
    });
  }

  private async syncTaskStatusFromRequests(
    tx: Prisma.TransactionClient,
    officeId: string,
    taskId: string,
  ) {
    const siblings = await tx.advertisementChangeRequest.findMany({
      where: { officeId, taskId },
      select: { status: true },
    });
    if (siblings.length === 0) return;

    const allCancelled = siblings.every((row) => row.status === "cancelled");
    if (allCancelled) {
      await tx.task.updateMany({
        where: { id: taskId, officeId, status: { in: ["pending", "in_progress"] } },
        data: { status: "cancelled" },
      });
      return;
    }

    const anyInProgress = siblings.some(
      (row) => row.status === "in_progress" || row.status === "executed",
    );
    const allFinished = siblings.every(
      (row) => row.status === "verified" || row.status === "cancelled",
    );
    if (allFinished) {
      await tx.task.updateMany({
        where: { id: taskId, officeId, status: { in: ["pending", "in_progress"] } },
        data: { status: "completed" },
      });
      return;
    }
    if (anyInProgress) {
      await tx.task.updateMany({
        where: { id: taskId, officeId, status: "pending" },
        data: { status: "in_progress" },
      });
    }
  }

  private async prepareItem(
    officeId: string,
    raw: CreateAdvertisementChangeRequestItemDto,
  ): Promise<PreparedRequestItem> {
    if (!(ADVERTISEMENT_CHANGE_ACTIONS as readonly string[]).includes(raw.action)) {
      throw new BadRequestException(
        "요청 작업은 신규 게재(publish)·조건 변경(update)·재광고(readvertise)·광고 내리기(takedown) 중 하나여야 합니다.",
      );
    }
    const action = raw.action as AdvertisementChangeAction;

    if (action === AdvertisementChangeAction.PUBLISH) {
      return this.preparePublishItem(officeId, raw);
    }

    const advertisementId = raw.advertisementId?.trim();
    if (!advertisementId) {
      throw new BadRequestException("요청할 광고 ID가 필요합니다.");
    }

    const advertisement = await this.prisma.listingAdvertisement.findFirst({
      where: { id: advertisementId, officeId },
      include: advertisementForRequest,
    });
    if (!advertisement) {
      throw new NotFoundException(
        "광고를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.",
      );
    }
    if (action !== AdvertisementChangeAction.READVERTISE && advertisement.status !== ListingAdvertisementStatus.ACTIVE) {
      throw new ConflictException("게재 중인 광고에만 요청할 수 있습니다.");
    }

    const { baseSnapshot, targetValue, summary } = this.describeExistingAdChange(
      action,
      advertisement,
      raw.targetValue,
    );
    const place = describeAdvertisementPlace(advertisement);

    return {
      action,
      advertisementId: advertisement.id,
      listingId: advertisement.listingId,
      propertyId: advertisement.propertyId,
      listingIntakeId: advertisement.listing?.intakeId ?? null,
      channel: advertisement.channel,
      cpAccountId: advertisement.cpAccountId,
      baseSnapshot,
      targetValue,
      place,
      summary,
      lockKeyA: advertisement.id,
      lockKeyB: "advertisement",
    };
  }

  private async preparePublishItem(
    officeId: string,
    raw: CreateAdvertisementChangeRequestItemDto,
  ): Promise<PreparedRequestItem> {
    const listingId = raw.listingId?.trim();
    if (!listingId) {
      throw new BadRequestException("신규 게재 요청에는 매물(listingId)이 필요합니다.");
    }
    const channel = raw.channel?.trim().toLowerCase() ?? "";
    if (!channel || (!KNOWN_CHANNELS.has(channel) && !/^[a-z][a-z0-9_-]{1,30}$/.test(channel))) {
      throw new BadRequestException("광고 채널을 선택해 주세요.");
    }

    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, officeId },
      include: {
        property: {
          include: { site: true, unit: { include: { dong: true } } },
        },
      },
    });
    if (!listing) {
      throw new NotFoundException("선택한 매물을 찾을 수 없습니다.");
    }

    const cpAccountId = this.cpAccounts
      ? await this.cpAccounts.resolveAccountForChannel(
          this.prisma,
          officeId,
          channel,
          { cpAccountId: raw.cpAccountId, accountKey: raw.accountKey },
        )
      : (raw.cpAccountId?.trim() || null);

    const existingActive = await this.prisma.listingAdvertisement.findFirst({
      where: {
        officeId,
        listingId: listing.id,
        channel,
        cpAccountId,
        status: ListingAdvertisementStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (existingActive) {
      throw new ConflictException(
        "해당 매물·채널(계정)에 이미 게재 중인 광고가 있습니다. 조건 변경 또는 재광고로 요청해 주세요.",
      );
    }

    const target = asJsonRecord(raw.targetValue);
    const targetValue: Record<string, unknown> = {};
    const parts: string[] = [];
    for (const [key, label] of [
      ["price", ""],
      ["deposit", "보증금 "],
      ["monthlyRent", "월세 "],
    ] as const) {
      const value = target[key];
      if (value === undefined || value === null) continue;
      if (!Number.isInteger(value) || (value as number) < 0) {
        throw new BadRequestException(`targetValue.${key}는 0 이상의 만원 단위 정수여야 합니다.`);
      }
      targetValue[key] = value;
      parts.push(`${label}${formatPrice(value as number)}`);
    }
    if (target.floorExposure !== undefined && target.floorExposure !== null) {
      if (
        typeof target.floorExposure !== "string" ||
        !ADVERTISEMENT_FLOOR_EXPOSURES.has(target.floorExposure)
      ) {
        throw new BadRequestException("층 노출은 ‘정확한 층 공개’ 또는 ‘구간만 공개’ 중 하나여야 합니다.");
      }
      targetValue.floorExposure = target.floorExposure;
      parts.push(FLOOR_EXPOSURE_LABELS[target.floorExposure]);
    }

    const place =
      formatPlaceLabel({
        siteName: listing.property.site.name,
        dongName: listing.property.unit?.dong?.name,
        dongIsPlaceholder: listing.property.unit?.dong?.isPlaceholder,
        unit: listing.property.unit,
      }) || "매물";

    return {
      action: AdvertisementChangeAction.PUBLISH,
      advertisementId: null,
      listingId: listing.id,
      propertyId: listing.propertyId,
      listingIntakeId: listing.intakeId,
      channel,
      cpAccountId,
      baseSnapshot: {
        listingPrice: listing.price,
        listingDeposit: listing.deposit,
        listingMonthlyRent: listing.monthlyRent,
      },
      targetValue: Object.keys(targetValue).length > 0 ? targetValue : null,
      place,
      summary: parts.join(", "),
      lockKeyA: `${listing.id}:${channel}`,
      lockKeyB: cpAccountId ?? "default",
    };
  }

  private describeExistingAdChange(
    action: AdvertisementChangeAction,
    advertisement: AdvertisementForRequest,
    rawTarget: Record<string, unknown> | null | undefined,
  ): {
    baseSnapshot: Record<string, unknown> | null;
    targetValue: Record<string, unknown> | null;
    summary: string;
  } {
    const baseSnapshot: Record<string, unknown> = {
      status: advertisement.status,
      price: advertisement.advertisedPrice,
      deposit: advertisement.advertisedDeposit,
      monthlyRent: advertisement.advertisedMonthlyRent,
      floorExposure: advertisement.floorExposure,
      naverArticleNo: advertisement.naverArticleNo,
      externalAdId: advertisement.externalAdId,
      startedAt: advertisement.startedAt?.toISOString() ?? null,
    };

    if (action === AdvertisementChangeAction.TAKEDOWN) {
      return { baseSnapshot, targetValue: null, summary: "" };
    }

    const target = asJsonRecord(rawTarget);
    const targetValue: Record<string, unknown> = {};
    const parts: string[] = [];

    for (const [key, current, prefix] of [
      ["price", advertisement.advertisedPrice, ""],
      ["deposit", advertisement.advertisedDeposit, "보증금 "],
      ["monthlyRent", advertisement.advertisedMonthlyRent, "월세 "],
    ] as const) {
      const wanted = target[key];
      if (wanted === undefined) continue;
      if (!Number.isInteger(wanted) || (wanted as number) < 0) {
        throw new BadRequestException(
          `targetValue.${key}는 0 이상의 만원 단위 정수여야 합니다.`,
        );
      }
      if (action === AdvertisementChangeAction.UPDATE && wanted === current) {
        continue;
      }
      targetValue[key] = wanted;
      parts.push(
        `${prefix}${current == null ? "미정" : formatPrice(current)} → ${formatPrice(wanted as number)}`,
      );
    }

    if (target.floorExposure !== undefined) {
      const wantedFloor = target.floorExposure;
      if (
        typeof wantedFloor !== "string" ||
        !ADVERTISEMENT_FLOOR_EXPOSURES.has(wantedFloor)
      ) {
        throw new BadRequestException(
          "층 노출은 ‘정확한 층 공개’ 또는 ‘구간만 공개’ 중 하나여야 합니다.",
        );
      }
      // 네이버 비교에서 관측된 층 노출과 CP 원장 값 중 실제 표시된 값도 함께 확인해 불일치 400 방지
      const naverOwnFloor = advertisement.naverArticleNo
        ? advertisement.comparisons.find(
            (row) => row.articleNo === advertisement.naverArticleNo,
          )?.floorExposureMode
        : undefined;
      const effectiveFloor =
        naverOwnFloor === "exact" || naverOwnFloor === "band"
          ? naverOwnFloor
          : advertisement.floorExposure;
      const differsFromCurrent =
        wantedFloor !== advertisement.floorExposure ||
        (effectiveFloor != null && wantedFloor !== effectiveFloor);

      if (action !== AdvertisementChangeAction.UPDATE || differsFromCurrent) {
        targetValue.floorExposure = wantedFloor;
        const fromFloor = effectiveFloor ?? advertisement.floorExposure;
        parts.push(
          `${fromFloor ? FLOOR_EXPOSURE_LABELS[fromFloor] : "미정"} → ${FLOOR_EXPOSURE_LABELS[wantedFloor]}`,
        );
      }
    }

    if (
      action === AdvertisementChangeAction.UPDATE &&
      Object.keys(targetValue).length === 0
    ) {
      throw new BadRequestException(
        "지금 광고 조건과 다른 값을 하나 이상 입력해 주세요.",
      );
    }

    return {
      baseSnapshot,
      targetValue: Object.keys(targetValue).length > 0 ? targetValue : null,
      summary: parts.join(", "),
    };
  }

  private buildBatchTaskTitle(
    customTitle: string | null | undefined,
    items: PreparedRequestItem[],
  ): string {
    if (customTitle?.trim()) return customTitle.trim();
    const first = items[0];
    const actionLabel = ACTION_LABELS[first.action];
    if (items.length === 1) {
      return `[광고 ${actionLabel}] ${first.place} · ${first.channel}${first.summary ? `: ${first.summary}` : ""}`;
    }
    const distinctActions = [...new Set(items.map((i) => ACTION_LABELS[i.action]))];
    const header =
      distinctActions.length === 1 ? distinctActions[0] : "변경·관리";
    return `[광고 ${header}] ${first.place} 외 ${items.length - 1}건`;
  }

  private buildBatchTaskContent(
    memo: string | null,
    items: PreparedRequestItem[],
  ): string | null {
    const lines = items.map((item) => {
      const actionLabel = ACTION_LABELS[item.action];
      const ref = item.advertisementId
        ? `advertisementId=${item.advertisementId}`
        : `listingId=${item.listingId}`;
      return `- ${item.place} · ${item.channel} [${actionLabel}]${item.summary ? ` ${item.summary}` : ""} (${ref})`;
    });
    return [memo, lines.join("\n")].filter(Boolean).join("\n\n") || null;
  }
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 광고가 가리키는 자리를 한 줄로. 연결된 만큼 우리 데이터에서, 없으면 CP 원문에서 읽는다. */
export function describeAdvertisementPlace(advertisement: {
  property?: {
    site: { name: string };
    unit: {
      name: string | null;
      floor: number | null;
      floorEnd: number | null;
      floorLabel: string | null;
      dong: { name: string; isPlaceholder: boolean } | null;
    } | null;
  } | null;
  site?: { name: string } | null;
  rawSiteName: string | null;
  rawDong: string | null;
  rawHo: string | null;
  rawFloorText: string | null;
  rawRoadAddress: string | null;
  rawJibunAddress: string | null;
}): string {
  const property = advertisement.property;
  if (property) {
    return formatPlaceLabel({
      siteName: property.site.name,
      dongName: property.unit?.dong?.name,
      dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
      unit: property.unit,
    });
  }
  const raw = formatPlaceLabel({
    siteName: advertisement.site?.name ?? advertisement.rawSiteName,
    dongName: advertisement.rawDong,
    unit:
      advertisement.rawHo || advertisement.rawFloorText
        ? {
            name: advertisement.rawHo,
            floorLabel: advertisement.rawHo ? null : advertisement.rawFloorText,
          }
        : null,
  });
  return (
    raw ||
    advertisement.rawRoadAddress ||
    advertisement.rawJibunAddress ||
    "자리 미확인 광고"
  );
}
