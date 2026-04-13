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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { PublicDocumentsService } from './public-documents.service';

@ApiTags('Public Documents')
@ApiBearerAuth()
@Controller('public-documents')
@UseGuards(JwtAuthGuard)
export class PublicDocumentsController {
  constructor(private readonly service: PublicDocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('propertyId') propertyId?: string,
    @Query('siteId') siteId?: string,
    @Query('type') type?: string,
  ) {
    if (propertyId) {
      return this.service.listByProperty(user.officeId, propertyId);
    }
    if (siteId) {
      return this.service.listBySite(user.officeId, siteId);
    }
    return this.service.listAll(user.officeId, { type });
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      propertyId?: string;
      siteId: string;
      type: string;
      title: string;
      subtitle?: string;
      cost?: number;
    },
  ) {
    return this.service.create(user.officeId, user.userId, body);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      status: string;
      fileUrl?: string;
      fileSize?: number;
      mimeType?: string;
      externalRefId?: string;
      errorMessage?: string;
    },
  ) {
    return this.service.updateStatus(id, user.officeId, body);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
