import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NetworkRoomsService } from './network-rooms.service';
import {
  networkVisibleListingWhere,
  serializeSharedProperty,
  sharedPropertyInclude,
} from './network-masking';

export type InquiriesScope = 'sent' | 'received';

export interface ListInquiriesOptions {
  scope?: InquiriesScope;
  status?: string;
}

const INQUIRY_DECISIONS = new Set(['accepted', 'rejected']);

const inquiryInclude = {
  fromOffice: { select: { id: true, name: true } },
  fromUser: { select: { id: true, name: true } },
  sharedProperty: { include: sharedPropertyInclude },
} satisfies Prisma.NetworkInquiryInclude;

type InquiryWithRelations = Prisma.NetworkInquiryGetPayload<{
  include: typeof inquiryInclude;
}>;

@Injectable()
export class NetworkInquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: NetworkRoomsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 공유 매물 문의 — 같은 방 approved 멤버만, 자기 사무소 매물 문의 차단. */
  async create(
    sharedPropertyId: string,
    officeId: string,
    userId: string,
    dto: { message?: string },
  ) {
    const sharedProperty = await this.prisma.networkSharedProperty.findFirst({
      where: { id: sharedPropertyId },
      select: {
        id: true,
        roomId: true,
        officeId: true,
        sharedBy: true,
        isActive: true,
        listingId: true,
      },
    });

    if (!sharedProperty || !sharedProperty.isActive) {
      throw new NotFoundException('공유 매물을 찾을 수 없습니다');
    }
    if (sharedProperty.officeId === officeId) {
      throw new BadRequestException('자기 사무소가 공유한 매물에는 문의할 수 없습니다');
    }

    // 거래중·보류·종료·일시중단 매물은 목록에서 숨겨지므로 문의도 차단
    const visibleListing = await this.prisma.listing.findFirst({
      where: { id: sharedProperty.listingId, ...networkVisibleListingWhere },
      select: { id: true },
    });
    if (!visibleListing) {
      throw new BadRequestException('거래중이거나 종료된 매물에는 문의할 수 없습니다');
    }

    await this.rooms.assertApprovedMember(sharedProperty.roomId, officeId);

    const inquiry = await this.prisma.networkInquiry.create({
      data: {
        sharedPropertyId,
        fromOfficeId: officeId,
        fromUserId: userId,
        message: dto.message ?? null,
      },
      include: inquiryInclude,
    });

    await this.notifications.notify({
      officeId: sharedProperty.officeId,
      userIds: [sharedProperty.sharedBy],
      roles: ['owner', 'manager'],
      type: 'network_inquiry',
      title: '공유 매물에 새 문의가 도착했습니다',
      content: dto.message ?? null,
      linkType: 'networkSharedProperty',
      linkId: sharedPropertyId,
    });

    return this.serialize(inquiry, officeId);
  }

  async list(officeId: string, options: ListInquiriesOptions = {}) {
    const scope: InquiriesScope =
      options.scope === 'received' ? 'received' : 'sent';

    const where: Prisma.NetworkInquiryWhereInput =
      scope === 'sent'
        ? { fromOfficeId: officeId }
        : { sharedProperty: { officeId } };

    if (options.status) {
      where.status = options.status;
    }

    const inquiries = await this.prisma.networkInquiry.findMany({
      where,
      include: inquiryInclude,
      orderBy: { createdAt: 'desc' },
    });

    return inquiries.map((inquiry) => this.serialize(inquiry, officeId));
  }

  /** 문의 응답 — 공유자 사무소만, pending → accepted/rejected 단방향 전이. */
  async respond(
    id: string,
    officeId: string,
    dto: { status: string; response?: string },
  ) {
    if (!INQUIRY_DECISIONS.has(dto.status)) {
      throw new BadRequestException('status는 accepted 또는 rejected여야 합니다');
    }

    const inquiry = await this.prisma.networkInquiry.findFirst({
      where: { id },
      include: {
        sharedProperty: { select: { id: true, officeId: true } },
      },
    });

    if (!inquiry) {
      throw new NotFoundException('문의를 찾을 수 없습니다');
    }
    if (inquiry.sharedProperty.officeId !== officeId) {
      throw new ForbiddenException('공유한 사무소만 문의에 응답할 수 있습니다');
    }
    if (inquiry.status !== 'pending') {
      throw new BadRequestException('대기 중인 문의만 응답할 수 있습니다');
    }

    const updated = await this.prisma.networkInquiry.update({
      where: { id },
      data: {
        status: dto.status,
        response: dto.response ?? null,
        respondedAt: new Date(),
      },
      include: inquiryInclude,
    });

    await this.notifications.notify({
      officeId: inquiry.fromOfficeId,
      userIds: [inquiry.fromUserId],
      type: 'network_inquiry_response',
      title:
        dto.status === 'accepted'
          ? '매물 문의가 수락되었습니다'
          : '매물 문의가 거절되었습니다',
      content: dto.response ?? null,
      linkType: 'networkSharedProperty',
      linkId: inquiry.sharedProperty.id,
    });

    return this.serialize(updated, officeId);
  }

  private serialize(inquiry: InquiryWithRelations, viewerOfficeId: string) {
    const { sharedProperty, ...rest } = inquiry;
    return {
      ...rest,
      sharedProperty: serializeSharedProperty(sharedProperty, viewerOfficeId),
    };
  }
}
