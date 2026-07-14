import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  ContractTransactionType,
  CONTRACT_TRANSACTION_TYPE_LABELS,
  CONTRACT_DOCUMENT_KIND_SET,
  createResidentialSaleAgreementDraft,
  mergeResidentialSaleAgreementMetadata,
  readResidentialSaleAgreement,
  sanitizeContractRichTextValue,
  validateResidentialSaleAgreement,
  type ResidentialSaleAgreementDraft,
} from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ContractPartyAgentDto,
  ContractPartyDto,
  ReplaceContractPartiesDto,
} from './dto/contract-party.dto';
import {
  decryptContractPartyField,
  encryptContractPartyField,
} from './contract-party-crypto.util';

const CONTRACT_TRANSACTION_TYPES = new Set<string>(Object.values(ContractTransactionType));

/** 레거시 DMLS001Q01 Date_Clsf 대응 — 날짜 검색 기준 컬럼 */
const CONTRACT_DATE_FIELDS = [
  'contractDate',
  'statedInterimDate',
  'statedBalanceDate',
  'leaseEndDate',
  'createdAt',
] as const;
export type ContractDateField = (typeof CONTRACT_DATE_FIELDS)[number];

/** 레거시 Price_Clsf 대응 — 금액 검색 기준 컬럼 (만원 단위) */
const CONTRACT_PRICE_FIELDS = ['totalPrice', 'statedDeposit', 'monthlyRent'] as const;
export type ContractPriceField = (typeof CONTRACT_PRICE_FIELDS)[number];

/**
 * 레거시 SearchClsf 대응 — 텍스트 검색 기준.
 * 레거시 4종(UserName 고객명 / PhneNo 연락처 / Addr 소재지 / OffcName 공동중개사무소명)은
 * 각각 party / phone / address / partnerOffice 로 대응한다.
 */
const CONTRACT_SEARCH_FIELDS = [
  'title',
  'party',
  'phone',
  'address',
  'partnerOffice',
  'memo',
  'all',
] as const;
export type ContractSearchField = (typeof CONTRACT_SEARCH_FIELDS)[number];

/** 레거시 Period_Retention 기본값 — 계약서 보존기간 5년 */
const DEFAULT_RETENTION_YEARS = 5;

/**
 * 주민번호 마스킹 유예 기간 — 레거시 changeRegNumber:
 * 잔금일(statedBalanceDate) + 15일 경과 시 조회 응답에서 뒷자리를 마스킹한다.
 */
const ID_NUMBER_MASK_GRACE_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

/** side 정렬 순서 — 레거시 01(매도측) → 02(매수측) → 99(사무소) */
const PARTY_SIDE_RANK: Record<string, number> = {
  one: 0,
  two: 1,
  office: 2,
};

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
    // 레거시 Orde(탭 순서) → Cntr_Clsf_Orde(동일 서식 반복 순번) 정렬
    orderBy: [{ sortOrder: 'asc' }, { kindOrder: 'asc' }, { createdAt: 'asc' }],
  },
  parties: true,
} satisfies Prisma.ContractInclude;

type ContractWithRelations = Prisma.ContractGetPayload<{
  include: typeof contractInclude;
}>;

type ContractPartyRecord = Prisma.ContractPartyGetPayload<Record<string, never>>;

/** 기존 당사자 행의 보존 대상 정보 — 이름 일치 검증 + 저장된 idNumber(암호문) */
type ExistingPartyIdNumber = {
  name: string;
  idNumber: string | null;
};

/** 마스킹 idNumber 보존 매칭 인덱스 — id(불변) 우선, 위치(side+subId) fallback */
type ExistingPartyIdNumberIndex = {
  byId: Map<string, ExistingPartyIdNumber>;
  rootByPosition: Map<string, ExistingPartyIdNumber>;
  agentByPosition: Map<string, ExistingPartyIdNumber>;
};

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

/**
 * GET /contracts 검색 쿼리 — 레거시 문서 목록 조회(DMLS001Q01) 대응.
 * 모든 파라미터 optional. 파라미터 없이 호출하면 기존과 동일하게
 * 사무소 전체 계약을 배열로 반환한다 (하위호환).
 */
export type ContractSearchQuery = {
  /** 서식 템플릿 코드(레거시 Cntr_Clsf) — ContractDocument.kind 또는 template.code 매칭 */
  kind?: string | string[];
  /** 문서 분류 (contract / report / receipt ...) */
  category?: string;
  transactionType?: string | string[];
  status?: string | string[];
  /** 날짜 검색 기준 (기본 contractDate) — 레거시 Date_Clsf */
  dateField?: string;
  dateFrom?: string;
  dateTo?: string;
  /** 금액 검색 기준 (기본 totalPrice, 만원 단위) — 레거시 Price_Clsf */
  priceField?: string;
  priceMin?: number;
  priceMax?: number;
  /** 텍스트 검색 기준 (기본 all) — 레거시 SearchClsf */
  searchField?: string;
  search?: string;
  /** 공동중개 필터 — Deal.isJointBrokerage 경유 (레거시 Union=Y) */
  isJointBrokerage?: boolean;
  /**
   * 보존기간 경과 필터 (레거시 PeriodOver, 기본 5년).
   * contractDate(없으면 createdAt)가 기준일 이전인 계약만 반환.
   */
  retentionOverdue?: boolean;
  /** 보존기간 기준일 override (ISO 날짜). 생략 시 오늘 - 5년 */
  retentionBefore?: string;
  /** page/limit 중 하나라도 지정하면 { items, pagination } 봉투로 반환 */
  page?: number;
  limit?: number;
};

