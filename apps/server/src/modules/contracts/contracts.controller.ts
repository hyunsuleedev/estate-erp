import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { ContractsService } from './contracts.service';
import { ReplaceContractPartiesDto } from './dto/contract-party.dto';

@ApiTags('계약')
@ApiBearerAuth()
@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  /**
   * 계약/문서 목록 조회 — 레거시 문서관리 목록(DMLS001Q01) 대응 필터.
   * 모든 파라미터 optional. 파라미터 없이 호출하면 기존과 동일하게
   * 전체 계약 배열을 반환한다 (하위호환). page/limit 지정 시
   * { items, pagination } 봉투로 반환.
   */
  @Get()
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('kind') kind?: string | string[],
    @Query('category') category?: string,
    @Query('transactionType') transactionType?: string | string[],
    @Query('status') status?: string | string[],
    @Query('dateField') dateField?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('priceField') priceField?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('searchField') searchField?: string,
    @Query('search') search?: string,
    @Query('isJointBrokerage') isJointBrokerage?: string,
    @Query('retentionOverdue') retentionOverdue?: string,
    @Query('retentionBefore') retentionBefore?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contractsService.findAll(user.officeId, {
      kind,
      category,
      transactionType,
      status,
      dateField,
      dateFrom,
      dateTo,
      priceField,
      priceMin: this.toNumber(priceMin),
      priceMax: this.toNumber(priceMax),
      searchField,
      search,
      isJointBrokerage:
        isJointBrokerage === undefined ? undefined : isJointBrokerage === 'true',
      // 보존기간 경과 필터 (레거시 PeriodOver, 기본 5년)
      retentionOverdue:
        retentionOverdue === undefined ? undefined : retentionOverdue === 'true',
      retentionBefore,
      page: this.toNumber(page),
      limit: this.toNumber(limit),
    });
  }

  @Get('document-templates')
  getDocumentTemplates(
    @CurrentUser() user: CurrentUserPayload,
    @Query('transactionType') transactionType?: string,
    @Query('category') category?: string,
    @Query('requiredOnly') requiredOnly?: string,
  ) {
    return this.contractsService.getDocumentTemplates(user.officeId, {
      transactionType,
      category,
      requiredOnly: requiredOnly === 'true' ? true : undefined,
    });
  }

  @Get('print-templates')
  listPrintTemplates(
    @CurrentUser() user: CurrentUserPayload,
    @Query('type') type?: string,
    @Query('transactionType') transactionType?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.contractsService.listPrintTemplates(user.officeId, {
      type,
      transactionType,
      activeOnly: activeOnly === 'false' ? false : undefined,
    });
  }

  @Post('print-templates')
  createPrintTemplate(
    @Body()
    dto: {
      type: string;
      title: string;
      transactionTypes?: string[];
      isDefault?: boolean;
      isActive?: boolean;
      data?: Prisma.InputJsonValue;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.createPrintTemplate(
      user.officeId,
      user.userId,
      dto,
    );
  }

  @Patch('print-templates/:templateId')
  updatePrintTemplate(
    @Param('templateId') templateId: string,
    @Body()
    dto: {
      type?: string;
      title?: string;
      transactionTypes?: string[];
      isDefault?: boolean;
      isActive?: boolean;
      data?: Prisma.InputJsonValue;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.updatePrintTemplate(
      templateId,
      user.officeId,
      dto,
    );
  }

  @Delete('print-templates/:templateId')
  removePrintTemplate(
    @Param('templateId') templateId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.removePrintTemplate(templateId, user.officeId);
  }

  @Get('clause-templates')
  listClauseTemplates(
    @CurrentUser() user: CurrentUserPayload,
    @Query('type') type?: string,
    @Query('contractKind') contractKind?: string,
    @Query('transactionType') transactionType?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.contractsService.listClauseTemplates(user.officeId, {
      type,
      contractKind,
      transactionType,
      activeOnly: activeOnly === 'false' ? false : undefined,
    });
  }

  @Post('clause-templates')
  createClauseTemplate(
    @Body()
    dto: {
      type: string;
      contractKind?: string | null;
      transactionTypes?: string[];
      title: string;
      content: string;
      isDefault?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.createClauseTemplate(
      user.officeId,
      user.userId,
      dto,
    );
  }

  @Patch('clause-templates/:templateId')
  updateClauseTemplate(
    @Param('templateId') templateId: string,
    @Body()
    dto: {
      type?: string;
      contractKind?: string | null;
      transactionTypes?: string[];
      title?: string;
      content?: string;
      isDefault?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.updateClauseTemplate(
      templateId,
      user.officeId,
      dto,
    );
  }

  @Delete('clause-templates/:templateId')
  removeClauseTemplate(
    @Param('templateId') templateId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.removeClauseTemplate(
      templateId,
      user.officeId,
    );
  }

  /**
   * 계약서 당사자 전체 교체 (레거시 TPCT02S/TPCT28S 저장 대응).
   * 단일 트랜잭션으로 기존 당사자 삭제 후 일괄 생성. 대리인은 agents 중첩.
   */
  @Put(':id/parties')
  replaceParties(
    @Param('id') id: string,
    @Body() dto: ReplaceContractPartiesDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.replaceParties(id, user.officeId, dto);
  }

  /**
   * 계약 문서 세트 전체 사본 (레거시 "계약서/서식 복사" 대응).
   *
   * 설계 근거: Contract.dealId 는 @unique (Deal 1:1) 라서 Contract 행을
   * 복제해 같은 Deal 에 다시 연결할 수 없다. 그래서 전체 사본은
   * "동일 Deal(=동일 Contract) 안에서 문서 세트를 복제해 새 draft 문서로
   * 추가"하는 방식으로 구현한다. 당사자(ContractParty)는 Contract 레벨에
   * 1벌만 존재하므로 복제 없이 그대로 재사용된다.
   */
  @Post(':id/copy')
  copyContract(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.copyContract(id, user.officeId, user.userId);
  }

  /**
   * 서식 단건 사본 (레거시 "다른저장" 대응) — 같은 kind 의 다음
   * kindOrder(Cntr_Clsf_Orde)를 부여해 위임장 2장 케이스를 지원한다.
   */
  @Post(':id/documents/:documentId/copy')
  copyDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() dto: { title?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.copyDocument(
      id,
      documentId,
      user.officeId,
      user.userId,
      dto ?? {},
    );
  }

  @Get(':id/documents')
  listDocuments(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.listDocuments(id, user.officeId);
  }

  @Get(':id/documents/:documentId/revisions')
  listDocumentRevisions(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.listDocumentRevisions(id, documentId, user.officeId);
  }

  @Post(':id/documents/:documentId/revisions/:revisionId/apply')
  applyDocumentRevision(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: { contentHash: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.applyDocumentRevision(
      id,
      documentId,
      revisionId,
      user.officeId,
      user.userId,
      dto.contentHash,
    );
  }

  @Post(':id/sale-contract-draft/prepare')
  prepareSaleContractDraft(
    @Param('id') id: string,
    @Body()
    dto: {
      actualAgreementAt?: string;
      conditions?: string;
      specialTerms?: string;
      rightsTransferDetails?: string;
      explanationDeliveredAt?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.prepareSaleContractDraft(
      id,
      user.officeId,
      user.userId,
      dto,
    );
  }

  @Get(':id/sale-contract-draft/validate')
  validateSaleContractDraft(
    @Param('id') id: string,
    @Query('revisionId') revisionId: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.validateSaleContractDraft(id, user.officeId, revisionId);
  }

  @Post(':id/documents')
  createDocument(
    @Param('id') id: string,
    @Body()
    dto: {
      templateId?: string;
      type?: string;
      category?: string;
      title?: string;
      status?: string;
      kind?: string;
      sortOrder?: number;
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
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.createDocument(
      id,
      user.officeId,
      user.userId,
      dto,
    );
  }

  @Patch(':id/documents/:documentId')
  updateDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body()
    dto: {
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
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.updateDocument(
      id,
      documentId,
      user.officeId,
      dto,
    );
  }

  /**
   * 문서 단건 영구 삭제 (레거시 §1.3 삭제) — cancelled 우회가 아닌 실제 삭제.
   * 문서 revisions 는 cascade 삭제. 복구 불가하므로 클라이언트는 확인
   * 다이얼로그를 거친다.
   */
  @Delete(':id/documents/:documentId')
  removeDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.removeDocument(id, documentId, user.officeId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.findOne(id, user.officeId);
  }

  /**
   * 계약 영구 삭제 (레거시 §1.3 삭제) — 문서/당사자/리비전 cascade 삭제, 복구 불가.
   */
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.remove(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      dealId?: string;
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
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
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
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.update(id, user.officeId, dto);
  }

  private toNumber(value?: string): number | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
