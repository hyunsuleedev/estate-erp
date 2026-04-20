import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { CommissionAdjustmentService } from './commission-adjustment.service';

@ApiTags('Finance / Commission Adjustment')
@ApiBearerAuth()
@Controller('finance/commission-adjustments')
@UseGuards(JwtAuthGuard)
export class CommissionAdjustmentController {
  constructor(private readonly service: CommissionAdjustmentService) {}

  @Get('pending')
  listPending(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listPending(user.officeId);
  }

  @Get()
  listByPayment(
    @CurrentUser() user: CurrentUserPayload,
    @Query('paymentId') paymentId: string,
  ) {
    return this.service.listByPayment(user.officeId, paymentId);
  }

  @Post()
  request(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      paymentId: string;
      type: 'discount' | 'waive' | 'bad_debt';
      amount: number;
      reason: string;
    },
  ) {
    return this.service.request(user.officeId, user.userId, body);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { decisionNote?: string },
  ) {
    return this.service.approve(
      id,
      user.officeId,
      user.userId,
      body.decisionNote,
    );
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { decisionNote?: string },
  ) {
    return this.service.reject(
      id,
      user.officeId,
      user.userId,
      body.decisionNote,
    );
  }
}
