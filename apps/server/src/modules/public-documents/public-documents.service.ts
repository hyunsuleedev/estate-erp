import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { toGovernmentAddressParams } from './public-document-address.util';
import { PublicDocumentProviderService } from './public-document-provider.service';
import {
  DOCUMENT_TITLES,
  isPublicDocumentType,
  type DocumentAddress,
  type DocumentQuoteItem,
  type PublicDocumentRequestMode,
  type PublicDocumentType,
} from './public-document.types';

interface RequestDocumentInput {
  propertyId?: string;
  siteId: string;
  type: string;
  title?: string;
  subtitle?: string;
  requestMode?: PublicDocumentRequestMode;
}

@Injectable()
export class PublicDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PublicDocumentProviderService,
  ) {}

  getProviders() {
    return this.providers.getProviders();
  }

  async quote(
    officeId: string,
    data: {
      siteId: string;
      propertyId?: string;
      types: string[];
      registryMode?: 'view' | 'certificate';
    },
  ) {
    const types = this.parseTypes(data.types);
    const address = await this.resolveAddress(
      officeId,
      data.siteId,
      data.propertyId,
    );
    const items = this.withAddressAvailability(
      this.providers.quote(types, data.registryMode),
      address,
    );
    return { address: this.displayAddress(address), items };
  }

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
      orderBy: { requestedAt: 'desc' },
    });
  }

  async listByProperty(officeId: string, propertyId: string) {
    return this.prisma.publicDocument.findMany({
      where: { officeId, propertyId },
      include: { requestedBy: { select: { id: true, name: true } } },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async listBySite(officeId: string, siteId: string) {
    return this.prisma.publicDocument.findMany({
      where: { officeId, siteId },
      include: { requestedBy: { select: { id: true, name: true } } },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async create(
    officeId: string,
    userId: string,
    data: RequestDocumentInput,
  ) {
    const type = this.parseType(data.type);
    const mode = this.normalizeMode(type, data.requestMode);
    const quote = await this.quote(officeId, {
      siteId: data.siteId,
      propertyId: data.propertyId,
      types: [type],
      registryMode: mode === 'certificate' ? 'certificate' : 'view',
    });
    const item = quote.items[0];
    if (!item.available) {
      throw new BadRequestException(item.reason ?? '현재 요청할 수 없습니다.');
    }

    const document = await this.createPendingDocument(
      officeId,
      userId,
      data,
      item,
    );
    this.processInBackground(document.id, officeId);
    return document;
  }

  async createBatch(
    officeId: string,
    userId: string,
    data: {
      propertyId?: string;
      siteId: string;
      types: string[];
      registryMode?: 'view' | 'certificate';
    },
  ) {
    const types = this.parseTypes(data.types);
    const quoted = await this.quote(officeId, { ...data, types });
    const available = quoted.items.filter((item) => item.available);
    if (available.length === 0) {
      throw new BadRequestException(
        quoted.items.map((item) => item.reason).filter(Boolean).join(' '),
      );
    }

    const batchId = randomUUID();
    const documents = await this.prisma.$transaction(
      available.map((item) =>
        this.prisma.publicDocument.create({
          data: {
            officeId,
            propertyId: data.propertyId ?? null,
            siteId: data.siteId,
            type: item.type,
            title: item.title,
            subtitle:
              item.type === 'registry'
                ? item.requestMode === 'certificate'
                  ? '발급용'
                  : '열람용'
                : item.providerLabel,
            provider: item.provider,
            requestMode: item.requestMode,
            batchId,
            cost: item.cost,
            status: 'pending',
            issuedAt: new Date(),
            requestedAt: new Date(),
            requestedById: userId,
            metadata: {
              output: item.output,
              quoteReason: item.reason,
            },
          },
        }),
      ),
    );

    documents.forEach((document) =>
      this.processInBackground(document.id, officeId),
    );
    return {
      batchId,
      documents,
      skipped: quoted.items.filter((item) => !item.available),
    };
  }

  async retry(id: string, officeId: string) {
    const document = await this.findDocument(id, officeId);
    const quote = await this.quote(officeId, {
      siteId: document.siteId,
      propertyId: document.propertyId ?? undefined,
      types: [document.type],
      registryMode:
        document.requestMode === 'certificate' ? 'certificate' : 'view',
    });
    const item = quote.items[0];
    if (!item.available) {
      throw new BadRequestException(item.reason ?? '현재 재시도할 수 없습니다.');
    }

    const pending = await this.prisma.publicDocument.update({
      where: { id },
      data: {
        status: 'pending',
        provider: item.provider,
        errorMessage: null,
        requestedAt: new Date(),
        completedAt: null,
      },
    });
    this.processInBackground(id, officeId);
    return pending;
  }

  async attachFile(
    id: string,
    officeId: string,
    data: {
      fileUrl: string;
      fileSize?: number;
      mimeType?: string;
      externalRefId?: string;
    },
  ) {
    await this.findDocument(id, officeId);
    this.assertSafeFileUrl(data.fileUrl);
    const now = new Date();
    return this.prisma.publicDocument.update({
      where: { id },
      data: {
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType ?? 'application/pdf',
        externalRefId: data.externalRefId,
        provider: 'manual_upload',
        requestMode: 'upload',
        status: 'completed',
        errorMessage: null,
        issuedAt: now,
        completedAt: now,
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
    await this.findDocument(id, officeId);
    if (!['pending', 'completed', 'failed'].includes(data.status)) {
      throw new BadRequestException('올바르지 않은 문서 상태입니다.');
    }
    if (data.fileUrl) this.assertSafeFileUrl(data.fileUrl);

    return this.prisma.publicDocument.update({
      where: { id },
      data: {
        status: data.status,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        externalRefId: data.externalRefId,
        errorMessage: data.errorMessage,
        completedAt: data.status === 'completed' ? new Date() : null,
      },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findDocument(id, officeId);
    return this.prisma.publicDocument.delete({ where: { id } });
  }

  private async createPendingDocument(
    officeId: string,
    userId: string,
    data: RequestDocumentInput,
    quote: DocumentQuoteItem,
  ) {
    return this.prisma.publicDocument.create({
      data: {
        officeId,
        propertyId: data.propertyId ?? null,
        siteId: data.siteId,
        type: quote.type,
        title: data.title?.trim() || DOCUMENT_TITLES[quote.type],
        subtitle: data.subtitle,
        provider: quote.provider,
        requestMode: quote.requestMode,
        cost: quote.cost,
        status: 'pending',
        issuedAt: new Date(),
        requestedAt: new Date(),
        requestedById: userId,
        metadata: {
          output: quote.output,
          quoteReason: quote.reason,
        },
      },
    });
  }

  private processInBackground(id: string, officeId: string) {
    setImmediate(() => void this.processDocument(id, officeId));
  }

  private async processDocument(id: string, officeId: string) {
    try {
      const document = await this.findDocument(id, officeId);
      const address = await this.resolveAddress(
        officeId,
        document.siteId,
        document.propertyId ?? undefined,
      );
      const result = await this.providers.execute(
        this.parseType(document.type),
        document.requestMode as PublicDocumentRequestMode,
        address,
      );

      if (result.status === 'awaiting_upload') {
        await this.prisma.publicDocument.update({
          where: { id },
          data: {
            provider: result.provider,
            errorMessage: null,
            metadata: result.metadata as Prisma.InputJsonValue,
          },
        });
        return;
      }

      const now = new Date();
      await this.prisma.publicDocument.update({
        where: { id },
        data: {
          status: 'completed',
          provider: result.provider,
          externalRefId: result.externalRefId,
          mimeType: result.mimeType,
          metadata: result.metadata as Prisma.InputJsonValue,
          errorMessage: null,
          issuedAt: now,
          completedAt: now,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '공적장부 조회에 실패했습니다.';
      await this.prisma.publicDocument.updateMany({
        where: { id, officeId },
        data: {
          status: 'failed',
          errorMessage: message,
          completedAt: null,
        },
      });
    }
  }

  private async resolveAddress(
    officeId: string,
    siteId: string,
    propertyId?: string,
  ): Promise<DocumentAddress> {
    if (propertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: propertyId, officeId, siteId },
        include: {
          site: true,
          unit: { include: { dong: true } },
        },
      });
      if (!property) throw new NotFoundException('매물을 찾을 수 없습니다.');
      return this.mapAddress(
        property.site,
        property.unit?.dong.name ?? null,
        property.unit?.name ?? null,
      );
    }

    const site = await this.prisma.site.findFirst({
      where: {
        id: siteId,
        OR: [
          { officeId },
          { isPublic: true },
          { officeSites: { some: { officeId } } },
        ],
      },
    });
    if (!site) throw new NotFoundException('장소를 찾을 수 없습니다.');
    return this.mapAddress(site, null, null);
  }

  private mapAddress(
    site: {
      id: string;
      name: string;
      wardCode: string;
      roadAddress: string | null;
      jibunAddress: string | null;
      jibunMain: string | null;
      jibunSub: string | null;
      lat: Prisma.Decimal | null;
      lng: Prisma.Decimal | null;
    },
    dongName: string | null,
    unitName: string | null,
  ): DocumentAddress {
    return {
      siteId: site.id,
      siteName: site.name,
      wardCode: site.wardCode,
      roadAddress: site.roadAddress,
      jibunAddress: site.jibunAddress,
      jibunMain: site.jibunMain,
      jibunSub: site.jibunSub,
      lat: site.lat?.toString() ?? null,
      lng: site.lng?.toString() ?? null,
      dongName,
      unitName,
    };
  }

  private withAddressAvailability(
    items: DocumentQuoteItem[],
    address: DocumentAddress,
  ) {
    try {
      toGovernmentAddressParams(address);
      return items;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : '주소 정보가 부족합니다.';
      return items.map((item) =>
        item.output === 'structured_data'
          ? { ...item, available: false, reason }
          : item,
      );
    }
  }

  private displayAddress(address: DocumentAddress) {
    return {
      siteName: address.siteName,
      roadAddress: address.roadAddress,
      jibunAddress: address.jibunAddress,
      dongName: address.dongName,
      unitName: address.unitName,
    };
  }

  private normalizeMode(
    type: PublicDocumentType,
    mode?: PublicDocumentRequestMode,
  ): PublicDocumentRequestMode {
    if (type === 'registry') {
      return mode === 'certificate' ? 'certificate' : 'view';
    }
    if (type === 'land_register') return 'upload';
    return 'data';
  }

  private parseTypes(values: string[]) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new BadRequestException('한 개 이상의 문서 종류를 선택해 주세요.');
    }
    return [...new Set(values.map((value) => this.parseType(value)))];
  }

  private parseType(value: string): PublicDocumentType {
    if (!isPublicDocumentType(value)) {
      throw new BadRequestException('지원하지 않는 공적장부 종류입니다.');
    }
    return value;
  }

  private async findDocument(id: string, officeId: string) {
    const document = await this.prisma.publicDocument.findFirst({
      where: { id, officeId },
    });
    if (!document) throw new NotFoundException('문서를 찾을 수 없습니다.');
    return document;
  }

  private assertSafeFileUrl(value: string) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
    } catch {
      throw new BadRequestException('HTTP(S) 문서 URL만 연결할 수 있습니다.');
    }
  }
}
