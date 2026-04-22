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
import { ServiceVendorsService } from './service-vendors.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import {
  CreateServiceVendorDto,
  CreateVendorContactDto,
  ServiceVendorFilter,
  UpdateServiceVendorDto,
  UpdateVendorContactDto,
  UpsertFavoriteDto,
} from './dto/service-vendor.dto';

@ApiTags('협력업체')
@ApiBearerAuth()
@Controller('service-vendors')
@UseGuards(JwtAuthGuard)
export class ServiceVendorsController {
  constructor(private readonly service: ServiceVendorsService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: Record<string, string>,
  ) {
    const filter: ServiceVendorFilter = {
      category: query.category,
      district: query.district,
      search: query.search,
      favoritesOnly: query.favoritesOnly === 'true',
      scope: (query.scope as ServiceVendorFilter['scope']) ?? 'all',
    };
    return this.service.findAll(user.officeId, filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body() dto: CreateServiceVendorDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.userId, user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceVendorDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, user.userId, user.officeId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.userId, user.officeId);
  }

  // ─── VendorContact ───────────────────────────────────

  @Post(':id/contacts')
  addContact(
    @Param('id') vendorId: string,
    @Body() dto: CreateVendorContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createContact(vendorId, user.userId, user.officeId, dto);
  }

  @Patch('contacts/:contactId')
  updateContact(
    @Param('contactId') contactId: string,
    @Body() dto: UpdateVendorContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateContact(
      contactId,
      user.userId,
      user.officeId,
      dto,
    );
  }

  @Delete('contacts/:contactId')
  removeContact(
    @Param('contactId') contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeContact(contactId, user.userId, user.officeId);
  }

  // ─── 즐겨찾기 ─────────────────────────────────────────

  @Post(':id/favorite')
  toggleFavorite(
    @Param('id') vendorId: string,
    @Body() dto: UpsertFavoriteDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.toggleFavorite(vendorId, user.officeId, dto);
  }

  @Patch(':id/favorite')
  updateFavoriteMemo(
    @Param('id') vendorId: string,
    @Body() dto: { memo: string | null },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateFavoriteMemo(
      vendorId,
      user.officeId,
      dto.memo ?? null,
    );
  }
}
