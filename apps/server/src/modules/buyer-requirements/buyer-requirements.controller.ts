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
import { BuyerRequirementsService } from './buyer-requirements.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('구매 희망조건')
@ApiBearerAuth()
@Controller('buyer-requirements')
@UseGuards(JwtAuthGuard)
export class BuyerRequirementsController {
  constructor(private readonly service: BuyerRequirementsService) {}

  @Get('due-contacts')
  findDueContacts(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findDueContacts(user.officeId);
  }

  @Get()
  findAll(
    @Query('status') status: string,
    @Query('urgency') urgency: string,
    @Query('transactionType') transactionType: string,
    @Query('contactId') contactId: string,
    @Query('assignedToId') assignedToId: string,
    @Query('nextContactBefore') nextContactBefore: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(user.officeId, {
      status: status || undefined,
      urgency: urgency || undefined,
      transactionType: transactionType || undefined,
      contactId: contactId || undefined,
      assignedToId: assignedToId || undefined,
      nextContactBefore: nextContactBefore || undefined,
      sortBy: (sortBy as 'createdAt' | 'nextContactDate' | 'urgency') || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
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
      contactId: string;
      transactionType?: string;
      siteTypes?: string[];
      regions?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      mustConditions?: string[];
      preferConditions?: string[];
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, user.officeId, dto as any);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: { status: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateStatus(id, user.officeId, dto.status);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
