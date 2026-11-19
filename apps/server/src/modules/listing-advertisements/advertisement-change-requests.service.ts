import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { formatPrice, formatUnitLabel } from "@estate-erp/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ADVERTISEMENT_FLOOR_EXPOSURES } from "./advertisement-link";

export const ADVERTISEMENT_CHANGE_KINDS = [
  "price",
  "floor_exposure",
  "readvertise",
  "takedown",
] as const;
export type AdvertisementChangeKind =
  (typeof ADVERTISEMENT_CHANGE_KINDS)[number];

export interface CreateAdvertisementChangeRequestDto {
  kind: string;
  /** price: { price?, deposit?, monthlyRent? } (만원) / floor_exposure: { floorExposure: 'exact' | 'band' } */
  toValue?: Record<string, unknown> | null;
  /** 업무에 함께 적을 말 */
  memo?: string | null;
  dueDate?: string | null;
  /** 맡길 직원. 비우면 담당자 없이 등록되어 에이전트가 가져간다(claim_task) */
  assignedToId?: string | null;
}

const KIND_LABELS: Record<AdvertisementChangeKind, string> = {
  price: "가격 변경",
  floor_exposure: "층 노출 변경",
  readvertise: "재광고",
  takedown: "광고 내리기",
};
const FLOOR_EXPOSURE_LABELS: Record<string, string> = {
  exact: "정확한 층",
  band: "저·중·고",
};
/** 끝나지 않은 업무 상태 */
const OPEN_TASK_STATUSES = ["pending", "in_progress"];

const advertisementForRequest = {
  listing: {
    select: { id: true, intakeId: true },
  },
  property: {
    include: { site: true, unit: { include: { dong: true } } },
  },
  site: true,
} satisfies Prisma.ListingAdvertisementInclude;

type AdvertisementForRequest = Prisma.ListingAdvertisementGetPayload<{
  include: typeof advertisementForRequest;
}>;

/**
 * 광고 변경 "요청". CP에서 이렇게 바꿔 달라는 것이고, 실행은 업무(Task, category=advertisement)로 나가
 * 사용자의 agent가 claim_task로 가져간다. 여기서는 광고 값을 바꾸지 않는다 — 광고의 값은
 * CP에 실제로 걸려 있는 것이어야 하고, 다음 수집에서 확인되면 그때 바뀐다.
 * (이미 CP에서 바꾼 것을 기록만 맞추는 "직접 변경"은 ListingAdvertisementsService.update다.)
 */
