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
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('연락처')
@ApiBearerAuth()
@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  findAll(
    @Query('search') search: string,
    @Query('tags') tags: string,
    @Query('hasPropertyContact') hasPropertyContact: string,
    @Query('hasBuyerReq') hasBuyerReq: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.findAll(user.officeId, {
      search: search || undefined,
      tags: tags ? tags.split(',') : undefined,
      hasPropertyContact: hasPropertyContact === 'true' || undefined,
      hasBuyerReq: hasBuyerReq === 'true' || undefined,
      sortBy: (sortBy as 'name' | 'createdAt' | 'updatedAt') || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('phone-index')
  getPhoneIndex(@CurrentUser() user: CurrentUserPayload) {
    return this.contactsService.getPhoneIndex(user.officeId);
  }

  @Get('search-by-phone')
  findByPhone(
    @Query('phone') phone: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.findByPhone(user.officeId, phone);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.findOne(id, user.officeId);
  }

  @Get(':id/property-contacts')
  getPropertyContacts(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.getPropertyContacts(id, user.officeId);
  }

  @Get(':id/buyer-requirements')
  getBuyerRequirements(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.getBuyerRequirements(id, user.officeId);
  }

  @Get(':id/consultations')
  getConsultations(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.getConsultations(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      name: string;
      phone?: string;
      phone2?: string;
      email?: string;
      tags?: string[];
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      phone?: string;
      phone2?: string;
      email?: string;
      tags?: string[];
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.remove(id, user.officeId);
  }
}
