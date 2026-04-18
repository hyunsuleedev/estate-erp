import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
} satisfies Prisma.ContractInclude;

type ContractWithRelations = Prisma.ContractGetPayload<{
  include: typeof contractInclude;
}>;

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

    return contracts.map((contract) => this.enrichContract(contract));
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

  private enrichContract(contract: ContractWithRelations) {
    const attachments = contract.attachments ?? [];
    const requiredDocuments =
      contract.transactionType === 'monthly'
        ? ['계약서 초안', '신분증', '임대차 확인서']
        : ['계약서 초안', '신분증', '등기 관련 서류'];

    return {
      ...contract,
      documentCount: attachments.length,
      missingDocumentCount: Math.max(requiredDocuments.length - attachments.length, 0),
      requiredDocuments,
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
}