type ContractDocumentCreateDto = {
  templateId?: string;
  type?: string;
  category?: string;
  title?: string;
  status?: string;
  /** 서식 템플릿 코드 — 레거시 Cntr_Clsf. 생략 시 template.code 에서 유도 */
  kind?: string;
  /** 묶음 내 탭 순서 — 레거시 Orde. 생략 시 마지막 순서 + 1 자동 부여 */
  sortOrder?: number;
  /** 동일 서식 반복 순번 — 레거시 Cntr_Clsf_Orde. 생략 시 같은 kind 내 자동 증가 */
  kindOrder?: number;
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
  kind?: string | null;
  sortOrder?: number;
  kindOrder?: number;
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

type ContractDocumentCopyDto = {
  title?: string;
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

  async findAll(officeId: string, query: ContractSearchQuery = {}) {
    const where = this.buildContractWhere(officeId, query);
    const templateCache = new Map<string, ContractDocumentTemplateWithRelations[]>();

    // page/limit 미지정 시 기존과 동일하게 배열 반환 (api-client 하위호환)
    const usePagination = query.page !== undefined || query.limit !== undefined;

    if (!usePagination) {
      const contracts = await this.prisma.contract.findMany({
        where,
        include: this.contractInclude,
        orderBy: { updatedAt: 'desc' },
      });

      return Promise.all(
        contracts.map((contract) => this.enrichContract(contract, templateCache)),
      );
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [contracts, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: this.contractInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.contract.count({ where }),
    ]);

    const items = await Promise.all(
      contracts.map((contract) => this.enrichContract(contract, templateCache)),
    );

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
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
        // 특약(rich text HTML)은 방어적 새니타이즈 후 저장 (plain text 는 그대로)
        specialTerms: sanitizeContractRichTextValue(
          dto.specialTerms ?? deal.specialTerms ?? undefined,
        ),
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
        // 특약(rich text HTML)은 방어적 새니타이즈 후 저장 (plain text 는 그대로)
        specialTerms: sanitizeContractRichTextValue(dto.specialTerms),
        attachments: dto.attachments,
        memo: dto.memo,
      },
      include: this.contractInclude,
    });

    return this.enrichContract(contract);
  }

  /**
   * 계약서 당사자 전체 교체 (레거시 TPCT02S/TPCT28S 저장 대응).
   * 단일 트랜잭션으로 기존 당사자를 삭제하고 전달된 목록을 일괄 생성한다.
   * 대리인은 DTO 의 agents 중첩으로 받고 parentId 는 서버가 부여한다.
   *
   * 개인정보 컬럼(idNumber/phone/mobilePhone)은 write-path 에서 AES-256-GCM
   * 암호화해 저장하고 (레거시 Rsdt_Regi_No/Phne_No 암호화 대응, G4),
   * 조회 시 복호화 후 잔금일+15일 마스킹 정책을 적용한다.
   */
  async replaceParties(contractId: string, officeId: string, dto: ReplaceContractPartiesDto) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, officeId },
      select: { id: true, statedBalanceDate: true },
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    for (const party of dto.parties) {
      if (party.side === 'office' && party.agents?.length) {
        throw new BadRequestException('중개사무소 행에는 대리인을 등록할 수 없습니다.');
      }
      if ((party.agents?.length ?? 0) > 2) {
        throw new BadRequestException('대리인은 당사자별 최대 2명까지 등록할 수 있습니다.');
      }
    }

    // Contact 연동은 반드시 같은 사무소의 연락처만 허용 (멀티테넌시 격리)
    const contactIds = Array.from(
      new Set(
        dto.parties
          .flatMap((party) => [
            party.contactId,
            ...(party.agents ?? []).map((agent) => agent.contactId),
          ])
          .filter((contactId): contactId is string => Boolean(contactId)),
      ),
    );

    if (contactIds.length > 0) {
      const ownedCount = await this.prisma.contact.count({
        where: { id: { in: contactIds }, officeId },
      });

      if (ownedCount !== contactIds.length) {
        throw new BadRequestException('다른 사무소의 연락처는 당사자로 연결할 수 없습니다.');
      }
    }

    // 마스킹된 idNumber 라운드트립 보호:
    // GET 응답은 잔금일+15일 경과 시 idNumber 를 '900101-*******' 로 마스킹해
    // 내려주므로, 클라이언트가 받은 목록을 그대로 되돌려 보내면 마스킹 문자열이
    // 원본을 덮어써 실제 식별번호가 영구 소실된다. '*' 포함 값은 기존 행의
    // 저장값을 유지하고, 유지할 원본이 없으면 거부한다.
    //
    // 매칭 규칙 (다른 사람에게 암호화 원본이 붙는 사고 방지):
    // 1) DTO 의 id(불변 식별자, 같은 계약/사무소 행만 조회) + 이름 일치
    // 2) fallback: 위치(side+subId) 매칭 + 이름 일치 (id 를 모르는 구형 클라이언트)
    // 이름이 바뀐 행은 보존하지 않는다 — 재입력 요구로 거부된다.
    const existingIdNumbers = await this.loadExistingPartyIdNumbers(contractId, officeId);

    const parties = await this.prisma.$transaction(async (tx) => {
      await tx.contractParty.deleteMany({ where: { contractId, officeId } });

      const sideCounters = new Map<string, number>();

      for (const party of dto.parties) {
        const nextSubId = (sideCounters.get(party.side) ?? 0) + 1;
        const subId = party.subId ?? nextSubId;
        sideCounters.set(party.side, Math.max(subId, sideCounters.get(party.side) ?? 0));

        const parent = await tx.contractParty.create({
          data: {
            officeId,
            contractId,
            side: party.side,
            subId,
            role: party.role,
            name: party.name,
            idType: party.idType,
            idNumber: this.resolveWriteIdNumber(
              party,
              this.findPreservableIdNumber(
                party,
                existingIdNumbers,
                existingIdNumbers.rootByPosition,
                `${party.side}:${subId}`,
              ),
            ),
            address: party.address,
            phone: encryptContractPartyField(party.phone),
            mobilePhone: encryptContractPartyField(party.mobilePhone),
            sharePercent: party.sharePercent,
            country: party.country,
            contactId: party.contactId,
            officeName: party.officeName,
            officeRegNo: party.officeRegNo,
            partnerOfficeId: party.partnerOfficeId,
          },
        });

        let agentIndex = 0;
        for (const agent of party.agents ?? []) {
          agentIndex += 1;
          await tx.contractParty.create({
            data: {
              officeId,
              contractId,
              side: party.side,
              subId: agentIndex,
              name: agent.name,
              idType: agent.idType,
              idNumber: this.resolveWriteIdNumber(
                agent,
                this.findPreservableIdNumber(
                  agent,
                  existingIdNumbers,
                  existingIdNumbers.agentByPosition,
                  `${party.side}:${subId}:${agentIndex}`,
                ),
              ),
              address: agent.address,
              phone: encryptContractPartyField(agent.phone),
              mobilePhone: encryptContractPartyField(agent.mobilePhone),
              country: agent.country,
              contactId: agent.contactId,
              parentId: parent.id,
              agentLabel: agent.agentLabel ?? (agentIndex === 1 ? '대리인' : '공동대리인'),
            },
          });
        }
      }

      return tx.contractParty.findMany({
        where: { contractId, officeId },
        orderBy: [{ subId: 'asc' }, { createdAt: 'asc' }],
      });
    });

    return this.buildPartiesTree(parties, this.shouldMaskIdNumbers(contract.statedBalanceDate));
  }

  /**
   * 기존 당사자의 저장된 idNumber(암호문 그대로)를 인덱싱.
   * - byId: 불변 식별자(ContractParty.id) 기준 — 우선 매칭 경로.
   *   같은 계약/사무소의 행만 조회하므로 타 계약 id 는 매칭되지 않는다.
   * - rootByPosition / agentByPosition: 위치 기반 fallback
   *   (`side:subId`, `parentSide:parentSubId:agentIndex`).
   * 이름을 함께 보관해 보존 시 동일 인물 여부를 검증한다.
   */
  private async loadExistingPartyIdNumbers(
    contractId: string,
    officeId: string,
  ): Promise<ExistingPartyIdNumberIndex> {
    const existingParties = await this.prisma.contractParty.findMany({
      where: { contractId, officeId },
      select: {
        id: true,
        parentId: true,
        side: true,
        subId: true,
        name: true,
        idNumber: true,
      },
    });

    const rootById = new Map(
      existingParties.filter((party) => !party.parentId).map((party) => [party.id, party]),
    );

    const byId = new Map<string, ExistingPartyIdNumber>();
    const rootByPosition = new Map<string, ExistingPartyIdNumber>();
    const agentByPosition = new Map<string, ExistingPartyIdNumber>();

    for (const party of existingParties) {
      const entry: ExistingPartyIdNumber = {
        name: party.name,
        idNumber: party.idNumber,
      };
      byId.set(party.id, entry);

      if (!party.parentId) {
        rootByPosition.set(`${party.side}:${party.subId}`, entry);
        continue;
      }

      const parent = rootById.get(party.parentId);
      if (parent) {
        agentByPosition.set(`${parent.side}:${parent.subId}:${party.subId}`, entry);
      }
    }

    return { byId, rootByPosition, agentByPosition };
  }

  /**
   * 보존 가능한 기존 idNumber 탐색 — 불변 식별자(id) 우선, 위치 fallback.
   * 두 경로 모두 이름 일치를 요구한다: 행을 다른 사람으로 재활용(이름 변경)한
   * 경우 다른 사람의 실제 식별번호가 조용히 붙는 사고를 차단하기 위함.
   */
  private findPreservableIdNumber(
    party: Pick<ContractPartyDto | ContractPartyAgentDto, 'id' | 'name'>,
    index: ExistingPartyIdNumberIndex,
    positionMap: Map<string, ExistingPartyIdNumber>,
    positionKey: string,
  ): string | null | undefined {
    if (party.id) {
      const matched = index.byId.get(party.id);
      // id 를 명시했는데 이 계약에 없거나 이름이 다르면 위치 fallback 도 쓰지
      // 않는다 (잘못된 행 참조를 위치 우연 일치로 덮지 않기 위함).
      return matched && matched.name === party.name ? matched.idNumber : undefined;
    }

    const matched = positionMap.get(positionKey);
    return matched && matched.name === party.name ? matched.idNumber : undefined;
  }

  /**
   * write-path idNumber 처리:
   * - 평문 입력 → 암호화 저장
   * - 마스킹 문자열('*' 포함) → 동일 인물로 검증된 기존 행의 저장값 유지
   *   (유지할 원본이 없으면 거부)
   */
  private resolveWriteIdNumber(
    party: Pick<ContractPartyDto | ContractPartyAgentDto, 'idNumber' | 'name'>,
    existingIdNumber: string | null | undefined,
  ): string | null | undefined {
    const idNumber = party.idNumber;

    if (!idNumber || !idNumber.includes('*')) {
      return encryptContractPartyField(idNumber);
    }

    if (existingIdNumber) {
      // 기존 저장값 유지 (평문 레거시 행이면 이번 저장에서 암호화로 승격)
      return encryptContractPartyField(existingIdNumber);
    }

    throw new BadRequestException(
      `마스킹된 식별번호는 저장할 수 없습니다 (${party.name}). ` +
        '원본 식별번호를 다시 입력하거나 필드를 비워주세요.',
    );
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
      // 레거시 Orde(탭 순서) → Cntr_Clsf_Orde(동일 서식 반복 순번) 정렬
      orderBy: [{ sortOrder: 'asc' }, { kindOrder: 'asc' }, { createdAt: 'asc' }],
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
    // 레거시 Cntr_Clsf: 명시하지 않으면 템플릿 코드에서 유도.
    // 명시된 kind 는 shared ContractDocumentKind 셋으로 검증 (오타 방지).
    if (dto.kind !== undefined) {
      this.assertContractDocumentKind(dto.kind);
    }
    const kind = dto.kind ?? template?.code;

    if (!category || !title) {
      throw new BadRequestException('문서 제목과 분류를 입력해주세요.');
    }

    const metadata = this.sanitizeDocumentMetadata(dto.metadata);

    this.assertSaleAgreementDocumentCanComplete({
      transactionType: contract.transactionType,
      templateCode: template?.code,
      status,
      metadata,
    });

    const sortOrder = dto.sortOrder ?? (await this.nextDocumentSortOrder(contractId, officeId));
    // 같은 kind 문서 추가 시 자동 증가 (레거시 Cntr_Clsf_Orde — 위임장 2장 케이스)
    const kindOrder =
      dto.kindOrder ??
      (kind ? await this.nextDocumentKindOrder(contractId, officeId, kind) : 1);

    return this.prisma.contractDocument.create({
      data: {
        officeId,
        contractId,
        templateId: dto.templateId,
        type,
        category,
        title,
        status,
        kind,
        sortOrder,
        kindOrder,
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
        metadata,
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

    // null 은 "kind 해제" 시맨틱이므로 문자열일 때만 셋 검증
    if (typeof dto.kind === 'string') {
      this.assertContractDocumentKind(dto.kind);
    }

    const metadata = this.sanitizeDocumentMetadata(dto.metadata);

    this.assertSaleAgreementDocumentCanComplete({
      transactionType: document.contract.transactionType,
      templateCode: nextTemplate?.code,
      status: dto.status ?? document.status,
      metadata: metadata ?? document.metadata,
    });

    return this.prisma.contractDocument.update({
      where: { id: documentId },
      data: {
        templateId: dto.templateId,
        type: dto.type,
        category: dto.category,
        title: dto.title,
        status: dto.status,
        kind: dto.kind,
        sortOrder: dto.sortOrder,
        kindOrder: dto.kindOrder,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        generatedAt: this.toNullableDate(dto.generatedAt),
        signedAt: this.toNullableDate(dto.signedAt),
        submittedAt: this.toNullableDate(dto.submittedAt),
        externalRefId: dto.externalRefId,
        metadata,
        memo: dto.memo,
      },
      include: contractDocumentInclude,
    });
  }

  /**
   * 서식 단건 사본 (레거시 "다른저장" 문서 단위 대응).
   * 원본의 서식/필드(metadata)를 복제해 새 draft 문서를 만들고,
   * 같은 kind 내 다음 kindOrder 를 부여한다 (위임장 2장 케이스).
   *
   * 리비전 정합: 사본은 새 문서이므로 원본의 승인 이력(currentRevisionId /
   * revisions)은 복제하지 않는다. metadata 는 원본의 "현재 적용된 내용"
   * 스냅샷으로만 복사되고, 사본의 승인 파이프라인(prepare → apply)은
   * currentRevisionId = null 에서 새로 시작한다.
   */
  async copyDocument(
    contractId: string,
    documentId: string,
    officeId: string,
    userId: string,
    dto: ContractDocumentCopyDto = {},
  ) {
    await this.assertContract(contractId, officeId);

    const source = await this.prisma.contractDocument.findFirst({
      where: { id: documentId, contractId, officeId },
    });

    if (!source) {
      throw new NotFoundException('Contract document not found');
    }

    const sortOrder = await this.nextDocumentSortOrder(contractId, officeId);
    const kindOrder = source.kind
      ? await this.nextDocumentKindOrder(contractId, officeId, source.kind)
      : await this.nextDocumentKindOrderFallback(contractId, officeId, source);

    return this.prisma.contractDocument.create({
      data: {
        officeId,
        contractId,
        templateId: source.templateId,
        type: source.type,
        category: source.category,
        title: dto.title ?? source.title,
        status: 'draft',
        kind: source.kind,
        sortOrder,
        kindOrder,
        fileUrl: source.fileUrl,
        fileSize: source.fileSize,
        mimeType: source.mimeType,
        generatedById: userId,
        metadata: (source.metadata ?? {}) as Prisma.InputJsonValue,
        memo: source.memo,
      },
      include: contractDocumentInclude,
    });
  }

  /**
   * 계약 문서 세트 전체 사본 (레거시 "계약서/서식 복사" 대응).
   *
   * Contract.dealId 가 @unique (Deal 1:1) 이므로 Contract 행 자체를 복제해
   * 같은 Deal 에 붙일 수 없다. 따라서 전체 사본은 "동일 Deal(=동일 Contract) 내
   * 문서 세트를 복제해 새 draft 문서들로 추가"하는 방식으로 구현한다.
   * 당사자(ContractParty)는 Contract 레벨에 1벌만 존재하므로 복제하지 않고
   * 그대로 재사용된다. Deal 없는 독립 문서 묶음(단독 서식)은 후속 단계에서
   * contractId nullable 화와 함께 다룬다.
   *
   * 리비전 정합: copyDocument 와 동일하게 원본 문서의 currentRevisionId /
   * revisions 는 복제하지 않는다 — 사본 문서들의 승인 이력은 새로 시작한다.
   */
  async copyContract(contractId: string, officeId: string, userId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, officeId },
      include: {
        documents: {
          orderBy: [{ sortOrder: 'asc' }, { kindOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    const allDocuments = contract.documents ?? [];
    const sourceDocuments = allDocuments.filter((document) => document.status !== 'cancelled');

    if (sourceDocuments.length === 0) {
      throw new BadRequestException('복제할 문서가 없습니다.');
    }

    // 현재 문서들로부터 다음 sortOrder / kind별 kindOrder 시작점을 계산
    let nextSortOrder =
      allDocuments.reduce((max, document) => Math.max(max, document.sortOrder ?? 0), -1) + 1;

    const kindCounters = new Map<string, number>();
    for (const document of allDocuments) {
      const key = this.documentKindKey(document);
      kindCounters.set(key, Math.max(kindCounters.get(key) ?? 0, document.kindOrder ?? 1));
    }

    await this.prisma.$transaction(async (tx) => {
      for (const source of sourceDocuments) {
        const key = this.documentKindKey(source);
        const kindOrder = (kindCounters.get(key) ?? 0) + 1;
        kindCounters.set(key, kindOrder);

        await tx.contractDocument.create({
          data: {
            officeId,
            contractId,
            templateId: source.templateId,
            type: source.type,
            category: source.category,
            title: source.title,
            status: 'draft',
            kind: source.kind,
            sortOrder: nextSortOrder,
            kindOrder,
            fileUrl: source.fileUrl,
            fileSize: source.fileSize,
            mimeType: source.mimeType,
            generatedById: userId,
            metadata: (source.metadata ?? {}) as Prisma.InputJsonValue,
            memo: source.memo,
          },
        });

        nextSortOrder += 1;
      }
    });

    return this.findOne(contractId, officeId);
  }

  /**
   * 계약 영구 삭제 (레거시 §1.3 삭제 액션).
   * 소속 문서(ContractDocument)·당사자(ContractParty)·문서 리비전
   * (ContractDocumentRevision)은 DB onDelete: Cascade 로 함께 삭제된다.
   * 복구 불가 — 클라이언트는 확인 다이얼로그를 거친다.
   */
  async remove(id: string, officeId: string) {
    await this.assertContract(id, officeId);

    await this.prisma.contract.delete({ where: { id } });

    return { id, deleted: true };
  }

  /**
   * 문서 단건 영구 삭제 — status=cancelled 우회가 아닌 실제 삭제.
   * 문서의 revisions 는 onDelete: Cascade 로 함께 삭제된다.
   */
  async removeDocument(contractId: string, documentId: string, officeId: string) {
    const document = await this.prisma.contractDocument.findFirst({
      where: { id: documentId, contractId, officeId },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('Contract document not found');
    }

    await this.prisma.contractDocument.delete({ where: { id: documentId } });

    return { id: documentId, deleted: true };
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

    // 당사자: side(one→two→office) → subId 정렬, 대리인은 parentId 로 중첩
    const parties = this.buildPartiesTree(
      contract.parties ?? [],
      this.shouldMaskIdNumbers(contract.statedBalanceDate),
    );

    return {
      ...contract,
      parties,
      documentCount: activeDocuments.length,
      missingDocumentCount: missingTemplates.length,
      requiredDocuments: requiredTemplates.map((template) => template.title),
      missingDocuments: missingTemplates.map((template) => template.title),
      requiredDocumentTemplates: requiredTemplates,
      // 거래신고 상태 롤업 (레거시 TRAN_REPT_CLSF 대응) —
      // category=report 문서(cancelled 제외)의 최상위 status. 없으면 'none'.
      transactionReportStatus: this.rollupTransactionReportStatus(activeDocuments),
    };
  }

  /** report 문서 status 랭크 — 높은 값이 더 진행된 상태 */
  private static readonly REPORT_STATUS_RANK: Record<string, number> = {
    draft: 1,
    generated: 2,
    signed: 3,
    submitted: 4,
    archived: 5,
  };

  /**
   * 거래신고 상태 롤업 (레거시 TRAN_REPT_CLSF, legacy-spec §1.4 / G9).
   * category=report 문서들 중 가장 진행된 status 를 목록 컬럼으로 노출한다.
   * 신고 문서가 없으면 'none' (레거시 "해당없음/미지정" 대응).
   */
  private rollupTransactionReportStatus(
    activeDocuments: Array<{ category: string; status: string }>,
  ): string {
    const reportDocuments = activeDocuments.filter((document) => document.category === 'report');

    if (reportDocuments.length === 0) {
      return 'none';
    }

    let rolledUp = reportDocuments[0].status;
    let bestRank = ContractsService.REPORT_STATUS_RANK[rolledUp] ?? 0;

    for (const document of reportDocuments.slice(1)) {
      const rank = ContractsService.REPORT_STATUS_RANK[document.status] ?? 0;
      if (rank > bestRank) {
        bestRank = rank;
        rolledUp = document.status;
      }
    }

    return rolledUp;
  }

  // ─── 당사자 응답 조립 + 주민번호 마스킹 정책 ────────────────────

  /**
   * 잔금일(statedBalanceDate) + 15일 경과 여부 — 레거시 changeRegNumber 이식.
   * 경과 시 조회 응답의 idNumber 뒷자리를 마스킹한다.
   */
  shouldMaskIdNumbers(
    statedBalanceDate: Date | string | null | undefined,
    now: Date = new Date(),
  ): boolean {
    if (!statedBalanceDate) {
      return false;
    }

    const balanceTime = new Date(statedBalanceDate).getTime();

    if (!Number.isFinite(balanceTime)) {
      return false;
    }

    return now.getTime() > balanceTime + ID_NUMBER_MASK_GRACE_DAYS * DAY_MS;
  }

  /**
   * 식별번호 뒷자리 마스킹.
   * "900101-1234567" → "900101-*******" (하이픈 뒤 전체 마스킹).
   * 하이픈이 없으면 앞 6자리만 남기고 마스킹.
   */
  maskIdNumber(idNumber: string): string {
    const hyphenIndex = idNumber.indexOf('-');

    if (hyphenIndex >= 0) {
      return (
        idNumber.slice(0, hyphenIndex + 1) +
        '*'.repeat(Math.max(idNumber.length - hyphenIndex - 1, 0))
      );
    }

    const visibleLength = Math.min(6, Math.ceil(idNumber.length / 2));
    return (
      idNumber.slice(0, visibleLength) +
      '*'.repeat(Math.max(idNumber.length - visibleLength, 0))
    );
  }

  private buildPartiesTree(parties: ContractPartyRecord[], maskIds: boolean) {
    // 복호화(암호화 저장 컬럼) → 마스킹 정책 순으로 적용.
    // 암호화 도입 이전 평문 행은 decrypt 가 그대로 통과시킨다.
    const maskParty = <
      T extends {
        idNumber: string | null;
        phone: string | null;
        mobilePhone: string | null;
      },
    >(
      party: T,
    ): T => {
      const idNumber = (decryptContractPartyField(party.idNumber) as string | null) ?? null;

      return {
        ...party,
        idNumber: maskIds && idNumber ? this.maskIdNumber(idNumber) : idNumber,
        phone: (decryptContractPartyField(party.phone) as string | null) ?? null,
        mobilePhone: (decryptContractPartyField(party.mobilePhone) as string | null) ?? null,
      };
    };

    const roots = parties
      .filter((party) => !party.parentId)
      .sort((left, right) => {
        const sideDelta =
          (PARTY_SIDE_RANK[left.side] ?? 9) - (PARTY_SIDE_RANK[right.side] ?? 9);
        if (sideDelta !== 0) {
          return sideDelta;
        }

        return left.subId - right.subId;
      });

    return roots.map((root) => ({
      ...maskParty(root),
      agents: parties
        .filter((party) => party.parentId === root.id)
        .sort((left, right) => left.subId - right.subId)
        .map(maskParty),
    }));
  }

  // ─── 목록 필터 (레거시 DMLS001Q01 대응) ─────────────────────────

  private buildContractWhere(
    officeId: string,
    query: ContractSearchQuery,
  ): Prisma.ContractWhereInput {
    const filters: Prisma.ContractWhereInput[] = [{ officeId }];

    // 서식 종류 (레거시 Cntr_Clsf IN절 + DocList 부속서식 포함 검색):
    // 주 서식이든 부속 서식이든 해당 kind 문서를 포함한 계약을 찾는다.
    const kinds = this.toArray(query.kind);
    if (kinds.length > 0) {
      filters.push({
        documents: {
          some: {
            status: { not: 'cancelled' },
            OR: [{ kind: { in: kinds } }, { template: { code: { in: kinds } } }],
          },
        },
      });
    }

    if (query.category) {
      filters.push({
        documents: {
          some: { category: query.category, status: { not: 'cancelled' } },
        },
      });
    }

    const transactionTypes = this.toArray(query.transactionType);
    if (transactionTypes.length > 0) {
      for (const transactionType of transactionTypes) {
        this.assertContractTransactionType(transactionType);
      }
      filters.push({ transactionType: { in: transactionTypes } });
    }

    const statuses = this.toArray(query.status);
    if (statuses.length > 0) {
      filters.push({ status: { in: statuses } });
    }

    // 날짜 필터 (레거시 Date_Clsf + Date_From/To)
    if (query.dateField !== undefined || query.dateFrom || query.dateTo) {
      const dateField = (query.dateField ?? 'contractDate') as ContractDateField;
      if (!CONTRACT_DATE_FIELDS.includes(dateField)) {
        throw new BadRequestException(
          `허용되지 않은 날짜 검색 기준입니다: ${query.dateField}. 허용: ${CONTRACT_DATE_FIELDS.join(', ')}`,
        );
      }

      if (query.dateFrom || query.dateTo) {
        filters.push({
          [dateField]: {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          },
        } as Prisma.ContractWhereInput);
      }
    }

    // 금액 필터 (레거시 Price_Clsf + Price_From/To — 만원 단위 그대로)
    if (
      query.priceField !== undefined ||
      query.priceMin !== undefined ||
      query.priceMax !== undefined
    ) {
      const priceField = (query.priceField ?? 'totalPrice') as ContractPriceField;
      if (!CONTRACT_PRICE_FIELDS.includes(priceField)) {
        throw new BadRequestException(
          `허용되지 않은 금액 검색 기준입니다: ${query.priceField}. 허용: ${CONTRACT_PRICE_FIELDS.join(', ')}`,
        );
      }

      if (query.priceMin !== undefined || query.priceMax !== undefined) {
        filters.push({
          [priceField]: {
            ...(query.priceMin !== undefined ? { gte: query.priceMin } : {}),
            ...(query.priceMax !== undefined ? { lte: query.priceMax } : {}),
          },
        } as Prisma.ContractWhereInput);
      }
    }

    // 텍스트 검색 (레거시 SearchClsf + SearchText)
    if (query.search) {
      const searchField = (query.searchField ?? 'all') as ContractSearchField;
      if (!CONTRACT_SEARCH_FIELDS.includes(searchField)) {
        throw new BadRequestException(
          `허용되지 않은 텍스트 검색 기준입니다: ${query.searchField}. 허용: ${CONTRACT_SEARCH_FIELDS.join(', ')}`,
        );
      }

      filters.push({
        OR: this.buildSearchClauses(searchField, query.search),
      });
    }

    // 공동중개 (레거시 Union=Y) — Deal.isJointBrokerage 경유
    if (query.isJointBrokerage !== undefined) {
      filters.push({ deal: { isJointBrokerage: query.isJointBrokerage } });
    }

    // 보존기간 경과 (레거시 PeriodOver, 기본 5년) —
    // contractDate(없으면 createdAt)가 기준일 이전인 계약만.
    if (query.retentionOverdue) {
      const cutoff = this.resolveRetentionCutoff(query.retentionBefore);
      filters.push({
        OR: [
          { contractDate: { lte: cutoff } },
          { AND: [{ contractDate: null }, { createdAt: { lte: cutoff } }] },
        ],
      });
    }

    return filters.length === 1 ? filters[0] : { AND: filters };
  }

  /** 보존기간 기준일 — retentionBefore(ISO) 지정 시 그 날짜, 아니면 오늘 - 5년 */
  private resolveRetentionCutoff(retentionBefore?: string): Date {
    if (retentionBefore) {
      const cutoff = new Date(retentionBefore);

      if (Number.isNaN(cutoff.getTime())) {
        throw new BadRequestException(`잘못된 보존기간 기준일입니다: ${retentionBefore}`);
      }

      return cutoff;
    }

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - DEFAULT_RETENTION_YEARS);
    return cutoff;
  }

  private buildSearchClauses(
    searchField: ContractSearchField,
    search: string,
  ): Prisma.ContractWhereInput[] {
    const contains = { contains: search, mode: 'insensitive' as const };
    const clauses: Prisma.ContractWhereInput[] = [];

    if (searchField === 'title' || searchField === 'all') {
      clauses.push({ documents: { some: { title: contains } } });
    }

    if (searchField === 'party' || searchField === 'all') {
      // 신규 ContractParty.name + 기존 대표 당사자(buyer/sellerContact.name) 모두
      clauses.push(
        { parties: { some: { name: contains } } },
        { buyerContact: { name: contains } },
        { sellerContact: { name: contains } },
      );
    }

    if (searchField === 'phone' || searchField === 'all') {
      // 레거시 SearchClsf=PhneNo — CTI 발신번호로 계약 찾기.
      // 주 검색 경로는 연동된 Contact.phones (평문). ContractParty.phone 은
      // 암호화 저장이므로 contains 는 암호화 이전 평문 행만 매칭한다.
      clauses.push(
        {
          parties: {
            some: {
              OR: [
                { phone: contains },
                { mobilePhone: contains },
                { contact: { phones: { some: { phone: contains } } } },
              ],
            },
          },
        },
        { buyerContact: { phones: { some: { phone: contains } } } },
        { sellerContact: { phones: { some: { phone: contains } } } },
      );

      // normalizedPhone(숫자만 저장)도 함께 검색 — 숫자만 입력(CTI 발신번호)이든
      // 하이픈 포함 입력이든 하이픈 저장 번호와 매칭되도록 항상 추가
      const digits = search.replace(/\D/g, '');
      if (digits.length > 0) {
        const normalizedContains = {
          contains: digits,
          mode: 'insensitive' as const,
        };
        clauses.push(
          {
            parties: {
              some: {
                contact: {
                  phones: { some: { normalizedPhone: normalizedContains } },
                },
              },
            },
          },
          {
            buyerContact: {
              phones: { some: { normalizedPhone: normalizedContains } },
            },
          },
          {
            sellerContact: {
              phones: { some: { normalizedPhone: normalizedContains } },
            },
          },
        );
      }
    }

    if (searchField === 'partnerOffice' || searchField === 'all') {
      // 레거시 SearchClsf=OffcName — 공동중개사무소명 검색.
      // Deal.partnerBroker(주소록) + ContractParty(side=office).officeName 모두.
      clauses.push(
        { deal: { partnerBroker: { name: contains } } },
        { parties: { some: { officeName: contains } } },
      );
    }

    if (searchField === 'address' || searchField === 'all') {
      // deal → listing → property → site 주소 체인
      clauses.push({
        deal: {
          listing: {
            property: {
              site: {
                OR: [
                  { name: contains },
                  { roadAddress: contains },
                  { jibunAddress: contains },
                ],
              },
            },
          },
        },
      });
      // 문서 엔진 필드에 기록된 소재지 (documents.metadata.documentEngine.fields.propertyAddress)
      clauses.push({
        documents: {
          some: {
            metadata: {
              path: ['documentEngine', 'fields', 'propertyAddress'],
              string_contains: search,
            },
          },
        },
      });
    }

    if (searchField === 'memo' || searchField === 'all') {
      clauses.push({ memo: contains });
    }

    return clauses;
  }

  // ─── 문서 순번 (레거시 Orde / Cntr_Clsf_Orde) ──────────────────

  private async nextDocumentSortOrder(contractId: string, officeId: string) {
    const aggregate = await this.prisma.contractDocument.aggregate({
      where: { contractId, officeId },
      _max: { sortOrder: true },
    });

    return (aggregate._max.sortOrder ?? -1) + 1;
  }

  private async nextDocumentKindOrder(contractId: string, officeId: string, kind: string) {
    const aggregate = await this.prisma.contractDocument.aggregate({
      where: { contractId, officeId, kind },
      _max: { kindOrder: true },
    });

    return (aggregate._max.kindOrder ?? 0) + 1;
  }

  /** kind 미지정 문서 사본용 — templateId, 없으면 title 로 반복 순번을 계산 */
  private async nextDocumentKindOrderFallback(
    contractId: string,
    officeId: string,
    source: { templateId: string | null; title: string },
  ) {
    const aggregate = await this.prisma.contractDocument.aggregate({
      where: {
        contractId,
        officeId,
        ...(source.templateId ? { templateId: source.templateId } : { title: source.title }),
      },
      _max: { kindOrder: true },
    });

    return (aggregate._max.kindOrder ?? 0) + 1;
  }

  private documentKindKey(document: {
    kind: string | null;
    templateId: string | null;
    title: string;
  }) {
    return (
      document.kind ??
      (document.templateId ? `template:${document.templateId}` : `title:${document.title}`)
    );
  }

  private toArray(value?: string | string[]): string[] {
    if (value === undefined) {
      return [];
    }

    const values = Array.isArray(value) ? value : [value];

    return values
      .flatMap((item) => item.split(','))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /**
   * 문서 metadata 특약(rich text HTML) 방어적 새니타이즈 — 클라이언트
   * 새니타이즈를 우회한 저장 시도(직접 API/MCP 호출) 차단.
   *
   * shared 엔진(readDocumentEngineFields)은 specialTerms 를
   * `documentEngine.fields` / `engine.fields` / `fields` 세 위치에서 읽으므로
   * 세 곳 모두 새니타이즈한다 — 한 곳만 막으면 대체 키로 raw <script> HTML 이
   * 저장돼 DB 를 신뢰하는 소비자(서버 PDF, MCP 출력 등)에 stored-XSS 가 된다.
   * 구조가 예상과 다르면 원본을 그대로 반환한다 (렌더 경로에서 재차 새니타이즈).
   *
   * 리비전 파이프라인 주의: applyRevision 은 사람이 검토·승인한 payload 를
   * contentHash 검증 후 그대로 metadata 에 쓰므로 이 경로를 우회한다 —
   * 해시 무결성을 깨지 않기 위한 의도된 동작이다.
   */
  private sanitizeDocumentMetadata(
    metadata: Prisma.InputJsonValue | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return metadata;
    }

    const record = metadata as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;

    // 중첩 컨테이너: metadata.documentEngine.fields / metadata.engine.fields
    for (const containerKey of ['documentEngine', 'engine'] as const) {
      const container = record[containerKey];
      if (!container || typeof container !== 'object' || Array.isArray(container)) {
        continue;
      }

      const containerRecord = container as Record<string, unknown>;
      const sanitizedFields = this.sanitizeEngineFieldsRecord(containerRecord.fields);
      if (sanitizedFields) {
        next = next ?? { ...record };
        next[containerKey] = { ...containerRecord, fields: sanitizedFields };
      }
    }

    // 레거시 최상위 컨테이너: metadata.fields
    const sanitizedTopLevelFields = this.sanitizeEngineFieldsRecord(record.fields);
    if (sanitizedTopLevelFields) {
      next = next ?? { ...record };
      next.fields = sanitizedTopLevelFields;
    }

    return (next ?? metadata) as Prisma.InputJsonValue;
  }

  /**
   * fields.specialTerms 가 문자열이고 새니타이즈로 값이 바뀌면 교체된 fields
   * 객체를, 변경이 없거나 구조가 다르면 null 을 반환한다.
   */
  private sanitizeEngineFieldsRecord(fields: unknown): Record<string, unknown> | null {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return null;
    }

    const fieldsRecord = fields as Record<string, unknown>;
    const specialTerms = fieldsRecord.specialTerms;
    if (typeof specialTerms !== 'string') return null;

    const sanitized = sanitizeContractRichTextValue(specialTerms);
    if (sanitized === specialTerms) return null;

    return { ...fieldsRecord, specialTerms: sanitized };
  }

  /**
   * ContractDocument.kind 검증 — shared `CONTRACT_DOCUMENT_KINDS`(현행 39종)에
   * 없는 자유 문자열 kind 는 거부한다. 템플릿(templateId)에서 유도되는 kind 는
   * DB 카탈로그에 존재하는 코드이므로 검증하지 않는다 (사무소 커스텀 템플릿 허용).
   */
  private assertContractDocumentKind(kind: string) {
    if (!CONTRACT_DOCUMENT_KIND_SET.has(kind)) {
      throw new BadRequestException(
        `허용되지 않은 서식 코드(kind)입니다: ${kind}. ` +
          'packages/shared 의 ContractDocumentKind 목록을 확인하세요.',
      );
    }
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
