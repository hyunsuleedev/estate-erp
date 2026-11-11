import {
  BadRequestException,
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
import {
  CONTACT_CATEGORY_KEYS,
  type ContactCategoryKey,
} from '@estate-erp/shared';
import { ContactPhoneInput, ContactsService } from './contacts.service';
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
    @Query('category') category: string,
    @Query('hasPropertyContact') hasPropertyContact: string,
    @Query('hasBuyerReq') hasBuyerReq: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (
      category &&
      !CONTACT_CATEGORY_KEYS.includes(category as ContactCategoryKey)
    ) {
      throw new BadRequestException('알 수 없는 연락처 분류입니다.');
    }
    return this.contactsService.findAll(user.officeId, {
      search: search || undefined,
      tags: tags ? tags.split(',') : undefined,
      category: (category as ContactCategoryKey) || undefined,
      hasPropertyContact: hasPropertyContact === 'true' || undefined,
      hasBuyerReq: hasBuyerReq === 'true' || undefined,
      sortBy: (sortBy as 'name' | 'createdAt' | 'updatedAt') || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('categories')
  getCategorySummary(@CurrentUser() user: CurrentUserPayload) {
    return this.contactsService.getCategorySummary(user.officeId);
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
    if (!phone?.trim() || phone.trim().length < 4) return [];
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
      phones?: ContactPhoneInput[];
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
      phones?: ContactPhoneInput[];
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
