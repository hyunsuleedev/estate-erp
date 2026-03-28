import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('세입자')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get()
  findByProperty(
    @Query('propertyId') propertyId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findByProperty(user.officeId, propertyId);
  }

  @Get('expiring')
  findExpiring(
    @Query('days') days: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findExpiringContracts(
      user.officeId,
      days ? Number(days) : 90,
    );
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      propertyId: string;
      contactId: string;
      deposit?: number;
      monthlyRent?: number;
      contractStart?: string;
      contractEnd?: string;
      moveOutDate?: string;
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.officeId, dto);
  }

  @Post('with-contact')
  createWithNewContact(
    @Body()
    dto: {
      propertyId: string;
      name: string;
      phone?: string;
      deposit?: number;
      monthlyRent?: number;
      contractStart?: string;
      contractEnd?: string;
      moveOutDate?: string;
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createWithNewContact(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      deposit?: number;
      monthlyRent?: number;
      contractStart?: string;
      contractEnd?: string;
      moveOutDate?: string;
      status?: string;
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
