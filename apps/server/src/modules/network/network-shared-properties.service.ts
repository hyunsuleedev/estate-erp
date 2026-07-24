import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NetworkRoomsService } from './network-rooms.service';
import {
  networkVisibleListingWhere,
  serializeSharedProperty,
  sharedPropertyInclude,
} from './network-masking';

export interface ShareListingDto {
  listingId: string;
  showSiteName?: boolean;
  showDong?: boolean;
  showUnit?: boolean;
  showPrice?: boolean;
  showArea?: boolean;
  showFloor?: boolean;
  showMemo?: boolean;
  showPhotos?: boolean;
  contactName?: string;
  contactPhone?: string;
  description?: string;
}

export interface UpdateSharedPropertyDto {
  showSiteName?: boolean;
  showDong?: boolean;
  showUnit?: boolean;
  showPrice?: boolean;
  showArea?: boolean;
  showFloor?: boolean;
  showMemo?: boolean;
  showPhotos?: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
  description?: string | null;
  isActive?: boolean;
}

@Injectable()
export class NetworkSharedPropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: NetworkRoomsService,
  ) {}

  /** 매물 공유 — approved 멤버 + 내 사무소 Listing만. 같은 방 중복 공유는 재활성화로 처리. */
  async share(
    roomId: string,
    officeId: string,
    userId: string,
    dto: ShareListingDto,
  ) {
    if (!dto.listingId) {
      throw new BadRequestException('listingId는 필수입니다');
    }

    await this.rooms.assertApprovedMember(roomId, officeId);

    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, officeId },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException('매물을 찾을 수 없습니다');
    }

    // 거래중·보류·종료·일시중단 매물은 공유 자체를 막는다
    const shareable = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, officeId, ...networkVisibleListingWhere },
      select: { id: true },
    });
    if (!shareable) {
      throw new BadRequestException(
        '거래중이거나 보류·종료된 매물은 공유할 수 없습니다',
      );
    }

    const existing = await this.prisma.networkSharedProperty.findFirst({
      where: { roomId, listingId: dto.listingId },
    });

    if (existing && existing.officeId !== officeId) {
      throw new ConflictException('이미 다른 사무소가 공유한 매물입니다');
    }
    if (existing?.isActive) {
      throw new ConflictException('이미 이 중개방에 공유된 매물입니다');
    }

    const flagData = {
      showSiteName: dto.showSiteName ?? true,
      showDong: dto.showDong ?? false,
      showUnit: dto.showUnit ?? false,
      showPrice: dto.showPrice ?? true,
      showArea: dto.showArea ?? true,
      showFloor: dto.showFloor ?? false,
      showMemo: dto.showMemo ?? false,
      showPhotos: dto.showPhotos ?? false,
      contactName: dto.contactName ?? null,
      contactPhone: dto.contactPhone ?? null,
      description: dto.description ?? null,
    };

    const record = existing
      ? await this.prisma.networkSharedProperty.update({
          where: { id: existing.id },
          data: { ...flagData, sharedBy: userId, isActive: true },
          include: sharedPropertyInclude,
        })
      : await this.prisma.networkSharedProperty.create({
          data: {
            roomId,
            listingId: dto.listingId,
            officeId,
            sharedBy: userId,
            ...flagData,
          },
          include: sharedPropertyInclude,
        });

    return serializeSharedProperty(record, officeId);
  }

  /**
   * 방의 공유 매물 목록 (isActive=true) — viewer 기준 마스킹 적용.
   * 거래중·보류·종료·일시중단 매물은 타 사무소에게 숨긴다 (조회 시 파생 —
   * 계약 무산으로 Deal 이 취소되면 별도 조작 없이 자동 복귀).
   * 공유한 사무소 본인에게는 상태와 무관하게 계속 보인다 (공유 관리 목적).
   */
  async listByRoom(roomId: string, officeId: string) {
    await this.rooms.assertApprovedMember(roomId, officeId);

    const records = await this.prisma.networkSharedProperty.findMany({
      where: {
        roomId,
        isActive: true,
        OR: [{ officeId }, { listing: networkVisibleListingWhere }],
      },
      include: sharedPropertyInclude,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => serializeSharedProperty(record, officeId));
  }

  /** 공유 설정 수정 — 공유자 사무소만. */
  async update(id: string, officeId: string, dto: UpdateSharedPropertyDto) {
    await this.assertOwnership(id, officeId);

    const record = await this.prisma.networkSharedProperty.update({
      where: { id },
      data: {
        ...(dto.showSiteName !== undefined ? { showSiteName: dto.showSiteName } : {}),
        ...(dto.showDong !== undefined ? { showDong: dto.showDong } : {}),
        ...(dto.showUnit !== undefined ? { showUnit: dto.showUnit } : {}),
        ...(dto.showPrice !== undefined ? { showPrice: dto.showPrice } : {}),
        ...(dto.showArea !== undefined ? { showArea: dto.showArea } : {}),
        ...(dto.showFloor !== undefined ? { showFloor: dto.showFloor } : {}),
        ...(dto.showMemo !== undefined ? { showMemo: dto.showMemo } : {}),
        ...(dto.showPhotos !== undefined ? { showPhotos: dto.showPhotos } : {}),
        ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: sharedPropertyInclude,
    });

    return serializeSharedProperty(record, officeId);
  }

  /**
   * 공유 회수 — 공유자 사무소만.
   * 문의/메시지가 FK로 참조하므로 hard delete 대신 isActive=false 처리.
   */
  async deactivate(id: string, officeId: string) {
    await this.assertOwnership(id, officeId);

    const record = await this.prisma.networkSharedProperty.update({
      where: { id },
      data: { isActive: false },
      include: sharedPropertyInclude,
    });

    return serializeSharedProperty(record, officeId);
  }

  private async assertOwnership(id: string, officeId: string) {
    const record = await this.prisma.networkSharedProperty.findFirst({
      where: { id },
      select: { id: true, officeId: true },
    });
    if (!record) {
      throw new NotFoundException('공유 매물을 찾을 수 없습니다');
    }
    if (record.officeId !== officeId) {
      throw new ForbiddenException('공유한 사무소만 수정할 수 있습니다');
    }
    return record;
  }
}
