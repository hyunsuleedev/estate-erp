import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { OfficesService } from './offices.service';

@ApiTags('사무소')
@ApiBearerAuth()
@Controller('offices')
@UseGuards(JwtAuthGuard)
export class OfficesController {
  constructor(private readonly officesService: OfficesService) {}

  @Post('me')
  createForCurrentUser(
    @Body()
    dto: {
      name: string;
      licenseNo?: string | null;
      ceoName?: string | null;
      phone?: string | null;
      address?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.officesService.createForCurrentUser(user.userId, dto);
  }

  @Get('me')
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.officesService.getMe(user.officeId);
  }

  @Patch('me')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  updateMe(
    @Body()
    dto: {
      name?: string;
      licenseNo?: string | null;
      ceoName?: string | null;
      phone?: string | null;
      address?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.officesService.updateMe(user.officeId, dto);
  }

  @Patch('me/commission-config')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  updateCommissionConfig(
    @Body()
    dto: {
      distributionType?: string;
      defaultAgentRate?: number;
      listingAgentRate?: number;
      buyingAgentRate?: number;
      dualAgentRate?: number;
      managerRate?: number;
      closerBonus?: number;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.officesService.updateCommissionConfig(user.officeId, dto);
  }

}
