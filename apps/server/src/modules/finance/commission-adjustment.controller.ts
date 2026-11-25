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
import { uuidParam } from './finance-params';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { CommissionAdjustmentService } from './commission-adjustment.service';

@ApiTags('재무 · 수수료 조정')
@ApiBearerAuth()
@Controller('finance/commission-adjustments')
@UseGuards(JwtAuthGuard)
export class CommissionAdjustmentController {
  constructor(private readonly service: CommissionAdjustmentService) {}

  @Get('pending')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  listPending(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listPending(user.officeId);
  }

  @Get()
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
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
    return this.service.request(user.officeId, user.userId, body, { userId: user.userId, role: user.role });
  }

  @Post(':id/approve')
  @Roles('owner')
  @UseGuards(RolesGuard)
  approve(
    @Param('id', uuidParam('조정 요청')) id: string,
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
  @Roles('owner')
  @UseGuards(RolesGuard)
  reject(
    @Param('id', uuidParam('조정 요청')) id: string,
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
