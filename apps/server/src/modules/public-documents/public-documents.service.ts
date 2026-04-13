import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PublicDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(officeId: string, filters?: { type?: string }) {
    return this.prisma.publicDocument.findMany({
      where: {
        officeId,
        ...(filters?.type ? { type: filters.type } : {}),
      },
      include: {
        requestedBy: { select: { id: true, name: true } },
        property: {
          select: {
            id: true,
            site: { select: { name: true } },
            unit: { select: { name: true, dong: { select: { name: true } } } },
          },
        },
        site: { select: { id: true, name: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async listByProperty(officeId: string, propertyId: string) {
    return this.prisma.publicDocument.findMany({
      where: { officeId, propertyId },
      include: { requestedBy: { select: { id: true, name: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async listBySite(officeId: string, siteId: string) {
    return this.prisma.publicDocument.findMany({
      where: { officeId, siteId },
      include: { requestedBy: { select: { id: true, name: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async create(
    officeId: string,
    userId: string,
    data: {
      propertyId?: string;
      siteId: string;
      type: string;
      title: string;
      subtitle?: string;
      cost?: number;
    },
  ) {
    return this.prisma.publicDocument.create({
      data: {
        officeId,
        propertyId: data.propertyId ?? null,
        siteId: data.siteId,
        type: data.type,
        title: data.title,
        subtitle: data.subtitle,
        cost: data.cost ?? 0,
        status: 'pending',
        issuedAt: new Date(),
        requestedById: userId,
      },
    });
  }

  async updateStatus(
    id: string,
    officeId: string,
    data: {
      status: string;
      fileUrl?: string;
      fileSize?: number;
      mimeType?: string;
      externalRefId?: string;
      errorMessage?: string;
    },
  ) {
    const doc = await this.prisma.publicDocument.findFirst({
      where: { id, officeId },
    });
    if (!doc) throw new NotFoundException();

    return this.prisma.publicDocument.update({
      where: { id },
      data: {
        status: data.status,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        externalRefId: data.externalRefId,
        errorMessage: data.errorMessage,
      },
    });
  }

  async remove(id: string, officeId: string) {
    const doc = await this.prisma.publicDocument.findFirst({
      where: { id, officeId },
    });
    if (!doc) throw new NotFoundException();

    return this.prisma.publicDocument.delete({ where: { id } });
  }
}
