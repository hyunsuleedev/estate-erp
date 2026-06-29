import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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

@ApiTags('계약')
@ApiBearerAuth()
@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.contractsService.findAll(user.officeId);
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

  @Get(':id/documents')
  listDocuments(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.listDocuments(id, user.officeId);
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

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contractsService.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
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
}
