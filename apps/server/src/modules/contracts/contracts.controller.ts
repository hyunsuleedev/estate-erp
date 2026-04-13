import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
      contractDeposit?: number;
      contractDepositDate?: string;
      contractDepositPaid?: boolean;
      middlePayment?: number;
      middlePaymentDate?: string;
      middlePaymentPaid?: boolean;
      finalPayment?: number;
      finalPaymentDate?: string;
      finalPaymentPaid?: boolean;
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
      contractDeposit?: number | null;
      contractDepositDate?: string | null;
      contractDepositPaid?: boolean;
      middlePayment?: number | null;
      middlePaymentDate?: string | null;
      middlePaymentPaid?: boolean;
      finalPayment?: number | null;
      finalPaymentDate?: string | null;
      finalPaymentPaid?: boolean;
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
