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
import { PropertyPhotosService } from './property-photos.service';

@ApiTags('Property Photos')
@ApiBearerAuth()
@Controller('property-photos')
@UseGuards(JwtAuthGuard)
export class PropertyPhotosController {
  constructor(private readonly service: PropertyPhotosService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('propertyId') propertyId?: string,
    @Query('siteId') siteId?: string,
    @Query('siteName') siteName?: string,
    @Query('siteUnitTypeName') siteUnitTypeName?: string,
  ) {
    if (propertyId) {
      return this.service.listByProperty(user.officeId, propertyId);
    }
    return this.service.search(user.officeId, {
      siteId,
      siteName,
      siteUnitTypeName,
    });
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      propertyId: string;
      fileUrl: string;
      fileName: string;
      fileSize?: number;
      mimeType?: string;
      category?: string;
      memo?: string;
    },
  ) {
    return this.service.create(user.officeId, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { category?: string; sortOrder?: number; memo?: string },
  ) {
    return this.service.update(id, user.officeId, body);
  }

  @Post('reorder')
  reorder(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { propertyId: string; photoIds: string[] },
  ) {
    return this.service.reorder(user.officeId, body.propertyId, body.photoIds);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
