import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  ContractTransactionType,
  CONTRACT_TRANSACTION_TYPE_LABELS,
  createResidentialSaleAgreementDraft,
  mergeResidentialSaleAgreementMetadata,
  readResidentialSaleAgreement,
  validateResidentialSaleAgreement,
  type ResidentialSaleAgreementDraft,
} from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

const CONTRACT_TRANSACTION_TYPES = new Set<string>(Object.values(ContractTransactionType));

const contractDocumentInclude = {
  template: true,
  generatedBy: { select: { id: true, name: true } },
  currentRevision: true,
} satisfies Prisma.ContractDocumentInclude;

const contactWithPhonesInclude = {
  phones: {
    where: { isActive: true },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.ContactInclude;

const contractInclude = {
  office: {
    select: {
      id: true,
      name: true,
      licenseNo: true,
      ceoName: true,
      phone: true,
      address: true,
    },
  },
  deal: {
    include: {
      listing: {
        include: {
          property: {
            include: {
              site: true,
              unit: {
                include: {
                  dong: true,
                  siteUnitType: true,
                },
              },
            },
          },
        },
      },
      buyerContact: { include: contactWithPhonesInclude },
      sellerContact: { include: contactWithPhonesInclude },
    },
  },
  buyerContact: { include: contactWithPhonesInclude },
  sellerContact: { include: contactWithPhonesInclude },
  documents: {
    include: contractDocumentInclude,
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.ContractInclude;

type ContractWithRelations = Prisma.ContractGetPayload<{
  include: typeof contractInclude;
}>;

type ContractDocumentTemplateWithRelations = Prisma.ContractDocumentTemplateGetPayload<
  Record<string, never>
>;

type ContractCreateDto = {
  dealId: string;
  transactionType?: string;
  buyerContactId?: string;
  sellerContactId?: string;
  totalPrice?: number;
  monthlyRent?: number;
  status?: string;
  contractDate?: string;
  statedDeposit?: number;
  statedInterimPayment?: number;
  statedInterimDate?: string;
  statedBalance?: number;
  statedBalanceDate?: string;
  moveInDate?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  specialTerms?: string;
  attachments?: string[];
  memo?: string;
};

type ContractUpdateDto = {
  transactionType?: string;
  buyerContactId?: string;
  sellerContactId?: string;
  totalPrice?: number;
  monthlyRent?: number | null;
  status?: string;
  contractDate?: string | null;
  statedDeposit?: number | null;
  statedInterimPayment?: number | null;
  statedInterimDate?: string | null;
  statedBalance?: number | null;
  statedBalanceDate?: string | null;
  moveInDate?: string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  specialTerms?: string | null;
  attachments?: string[];
  memo?: string | null;
};

type ContractDocumentCreateDto = {
  templateId?: string;
  type?: string;
  category?: string;
  title?: string;
  status?: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  generatedAt?: string;
  signedAt?: string;
  submittedAt?: string;
  externalRefId?: string;
  metadata?: Prisma.InputJsonValue;
  memo?: string;
};

type ContractDocumentUpdateDto = {
  templateId?: string | null;
  type?: string;
  category?: string;
  title?: string;
  status?: string;
  fileUrl?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  generatedAt?: string | null;
  signedAt?: string | null;
  submittedAt?: string | null;
  externalRefId?: string | null;
  metadata?: Prisma.InputJsonValue;
  memo?: string | null;
};

export type PrepareSaleContractDraftDto = {
  actualAgreementAt?: string;
  conditions?: string;
  specialTerms?: string;
  rightsTransferDetails?: string;
  explanationDeliveredAt?: string;
};

const COMPLETED_DOCUMENT_STATUSES = new Set(['generated', 'signed', 'submitted', 'archived']);

type ContractDocumentTemplateFilters = {
  transactionType?: string;
  category?: string;
  requiredOnly?: boolean;
};

type OfficePrintTemplateFilters = {
  type?: string;
  transactionType?: string;
  activeOnly?: boolean;
};

type OfficePrintTemplateCreateDto = {
  type: string;
  title: string;
  transactionTypes?: string[];
  isDefault?: boolean;
  isActive?: boolean;
  data?: Prisma.InputJsonValue;
};

type OfficePrintTemplateUpdateDto = {
  type?: string;
  title?: string;
  transactionTypes?: string[];
  isDefault?: boolean;
  isActive?: boolean;
  data?: Prisma.InputJsonValue;
};

type ContractClauseTemplateFilters = {
  type?: string;
  contractKind?: string;
  transactionType?: string;
  activeOnly?: boolean;
};

type ContractClauseTemplateCreateDto = {
  type: string;
  contractKind?: string | null;
  transactionTypes?: string[];
  title: string;
  content: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

type ContractClauseTemplateUpdateDto = {
  type?: string;
  contractKind?: string | null;
  transactionTypes?: string[];
  title?: string;
  content?: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly contractInclude = contractInclude;

  async findAll(officeId: string) {
    const contracts = await this.prisma.contract.findMany({
      where: { officeId },
      include: this.contractInclude,
      orderBy: { updatedAt: 'desc' },
    });

    const templateCache = new Map<string, ContractDocumentTemplateWithRelations[]>();

    return Promise.all(contracts.map((contract) => this.enrichContract(contract, templateCache)));
  }

  async findOne(id: string, officeId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, officeId },
      include: this.contractInclude,
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    return this.enrichContract(contract);
  }

  async create(officeId: string, dto: ContractCreateDto) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dto.dealId, officeId },
      include: {
        listing: true,
        buyerContact: true,
        sellerContact: true,
        contract: { select: { id: true } },
      },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (deal.contract) {
      throw new BadRequestException('이미 계약서가 생성된 거래입니다.');
    }

    const transactionType =
      dto.transactionType ?? deal.transactionType ?? deal.listing?.transactionType;
    if (!transactionType) {
      throw new BadRequestException('거래 유형이 지정되지 않았습니다.');
    }
    this.assertContractTransactionType(transactionType);

    const buyerContactId = dto.buyerContactId ?? deal.buyerContactId;
    const sellerContactId = dto.sellerContactId ?? deal.sellerContactId;

    if (!buyerContactId || !sellerContactId) {
      throw new BadRequestException('거래 당사자가 연결된 뒤 계약서를 생성할 수 있습니다.');
    }

    const totalPrice = this.resolveTotalPrice(deal, dto.totalPrice);

    if (!totalPrice) {
      throw new BadRequestException('총 거래금액을 입력해주세요.');
    }

    const contract = await this.prisma.contract.create({
      data: {
        officeId,
        dealId: dto.dealId,
        transactionType,
        buyerContactId,
        sellerContactId,
        totalPrice,
        monthlyRent: dto.monthlyRent ?? deal.agreedMonthlyRent ?? deal.listing?.monthlyRent,
        status: dto.status ?? 'draft',
        contractDate: this.toDate(dto.contractDate),
        statedDeposit: dto.statedDeposit,
        statedInterimPayment: dto.statedInterimPayment,
        statedInterimDate: this.toDate(dto.statedInterimDate),
        statedBalance: dto.statedBalance,
        statedBalanceDate: this.toDate(dto.statedBalanceDate),
        moveInDate: this.toDate(dto.moveInDate),
        leaseStartDate: this.toDate(dto.leaseStartDate),
        leaseEndDate: this.toDate(dto.leaseEndDate),
        specialTerms: dto.specialTerms ?? deal.specialTerms ?? undefined,
        attachments: dto.attachments ?? [],
        memo: dto.memo,
      },
      include: this.contractInclude,
    });

    return this.enrichContract(contract);
  }

  async update(id: string, officeId: string, dto: ContractUpdateDto) {
    await this.findOne(id, officeId);

    if (dto.transactionType !== undefined) {
      this.assertContractTransactionType(dto.transactionType);
    }

    const contract = await this.prisma.contract.update({
      where: { id },
      data: {
        transactionType: dto.transactionType,
        buyerContactId: dto.buyerContactId,
        sellerContactId: dto.sellerContactId,
        totalPrice: dto.totalPrice,
        monthlyRent: dto.monthlyRent,
        status: dto.status,
        contractDate: this.toNullableDate(dto.contractDate),
        statedDeposit: dto.statedDeposit,
        statedInterimPayment: dto.statedInterimPayment,
        statedInterimDate: this.toNullableDate(dto.statedInterimDate),
        statedBalance: dto.statedBalance,
        statedBalanceDate: this.toNullableDate(dto.statedBalanceDate),
        moveInDate: this.toNullableDate(dto.moveInDate),
        leaseStartDate: this.toNullableDate(dto.leaseStartDate),
        leaseEndDate: this.toNullableDate(dto.leaseEndDate),
        specialTerms: dto.specialTerms,
        attachments: dto.attachments,
        memo: dto.memo,
      },
      include: this.contractInclude,
    });

    return this.enrichContract(contract);
  }

  async getDocumentTemplates(officeId: string, filters: ContractDocumentTemplateFilters = {}) {
    const transactionTypeFilter: Prisma.ContractDocumentTemplateWhereInput = filters.transactionType
      ? {
          OR: [
            { transactionTypes: { isEmpty: true } },
            { transactionTypes: { has: filters.transactionType } },
          ],
        }
      : {};

    const templates = await this.prisma.contractDocumentTemplate.findMany({
      where: {
        isActive: true,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.requiredOnly ? { isRequired: true } : {}),
        OR: [{ officeId: null }, { officeId }],
        ...(filters.transactionType ? { AND: [transactionTypeFilter] } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });

    return this.dedupeTemplates(templates);
  }

  async listPrintTemplates(officeId: string, filters: OfficePrintTemplateFilters = {}) {
    return this.prisma.officePrintTemplate.findMany({
      where: {
        officeId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.activeOnly === false ? {} : { isActive: true }),
        ...this.transactionTypesWhere(filters.transactionType),
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createPrintTemplate(officeId: string, userId: string, dto: OfficePrintTemplateCreateDto) {
    if (dto.isDefault) {
      await this.prisma.officePrintTemplate.updateMany({
        where: { officeId, type: dto.type, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.officePrintTemplate.create({
      data: {
        officeId,
        type: dto.type,
        title: dto.title,
        transactionTypes: dto.transactionTypes ?? [],
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        data: dto.data ?? {},
        createdById: userId,
      },
    });
  }

  async updatePrintTemplate(
    templateId: string,
    officeId: string,
    dto: OfficePrintTemplateUpdateDto,
  ) {
    const template = await this.prisma.officePrintTemplate.findFirst({
      where: { id: templateId, officeId },
      select: { id: true, type: true },
    });

    if (!template) {
      throw new NotFoundException('Office print template not found');
    }

    const nextType = dto.type ?? template.type;

    if (dto.isDefault) {
      await this.prisma.officePrintTemplate.updateMany({
        where: {
          officeId,
          type: nextType,
          isDefault: true,
          id: { not: templateId },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.officePrintTemplate.update({
      where: { id: templateId },
      data: {
        type: dto.type,
        title: dto.title,
        transactionTypes: dto.transactionTypes,
        isDefault: dto.isDefault,
        isActive: dto.isActive,
        data: dto.data,
      },
    });
  }

  async removePrintTemplate(templateId: string, officeId: string) {
    const template = await this.prisma.officePrintTemplate.findFirst({
      where: { id: templateId, officeId },
      select: { id: true, isDefault: true },
    });

    if (!template) {
      throw new NotFoundException('Office print template not found');
    }

    if (template.isDefault) {
      throw new BadRequestException(
        '기본 템플릿은 삭제할 수 없습니다. 다른 템플릿을 기본으로 지정한 뒤 삭제해주세요.',
      );
    }

    return this.prisma.officePrintTemplate.delete({
      where: { id: templateId },
    });
  }

  async listClauseTemplates(officeId: string, filters: ContractClauseTemplateFilters = {}) {
    return this.prisma.contractClauseTemplate.findMany({
      where: {
        officeId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.contractKind ? { contractKind: filters.contractKind } : {}),
        ...(filters.activeOnly === false ? {} : { isActive: true }),
        ...this.transactionTypesWhere(filters.transactionType),
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async createClauseTemplate(
    officeId: string,
    userId: string,
    dto: ContractClauseTemplateCreateDto,
  ) {
    if (dto.isDefault) {
      await this.prisma.contractClauseTemplate.updateMany({
        where: {
          officeId,
          type: dto.type,
          contractKind: dto.contractKind,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.contractClauseTemplate.create({
      data: {
        officeId,
        type: dto.type,
        contractKind: dto.contractKind,
        transactionTypes: dto.transactionTypes ?? [],
        title: dto.title,
        content: dto.content,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdById: userId,
      },
    });
  }

  async updateClauseTemplate(
    templateId: string,
    officeId: string,
    dto: ContractClauseTemplateUpdateDto,
  ) {
    const template = await this.prisma.contractClauseTemplate.findFirst({
      where: { id: templateId, officeId },
      select: { id: true, type: true, contractKind: true },
    });

    if (!template) {
      throw new NotFoundException('Contract clause template not found');
    }

    const nextType = dto.type ?? template.type;
    const nextContractKind =
      dto.contractKind === undefined ? template.contractKind : dto.contractKind;

    if (dto.isDefault) {
      await this.prisma.contractClauseTemplate.updateMany({
        where: {
          officeId,
          type: nextType,
          contractKind: nextContractKind,
          isDefault: true,
          id: { not: templateId },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.contractClauseTemplate.update({
      where: { id: templateId },
      data: {
        type: dto.type,
        contractKind: dto.contractKind,
        transactionTypes: dto.transactionTypes,
        title: dto.title,
        content: dto.content,
        isDefault: dto.isDefault,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async removeClauseTemplate(templateId: string, officeId: string) {
    const template = await this.prisma.contractClauseTemplate.findFirst({
      where: { id: templateId, officeId },
      select: { id: true, isDefault: true },
    });

    if (!template) {
      throw new NotFoundException('Contract clause template not found');
    }

    if (template.isDefault) {
      throw new BadRequestException(
        '기본 템플릿은 삭제할 수 없습니다. 다른 템플릿을 기본으로 지정한 뒤 삭제해주세요.',
      );
    }

    return this.prisma.contractClauseTemplate.delete({
      where: { id: templateId },
    });
  }

  async listDocuments(contractId: string, officeId: string) {
    await this.assertContract(contractId, officeId);

    return this.prisma.contractDocument.findMany({
      where: { contractId, officeId },
      include: contractDocumentInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async listDocumentRevisions(contractId: string, documentId: string, officeId: string) {
    await this.assertDocument(documentId, officeId, contractId);

    return this.prisma.contractDocumentRevision.findMany({
      where: { documentId, officeId },
      orderBy: { revisionNo: 'desc' },
    });
  }

  async prepareSaleContractDraft(
    contractId: string,
    officeId: string,
    userId: string,
    dto: PrepareSaleContractDraftDto = {},
    createdBy = userId,
  ) {
    const contract = await this.findContractForSaleAgreement(contractId, officeId);
    this.assertSaleContract(contract.transactionType);

    const templates = await this.getDocumentTemplates(officeId, {
      transactionType: ContractTransactionType.SALE,
    });
    const template = templates.find((candidate) => candidate.code === 'base_contract');

    if (!template) {
      throw new NotFoundException('매매계약서 기본 템플릿을 찾을 수 없습니다.');
    }

    const existingDocument = contract.documents.find(
      (document) => document.status !== 'cancelled' && document.template?.code === 'base_contract',
    );

    if (existingDocument && COMPLETED_DOCUMENT_STATUSES.has(existingDocument.status)) {
      throw new BadRequestException('완료된 매매계약서 문서는 초안 준비로 수정할 수 없습니다.');
    }

    const prepared = await this.prisma.$transaction(async (tx) => {
      const document = existingDocument
        ? existingDocument
        : await tx.contractDocument.create({
            data: {
              officeId,
              contractId,
              templateId: template.id,
              type: 'generated',
              category: template.category,
              title: template.title,
              status: 'draft',
              generatedById: userId,
              // 적용 전에는 현재 문서 내용을 변경하지 않는다. 제안 내용은 revision.payload 에만 둔다.
              metadata: {},
            },
            include: contractDocumentInclude,
          });

      // Document-local advisory lock makes revisionNo allocation safe when
      // multiple MCP workers prepare the same contract concurrently.
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${officeId}), hashtext(${document.id}))`,
      );

      const latestRevision = await tx.contractDocumentRevision.findFirst({
        where: { documentId: document.id, officeId },
        orderBy: { revisionNo: 'desc' },
      });
      const existingMetadata = this.asRecord(latestRevision?.payload ?? document.metadata);
      const existingAgreement = readResidentialSaleAgreement(existingMetadata);
      const agreement = this.applySaleAgreementOverrides(
        existingAgreement ?? this.buildSaleAgreementDraft(contract),
        dto,
      );
      const payload = mergeResidentialSaleAgreementMetadata(
        existingMetadata,
        agreement,
      ) as Prisma.InputJsonValue;
      const revision = await tx.contractDocumentRevision.create({
        data: {
          officeId,
          documentId: document.id,
          revisionNo: (latestRevision?.revisionNo ?? 0) + 1,
          contentHash: this.hashJson(payload),
          payload,
          createdBy,
        },
      });

      return { document, revision, agreement };
    });

    return {
      document: prepared.document,
      revision: prepared.revision,
      validation: validateResidentialSaleAgreement(prepared.agreement),
    };
  }

  async validateSaleContractDraft(contractId: string, officeId: string, revisionId?: string) {
    const contract = await this.findContractForSaleAgreement(contractId, officeId);
    this.assertSaleContract(contract.transactionType);

    const document = contract.documents.find(
      (candidate) =>
        candidate.status !== 'cancelled' && candidate.template?.code === 'base_contract',
    );

    if (!document) {
      throw new NotFoundException('검증할 매매계약서 초안을 찾을 수 없습니다.');
    }

    const revision = await this.prisma.contractDocumentRevision.findFirst({
      where: {
        documentId: document.id,
        officeId,
        ...(revisionId ? { id: revisionId } : {}),
      },
      orderBy: revisionId ? undefined : { revisionNo: 'desc' },
    });
    if (revisionId && !revision) {
      throw new NotFoundException('Contract document revision not found');
    }

    const agreement = readResidentialSaleAgreement(
      this.asRecord(revision?.payload ?? document.metadata),
    );
    if (!agreement) {
      throw new BadRequestException('매매계약서 초안에 유효한 구조화 계약 데이터가 없습니다.');
    }

    return validateResidentialSaleAgreement(agreement);
  }

  async applyDocumentRevision(
    contractId: string,
    documentId: string,
    revisionId: string,
    officeId: string,
    decidedById: string,
    expectedContentHash: string,
  ) {
    await this.assertDocument(documentId, officeId, contractId);
    return this.applyRevision(
      documentId,
      revisionId,
      officeId,
      decidedById,
      expectedContentHash,
    );
  }

  async applyRevision(
    documentId: string,
    revisionId: string,
    officeId: string,
    decidedById: string,
    expectedContentHash?: string,
  ) {
    const document = await this.assertDocument(documentId, officeId);
    const revision = await this.prisma.contractDocumentRevision.findFirst({
      where: { id: revisionId, documentId, officeId },
    });

    if (!revision) {
      throw new NotFoundException('Contract document revision not found');
    }
    if (expectedContentHash && revision.contentHash !== expectedContentHash) {
      throw new BadRequestException(
        '승인한 계약서 버전의 내용 해시가 일치하지 않습니다. 최신 초안을 다시 검토해주세요.',
      );
    }

    if (document.currentRevisionId === revision.id) {
      return {
        document: await this.prisma.contractDocument.findFirst({
          where: { id: documentId, officeId },
          include: contractDocumentInclude,
        }),
        revision,
      };
    }

    this.assertSaleAgreementDocumentCanComplete({
      transactionType: document.contract.transactionType,
      templateCode: document.template?.code,
      // Applying means a human accepted this exact artifact as the current
      // contract draft. Mandatory structured fields must therefore be ready
      // even though the file lifecycle status is still "draft".
      status: 'generated',
      metadata: revision.payload,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${officeId}), hashtext(${documentId}))`,
      );
      const latestRevision = await tx.contractDocumentRevision.findFirst({
        where: { documentId, officeId },
        orderBy: { revisionNo: 'desc' },
        select: { id: true, revisionNo: true },
      });
      if (latestRevision?.id !== revision.id) {
        throw new BadRequestException(
          '더 최신 계약서 revision이 존재합니다. 최신 초안을 다시 검토해주세요.',
        );
      }

      const appliedDocument = await tx.contractDocument.update({
        where: { id: documentId },
        data: {
          metadata: revision.payload as Prisma.InputJsonValue,
          currentRevisionId: revision.id,
        },
        include: contractDocumentInclude,
      });
      const appliedRevision = await tx.contractDocumentRevision.update({
        where: { id: revision.id },
        data: { appliedBy: decidedById, appliedAt: new Date() },
      });

      return { document: appliedDocument, revision: appliedRevision };
    });
  }

  async createDocument(
    contractId: string,
    officeId: string,
    userId: string,
    dto: ContractDocumentCreateDto,
  ) {
    const contract = await this.assertContract(contractId, officeId);

    const template = dto.templateId ? await this.findTemplate(dto.templateId, officeId) : null;
    const type = dto.type ?? (dto.fileUrl ? 'uploaded' : 'generated');
    const category = dto.category ?? template?.category;
    const title = dto.title ?? template?.title;
    const status = dto.status ?? (type === 'external' ? 'submitted' : 'generated');

    if (!category || !title) {
      throw new BadRequestException('문서 제목과 분류를 입력해주세요.');
    }

    this.assertSaleAgreementDocumentCanComplete({
      transactionType: contract.transactionType,
      templateCode: template?.code,
      status,
      metadata: dto.metadata,
    });

    return this.prisma.contractDocument.create({
      data: {
        officeId,
        contractId,
        templateId: dto.templateId,
        type,
        category,
        title,
        status,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        generatedAt:
          this.toDate(dto.generatedAt) ??
          (type === 'generated' && status === 'generated' ? new Date() : undefined),
        signedAt: this.toDate(dto.signedAt),
        submittedAt: this.toDate(dto.submittedAt),
        generatedById: userId,
        externalRefId: dto.externalRefId,
        metadata: dto.metadata,
        memo: dto.memo,
      },
      include: contractDocumentInclude,
    });
  }

  async updateDocument(
    contractId: string,
    documentId: string,
    officeId: string,
    dto: ContractDocumentUpdateDto,
  ) {
    const document = await this.prisma.contractDocument.findFirst({
      where: { id: documentId, contractId, officeId },
      select: {
        id: true,
        status: true,
        metadata: true,
        template: { select: { code: true } },
        contract: { select: { transactionType: true } },
      },
    });

    if (!document) {
      throw new NotFoundException('Contract document not found');
    }

    const nextTemplate = dto.templateId
      ? await this.findTemplate(dto.templateId, officeId)
      : dto.templateId === null
        ? null
        : document.template;

    this.assertSaleAgreementDocumentCanComplete({
      transactionType: document.contract.transactionType,
      templateCode: nextTemplate?.code,
      status: dto.status ?? document.status,
      metadata: dto.metadata ?? document.metadata,
    });

    return this.prisma.contractDocument.update({
      where: { id: documentId },
      data: {
        templateId: dto.templateId,
        type: dto.type,
        category: dto.category,
        title: dto.title,
        status: dto.status,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        generatedAt: this.toNullableDate(dto.generatedAt),
        signedAt: this.toNullableDate(dto.signedAt),
        submittedAt: this.toNullableDate(dto.submittedAt),
        externalRefId: dto.externalRefId,
        metadata: dto.metadata,
        memo: dto.memo,
      },
      include: contractDocumentInclude,
    });
  }

  private async assertDocument(documentId: string, officeId: string, contractId?: string) {
    const document = await this.prisma.contractDocument.findFirst({
      where: { id: documentId, officeId, ...(contractId ? { contractId } : {}) },
      select: {
        id: true,
        status: true,
        currentRevisionId: true,
        template: { select: { code: true } },
        contract: { select: { transactionType: true } },
      },
    });

    if (!document) {
      throw new NotFoundException('Contract document not found');
    }

    return document;
  }

  private async findContractForSaleAgreement(contractId: string, officeId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, officeId },
      include: this.contractInclude,
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    return contract;
  }

  private buildSaleAgreementDraft(contract: ContractWithRelations): ResidentialSaleAgreementDraft {
    const property = contract.deal.listing?.property;
    const site = property?.site;
    const unit = property?.unit;
    const siteMetadata = this.asRecord(site?.metadata);
    const actualAgreementAt = this.toDateInput(contract.contractDate);
    const balanceDueAt = this.toDateInput(contract.statedBalanceDate);
    const targetDescription = [
      site?.name,
      unit?.dong && !unit.dong.isPlaceholder ? `${unit.dong.name}동` : undefined,
      unit?.name,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');

    return createResidentialSaleAgreementDraft({
      actualAgreementAt,
      writtenAt: actualAgreementAt,
      property: {
        roadAddress: site?.roadAddress ?? '',
        jibunAddress: site?.jibunAddress ?? '',
        targetDescription,
        landCategory: this.firstMetadataString(siteMetadata, ['landCategory', 'landUse']),
        landAreaM2: this.firstMetadataNumber(siteMetadata, ['landAreaM2', 'landArea']),
        buildingStructure: this.firstMetadataString(siteMetadata, [
          'buildingStructure',
          'structure',
        ]),
        buildingUse: this.firstMetadataString(siteMetadata, ['buildingUse', 'mainUse', 'use']),
        buildingAreaM2:
          this.toNullableNumber(unit?.siteUnitType?.exclusiveAreaM2 ?? unit?.exclusiveAreaM2) ??
          this.firstMetadataNumber(siteMetadata, ['buildingAreaM2', 'buildingArea']),
      },
      payment: {
        totalPriceManwon: contract.totalPrice,
        depositManwon: contract.statedDeposit,
        depositDueAt: actualAgreementAt,
        interimManwon: contract.statedInterimPayment,
        interimDueAt: this.toDateInput(contract.statedInterimDate),
        balanceManwon: contract.statedBalance,
        balanceDueAt,
      },
      transfer: {
        deliveryAt: this.toDateInput(contract.moveInDate) || balanceDueAt,
        ownershipTransferAt: balanceDueAt,
        rightsTransferDetails: '',
        conditions: '',
        explanationDeliveredAt: actualAgreementAt,
      },
      seller: {
        contactId: contract.sellerContact.id,
        name: contract.sellerContact.name,
        phone: this.primaryPhone(contract.sellerContact.phones),
      },
      buyer: {
        contactId: contract.buyerContact.id,
        name: contract.buyerContact.name,
        phone: this.primaryPhone(contract.buyerContact.phones),
      },
      brokerage: {
        officeName: contract.office.name,
        registrationNo: contract.office.licenseNo ?? '',
        representativeName: contract.office.ceoName ?? '',
        address: contract.office.address ?? '',
        phone: contract.office.phone ?? '',
      },
      specialTerms: contract.specialTerms ?? '',
    });
  }

  private applySaleAgreementOverrides(
    agreement: ResidentialSaleAgreementDraft,
    dto: PrepareSaleContractDraftDto,
  ): ResidentialSaleAgreementDraft {
    return {
      ...agreement,
      actualAgreementAt:
        dto.actualAgreementAt === undefined
          ? agreement.actualAgreementAt
          : this.toDateInput(dto.actualAgreementAt),
      transfer: {
        ...agreement.transfer,
        conditions: dto.conditions === undefined ? agreement.transfer.conditions : dto.conditions,
        rightsTransferDetails:
          dto.rightsTransferDetails === undefined
            ? agreement.transfer.rightsTransferDetails
            : dto.rightsTransferDetails,
        explanationDeliveredAt:
          dto.explanationDeliveredAt === undefined
            ? agreement.transfer.explanationDeliveredAt
            : this.toDateInput(dto.explanationDeliveredAt),
      },
      specialTerms: dto.specialTerms === undefined ? agreement.specialTerms : dto.specialTerms,
    };
  }

  private assertSaleAgreementDocumentCanComplete(input: {
    transactionType: string;
    templateCode?: string;
    status: string;
    metadata: unknown;
  }) {
    if (
      input.transactionType !== ContractTransactionType.SALE ||
      input.templateCode !== 'base_contract'
    ) {
      return;
    }

    const metadata = this.asRecord(input.metadata);
    if (!metadata || !Object.hasOwn(metadata, 'contractAgreement')) {
      return;
    }

    const agreement = readResidentialSaleAgreement(metadata);
    if (!agreement) {
      if (COMPLETED_DOCUMENT_STATUSES.has(input.status)) {
        throw new BadRequestException('매매계약서 구조화 데이터 형식이 올바르지 않습니다.');
      }
      return;
    }

    const validation = validateResidentialSaleAgreement(agreement);
    if (COMPLETED_DOCUMENT_STATUSES.has(input.status) && validation.errors.length > 0) {
      throw new BadRequestException(
        `매매계약서 필수 항목을 확인해주세요: ${validation.errors.map((issue) => issue.message).join(' ')}`,
      );
    }
  }

  private assertSaleContract(transactionType: string) {
    if (transactionType !== ContractTransactionType.SALE) {
      throw new BadRequestException('주거용 매매계약서 초안은 매매 계약만 지원합니다.');
    }
  }

  private primaryPhone(phones: Array<{ phone: string }>) {
    return phones[0]?.phone ?? '';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private hashJson(value: unknown) {
    return createHash('sha256').update(this.canonicalizeJson(value)).digest('hex');
  }

  private canonicalizeJson(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) {
      return `[${value
        .map((item) => (item === undefined ? 'null' : this.canonicalizeJson(item)))
        .join(',')}]`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries
        .map(([key, item]) => `${JSON.stringify(key)}:${this.canonicalizeJson(item)}`)
        .join(',')}}`;
    }

    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new BadRequestException('계약서 revision payload는 JSON 값이어야 합니다.');
    }
    return serialized;
  }

  private firstMetadataString(metadata: Record<string, unknown> | null, keys: string[]) {
    for (const key of keys) {
      const value = metadata?.[key];
      if (typeof value === 'string') return value;
    }
    return '';
  }

  private firstMetadataNumber(metadata: Record<string, unknown> | null, keys: string[]) {
    for (const key of keys) {
      const value = this.toNullableNumber(metadata?.[key]);
      if (value !== null) return value;
    }
    return null;
  }

  private toNullableNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private toDateInput(value: Date | string | null | undefined) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }

  private async enrichContract(
    contract: ContractWithRelations,
    templateCache = new Map<string, ContractDocumentTemplateWithRelations[]>(),
  ) {
    const documents = contract.documents ?? [];
    const activeDocuments = documents.filter((document) => document.status !== 'cancelled');
    const requiredTemplates = await this.getRequiredDocumentTemplates(
      contract.officeId,
      contract.transactionType,
      templateCache,
    );
    const fulfilledTemplateIds = new Set(
      activeDocuments
        .map((document) => document.templateId)
        .filter((templateId): templateId is string => Boolean(templateId)),
    );
    const fulfilledTemplateCodes = new Set(
      activeDocuments
        .map((document) => document.template?.code)
        .filter((code): code is string => Boolean(code)),
    );
    const fulfilledTitles = new Set(
      activeDocuments.filter((document) => !document.templateId).map((document) => document.title),
    );
    const missingTemplates = requiredTemplates.filter(
      (template) =>
        !fulfilledTemplateIds.has(template.id) &&
        !fulfilledTemplateCodes.has(template.code) &&
        !fulfilledTitles.has(template.title),
    );

    return {
      ...contract,
      documentCount: activeDocuments.length,
      missingDocumentCount: missingTemplates.length,
      requiredDocuments: requiredTemplates.map((template) => template.title),
      missingDocuments: missingTemplates.map((template) => template.title),
      requiredDocumentTemplates: requiredTemplates,
    };
  }

  private async getRequiredDocumentTemplates(
    officeId: string,
    transactionType: string,
    templateCache: Map<string, ContractDocumentTemplateWithRelations[]>,
  ) {
    const cacheKey = `${officeId}:${transactionType}`;
    const cached = templateCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const templates = await this.getDocumentTemplates(officeId, {
      transactionType,
      requiredOnly: true,
    });
    templateCache.set(cacheKey, templates);

    return templates;
  }

  private dedupeTemplates<
    T extends {
      code: string;
      officeId: string | null;
      sortOrder?: number;
      title: string;
    },
  >(templates: T[]) {
    const byCode = new Map<string, T>();

    for (const template of templates) {
      const existing = byCode.get(template.code);
      if (!existing || (!existing.officeId && template.officeId)) {
        byCode.set(template.code, template);
      }
    }

    return Array.from(byCode.values()).sort((left, right) => {
      const sortDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (sortDelta !== 0) {
        return sortDelta;
      }

      return left.title.localeCompare(right.title, 'ko');
    });
  }

  private async assertContract(contractId: string, officeId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, officeId },
      select: { id: true, transactionType: true },
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    return contract;
  }

  private async findTemplate(templateId: string, officeId: string) {
    const template = await this.prisma.contractDocumentTemplate.findFirst({
      where: {
        id: templateId,
        isActive: true,
        OR: [{ officeId: null }, { officeId }],
      },
    });

    if (!template) {
      throw new NotFoundException('Contract document template not found');
    }

    return template;
  }

  private transactionTypesWhere(transactionType?: string) {
    if (!transactionType) {
      return {};
    }

    return {
      OR: [{ transactionTypes: { isEmpty: true } }, { transactionTypes: { has: transactionType } }],
    };
  }

  private resolveTotalPrice(
    deal: {
      agreedPrice: number | null;
      agreedDeposit: number | null;
      listing: { price: number | null; deposit: number | null } | null;
    },
    explicitTotalPrice?: number,
  ) {
    if (explicitTotalPrice !== undefined) {
      return explicitTotalPrice;
    }

    return (
      deal.agreedPrice ?? deal.agreedDeposit ?? deal.listing?.price ?? deal.listing?.deposit ?? null
    );
  }

  private toDate(value?: string) {
    return value ? new Date(value) : undefined;
  }

  private toNullableDate(value?: string | null) {
    if (value === null) {
      return null;
    }

    return value ? new Date(value) : undefined;
  }

  private assertContractTransactionType(transactionType: string) {
    if (!CONTRACT_TRANSACTION_TYPES.has(transactionType)) {
      const allowed = Object.entries(CONTRACT_TRANSACTION_TYPE_LABELS)
        .map(([code, label]) => `${label}(${code})`)
        .join(', ');
      throw new BadRequestException(
        `허용되지 않은 계약 거래유형입니다: ${transactionType}. 허용: ${allowed}`,
      );
    }
  }
}
