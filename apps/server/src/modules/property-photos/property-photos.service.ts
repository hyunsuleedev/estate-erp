import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PropertyPhotosService {
  constructor(private readonly prisma: PrismaService) {}

  async listByProperty(officeId: string, propertyId: string) {
    return this.prisma.propertyPhoto.findMany({
      where: { officeId, propertyId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async search(
    officeId: string,
    filters: { siteId?: string; siteUnitTypeName?: string; siteName?: string },
  ) {
    return this.prisma.propertyPhoto.findMany({
      where: {
        officeId,
        property: {
          ...(filters.siteId ? { siteId: filters.siteId } : {}),
          ...(filters.siteName
            ? { site: { name: { contains: filters.siteName } } }
            : {}),
          ...(filters.siteUnitTypeName
            ? {
                unit: {
                  siteUnitType: {
                    name: { contains: filters.siteUnitTypeName },
                  },
                },
              }
            : {}),
        },
      },
      include: {
        property: {
          select: {
            id: true,
            site: { select: { name: true } },
            unit: {
              select: {
                name: true, floor: true, floorEnd: true, floorLabel: true,
                dong: { select: { name: true } },
                siteUnitType: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(
    officeId: string,
    data: {
      propertyId: string;
      fileUrl: string;
      fileName: string;
      fileSize?: number;
      mimeType?: string;
      category?: string;
      memo?: string;
    },
  ) {
    // 이 사무소의 매물에만 사진을 붙인다(다른 사무소 매물 id로 사진 줄을 만들지 못하게)
    const property = await this.prisma.property.findFirst({
      where: { id: data.propertyId, officeId },
      select: { id: true },
    });
    if (!property) throw new NotFoundException('매물을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');

    const maxOrder = await this.prisma.propertyPhoto.aggregate({
      where: { officeId, propertyId: data.propertyId },
      _max: { sortOrder: true },
    });

    return this.prisma.propertyPhoto.create({
      data: {
        officeId,
        propertyId: data.propertyId,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType ?? 'image/jpeg',
        category: data.category ?? 'other',
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        memo: data.memo,
      },
    });
  }

  async update(
    id: string,
    officeId: string,
    data: { category?: string; sortOrder?: number; memo?: string },
  ) {
    const photo = await this.prisma.propertyPhoto.findFirst({
      where: { id, officeId },
    });
    if (!photo) throw new NotFoundException('사진을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');

    // 본문을 그대로 쓰지 않는다 — 분류·순서·메모만 고친다
    return this.prisma.propertyPhoto.update({
      where: { id },
      data: {
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.memo !== undefined ? { memo: data.memo } : {}),
      },
    });
  }

  async reorder(officeId: string, propertyId: string, photoIds: string[]) {
    const updates = photoIds.map((id, index) =>
      this.prisma.propertyPhoto.updateMany({
        where: { id, officeId, propertyId },
        data: { sortOrder: index },
      }),
    );
    await this.prisma.$transaction(updates);
    return { success: true };
  }

  async remove(id: string, officeId: string) {
    const photo = await this.prisma.propertyPhoto.findFirst({
      where: { id, officeId },
    });
    if (!photo) throw new NotFoundException('사진을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');

    return this.prisma.propertyPhoto.delete({ where: { id } });
  }
}
