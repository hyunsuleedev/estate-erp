import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ContractTransactionType,
  CONTRACT_TRANSACTION_TYPE_LABELS,
} from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

const CONTRACT_TRANSACTION_TYPES = new Set<string>(
  Object.values(ContractTransactionType),
);

const contractDocumentInclude = {
  template: true,
  generatedBy: { select: { id: true, name: true } },
} satisfies Prisma.ContractDocumentInclude;

const contractInclude = {
  deal: {
    include: {
      listing: {
        include: {
          property: {
            include: {
              site: true,
              unit: true,
            },
          },
        },
      },
      buyerContact: true,
      sellerContact: true,
    },
  },
  buyerContact: true,
  sellerContact: true,
  documents: {
    include: contractDocumentInclude,
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.ContractInclude;

type ContractWithRelations = Prisma.ContractGetPayload<{
  include: typeof contractInclude;
}>;

type ContractDocumentTemplateWithRelations =
  Prisma.ContractDocumentTemplateGetPayload<Record<string, never>>;

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

    return Promise.all(
      contracts.map((contract) => this.enrichContract(contract, templateCache)),
    );
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
      throw new BadRequestException(
        '거래 당사자가 연결된 뒤 계약서를 생성할 수 있습니다.',
      );
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

  async getDocumentTemplates(
    officeId: string,
    filters: ContractDocumentTemplateFilters = {},
  ) {
    const transactionTypeFilter: Prisma.ContractDocumentTemplateWhereInput =
      filters.transactionType
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

  async listPrintTemplates(
    officeId: string,
    filters: OfficePrintTemplateFilters = {},
  ) {
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

  async createPrintTemplate(
    officeId: string,
    userId: string,
    dto: OfficePrintTemplateCreateDto,
  ) {
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

  async listClauseTemplates(
    officeId: string,
    filters: ContractClauseTemplateFilters = {},
  ) {
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

  async createDocument(
    contractId: string,
    officeId: string,
    userId: string,
    dto: ContractDocumentCreateDto,
  ) {
    await this.assertContract(contractId, officeId);

    const template = dto.templateId
      ? await this.findTemplate(dto.templateId, officeId)
      : null;
    const type = dto.type ?? (dto.fileUrl ? 'uploaded' : 'generated');
    const category = dto.category ?? template?.category;
    const title = dto.title ?? template?.title;
    const status = dto.status ?? (type === 'external' ? 'submitted' : 'generated');

    if (!category || !title) {
      throw new BadRequestException('문서 제목과 분류를 입력해주세요.');
    }

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
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('Contract document not found');
    }

    if (dto.templateId) {
      await this.findTemplate(dto.templateId, officeId);
    }

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

  private async enrichContract(
    contract: ContractWithRelations,
    templateCache = new Map<string, ContractDocumentTemplateWithRelations[]>(),
  ) {
    const documents = contract.documents ?? [];
    const activeDocuments = documents.filter(
      (document) => document.status !== 'cancelled',
    );
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
      activeDocuments
        .filter((document) => !document.templateId)
        .map((document) => document.title),
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
      select: { id: true },
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
      OR: [
        { transactionTypes: { isEmpty: true } },
        { transactionTypes: { has: transactionType } },
      ],
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
      deal.agreedPrice ??
      deal.agreedDeposit ??
      deal.listing?.price ??
      deal.listing?.deposit ??
      null
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
