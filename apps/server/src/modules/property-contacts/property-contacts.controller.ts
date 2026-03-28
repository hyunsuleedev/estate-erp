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
import { PropertyContactsService } from './property-contacts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('매물-연락처')
@ApiBearerAuth()
@Controller('property-contacts')
@UseGuards(JwtAuthGuard)
export class PropertyContactsController {
  constructor(private readonly service: PropertyContactsService) {}

  @Get()
  find(
    @Query('propertyId') propertyId: string,
    @Query('contactId') contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (propertyId) return this.service.findByProperty(user.officeId, propertyId);
    if (contactId) return this.service.findByContact(user.officeId, contactId);
    return [];
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
      propertyId: string;
      role: string;
      shareRatio?: number;
      isResident?: boolean;
      isPrimary?: boolean;
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
      role: string;
      name: string;
      phone?: string;
      shareRatio?: number;
      isResident?: boolean;
      isPrimary?: boolean;
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
      role?: string;
      shareRatio?: number;
      isResident?: boolean;
      isPrimary?: boolean;
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