@Injectable()
export class AdvertisementChangeRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    officeId: string,
    userId: string | null,
    advertisementId: string,
    dto: CreateAdvertisementChangeRequestDto,
  ) {
    if (!(ADVERTISEMENT_CHANGE_KINDS as readonly string[]).includes(dto.kind)) {
      throw new BadRequestException(
        "kind must be price, floor_exposure, readvertise, or takedown",
      );
    }
    const kind = dto.kind as AdvertisementChangeKind;

    const advertisement = await this.prisma.listingAdvertisement.findFirst({
      where: { id: advertisementId, officeId },
      include: advertisementForRequest,
    });
    if (!advertisement) {
      throw new NotFoundException("ListingAdvertisement not found");
    }
    // 가격 · 층 노출 · 내리기는 게재 중인 광고에만 요청한다.
    // 재광고는 게재 중(다시 올려 날짜를 새로 받기)과 종료(다시 올리기) 둘 다 받는다.
    if (kind !== "readvertise" && advertisement.status !== "active") {
      throw new ConflictException("게재 중인 광고에만 요청할 수 있습니다.");
    }

    const { fromValue, toValue, summary } = this.describeChange(kind, advertisement, dto.toValue);

    const place = describeAdvertisementPlace(advertisement);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException("dueDate must be a valid date");
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

    return this.prisma.$transaction(async (tx) => {
      // 같은 광고에 같은 종류의 요청이 아직 걸려 있으면 또 만들지 않는다.
      // 확인과 만들기 사이에 다른 요청이 끼어들지 못하게 광고 · 종류 단위로 줄을 세운다
      // (화면과 에이전트가 같은 요청을 동시에 넣는 경우).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${advertisementId}), hashtext(${kind}))`;
      const open = await tx.advertisementChangeRequest.findFirst({
        where: {
          officeId,
          advertisementId,
          kind,
          task: { status: { in: OPEN_TASK_STATUSES } },
        },
        select: { id: true },
      });
      if (open) {
        throw new ConflictException(
          `이 광고에 처리되지 않은 ${KIND_LABELS[kind]} 요청이 이미 있습니다.`,
        );
      }
      const task = await tx.task.create({
        data: {
          officeId,
          title: `[광고 ${KIND_LABELS[kind]}] ${place} · ${advertisement.channel}${summary ? `: ${summary}` : ""}`,
          content: dto.memo?.trim() || null,
          source: "manual",
          status: "pending",
          priority: kind === "takedown" ? "high" : "medium",
          category: "advertisement",
          dueDate,
          createdById: userId ?? undefined,
          assignedToId: assignedToId ?? undefined,
          propertyId: advertisement.propertyId ?? undefined,
          listingId: advertisement.listingId ?? undefined,
          listingIntakeId: advertisement.listing?.intakeId ?? undefined,
        },
        select: { id: true, title: true, status: true },
      });
      const request = await tx.advertisementChangeRequest.create({
        data: {
          officeId,
          advertisementId,
          taskId: task.id,
          kind,
          ...(fromValue ? { fromValue: fromValue as Prisma.InputJsonValue } : {}),
          ...(toValue ? { toValue: toValue as Prisma.InputJsonValue } : {}),
          requestedById: userId,
        },
      });
      return { ...request, task };
    });
  }

  /** 걸려 있는 요청. agent가 무엇을 해야 하는지 한 번에 읽는다. */
  async findOpen(officeId: string, query: { advertisementId?: string } = {}) {
    return this.prisma.advertisementChangeRequest.findMany({
      where: {
        officeId,
        ...(query.advertisementId ? { advertisementId: query.advertisementId } : {}),
        task: { status: { in: OPEN_TASK_STATUSES } },
      },
      include: {
        task: { select: { id: true, title: true, status: true, assignedToId: true, dueDate: true } },
        advertisement: {
          select: {
            id: true,
            channel: true,
            status: true,
            externalAdId: true,
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
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** 요청을 거둔다 = 연결된 업무를 취소한다. 이미 끝난 요청은 되돌리지 않는다. */
  async cancel(officeId: string, id: string) {
    const request = await this.prisma.advertisementChangeRequest.findFirst({
      where: { id, officeId },
      include: { task: { select: { id: true, status: true } } },
    });
    if (!request) {
      throw new NotFoundException("AdvertisementChangeRequest not found");
    }
    if (!OPEN_TASK_STATUSES.includes(request.task.status)) {
      throw new ConflictException("이미 끝났거나 취소된 요청입니다.");
    }
    // 읽은 뒤 그 사이에 에이전트가 끝낸 업무를 취소로 덮지 않게, 아직 열려 있을 때만 바꾼다.
    // updateMany는 변경 기록(ActivityLog)에 남지 않아서, 조건을 단 update 한 문장으로 한다.
    try {
      await this.prisma.task.update({
        where: {
          id: request.task.id,
          officeId,
          status: { in: OPEN_TASK_STATUSES },
        },
        data: { status: "cancelled" },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new ConflictException("이미 끝났거나 취소된 요청입니다.");
      }
      throw error;
    }
    return { id: request.id, taskId: request.task.id, status: "cancelled" };
  }

  private describeChange(
    kind: AdvertisementChangeKind,
    advertisement: AdvertisementForRequest,
    rawTarget: Record<string, unknown> | null | undefined,
  ): {
    fromValue: Record<string, unknown> | null;
    toValue: Record<string, unknown> | null;
    summary: string;
  } {
    const target =
      rawTarget && typeof rawTarget === "object" && !Array.isArray(rawTarget)
        ? rawTarget
        : {};

    if (kind === "price") {
      const fields = [
        ["price", advertisement.advertisedPrice, ""],
        ["deposit", advertisement.advertisedDeposit, "보증금 "],
        ["monthlyRent", advertisement.advertisedMonthlyRent, "월세 "],
      ] as const;
      const fromValue: Record<string, unknown> = {};
      const toValue: Record<string, unknown> = {};
      const parts: string[] = [];
      for (const [key, current, prefix] of fields) {
        const wanted = target[key];
        if (wanted === undefined) continue;
        if (!Number.isInteger(wanted) || (wanted as number) < 0) {
          throw new BadRequestException(`toValue.${key} must be a non-negative integer (만원)`);
        }
        if (wanted === current) continue;
        fromValue[key] = current;
        toValue[key] = wanted;
        parts.push(
          `${prefix}${current == null ? "미정" : formatPrice(current)} → ${formatPrice(wanted as number)}`,
        );
      }
      if (parts.length === 0) {
        throw new BadRequestException(
          "지금 광고 가격과 다른 값을 하나 이상 주세요 (toValue.price / deposit / monthlyRent).",
        );
      }
      return { fromValue, toValue, summary: parts.join(", ") };
    }

    if (kind === "floor_exposure") {
      const wanted = target.floorExposure;
      if (typeof wanted !== "string" || !ADVERTISEMENT_FLOOR_EXPOSURES.has(wanted)) {
        throw new BadRequestException("toValue.floorExposure must be exact or band");
      }
      if (wanted === advertisement.floorExposure) {
        throw new BadRequestException("이미 그 방식으로 층을 노출하고 있습니다.");
      }
      return {
        fromValue: { floorExposure: advertisement.floorExposure },
        toValue: { floorExposure: wanted },
        summary: `${advertisement.floorExposure ? FLOOR_EXPOSURE_LABELS[advertisement.floorExposure] : "미정"} → ${FLOOR_EXPOSURE_LABELS[wanted]}`,
      };
    }

    // 재광고 · 내리기는 바꿀 값이 없다
    return { fromValue: null, toValue: null, summary: "" };
  }
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
    const dong = property.unit?.dong;
    return [
      property.site.name,
      dong && !dong.isPlaceholder
        ? dong.name.endsWith("동")
          ? dong.name
          : `${dong.name}동`
        : null,
      formatUnitLabel(property.unit) || null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  const raw = [
    advertisement.site?.name ?? advertisement.rawSiteName,
    advertisement.rawDong
      ? advertisement.rawDong.endsWith("동")
        ? advertisement.rawDong
        : `${advertisement.rawDong}동`
      : null,
    advertisement.rawHo
      ? advertisement.rawHo.endsWith("호")
        ? advertisement.rawHo
        : `${advertisement.rawHo}호`
      : advertisement.rawFloorText,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    raw ||
    advertisement.rawRoadAddress ||
    advertisement.rawJibunAddress ||
    "자리 미확인 광고"
  );
}
