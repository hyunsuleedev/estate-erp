import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { NetworkRoomsService } from './network-rooms.service';
import {
  serializeSharedProperty,
  sharedPropertyInclude,
} from './network-masking';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export interface ListMessagesOptions {
  cursor?: string;
  limit?: number;
}

const messageInclude = {
  user: { select: { id: true, name: true } },
  office: { select: { id: true, name: true } },
  sharedProperty: { include: sharedPropertyInclude },
} satisfies Prisma.NetworkMessageInclude;

type MessageWithRelations = Prisma.NetworkMessageGetPayload<{
  include: typeof messageInclude;
}>;

@Injectable()
export class NetworkMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: NetworkRoomsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** 방 메시지 목록 — 최신순 커서 페이지네이션. approved 멤버만. */
  async list(roomId: string, officeId: string, options: ListMessagesOptions = {}) {
    await this.rooms.assertApprovedMember(roomId, officeId);

    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const rows = await this.prisma.networkMessage.findMany({
      where: { roomId },
      include: messageInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((message) => this.serialize(message, officeId)),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  /** 메시지 전송 (매물 카드 첨부 가능) — approved 멤버만. realtime push 포함. */
  async create(
    roomId: string,
    officeId: string,
    userId: string,
    dto: { content: string; sharedPropertyId?: string },
  ) {
    await this.rooms.assertApprovedMember(roomId, officeId);

    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException('메시지 내용은 필수입니다');
    }

    if (dto.sharedPropertyId) {
      const sharedProperty = await this.prisma.networkSharedProperty.findFirst({
        where: { id: dto.sharedPropertyId, roomId },
        select: { id: true },
      });
      if (!sharedProperty) {
        throw new BadRequestException('이 중개방의 공유 매물만 첨부할 수 있습니다');
      }
    }

    const message = await this.prisma.networkMessage.create({
      data: {
        roomId,
        officeId,
        userId,
        content,
        sharedPropertyId: dto.sharedPropertyId ?? null,
      },
      include: messageInclude,
    });

    // broadcast는 여러 사무소가 수신하므로 항상 타사무소 기준(최대 마스킹)으로 직렬화
    this.realtime.emitNetworkMessageCreated({
      roomId,
      message: this.toEventPayload(message),
    });

    return this.serialize(message, officeId);
  }

  private serialize(message: MessageWithRelations, viewerOfficeId: string | null) {
    const { sharedProperty, ...rest } = message;
    return {
      ...rest,
      sharedProperty: sharedProperty
        ? serializeSharedProperty(sharedProperty, viewerOfficeId)
        : null,
    };
  }

  private toEventPayload(message: MessageWithRelations) {
    const serialized = this.serialize(message, null);
    return {
      id: serialized.id,
      roomId: serialized.roomId,
      officeId: serialized.officeId,
      userId: serialized.userId,
      content: serialized.content,
      sharedPropertyId: serialized.sharedPropertyId,
      createdAt: serialized.createdAt.toISOString(),
      user: serialized.user,
      office: serialized.office,
      sharedProperty: serialized.sharedProperty,
    };
  }
}
